import { CAMPAIGN_STAGES, CampaignStage } from '../physics/campaign';
import { BerthCompletionReport, ScoreIncident } from '../physics/scoring';
import { MarinaPhysicsWorld } from '../physics/world';
import {
  ClassifierPrediction,
  ControllerMode,
  DECK_ACTION_CLASSES,
  HELM_CLASSES,
  MANEUVER_PHASES,
  ManeuverPhase,
  SkipperClassifier,
  THROTTLE_CLASSES,
  THRUSTER_CLASSES,
  trainSkipperMlpWeights,
  TrainingSample,
} from './skipperClassifier';

export interface TelemetryTraceEntry {
  timeSec: number;
  x: number;
  y: number;
  headingDeg: number;
  speedKnots: number;
  phase: ManeuverPhase;
  phaseConfidence: number;
  throttle: number;
  helm: number;
  bowThruster: number;
  waypointLabel: string;
  minClearanceM: number;
  repairCostUsd: number;
}

export interface SelfPlayStageResult {
  stageNumber: number;
  stageId: string;
  stageTitle: string;
  mode: ControllerMode;
  completed: boolean;
  gameOver: boolean;
  elapsedSec: number;
  finalScore: number;
  rank: BerthCompletionReport['rank'] | 'FAIL';
  repairCostUsd: number;
  bareHullScrapes: number;
  fenderKisses: number;
  finalDistanceToBerthM: number;
  finalHeadingErrorDeg: number;
  phaseCounts: Record<ManeuverPhase, number>;
  incidents: ScoreIncident[];
  telemetryTrace: TelemetryTraceEntry[];
  trainingSamples: TrainingSample[];
}

export interface SelfPlayRunOptions {
  /** Controller policy mode (`'hybrid-classifier'` default) */
  mode?: ControllerMode;
  /** Maximum simulated seconds before timeout (default 85s) */
  maxSimSeconds?: number;
  /** Classifier decision frequency in Hz (default 15 Hz -> every 4 physics substeps) */
  controlHz?: number;
  /** Optional custom classifier instance (e.g., with trained MLP weights) */
  classifier?: SkipperClassifier;
  /** Optional shared MarinaPhysicsWorld instance to reuse across runs */
  world?: MarinaPhysicsWorld;
  /** Optional wind speed perturbation delta in knots */
  windDeltaKnots?: number;
  /** Optional wind direction perturbation delta in degrees */
  windDirDeltaDeg?: number;
}

/**
 * Plays a single CampaignStage headlessly using the specified controller mode and returns
 * a complete scorecard, trajectory trace, and labeled demonstration samples.
 */
