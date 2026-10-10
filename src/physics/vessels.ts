export type VesselId = 'outboard7m' | 'cruiser8m' | 'sailboat12m';

export type FenderRigMode = 'bow' | 'midships' | 'quarter';

export type FenderSlotId = 'port-fwd' | 'port-aft' | 'stbd-fwd' | 'stbd-aft';

export interface FenderMount {
  slot: FenderSlotId;
  /** Longitudinal position in hull-local meters (+ forward of midships, - aft) */
  x: number;
  /** Lateral center in hull-local meters (- port, + starboard) */
  y: number;
  /** Physical capsule half-length along hull sheerline (m) */
  halfLength: number;
  /** Physical cylinder radius (m) */
  radius: number;
}

export interface CleatMount {
  id: 'bow' | 'midships-port' | 'midships-stbd' | 'stern-port' | 'stern-stbd';
  x: number;
  y: number;
}

export interface VesselSpec {
  id: VesselId;
  name: string;
  shortName: string;
  category: string;
  description: string;
  tip: string;
  /** Length overall (m) */
  loa: number;
  /** Maximum beam (m) */
  beam: number;
  /** Rigid-body displacement mass (kg) */
  massKg: number;
  /** Surge hydrodynamic added mass (kg) */
  addedMassSurgeKg: number;
  /** Sway hydrodynamic added mass (kg) — large on deep-keel sailboat */
  addedMassSwayKg: number;
  /** Rigid-body + added yaw moment of inertia (kg * m^2) */
  yawInertiaKgM2: number;
  /** Propulsion layout */
  propulsion: 'outboard' | 'inboard-diesel';
  /** Maximum forward thrust (N) */
  maxForwardThrustN: number;
  /** Maximum reverse thrust (N) */
  maxReverseThrustN: number;
  /** Max helm angle (degrees): outboard nozzle or spade rudder */
  maxHelmDeg: number;
  /** Longitudinal station of propeller/rudder (m, negative = aft) */
  propPosX: number;
  /** Whether vessel has a tunnel bow thruster */
  hasBowThruster: boolean;
  /** Maximum lateral bow thruster thrust (N) */
  bowThrusterMaxN: number;
  /** Longitudinal station of bow thruster tunnel (m, positive = forward) */
  bowThrusterPosX: number;
  /** Speed (knots) at which tunnel cross-flow halves bow thruster output */
  thrusterCrossflowHalfKnots: number;
  /**
   * Right-hand propeller walk lateral stern force in reverse (N at full astern).
   * Negative = pulls stern to PORT (-Y in body frame), kicking bow to STARBOARD (+r).
   */
  reversePropWalkPortN: number;
  /** Subtle forward prop walk to starboard at stern (N) */
  forwardPropWalkStbdN: number;
  /** Fraction of forward prop slipstream washing directly across rudder (0..1) */
  propWashRudderCoupling: number;
  /** Linear & quadratic surge drag coefficients */
  surgeDragLinear: number;
  surgeDragQuad: number;
  /** Multi-station lateral resistance (bow, keel/midships, stern) */
  swayDragLinear: number;
  swayDragQuad: number;
  /** Extra forward pivot bias when moving ahead (m forward of midships) */
  forwardPivotBiasM: number;
  /** Extra aft pivot shift when moving astern (m aft of midships) */
  reversePivotBiasM: number;
  /** Rotational water damping */
  yawDragLinear: number;
  yawDragQuad: number;
  /** Aerodynamic lateral windage area (m^2) for crosswind drift */
  lateralWindAreaM2: number;
  /** Aerodynamic frontal windage area (m^2) */
  frontalWindAreaM2: number;
  /** Center of wind effort forward offset (m) — positive causes bow to blow off wind */
  windCenterOffsetX: number;
  /** Visual roll stiffness for wind gusts & turns */
  heelComplianceDegPerKN: number;
  /** Primary & accent hull colors */
  hullColor: string;
  deckColor: string;
  trimColor: string;
  /** Normalized hull polygon vertices [xFrac (-0.5..0.5), yFrac (-0.5..0.5)] clockwise */
  hullProfile: ReadonlyArray<readonly [number, number]>;
}

