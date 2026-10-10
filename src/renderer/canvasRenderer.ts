import { MarinaLayout } from '../physics/marina';
import { VESSEL_SPECS, VesselSpec, FenderMount } from '../physics/vessels';
import { windFromDegToWorldVelocity } from '../physics/hydrodynamics';
import { SimulationSnapshot } from '../physics/world';

interface WaterParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  radius: number;
  color: string;
}

interface WindStreak {
  x: number;
  y: number;
  phase: number;
}

export class MarinaCanvasRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private pixelsPerMeter = 22;
  private userZoom = 1.0;
  private boatUpCamera = false;
  private showForceXRay = true;
  private shakeIntensity = 0;
  private particles: WaterParticle[] = [];
  private windStreaks: WindStreak[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Could not initialize 2D canvas context');
    }
    this.ctx = context;

    for (let i = 0; i < 65; i++) {
      this.windStreaks.push({
        x: (Math.random() - 0.5) * 68,
        y: (Math.random() - 0.5) * 48,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  public setZoom(zoom: number): void {
    this.userZoom = Math.max(0.55, Math.min(2.1, zoom));
  }

  public getZoom(): number {
    return this.userZoom;
  }

  public setBoatUpCamera(enabled: boolean): void {
    this.boatUpCamera = enabled;
  }

  public isBoatUpCamera(): boolean {
    return this.boatUpCamera;
  }

  public setShowForceXRay(enabled: boolean): void {
    this.showForceXRay = enabled;
  }

  public isShowForceXRay(): boolean {
    return this.showForceXRay;
  }

  public triggerHullShake(intensity = 1.0): void {
    this.shakeIntensity = Math.min(2.2, this.shakeIntensity + intensity);
  }

  public resizeToContainer(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = this.canvas.getBoundingClientRect();
    const targetW = Math.max(320, Math.floor(rect.width * dpr));
    const targetH = Math.max(240, Math.floor(rect.height * dpr));
    if (this.canvas.width !== targetW || this.canvas.height !== targetH) {
      this.canvas.width = targetW;
      this.canvas.height = targetH;
    }

    // Fit full 66m x 47m marina comfortably on both portrait mobile (360px+) and wide desktop
    const fitX = rect.width / 66;
    const fitY = rect.height / 47;
    this.pixelsPerMeter = Math.max(5.5, Math.min(fitX, fitY)) * this.userZoom;
  }

  public screenToWorld(
    clientX: number,
    clientY: number,
    snap: SimulationSnapshot
  ): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const sx = clientX - rect.left - rect.width / 2;
    const sy = clientY - rect.top - rect.height / 2;
    const scale = this.pixelsPerMeter;

    if (!this.boatUpCamera) {
      return { x: sx / scale, y: sy / scale };
    }
    const camRot = snap.playerHeadingRad + Math.PI / 2;
    const cosR = Math.cos(camRot);
    const sinR = Math.sin(camRot);
    return {
      x: snap.playerX + (sx * cosR - sy * sinR) / scale,
      y: snap.playerY + (sx * sinR + sy * cosR) / scale,
    };
  }

  public render(snap: SimulationSnapshot, marina: MarinaLayout, dtSec: number): void {
    this.resizeToContainer();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = this.canvas.width / dpr;
    const height = this.canvas.height / dpr;
    const ctx = this.ctx;

    this.shakeIntensity = Math.max(0, this.shakeIntensity - dtSec * 3.5);
    const shakeX = (Math.random() - 0.5) * this.shakeIntensity * 9;
    const shakeY = (Math.random() - 0.5) * this.shakeIntensity * 9;

    this.spawnPropAndThrusterParticles(snap, dtSec);
    this.updateWindStreaks(snap, dtSec);

    ctx.save();
    ctx.scale(dpr, dpr);

    // 1. Deep Coastal Harbor Water Background
    const bgGrad = ctx.createRadialGradient(
      width * 0.5,
      height * 0.45,
      30,
      width * 0.5,
      height * 0.5,
      Math.max(width, height) * 0.72
    );
    bgGrad.addColorStop(0, '#0e3b4c');
    bgGrad.addColorStop(0.65, '#092c3a');
    bgGrad.addColorStop(1, '#061f29');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // 2. Apply Camera Transform (North-Up Overview vs. Boat-Up Follow)
    ctx.translate(width / 2 + shakeX, height / 2 + shakeY);
    const scale = this.pixelsPerMeter;
    ctx.scale(scale, scale);

    if (this.boatUpCamera) {
      ctx.rotate(-(snap.playerHeadingRad + Math.PI / 2));
      ctx.translate(-snap.playerX, -snap.playerY);
    }

    // 3. Subtle Depth Contours & Leeward Yacht Wind-Shadow Cones (when X-Ray active)
    this.drawBasinFloorAndWindShadows(ctx, marina, snap);

    // 4. Rolling Harbor Ferry Wake Surge
    if (snap.wakeWaveX !== null) {
      this.drawWakeWave(ctx, snap.wakeWaveX, marina.basinHalfHeightM);
    }

    // 5. Target Berth Highlight Zone & Alignment Guide
    this.drawTargetBerth(ctx, snap);

    // 6. Best Ghost Trail & Current Wake Path
    this.drawGhostTrails(ctx, snap);

    // 7. Prop Wash & Thruster Foam Particles
    for (const p of this.particles) {
      const alpha = Math.max(0, 1 - p.life / p.maxLife) * 0.65;
      ctx.fillStyle = p.color.replace('ALPHA', alpha.toFixed(2));
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // 8. Wind Streak Ribbons Across Water
    this.drawWindStreaks(ctx, snap);

    // 9. Timber Marina Piers, Pilings & Interactive Cleats
    this.drawDocksAndPilings(ctx, marina, snap);

    // 10. Moored Neighbor Vessels (Each with 2 Port + 2 Starboard Fenders!)
    for (const mb of marina.mooredBoats) {
      const mSpec = VESSEL_SPECS[mb.vesselId];
      this.drawVessel(ctx, {
        spec: mSpec,
        x: mb.x,
        y: mb.y,
        headingRad: mb.headingRad,
        hullColorOverride: mb.hullColor,
        fenders: mb.fenders,
        helmAngleDeg: 0,
        heelAngleDeg: 0,
        isPlayer: false,
        label: mb.name,
      });
    }

    // 11. Moving Fairway Traffic Hazards (Paddleboarder & Dinghy Tender)
    for (const hz of snap.movingHazards) {
      this.drawMovingHazard(ctx, hz);
    }

    // 12. Active Player Vessel + 4 Adjustable Side Fenders
    this.drawVessel(ctx, {
      spec: snap.vesselSpec,
      x: snap.playerX,
      y: snap.playerY,
      headingRad: snap.playerHeadingRad,
      fenders: snap.playerFenders,
      helmAngleDeg: snap.telemetry.helmAngleDeg,
      heelAngleDeg: snap.telemetry.heelAngleDeg,
      isPlayer: true,
    });

    // 13. Active Spring-Line Catenary Rope & Reachable Cleat Lasso Indicator
    this.drawSpringLines(ctx, snap);

    // 14. Live Hydrodynamic Force X-Ray Overlay (Pivot Point, Prop Wash, Prop Walk, Thruster)
    if (this.showForceXRay) {
      this.drawForceXRayOverlay(ctx, snap);
    }

    // 15. Contact Scuff Sparks / Butter-Kiss Rings
    for (const sc of snap.scuffMarks) {
      const age = snap.elapsedSec - sc.createdAtSec;
      const alpha = Math.max(0, 1 - age / 4.5);
      if (alpha <= 0) continue;
      ctx.strokeStyle = sc.isBareHull
        ? `rgba(239, 68, 68, ${alpha.toFixed(2)})`
        : `rgba(52, 211, 153, ${alpha.toFixed(2)})`;
      ctx.lineWidth = 0.14;
      ctx.beginPath();
      ctx.arc(sc.x, sc.y, 0.25 + age * 0.45, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }

  private drawBasinFloorAndWindShadows(
    ctx: CanvasRenderingContext2D,
    marina: MarinaLayout,
    snap: SimulationSnapshot
  ): void {
    ctx.strokeStyle = 'rgba(125, 211, 252, 0.05)';
    ctx.lineWidth = 0.08;
    ctx.strokeRect(
      -marina.basinHalfWidthM,
      -marina.basinHalfHeightM,
      marina.basinHalfWidthM * 2,
      marina.basinHalfHeightM * 2
    );

    if (this.showForceXRay && snap.trueWindKnots >= 1) {
      const { wx, wy } = windFromDegToWorldVelocity(snap.windFromDeg, snap.trueWindKnots);
      const wLen = Math.hypot(wx, wy);
      if (wLen > 0.01) {
        const dx = wx / wLen;
        const dy = wy / wLen;
        for (const mb of marina.mooredBoats) {
          const grad = ctx.createLinearGradient(
            mb.x,
            mb.y,
            mb.x + dx * mb.windShadowRadiusM,
            mb.y + dy * mb.windShadowRadiusM
          );
          grad.addColorStop(0, 'rgba(14, 165, 233, 0.16)');
          grad.addColorStop(1, 'rgba(14, 165, 233, 0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.moveTo(mb.x - dy * 1.9, mb.y + dx * 1.9);
          ctx.lineTo(mb.x + dy * 1.9, mb.y - dx * 1.9);
          ctx.lineTo(
            mb.x + dx * mb.windShadowRadiusM + dy * 2.5,
            mb.y + dy * mb.windShadowRadiusM - dx * 2.5
          );
          ctx.lineTo(
            mb.x + dx * mb.windShadowRadiusM - dy * 2.5,
            mb.y + dy * mb.windShadowRadiusM + dx * 2.5
          );
          ctx.closePath();
          ctx.fill();
        }
      }
    }
  }

  private drawWakeWave(ctx: CanvasRenderingContext2D, waveX: number, halfH: number): void {
    const grad = ctx.createLinearGradient(waveX - 2.2, 0, waveX + 2.2, 0);
    grad.addColorStop(0, 'rgba(224, 242, 254, 0)');
    grad.addColorStop(0.5, 'rgba(224, 242, 254, 0.24)');
    grad.addColorStop(1, 'rgba(224, 242, 254, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(waveX - 2.2, -halfH, 4.4, halfH * 2);
  }

  private drawTargetBerth(ctx: CanvasRenderingContext2D, snap: SimulationSnapshot): void {
    const berth = snap.targetBerth;
    const pulse = 0.5 + 0.5 * Math.sin(snap.elapsedSec * 3.2);
    const { inBerthZone, readyToMoor } = snap.dockingChecklist;

    let fillCss = `rgba(56, 189, 248, ${(0.11 + pulse * 0.06).toFixed(2)})`;
    let strokeCss = '#38bdf8';
    if (readyToMoor || snap.dockingHoldProgress > 0.02) {
      fillCss = 'rgba(16, 185, 129, 0.28)';
      strokeCss = '#34d399';
    } else if (inBerthZone) {
      fillCss = 'rgba(245, 158, 11, 0.2)';
      strokeCss = '#fbbf24';
    }

    ctx.save();
    ctx.translate(berth.x, berth.y);
    ctx.fillStyle = fillCss;
    ctx.strokeStyle = strokeCss;
    ctx.lineWidth = 0.14;
    ctx.setLineDash([0.55, 0.35]);
    ctx.fillRect(-berth.width / 2, -berth.length / 2, berth.width, berth.length);
    ctx.strokeRect(-berth.width / 2, -berth.length / 2, berth.width, berth.length);
    ctx.setLineDash([]);

    // Direction arrow inside target berth
    ctx.save();
    ctx.rotate(berth.targetHeadingRad);
    ctx.strokeStyle = 'rgba(240, 253, 244, 0.72)';
    ctx.lineWidth = 0.16;
    ctx.beginPath();
    ctx.moveTo(-1.2, 0);
    ctx.lineTo(1.3, 0);
    ctx.lineTo(0.55, -0.65);
    ctx.moveTo(1.3, 0);
    ctx.lineTo(0.55, 0.65);
    ctx.stroke();
    ctx.restore();

    // Dwell completion progress arc
    if (snap.dockingHoldProgress > 0.01) {
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 0.28;
      ctx.beginPath();
      ctx.arc(0, 0, 1.85, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * snap.dockingHoldProgress);
      ctx.stroke();
    }

    ctx.restore();
  }

  private drawGhostTrails(ctx: CanvasRenderingContext2D, snap: SimulationSnapshot): void {
    if (snap.bestGhostTrail.length > 2) {
      ctx.strokeStyle = 'rgba(52, 211, 153, 0.28)';
      ctx.lineWidth = 0.13;
      ctx.setLineDash([0.4, 0.4]);
      ctx.beginPath();
      snap.bestGhostTrail.forEach((pt, idx) => {
        if (idx === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      });
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (snap.currentTrail.length > 2) {
      ctx.strokeStyle = 'rgba(224, 242, 254, 0.22)';
      ctx.lineWidth = 0.11;
      ctx.beginPath();
      snap.currentTrail.forEach((pt, idx) => {
        if (idx === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      });
      ctx.stroke();
    }
  }

  private drawDocksAndPilings(
    ctx: CanvasRenderingContext2D,
    marina: MarinaLayout,
    snap: SimulationSnapshot
  ): void {
    for (const d of marina.docks) {
      const x0 = d.cx - d.width / 2;
      const y0 = d.cy - d.height / 2;

      // Drop shadow in harbor water
      ctx.fillStyle = 'rgba(2, 12, 20, 0.48)';
      ctx.fillRect(x0 + 0.25, y0 + 0.3, d.width, d.height);

      // Timber decking base
      ctx.fillStyle = '#5c4033';
      ctx.fillRect(x0, y0, d.width, d.height);

      // Rubber dock edge bumper strip
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 0.16;
      ctx.strokeRect(x0, y0, d.width, d.height);

      // Timber plank grain lines
      ctx.strokeStyle = 'rgba(28, 19, 13, 0.45)';
      ctx.lineWidth = 0.05;
      if (d.width >= d.height) {
        for (let x = x0 + 0.6; x < x0 + d.width; x += 0.65) {
          ctx.beginPath();
          ctx.moveTo(x, y0);
          ctx.lineTo(x, y0 + d.height);
          ctx.stroke();
        }
      } else {
        for (let y = y0 + 0.6; y < y0 + d.height; y += 0.65) {
          ctx.beginPath();
          ctx.moveTo(x0, y);
          ctx.lineTo(x0 + d.width, y);
          ctx.stroke();
        }
      }
    }

    // Wooden Pilings
    for (const p of marina.pilings) {
      ctx.fillStyle = 'rgba(2, 12, 20, 0.5)';
      ctx.beginPath();
      ctx.arc(p.x + 0.14, p.y + 0.16, p.radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#3f2a1d';
      ctx.strokeStyle = '#9c7350';
      ctx.lineWidth = 0.09;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // Interactive Brass Dock Cleats
    for (const cl of marina.cleats) {
      const isReachable = snap.nearestCleatCandidate?.dockCleat.id === cl.id;
      const isAttached = snap.activeSpringLine?.dockCleat.id === cl.id;

      if (isReachable || isAttached) {
        ctx.strokeStyle = isAttached ? '#34d399' : '#fbbf24';
        ctx.lineWidth = 0.11;
        ctx.beginPath();
        ctx.arc(cl.x, cl.y, 0.58 + 0.12 * Math.sin(snap.elapsedSec * 6), 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.fillStyle = isAttached ? '#34d399' : isReachable ? '#fbbf24' : '#cbd5e1';
      ctx.beginPath();
      ctx.arc(cl.x, cl.y, 0.18, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawVessel(
    ctx: CanvasRenderingContext2D,
    opts: {
      spec: VesselSpec;
      x: number;
      y: number;
      headingRad: number;
      hullColorOverride?: string;
      fenders: FenderMount[];
      helmAngleDeg: number;
      heelAngleDeg: number;
      isPlayer: boolean;
      label?: string;
    }
  ): void {
    const { spec, x, y, headingRad, fenders, helmAngleDeg, heelAngleDeg, isPlayer } = opts;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(headingRad);

    // 1. Water Hull Shadow
    ctx.save();
    ctx.translate(0.18, 0.24);
    ctx.fillStyle = 'rgba(2, 10, 18, 0.45)';
    this.traceHullPath(ctx, spec);
    ctx.fill();
    ctx.restore();

    // 2. Outboard Motor Cowl OR Sailboat Rudder Blade under stern
    const helmRad = (helmAngleDeg * Math.PI) / 180;
    if (spec.propulsion === 'outboard') {
      ctx.save();
      ctx.translate(-spec.loa * 0.51, 0);
      ctx.rotate(-helmRad);
      ctx.fillStyle = '#1e293b';
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 0.06;
      ctx.fillRect(-0.52, -0.26, 0.52, 0.52);
      ctx.strokeRect(-0.52, -0.26, 0.52, 0.52);
      ctx.restore();
    } else if (isPlayer) {
      // Underwater spade rudder preview at stern
      ctx.save();
      ctx.translate(spec.propPosX, 0);
      ctx.rotate(-helmRad);
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.7)';
      ctx.lineWidth = 0.12;
      ctx.beginPath();
      ctx.moveTo(0.25, 0);
      ctx.lineTo(-0.55, 0);
      ctx.stroke();
      ctx.restore();
    }

    // 3. Outer Fiberglass Hull Shell
    ctx.fillStyle = opts.hullColorOverride ?? spec.hullColor;
    ctx.strokeStyle = isPlayer ? '#f8fafc' : '#cbd5e1';
    ctx.lineWidth = isPlayer ? 0.11 : 0.08;
    this.traceHullPath(ctx, spec);
    ctx.fill();
    ctx.stroke();

    // 4. Recessed Inner Deck / Cabin Superstructure
    ctx.save();
    ctx.scale(0.84, 0.76);
    ctx.fillStyle = spec.deckColor;
    this.traceHullPath(ctx, spec);
    ctx.fill();
    ctx.restore();

    // 5. Vessel-Specific Deck Details (Windshield / Cabin / Sailboat Mast & Rigging)
    if (spec.id === 'sailboat12m') {
      // Coachroof window strip + Cockpit well + Aluminum Mast & Boom shifted by heelAngleDeg
      ctx.fillStyle = '#334155';
      ctx.fillRect(-0.8, -0.82, 2.5, 1.64);
      const heelOffsetY = (heelAngleDeg / 18) * 0.45;
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 0.14;
      ctx.beginPath();
      ctx.moveTo(0.95, 0);
      ctx.lineTo(-3.9, heelOffsetY);
      ctx.stroke();

      // Spreaders & Mast step
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 0.08;
      ctx.beginPath();
      ctx.moveTo(0.95, -1.45);
      ctx.lineTo(0.95, 1.45);
      ctx.stroke();
      ctx.fillStyle = '#f8fafc';
      ctx.beginPath();
      ctx.arc(0.95, heelOffsetY * 0.3, 0.18, 0, Math.PI * 2);
      ctx.fill();
    } else if (spec.id === 'cruiser8m') {
      // Forward cabin trunk + wrap-around dark glass windshield
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.roundRect(-0.4, -0.92, 1.85, 1.84, 0.35);
      ctx.fill();
    } else {
      // 7m Center Console T-top
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.roundRect(-0.55, -0.58, 1.25, 1.16, 0.22);
      ctx.fill();
    }

    // 6. THE 4 PHYSICAL PROTRUDING SIDE FENDERS (2 Port + 2 Starboard on EVERY boat!)
    for (const f of fenders) {
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.fillStyle = isPlayer ? '#f59e0b' : '#e2e8f0';
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 0.06;
      ctx.beginPath();
      ctx.roundRect(-f.halfLength, -f.radius, f.halfLength * 2, f.radius * 2, f.radius);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }

  private traceHullPath(ctx: CanvasRenderingContext2D, spec: VesselSpec): void {
    ctx.beginPath();
    spec.hullProfile.forEach(([xf, yf], idx) => {
      const px = xf * spec.loa;
      const py = yf * spec.beam;
      if (idx === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.closePath();
  }

  private drawMovingHazard(
    ctx: CanvasRenderingContext2D,
    hz: { kind: 'paddleboard' | 'tender'; x: number; y: number; headingRad: number }
  ): void {
    ctx.save();
    ctx.translate(hz.x, hz.y);
    ctx.rotate(hz.headingRad);
    if (hz.kind === 'paddleboard') {
      ctx.fillStyle = '#fb923c';
      ctx.beginPath();
      ctx.ellipse(0, 0, 1.45, 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.arc(0, 0, 0.24, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = '#cbd5e1';
      ctx.beginPath();
      ctx.roundRect(-1.3, -0.68, 2.6, 1.36, 0.45);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawSpringLines(ctx: CanvasRenderingContext2D, snap: SimulationSnapshot): void {
    // Render tied Bow & Stern Mooring Lines when stage is moored!
    for (const ml of snap.dockingChecklist.mooredLines) {
      ctx.strokeStyle = '#34d399';
      ctx.lineWidth = 0.15;
      ctx.beginPath();
      ctx.moveTo(ml.boatX, ml.boatY);
      ctx.lineTo(ml.cleatX, ml.cleatY);
      ctx.stroke();
    }

    const cosH = Math.cos(snap.playerHeadingRad);
    const sinH = Math.sin(snap.playerHeadingRad);

    // Dotted lasso guide when near a dock cleat
    if (!snap.activeSpringLine && snap.nearestCleatCandidate) {
      const { dockCleat, boatCleat } = snap.nearestCleatCandidate;
      const bx = snap.playerX + boatCleat.x * cosH - boatCleat.y * sinH;
      const by = snap.playerY + boatCleat.x * sinH + boatCleat.y * cosH;

      ctx.strokeStyle = 'rgba(251, 191, 36, 0.72)';
      ctx.lineWidth = 0.09;
      ctx.setLineDash([0.28, 0.24]);
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(dockCleat.x, dockCleat.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Active taut spring rope!
    if (snap.activeSpringLine) {
      const { dockCleat, boatCleat, currentTensionN } = snap.activeSpringLine;
      const bx = snap.playerX + boatCleat.x * cosH - boatCleat.y * sinH;
      const by = snap.playerY + boatCleat.x * sinH + boatCleat.y * cosH;

      ctx.strokeStyle = currentTensionN > 500 ? '#f97316' : '#34d399';
      ctx.lineWidth = currentTensionN > 500 ? 0.16 : 0.12;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(dockCleat.x, dockCleat.y);
      ctx.stroke();
    }
  }

  private drawForceXRayOverlay(ctx: CanvasRenderingContext2D, snap: SimulationSnapshot): void {
    const { telemetry, vesselSpec, playerX, playerY, playerHeadingRad } = snap;
    ctx.save();
    ctx.translate(playerX, playerY);
    ctx.rotate(playerHeadingRad);

    // 1. Dynamic Hull Pivot Point (Gold Crosshair along centerline)
    const px = telemetry.pivotPointLocalX;
    ctx.strokeStyle = '#fbbf24';
    ctx.fillStyle = '#fbbf24';
    ctx.lineWidth = 0.09;
    ctx.beginPath();
    ctx.arc(px, 0, 0.34, 0, Math.PI * 2);
    ctx.moveTo(px - 0.5, 0);
    ctx.lineTo(px + 0.5, 0);
    ctx.moveTo(px, -0.5);
    ctx.lineTo(px, 0.5);
    ctx.stroke();

    // 2. Prop Wash / Vectored Outboard Thrust Vector (Cyan)
    const propScale = 0.00085;
    const fx = -telemetry.propThrustBody.x * propScale;
    const fy = -telemetry.propThrustBody.y * propScale;
    if (Math.hypot(fx, fy) > 0.18) {
      this.drawVectorArrow(ctx, vesselSpec.propPosX, 0, fx, fy, '#22d3ee');
    }

    // 3. Right-Hand Prop Walk Lateral Stern Pull (Coral/Amber arrow at stern)
    if (Math.abs(telemetry.propWalkLateralN) > 40) {
      const pwY = telemetry.propWalkLateralN * 0.0022;
      this.drawVectorArrow(ctx, vesselSpec.propPosX, 0, 0, pwY, '#fb7185');
    }

    // 4. Bow Thruster Lateral Jet Vector (Emerald arrow at bow tunnel)
    if (Math.abs(telemetry.bowThrusterLateralN) > 30) {
      const btY = telemetry.bowThrusterLateralN * 0.0018;
      this.drawVectorArrow(ctx, vesselSpec.bowThrusterPosX, 0, 0, btY, '#34d399');
    }

    ctx.restore();
  }

  private drawVectorArrow(
    ctx: CanvasRenderingContext2D,
    startX: number,
    startY: number,
    dx: number,
    dy: number,
    color: string
  ): void {
    const endX = startX + dx;
    const endY = startY + dy;
    const angle = Math.atan2(dy, dx);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 0.14;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(endX, endY);
    ctx.lineTo(endX - Math.cos(angle - 0.45) * 0.45, endY - Math.sin(angle - 0.45) * 0.45);
    ctx.lineTo(endX - Math.cos(angle + 0.45) * 0.45, endY - Math.sin(angle + 0.45) * 0.45);
    ctx.closePath();
    ctx.fill();
  }

  private spawnPropAndThrusterParticles(snap: SimulationSnapshot, dtSec: number): void {
    const cosH = Math.cos(snap.playerHeadingRad);
    const sinH = Math.sin(snap.playerHeadingRad);
    const spec = snap.vesselSpec;

    // Propeller wash foam bubbles
    const absT = Math.abs(snap.controls.throttle);
    if (absT > 0.06 && Math.random() < absT * 0.9) {
      const sternX = snap.playerX + spec.propPosX * cosH;
      const sternY = snap.playerY + spec.propPosX * sinH;
      const ejectDir = snap.controls.throttle >= 0 ? -1 : 1;
      const jetSpeed = ejectDir * (2.5 + absT * 4.5);
      this.particles.push({
        x: sternX + (Math.random() - 0.5) * 0.4,
        y: sternY + (Math.random() - 0.5) * 0.4,
        vx: cosH * jetSpeed + (Math.random() - 0.5) * 0.8,
        vy: sinH * jetSpeed + (Math.random() - 0.5) * 0.8,
        life: 0,
        maxLife: 0.7 + Math.random() * 0.5,
        radius: 0.14 + Math.random() * 0.16,
        color: 'rgba(224, 242, 254, ALPHA)',
      });
    }

    // Bow thruster bubble plume
    const absBT = Math.abs(snap.controls.bowThruster);
    if (spec.hasBowThruster && absBT > 0.05 && Math.random() < absBT * 0.9) {
      const btX = snap.playerX + spec.bowThrusterPosX * cosH;
      const btY = snap.playerY + spec.bowThrusterPosX * sinH;
      const ejectSign = -Math.sign(snap.controls.bowThruster); // Jet shoots out opposite side of push!
      const speed = 3.2 * ejectSign;
      this.particles.push({
        x: btX,
        y: btY,
        vx: -sinH * speed + (Math.random() - 0.5) * 0.6,
        vy: cosH * speed + (Math.random() - 0.5) * 0.6,
        life: 0,
        maxLife: 0.55,
        radius: 0.13 + Math.random() * 0.12,
        color: 'rgba(167, 243, 208, ALPHA)',
      });
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dtSec;
      p.x += p.vx * dtSec;
      p.y += p.vy * dtSec;
      p.vx *= 0.96;
      p.vy *= 0.96;
      if (p.life >= p.maxLife) {
        this.particles.splice(i, 1);
      }
    }
  }

  private updateWindStreaks(snap: SimulationSnapshot, dtSec: number): void {
    const { wx, wy } = windFromDegToWorldVelocity(
      snap.windFromDeg,
      snap.trueWindKnots * snap.gustFactor
    );
    for (const s of this.windStreaks) {
      s.x += wx * dtSec * 1.35;
      s.y += wy * dtSec * 1.35;
      if (s.x > 35) s.x -= 70;
      if (s.x < -35) s.x += 70;
      if (s.y > 25) s.y -= 50;
      if (s.y < -25) s.y += 50;
    }
  }

  private drawWindStreaks(ctx: CanvasRenderingContext2D, snap: SimulationSnapshot): void {
    if (snap.trueWindKnots < 0.8) return;
    const { wx, wy } = windFromDegToWorldVelocity(snap.windFromDeg, snap.trueWindKnots);
    const alpha = Math.min(0.32, 0.05 + (snap.trueWindKnots / 25) * 0.25);
    ctx.strokeStyle = `rgba(186, 230, 253, ${alpha.toFixed(2)})`;
    ctx.lineWidth = 0.06;

    for (const s of this.windStreaks) {
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x + wx * 0.28, s.y + wy * 0.28);
      ctx.stroke();
    }
  }
}
