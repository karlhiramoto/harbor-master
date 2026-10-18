import { clamp, normalizeAngleRad, windFromDegToWorldVelocity } from '../physics/hydrodynamics';
import { MarinaLayout, MovingHazard, TargetBerth } from '../physics/marina';
import { getHullPolygonVertices, VESSEL_SPECS } from '../physics/vessels';
import { SimulationSnapshot } from '../physics/world';

export const FEATURE_VECTOR_DIM = 20;

export const FEATURE_NAMES: ReadonlyArray<string> = [
  'wpDistNorm',
  'wpCourseErrNorm',
  'berthLongErrNorm',
  'berthLatErrNorm',
  'berthHeadingErrNorm',
  'backingModeFlag',
  'surgeNorm',
  'swayNorm',
  'yawRateNorm',
  'stoppingMarginNorm',
  'windBodyLongNorm',
  'windBodyLatNorm',
  'hasBowThrusterFlag',
  'propWalkFactorNorm',
  'rudderWashAuthority',
  'hullClearanceFwdNorm',
  'hullClearancePortNorm',
  'hullClearanceStbdNorm',
  'trafficThreatNorm',
  'readyToMoorFlag',
];

export interface CorridorWaypointPlan {
  /** Active waypoint the vessel should track right now */
  activeWaypoint: { x: number; y: number; label: string };
  /** Full sequence of corridor waypoints from fairway to berth center */
  allWaypoints: Array<{ x: number; y: number; label: string }>;
  /** Desired vessel heading at the current stage of the approach (rad) */
  desiredHeadingRad: number;
  /** True when the vessel should back in astern (-x_body leads toward waypoint) */
  isSternFirstBacking: boolean;
  /** True when the vessel should execute an in-place standing pivot before translating */
  requiresStandingPivot: boolean;
  /** Safe pivot center (x, y) to stay near while executing a standing pivot */
  pivotHoldCenter: { x: number; y: number };
  /** Signed distance remaining to berth target center (m) */
  distToBerthCenterM: number;
  /** Signed heading error to desiredHeadingRad (rad, in [-pi, pi]) */
  headingErrorToDesiredRad: number;
  /** Signed course error from travel direction (bow or stern) to activeWaypoint (rad) */
  travelCourseErrorRad: number;
}

export interface HullClearanceSummary {
  /** Minimum clearance in forward/stern travel cone (m) */
  forwardOrSternM: number;
  /** Minimum clearance on port beam (m) */
  portM: number;
  /** Minimum clearance on starboard beam (m) */
  starboardM: number;
  /** Overall minimum clearance to any static dock/piling/moored hull (m) */
  minOverallM: number;
  /** Closest obstacle label */
  closestObstacleLabel: string;
}

export interface TrafficThreatSummary {
  /** Threat score in [0, 1] where > 0.45 means yield/adjust speed */
  threatScore: number;
  /** Time to closest point of approach (s) */
  tcpaSec: number;
  /** Distance at closest point of approach (m) */
  dcpaM: number;
  /** Safe fairway Y coordinate that clears active nearby traffic hazards */
  safeFairwayY: number;
  /** True when both hazards pinch the channel ahead and the vessel should briefly hold speed */
  shouldHoldForTrafficPass: boolean;
}

export interface ExtractedFeatureBundle {
  /** 20-D normalized feature vector in [-1, 1]^20 */
  vector: number[];
  corridor: CorridorWaypointPlan;
  clearances: HullClearanceSummary;
  traffic: TrafficThreatSummary;
}

interface HullSamplePoint {
  lx: number;
  ly: number;
  sector: 'fwd' | 'stern' | 'port' | 'stbd';
}

const HULL_SAMPLE_POINTS_CACHE: Record<
  SimulationSnapshot['vesselSpec']['id'],
  ReadonlyArray<HullSamplePoint>
> = (() => {
  const out = {} as Record<
    SimulationSnapshot['vesselSpec']['id'],
    ReadonlyArray<HullSamplePoint>
  >;
  for (const id of ['outboard7m', 'cruiser8m', 'sailboat12m'] as const) {
    const spec = VESSEL_SPECS[id];
    const verts = getHullPolygonVertices(spec);
    const pts: HullSamplePoint[] = [];
    for (let i = 0; i < verts.length; i += 2) {
      const lx = verts[i];
      const ly = verts[i + 1];
      let sector: HullSamplePoint['sector'];
      if (lx > spec.loa * 0.28) {
        sector = 'fwd';
      } else if (lx < -spec.loa * 0.28) {
        sector = 'stern';
      } else if (ly < 0) {
        sector = 'port';
      } else {
        sector = 'stbd';
      }
      pts.push({ lx, ly, sector });
    }
    out[id] = pts;
  }
  return out;
})();

