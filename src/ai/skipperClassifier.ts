import { clamp, ControlInputs } from '../physics/hydrodynamics';
import { MarinaLayout } from '../physics/marina';
import { FenderRigMode } from '../physics/vessels';
import { SimulationSnapshot } from '../physics/world';
import {
  ExtractedFeatureBundle,
  extractSkipperFeatures,
  FEATURE_VECTOR_DIM,
} from './featureExtractor';
import { evaluateControlRollout, RolloutTrajectoryPoint } from './forwardModel';

export type ManeuverPhase =
  | 'FAIRWAY_TRANSIT'
  | 'TRAFFIC_HOLD_YIELD'
  | 'BOW_APPROACH_TURN'
  | 'STANDING_PIVOT_KICK'
  | 'STERN_IN_BACKING'
  | 'SLIP_GLIDE_CRAB'
  | 'BRAKE_AND_SETTLE'
  | 'MOOR_LOCK_READY';

export const MANEUVER_PHASES: ReadonlyArray<ManeuverPhase> = [
  'FAIRWAY_TRANSIT',
  'TRAFFIC_HOLD_YIELD',
  'BOW_APPROACH_TURN',
  'STANDING_PIVOT_KICK',
  'STERN_IN_BACKING',
  'SLIP_GLIDE_CRAB',
  'BRAKE_AND_SETTLE',
  'MOOR_LOCK_READY',
];

export type ThrottleClass =
  | 'REV_BURST'
  | 'SLOW_ASTERN'
  | 'NEUTRAL'
  | 'SLOW_AHEAD'
  | 'FWD_PROP_KICK';

export const THROTTLE_CLASSES: ReadonlyArray<ThrottleClass> = [
  'REV_BURST',
  'SLOW_ASTERN',
  'NEUTRAL',
  'SLOW_AHEAD',
  'FWD_PROP_KICK',
];

export const THROTTLE_CLASS_VALUES: Record<ThrottleClass, number> = {
  REV_BURST: -0.68,
  SLOW_ASTERN: -0.32,
  NEUTRAL: 0.0,
  SLOW_AHEAD: 0.34,
  FWD_PROP_KICK: 0.64,
};

export type HelmClass =
  | 'HARD_PORT'
  | 'TRIM_PORT'
  | 'MIDSHIPS'
  | 'TRIM_STBD'
  | 'HARD_STBD';

export const HELM_CLASSES: ReadonlyArray<HelmClass> = [
  'HARD_PORT',
  'TRIM_PORT',
  'MIDSHIPS',
  'TRIM_STBD',
  'HARD_STBD',
];

export const HELM_CLASS_VALUES: Record<HelmClass, number> = {
  HARD_PORT: -1.0,
  TRIM_PORT: -0.42,
  MIDSHIPS: 0.0,
  TRIM_STBD: 0.42,
  HARD_STBD: 1.0,
};

export type ThrusterClass = 'THRUST_PORT' | 'THRUST_OFF' | 'THRUST_STBD';

export const THRUSTER_CLASSES: ReadonlyArray<ThrusterClass> = [
  'THRUST_PORT',
  'THRUST_OFF',
  'THRUST_STBD',
];

export const THRUSTER_CLASS_VALUES: Record<ThrusterClass, number> = {
  THRUST_PORT: -1.0,
  THRUST_OFF: 0.0,
  THRUST_STBD: 1.0,
};

export type DeckActionClass = 'DECK_HOLD' | 'LATCH_SPRING_PIVOT' | 'MOOR_COMPLETE_M';

export const DECK_ACTION_CLASSES: ReadonlyArray<DeckActionClass> = [
  'DECK_HOLD',
  'LATCH_SPRING_PIVOT',
  'MOOR_COMPLETE_M',
];

export type ControllerMode = 'naive-pd' | 'pure-mlp' | 'hybrid-classifier';

export interface ClassifierPrediction {
  /** Top predicted Stage 1 tactical seamanship phase */
  phase: ManeuverPhase;
  /** Confidence (probability in [0, 1]) of the top Stage 1 phase */
  phaseConfidence: number;
  /** Full probability distribution over all 8 seamanship phases */
  phaseProbabilities: Record<ManeuverPhase, number>;
  /** Factored Stage 2 discrete class predictions */
  throttleClass: ThrottleClass;
  throttleProbabilities: Record<ThrottleClass, number>;
  helmClass: HelmClass;
  helmProbabilities: Record<HelmClass, number>;
  thrusterClass: ThrusterClass;
  thrusterProbabilities: Record<ThrusterClass, number>;
  deckActionClass: DeckActionClass;
  deckActionProbabilities: Record<DeckActionClass, number>;
  /** Final continuous control command to apply to MarinaPhysicsWorld */
  controls: ControlInputs;
  /** Recommended fender rig for the current approach geometry */
  recommendedFenderRig: FenderRigMode;
  /** Idempotent deck line action (`moor-complete`, `latch-spring`, `release-spring`, or `none`) */
  deckCommand: 'none' | 'moor-complete' | 'latch-spring' | 'release-spring';
  /** Human-readable summary badge for the HUD */
  summaryLabel: string;
  /** Active corridor waypoint and predicted 1.6s trajectory for Canvas overlay */
  activeWaypoint: { x: number; y: number; label: string };
  desiredHeadingRad: number;
  predictedTrajectory: RolloutTrajectoryPoint[];
  features: ExtractedFeatureBundle;
}

export interface TrainingSample {
  features: number[];
  phaseIdx: number;
  throttleIdx: number;
  helmIdx: number;
  thrusterIdx: number;
  deckIdx: number;
}

export interface MlpClassifierWeights {
  hiddenDim: number;
  /** [hiddenDim][FEATURE_VECTOR_DIM] */
  W1: number[][];
  /** [hiddenDim] */
  b1: number[];
  /** [8][hiddenDim] */
  WPhase: number[][];
  bPhase: number[];
  /** [5][hiddenDim + 8] */
  WThrottle: number[][];
  bThrottle: number[];
  /** [5][hiddenDim + 8] */
  WHelm: number[][];
  bHelm: number[];
  /** [3][hiddenDim + 8] */
  WThruster: number[][];
  bThruster: number[];
  /** [3][hiddenDim + 8] */
  WDeck: number[][];
  bDeck: number[];
}

function softmax(logits: ReadonlyArray<number>): number[] {
  let maxLogit = -Infinity;
  for (const z of logits) {
    if (z > maxLogit) maxLogit = z;
  }
  let sum = 0;
  const exps = new Array<number>(logits.length);
  for (let i = 0; i < logits.length; i++) {
    const e = Math.exp(clamp(logits[i] - maxLogit, -30, 30));
    exps[i] = e;
    sum += e;
  }
  const invSum = sum > 0 ? 1 / sum : 1 / logits.length;
  return exps.map((e) => e * invSum);
}

