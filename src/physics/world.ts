import RAPIER from '@dimforge/rapier2d-compat';
import {
  VESSEL_SPECS,
  VesselId,
  VesselSpec,
  FenderRigMode,
  FenderMount,
  CleatMount,
  getVesselFenderMounts,
  getVesselCleatMounts,
  getHullPolygonVertices,
} from './vessels';
import {
  computeHydrodynamicStep,
  ControlInputs,
  HydroTelemetry,
  MS_TO_KNOTS,
  clamp,
  clampWindKnots,
  normalizeCompassDeg,
  windFromDegToWorldVelocity,
} from './hydrodynamics';
import {
  MarinaLayout,
  createMarinaLayout,
  MovingHazard,
  DockCleat,
  TargetBerth,
} from './marina';
import {
  DockingScorer,
  ScoreIncident,
  BerthCompletionReport,
  ColliderKind,
} from './scoring';

export interface ActiveSpringLine {
  dockCleat: DockCleat;
  boatCleat: CleatMount;
  restLengthM: number;
  currentTensionN: number;
}

export interface ScuffMark {
  x: number;
  y: number;
  isBareHull: boolean;
  createdAtSec: number;
}

export interface GhostPoint {
  x: number;
  y: number;
  headingRad: number;
}

export interface MooringLineSegment {
  boatX: number;
  boatY: number;
  cleatX: number;
  cleatY: number;
}

export interface DockingChecklistState {
  nearBerth: boolean;
  inBerthZone: boolean;
  headingAligned: boolean;
  speedStopped: boolean;
  readyToMoor: boolean;
  headingErrorDeg: number;
  speedKnots: number;
  mooredLines: MooringLineSegment[];
}

export interface SimulationSnapshot {
  elapsedSec: number;
  vesselSpec: VesselSpec;
  fenderRig: FenderRigMode;
  playerX: number;
  playerY: number;
  playerHeadingRad: number;
  playerFenders: FenderMount[];
  playerCleats: CleatMount[];
  controls: ControlInputs;
  telemetry: HydroTelemetry;
  trueWindKnots: number;
  windFromDeg: number;
  gustFactor: number;
  shelterFactor: number;
  enableTraffic: boolean;
  wakeWaveX: number | null;
  movingHazards: MovingHazard[];
  nearestCleatCandidate: { dockCleat: DockCleat; boatCleat: CleatMount; distM: number } | null;
  activeSpringLine: ActiveSpringLine | null;
  targetBerth: TargetBerth;
  dockingChecklist: DockingChecklistState;
  dockingHoldProgress: number;
  liveScore: number;
  repairCostUsd: number;
  bareHullScrapes: number;
  recentIncident: ScoreIncident | null;
  scuffMarks: ScuffMark[];
  currentTrail: GhostPoint[];
  bestGhostTrail: GhostPoint[];
  completionReport: BerthCompletionReport | null;
}

interface ColliderMeta {
  kind: ColliderKind;
  label: string;
}

const FIXED_DT = 1 / 120;

export class MarinaPhysicsWorld {
  private rapierWorld!: RAPIER.World;
  private eventQueue!: RAPIER.EventQueue;
  private playerBody!: RAPIER.RigidBody;
  private playerFenderColliders: RAPIER.Collider[] = [];
  private hazardBodies: Map<string, RAPIER.RigidBody> = new Map();
  private colliderMeta: Map<number, ColliderMeta> = new Map();

  public readonly marina: MarinaLayout = createMarinaLayout();
  public readonly scorer = new DockingScorer();

  private vesselId: VesselId = 'outboard7m';
  private fenderRig: FenderRigMode = 'midships';
  private berthId: string = 'slip-a-bow';
  private trueWindKnots = 2;
  private windFromDeg = 0;
  private gustiness = 0.08;
  private enableTraffic = false;

  private controls: ControlInputs = { throttle: 0, helm: 0, bowThruster: 0 };
  private telemetry!: HydroTelemetry;
  private elapsedSec = 0;
  private accumulator = 0;
  private dockingHoldSec = 0;
  private wakeWaveX: number | null = null;
  private movingHazards: MovingHazard[] = [];
  private activeSpringLine: ActiveSpringLine | null = null;
  private recentIncident: ScoreIncident | null = null;
  private scuffMarks: ScuffMark[] = [];
  private currentTrail: GhostPoint[] = [];
  private ghostTrailsByStage = new Map<string, GhostPoint[]>();
  private lastTrailRecordSec = 0;
  private completionReport: BerthCompletionReport | null = null;

