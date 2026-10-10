import { describe, expect, it } from 'vitest';
import {
  VESSEL_SPECS,
  getVesselFenderMounts,
  sanitizeVesselId,
} from '../src/physics/vessels';
import {
  computeHydrodynamicStep,
  clampWindKnots,
  windFromDegToWorldVelocity,
} from '../src/physics/hydrodynamics';
import { DockingScorer } from '../src/physics/scoring';
import { MarinaPhysicsWorld } from '../src/physics/world';

describe('Real-Life Marine Physics & 4-Fender Scoring Suite', () => {
  it('7m Outboard generates strong stern swing under vectored throttle vs minimal torque in Neutral', () => {
    const spec = VESSEL_SPECS.outboard7m;
    const poweredTurn = computeHydrodynamicStep(
      spec,
      0,
      { u: 0.4, v: 0, r: 0 },
      { throttle: 0.7, helm: 1.0, bowThruster: 0 },
      { trueWindKnots: 0, windFromDeg: 0, gustFactor: 1, shelterFactor: 1 }
    );
    const neutralCoast = computeHydrodynamicStep(
      spec,
      0,
      { u: 0.4, v: 0, r: 0 },
      { throttle: 0.0, helm: 1.0, bowThruster: 0 },
      { trueWindKnots: 0, windFromDeg: 0, gustFactor: 1, shelterFactor: 1 }
    );

    expect(poweredTurn.torqueZ).toBeGreaterThan(2800);
    expect(Math.abs(neutralCoast.torqueZ)).toBeLessThan(poweredTurn.torqueZ * 0.12);
  });

  it('8m Cabin Cruiser bow thruster produces strong lateral sway & yaw at standstill and attenuates above 5 kn', () => {
    const spec = VESSEL_SPECS.cruiser8m;
    const standstill = computeHydrodynamicStep(
      spec,
      0,
      { u: 0, v: 0, r: 0 },
      { throttle: 0, helm: 0, bowThruster: 1.0 },
      { trueWindKnots: 0, windFromDeg: 0, gustFactor: 1, shelterFactor: 1 }
    );
    const fastCruise = computeHydrodynamicStep(
      spec,
      0,
      { u: 3.5, v: 0, r: 0 }, // ~6.8 knots headway
      { throttle: 0, helm: 0, bowThruster: 1.0 },
      { trueWindKnots: 0, windFromDeg: 0, gustFactor: 1, shelterFactor: 1 }
    );

    expect(standstill.telemetry.bowThrusterLateralN).toBeGreaterThan(1500);
    expect(fastCruise.telemetry.bowThrusterLateralN).toBeLessThan(
      standstill.telemetry.bowThrusterLateralN * 0.35
    );
  });

  it('12m Sailboat produces reverse right-hand Prop Walk to PORT and forward Prop Wash turn at 0 kn', () => {
    const spec = VESSEL_SPECS.sailboat12m;

    // 1. Reverse throttle from dead standstill with centered helm -> Stern kicks to PORT (-Y), Bow swings STBD (+torqueZ)
    const reverseKick = computeHydrodynamicStep(
      spec,
      0,
      { u: 0, v: 0, r: 0 },
      { throttle: -0.8, helm: 0, bowThruster: 0 },
      { trueWindKnots: 0, windFromDeg: 0, gustFactor: 1, shelterFactor: 1 }
    );
    expect(reverseKick.telemetry.propWalkLateralN).toBeLessThan(-900);
    expect(reverseKick.forceBodyY).toBeLessThan(-900);
    expect(reverseKick.torqueZ).toBeGreaterThan(4500);

    // 2. Forward throttle burst at 0 kn boat speed with hard starboard rudder -> strong turning moment via prop wash!
    const standingPropWash = computeHydrodynamicStep(
      spec,
      0,
      { u: 0, v: 0, r: 0 },
      { throttle: 0.75, helm: 1.0, bowThruster: 0 },
      { trueWindKnots: 0, windFromDeg: 0, gustFactor: 1, shelterFactor: 1 }
    );
    expect(standingPropWash.torqueZ).toBeGreaterThan(7000);
  });

  it('Clamps wind speed strictly to 0..25 knots and blows unpowered vessel bow off a 22 kn beam crosswind', () => {
    expect(clampWindKnots(-5)).toBe(0);
    expect(clampWindKnots(42)).toBe(25);

    // Boat pointing East (0 rad), 22 kn North wind (0 deg -> blows South +Y = Starboard side)
    const windVec = windFromDegToWorldVelocity(0, 22);
    expect(windVec.wy).toBeGreaterThan(10);

    const beamWindStep = computeHydrodynamicStep(
      VESSEL_SPECS.sailboat12m,
      0,
      { u: 0, v: 0, r: 0 },
      { throttle: 0, helm: 0, bowThruster: 0 },
      { trueWindKnots: 22, windFromDeg: 0, gustFactor: 1, shelterFactor: 1 }
    );
    // Pushed leeward (+Y) and bow blows downwind (+torqueZ)
    expect(beamWindStep.forceBodyY).toBeGreaterThan(1200);
    expect(beamWindStep.torqueZ).toBeGreaterThan(1800);
  });

  it('Rigging presets shift 2 port + 2 starboard side fenders longitudinally & scorer distinguishes fender kiss vs bare-hull yacht scrape', () => {
    const spec = VESSEL_SPECS.cruiser8m;
    const bowRig = getVesselFenderMounts(spec, 'bow');
    const midRig = getVesselFenderMounts(spec, 'midships');
    const aftRig = getVesselFenderMounts(spec, 'quarter');

    expect(bowRig).toHaveLength(4);
    expect(midRig).toHaveLength(4);
    expect(aftRig).toHaveLength(4);
    expect(bowRig[0].x).toBeGreaterThan(midRig[0].x);
    expect(midRig[0].x).toBeGreaterThan(aftRig[0].x);

    const scorer = new DockingScorer();
    // Gentle fender touch on moored neighbor yacht at 0.35 kn -> 0 damage, bonus points!
    const kiss = scorer.evaluateContact(5.0, {
      playerKind: 'boat-fender',
      otherKind: 'moored-hull',
      otherLabel: 'M/Y Solaris (8m)',
      impactSpeedKnots: 0.35,
      worldX: 4,
      worldY: -12,
      dtSec: 1 / 120,
    });
    expect(kiss?.kind).toBe('fender-butter-kiss');
    expect(scorer.getRepairCostUsd()).toBe(0);
    expect(scorer.getLiveScore()).toBeGreaterThanOrEqual(1050);

    // Bare fiberglass hull scraping moored neighbor yacht at 0.6 kn -> heavy penalty & repair bill!
    const scrape = scorer.evaluateContact(8.0, {
      playerKind: 'bare-hull',
      otherKind: 'moored-hull',
      otherLabel: 'M/Y Solaris (8m)',
      impactSpeedKnots: 0.6,
      worldX: 4,
      worldY: -12,
      dtSec: 1 / 120,
    });
    expect(scrape?.kind).toBe('bare-hull-moored-scrape');
    expect(scorer.getRepairCostUsd()).toBeGreaterThan(2500);
    expect(scorer.getLiveScore()).toBeLessThan(900);
  });

  it('Initializes Rapier2D WebAssembly world cleanly and steps 120 Hz rigid-body simulation', async () => {
    expect(sanitizeVesselId('invalid-input')).toBe('outboard7m');
    const world = await MarinaPhysicsWorld.create();
    world.setControls({ throttle: 0.6, helm: 0.5, bowThruster: 0 });
    const snap = world.stepFrame(0.05);
    expect(snap.playerFenders).toHaveLength(4);
    expect(snap.liveScore).toBe(1000);
    expect(snap.playerX).toBeGreaterThan(-22);
  });
});