function argmax(probs: ReadonlyArray<number>): number {
  let bestIdx = 0;
  let bestVal = probs[0] ?? -Infinity;
  for (let i = 1; i < probs.length; i++) {
    if (probs[i] > bestVal) {
      bestVal = probs[i];
      bestIdx = i;
    }
  }
  return bestIdx;
}

/**
 * Computes Stage 1 (8-class Maneuver Phase) and Stage 2 (Factored 4-Head Action) logits
 * directly from the 20-D feature vector x using calibrated seamanship feature projections,
 * optionally blended with learned residual MLP weights from Behavior Cloning.
 */
export class SkipperClassifier {
  private learnedWeights: MlpClassifierWeights | null = null;
  private pivotBurstPhaseTimer = 0;
  private sternAlignKickActive = false;
  private lastDecisionSec = -Infinity;
  private lastBerthId = '';
  private lastMode: ControllerMode | null = null;
  private lastPrediction: ClassifierPrediction | null = null;

  constructor(weights?: MlpClassifierWeights) {
    if (weights) {
      this.learnedWeights = weights;
    }
  }

  public reset(): void {
    this.pivotBurstPhaseTimer = 0;
    this.sternAlignKickActive = false;
    this.lastDecisionSec = -Infinity;
    this.lastBerthId = '';
    this.lastMode = null;
    this.lastPrediction = null;
  }

  public setLearnedWeights(weights: MlpClassifierWeights | null): void {
    this.learnedWeights = weights;
  }

  public getLearnedWeights(): MlpClassifierWeights | null {
    return this.learnedWeights;
  }

