import { VesselId, VESSEL_SPECS, getVesselFenderMounts, FenderMount } from './vessels';

export interface DockSegment {
  id: string;
  label: string;
  /** Center X (m) */
  cx: number;
  /** Center Y (m) */
  cy: number;
  /** Full width along X (m) */
  width: number;
  /** Full height along Y (m) */
  height: number;
}

export interface MarinaPiling {
  id: string;
  label: string;
  x: number;
  y: number;
  radius: number;
}

export interface DockCleat {
  id: string;
  label: string;
  x: number;
  y: number;
}

export interface MooredBoatConfig {
  id: string;
  name: string;
  vesselId: VesselId;
  x: number;
  y: number;
  /** Heading in radians (0 = East/+X, -PI/2 = North/-Y, +PI/2 = South/+Y) */
  headingRad: number;
  hullColor: string;
  /** Wind shadow down-wind radius (m) where wind speed drops behind high superstructure */
  windShadowRadiusM: number;
  fenders: FenderMount[];
}

export interface TargetBerth {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  length: number;
  /** Ideal boat heading in radians (either +headingRad or opposite if reversible, or exact for stern-in/bow-in) */
  targetHeadingRad: number;
  allowOppositeHeading: boolean;
}

export interface MovingHazard {
  id: string;
  label: string;
  kind: 'paddleboard' | 'tender';
  x: number;
  y: number;
  headingRad: number;
  radius: number;
  speedMs: number;
  minX: number;
  maxX: number;
}

export interface MarinaLayout {
  basinHalfWidthM: number;
  basinHalfHeightM: number;
  docks: DockSegment[];
  pilings: MarinaPiling[];
  cleats: DockCleat[];
  mooredBoats: MooredBoatConfig[];
  berths: Record<string, TargetBerth>;
}