export async function runStageSelfPlay(
  stage: CampaignStage,
  options: SelfPlayRunOptions = {}
): Promise<SelfPlayStageResult> {
  const mode = options.mode ?? 'hybrid-classifier';
  const maxSimSeconds = options.maxSimSeconds ?? 85;
  const controlHz = options.controlHz ?? 10;
  const controlDt = 1 / controlHz;

  const world = options.world ?? (await MarinaPhysicsWorld.create());
  const classifier = options.classifier ?? new SkipperClassifier();

  world.rebuildWorld({
    vesselId: stage.vesselId,
    fenderRig: stage.recommendedRig,
    berthId: stage.berthId,
    startX: stage.startX,
    startY: stage.startY,
    startHeadingRad: stage.startHeadingRad,
    trueWindKnots: stage.trueWindKnots + (options.windDeltaKnots ?? 0),
    windFromDeg: stage.windFromDeg + (options.windDirDeltaDeg ?? 0),
    gustiness: stage.gustiness,
    enableTraffic: stage.enableTraffic,
  });

  const phaseCounts: Record<ManeuverPhase, number> = {
    FAIRWAY_TRANSIT: 0,
    TRAFFIC_HOLD_YIELD: 0,
    BOW_APPROACH_TURN: 0,
    STANDING_PIVOT_KICK: 0,
    STERN_IN_BACKING: 0,
    SLIP_GLIDE_CRAB: 0,
    BRAKE_AND_SETTLE: 0,
    MOOR_LOCK_READY: 0,
  };

  const incidents: ScoreIncident[] = [];
  world.onIncident = (inc) => {
    incidents.push(inc);
  };

  const telemetryTrace: TelemetryTraceEntry[] = [];
  const trainingSamples: TrainingSample[] = [];

  let simSec = 0;
  let nextTraceSec = 0;
  let lastPrediction: ClassifierPrediction | null = null;

  while (simSec < maxSimSeconds) {
    const snap = world.getSnapshot();
    if (snap.completionReport || snap.gameOver) {
      break;
    }

    const pred = classifier.predict(snap, world.marina, mode, controlDt);
    lastPrediction = pred;
    phaseCounts[pred.phase] += 1;

    // Apply fender rig recommendation
    if (pred.recommendedFenderRig !== snap.fenderRig) {
      world.setFenderRig(pred.recommendedFenderRig);
    }

    // Apply continuous controls
    world.setControls(pred.controls);

    // Apply idempotent deck commands
    if (pred.deckCommand === 'moor-complete' && snap.dockingChecklist.readyToMoor) {
      world.toggleSpringLine();
    } else if (pred.deckCommand === 'release-spring' && snap.activeSpringLine) {
      world.toggleSpringLine();
    } else if (pred.deckCommand === 'latch-spring' && !snap.activeSpringLine) {
      world.toggleSpringLine();
    }

    // Record Behavior Cloning training sample (every 0.2s)
    if (trainingSamples.length < 400 && Math.round(simSec * controlHz) % 3 === 0) {
      trainingSamples.push({
        features: [...pred.features.vector],
        phaseIdx: Math.max(0, MANEUVER_PHASES.indexOf(pred.phase)),
        throttleIdx: Math.max(0, THROTTLE_CLASSES.indexOf(pred.throttleClass)),
        helmIdx: Math.max(0, HELM_CLASSES.indexOf(pred.helmClass)),
        thrusterIdx: Math.max(0, THRUSTER_CLASSES.indexOf(pred.thrusterClass)),
        deckIdx: Math.max(0, DECK_ACTION_CLASSES.indexOf(pred.deckActionClass)),
      });
    }

    // Record 1 Hz diagnostic trace
    if (simSec >= nextTraceSec) {
      nextTraceSec += 1.0;
      telemetryTrace.push({
        timeSec: Number(simSec.toFixed(1)),
        x: Number(snap.playerX.toFixed(2)),
        y: Number(snap.playerY.toFixed(2)),
        headingDeg: Math.round((snap.playerHeadingRad * 180) / Math.PI),
        speedKnots: Number(snap.telemetry.speedKnots.toFixed(2)),
        phase: pred.phase,
        phaseConfidence: Number(pred.phaseConfidence.toFixed(2)),
        throttle: pred.controls.throttle,
        helm: pred.controls.helm,
        bowThruster: pred.controls.bowThruster,
        waypointLabel: pred.activeWaypoint.label,
        minClearanceM: Number(pred.features.clearances.minOverallM.toFixed(2)),
        repairCostUsd: snap.repairCostUsd,
      });
    }

    // Step world in <= 0.05s chunks so MarinaPhysicsWorld.stepFrame never clamps dt
    let remDt = controlDt;
    while (remDt > 1e-5) {
      const stepChunk = Math.min(0.05, remDt);
      world.stepFrame(stepChunk);
      remDt -= stepChunk;
      const midSnap = world.getSnapshot();
      if (midSnap.completionReport || midSnap.gameOver) {
        break;
      }
    }
    simSec += controlDt;
  }

  const finalSnap = world.getSnapshot();
  const report = finalSnap.completionReport;
  const berth = finalSnap.targetBerth ?? world.marina.berths['slip-a-bow'];
  const finalDistM = Math.hypot(finalSnap.playerX - berth.x, finalSnap.playerY - berth.y);

  if (lastPrediction) {
    telemetryTrace.push({
      timeSec: Number(finalSnap.elapsedSec.toFixed(1)),
      x: Number(finalSnap.playerX.toFixed(2)),
      y: Number(finalSnap.playerY.toFixed(2)),
      headingDeg: Math.round((finalSnap.playerHeadingRad * 180) / Math.PI),
      speedKnots: Number(finalSnap.telemetry.speedKnots.toFixed(2)),
      phase: lastPrediction.phase,
      phaseConfidence: Number(lastPrediction.phaseConfidence.toFixed(2)),
      throttle: finalSnap.controls.throttle,
      helm: finalSnap.controls.helm,
      bowThruster: finalSnap.controls.bowThruster,
      waypointLabel: lastPrediction.activeWaypoint.label,
      minClearanceM: Number(lastPrediction.features.clearances.minOverallM.toFixed(2)),
      repairCostUsd: finalSnap.repairCostUsd,
    });
  }

  return {
    stageNumber: stage.stageNumber,
    stageId: stage.id,
    stageTitle: stage.title,
    mode,
    completed: Boolean(report?.completed),
    gameOver: finalSnap.gameOver,
    elapsedSec: Number(finalSnap.elapsedSec.toFixed(2)),
    finalScore: report ? report.finalScore : finalSnap.liveScore,
    rank: report ? report.rank : 'FAIL',
    repairCostUsd: finalSnap.repairCostUsd,
    bareHullScrapes: finalSnap.bareHullScrapes,
    fenderKisses: report ? report.fenderKissesCount : 0,
    finalDistanceToBerthM: Number(finalDistM.toFixed(2)),
    finalHeadingErrorDeg: Number(finalSnap.dockingChecklist.headingErrorDeg.toFixed(1)),
    phaseCounts,
    incidents,
    telemetryTrace,
    trainingSamples,
  };
}