export const VESSEL_SPECS: Record<VesselId, VesselSpec> = {
  outboard7m: {
    id: 'outboard7m',
    name: '7m Outboard Runabout',
    shortName: '7m Outboard',
    category: '200 HP Vectored Outboard · No Thruster',
    description:
      'Light planing center-console with a 200 HP steerable outboard. Pivots briskly under throttle bursts, but loses steering authority in Neutral and drifts quickly in crosswinds.',
    tip: 'Use short forward/reverse throttle blips with the helm turned first — in Neutral, the hull has minimal rudder grip!',
    loa: 7.0,
    beam: 2.45,
    massKg: 1450,
    addedMassSurgeKg: 210,
    addedMassSwayKg: 980,
    yawInertiaKgM2: 6400,
    propulsion: 'outboard',
    maxForwardThrustN: 2950,
    maxReverseThrustN: 2100,
    maxHelmDeg: 32,
    propPosX: -3.45,
    hasBowThruster: false,
    bowThrusterMaxN: 0,
    bowThrusterPosX: 0,
    thrusterCrossflowHalfKnots: 3.5,
    reversePropWalkPortN: 65,
    forwardPropWalkStbdN: 25,
    propWashRudderCoupling: 0,
    surgeDragLinear: 165,
    surgeDragQuad: 95,
    swayDragLinear: 680,
    swayDragQuad: 760,
    forwardPivotBiasM: 1.45,
    reversePivotBiasM: -1.15,
    yawDragLinear: 2350,
    yawDragQuad: 1950,
    lateralWindAreaM2: 7.8,
    frontalWindAreaM2: 3.6,
    windCenterOffsetX: 0.55,
    heelComplianceDegPerKN: 3.2,
    hullColor: '#0f4c5c',
    deckColor: '#f4f1de',
    trimColor: '#e07a5f',
    hullProfile: [
      [0.5, 0.0],
      [0.37, 0.27],
      [0.16, 0.45],
      [-0.12, 0.49],
      [-0.44, 0.46],
      [-0.5, 0.36],
      [-0.5, -0.36],
      [-0.44, -0.46],
      [-0.12, -0.49],
      [0.16, -0.45],
      [0.37, -0.27],
    ],
  },

  cruiser8m: {
    id: 'cruiser8m',
    name: '8m Cabin Cruiser + Bow Thruster',
    shortName: '8m Cruiser + BT',
    category: '250 HP Outboard · Tunnel Bow Thruster',
    description:
      'Express weekender with high forward cabin windage, steerable 250 HP outboard, and proportional electric bow thruster for walking sideways into tight crosswind slips.',
    tip: 'Combine opposite helm + light throttle with the Bow Thruster (Q/E or rocker) to crab pure sideways against wind!',
    loa: 8.2,
    beam: 2.9,
    massKg: 3200,
    addedMassSurgeKg: 480,
    addedMassSwayKg: 2450,
    yawInertiaKgM2: 19800,
    propulsion: 'outboard',
    maxForwardThrustN: 4600,
    maxReverseThrustN: 3300,
    maxHelmDeg: 30,
    propPosX: -4.05,
    hasBowThruster: true,
    bowThrusterMaxN: 1550,
    bowThrusterPosX: 3.25,
    thrusterCrossflowHalfKnots: 3.6,
    reversePropWalkPortN: 110,
    forwardPropWalkStbdN: 40,
    propWashRudderCoupling: 0,
    surgeDragLinear: 295,
    surgeDragQuad: 175,
    swayDragLinear: 1450,
    swayDragQuad: 1520,
    forwardPivotBiasM: 1.85,
    reversePivotBiasM: -1.35,
    yawDragLinear: 6400,
    yawDragQuad: 5200,
    lateralWindAreaM2: 14.6,
    frontalWindAreaM2: 6.4,
    windCenterOffsetX: 0.92,
    heelComplianceDegPerKN: 2.4,
    hullColor: '#1d3557',
    deckColor: '#f8f9fa',
    trimColor: '#d4a373',
    hullProfile: [
      [0.5, 0.0],
      [0.39, 0.31],
      [0.18, 0.47],
      [-0.1, 0.5],
      [-0.45, 0.47],
      [-0.5, 0.39],
      [-0.5, -0.39],
      [-0.45, -0.47],
      [-0.1, -0.5],
      [0.18, -0.47],
      [0.39, -0.31],
    ],
  },

  sailboat12m: {
    id: 'sailboat12m',
    name: '12m Auxiliary Sailboat',
    shortName: '12m Sailboat',
    category: '40 HP Inboard · Fin Keel · Port Prop Walk',
    description:
      '8.6-ton cruiser-racer with deep fin keel, spade rudder, high mast windage, forward prop-wash kicking over rudder, and pronounced right-hand prop walk pulling the stern to PORT in reverse.',
    tip: 'Use Forward bursts over full rudder ("prop kicking") to pivot on a dime, and use Reverse prop walk to swing your stern cleanly to PORT!',
    loa: 12.2,
    beam: 3.85,
    massKg: 8600,
    addedMassSurgeKg: 920,
    addedMassSwayKg: 9400,
    yawInertiaKgM2: 96000,
    propulsion: 'inboard-diesel',
    maxForwardThrustN: 5600,
    maxReverseThrustN: 4300,
    maxHelmDeg: 35,
    propPosX: -5.35,
    hasBowThruster: false,
    bowThrusterMaxN: 0,
    bowThrusterPosX: 0,
    thrusterCrossflowHalfKnots: 3.5,
    reversePropWalkPortN: 1420,
    forwardPropWalkStbdN: 190,
    propWashRudderCoupling: 0.72,
    surgeDragLinear: 440,
    surgeDragQuad: 270,
    swayDragLinear: 6200,
    swayDragQuad: 5800,
    forwardPivotBiasM: 2.65,
    reversePivotBiasM: -2.15,
    yawDragLinear: 29500,
    yawDragQuad: 26000,
    lateralWindAreaM2: 24.5,
    frontalWindAreaM2: 9.2,
    windCenterOffsetX: 1.55,
    heelComplianceDegPerKN: 5.4,
    hullColor: '#1b4332',
    deckColor: '#ede0d4',
    trimColor: '#ddb892',
    hullProfile: [
      [0.5, 0.0],
      [0.36, 0.25],
      [0.15, 0.44],
      [-0.06, 0.5],
      [-0.28, 0.46],
      [-0.46, 0.37],
      [-0.5, 0.28],
      [-0.5, -0.28],
      [-0.46, -0.37],
      [-0.28, -0.46],
      [-0.06, -0.5],
      [0.15, -0.44],
      [0.36, -0.25],
    ],
  },
};