  public onIncident?: (incident: ScoreIncident) => void;
  public onComplete?: (report: BerthCompletionReport) => void;

  public static async create(): Promise<MarinaPhysicsWorld> {
    await RAPIER.init();
    const instance = new MarinaPhysicsWorld();
    instance.rebuildWorld({
      vesselId: 'outboard7m',
      fenderRig: 'midships',
      berthId: 'slip-a-bow',
      startX: -22,
      startY: 0.5,
      startHeadingRad: 0,
      trueWindKnots: 2,
      windFromDeg: 0,
      gustiness: 0.05,
      enableTraffic: false,
    });
    return instance;
  }

  public rebuildWorld(config: {
    vesselId: VesselId;
    fenderRig: FenderRigMode;
    berthId: string;
    startX: number;
    startY: number;
    startHeadingRad: number;
    trueWindKnots: number;
    windFromDeg: number;
    gustiness: number;
    enableTraffic: boolean;
  }): void {
    this.vesselId = config.vesselId;
    this.fenderRig = config.fenderRig;
    this.berthId = this.marina.berths[config.berthId] ? config.berthId : 'slip-a-bow';
    this.trueWindKnots = clampWindKnots(config.trueWindKnots);
    this.windFromDeg = normalizeCompassDeg(config.windFromDeg);
    this.gustiness = clamp(config.gustiness, 0, 0.35);
    this.enableTraffic = Boolean(config.enableTraffic);

    this.controls = { throttle: 0, helm: 0, bowThruster: 0 };
    this.elapsedSec = 0;
    this.accumulator = 0;
    this.dockingHoldSec = 0;
    this.activeSpringLine = null;
    this.recentIncident = null;
    this.scuffMarks = [];
    this.currentTrail = [{ x: config.startX, y: config.startY, headingRad: config.startHeadingRad }];
    this.lastTrailRecordSec = 0;
    this.completionReport = null;
    this.scorer.reset();

    if (this.rapierWorld) {
      this.rapierWorld.free();
      this.eventQueue.free();
    }
    this.colliderMeta.clear();
    this.hazardBodies.clear();
    this.playerFenderColliders = [];

    this.rapierWorld = new RAPIER.World({ x: 0, y: 0 });
    this.rapierWorld.timestep = FIXED_DT;
    this.eventQueue = new RAPIER.EventQueue(true);

    // 1. Static Marina Docks
    for (const dock of this.marina.docks) {
      const rb = this.rapierWorld.createRigidBody(
        RAPIER.RigidBodyDesc.fixed().setTranslation(dock.cx, dock.cy)
      );
      const col = this.rapierWorld.createCollider(
        RAPIER.ColliderDesc.cuboid(dock.width / 2, dock.height / 2)
          .setRestitution(0.18)
          .setFriction(0.42),
        rb
      );
      this.colliderMeta.set(col.handle, { kind: 'dock', label: dock.label });
    }

    // 2. Wooden Marina Pilings
    for (const piling of this.marina.pilings) {
      const rb = this.rapierWorld.createRigidBody(
        RAPIER.RigidBodyDesc.fixed().setTranslation(piling.x, piling.y)
      );
      const col = this.rapierWorld.createCollider(
        RAPIER.ColliderDesc.ball(piling.radius).setRestitution(0.24).setFriction(0.35),
        rb
      );
      this.colliderMeta.set(col.handle, { kind: 'piling', label: piling.label });
    }

    // 3. Moored Neighbor Vessels (Each with 1 Bare-Hull Collider + 4 Side Fender Colliders!)
    for (const moored of this.marina.mooredBoats) {
      const spec = VESSEL_SPECS[moored.vesselId];
      const rb = this.rapierWorld.createRigidBody(
        RAPIER.RigidBodyDesc.fixed()
          .setTranslation(moored.x, moored.y)
          .setRotation(moored.headingRad)
      );
      const hullVerts = getHullPolygonVertices(spec);
      const hullDesc =
        RAPIER.ColliderDesc.convexHull(hullVerts) ??
        RAPIER.ColliderDesc.cuboid(spec.loa * 0.45, spec.beam * 0.45);
      hullDesc.setRestitution(0.12).setFriction(0.45);
      const hullCol = this.rapierWorld.createCollider(hullDesc, rb);
      this.colliderMeta.set(hullCol.handle, { kind: 'moored-hull', label: moored.name });

      for (const f of moored.fenders) {
        const fDesc = RAPIER.ColliderDesc.capsule(f.halfLength, f.radius)
          .setTranslation(f.x, f.y)
          .setRotation(Math.PI / 2)
          .setRestitution(0.56)
          .setFriction(0.16);
        const fCol = this.rapierWorld.createCollider(fDesc, rb);
        this.colliderMeta.set(fCol.handle, {
          kind: 'moored-fender',
          label: `${moored.name} Fender`,
        });
      }
    }

    // 4. Moving Fairway Traffic Hazards (when enabled)
    this.movingHazards = this.enableTraffic
      ? [
          {
            id: 'sup-1',
            label: 'Fairway Paddleboarder',
            kind: 'paddleboard',
            x: -14,
            y: -2.6,
            headingRad: 0,
            radius: 0.72,
            speedMs: 1.05,
            minX: -24,
            maxX: 16,
          },
          {
            id: 'tender-1',
            label: 'Harbor Dinghy Tender',
            kind: 'tender',
            x: 14,
            y: 3.1,
            headingRad: Math.PI,
            radius: 1.1,
            speedMs: -1.35,
            minX: -22,
            maxX: 18,
          },
        ]
      : [];

    for (const hz of this.movingHazards) {
      const rb = this.rapierWorld.createRigidBody(
        RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(hz.x, hz.y)
      );
      const col = this.rapierWorld.createCollider(
        RAPIER.ColliderDesc.ball(hz.radius).setRestitution(0.35),
        rb
      );
      this.hazardBodies.set(hz.id, rb);
      this.colliderMeta.set(col.handle, { kind: 'hazard', label: hz.label });
    }
    this.wakeWaveX = this.enableTraffic ? -30 : null;

    // 5. Active Player Vessel RigidBody + Bare-Hull + 4 Adjustable Side Fenders
    const spec = VESSEL_SPECS[this.vesselId];
    this.playerBody = this.rapierWorld.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(config.startX, config.startY)
        .setRotation(config.startHeadingRad)
        .setAdditionalMassProperties(
          spec.massKg + spec.addedMassSurgeKg,
          { x: 0, y: 0 },
          spec.yawInertiaKgM2
        )
        .setLinearDamping(0)
        .setAngularDamping(0)
    );