export function createMarinaLayout(): MarinaLayout {
  const docks: DockSegment[] = [
    // North Main Walkway Pier
    { id: 'north-walkway', label: 'North Main Pier', cx: -2, cy: -18.5, width: 56, height: 2.2 },
    // North Finger Piers (creating Slips N1, N2, N3)
    { id: 'finger-w', label: 'West Finger Pier', cx: -24, cy: -12.0, width: 1.4, height: 11.0 },
    { id: 'finger-1', label: 'Slip A Finger Pier', cx: -11.5, cy: -12.0, width: 1.3, height: 11.0 },
    { id: 'finger-2', label: 'Slip B Finger Pier', cx: 1.0, cy: -12.0, width: 1.3, height: 11.0 },
    { id: 'finger-3', label: 'Slip C Finger Pier', cx: 14.5, cy: -12.0, width: 1.4, height: 11.5 },

    // East Side-Tie Seawall Quay
    { id: 'east-quay', label: 'East Seawall Quay', cx: 26.8, cy: 1.5, width: 2.6, height: 37.8 },

    // South Mediterranean Mooring Quay
    { id: 'south-quay', label: 'South Med-Moor Quay', cx: -1.5, cy: 19.2, width: 57.0, height: 2.4 },
    { id: 'south-finger-w', label: 'South West Jetty', cx: -22.5, cy: 12.2, width: 1.5, height: 11.6 },
  ];

  const pilings: MarinaPiling[] = [
    { id: 'p-n1', label: 'Slip A Outer Piling', x: -11.5, y: -6.1, radius: 0.36 },
    { id: 'p-n2', label: 'Slip B Outer Piling', x: 1.0, y: -6.1, radius: 0.36 },
    { id: 'p-n3', label: 'Slip C Outer Piling', x: 14.5, y: -5.9, radius: 0.38 },
    { id: 'p-s1', label: 'Med Berth West Piling', x: -11.0, y: 6.2, radius: 0.4 },
    { id: 'p-s2', label: 'Med Berth East Piling', x: 1.5, y: 6.2, radius: 0.4 },
    { id: 'p-s3', label: 'Channel Marker Piling', x: 13.8, y: 6.2, radius: 0.4 },
  ];

  const cleats: DockCleat[] = [
    // North Slip A & B & C Finger Cleats
    { id: 'cl-a-w-outer', label: 'Slip A West Outer Cleat', x: -10.85, y: -7.8 },
    { id: 'cl-a-w-inner', label: 'Slip A West Inner Cleat', x: -10.85, y: -14.2 },
    { id: 'cl-a-n', label: 'Slip A Bow Cleat', x: -5.2, y: -17.3 },
    { id: 'cl-b-w-outer', label: 'Slip B Port Outer Cleat', x: 0.35, y: -7.8 },
    { id: 'cl-b-w-inner', label: 'Slip B Port Inner Cleat', x: 0.35, y: -14.2 },
    { id: 'cl-b-e-outer', label: 'Slip B Stbd Outer Cleat', x: 1.65, y: -7.8 },
    { id: 'cl-b-e-inner', label: 'Slip B Stbd Inner Cleat', x: 1.65, y: -14.2 },
    { id: 'cl-c-w-outer', label: 'Slip C Port Outer Cleat', x: 13.8, y: -7.8 },
    { id: 'cl-c-w-inner', label: 'Slip C Port Inner Cleat', x: 13.8, y: -14.2 },

    // East Seawall Side-Tie Cleats
    { id: 'cl-east-n', label: 'Seawall North Spring Cleat', x: 25.4, y: -5.2 },
    { id: 'cl-east-mid', label: 'Seawall Midships Cleat', x: 25.4, y: 0.2 },
    { id: 'cl-east-s', label: 'Seawall South Spring Cleat', x: 25.4, y: 5.6 },

    // South Med-Moor Stern Cleats
    { id: 'cl-med-w', label: 'Med Quay Port Stern Cleat', x: -7.4, y: 17.9 },
    { id: 'cl-med-c', label: 'Med Quay Center Cleat', x: -4.8, y: 17.9 },
    { id: 'cl-med-e', label: 'Med Quay Stbd Stern Cleat', x: -2.2, y: 17.9 },
    { id: 'cl-med2-w', label: 'East Med Port Cleat', x: 5.2, y: 17.9 },
    { id: 'cl-med2-e', label: 'East Med Stbd Cleat', x: 9.8, y: 17.9 },
  ];

  // Every moored neighbor vessel has its own hull AND 2 port + 2 starboard physical fenders!
  const mooredBoats: MooredBoatConfig[] = [
    {
      id: 'moored-west-runabout',
      name: 'M/V Osprey (7m)',
      vesselId: 'outboard7m',
      x: -15.4,
      y: -12.6,
      headingRad: -Math.PI / 2,
      hullColor: '#264653',
      windShadowRadiusM: 5.5,
      fenders: getVesselFenderMounts(VESSEL_SPECS.outboard7m, 'midships'),
    },
    {
      id: 'moored-slip-b-cruiser',
      name: 'M/Y Solaris (8m)',
      vesselId: 'cruiser8m',
      x: 4.55,
      y: -12.2,
      headingRad: Math.PI / 2,
      hullColor: '#457b9d',
      windShadowRadiusM: 8.5,
      fenders: getVesselFenderMounts(VESSEL_SPECS.cruiser8m, 'midships'),
    },
    {
      id: 'moored-east-north',
      name: 'M/Y Azure (8m)',
      vesselId: 'cruiser8m',
      x: 23.5,
      y: -10.8,
      headingRad: Math.PI / 2,
      hullColor: '#3d5a80',
      windShadowRadiusM: 8.5,
      fenders: getVesselFenderMounts(VESSEL_SPECS.cruiser8m, 'midships'),
    },
    {
      id: 'moored-east-south',
      name: 'S/V Zephyr (12m)',
      vesselId: 'sailboat12m',
      x: 23.0,
      y: 11.4,
      headingRad: -Math.PI / 2,
      hullColor: '#6d2e46',
      windShadowRadiusM: 12.5,
      fenders: getVesselFenderMounts(VESSEL_SPECS.sailboat12m, 'midships'),
    },
    {
      id: 'moored-south-west-yacht',
      name: 'S/Y Mistral (12m)',
      vesselId: 'sailboat12m',
      x: -16.2,
      y: 11.8,
      headingRad: -Math.PI / 2,
      hullColor: '#2b2d42',
      windShadowRadiusM: 13.0,
      fenders: getVesselFenderMounts(VESSEL_SPECS.sailboat12m, 'midships'),
    },
    {
      id: 'moored-south-east-cruiser',
      name: 'M/Y Valhalla (8m)',
      vesselId: 'cruiser8m',
      x: 17.8,
      y: 13.0,
      headingRad: -Math.PI / 2,
      hullColor: '#5c6b73',
      windShadowRadiusM: 8.5,
      fenders: getVesselFenderMounts(VESSEL_SPECS.cruiser8m, 'midships'),
    },
  ];

  const berths: Record<string, TargetBerth> = {
    'slip-a-bow': {
      id: 'slip-a-bow',
      name: 'North Slip A (Alongside West Finger Pier)',
      x: -7.25,
      y: -12.0,
      width: 7.2,
      length: 11.4,
      targetHeadingRad: -Math.PI / 2,
      allowOppositeHeading: true,
    },
    'slip-b-tight': {
      id: 'slip-b-tight',
      name: 'North Slip B — Beside M/Y Solaris',
      x: 10.1,
      y: -12.0,
      width: 7.4,
      length: 11.4,
      targetHeadingRad: -Math.PI / 2,
      allowOppositeHeading: true,
    },
    'east-seawall': {
      id: 'east-seawall',
      name: 'East Seawall Pocket (Parallel Side-Tie)',
      x: 22.6,
      y: 0.1,
      width: 5.8,
      length: 13.4,
      targetHeadingRad: -Math.PI / 2,
      allowOppositeHeading: true,
    },
    'south-med-stern': {
      id: 'south-med-stern',
      name: 'South Med Quay — Beside S/Y Mistral (Stern-In)',
      x: -5.4,
      y: 11.7,
      width: 8.4,
      length: 12.6,
      targetHeadingRad: -Math.PI / 2,
      allowOppositeHeading: false,
    },
    'south-east-spring': {
      id: 'south-east-spring',
      name: 'South-East Berth — Next to M/Y Valhalla',
      x: 8.4,
      y: 11.9,
      width: 8.2,
      length: 12.2,
      targetHeadingRad: -Math.PI / 2,
      allowOppositeHeading: true,
    },
  };

  return {
    basinHalfWidthM: 33.0,
    basinHalfHeightM: 23.0,
    docks,
    pilings,
    cleats,
    mooredBoats,
    berths,
  };
}