/**
 * Computes Closest Point of Approach (TCPA / DCPA) threat against moving fairway hazards
 * (paddleboarder `sup-1` at y=-2.6 and dinghy tender `tender-1` at y=+3.1) and recommends
 * a safe fairway Y lane that steers around whichever hazard is ahead.
 */
export function computeTrafficThreat(snap: SimulationSnapshot): TrafficThreatSummary {
  if (!snap.enableTraffic || snap.movingHazards.length === 0) {
    return {
      threatScore: 0,
      tcpaSec: 99,
      dcpaM: 99,
      safeFairwayY: 0.1,
      shouldHoldForTrafficPass: false,
    };
  }

  const uMs = snap.telemetry.surgeKnots * 0.514444;
  const vMs = snap.telemetry.swayKnots * 0.514444;
  const cosH = Math.cos(snap.playerHeadingRad);
  const sinH = Math.sin(snap.playerHeadingRad);
  const boatVx = uMs * cosH - vMs * sinH;
  const boatVy = uMs * sinH + vMs * cosH;

  let maxThreat = 0;
  let bestTcpa = 99;
  let bestDcpa = 99;

  const sup = snap.movingHazards.find((h) => h.kind === 'paddleboard');
  const tender = snap.movingHazards.find((h) => h.kind === 'tender');

  const halfLen = snap.vesselSpec.loa * 0.5;
  const halfBeam = snap.vesselSpec.beam * 0.54;
  const safetyRadiusM = halfBeam + 1.5;

  for (const hz of snap.movingHazards) {
    const rx = hz.x - snap.playerX;
    const ry = hz.y - snap.playerY;
    const rvx = hz.speedMs - boatVx;
    const rvy = 0 - boatVy;
    const relSpeedSq = rvx * rvx + rvy * rvy;

    let tcpa = 0;
    if (relSpeedSq > 1e-4) {
      tcpa = clamp(-(rx * rvx + ry * rvy) / relSpeedSq, 0, 8);
    }
    const dcpa = Math.hypot(rx + rvx * tcpa, ry + rvy * tcpa);
    const currentDist = Math.hypot(rx, ry);

    if (dcpa < safetyRadiusM + hz.radius || currentDist < safetyRadiusM + hz.radius) {
      const distFactor = clamp(
        1 - (Math.min(dcpa, currentDist) - hz.radius) / (safetyRadiusM + 1.2),
        0,
        1
      );
      const timeFactor = clamp(1 - tcpa / 6.5, 0, 1);
      const threat = clamp(distFactor * (0.4 + 0.6 * timeFactor), 0, 1);
      if (threat > maxThreat) {
        maxThreat = threat;
        bestTcpa = tcpa;
        bestDcpa = Math.min(dcpa, currentDist);
      }
    }
  }

  // Determine safe fairway Y lane:
  // sup-1 is at y = -2.6 (r=0.72 -> occupies y <= -1.88)
  // tender-1 is at y = +3.1 (r=1.10 -> occupies y >= +2.00)
  const supDx = sup ? sup.x - snap.playerX : 99;
  const tenderDx = tender ? tender.x - snap.playerX : 99;

  const supCloseX = Math.abs(supDx) < halfLen + 4.8 || (supDx > 0 && supDx < halfLen + 8.5);
  const tenderCloseX =
    Math.abs(tenderDx) < halfLen + 4.8 || (tenderDx > -2.0 && tenderDx < halfLen + 11.0);

  let safeFairwayY = 0.05;
  let shouldHoldForTrafficPass = false;

  if (supCloseX && !tenderCloseX) {
    // Pass South of paddleboarder (y = -2.6, south edge at y = -1.88) inside the safe center lane
    safeFairwayY = 0.85;
  } else if (tenderCloseX && !supCloseX) {
    // Pass North of dinghy tender (y = +3.1, north edge at y = +2.00) inside the safe center lane
    safeFairwayY = -0.35;
  } else if (supCloseX && tenderCloseX) {
    // Both hazards overlap in X ahead: stay in the 3.88m center channel (y = +0.15)
    safeFairwayY = 0.15;
    if (
      snap.trueWindKnots < 22 &&
      tenderDx > -halfLen - 1.5 &&
      tenderDx < halfLen + 6.5 &&
      snap.playerX < 8.0
    ) {
      shouldHoldForTrafficPass = true;
    }
  }

  // Stage 9 tactic: "Time your turn behind the fairway paddleboarder before slipping alongside M/Y Solaris"
  // Hold in the safe center fairway lane (y > -1.5) if sup-1 (y = -2.6) is crossing the Slip B entrance!
  if (
    sup &&
    snap.targetBerth?.id === 'slip-b-tight' &&
    snap.playerY > -1.5 &&
    snap.playerX > 5.0 &&
    Math.abs(sup.x - snap.playerX) < halfLen + 3.2
  ) {
    shouldHoldForTrafficPass = true;
    safeFairwayY = 0.55;
  }

  return {
    threatScore: shouldHoldForTrafficPass ? Math.max(0.75, maxThreat) : maxThreat,
    tcpaSec: bestTcpa,
    dcpaM: bestDcpa,
    safeFairwayY,
    shouldHoldForTrafficPass,
  };
}