    const playerHullVerts = getHullPolygonVertices(spec);
    const playerHullDesc =
      RAPIER.ColliderDesc.convexHull(playerHullVerts) ??
      RAPIER.ColliderDesc.cuboid(spec.loa * 0.45, spec.beam * 0.45);
    playerHullDesc
      .setDensity(0.001)
      .setRestitution(0.14)
      .setFriction(0.44)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
    const playerHullCol = this.rapierWorld.createCollider(playerHullDesc, this.playerBody);
    this.colliderMeta.set(playerHullCol.handle, { kind: 'bare-hull', label: 'Bare Fiberglass Hull' });

    this.attachPlayerFenders(spec, this.fenderRig);

    // Initialize zero-step telemetry
    const initHydro = computeHydrodynamicStep(
      spec,
      config.startHeadingRad,
      { u: 0, v: 0, r: 0 },
      this.controls,
      {
        trueWindKnots: this.trueWindKnots,
        windFromDeg: this.windFromDeg,
        gustFactor: 1,
        shelterFactor: 1,
      }
    );
    this.telemetry = initHydro.telemetry;
  }

  private attachPlayerFenders(spec: VesselSpec, rigMode: FenderRigMode): void {
    for (const col of this.playerFenderColliders) {
      this.colliderMeta.delete(col.handle);
      this.rapierWorld.removeCollider(col, false);
    }
    this.playerFenderColliders = [];

    const mounts = getVesselFenderMounts(spec, rigMode);
    for (const f of mounts) {
      const fDesc = RAPIER.ColliderDesc.capsule(f.halfLength, f.radius)
        .setTranslation(f.x, f.y)
        .setRotation(Math.PI / 2)
        .setDensity(0.001)
        .setRestitution(0.58)
        .setFriction(0.16)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
      const col = this.rapierWorld.createCollider(fDesc, this.playerBody);
      this.playerFenderColliders.push(col);
      this.colliderMeta.set(col.handle, { kind: 'boat-fender', label: `Player ${f.slot}` });
    }
  }

  public setFenderRig(rigMode: FenderRigMode): void {
    if (this.fenderRig === rigMode) return;
    this.fenderRig = rigMode;
    this.attachPlayerFenders(VESSEL_SPECS[this.vesselId], rigMode);
  }

  public setControls(partial: Partial<ControlInputs>): void {
    if (partial.throttle !== undefined) {
      this.controls.throttle = clamp(partial.throttle, -1, 1);
    }
    if (partial.helm !== undefined) {
      this.controls.helm = clamp(partial.helm, -1, 1);
    }
    if (partial.bowThruster !== undefined) {
      this.controls.bowThruster = clamp(partial.bowThruster, -1, 1);
    }
  }

  public setWindEnvironment(trueWindKnots: number, windFromDeg: number): void {
    this.trueWindKnots = clampWindKnots(trueWindKnots);
    this.windFromDeg = normalizeCompassDeg(windFromDeg);
  }

  public setTrafficEnabled(enabled: boolean): void {
    if (this.enableTraffic === enabled) return;
    const pos = this.playerBody.translation();
    this.rebuildWorld({
      vesselId: this.vesselId,
      fenderRig: this.fenderRig,
      berthId: this.berthId,
      startX: pos.x,
      startY: pos.y,
      startHeadingRad: this.playerBody.rotation(),
      trueWindKnots: this.trueWindKnots,
      windFromDeg: this.windFromDeg,
      gustiness: this.gustiness,
      enableTraffic: enabled,
    });
  }

  /**
   * Toggle or attach Spring-Line Cleat Lasso to nearest dock cleat (or specific clicked dockCleatId).
   * If already snug inside the target berth (`readyToMoor`), ties Bow & Stern lines and finishes immediately!
   */
  public toggleSpringLine(specificDockCleatId?: string): boolean {
    const pos = this.playerBody.translation();
    const checklist = this.computeDockingChecklist(pos.x, pos.y, this.playerBody.rotation());
    if (!this.completionReport && checklist.readyToMoor && !specificDockCleatId) {
      this.completeStageWithMooringLines(pos.x, pos.y, checklist.headingErrorDeg);
      return true;
    }

    if (this.activeSpringLine && !specificDockCleatId) {
      this.activeSpringLine = null;
      return false;
    }
    const candidate = this.findNearestCleatCandidate(specificDockCleatId);
    if (!candidate) {
      this.activeSpringLine = null;
      return false;
    }
    this.activeSpringLine = {
      dockCleat: candidate.dockCleat,
      boatCleat: candidate.boatCleat,
      restLengthM: Math.max(0.85, candidate.distM * 0.96),
      currentTensionN: 0,
    };
    return true;
  }

  public findNearestCleatCandidate(
    specificDockCleatId?: string
  ): { dockCleat: DockCleat; boatCleat: CleatMount; distM: number } | null {
    const pos = this.playerBody.translation();
    const rot = this.playerBody.rotation();
    const cosH = Math.cos(rot);
    const sinH = Math.sin(rot);
    const boatCleats = getVesselCleatMounts(VESSEL_SPECS[this.vesselId]);

    let best: { dockCleat: DockCleat; boatCleat: CleatMount; distM: number } | null = null;
    const maxReachM = 4.35;

    for (const dc of this.marina.cleats) {
      if (specificDockCleatId && dc.id !== specificDockCleatId) continue;
      for (const bc of boatCleats) {
        const wx = pos.x + bc.x * cosH - bc.y * sinH;
        const wy = pos.y + bc.x * sinH + bc.y * cosH;
        const d = Math.hypot(dc.x - wx, dc.y - wy);
        if (d <= maxReachM && (!best || d < best.distM)) {
          best = { dockCleat: dc, boatCleat: bc, distM: d };
        }
      }
    }
    return best;
  }

  public stepFrame(frameDtSec: number): SimulationSnapshot {
    const clampedFrameDt = Math.min(0.05, Math.max(0, frameDtSec));
    this.accumulator += clampedFrameDt;

    while (this.accumulator >= FIXED_DT) {
      this.stepPhysicsSubstep(FIXED_DT);
      this.accumulator -= FIXED_DT;
    }

    return this.getSnapshot();
  }

  private computeShelterFactor(px: number, py: number): number {
    if (this.trueWindKnots < 0.5) return 1.0;
    const { wx, wy } = windFromDegToWorldVelocity(this.windFromDeg, this.trueWindKnots);
    const wLen = Math.hypot(wx, wy);
    if (wLen < 1e-4) return 1.0;
    const dirX = wx / wLen;
    const dirY = wy / wLen;

    let minShelter = 1.0;
    for (const moored of this.marina.mooredBoats) {
      const dx = px - moored.x;
      const dy = py - moored.y;
      const downwindProj = dx * dirX + dy * dirY;
      const crosswindDist = Math.abs(-dx * dirY + dy * dirX);
      if (downwindProj > 0 && downwindProj < moored.windShadowRadiusM && crosswindDist < 2.6) {
        const fade = downwindProj / moored.windShadowRadiusM;
        const factor = 0.35 + 0.65 * fade;
        minShelter = Math.min(minShelter, factor);
      }
    }
    return minShelter;
  }

  private stepPhysicsSubstep(dt: number): void {
    this.elapsedSec += dt;
    const spec = VESSEL_SPECS[this.vesselId];
    const pos = this.playerBody.translation();
    const heading = this.playerBody.rotation();
    const linvel = this.playerBody.linvel();
    const angvel = this.playerBody.angvel();

    const cosH = Math.cos(heading);
    const sinH = Math.sin(heading);

    // Transform world linear velocity into body-fixed surge (u) & sway (v)
    const u = linvel.x * cosH + linvel.y * sinH;
    const v = -linvel.x * sinH + linvel.y * cosH;

    // Smooth atmospheric gust oscillation + leeward moored yacht wind shadow
    const gustWave =
      1 + this.gustiness * (0.65 * Math.sin(this.elapsedSec * 0.72) + 0.35 * Math.cos(this.elapsedSec * 1.65));
    const shelterFactor = this.computeShelterFactor(pos.x, pos.y);

    const hydro = computeHydrodynamicStep(
      spec,
      heading,
      { u, v, r: angvel },
      this.controls,
      {
        trueWindKnots: this.trueWindKnots,
        windFromDeg: this.windFromDeg,
        gustFactor: gustWave,
        shelterFactor,
      }
    );
    this.telemetry = hydro.telemetry;

    // Integrate hydrodynamic body accelerations into world velocity
    const newU = u + hydro.duDt * dt;
    const newV = v + hydro.dvDt * dt;
    const newR = angvel + hydro.drDt * dt;

    let worldVx = newU * cosH - newV * sinH;
    let worldVy = newU * sinH + newV * cosH;

    // Optional Harbor Ferry Wake Surge (rolls West -> East across fairway when traffic enabled)
    if (this.enableTraffic) {
      const cycle = (this.elapsedSec * 3.8) % 66;
      this.wakeWaveX = -33 + cycle;
      const distFromCrest = pos.x - this.wakeWaveX;
      if (Math.abs(distFromCrest) < 2.2) {
        const crestPush = Math.sin((distFromCrest / 2.2) * Math.PI) * 0.55;
        worldVx += crestPush * dt * 2.1;
        worldVy -= Math.cos((distFromCrest / 2.2) * (Math.PI / 2)) * 0.38 * dt * 2.0;
      }

      // Advance moving fairway hazards
      for (const hz of this.movingHazards) {
        hz.x += hz.speedMs * dt;
        if (hz.x > hz.maxX) {
          hz.x = hz.maxX;
          hz.speedMs = -Math.abs(hz.speedMs);
          hz.headingRad = Math.PI;
        } else if (hz.x < hz.minX) {
          hz.x = hz.minX;
          hz.speedMs = Math.abs(hz.speedMs);
          hz.headingRad = 0;
        }
        const rb = this.hazardBodies.get(hz.id);
        if (rb) {
          rb.setNextKinematicTranslation({ x: hz.x, y: hz.y });
        }
      }
    }

    // Active Spring-Line Cleat Lasso Constraint (real-world spring line rope pivot!)
    if (this.activeSpringLine) {
      const { dockCleat, boatCleat, restLengthM } = this.activeSpringLine;
      const cleatWorldX = pos.x + boatCleat.x * cosH - boatCleat.y * sinH;
      const cleatWorldY = pos.y + boatCleat.x * sinH + boatCleat.y * cosH;
      const dx = dockCleat.x - cleatWorldX;
      const dy = dockCleat.y - cleatWorldY;
      const dist = Math.hypot(dx, dy);

      if (dist > restLengthM && dist > 1e-4) {
        const stretch = dist - restLengthM;
        const stiffnessNPerM = 7500;
        const tensionN = Math.min(18000, stretch * stiffnessNPerM);
        this.activeSpringLine.currentTensionN = tensionN;

        const nx = dx / dist;
        const ny = dy / dist;
        const fx = nx * tensionN;
        const fy = ny * tensionN;

        const mTot = spec.massKg + spec.addedMassSurgeKg;
        worldVx += (fx / mTot) * dt;
        worldVy += (fy / mTot) * dt;

        // Torque r_arm x F about boat CoG
        const rx = cleatWorldX - pos.x;
        const ry = cleatWorldY - pos.y;
        const ropeTorque = rx * fy - ry * fx;
        const finalR = newR + (ropeTorque / spec.yawInertiaKgM2) * dt;
        this.playerBody.setAngvel(finalR * 0.996, true);
      } else {
        this.activeSpringLine.currentTensionN = 0;
        this.playerBody.setAngvel(newR, true);
      }
    } else {
      this.playerBody.setAngvel(newR, true);
    }

    // Keep vessel within outer marina basin boundary smoothly
    if (pos.x < -this.marina.basinHalfWidthM) worldVx = Math.max(0.2, worldVx);
    if (pos.x > this.marina.basinHalfWidthM) worldVx = Math.min(-0.2, worldVx);
    if (pos.y < -this.marina.basinHalfHeightM) worldVy = Math.max(0.2, worldVy);
    if (pos.y > this.marina.basinHalfHeightM) worldVy = Math.min(-0.2, worldVy);

    this.playerBody.setLinvel({ x: worldVx, y: worldVy }, true);

    // Step Rapier2D WASM rigid-body collision world & evaluate contacts
    this.rapierWorld.step(this.eventQueue);
    this.processContacts(dt);

    // Record Ghost Wake Breadcrumb every 0.25s
    if (this.elapsedSec - this.lastTrailRecordSec >= 0.25) {
      this.lastTrailRecordSec = this.elapsedSec;
      this.currentTrail.push({ x: pos.x, y: pos.y, headingRad: heading });
      if (this.currentTrail.length > 600) {
        this.currentTrail.shift();
      }
    }

    // Check Target Berth Completion Hold
    this.evaluateBerthProgress(dt, pos.x, pos.y, heading);
  }

  private processContacts(dt: number): void {
    // Drain Rapier event queue and inspect active narrowphase contact pairs involving player colliders
    this.eventQueue.drainCollisionEvents(() => {});

    const playerColHandles: number[] = [];
    for (let i = 0; i < this.playerBody.numColliders(); i++) {
      playerColHandles.push(this.playerBody.collider(i).handle);
    }

    for (const h1 of playerColHandles) {
      const col1 = this.rapierWorld.getCollider(h1);
      const meta1 = this.colliderMeta.get(h1);
      if (!col1 || !meta1) continue;
      if (meta1.kind !== 'bare-hull' && meta1.kind !== 'boat-fender') continue;

      const playerKind: 'bare-hull' | 'boat-fender' = meta1.kind;

      this.rapierWorld.contactPairsWith(col1, (col2) => {
        const meta2 = this.colliderMeta.get(col2.handle);
        if (!meta2) return;
        if (meta2.kind === 'bare-hull' || meta2.kind === 'boat-fender') return;

        let hasContact = false;
        let wx = this.playerBody.translation().x;
        let wy = this.playerBody.translation().y;

        this.rapierWorld.contactPair(col1, col2, (manifold, flipped) => {
          if (manifold.numContacts() > 0) {
            hasContact = true;
            const pt = flipped
              ? manifold.localContactPoint2(0)
              : manifold.localContactPoint1(0);
            if (pt) {
              const p1 = col1.translation();
              const r1 = col1.rotation();
              wx = p1.x + pt.x * Math.cos(r1) - pt.y * Math.sin(r1);
              wy = p1.y + pt.x * Math.sin(r1) + pt.y * Math.cos(r1);
            }
          }
        });

        if (!hasContact) return;

        const lv = this.playerBody.linvel();
        const speedKnots = Math.hypot(lv.x, lv.y) * MS_TO_KNOTS;

        const incident = this.scorer.evaluateContact(this.elapsedSec, {
          playerKind,
          otherKind: meta2.kind,
          otherLabel: meta2.label,
          impactSpeedKnots: speedKnots,
          worldX: wx,
          worldY: wy,
          dtSec: dt,
        });

        if (incident) {
          this.recentIncident = incident;
          this.scuffMarks.push({
            x: wx,
            y: wy,
            isBareHull: playerKind === 'bare-hull',
            createdAtSec: this.elapsedSec,
          });
          if (this.scuffMarks.length > 24) {
            this.scuffMarks.shift();
          }
          this.onIncident?.(incident);
        }
      });
    }
  }

  private computeDockingChecklist(
    px: number,
    py: number,
    headingRad: number
  ): DockingChecklistState {
    const berth = this.marina.berths[this.berthId];
    if (!berth) {
      return {
        nearBerth: false,
        inBerthZone: false,
        headingAligned: false,
        speedStopped: false,
        readyToMoor: false,
        headingErrorDeg: 180,
        speedKnots: 0,
        mooredLines: [],
      };
    }

    const dx = Math.abs(px - berth.x);
    const dy = Math.abs(py - berth.y);
    const inBerthZone = dx <= berth.width * 0.5 && dy <= berth.length * 0.5;
    const nearBerth = dx <= berth.width * 0.5 + 5.0 && dy <= berth.length * 0.5 + 5.0;

    const normDiff = (a: number, b: number) => {
      const diff = ((a - b + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
      return Math.abs((diff * 180) / Math.PI);
    };
    let headingErrorDeg = normDiff(headingRad, berth.targetHeadingRad);
    if (berth.allowOppositeHeading) {
      headingErrorDeg = Math.min(
        headingErrorDeg,
        normDiff(headingRad, berth.targetHeadingRad + Math.PI)
      );
    }

    const speedKnots = this.telemetry.speedKnots;
    const headingAligned = headingErrorDeg <= 32;
    const speedStopped = speedKnots <= 0.65;
    const readyToMoor = inBerthZone && headingAligned && speedStopped;

    const mooredLines: MooringLineSegment[] = this.completionReport
      ? this.computeVisualMooringLines(px, py, headingRad)
      : [];

    return {
      nearBerth,
      inBerthZone,
      headingAligned,
      speedStopped,
      readyToMoor,
      headingErrorDeg,
      speedKnots,
      mooredLines,
    };
  }

  private computeVisualMooringLines(
    px: number,
    py: number,
    headingRad: number
  ): MooringLineSegment[] {
    const spec = VESSEL_SPECS[this.vesselId];
    const cosH = Math.cos(headingRad);
    const sinH = Math.sin(headingRad);
    const bowWorld = {
      x: px + spec.loa * 0.44 * cosH,
      y: py + spec.loa * 0.44 * sinH,
    };
    const sternWorld = {
      x: px - spec.loa * 0.44 * cosH,
      y: py - spec.loa * 0.44 * sinH,
    };

    const pickClosestDockCleat = (pt: { x: number; y: number }): DockCleat => {
      let best = this.marina.cleats[0];
      let bestD = Infinity;
      for (const cl of this.marina.cleats) {
        const d = Math.hypot(cl.x - pt.x, cl.y - pt.y);
        if (d < bestD) {
          bestD = d;
          best = cl;
        }
      }
      return best;
    };

    const bowCleat = pickClosestDockCleat(bowWorld);
    const sternCleat = pickClosestDockCleat(sternWorld);

    return [
      { boatX: bowWorld.x, boatY: bowWorld.y, cleatX: bowCleat.x, cleatY: bowCleat.y },
      { boatX: sternWorld.x, boatY: sternWorld.y, cleatX: sternCleat.x, cleatY: sternCleat.y },
    ];
  }

  private completeStageWithMooringLines(
    px: number,
    py: number,
    headingErrorDeg: number
  ): void {
    const berth = this.marina.berths[this.berthId];
    if (!berth || this.completionReport) return;

    this.dockingHoldSec = 2.5;
    this.controls.throttle = 0;
    this.controls.bowThruster = 0;
    this.playerBody.setLinvel({ x: 0, y: 0 }, true);
    this.playerBody.setAngvel(0, true);

    const distErr = Math.hypot(px - berth.x, py - berth.y);
    const report = this.scorer.computeCompletionReport({
      distanceErrorM: distErr,
      headingErrorDeg,
      trueWindKnots: this.trueWindKnots,
      elapsedSec: this.elapsedSec,
    });
    this.completionReport = report;
    const stageKey = `${this.berthId}:${this.vesselId}`;
    if (!this.ghostTrailsByStage.has(stageKey) || report.bareHullScrapesCount === 0) {
      this.ghostTrailsByStage.set(stageKey, [...this.currentTrail]);
    }
    this.onComplete?.(report);
  }

  private evaluateBerthProgress(dt: number, px: number, py: number, headingRad: number): void {
    if (this.completionReport) return;
    const checklist = this.computeDockingChecklist(px, py, headingRad);

    if (checklist.readyToMoor) {
      this.dockingHoldSec = Math.min(2.5, this.dockingHoldSec + dt);
      if (this.dockingHoldSec >= 2.5) {
        this.completeStageWithMooringLines(px, py, checklist.headingErrorDeg);
      }
    } else {
      this.dockingHoldSec = Math.max(0, this.dockingHoldSec - dt * 1.15);
    }
  }

  public getSnapshot(): SimulationSnapshot {
    const spec = VESSEL_SPECS[this.vesselId];
    const pos = this.playerBody.translation();
    const rot = this.playerBody.rotation();
    const gustWave =
      1 + this.gustiness * (0.65 * Math.sin(this.elapsedSec * 0.72) + 0.35 * Math.cos(this.elapsedSec * 1.65));
    const stageKey = `${this.berthId}:${this.vesselId}`;

    return {
      elapsedSec: this.elapsedSec,
      vesselSpec: spec,
      fenderRig: this.fenderRig,
      playerX: pos.x,
      playerY: pos.y,
      playerHeadingRad: rot,
      playerFenders: getVesselFenderMounts(spec, this.fenderRig),
      playerCleats: getVesselCleatMounts(spec),
      controls: { ...this.controls },
      telemetry: this.telemetry,
      trueWindKnots: this.trueWindKnots,
      windFromDeg: this.windFromDeg,
      gustFactor: gustWave,
      shelterFactor: this.computeShelterFactor(pos.x, pos.y),
      enableTraffic: this.enableTraffic,
      wakeWaveX: this.wakeWaveX,
      movingHazards: this.movingHazards.map((h) => ({ ...h })),
      nearestCleatCandidate: this.findNearestCleatCandidate(),
      activeSpringLine: this.activeSpringLine ? { ...this.activeSpringLine } : null,
      targetBerth: this.marina.berths[this.berthId],
      dockingChecklist: this.computeDockingChecklist(pos.x, pos.y, rot),
      dockingHoldProgress: clamp(this.dockingHoldSec / 2.5, 0, 1),
      liveScore: this.scorer.getLiveScore(),
      repairCostUsd: this.scorer.getRepairCostUsd(),
      bareHullScrapes: this.scorer.getBareHullScrapesCount(),
      recentIncident: this.recentIncident,
      scuffMarks: this.scuffMarks.filter((s) => this.elapsedSec - s.createdAtSec < 9),
      currentTrail: this.currentTrail,
      bestGhostTrail: this.ghostTrailsByStage.get(stageKey) ?? [],
      completionReport: this.completionReport,
    };
  }
}
