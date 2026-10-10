import './index.css';
import { MarinaPhysicsWorld } from './physics/world';
import { CAMPAIGN_STAGES, CampaignStage } from './physics/campaign';
import { MarinaCanvasRenderer } from './renderer/canvasRenderer';
import { MarineSoundEngine } from './audio/soundEngine';
import { ControlsHud } from './ui/controlsHud';
import { KeyboardController, stepThrottleWithNeutralDetent } from './input/keyboardController';
import { clamp } from './physics/hydrodynamics';

async function bootstrap(): Promise<void> {
  const root = document.getElementById('app-root');
  if (!root) return;

  const shell = document.createElement('div');
  shell.className = 'sim-shell';
  const canvas = document.createElement('canvas');
  canvas.className = 'marina-canvas';
  shell.appendChild(canvas);
  root.appendChild(shell);

  const world = await MarinaPhysicsWorld.create();
  const renderer = new MarinaCanvasRenderer(canvas);
  const sound = new MarineSoundEngine();
  const kb = new KeyboardController();

  let activeStage: CampaignStage = CAMPAIGN_STAGES[0];

  const loadCampaignStage = (stage: CampaignStage): void => {
    activeStage = stage;
    hud.closeAnyModal();
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
    hud.setCurrentStageMeta(stage.title, stage.briefing, stage);
  };

  const hud = new ControlsHud(shell, {
    onThrottleChange: (throttle) => {
      sound.unlock();
      world.setControls({ throttle });
    },
    onThrottleStep: (delta) => {
      sound.unlock();
      const cur = world.getSnapshot().controls.throttle;
      world.setControls({ throttle: stepThrottleWithNeutralDetent(cur, delta) });
    },
    onHelmChange: (helm) => {
      sound.unlock();
      world.setControls({ helm });
    },
    onHelmStep: (delta) => {
      sound.unlock();
      const cur = world.getSnapshot().controls.helm;
      const stepped = clamp(cur + delta, -1, 1);
      world.setControls({ helm: Math.abs(stepped) < 0.04 ? 0 : stepped });
    },
    onBowThrusterChange: (bowThruster) => {
      sound.unlock();
      world.setControls({ bowThruster });
    },
    onSelectFenderRig: (rig) => {
      sound.unlock();
      world.setFenderRig(rig);
    },
    onToggleSpringLine: () => {
      sound.unlock();
      if (world.toggleSpringLine()) {
        sound.playCleatLatch();
      }
    },
    onResetStage: () => {
      sound.unlock();
      loadCampaignStage(activeStage);
    },
    onSelectCampaignStage: (stage) => {
      sound.unlock();
      loadCampaignStage(stage);
    },
    onApplySandboxConfig: (cfg) => {
      sound.unlock();
      world.rebuildWorld({
        vesselId: cfg.vesselId,
        fenderRig: 'midships',
        berthId: cfg.berthId,
        startX: -18,
        startY: 0.5,
        startHeadingRad: 0,
        trueWindKnots: cfg.trueWindKnots,
        windFromDeg: cfg.windFromDeg,
        gustiness: 0.16,
        enableTraffic: cfg.enableTraffic,
      });
    },
    onToggleXRay: () => {
      const next = !renderer.isShowForceXRay();
      renderer.setShowForceXRay(next);
      return next;
    },
    onToggleCameraMode: () => {
      const next = !renderer.isBoatUpCamera();
      renderer.setBoatUpCamera(next);
      return next;
    },
    onZoomDelta: (delta) => {
      renderer.setZoom(renderer.getZoom() + delta);
    },
    onToggleMute: () => {
      sound.unlock();
      const next = !sound.isMuted();
      sound.setMuted(next);
      return next;
    },
  });

  kb.onSpringLine = () => {
    if (world.toggleSpringLine()) {
      sound.playCleatLatch();
    }
  };
  kb.onResetStage = () => loadCampaignStage(activeStage);
  kb.onToggleXRay = () => renderer.setShowForceXRay(!renderer.isShowForceXRay());
  kb.onOpenHelp = () => hud.openHelpModal();

  world.onIncident = (incident) => {
    hud.showIncidentToast(incident);
    if (incident.kind === 'bare-hull-moored-scrape') {
      renderer.triggerHullShake(1.4);
      sound.playBareHullScrape(true);
    } else if (incident.kind === 'bare-hull-dock-scrape' || incident.kind === 'hazard-bump') {
      renderer.triggerHullShake(0.9);
      sound.playBareHullScrape(false);
    } else if (incident.kind === 'fender-hard-bump') {
      renderer.triggerHullShake(0.35);
      sound.playFenderKiss(true);
    } else {
      sound.playFenderKiss(false);
    }
  };

  world.onComplete = (report) => {
    sound.playShipsBell();
    hud.showCompletionModal(report);
  };

  world.onGameOver = (repairCostUsd, incidents) => {
    sound.playBareHullScrape(true);
    hud.showGameOverModal(repairCostUsd, incidents);
  };

  loadCampaignStage(CAMPAIGN_STAGES[0]);

  // Tap directly on any reachable dock cleat on the canvas to lasso/release a spring line!
  canvas.addEventListener('pointerdown', (ev) => {
    sound.unlock();
    const snap = world.getSnapshot();
    const pt = renderer.screenToWorld(ev.clientX, ev.clientY, snap);
    for (const cl of world.marina.cleats) {
      if (Math.hypot(cl.x - pt.x, cl.y - pt.y) <= 1.25) {
        if (world.toggleSpringLine(cl.id)) {
          sound.playCleatLatch();
        }
        break;
      }
    }
  });

  // Mouse wheel zoom on marina canvas
  canvas.addEventListener(
    'wheel',
    (ev) => {
      ev.preventDefault();
      renderer.setZoom(renderer.getZoom() - Math.sign(ev.deltaY) * 0.12);
    },
    { passive: false }
  );

  // Two-finger mobile pinch-to-zoom on marina canvas
  let prevPinchDist: number | null = null;
  canvas.addEventListener(
    'touchmove',
    (ev) => {
      if (ev.touches.length === 2) {
        const dx = ev.touches[0].clientX - ev.touches[1].clientX;
        const dy = ev.touches[0].clientY - ev.touches[1].clientY;
        const dist = Math.hypot(dx, dy);
        if (prevPinchDist !== null) {
          renderer.setZoom(renderer.getZoom() + (dist - prevPinchDist) * 0.004);
        }
        prevPinchDist = dist;
      }
    },
    { passive: true }
  );
  canvas.addEventListener('touchend', () => {
    prevPinchDist = null;
  });

  // Keyboard Arrow Keys (↑ ↓ ← →) + WASD + Shortcuts
  window.addEventListener(
    'keydown',
    (ev) => {
      if (ev.code === 'Escape' || ev.key === 'Escape') {
        hud.closeAnyModal();
        return;
      }
      if (ev.code === 'Enter' || ev.key === 'Enter') {
        if (hud.triggerScorecardPrimaryAction()) {
          ev.preventDefault();
          return;
        }
      }

      // Allow normal slider/dropdown interaction when Sandbox Setup modal controls are focused
      const activeTag = document.activeElement?.tagName;
      if (activeTag === 'SELECT' || activeTag === 'INPUT') {
        return;
      }
      if (activeTag === 'BUTTON' && document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }

      sound.unlock();
      const { handled, nextControls } = kb.handleKeyDown(ev, world.getSnapshot().controls);
      if (handled) {
        world.setControls(nextControls);
      }
    },
    { passive: false }
  );

  window.addEventListener('keyup', (ev) => {
    kb.handleKeyUp(ev);
  });

  window.addEventListener('blur', () => {
    kb.clearAllHeld();
  });

  // 60-120 Hz Main Simulation & Render Loop
  let prevTimeMs = performance.now();
  const tick = (nowMs: number): void => {
    const dtSec = Math.min(0.05, Math.max(0.001, (nowMs - prevTimeMs) / 1000));
    prevTimeMs = nowMs;

    const pointerThrusterHeld = Boolean(document.querySelector('.thruster-btn.pressing'));
    const nextControls = kb.step(dtSec, world.getSnapshot().controls, pointerThrusterHeld);
    world.setControls(nextControls);

    const snap = world.stepFrame(dtSec);
    renderer.render(snap, world.marina, dtSec);
    hud.updateTelemetry(snap, kb.getActiveHighlights());
    sound.updateContinuous({
      isDiesel: snap.vesselSpec.propulsion === 'inboard-diesel',
      throttle: snap.controls.throttle,
      bowThruster: snap.controls.bowThruster,
    });

    window.requestAnimationFrame(tick);
  };

  window.requestAnimationFrame(tick);
}

void bootstrap();