export function resolveTargetBerthHeading(
  berth: TargetBerth,
  _px: number,
  _py: number,
  currentHeadingRad: number
): { targetHeadingRad: number; isSternFirstBacking: boolean } {
  if (!berth.allowOppositeHeading && berth.id === 'south-med-stern') {
    return {
      targetHeadingRad: -Math.PI / 2,
      isSternFirstBacking: true,
    };
  }

  if (!berth.allowOppositeHeading) {
    return {
      targetHeadingRad: berth.targetHeadingRad,
      isSternFirstBacking: false,
    };
  }

  if (berth.id === 'slip-a-bow' || berth.id === 'slip-b-tight') {
    return {
      targetHeadingRad: -Math.PI / 2,
      isSternFirstBacking: false,
    };
  }

  if (berth.id === 'south-east-spring') {
    return {
      targetHeadingRad: Math.PI / 2,
      isSternFirstBacking: false,
    };
  }

  const errNorth = Math.abs(normalizeAngleRad(currentHeadingRad - -Math.PI / 2));
  const errSouth = Math.abs(normalizeAngleRad(currentHeadingRad - Math.PI / 2));
  return {
    targetHeadingRad: errNorth <= errSouth ? -Math.PI / 2 : Math.PI / 2,
    isSternFirstBacking: false,
  };
}

/**
 * Computes the multi-segment seamanship corridor (Fairway Staging -> Slip Throat Gate -> Berth Target)
 * with windward crab compensation and traffic lane avoidance.
 */
