import { FenderRigMode, VesselId } from './vessels';

export interface CampaignStage {
  stageNumber: number;
  id: string;
  title: string;
  subtitle: string;
  vesselId: VesselId;
  berthId: string;
  recommendedRig: FenderRigMode;
  trueWindKnots: number;
  windFromDeg: number;
  gustiness: number;
  enableTraffic: boolean;
  startX: number;
  startY: number;
  startHeadingRad: number;
  briefing: string;
}

export const CAMPAIGN_STAGES: ReadonlyArray<CampaignStage> = [
  {
    stageNumber: 1,
    id: 'stage-1-calm-arrival',
    title: '1. Calm Morning Arrival',
    subtitle: '7m Outboard · 2 kn North · North Slip A (Bow-In)',
    vesselId: 'outboard7m',
    berthId: 'slip-a-bow',
    recommendedRig: 'midships',
    trueWindKnots: 2,
    windFromDeg: 0,
    gustiness: 0.05,
    enableTraffic: false,
    startX: -22,
    startY: 0.5,
    startHeadingRad: 0,
    briefing:
      'Ease down the main fairway, turn left into Slip A, and click into Reverse briefly to stop cleanly on your side fenders.',
  },
  {
    stageNumber: 2,
    id: 'stage-2-crosswind-slip',
    title: '2. Crosswind Fairway Turn',
    subtitle: '7m Outboard · 10 kn West Crosswind · Tight Slip B',
    vesselId: 'outboard7m',
    berthId: 'slip-b-tight',
    recommendedRig: 'bow',
    trueWindKnots: 10,
    windFromDeg: 270,
    gustiness: 0.14,
    enableTraffic: false,
    startX: -18,
    startY: -0.5,
    startHeadingRad: 0,
    briefing:
      'A 10 kn west breeze pushes you toward moored M/Y Solaris! Set Bow-Heavy fenders and turn up-wind of the slip entrance.',
  },
  {
    stageNumber: 3,
    id: 'stage-3-thruster-crab',
    title: '3. Crabbing Into Tight Quarters',
    subtitle: '8m Cruiser + Thruster · 14 kn East Off-Dock Wind',
    vesselId: 'cruiser8m',
    berthId: 'slip-b-tight',
    recommendedRig: 'midships',
    trueWindKnots: 14,
    windFromDeg: 90,
    gustiness: 0.16,
    enableTraffic: false,
    startX: -16,
    startY: 1.5,
    startHeadingRad: 0,
    briefing:
      'Use your proportional Bow Thruster (Q/E or BOW rocker) alongside M/Y Solaris so your 2 starboard fenders take the kiss — never bare fiberglass!',
  },
  {
    stageNumber: 4,
    id: 'stage-4-parallel-seawall',
    title: '4. Parallel Seawall Ferry',
    subtitle: '8m Cruiser + Thruster · 16 kn West Gusts · East Pocket',
    vesselId: 'cruiser8m',
    berthId: 'east-seawall',
    recommendedRig: 'midships',
    trueWindKnots: 16,
    windFromDeg: 265,
    gustiness: 0.22,
    enableTraffic: true,
    startX: 6,
    startY: 1.0,
    startHeadingRad: -Math.PI / 2,
    briefing:
      'On-dock gusts blow straight onto the East Seawall between two yachts. Hold off with Bow Thruster & gentle reverse to kiss the seawall at < 0.8 kn!',
  },
  {
    stageNumber: 5,
    id: 'stage-5-prop-walk-101',
    title: '5. Right-Hand Prop Walk 101',
    subtitle: '12m Sailboat · 5 kn Light Air · East Seawall Port-Side',
    vesselId: 'sailboat12m',
    berthId: 'east-seawall',
    recommendedRig: 'midships',
    trueWindKnots: 5,
    windFromDeg: 350,
    gustiness: 0.08,
    enableTraffic: false,
    startX: 11.5,
    startY: 2.2,
    startHeadingRad: -Math.PI / 2 + 0.28,
    briefing:
      'Approach East Seawall at a shallow angle, shift to Neutral, then engage Reverse — watch right-hand Prop Walk pull your stern cleanly to PORT!',
  },
  {
    stageNumber: 6,
    id: 'stage-6-standing-pivot',
    title: '6. Standing Pivot ("Prop Kicking")',
    subtitle: '12m Sailboat · 12 kn Crosswind · Fairway 180° Pivot',
    vesselId: 'sailboat12m',
    berthId: 'slip-a-bow',
    recommendedRig: 'bow',
    trueWindKnots: 12,
    windFromDeg: 185,
    gustiness: 0.15,
    enableTraffic: false,
    startX: 12,
    startY: -0.5,
    startHeadingRad: 0,
    briefing:
      'Facing East in a tight basin! Alternate hard Right Helm + short Forward prop-wash kicks with bare Reverse prop-walk bursts to spin 180° on a dime.',
  },
  {
    stageNumber: 7,
    id: 'stage-7-med-mooring',
    title: '7. Mediterranean Stern-In Mooring',
    subtitle: '12m Sailboat · 15 kn SW Wind + Yacht Wind Shadow',
    vesselId: 'sailboat12m',
    berthId: 'south-med-stern',
    recommendedRig: 'quarter',
    trueWindKnots: 15,
    windFromDeg: 225,
    gustiness: 0.18,
    enableTraffic: false,
    startX: 12,
    startY: 0.2,
    startHeadingRad: -Math.PI / 2,
    briefing:
      'Slide fenders to Quarter Rig, back astern into the South Med Quay beside S/Y Mistral, and feel the wind drop as you enter her leeward wind shadow!',
  },
  {
    stageNumber: 8,
    id: 'stage-8-spring-line-rescue',
    title: '8. Spring-Line Cleat Lasso',
    subtitle: '8m Cruiser + Thruster · 20 kn Off-Quay Gale',
    vesselId: 'cruiser8m',
    berthId: 'south-east-spring',
    recommendedRig: 'midships',
    trueWindKnots: 20,
    windFromDeg: 180,
    gustiness: 0.2,
    enableTraffic: false,
    startX: -8,
    startY: 2.0,
    startHeadingRad: 0,
    briefing:
      '20 kn southerly gale blows hard off the South Quay! Pass within 3.8m of a quay cleat, press M (or tap the glowing cleat) to lasso a spring line, and motor gently to pivot in!',
  },
  {
    stageNumber: 9,
    id: 'stage-9-busy-harbor',
    title: '9. Busy Sunday Fairway & Wake Surge',
    subtitle: '7m Outboard · 19 kn Gusts + Paddleboarder & Ferry Wake',
    vesselId: 'outboard7m',
    berthId: 'slip-b-tight',
    recommendedRig: 'bow',
    trueWindKnots: 19,
    windFromDeg: 300,
    gustiness: 0.24,
    enableTraffic: true,
    startX: -22,
    startY: 2.5,
    startHeadingRad: 0,
    briefing:
      'Time your turn behind the fairway paddleboarder and anticipate the harbor ferry wake surge before slipping alongside M/Y Solaris!',
  },
  {
    stageNumber: 10,
    id: 'stage-10-master-gale',
    title: '10. Master Mariner — 25-Knot Gale',
    subtitle: '12m Sailboat · 25 kn Full Gale + Traffic · Med Stern-In',
    vesselId: 'sailboat12m',
    berthId: 'south-med-stern',
    recommendedRig: 'quarter',
    trueWindKnots: 25,
    windFromDeg: 255,
    gustiness: 0.25,
    enableTraffic: true,
    startX: -18,
    startY: -0.8,
    startHeadingRad: 0,
    briefing:
      'Final Exam: 25 kn westerly gale screaming down the channel! Use prop walk, quarter fenders, yacht wind shadow, and cleat spring lines for an S-Rank landing.',
  },
];