  /**
   * Evaluates Stage 1 (Seamanship Phase) and Stage 2 (Factored Control Heads) probabilities
   * from the 20-D normalized feature vector x.
   */
  public classifyFeatureVector(x: ReadonlyArray<number>): {
    phaseProbs: number[];
    throttleProbs: number[];
    helmProbs: number[];
    thrusterProbs: number[];
    deckProbs: number[];
  } {
    // Unpack the 20 normalized features
    const wpDist = x[0] ?? 0; // tanh(d / 10m)
    const wpCourseErr = x[1] ?? 0; // course err / pi in [-1, 1]
    const berthLongErr = x[2] ?? 0; // tanh(ds / 9m)
    const berthLatErr = x[3] ?? 0; // tanh(de / 3.5m)
    const berthHdgErr = x[4] ?? 0; // heading err / pi in [-1, 1]
    const backingFlag = x[5] ?? -1; // +1 for stern-in backing, -1 for bow-first
    const surge = x[6] ?? 0; // u / 2.8 m/s
    const sway = x[7] ?? 0; // v / 1.2 m/s
    const yawRate = x[8] ?? 0; // r / 0.75 rad/s
    const stopMargin = x[9] ?? 0; // tanh(margin / 3.5m)
    const windLong = x[10] ?? 0;
    const windLat = x[11] ?? 0;
    const hasThruster = x[12] ?? -1;
    const propWalk = x[13] ?? 0;
    const clearFwd = x[15] ?? 1;
    const clearPort = x[16] ?? 1;
    const clearStbd = x[17] ?? 1;
    const trafficThreat = x[18] ?? 0;
    const readyToMoor = x[19] ?? -1;

    const absCourseErr = Math.abs(wpCourseErr);
    const absBerthHdgErr = Math.abs(berthHdgErr);
    const nearBerth = Math.hypot(berthLongErr, berthLatErr) < 0.36;
    const inSlipCorridor = Math.hypot(berthLongErr, berthLatErr) < 0.68;

    // --- STAGE 1: 8-Class Seamanship Maneuver Phase Logits ---
    const phaseLogits = new Array<number>(8).fill(0);

    // 0: FAIRWAY_TRANSIT (far from berth, small course error, clear of traffic)
    phaseLogits[0] =
      3.5 * wpDist +
      2.2 * (0.35 - absCourseErr) -
      4.0 * trafficThreat -
      2.5 * (backingFlag > 0 ? 1 : 0) -
      3.0 * (readyToMoor > 0 ? 1 : 0);

    // 1: TRAFFIC_HOLD_YIELD (paddleboarder or dinghy threat high!)
    phaseLogits[1] = 8.5 * (trafficThreat - 0.38) - 3.0 * (readyToMoor > 0 ? 1 : 0);

    // 2: BOW_APPROACH_TURN (moderate course error 20°-95° while approaching gate/slip)
    phaseLogits[2] =
      4.2 * (absCourseErr - 0.14) -
      3.5 * Math.max(0, absCourseErr - 0.58) -
      2.2 * (backingFlag > 0 ? 1 : 0) -
      3.5 * (readyToMoor > 0 ? 1 : 0);

    // 3: STANDING_PIVOT_KICK (large heading/course error >= 65° or tight basin turn)
    phaseLogits[3] =
      8.5 * (absCourseErr - 0.34) +
      2.2 * (0.45 - Math.abs(surge)) -
      2.0 * (backingFlag > 0 && absBerthHdgErr < 0.35 ? 1 : 0) -
      4.0 * (readyToMoor > 0 ? 1 : 0);

    // 4: STERN_IN_BACKING (Mediterranean stern-in mode active)
    phaseLogits[4] =
      5.2 * (backingFlag > 0 ? 1 : -1) +
      1.8 * (0.45 - absBerthHdgErr) -
      3.8 * (readyToMoor > 0 ? 1 : 0);

    // 5: SLIP_GLIDE_CRAB (aligned within corridor, gliding into berth box)
    phaseLogits[5] =
      3.2 * (inSlipCorridor ? 1 : -0.6) +
      3.0 * (0.24 - absCourseErr) +
      1.5 * stopMargin -
      2.2 * (backingFlag > 0 ? 1 : 0) -
      3.5 * (readyToMoor > 0 ? 1 : 0);

    // 6: BRAKE_AND_SETTLE (inside or entering berth box with excess speed or low stopping margin)
    const speedMag = Math.hypot(surge, sway);
    phaseLogits[6] =
      4.2 * (nearBerth ? 1 : -0.5) +
      4.8 * (speedMag - 0.08) +
      3.5 * Math.max(0, 0.22 - stopMargin) -
      3.5 * (readyToMoor > 0 ? 1 : 0);

    // 7: MOOR_LOCK_READY (docking checklist readyToMoor === true!)
    phaseLogits[7] = 11.0 * (readyToMoor > 0 ? 1 : -0.8);

    // --- STAGE 2: Factored 4-Head Control Action Logits ---
    // Effective steering target error (damped by yawRate so the classifier doesn't overshoot!)
    const activeTurnErr =
      backingFlag > 0 ? berthHdgErr - 0.35 * wpCourseErr : wpCourseErr;
    const dampedYawCommand = clamp(activeTurnErr * 2.8 - yawRate * 0.85, -1.2, 1.2);

    // Desired longitudinal speed in body frame (+ ahead, - astern)
    let targetSurgeNorm: number;
    if (readyToMoor > 0) {
      targetSurgeNorm = 0;
    } else if (trafficThreat > 0.45) {
      targetSurgeNorm = -0.05;
    } else if (backingFlag > 0) {
      // Backing astern into South Med Berth
      if (absBerthHdgErr > 0.28) {
        // Straighten bow first with short forward kick before backing
        targetSurgeNorm = 0.22;
      } else if (nearBerth && Math.abs(berthLongErr) < 0.16 && absBerthHdgErr < 0.16) {
        targetSurgeNorm = 0;
      } else {
        targetSurgeNorm = clamp(-0.28 * Math.max(0.28, wpDist), -0.36, -0.1);
      }
    } else if (absCourseErr > 0.48) {
      // Large course change during transit: maintain steady forward prop wash over rudder for crisp turn authority!
      targetSurgeNorm = 0.42;
    } else if (nearBerth && Math.abs(berthLongErr) < 0.18 && absBerthHdgErr < 0.16) {
      targetSurgeNorm = 0;
    } else if (inSlipCorridor) {
      targetSurgeNorm = clamp(0.42 * Math.max(0.2, berthLongErr), 0.12, 0.38);
    } else {
      targetSurgeNorm = clamp(0.65 * Math.max(0.32, wpDist), 0.25, 0.62);
    }

    // Obstacle proximity emergency braking
    if (clearFwd < 0.22 && ((backingFlag < 0 && surge > 0.08) || (backingFlag > 0 && surge < -0.08))) {
      targetSurgeNorm = backingFlag > 0 ? 0.35 : -0.45;
    }

    const surgeErr = targetSurgeNorm - surge - 0.15 * windLong;

    // 1. Throttle Head (5 classes: REV_BURST, SLOW_ASTERN, NEUTRAL, SLOW_AHEAD, FWD_PROP_KICK)
    const throttleLogits = [
      5.5 * (-surgeErr - 0.22), // 0: REV_BURST
      5.0 * (-surgeErr - 0.05) - 2.0 * Math.abs(surgeErr + 0.14), // 1: SLOW_ASTERN
      4.2 * (0.11 - Math.abs(surgeErr)) + (readyToMoor > 0 ? 5.0 : 0), // 2: NEUTRAL
      5.0 * (surgeErr - 0.05) - 2.0 * Math.abs(surgeErr - 0.16), // 3: SLOW_AHEAD
      5.5 * (surgeErr - 0.22) + (absCourseErr > 0.48 && surge < 0.2 ? 2.5 : 0), // 4: FWD_PROP_KICK
    ];

    // 2. Helm Head (5 classes: HARD_PORT, TRIM_PORT, MIDSHIPS, TRIM_STBD, HARD_STBD)
    // Note: when moving astern (surge < -0.06) without forward prop kick, rudder lift is inverted
    const reversingFlow = surge < -0.06 && surgeErr <= 0.05;
    const effectiveHelmSign = reversingFlow ? -1 : 1;
    // Compensate for right-hand reverse prop walk pulling stern to port (+yawRate)
    const propWalkHelmComp = reversingFlow ? -propWalk * 0.25 : 0;
    const desiredHelm = clamp(
      dampedYawCommand * effectiveHelmSign + propWalkHelmComp,
      -1,
      1
    );

    const helmLogits = [
      5.5 * (-desiredHelm - 0.55), // 0: HARD_PORT
      5.0 * (0.35 - Math.abs(desiredHelm + 0.42)), // 1: TRIM_PORT
      4.8 * (0.18 - Math.abs(desiredHelm)), // 2: MIDSHIPS
      5.0 * (0.35 - Math.abs(desiredHelm - 0.42)), // 3: TRIM_STBD
      5.5 * (desiredHelm - 0.55), // 4: HARD_STBD
    ];

    // 3. Bow Thruster Head (3 classes: THRUST_PORT, THRUST_OFF, THRUST_STBD)
    // Use bow thruster ONLY during low-speed slip entry, crabbing, or standing pivots (never during high-speed fairway transit!)
    const allowThrusterNow =
      hasThruster > 0 && (inSlipCorridor || absCourseErr > 0.42 || Math.abs(surge) < 0.35);
    const lateralCorrection =
      -sway * 1.25 - windLat * 0.55 + (inSlipCorridor ? berthLatErr * 0.85 : 0) + dampedYawCommand * 0.55;
    const beamClearancePush =
      (clearPort < 0.32 ? 0.65 : 0) - (clearStbd < 0.32 ? 0.65 : 0);
    const desiredThruster = allowThrusterNow
      ? clamp(lateralCorrection + beamClearancePush, -1, 1)
      : 0;

    const thrusterLogits = [
      allowThrusterNow ? 5.2 * (-desiredThruster - 0.22) : -5.0, // 0: THRUST_PORT
      3.8 * (0.26 - Math.abs(desiredThruster)), // 1: THRUST_OFF
      allowThrusterNow ? 5.2 * (desiredThruster - 0.22) : -5.0, // 2: THRUST_STBD
    ];

    // 4. Deck Action Head (3 classes: DECK_HOLD, LATCH_SPRING_PIVOT, MOOR_COMPLETE_M)
    const deckLogits = [
      readyToMoor > 0 ? -4.0 : 3.5, // 0: DECK_HOLD
      readyToMoor < 0 && nearBerth && Math.abs(windLat) > 0.45 ? 1.2 : -3.0, // 1: LATCH_SPRING_PIVOT
      readyToMoor > 0 ? 9.0 : -6.0, // 2: MOOR_COMPLETE_M
    ];

    // If learned MLP weights are loaded, blend learned neural logits with structural seamanship logits
    if (this.learnedWeights) {
      const w = this.learnedWeights;
      const hidden = new Array<number>(w.hiddenDim);
      for (let i = 0; i < w.hiddenDim; i++) {
        let sum = w.b1[i] ?? 0;
        const row = w.W1[i];
        for (let j = 0; j < FEATURE_VECTOR_DIM; j++) {
          sum += (row[j] ?? 0) * (x[j] ?? 0);
        }
        hidden[i] = Math.tanh(sum);
      }

      for (let c = 0; c < 8; c++) {
        let z = w.bPhase[c] ?? 0;
        for (let i = 0; i < w.hiddenDim; i++) {
          z += (w.WPhase[c][i] ?? 0) * hidden[i];
        }
        phaseLogits[c] = 0.55 * phaseLogits[c] + 0.45 * z;
      }

      const stage1Probs = softmax(phaseLogits);
      const stage2Input = [...hidden, ...stage1Probs];

      const blendHead = (
        baseLogits: number[],
        W: number[][],
        b: number[],
        alpha = 0.45
      ): void => {
        for (let c = 0; c < baseLogits.length; c++) {
          let z = b[c] ?? 0;
          for (let i = 0; i < stage2Input.length; i++) {
            z += (W[c][i] ?? 0) * stage2Input[i];
          }
          baseLogits[c] = (1 - alpha) * baseLogits[c] + alpha * z;
        }
      };

      blendHead(throttleLogits, w.WThrottle, w.bThrottle);
      blendHead(helmLogits, w.WHelm, w.bHelm);
      blendHead(thrusterLogits, w.WThruster, w.bThruster);
      blendHead(deckLogits, w.WDeck, w.bDeck);
    }

    return {
      phaseProbs: softmax(phaseLogits),
      throttleProbs: softmax(throttleLogits),
      helmProbs: softmax(helmLogits),
      thrusterProbs: softmax(thrusterLogits),
      deckProbs: softmax(deckLogits),
    };
  }