export function computeCorridorPlan(
  snap: SimulationSnapshot,
  marina: MarinaLayout,
  traffic?: TrafficThreatSummary
): CorridorWaypointPlan {
  const berth = snap.targetBerth ?? marina.berths['slip-a-bow'];
  const px = snap.playerX;
  const py = snap.playerY;
  const heading = snap.playerHeadingRad;
  const trafficInfo = traffic ?? computeTrafficThreat(snap);

  const { targetHeadingRad } = resolveTargetBerthHeading(berth, px, py, heading);

  const { wx, wy } = windFromDegToWorldVelocity(
    snap.windFromDeg,
    snap.trueWindKnots * snap.gustFactor * snap.shelterFactor
  );
  const hasThruster = snap.vesselSpec.bowThrusterMaxN > 0;
  const crabScale = hasThruster ? 0.045 : 0.085;
  const upwindOffsetX = clamp(-wx * crabScale, -0.85, 0.85);
  const upwindOffsetY = clamp(-wy * crabScale, -0.65, 0.65);

  const waypoints: Array<{ x: number; y: number; label: string }> = [];
  let activeWaypoint: { x: number; y: number; label: string };
  let isSternFirstBacking = false;
  let requiresStandingPivot = false;
  let pivotHoldCenter = { x: px, y: 0.0 };
  let desiredHeadingRad: number;

  const fairwayLaneY = snap.enableTraffic
    ? clamp(trafficInfo.safeFairwayY + upwindOffsetY * 0.25, -0.75, 0.9)
    : clamp(0.15 + upwindOffsetY * 0.3, -0.5, 0.7);

  if (berth.id === 'slip-a-bow') {
    const throatX = -7.25 + clamp(upwindOffsetX * 0.45, -0.45, 0.45);
    const berthTargetX = -7.25 + clamp(upwindOffsetX * 0.3, -0.35, 0.35);
    const berthTargetY = -11.6;

    const stagingWp = { x: throatX, y: fairwayLaneY, label: 'Fairway Staging A' };
    const throatWp = { x: throatX, y: -4.2, label: 'Slip A Throat Gate' };
    const berthWp = { x: berthTargetX, y: berthTargetY, label: 'Slip A Berth Box' };
    waypoints.push(stagingWp, throatWp, berthWp);

    const alignedNorth = Math.abs(normalizeAngleRad(-Math.PI / 2 - heading)) < 0.58;

    if (px > 3.5 && Math.abs(normalizeAngleRad(Math.PI - heading)) > 0.52) {
      // Stage 6 starts at x=12 facing East (0 deg): spin Clockwise (+PI/2 -> PI)
      // while pulling West toward the wide x=8.6 basin!
      activeWaypoint = { x: 8.6, y: 0.3, label: 'East Pivot Basin' };
      desiredHeadingRad =
        heading > -Math.PI / 2 && heading < Math.PI / 3 ? Math.PI / 2 : Math.PI;
      requiresStandingPivot = true;
      pivotHoldCenter = { x: 8.6, y: 0.3 };
    } else if (Math.abs(px - throatX) > 2.3 && py > -4.5) {
      activeWaypoint = stagingWp;
      desiredHeadingRad = Math.atan2(stagingWp.y - py, stagingWp.x - px);
    } else if (py > -2.5 && !alignedNorth) {
      activeWaypoint = throatWp;
      desiredHeadingRad = -Math.PI / 2;
      requiresStandingPivot = Math.abs(normalizeAngleRad(-Math.PI / 2 - heading)) > 0.55;
      pivotHoldCenter = { x: throatX, y: Math.min(-0.5, py) };
    } else {
      activeWaypoint = berthWp;
      const dirToBerth = Math.atan2(berthWp.y - py, berthWp.x - px);
      desiredHeadingRad =
        py < -10.2 && Math.abs(px - berthTargetX) < 0.85
          ? -Math.PI / 2
          : normalizeAngleRad(-Math.PI / 2 + clamp(dirToBerth - -Math.PI / 2, -0.38, 0.38));
    }
  } else if (berth.id === 'slip-b-tight') {
    const throatX = 10.05 + clamp(upwindOffsetX * 0.45, -0.5, 0.5);
    const berthTargetX = 10.1 + clamp(upwindOffsetX * 0.3, -0.35, 0.35);
    const berthTargetY = -11.6;

    const stagingWp = { x: throatX - 0.8, y: fairwayLaneY, label: 'Fairway Staging B' };
    const throatWp = { x: throatX, y: -4.2, label: 'Slip B Throat Gate' };
    const berthWp = { x: berthTargetX, y: berthTargetY, label: 'Slip B Berth Box' };
    waypoints.push(stagingWp, throatWp, berthWp);

    const alignedNorth = Math.abs(normalizeAngleRad(-Math.PI / 2 - heading)) < 0.58;

    if (px < throatX - 2.3 && py > -4.8) {
      activeWaypoint = stagingWp;
      desiredHeadingRad = Math.atan2(stagingWp.y - py, stagingWp.x - px);
    } else if (py > -2.5 && !alignedNorth) {
      activeWaypoint = throatWp;
      desiredHeadingRad = -Math.PI / 2;
      requiresStandingPivot = Math.abs(normalizeAngleRad(-Math.PI / 2 - heading)) > 0.52;
      pivotHoldCenter = { x: throatX - 0.3, y: Math.min(-0.4, py) };
    } else {
      activeWaypoint = berthWp;
      const dirToBerth = Math.atan2(berthWp.y - py, berthWp.x - px);
      desiredHeadingRad =
        py < -10.2 && Math.abs(px - berthTargetX) < 0.85
          ? -Math.PI / 2
          : normalizeAngleRad(-Math.PI / 2 + clamp(dirToBerth - -Math.PI / 2, -0.38, 0.38));
    }
  } else if (berth.id === 'east-seawall') {
    // East Seawall pocket: x in [19.7, 25.5], y in [-6.6, 6.8], targetHeadingRad = -PI/2 (allowOppositeHeading: true)
    const pocketX = 21.8;
    const pocketY = 0.2;
    const fairwayWp = { x: 15.5, y: fairwayLaneY * 0.6, label: 'East Fairway Channel' };
    const entryWp = { x: 21.2, y: -0.4, label: 'Seawall Pocket Entry' };
    const berthWp = { x: pocketX, y: pocketY, label: 'East Seawall Berth' };
    waypoints.push(fairwayWp, entryWp, berthWp);

    if (!snap.enableTraffic && px > 8.0 && px < 15.0 && Math.abs(heading) > 0.55) {
      // Stage 5 starts at x=11.5, y=2.2 facing -74 deg: pivot clockwise in place to face East (0 deg) first!
      activeWaypoint = { x: 11.8, y: 1.0, label: 'East Channel Align' };
      desiredHeadingRad = 0;
      requiresStandingPivot = true;
      pivotHoldCenter = { x: 11.8, y: 1.0 };
    } else if (px < 14.5) {
      activeWaypoint = fairwayWp;
      desiredHeadingRad = Math.atan2(fairwayWp.y - py, fairwayWp.x - px);
    } else if (px < 19.4) {
      activeWaypoint = entryWp;
      desiredHeadingRad = Math.atan2(entryWp.y - py, entryWp.x - px);
    } else {
      activeWaypoint = berthWp;
      // For right-hand prop walk vessels (sailboat12m) entering at heading ~ 0, turning Clockwise (+PI/2 South)
      // works WITH reverse prop walk on both strokes!
      const preferSouthHeading =
        snap.vesselSpec.reversePropWalkPortN > 250 && heading > -0.35;
      desiredHeadingRad = preferSouthHeading ? Math.PI / 2 : -Math.PI / 2;
      if (Math.abs(normalizeAngleRad(desiredHeadingRad - heading)) > 0.44) {
        requiresStandingPivot = true;
        pivotHoldCenter = { x: 21.5, y: 0.2 };
      }
    }
  } else if (berth.id === 'south-med-stern') {
    // South Med Stern-In: x=-5.4, y=11.7, targetHeadingRad = -PI/2 (bow North), allowOppositeHeading = false
    const propWalkPreOffset = snap.vesselSpec.reversePropWalkPortN > 300 ? 0.35 : 0;
    const gateX = -5.4 + propWalkPreOffset + clamp(upwindOffsetX * 0.3, -0.45, 0.45);
    const berthTargetX = -5.4 + clamp(upwindOffsetX * 0.25, -0.4, 0.4);
    const berthTargetY = 10.6;

    const pivotBasinY = snap.enableTraffic ? 0.65 : 0.85;
    const galePivotOffsetX = snap.trueWindKnots >= 20 ? -2.8 : 0;
    const pivotBasinWp = {
      x: gateX + galePivotOffsetX,
      y: pivotBasinY,
      label: 'Med Pivot Basin',
    };
    const gateWp = { x: gateX + galePivotOffsetX * 0.45, y: 5.8, label: 'Med Stern Gate' };
    const berthWp = { x: berthTargetX, y: berthTargetY, label: 'South Med Berth' };
    waypoints.push(pivotBasinWp, gateWp, berthWp);

    const northHeadingErr = Math.abs(normalizeAngleRad(-Math.PI / 2 - heading));
    const alignedForMedBacking =
      heading <= (snap.enableTraffic ? -1.38 : -0.78) && heading >= -2.35;
    // On Stage 10 (enableTraffic), hold horizontal heading (~0 rad) in the center fairway lane
    // until tender-1 (Pass 1 westbound at y = 3.1) passes West of our CoG (elapsedSec ~ 16.2s);
    const tenderPass1Approaching =
      snap.enableTraffic &&
      snap.elapsedSec < 16.6 &&
      snap.movingHazards.some((hz) => hz.y > 1.5 && hz.x > px - 3.2);
    const needFairwayTransit = snap.enableTraffic
      ? (px < -10.5 || tenderPass1Approaching) && Math.abs(heading) < 0.65
      : px > -4.3 && !(alignedForMedBacking && px < -2.0);

    if (!snap.enableTraffic && px > 6.5 && Math.abs(normalizeAngleRad(Math.PI - heading)) > 0.52) {
      // Stage 7 starts at x=12 facing North (-PI/2): rotate Clockwise (-90 -> 0 -> +90 -> 180)
      // in the wide East Turn Basin (x=9.0, y=1.1) using right-hand prop walk!
      activeWaypoint = { x: 9.0, y: 1.1, label: 'East Turn Basin' };
      desiredHeadingRad =
        heading < -0.3
          ? 0
          : heading < Math.PI / 3
          ? Math.PI / 2
          : Math.PI;
      requiresStandingPivot = true;
      pivotHoldCenter = { x: 9.0, y: 1.1 };
    } else if (py < 3.0 && needFairwayTransit) {
      // Phase 1: Transit fairway to Med Pivot Basin (always keep transitWp.x ahead of px!)
      const transitWp =
        snap.enableTraffic && (px < -14.0 || tenderPass1Approaching)
          ? {
              x: px + 4.5,
              y: tenderPass1Approaching ? 0.15 : clamp(fairwayLaneY + 0.45, 0.35, 0.95),
              label: 'Fairway Traffic Lane',
            }
          : pivotBasinWp;
      activeWaypoint = transitWp;
      desiredHeadingRad = Math.atan2(transitWp.y - py, transitWp.x - px);
    } else if (
      py < 3.5 &&
      !alignedForMedBacking &&
      northHeadingErr > 0.28
    ) {
      // Phase 2: In Med Pivot Basin — rotate in place until bow is North (-PI/2)
      // Stage 7 approaches from East facing West (PI), so it rotates Clockwise (+r > 0).
      // Stage 10 approaches from West facing East (0), so it turns 90 deg Counter-Clockwise (0 -> -PI/2)
      // during the 18-second traffic-free window (t = 17s..35s)!
      activeWaypoint = pivotBasinWp;
      if (!snap.enableTraffic && snap.vesselSpec.reversePropWalkPortN > 250 && heading > -Math.PI / 3) {
        desiredHeadingRad =
          heading < Math.PI / 3
            ? Math.PI / 2
            : heading < (5 * Math.PI) / 6
            ? Math.PI
            : -Math.PI / 2;
      } else {
        desiredHeadingRad = -Math.PI / 2;
      }
      requiresStandingPivot = true;
      pivotHoldCenter = {
        x: gateX,
        y: pivotBasinY,
      };
    } else {
      // Phase 3: Back astern South (+Y) through Med Stern Gate into South Med Berth
      isSternFirstBacking = true;
      activeWaypoint = py < 5.6 ? gateWp : berthWp;
      const sternBearing = Math.atan2(activeWaypoint.y - py, activeWaypoint.x - px);
      const bowForSternCourse = normalizeAngleRad(sternBearing + Math.PI);
      const latCorrection = clamp(bowForSternCourse - -Math.PI / 2, -0.25, 0.25);
      desiredHeadingRad = normalizeAngleRad(-Math.PI / 2 + latCorrection * 0.55);
    }
  } else if (berth.id === 'south-east-spring') {
    const gateX = 8.4 + clamp(upwindOffsetX * 0.45, -0.65, 0.65);
    const berthTargetY = 11.4;
    const stagingWp = { x: gateX, y: 1.2, label: 'South-East Fairway Staging' };
    const gateWp = { x: gateX, y: 5.2, label: 'South-East Gate' };
    const berthWp = { x: gateX, y: berthTargetY, label: 'South-East Berth' };
    waypoints.push(stagingWp, gateWp, berthWp);

    const alignedSouth = Math.abs(normalizeAngleRad(Math.PI / 2 - heading)) < 0.58;

    if (py < 3.5 && Math.abs(px - gateX) > 2.2) {
      activeWaypoint = stagingWp;
      desiredHeadingRad = Math.atan2(stagingWp.y - py, stagingWp.x - px);
    } else if (py < 5.2 && !alignedSouth) {
      activeWaypoint = gateWp;
      desiredHeadingRad = Math.PI / 2;
      requiresStandingPivot = Math.abs(normalizeAngleRad(Math.PI / 2 - heading)) > 0.55;
      pivotHoldCenter = { x: gateX, y: 1.2 };
    } else {
      activeWaypoint = berthWp;
      const dirToBerth = Math.atan2(berthWp.y - py, berthWp.x - px);
      desiredHeadingRad = normalizeAngleRad(
        Math.PI / 2 + clamp(dirToBerth - Math.PI / 2, -0.35, 0.35)
      );
    }
  } else {
    const berthWp = { x: berth.x, y: berth.y, label: berth.name };
    waypoints.push(berthWp);
    activeWaypoint = berthWp;
    desiredHeadingRad = targetHeadingRad;
  }

  const dxWp = activeWaypoint.x - px;
  const dyWp = activeWaypoint.y - py;
  const bearingToWp = Math.atan2(dyWp, dxWp);
  const travelAxisRad = isSternFirstBacking ? normalizeAngleRad(heading + Math.PI) : heading;

  const headingErrorToDesiredRad = normalizeAngleRad(desiredHeadingRad - heading);
  const travelCourseErrorRad = normalizeAngleRad(bearingToWp - travelAxisRad);
  const distToBerthCenterM = Math.hypot(berth.x - px, berth.y - py);

  return {
    activeWaypoint,
    allWaypoints: waypoints,
    desiredHeadingRad,
    isSternFirstBacking,
    requiresStandingPivot,
    pivotHoldCenter,
    distToBerthCenterM,
    headingErrorToDesiredRad,
    travelCourseErrorRad,
  };
}