/**
 * Plays all 10 campaign stages headlessly and returns aggregate statistics + a formatted table.
 */
export async function runFullCampaignSelfPlay(
  options: SelfPlayRunOptions = {}
): Promise<{
  results: SelfPlayStageResult[];
  completedCount: number;
  averageScore: number;
  totalRepairCostUsd: number;
  summaryTable: string;
}> {
  const world = options.world ?? (await MarinaPhysicsWorld.create());
  const classifier = options.classifier ?? new SkipperClassifier();
  const results: SelfPlayStageResult[] = [];

  for (const stage of CAMPAIGN_STAGES) {
    const res = await runStageSelfPlay(stage, {
      ...options,
      world,
      classifier,
    });
    results.push(res);
  }

  const completedCount = results.filter((r) => r.completed).length;
  const averageScore = Math.round(
    results.reduce((acc, r) => acc + r.finalScore, 0) / Math.max(1, results.length)
  );
  const totalRepairCostUsd = results.reduce((acc, r) => acc + r.repairCostUsd, 0);

  const lines: string[] = [
    `Mode: ${options.mode ?? 'hybrid-classifier'} | Completed: ${completedCount}/${results.length} | Avg Score: ${averageScore} | Total Damage: $${totalRepairCostUsd}`,
    '----------------------------------------------------------------------------------------------------',
    'Stage                                  | Done | Rank | Score | Time (s) | Damage ($) | Scrapes | Err(m)',
    '----------------------------------------------------------------------------------------------------',
  ];

  for (const r of results) {
    const titlePad = r.stageTitle.padEnd(38, ' ').slice(0, 38);
    const doneStr = (r.completed ? 'YES' : 'NO').padEnd(4, ' ');
    const rankStr = String(r.rank).padEnd(4, ' ');
    const scoreStr = String(r.finalScore).padStart(5, ' ');
    const timeStr = r.elapsedSec.toFixed(1).padStart(8, ' ');
    const dmgStr = `$${r.repairCostUsd}`.padStart(10, ' ');
    const scrapeStr = String(r.bareHullScrapes).padStart(7, ' ');
    const errStr = r.finalDistanceToBerthM.toFixed(2).padStart(6, ' ');
    lines.push(
      `${titlePad} | ${doneStr} | ${rankStr} | ${scoreStr} | ${timeStr} | ${dmgStr} | ${scrapeStr} | ${errStr}`
    );
  }

  return {
    results,
    completedCount,
    averageScore,
    totalRepairCostUsd,
    summaryTable: lines.join('\n'),
  };
}

/**
 * Runs the complete Classifier Investigation & Ablation Study:
 * 1. Collects demonstration samples across the 10 stages and trains the Multi-Head MLP Classifier.
 * 2. Compares `naive-pd` vs `pure-mlp` vs `hybrid-classifier` across the campaign.
 */
export async function runClassifierAblationStudy(): Promise<{
  trainingStats: ReturnType<typeof trainSkipperMlpWeights>;
  naiveSummary: Awaited<ReturnType<typeof runFullCampaignSelfPlay>>;
  pureMlpSummary: Awaited<ReturnType<typeof runFullCampaignSelfPlay>>;
  hybridSummary: Awaited<ReturnType<typeof runFullCampaignSelfPlay>>;
}> {
  const world = await MarinaPhysicsWorld.create();
  const baseClassifier = new SkipperClassifier();

  // 1. Run Hybrid Teacher + Rollout to collect state-action demonstrations across all 10 stages
  const initialHybrid = await runFullCampaignSelfPlay({
    mode: 'hybrid-classifier',
    world,
    classifier: baseClassifier,
  });

  const allSamples: TrainingSample[] = [];
  for (const r of initialHybrid.results) {
    allSamples.push(...r.trainingSamples);
  }

  // 2. Train Multi-Head MLP Classifier via Behavior Cloning on the collected dataset
  const trainingStats = trainSkipperMlpWeights(allSamples, {
    hiddenDim: 24,
    epochs: 40,
    learningRate: 0.035,
  });

  const trainedClassifier = new SkipperClassifier(trainingStats.weights);

  // 3. Evaluate Naive PD and Pure MLP against the Trained Hybrid Classifier
  const naiveSummary = await runFullCampaignSelfPlay({
    mode: 'naive-pd',
    world,
    classifier: trainedClassifier,
  });

  const pureMlpSummary = await runFullCampaignSelfPlay({
    mode: 'pure-mlp',
    world,
    classifier: trainedClassifier,
  });

  return {
    trainingStats,
    naiveSummary,
    pureMlpSummary,
    hybridSummary: initialHybrid,
  };
}