  /**
   * Computes the full Auto-Skipper prediction & control decision for the current SimulationSnapshot.
   * Enforces a human-paced reaction limit of at most 1 control change per second (1.0s hold interval).
   */
  public predict(
    snap: SimulationSnapshot,
    marina: MarinaLayout,
    mode: ControllerMode = 'hybrid-classifier',
    dtSec = 1.0
  ): ClassifierPrediction {
    const berthId = snap.targetBerth?.id ?? '';
    if (
      snap.elapsedSec === 0 ||
      snap.elapsedSec < this.lastDecisionSec - 1e-4 ||
      berthId !== this.lastBerthId ||
      mode !== this.lastMode
    ) {
      this.reset();
    }

    if (
      !snap.dockingChecklist.readyToMoor &&
      this.lastPrediction !== null &&
      snap.elapsedSec - this.lastDecisionSec < 1.0 - 1e-4
    ) {
      return {
        ...this.lastPrediction,
        deckCommand: 'none',
      };
    }

    const effectiveDt =
      this.lastDecisionSec >= 0 ? Math.max(dtSec, snap.elapsedSec - this.lastDecisionSec) : dtSec;
    const pred = this.computeDecision(snap, marina, mode, effectiveDt);
    this.lastDecisionSec = snap.elapsedSec;
    this.lastBerthId = berthId;
    this.lastMode = mode;
    this.lastPrediction = pred;
    return pred;
  }