function pointToBoxDistance(
  wx: number,
  wy: number,
  cx: number,
  cy: number,
  width: number,
  height: number
): number {
  const dx = Math.max(Math.abs(wx - cx) - width * 0.5, 0);
  const dy = Math.max(Math.abs(wy - cy) - height * 0.5, 0);
  return Math.hypot(dx, dy);
}

function pointToObbDistance(
  wx: number,
  wy: number,
  ox: number,
  oy: number,
  headingRad: number,
  halfLen: number,
  halfBeam: number
): number {
  const relX = wx - ox;
  const relY = wy - oy;
  const cosH = Math.cos(headingRad);
  const sinH = Math.sin(headingRad);
  const localX = relX * cosH + relY * sinH;
  const localY = -relX * sinH + relY * cosH;
  const dx = Math.max(Math.abs(localX) - halfLen, 0);
  const dy = Math.max(Math.abs(localY) - halfBeam, 0);
  return Math.hypot(dx, dy);
}

/**
 * Evaluates exact perimeter clearances around the vessel hull at any arbitrary pose (px, py, headingRad)
 * against all docks, pilings, moored vessels, and optional moving hazards in the marina.
 */
export function computePoseClearances(
  vesselId: SimulationSnapshot['vesselSpec']['id'],
  px: number,
  py: number,
  headingRad: number,
  marina: MarinaLayout,
  isSternFirstBacking = false,
  movingHazards: ReadonlyArray<MovingHazard> = []
): HullClearanceSummary {
  const spec = VESSEL_SPECS[vesselId];
  const cosH = Math.cos(headingRad);
  const sinH = Math.sin(headingRad);
  const bodySamplePoints = HULL_SAMPLE_POINTS_CACHE[vesselId];

  let minFwd = 20;
  let minStern = 20;
  let minPort = 20;
  let minStbd = 20;
  let minOverall = 20;
  let closestLabel = 'Open Water';

  // 1. Check continuous boat OBB against all circular pilings and moving hazards (zero gaps along 12m hull sides!)
  const boatHalfLen = spec.loa * 0.5;
  const boatHalfBeam = spec.beam * 0.54;

  for (const piling of marina.pilings) {
    const relX = piling.x - px;
    const relY = piling.y - py;
    const localX = relX * cosH + relY * sinH;
    const localY = -relX * sinH + relY * cosH;
    const dx = Math.max(Math.abs(localX) - boatHalfLen, 0);
    const dy = Math.max(Math.abs(localY) - boatHalfBeam, 0);
    const d = Math.max(0, Math.hypot(dx, dy) - piling.radius);

    if (d < minOverall) {
      minOverall = d;
      closestLabel = piling.label;
    }
    if (localX > boatHalfLen * 0.35) minFwd = Math.min(minFwd, d);
    else if (localX < -boatHalfLen * 0.35) minStern = Math.min(minStern, d);
    if (localY < 0) minPort = Math.min(minPort, d);
    else minStbd = Math.min(minStbd, d);
  }

  for (const hz of movingHazards) {
    const relX = hz.x - px;
    const relY = hz.y - py;
    const localX = relX * cosH + relY * sinH;
    const localY = -relX * sinH + relY * cosH;
    const dx = Math.max(Math.abs(localX) - boatHalfLen, 0);
    const dy = Math.max(Math.abs(localY) - boatHalfBeam, 0);
    const d = Math.max(0, Math.hypot(dx, dy) - hz.radius);

    if (d < minOverall) {
      minOverall = d;
      closestLabel = hz.label;
    }
    if (localX > 0) minFwd = Math.min(minFwd, d);
    else minStern = Math.min(minStern, d);
    if (localY < 0) minPort = Math.min(minPort, d);
    else minStbd = Math.min(minStbd, d);
  }

  // 2. Check hull sample vertices against rectangular docks and moored vessels
  for (const pt of bodySamplePoints) {
    const wx = px + pt.lx * cosH - pt.ly * sinH;
    const wy = py + pt.lx * sinH + pt.ly * cosH;

    let bestPtDist = 20;
    let bestPtLabel = 'Open Water';

    for (const dock of marina.docks) {
      const d = pointToBoxDistance(wx, wy, dock.cx, dock.cy, dock.width, dock.height);
      if (d < bestPtDist) {
        bestPtDist = d;
        bestPtLabel = dock.label;
      }
    }

    for (const moored of marina.mooredBoats) {
      const mSpec = VESSEL_SPECS[moored.vesselId];
      const d = pointToObbDistance(
        wx,
        wy,
        moored.x,
        moored.y,
        moored.headingRad,
        mSpec.loa * 0.48,
        mSpec.beam * 0.54
      );
      if (d < bestPtDist) {
        bestPtDist = d;
        bestPtLabel = moored.name;
      }
    }

    if (bestPtDist < minOverall) {
      minOverall = bestPtDist;
      closestLabel = bestPtLabel;
    }
    if (pt.sector === 'fwd') minFwd = Math.min(minFwd, bestPtDist);
    if (pt.sector === 'stern') minStern = Math.min(minStern, bestPtDist);
    if (pt.sector === 'port') minPort = Math.min(minPort, bestPtDist);
    if (pt.sector === 'stbd') minStbd = Math.min(minStbd, bestPtDist);
  }

  return {
    forwardOrSternM: isSternFirstBacking ? minStern : minFwd,
    portM: minPort,
    starboardM: minStbd,
    minOverallM: minOverall,
    closestObstacleLabel: closestLabel,
  };
}