export const VALID_VESSEL_IDS: ReadonlyArray<VesselId> = ['outboard7m', 'cruiser8m', 'sailboat12m'];
export const VALID_FENDER_RIGS: ReadonlyArray<FenderRigMode> = ['bow', 'midships', 'quarter'];

export function sanitizeVesselId(input: unknown): VesselId {
  if (typeof input === 'string' && (VALID_VESSEL_IDS as readonly string[]).includes(input)) {
    return input as VesselId;
  }
  return 'outboard7m';
}

export function sanitizeFenderRig(input: unknown): FenderRigMode {
  if (typeof input === 'string' && (VALID_FENDER_RIGS as readonly string[]).includes(input)) {
    return input as FenderRigMode;
  }
  return 'midships';
}

/** Interpolates hull half-beam at longitudinal fraction xFrac (-0.5..0.5). */
export function halfBeamAtFraction(spec: VesselSpec, xFrac: number): number {
  const clamped = Math.max(-0.5, Math.min(0.5, xFrac));
  // Extract upper (starboard >= 0) profile points sorted descending by xFrac
  const stbd = spec.hullProfile.filter((p) => p[1] >= 0).sort((a, b) => b[0] - a[0]);
  for (let i = 0; i < stbd.length - 1; i++) {
    const [x0, y0] = stbd[i];
    const [x1, y1] = stbd[i + 1];
    if (clamped <= x0 && clamped >= x1) {
      const t = x0 === x1 ? 0 : (x0 - clamped) / (x0 - x1);
      return (y0 + t * (y1 - y0)) * spec.beam;
    }
  }
  return 0.42 * spec.beam;
}

/**
 * Returns the 4 physical side fenders (2 on port, 2 on starboard) for a given hull & rig mode.
 * Each fender protrudes outboard past the local gunwale beam so parallel side-to-side or
 * side-to-dock touches hit the rubber fender BEFORE bare fiberglass touches, while bow stems,
 * transom corners, or steep-angle contacts between fenders expose bare fiberglass!
 */
export function getVesselFenderMounts(spec: VesselSpec, rigMode: FenderRigMode): FenderMount[] {
  const stationsByMode: Record<FenderRigMode, [number, number]> = {
    bow: [0.33, 0.04],
    midships: [0.22, -0.2],
    quarter: [0.02, -0.34],
  };
  const [fwdFrac, aftFrac] = stationsByMode[rigMode];
  const radius = spec.loa >= 11 ? 0.27 : 0.22;
  const halfLength = spec.loa >= 11 ? 0.48 : 0.38;

  const yFwd = halfBeamAtFraction(spec, fwdFrac) + radius * 0.56;
  const yAft = halfBeamAtFraction(spec, aftFrac) + radius * 0.56;

  return [
    { slot: 'port-fwd', x: fwdFrac * spec.loa, y: -yFwd, halfLength, radius },
    { slot: 'port-aft', x: aftFrac * spec.loa, y: -yAft, halfLength, radius },
    { slot: 'stbd-fwd', x: fwdFrac * spec.loa, y: yFwd, halfLength, radius },
    { slot: 'stbd-aft', x: aftFrac * spec.loa, y: yAft, halfLength, radius },
  ];
}

export function getVesselCleatMounts(spec: VesselSpec): CleatMount[] {
  const midY = halfBeamAtFraction(spec, 0.04) * 0.92;
  const sternY = halfBeamAtFraction(spec, -0.44) * 0.9;
  return [
    { id: 'bow', x: spec.loa * 0.45, y: 0 },
    { id: 'midships-port', x: spec.loa * 0.04, y: -midY },
    { id: 'midships-stbd', x: spec.loa * 0.04, y: midY },
    { id: 'stern-port', x: -spec.loa * 0.44, y: -sternY },
    { id: 'stern-stbd', x: -spec.loa * 0.44, y: sternY },
  ];
}

export function getHullPolygonVertices(spec: VesselSpec): Float32Array {
  const coords = new Float32Array(spec.hullProfile.length * 2);
  spec.hullProfile.forEach(([xFrac, yFrac], idx) => {
    coords[idx * 2] = xFrac * spec.loa;
    coords[idx * 2 + 1] = yFrac * spec.beam;
  });
  return coords;
}