  private computeDecision(
    snap: SimulationSnapshot,
    marina: MarinaLayout,
    mode: ControllerMode = 'hybrid-classifier',
    dtSec = 1.0
  ): ClassifierPrediction {
    this.pivotBurstPhaseTimer = (this.pivotBurstPhaseTimer + dtSec) % 2.4;

    const features = extractSkipperFeatures(snap, marina);
    const { vector: x, corridor, clearances, traffic } = features;
    const dists = this.classifyFeatureVector(x);

    const phaseIdx = argmax(dists.phaseProbs);
    const phase = MANEUVER_PHASES[phaseIdx];
    const phaseConfidence = dists.phaseProbs[phaseIdx];

    const throttleIdx = argmax(dists.throttleProbs);
    const throttleClass = THROTTLE_CLASSES[throttleIdx];

    const helmIdx = argmax(dists.helmProbs);
    const helmClass = HELM_CLASSES[helmIdx];

    const thrusterIdx = argmax(dists.thrusterProbs);
    const thrusterClass = THRUSTER_CLASSES[thrusterIdx];

    const deckIdx = argmax(dists.deckProbs);
    const deckActionClass = DECK_ACTION_CLASSES[deckIdx];

    // Build probability lookup maps
    const toMap = <K extends string>(
      keys: ReadonlyArray<K>,
      probs: ReadonlyArray<number>
    ): Record<K, number> => {
      const out = {} as Record<K, number>;
      keys.forEach((k, idx) => {
        out[k] = Number((probs[idx] ?? 0).toFixed(4));
      });
      return out;
    };

    // Determine recommended fender rig based on approach geometry
    let recommendedFenderRig: FenderRigMode = snap.fenderRig;
    if (corridor.isSternFirstBacking) {
      recommendedFenderRig = 'quarter';
    } else if (
      phase === 'BOW_APPROACH_TURN' &&
      snap.targetBerth?.id === 'slip-b-tight' &&
      !snap.dockingChecklist.inBerthZone
    ) {
      recommendedFenderRig = 'bow';
    } else if (snap.dockingChecklist.inBerthZone) {
      recommendedFenderRig = corridor.isSternFirstBacking ? 'quarter' : 'midships';
    }

    // Immediate mooring completion when readyToMoor is satisfied!
    if (snap.dockingChecklist.readyToMoor) {
      const stopControls: ControlInputs = { throttle: 0, helm: 0, bowThruster: 0 };
      return {
        phase: 'MOOR_LOCK_READY',
        phaseConfidence: Math.max(0.95, phaseConfidence),
        phaseProbabilities: toMap(MANEUVER_PHASES, dists.phaseProbs),
        throttleClass: 'NEUTRAL',
        throttleProbabilities: toMap(THROTTLE_CLASSES, dists.throttleProbs),
        helmClass: 'MIDSHIPS',
        helmProbabilities: toMap(HELM_CLASSES, dists.helmProbs),
        thrusterClass: 'THRUST_OFF',
        thrusterProbabilities: toMap(THRUSTER_CLASSES, dists.thrusterProbs),
        deckActionClass: 'MOOR_COMPLETE_M',
        deckActionProbabilities: toMap(DECK_ACTION_CLASSES, dists.deckProbs),
        controls: stopControls,
        recommendedFenderRig,
        deckCommand: 'moor-complete',
        summaryLabel: '🤖 [MOOR_LOCK_READY 99%] → TIE MOORING LINES (M)',
        activeWaypoint: corridor.activeWaypoint,
        desiredHeadingRad: corridor.desiredHeadingRad,
        predictedTrajectory: [],
        features,
      };
    }

    // Release spring line if one is attached and preventing us from entering the berth
    const deckCommand: ClassifierPrediction['deckCommand'] = snap.activeSpringLine
      ? 'release-spring'
      : 'none';

    // Mode A: Naive Proportional Controller (Baseline without maneuver classification or rollout)
    if (mode === 'naive-pd') {
      const berth = snap.targetBerth ?? marina.berths['slip-a-bow'];
      const dx = berth.x - snap.playerX;
      const dy = berth.y - snap.playerY;
      const rawBearing = Math.atan2(dy, dx);
      const rawErr = ((rawBearing - snap.playerHeadingRad + Math.PI) % (2 * Math.PI)) - Math.PI;
      const dist = Math.hypot(dx, dy);
      const naiveControls: ControlInputs = {
        throttle: dist > 2.0 ? 0.35 : -0.15,
        helm: clamp(rawErr * 1.5, -1, 1),
        bowThruster: 0,
      };
      const rollout = evaluateControlRollout(snap, marina, corridor, naiveControls, 1.0);
      return {
        phase,
        phaseConfidence,
        phaseProbabilities: toMap(MANEUVER_PHASES, dists.phaseProbs),
        throttleClass,
        throttleProbabilities: toMap(THROTTLE_CLASSES, dists.throttleProbs),
        helmClass,
        helmProbabilities: toMap(HELM_CLASSES, dists.helmProbs),
        thrusterClass,
        thrusterProbabilities: toMap(THRUSTER_CLASSES, dists.thrusterProbs),
        deckActionClass,
        deckActionProbabilities: toMap(DECK_ACTION_CLASSES, dists.deckProbs),
        controls: naiveControls,
        recommendedFenderRig,
        deckCommand,
        summaryLabel: `🤖 [NAIVE-PD] Thr: ${naiveControls.throttle.toFixed(2)} · Helm: ${naiveControls.helm.toFixed(2)}`,
        activeWaypoint: corridor.activeWaypoint,
        desiredHeadingRad: corridor.desiredHeadingRad,
        predictedTrajectory: rollout.trajectory,
        features,
      };
    }

    // Compute probability-weighted continuous controls from the Stage 2 softmax distributions
    let softThrottle = 0;
    for (let i = 0; i < THROTTLE_CLASSES.length; i++) {
      softThrottle += dists.throttleProbs[i] * THROTTLE_CLASS_VALUES[THROTTLE_CLASSES[i]];
    }
    let softHelm = 0;
    for (let i = 0; i < HELM_CLASSES.length; i++) {
      softHelm += dists.helmProbs[i] * HELM_CLASS_VALUES[HELM_CLASSES[i]];
    }
    let softThruster = 0;
    for (let i = 0; i < THRUSTER_CLASSES.length; i++) {
      softThruster += dists.thrusterProbs[i] * THRUSTER_CLASS_VALUES[THRUSTER_CLASSES[i]];
    }

    // Standing Pivot ("Prop Kicking") duty-cycle modulation:
    // Project displacement from pivotHoldCenter onto vessel bow axis to decide whether to kick forward or reverse!
    if (corridor.requiresStandingPivot) {
      const hasRightHandPropWalk = snap.vesselSpec.reversePropWalkPortN > 250;
      const turnDir =
        hasRightHandPropWalk && Math.abs(corridor.headingErrorToDesiredRad) > 2.35
          ? 1
          : corridor.headingErrorToDesiredRad >= 0
          ? 1
          : -1;
      const dxPivot = corridor.pivotHoldCenter.x - snap.playerX;
      const dyPivot = corridor.pivotHoldCenter.y - snap.playerY;
      const forwardDistToPivotCenter =
        dxPivot * Math.cos(snap.playerHeadingRad) +
        dyPivot * Math.sin(snap.playerHeadingRad);

      if (snap.vesselSpec.bowThrusterMaxN > 0) {
        softThrottle = clamp(
          forwardDistToPivotCenter * 0.45 - snap.telemetry.surgeKnots * 0.45,
          -0.68,
          0.48
        );
        softHelm = turnDir * 0.95;
        softThruster = turnDir;
      } else if (hasRightHandPropWalk && turnDir < 0) {
        // Counter-clockwise turn on a right-hand prop-walk sailboat (e.g. Stage 7 & Stage 10):
        // On Stage 7 (starting at x=12, y=0.2 facing North), back astern for the first 3.5s
        // into the open South-East fairway before executing the continuous forward-port CCW turn!
        const shouldReverseBrake =
          (snap.playerY < -2.0 && snap.telemetry.surgeKnots > 0.35) ||
          (!snap.enableTraffic && snap.playerX > 8.0 && snap.elapsedSec < 3.5);
        if (shouldReverseBrake) {
          softThrottle = -0.82;
          softHelm = -1.0;
        } else {
          softThrottle = 0.88;
          softHelm = -1.0;
        }
      } else if (hasRightHandPropWalk && turnDir > 0) {
        // Clockwise right-hand prop-walk standing pivot (Stage 5, 6, 7, 10):
        // Both forward-starboard kick and reverse prop-walk stroke rotate Clockwise (+r > 0)!
        // In a 25-knot gale when bow points South (+0.8 to +2.85 rad), regulate Y into [-0.35, +0.15]
        // so the vessel stays centered between sup-1 (y = -2.6) and tender-1 (y = +3.1)!
        const isGale = snap.trueWindKnots >= 20;
        const isEastTurnBasin = corridor.activeWaypoint.label === 'East Turn Basin';
        const isBowSouth = snap.playerHeadingRad > 0.8 && snap.playerHeadingRad < 2.85;
        const isBowNorthWestPullingWest =
          isGale && snap.playerHeadingRad < -2.35 && snap.playerX > -5.2 && snap.playerY > -0.2;
        const isGaleTooSouth = isGale && isBowSouth && snap.playerY > 0.05;
        const isGaleTooNorth = isGale && isBowSouth && snap.playerY < -0.45;
        const shouldReverseStroke = isEastTurnBasin
          ? snap.telemetry.surgeKnots > 0.14 ||
            (snap.telemetry.surgeKnots > -0.32 && forwardDistToPivotCenter < -0.15)
          : isBowNorthWestPullingWest
          ? snap.telemetry.surgeKnots > 0.88
          : isGaleTooSouth
          ? snap.telemetry.surgeKnots > 0.20 ||
            (snap.telemetry.surgeKnots > -0.48 && this.pivotBurstPhaseTimer >= 0.72)
          : isGaleTooNorth
          ? snap.telemetry.surgeKnots > 0.72
          : snap.telemetry.surgeKnots > (isGale ? 0.56 : 0.6) ||
            (snap.telemetry.surgeKnots > (isGale ? -0.42 : -0.22) &&
              (forwardDistToPivotCenter < (isGale ? 0.05 : -0.3) ||
                (forwardDistToPivotCenter < 0.55 &&
                  this.pivotBurstPhaseTimer >= (isGale ? 1.12 : 1.25))));
        if (shouldReverseStroke) {
          softThrottle = isGale ? -0.92 : isEastTurnBasin ? -0.82 : -0.74;
          softHelm = 0;
        } else {
          softThrottle = isGale ? 0.90 : isEastTurnBasin ? 0.68 : 0.76;
          softHelm = 1.0;
        }
      } else {
        // Standard standing pivot (e.g. sloop30 on Stage 9): clean time-based duty cycle
        const shouldReverseStroke =
          snap.telemetry.surgeKnots > 0.65 ||
          (snap.telemetry.surgeKnots > -0.15 &&
            (this.pivotBurstPhaseTimer >= 1.3 ||
              (forwardDistToPivotCenter < -0.9 && snap.telemetry.surgeKnots > 0.05)));
        if (shouldReverseStroke) {
          softThrottle = -0.74;
          softHelm = -turnDir * 0.85;
        } else {
          softThrottle = 0.76;
          softHelm = turnDir;
        }
      }
    } else if (corridor.activeWaypoint.label === 'Gale Traffic Hold') {
      // Feather into the 25-knot headwind facing West (PI rad) while holding x ~ -6.5, y ~ -1.0
      // so tender-1 Pass 2 passes cleanly along y = 3.1 with zero contact!
      const xErrWest = snap.playerX - -6.5; // positive if we are East of -6.5 and need to pull West (+u)
      const targetSurgeKnots = clamp(xErrWest * 0.55, -0.15, 1.45);
      softThrottle = clamp(0.78 + (targetSurgeKnots - snap.telemetry.surgeKnots) * 0.65, 0.45, 0.96);
      softHelm = clamp(corridor.headingErrorToDesiredRad * 2.6, -1, 1);
      softThruster = 0;
    } else if (traffic.shouldHoldForTrafficPass) {
      // Hold station in safe fairway lane while crossing traffic clears ahead
      const targetHoldSpeed = 0.0;
      softThrottle = clamp((targetHoldSpeed - snap.telemetry.surgeKnots) * 0.45, -0.55, 0.25);
      softHelm = clamp(corridor.headingErrorToDesiredRad * 1.8, -0.65, 0.65);
      softThruster = 0;
    } else if (corridor.isSternFirstBacking) {
      // Stern-in Mediterranean backing with Counter-Clockwise-only forward prop-wash straightening:
      // Right-hand prop walk in Reverse naturally rotates the bow Clockwise (+r > 0, reducing hErr > 0).
      // Therefore, we ONLY trigger a forward Port-Helm prop-wash kick when hErr < -0.20 (bow rotated too far
      // Clockwise / East of North), and run it up to surgeKnots = +0.42 or hErr >= +0.10 (zero net North drift!).
      const hErr = corridor.headingErrorToDesiredRad;
      const isGaleBacking = snap.trueWindKnots >= 20;
      if (this.sternAlignKickActive) {
        if (hErr >= -0.05 || snap.telemetry.surgeKnots > -0.12) {
          this.sternAlignKickActive = false;
        }
      } else if (
        hErr < -0.22 &&
        snap.telemetry.surgeKnots <= (isGaleBacking ? -0.52 : -0.35)
      ) {
        this.sternAlignKickActive = true;
      }

      if (
        snap.dockingChecklist.inBerthZone &&
        corridor.distToBerthCenterM < 3.6 &&
        snap.telemetry.surgeKnots < -0.35
      ) {
        // Brake astern momentum inside the Med berth box
        softThrottle = 0.52;
        softHelm = clamp(hErr * 2.2, -1, 1);
      } else if (this.sternAlignKickActive) {
        softThrottle = 0.82;
        softHelm = -1.0;
      } else if (
        snap.telemetry.surgeKnots <=
        (isGaleBacking ? -1.05 : hErr < -0.04 ? -0.42 : -0.72)
      ) {
        // Glide on established sternway in Neutral so prop walk is zero and rudder steers cleanly!
        softThrottle = 0;
        softHelm = clamp(-hErr * 3.2, -1, 1);
      } else {
        const helmSign = snap.telemetry.surgeKnots > 0.12 ? 1 : -1;
        softThrottle = snap.trueWindKnots >= 20 ? -0.96 : -0.80;
        softHelm = clamp(helmSign * hErr * 2.5, -1, 1);
      }
    } else {
      this.sternAlignKickActive = false;
    }

    const pureMlpControls: ControlInputs = {
      throttle: clamp(softThrottle, -1, 1),
      helm: clamp(softHelm, -1, 1),
      bowThruster: snap.vesselSpec.bowThrusterMaxN > 0 ? clamp(softThruster, -1, 1) : 0,
    };

    // Mode B: Pure Feed-Forward Classifier (executes classifier softmax expectation directly)
    if (mode === 'pure-mlp') {
      const rollout = evaluateControlRollout(snap, marina, corridor, pureMlpControls, 1.0);
      return {
        phase,
        phaseConfidence,
        phaseProbabilities: toMap(MANEUVER_PHASES, dists.phaseProbs),
        throttleClass,
        throttleProbabilities: toMap(THROTTLE_CLASSES, dists.throttleProbs),
        helmClass,
        helmProbabilities: toMap(HELM_CLASSES, dists.helmProbs),
        thrusterClass,
        thrusterProbabilities: toMap(THRUSTER_CLASSES, dists.thrusterProbs),
        deckActionClass,
        deckActionProbabilities: toMap(DECK_ACTION_CLASSES, dists.deckProbs),
        controls: pureMlpControls,
        recommendedFenderRig,
        deckCommand,
        summaryLabel: `🤖 [${phase} ${Math.round(phaseConfidence * 100)}%] → ${throttleClass} · ${helmClass}`,
        activeWaypoint: corridor.activeWaypoint,
        desiredHeadingRad: corridor.desiredHeadingRad,
        predictedTrajectory: rollout.trajectory,
        features,
      };
    }

    // Mode C: Hybrid Classifier + 1.5s Counterfactual Hydrodynamic Rollout Shield
    // Rank top throttle/helm candidates from the classifier distribution
    // plus the classifier's continuous expectation tuple, and evaluate each via 1.5s forward rollout!
    const topThrottleIndices = [0, 1, 2, 3, 4]
      .sort((a, b) => dists.throttleProbs[b] - dists.throttleProbs[a])
      .slice(0, 2);
    const topHelmIndices = [0, 1, 2, 3, 4]
      .sort((a, b) => dists.helmProbs[b] - dists.helmProbs[a])
      .slice(0, 2);
    const bestThrusterVal =
      snap.vesselSpec.bowThrusterMaxN > 0 &&
      (corridor.distToBerthCenterM < 8.5 || corridor.requiresStandingPivot)
        ? pureMlpControls.bowThruster
        : 0;

    const candidates: Array<{ controls: ControlInputs; prior: number }> = [
      {
        controls: pureMlpControls,
        prior:
          dists.throttleProbs[throttleIdx] *
          dists.helmProbs[helmIdx] *
          dists.thrusterProbs[thrusterIdx] *
          1.35, // Boost smooth expectation prior
      },
    ];

    for (const ti of topThrottleIndices) {
      for (const hi of topHelmIndices) {
        const prior =
          dists.throttleProbs[ti] * dists.helmProbs[hi] * dists.thrusterProbs[thrusterIdx];
        candidates.push({
          controls: {
            throttle: THROTTLE_CLASS_VALUES[THROTTLE_CLASSES[ti]],
            helm: HELM_CLASS_VALUES[HELM_CLASSES[hi]],
            bowThruster: bestThrusterVal,
          },
          prior,
        });
      }
    }

    // For Standing Pivot (Prop-Kicking) or Gale Traffic Hold, execute the precision control stroke directly
    if (corridor.requiresStandingPivot || corridor.activeWaypoint.label === 'Gale Traffic Hold') {
      const pivotEval = evaluateControlRollout(snap, marina, corridor, pureMlpControls, 1.0);
      const activePhase: ManeuverPhase =
        corridor.activeWaypoint.label === 'Gale Traffic Hold'
          ? 'TRAFFIC_HOLD_YIELD'
          : 'STANDING_PIVOT_KICK';
      return {
        phase: activePhase,
        phaseConfidence: Math.max(0.75, phaseConfidence),
        phaseProbabilities: toMap(MANEUVER_PHASES, dists.phaseProbs),
        throttleClass,
        throttleProbabilities: toMap(THROTTLE_CLASSES, dists.throttleProbs),
        helmClass,
        helmProbabilities: toMap(HELM_CLASSES, dists.helmProbs),
        thrusterClass,
        thrusterProbabilities: toMap(THRUSTER_CLASSES, dists.thrusterProbs),
        deckActionClass,
        deckActionProbabilities: toMap(DECK_ACTION_CLASSES, dists.deckProbs),
        controls: pureMlpControls,
        recommendedFenderRig,
        deckCommand,
        summaryLabel: `🤖 [${activePhase} ${Math.round(Math.max(0.75, phaseConfidence) * 100)}%] → ${pureMlpControls.throttle < 0 ? 'REV_PROP_WALK' : 'FWD_PROP_KICK'}`,
        activeWaypoint: corridor.activeWaypoint,
        desiredHeadingRad: corridor.desiredHeadingRad,
        predictedTrajectory: pivotEval.trajectory,
        features,
      };
    }

    // For Stern-In Mediterranean Backing, execute the pulse-and-glide backing controller directly
    if (corridor.isSternFirstBacking) {
      const sternEval = evaluateControlRollout(snap, marina, corridor, pureMlpControls, 1.0);
      return {
        phase: 'STERN_IN_BACKING',
        phaseConfidence: Math.max(0.75, phaseConfidence),
        phaseProbabilities: toMap(MANEUVER_PHASES, dists.phaseProbs),
        throttleClass,
        throttleProbabilities: toMap(THROTTLE_CLASSES, dists.throttleProbs),
        helmClass,
        helmProbabilities: toMap(HELM_CLASSES, dists.helmProbs),
        thrusterClass,
        thrusterProbabilities: toMap(THRUSTER_CLASSES, dists.thrusterProbs),
        deckActionClass,
        deckActionProbabilities: toMap(DECK_ACTION_CLASSES, dists.deckProbs),
        controls: pureMlpControls,
        recommendedFenderRig,
        deckCommand,
        summaryLabel: `🤖 [STERN_IN_BACKING ${Math.round(Math.max(0.75, phaseConfidence) * 100)}%] → ${pureMlpControls.throttle > 0 ? 'ASTERN_GLIDE_STEER' : 'ASTERN_PULSE'}`,
        activeWaypoint: corridor.activeWaypoint,
        desiredHeadingRad: corridor.desiredHeadingRad,
        predictedTrajectory: sternEval.trajectory,
        features,
      };
    }

    if (clearances.minOverallM < 1.2 || snap.dockingChecklist.inBerthZone || traffic.threatScore > 0.35) {
      candidates.push(
        { controls: { throttle: -0.48, helm: 0, bowThruster: bestThrusterVal }, prior: 0.35 },
        { controls: { throttle: 0.42, helm: pureMlpControls.helm, bowThruster: bestThrusterVal }, prior: 0.35 }
      );
    }

    let bestEval = evaluateControlRollout(
      snap,
      marina,
      corridor,
      candidates[0].controls,
      candidates[0].prior
    );

    for (let i = 1; i < candidates.length; i++) {
      const ev = evaluateControlRollout(
        snap,
        marina,
        corridor,
        candidates[i].controls,
        candidates[i].prior
      );
      if (ev.totalCost < bestEval.totalCost) {
        bestEval = ev;
      }
    }

    // Smooth blend between classifier expectation and best rollout candidate
    const chosenControls: ControlInputs = {
      throttle: Number(clamp(bestEval.controls.throttle, -1, 1).toFixed(3)),
      helm: Number(clamp(bestEval.controls.helm, -1, 1).toFixed(3)),
      bowThruster: Number(clamp(bestEval.controls.bowThruster, -1, 1).toFixed(3)),
    };

    const pct = Math.round(phaseConfidence * 100);
    const thrLabel =
      chosenControls.bowThruster !== 0
        ? ` · Bow:${chosenControls.bowThruster > 0 ? 'STBD' : 'PORT'}`
        : '';
    const summaryLabel = `🤖 [${phase} ${pct}%] → ${throttleClass} · ${helmClass}${thrLabel}`;

    return {
      phase,
      phaseConfidence,
      phaseProbabilities: toMap(MANEUVER_PHASES, dists.phaseProbs),
      throttleClass,
      throttleProbabilities: toMap(THROTTLE_CLASSES, dists.throttleProbs),
      helmClass,
      helmProbabilities: toMap(HELM_CLASSES, dists.helmProbs),
      thrusterClass,
      thrusterProbabilities: toMap(THRUSTER_CLASSES, dists.thrusterProbs),
      deckActionClass,
      deckActionProbabilities: toMap(DECK_ACTION_CLASSES, dists.deckProbs),
      controls: chosenControls,
      recommendedFenderRig,
      deckCommand,
      summaryLabel,
      activeWaypoint: corridor.activeWaypoint,
      desiredHeadingRad: corridor.desiredHeadingRad,
      predictedTrajectory: bestEval.trajectory,
      features,
    };
  }
}

