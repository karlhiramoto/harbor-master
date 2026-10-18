import {
  clamp,
  computeHydrodynamicStep,
  ControlInputs,
  MS_TO_KNOTS,
  normalizeAngleRad,
  stepPropellerInertia,
} from '../physics/hydrodynamics';
import { MarinaLayout } from '../physics/marina';
import { SimulationSnapshot } from '../physics/world';
import { computePoseClearances, CorridorWaypointPlan } from './featureExtractor';

export interface RolloutTrajectoryPoint {
  x: number;
  y: number;
  headingRad: number;
  speedKnots: number;
}

export interface CandidateRolloutEvaluation {
  controls: ControlInputs;
  totalCost: number;
  minClearanceM: number;
  minTrafficDistM: number;
  terminalSpeedKnots: number;
  terminalHeadingErrRad: number;
  terminalWpDistM: number;
  reachesReadyToMoor: boolean;
  trajectory: RolloutTrajectoryPoint[];
}

/**
 * Fast analytical 1.5-second hydrodynamic forward model (10 steps @ dt=0.15s).
 * Predicts vessel trajectory (x, y, heading, u, v, r) under candidate controls
 * and scores safety clearance + waypoint/berth convergence.
 */
export function evaluateControlRollout(
  snap: SimulationSnapshot,
  marina: MarinaLayout,
  corridor: CorridorWaypointPlan,
  candidateControls: ControlInputs,
  classifierPriorProb = 1.0,
  horizonSec = 1.5,
  dtSec = 0.15
): CandidateRolloutEvaluation {
  const spec = snap.vesselSpec;
  const berth = snap.targetBerth ?? marina.berths['slip-a-bow'];

  let x = snap.playerX;
  let y = snap.playerY;
  let heading = snap.playerHeadingRad;
  let u = snap.telemetry.surgeKnots / MS_TO_KNOTS;
  let v = snap.telemetry.swayKnots / MS_TO_KNOTS;
  let r = snap.telemetry.yawRateRadSec ?? 0;
  let effectiveProp = snap.telemetry.effectiveProp ?? snap.controls.throttle;

  const steps = Math.max(4, Math.round(horizonSec / dtSec));
  const trajectory: RolloutTrajectoryPoint[] = [];

  let minClearanceM = 20;
  let minTrafficDistM = 20;
  let reachesReadyToMoor = false;
  let accumulatedPathCost = 0;

  const initialClearanceM = computePoseClearances(
    spec.id,
    snap.playerX,
    snap.playerY,
    snap.playerHeadingRad,
    marina,
    corridor.isSternFirstBacking
  ).minOverallM;

  const calcBerthHeadingErrDeg = (hdg: number): number => {
    let err = Math.abs(normalizeAngleRad(hdg - berth.targetHeadingRad)) * (180 / Math.PI);
    if (berth.allowOppositeHeading) {
      const oppErr =
        Math.abs(normalizeAngleRad(hdg - (berth.targetHeadingRad + Math.PI))) * (180 / Math.PI);
      err = Math.min(err, oppErr);
    }
    return err;
  };

  for (let step = 1; step <= steps; step++) {
    const tOffset = step * dtSec;
    effectiveProp = stepPropellerInertia(effectiveProp, candidateControls.throttle, spec, dtSec);
    const hydro = computeHydrodynamicStep(
      spec,
      heading,
      { u, v, r, effectiveProp },
      candidateControls,
      {
        trueWindKnots: snap.trueWindKnots,
        windFromDeg: snap.windFromDeg,
        gustFactor: snap.gustFactor,
        shelterFactor: snap.shelterFactor,
      }
    );

    u += hydro.duDt * dtSec;
    v += hydro.dvDt * dtSec;
    r += hydro.drDt * dtSec;

    const cosH = Math.cos(heading);
    const sinH = Math.sin(heading);
    let vx = u * cosH - v * sinH;
    let vy = u * sinH + v * cosH;

    if (snap.activeSpringLine) {
      const { dockCleat, boatCleat, restLengthM } = snap.activeSpringLine;
      const cx = x + boatCleat.x * cosH - boatCleat.y * sinH;
      const cy = y + boatCleat.x * sinH + boatCleat.y * cosH;
      const dx = dockCleat.x - cx;
      const dy = dockCleat.y - cy;
      const dist = Math.hypot(dx, dy);
      if (dist > restLengthM && dist > 1e-4) {
        const tension = Math.min(18000, (dist - restLengthM) * 7500);
        const fx = (dx / dist) * tension;
        const fy = (dy / dist) * tension;
        const mTot = spec.massKg + spec.addedMassSurgeKg;
        vx += (fx / mTot) * dtSec;
        vy += (fy / mTot) * dtSec;
        const rx = cx - x;
        const ry = cy - y;
        r += ((rx * fy - ry * fx) / spec.yawInertiaKgM2) * dtSec;
        r *= 0.99;
      }
    }

    x += vx * dtSec;
    y += vy * dtSec;
    heading = normalizeAngleRad(heading + r * dtSec);
    const speedKnots = Math.hypot(vx, vy) * MS_TO_KNOTS;

    if (step % 2 === 0 || step === steps) {
      trajectory.push({ x, y, headingRad: heading, speedKnots });
    }

    // Evaluate static obstacle clearance at midpoint and final step
    if (step === Math.ceil(steps / 2) || step === steps) {
      const clr = computePoseClearances(
        spec.id,
        x,
        y,
        heading,
        marina,
        corridor.isSternFirstBacking
      );
      minClearanceM = Math.min(minClearanceM, clr.minOverallM);
      const closingAmount = Math.max(0, initialClearanceM - clr.minOverallM);
      const openingAmount = Math.max(0, clr.minOverallM - initialClearanceM);

      if (clr.minOverallM < 0.25) {
        accumulatedPathCost +=
          420 * (0.28 - clr.minOverallM) + 520 * closingAmount * (1 + speedKnots * 1.8);
      } else if (clr.minOverallM < 0.75) {
        accumulatedPathCost +=
          35 * (0.75 - clr.minOverallM) + 95 * closingAmount * (1 + speedKnots);
      }
      // Reward actions that actively increase hull clearance when near an obstacle
      if (initialClearanceM < 0.65 && openingAmount > 0) {
        accumulatedPathCost -= 240 * openingAmount;
      }
    }

    // Evaluate moving fairway hazards using exact 2D oriented bounding box (OBB) hull distance
    if (snap.enableTraffic) {
      const boatHalfLen = spec.loa * 0.5;
      const boatHalfBeam = spec.beam * 0.54;
      for (const hz of snap.movingHazards) {
        const predHzX = clamp(hz.x + hz.speedMs * tOffset, hz.minX, hz.maxX);
        const relHzX = predHzX - x;
        const relHzY = hz.y - y;
        const localHzX = relHzX * cosH + relHzY * sinH;
        const localHzY = -relHzX * sinH + relHzY * cosH;
        const dxHz = Math.max(Math.abs(localHzX) - boatHalfLen, 0);
        const dyHz = Math.max(Math.abs(localHzY) - boatHalfBeam, 0);
        const dHz = Math.hypot(dxHz, dyHz) - hz.radius;

        minTrafficDistM = Math.min(minTrafficDistM, dHz);
        if (dHz < 0.16) {
          accumulatedPathCost += 850 * (0.22 - dHz) * (1 + speedKnots);
        } else if (dHz < 0.32) {
          accumulatedPathCost += 90 * (0.32 - dHz);
        }
      }
    }

    // Check if trajectory reaches readyToMoor inside the target berth
    const inBerthX = Math.abs(x - berth.x) <= berth.width * 0.46;
    const inBerthY = Math.abs(y - berth.y) <= berth.length * 0.46;
    const hErrDeg = calcBerthHeadingErrDeg(heading);
    if (inBerthX && inBerthY && hErrDeg <= 30 && speedKnots <= 0.62) {
      reachesReadyToMoor = true;
    }
  }

  const terminalSpeedKnots = Math.hypot(u, v) * MS_TO_KNOTS;
  const wp = corridor.activeWaypoint;
  const initialWpDistM = Math.hypot(wp.x - snap.playerX, wp.y - snap.playerY);
  const terminalWpDistM = Math.hypot(wp.x - x, wp.y - y);
  const terminalBerthDistM = Math.hypot(berth.x - x, berth.y - y);

  let terminalHeadingErrRad = Math.abs(normalizeAngleRad(corridor.desiredHeadingRad - heading));
  const isFinalWaypoint = Math.hypot(wp.x - berth.x, wp.y - berth.y) < 2.2;
  if (isFinalWaypoint && berth.allowOppositeHeading && !corridor.isSternFirstBacking) {
    const oppErr = Math.abs(normalizeAngleRad(corridor.desiredHeadingRad + Math.PI - heading));
    terminalHeadingErrRad = Math.min(terminalHeadingErrRad, oppErr);
  }

  const inBerthNow =
    Math.abs(x - berth.x) <= berth.width * 0.45 &&
    Math.abs(y - berth.y) <= berth.length * 0.45;
  const headingAlignedNow = terminalHeadingErrRad <= 0.44;

  // Standing Pivot scoring: prioritize rapid angular convergence while staying tightly anchored near pivotHoldCenter
  if (corridor.requiresStandingPivot && !inBerthNow) {
    const initialHeadingErr = Math.abs(corridor.headingErrorToDesiredRad);
    const headingProgressBonus = (initialHeadingErr - terminalHeadingErrRad) * 44.0;
    const initialPivotDist = Math.hypot(
      snap.playerX - corridor.pivotHoldCenter.x,
      snap.playerY - corridor.pivotHoldCenter.y
    );
    const terminalPivotDist = Math.hypot(
      x - corridor.pivotHoldCenter.x,
      y - corridor.pivotHoldCenter.y
    );
    const pivotDriftDelta = terminalPivotDist - initialPivotDist;
    const pivotCenterCost =
      terminalPivotDist * 20.0 +
      (pivotDriftDelta > 0 ? pivotDriftDelta * 34.0 : pivotDriftDelta * 14.0);
    const pivotSpeedCost = Math.max(0, terminalSpeedKnots - 1.05) * 26.0;
    const stagnationPenalty =
      Math.abs(candidateControls.throttle) < 0.1 &&
      Math.abs(candidateControls.bowThruster) < 0.1 &&
      Math.abs(r) < 0.08
        ? 140.0
        : 0;
    const priorPenalty = -1.6 * Math.log(Math.max(1e-3, classifierPriorProb));
    return {
      controls: candidateControls,
      totalCost:
        accumulatedPathCost +
        terminalHeadingErrRad * 35.0 -
        headingProgressBonus +
        pivotCenterCost +
        pivotSpeedCost +
        stagnationPenalty +
        priorPenalty,
      minClearanceM,
      minTrafficDistM,
      terminalSpeedKnots,
      terminalHeadingErrRad,
      terminalWpDistM,
      reachesReadyToMoor,
      trajectory,
    };
  }

  // Target speed profile
  let desiredSpeedKnots: number;
  if (inBerthNow && headingAlignedNow && terminalBerthDistM < 3.4) {
    desiredSpeedKnots = 0;
  } else if (inBerthNow && !headingAlignedNow) {
    desiredSpeedKnots = 0.65;
  } else if (terminalBerthDistM < 5.5) {
    desiredSpeedKnots = clamp(terminalBerthDistM * 0.28, 0.45, 1.35);
  } else {
    desiredSpeedKnots = clamp(terminalWpDistM * 0.38, 1.15, 2.55);
  }

  const signedTravelKnots = corridor.isSternFirstBacking
    ? -u * MS_TO_KNOTS
    : u * MS_TO_KNOTS;
  const speedErrCost =
    inBerthNow && headingAlignedNow && terminalBerthDistM < 3.4
      ? terminalSpeedKnots * 20.0
      : Math.abs(signedTravelKnots - desiredSpeedKnots) * 4.8;

  // Stagnation penalty: never sit dead in the water when not ready to moor!
  const isStagnant =
    !reachesReadyToMoor &&
    !(inBerthNow && headingAlignedNow) &&
    terminalSpeedKnots < 0.35 &&
    Math.abs(candidateControls.throttle) < 0.1 &&
    Math.abs(candidateControls.bowThruster) < 0.1;
  const stagnationPenalty = isStagnant ? 135.0 : 0;

  // Reward making real progress toward active waypoint
  const wpProgressBonus = (initialWpDistM - terminalWpDistM) * 9.5;
  const swayCost = terminalBerthDistM < 7.0 ? Math.abs(v * MS_TO_KNOTS) * 8.5 : Math.abs(v) * 2.0;
  const yawRateCost =
    terminalHeadingErrRad < 0.18 ? Math.abs(r) * 7.5 : Math.abs(r) * 1.2;

  const distCost = isFinalWaypoint
    ? terminalBerthDistM * 7.2 + Math.abs(x - berth.x) * 4.0
    : terminalWpDistM * 5.8;
  const headingCost = terminalHeadingErrRad * (isFinalWaypoint ? 22.0 : 14.0);
  const readyBonus = reachesReadyToMoor ? -90.0 : 0;
  const priorPenalty = -1.8 * Math.log(Math.max(1e-3, classifierPriorProb));

  const totalCost =
    accumulatedPathCost +
    distCost -
    wpProgressBonus +
    headingCost +
    speedErrCost +
    swayCost +
    yawRateCost +
    stagnationPenalty +
    readyBonus +
    priorPenalty;

  return {
    controls: candidateControls,
    totalCost,
    minClearanceM,
    minTrafficDistM,
    terminalSpeedKnots,
    terminalHeadingErrRad,
    terminalWpDistM,
    reachesReadyToMoor,
    trajectory,
  };
}
