import { describe, expect, it } from 'vitest';
import { CAMPAIGN_STAGES } from '../src/physics/campaign';
import { MarinaPhysicsWorld } from '../src/physics/world';
import { extractSkipperFeatures, FEATURE_VECTOR_DIM } from '../src/ai/featureExtractor';
import {
  MANEUVER_PHASES,
  SkipperClassifier,
  THROTTLE_CLASSES,
  HELM_CLASSES,
  THRUSTER_CLASSES,
} from '../src/ai/skipperClassifier';
import {
  runClassifierAblationStudy,
  runStageSelfPlay,
} from '../src/ai/testHarness';

describe('Autonomous Self-Play Test Harness & Skipper Classifier', () => {
  it('extracts normalized 20-D feature vectors and valid Stage 1 / Stage 2 probability distributions', async () => {
    const world = await MarinaPhysicsWorld.create();
    const classifier = new SkipperClassifier();

    for (const stage of CAMPAIGN_STAGES) {
      world.rebuildWorld({
        vesselId: stage.vesselId,
        fenderRig: stage.recommendedRig,
        berthId: stage.berthId,
        startX: stage.startX,
        startY: stage.startY,
        startHeadingRad: stage.startHeadingRad,
        trueWindKnots: stage.trueWindKnots,
        windFromDeg: stage.windFromDeg,
        gustiness: stage.gustiness,
        enableTraffic: stage.enableTraffic,
      });

      const snap = world.getSnapshot();
      const features = extractSkipperFeatures(snap, world.marina);
      expect(features.vector).toHaveLength(FEATURE_VECTOR_DIM);
      for (const val of features.vector) {
        expect(Number.isFinite(val)).toBe(true);
        expect(val).toBeGreaterThanOrEqual(-1.001);
        expect(val).toBeLessThanOrEqual(1.001);
      }

      const pred = classifier.predict(snap, world.marina, 'hybrid-classifier');
      expect(MANEUVER_PHASES).toContain(pred.phase);
      expect(THROTTLE_CLASSES).toContain(pred.throttleClass);
      expect(HELM_CLASSES).toContain(pred.helmClass);
      expect(THRUSTER_CLASSES).toContain(pred.thrusterClass);

      const phaseProbSum = Object.values(pred.phaseProbabilities).reduce((a, b) => a + b, 0);
      expect(phaseProbSum).toBeCloseTo(1.0, 2);
    }
  });

  it('classifies canonical seamanship states accurately (ReadyToMoor, Traffic Yield, Standing Pivot, Stern Backing)', async () => {
    const world = await MarinaPhysicsWorld.create();
    const classifier = new SkipperClassifier();

    // 1. ReadyToMoor inside Slip A
    world.rebuildWorld({
      vesselId: 'outboard7m',
      fenderRig: 'midships',
      berthId: 'slip-a-bow',
      startX: -7.25,
      startY: -12.0,
      startHeadingRad: -Math.PI / 2,
      trueWindKnots: 0,
      windFromDeg: 0,
      gustiness: 0,
      enableTraffic: false,
    });
    const readyPred = classifier.predict(world.getSnapshot(), world.marina, 'hybrid-classifier');
    expect(readyPred.phase).toBe('MOOR_LOCK_READY');
    expect(readyPred.deckCommand).toBe('moor-complete');
    expect(readyPred.controls.throttle).toBe(0);

    // 2. Stage 6 Standing Pivot (180-deg reverse course error in fairway)
    const stage6 = CAMPAIGN_STAGES[5];
    world.rebuildWorld({
      vesselId: stage6.vesselId,
      fenderRig: stage6.recommendedRig,
      berthId: stage6.berthId,
      startX: stage6.startX,
      startY: stage6.startY,
      startHeadingRad: stage6.startHeadingRad,
      trueWindKnots: stage6.trueWindKnots,
      windFromDeg: stage6.windFromDeg,
      gustiness: stage6.gustiness,
      enableTraffic: stage6.enableTraffic,
    });
    const pivotPred = classifier.predict(world.getSnapshot(), world.marina, 'hybrid-classifier');
    expect(pivotPred.phase).toBe('STANDING_PIVOT_KICK');

    // 3. Stage 7 Mediterranean Stern-In Backing
    const stage7 = CAMPAIGN_STAGES[6];
    world.rebuildWorld({
      vesselId: stage7.vesselId,
      fenderRig: stage7.recommendedRig,
      berthId: stage7.berthId,
      startX: -5.4,
      startY: 2.0,
      startHeadingRad: -Math.PI / 2,
      trueWindKnots: stage7.trueWindKnots,
      windFromDeg: stage7.windFromDeg,
      gustiness: stage7.gustiness,
      enableTraffic: stage7.enableTraffic,
    });
    const medPred = classifier.predict(world.getSnapshot(), world.marina, 'hybrid-classifier');
    expect(medPred.phase).toBe('STERN_IN_BACKING');
    expect(medPred.features.corridor.isSternFirstBacking).toBe(true);
  });

  it('plays all 10 campaign stages via the headless self-play harness and runs the classifier ablation study', async () => {
    const ablation = await runClassifierAblationStudy();
    console.info(
      [
        '',
        '=== CLASSIFIER ABLATION STUDY (10 CAMPAIGN STAGES) ===',
        `MLP Behavior Cloning: loss ${ablation.trainingStats.initialLoss.toFixed(3)} -> ${ablation.trainingStats.finalLoss.toFixed(3)} | Phase Acc: ${(ablation.trainingStats.phaseAccuracy * 100).toFixed(1)}% | Throttle Acc: ${(ablation.trainingStats.throttleAccuracy * 100).toFixed(1)}% | Helm Acc: ${(ablation.trainingStats.helmAccuracy * 100).toFixed(1)}%`,
        `Naive PD Baseline:   ${ablation.naiveSummary.completedCount}/10 stages | Avg Score: ${ablation.naiveSummary.averageScore} | Total Damage: $${ablation.naiveSummary.totalRepairCostUsd}`,
        `Pure MLP Classifier: ${ablation.pureMlpSummary.completedCount}/10 stages | Avg Score: ${ablation.pureMlpSummary.averageScore} | Total Damage: $${ablation.pureMlpSummary.totalRepairCostUsd}`,
        `Hybrid + Rollout:    ${ablation.hybridSummary.completedCount}/10 stages | Avg Score: ${ablation.hybridSummary.averageScore} | Total Damage: $${ablation.hybridSummary.totalRepairCostUsd}`,
        '',
        ablation.hybridSummary.summaryTable,
        '',
      ].join('\n')
    );

    // Verify MLP Behavior Cloning training reduced cross-entropy loss and learned accurate heads
    expect(ablation.trainingStats.finalLoss).toBeLessThan(ablation.trainingStats.initialLoss);
    expect(ablation.trainingStats.phaseAccuracy).toBeGreaterThan(0.75);

    // Verify Hybrid Classifier + Rollout outperforms the Naive PD controller
    expect(ablation.hybridSummary.completedCount).toBeGreaterThanOrEqual(
      ablation.naiveSummary.completedCount
    );

    // Verify all 10 campaign stages complete without Game Over ($10,000 damage limit)
    const failedStages = ablation.hybridSummary.results.filter((r) => !r.completed || r.gameOver);
    expect(
      failedStages.map((r) => ({
        stage: r.stageTitle,
        completed: r.completed,
        gameOver: r.gameOver,
        damage: r.repairCostUsd,
        tail: r.telemetryTrace.slice(-4),
      })),
      `\n${ablation.hybridSummary.summaryTable}\n`
    ).toEqual([]);
  }, 30_000);

  it('generalizes under wind speed and wind direction perturbations on Stage 1 and Stage 3', async () => {
    const world = await MarinaPhysicsWorld.create();
    const res1 = await runStageSelfPlay(CAMPAIGN_STAGES[0], {
      world,
      windDeltaKnots: 4,
      windDirDeltaDeg: 25,
    });
    expect(res1.completed).toBe(true);
    expect(res1.gameOver).toBe(false);

    const res3 = await runStageSelfPlay(CAMPAIGN_STAGES[2], {
      world,
      windDeltaKnots: 3,
      windDirDeltaDeg: -15,
    });
    expect(res3.completed).toBe(true);
    expect(res3.gameOver).toBe(false);
  });
});