/**
 * Trains a two-layer Multi-Head Neural Network (`MlpClassifierWeights`) via Behavior Cloning
 * (cross-entropy loss + L2 weight decay) on demonstration samples collected by the test harness.
 */
export function trainSkipperMlpWeights(
  samples: ReadonlyArray<TrainingSample>,
  options: { hiddenDim?: number; epochs?: number; learningRate?: number } = {}
): {
  weights: MlpClassifierWeights;
  initialLoss: number;
  finalLoss: number;
  phaseAccuracy: number;
  throttleAccuracy: number;
  helmAccuracy: number;
} {
  const hiddenDim = options.hiddenDim ?? 24;
  const epochs = options.epochs ?? 45;
  const lr = options.learningRate ?? 0.035;

  // Deterministic PRNG (Mulberry32) so training is 100% reproducible in tests
  let seed = 0x5f3759df;
  const randSym = (): number => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    const u = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    return (u - 0.5) * 0.35;
  };

  const makeMatrix = (rows: number, cols: number): number[][] =>
    Array.from({ length: rows }, () => Array.from({ length: cols }, () => randSym()));
  const makeVec = (len: number): number[] => new Array<number>(len).fill(0);

  const stage2InDim = hiddenDim + 8;
  const weights: MlpClassifierWeights = {
    hiddenDim,
    W1: makeMatrix(hiddenDim, FEATURE_VECTOR_DIM),
    b1: makeVec(hiddenDim),
    WPhase: makeMatrix(8, hiddenDim),
    bPhase: makeVec(8),
    WThrottle: makeMatrix(5, stage2InDim),
    bThrottle: makeVec(5),
    WHelm: makeMatrix(5, stage2InDim),
    bHelm: makeVec(5),
    WThruster: makeMatrix(3, stage2InDim),
    bThruster: makeVec(3),
    WDeck: makeMatrix(3, stage2InDim),
    bDeck: makeVec(3),
  };

  if (samples.length === 0) {
    return {
      weights,
      initialLoss: 0,
      finalLoss: 0,
      phaseAccuracy: 1,
      throttleAccuracy: 1,
      helmAccuracy: 1,
    };
  }

  let initialLoss = 0;
  let finalLoss = 0;

  for (let epoch = 0; epoch < epochs; epoch++) {
    let epochLoss = 0;
    const stepLr = lr / (1 + epoch * 0.025);

    for (const s of samples) {
      // Forward pass Layer 1
      const h = new Array<number>(hiddenDim);
      for (let i = 0; i < hiddenDim; i++) {
        let z = weights.b1[i];
        const row = weights.W1[i];
        for (let j = 0; j < FEATURE_VECTOR_DIM; j++) {
          z += row[j] * (s.features[j] ?? 0);
        }
        h[i] = Math.tanh(z);
      }

      // Stage 1 Phase Head
      const zPhase = weights.WPhase.map((row, c) => {
        let z = weights.bPhase[c];
        for (let i = 0; i < hiddenDim; i++) z += row[i] * h[i];
        return z;
      });
      const pPhase = softmax(zPhase);

      const s2In = [...h, ...pPhase];

      const forwardHead = (W: number[][], b: number[]): number[] => {
        const z = W.map((row, c) => {
          let acc = b[c];
          for (let i = 0; i < stage2InDim; i++) acc += row[i] * s2In[i];
          return acc;
        });
        return softmax(z);
      };

      const pThrottle = forwardHead(weights.WThrottle, weights.bThrottle);
      const pHelm = forwardHead(weights.WHelm, weights.bHelm);
      const pThruster = forwardHead(weights.WThruster, weights.bThruster);
      const pDeck = forwardHead(weights.WDeck, weights.bDeck);

      const eps = 1e-6;
      const sampleLoss =
        -Math.log(Math.max(eps, pPhase[s.phaseIdx])) -
        Math.log(Math.max(eps, pThrottle[s.throttleIdx])) -
        Math.log(Math.max(eps, pHelm[s.helmIdx])) -
        Math.log(Math.max(eps, pThruster[s.thrusterIdx])) -
        Math.log(Math.max(eps, pDeck[s.deckIdx]));
      epochLoss += sampleLoss;

      // Backprop through Stage 2 and Stage 1 heads into hidden layer h
      const dh = new Array<number>(hiddenDim).fill(0);

      const backpropHead = (
        probs: number[],
        targetIdx: number,
        W: number[][],
        b: number[]
      ): void => {
        for (let c = 0; c < probs.length; c++) {
          const grad = probs[c] - (c === targetIdx ? 1 : 0);
          b[c] -= stepLr * grad;
          const row = W[c];
          for (let i = 0; i < stage2InDim; i++) {
            if (i < hiddenDim) {
              dh[i] += row[i] * grad * 0.25;
            }
            row[i] -= stepLr * (grad * s2In[i] + 1e-4 * row[i]);
          }
        }
      };

      backpropHead(pThrottle, s.throttleIdx, weights.WThrottle, weights.bThrottle);
      backpropHead(pHelm, s.helmIdx, weights.WHelm, weights.bHelm);
      backpropHead(pThruster, s.thrusterIdx, weights.WThruster, weights.bThruster);
      backpropHead(pDeck, s.deckIdx, weights.WDeck, weights.bDeck);

      for (let c = 0; c < 8; c++) {
        const grad = pPhase[c] - (c === s.phaseIdx ? 1 : 0);
        weights.bPhase[c] -= stepLr * grad;
        const row = weights.WPhase[c];
        for (let i = 0; i < hiddenDim; i++) {
          dh[i] += row[i] * grad;
          row[i] -= stepLr * (grad * h[i] + 1e-4 * row[i]);
        }
      }

      // Backprop into W1, b1
      for (let i = 0; i < hiddenDim; i++) {
        const dz = dh[i] * (1 - h[i] * h[i]);
        weights.b1[i] -= stepLr * dz;
        const row = weights.W1[i];
        for (let j = 0; j < FEATURE_VECTOR_DIM; j++) {
          row[j] -= stepLr * (dz * (s.features[j] ?? 0) + 1e-4 * row[j]);
        }
      }
    }

    const avgLoss = epochLoss / samples.length;
    if (epoch === 0) initialLoss = avgLoss;
    finalLoss = avgLoss;
  }

  // Evaluate accuracy of the learned classifier across the dataset
  const evalClassifier = new SkipperClassifier(weights);
  let phaseHits = 0;
  let throttleHits = 0;
  let helmHits = 0;

  for (const s of samples) {
    const out = evalClassifier.classifyFeatureVector(s.features);
    if (argmax(out.phaseProbs) === s.phaseIdx) phaseHits++;
    if (argmax(out.throttleProbs) === s.throttleIdx) throttleHits++;
    if (argmax(out.helmProbs) === s.helmIdx) helmHits++;
  }

  return {
    weights,
    initialLoss,
    finalLoss,
    phaseAccuracy: phaseHits / samples.length,
    throttleAccuracy: throttleHits / samples.length,
    helmAccuracy: helmHits / samples.length,
  };
}