/**
 * Extracts the complete 20-Dimensional normalized feature vector x in [-1, 1]^20
 * alongside structured corridor, clearance, and traffic summaries.
 */
export function extractSkipperFeatures(
  snap: SimulationSnapshot,
  marina: MarinaLayout
): ExtractedFeatureBundle {
  const berth = snap.targetBerth ?? marina.berths['slip-a-bow'];
  const traffic = computeTrafficThreat(snap);
  const corridor = computeCorridorPlan(snap, marina, traffic);
  const clearances = computePoseClearances(
    snap.vesselSpec.id,
    snap.playerX,
    snap.playerY,
    snap.playerHeadingRad,
    marina,
    corridor.isSternFirstBacking,
    snap.movingHazards
  );

  const entryAxisRad = corridor.isSternFirstBacking
    ? normalizeAngleRad(berth.targetHeadingRad + Math.PI)
    : corridor.desiredHeadingRad;
  const cosB = Math.cos(entryAxisRad);
  const sinB = Math.sin(entryAxisRad);
  const dxBerth = berth.x - snap.playerX;
  const dyBerth = berth.y - snap.playerY;

  const berthLongErrM = dxBerth * cosB + dyBerth * sinB;
  const berthLatErrM = -dxBerth * sinB + dyBerth * cosB;

  const wpDistM = Math.hypot(
    corridor.activeWaypoint.x - snap.playerX,
    corridor.activeWaypoint.y - snap.playerY
  );

  const uMs = snap.telemetry.surgeKnots * 0.514444;
  const vMs = snap.telemetry.swayKnots * 0.514444;
  const rRadSec = snap.telemetry.yawRateRadSec ?? 0;

  const maxBrakeDecelMs2 =
    snap.vesselSpec.maxReverseThrustN /
    (snap.vesselSpec.massKg + snap.vesselSpec.addedMassSurgeKg);
  const travelSpeedMs = corridor.isSternFirstBacking ? -uMs : uMs;
  const brakingDistM =
    travelSpeedMs > 0 ? (travelSpeedMs * travelSpeedMs) / (2 * Math.max(0.2, maxBrakeDecelMs2)) : 0;
  const stoppingMarginM = berthLongErrM - brakingDistM;

  const windLongNorm = clamp(
    snap.telemetry.windForceBody.x / Math.max(300, snap.vesselSpec.maxReverseThrustN),
    -1,
    1
  );
  const windLatNorm = clamp(
    snap.telemetry.windForceBody.y / Math.max(350, snap.vesselSpec.massKg * 0.45),
    -1,
    1
  );

  const hasBowThrusterFlag = snap.vesselSpec.bowThrusterMaxN > 0 ? 1.0 : -1.0;
  const propWalkFactorNorm = clamp(snap.vesselSpec.reversePropWalkPortN / 900, 0, 1);
  const rudderWashAuthority = clamp(
    Math.abs(uMs) / 1.5 + Math.max(0, snap.controls.throttle) * 0.85,
    0,
    1
  );

  const effectiveTurnErrRad = corridor.requiresStandingPivot
    ? corridor.headingErrorToDesiredRad
    : corridor.travelCourseErrorRad;

  const vector: number[] = [
    Math.tanh(wpDistM / 10.0), // 0: wpDistNorm
    clamp(effectiveTurnErrRad / Math.PI, -1, 1), // 1: wpCourseErrNorm
    Math.tanh(berthLongErrM / 9.0), // 2: berthLongErrNorm
    Math.tanh(berthLatErrM / 3.5), // 3: berthLatErrNorm
    clamp(corridor.headingErrorToDesiredRad / Math.PI, -1, 1), // 4: berthHeadingErrNorm
    corridor.isSternFirstBacking ? 1.0 : -1.0, // 5: backingModeFlag
    clamp(uMs / 2.8, -1, 1), // 6: surgeNorm
    clamp(vMs / 1.2, -1, 1), // 7: swayNorm
    clamp(rRadSec / 0.75, -1, 1), // 8: yawRateNorm
    Math.tanh(stoppingMarginM / 3.5), // 9: stoppingMarginNorm
    windLongNorm, // 10: windBodyLongNorm
    windLatNorm, // 11: windBodyLatNorm
    hasBowThrusterFlag, // 12: hasBowThrusterFlag
    propWalkFactorNorm, // 13: propWalkFactorNorm
    rudderWashAuthority, // 14: rudderWashAuthority
    Math.tanh(clearances.forwardOrSternM / 3.5), // 15: hullClearanceFwdNorm
    Math.tanh(clearances.portM / 3.0), // 16: hullClearancePortNorm
    Math.tanh(clearances.starboardM / 3.0), // 17: hullClearanceStbdNorm
    clamp(traffic.threatScore, 0, 1), // 18: trafficThreatNorm
    snap.dockingChecklist.readyToMoor ? 1.0 : -1.0, // 19: readyToMoorFlag
  ];

  return {
    vector,
    corridor,
    clearances,
    traffic,
  };
}
