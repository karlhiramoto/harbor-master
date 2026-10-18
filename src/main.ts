import './index.css';
import { MarinaPhysicsWorld } from './physics/world';
import { CAMPAIGN_STAGES, CampaignStage } from './physics/campaign';
import { MarinaCanvasRenderer } from './renderer/canvasRenderer';
import { MarineSoundEngine } from './audio/soundEngine';
import { ControlsHud } from './ui/controlsHud';
import { KeyboardController, stepThrottleWithNeutralDetent } from './input/keyboardController';
import { clamp } from './physics/hydrodynamics';
import { SkipperClassifier } from './ai/skipperClassifier';

async function bootstrap(): Promise<void> {
  const root = document.getElementById('app-root');
  if (!root) return;

  const shell = document.createElement('div');
  shell.className = 'sim-shell';
  const canvasViewport = document.createElement('div');
  canvasViewport.className = 'canvas-viewport';
  const canvas = document.createElement('canvas');
  canvas.className = 'marina-canvas';
  canvasViewport.appendChild(canvas);
  root.appendChild(shell);

  const world = await MarinaPhysicsWorld.create();
  const renderer = new MarinaCanvasRenderer(canvas);
  const sound = new MarineSoundEngine();
  const kb = new KeyboardController();
  const skipper = new SkipperClassifier();

  let activeStage: CampaignStage = CAMPAIGN_STAGES[0];
  let autoPilotActive = false;

  const setAutoPilot = (active: boolean): boolean => {
    autoPilotActive = active;
    if (!active) {
      renderer.setAutoPilotOverlay(null);
    }
    hud.setAutoPilotActive(active);
    return active;
  };

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
    if (autoPilotActive) {
      hud.setAutoPilotActive(true);
    }
  };

  const hud = new ControlsHud(shell, canvasViewport, {
    onThrottleChange: (throttle) => {
      sound.unlock();
      if (autoPilotActive) setAutoPilot(false);
      world.setControls({ throttle });
    },
    onThrottleStep: (delta) => {
      sound.unlock();
      if (autoPilotActive) setAutoPilot(false);
      const cur = world.getSnapshot().controls.throttle;
      world.setControls({ throttle: stepThrottleWithNeutralDetent(cur, delta) });
    },
    onHelmChange: (helm) => {
      sound.unlock();
      if (autoPilotActive) setAutoPilot(false);
      world.setControls({ helm });
    },
    onHelmStep: (delta) => {
      sound.unlock();
      if (autoPilotActive) setAutoPilot(false);
      const cur = world.getSnapshot().controls.helm;
      const stepped = clamp(cur + delta, -1, 1);
      world.setControls({ helm: Math.abs(stepped) < 0.04 ? 0 : stepped });
    },
    onBowThrusterChange: (bowThruster) => {
      sound.unlock();
      if (autoPilotActive) setAutoPilot(false);
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
      return renderer.getZoom();
    },
    onResetZoom: () => {
      renderer.setZoom(1.0);
      return renderer.getZoom();
    },
    onToggleMute: () => {
      sound.unlock();
      const next = !sound.isMuted();
      sound.setMuted(next);
      return next;
    },
    onToggleAutoPilot: () => {
      sound.unlock();
      return setAutoPilot(!autoPilotActive);
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

  // Prevent iOS Safari / WebKit native browser visualViewport zoom during two-thumb steering or pinching
  const preventSafariNativeZoom = (ev: Event): void => {
    ev.preventDefault();
  };
  window.addEventListener('gesturestart', preventSafariNativeZoom, { passive: false });
  window.addEventListener('gesturechange', preventSafariNativeZoom, { passive: false });
  window.addEventListener('gestureend', preventSafariNativeZoom, { passive: false });
  document.addEventListener(
    'touchmove',
    (ev) => {
      if (ev.touches.length > 1) {
        ev.preventDefault();
      }
    },
    { passive: false }
  );

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
      hud.setZoomReadout(renderer.getZoom());
    },
    { passive: false }
  );

  // Hardened two-finger canvas pinch-to-zoom (strictly isolated to targetTouches on canvas + touchcancel cleanup)
  let prevPinchDist: number | null = null;
  const resetPinchState = (): void => {
    prevPinchDist = null;
  };
  canvas.addEventListener('touchstart', resetPinchState, { passive: true });
  canvas.addEventListener('touchend', resetPinchState, { passive: true });
  canvas.addEventListener('touchcancel', resetPinchState, { passive: true });
  canvas.addEventListener(
    'touchmove',
    (ev) => {
      ev.preventDefault();
      if (ev.targetTouches.length === 2) {
        const dx = ev.targetTouches[0].clientX - ev.targetTouches[1].clientX;
        const dy = ev.targetTouches[0].clientY - ev.targetTouches[1].clientY;
        const dist = Math.hypot(dx, dy);
        if (prevPinchDist !== null) {
          const zoomStep = clamp((dist - prevPinchDist) * 0.004, -0.08, 0.08);
          renderer.setZoom(renderer.getZoom() + zoomStep);
          hud.setZoomReadout(renderer.getZoom());
        }
        prevPinchDist = dist;
      } else {
        prevPinchDist = null;
      }
    },
    { passive: false }
  );

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
      if (ev.code === 'KeyP' || ev.key === 'p' || ev.key === 'P') {
        ev.preventDefault();
        setAutoPilot(!autoPilotActive);
        return;
      }
      const { handled, nextControls } = kb.handleKeyDown(ev, world.getSnapshot().controls);
      if (handled) {
        if (autoPilotActive) setAutoPilot(false);
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

    const curSnap = world.getSnapshot();
    if (autoPilotActive && !curSnap.completionReport && !curSnap.gameOver) {
      const pred = skipper.predict(curSnap, world.marina, 'hybrid-classifier', dtSec);
      if (pred.recommendedFenderRig !== curSnap.fenderRig) {
        world.setFenderRig(pred.recommendedFenderRig);
      }
      world.setControls(pred.controls);
      if (pred.deckCommand === 'moor-complete') {
        if (world.toggleSpringLine()) {
          sound.playCleatLatch();
        }
      } else if (pred.deckCommand === 'latch-spring' && !curSnap.activeSpringLine) {
        if (world.toggleSpringLine()) {
          sound.playCleatLatch();
        }
      } else if (pred.deckCommand === 'release-spring' && curSnap.activeSpringLine) {
        world.toggleSpringLine();
      }
      hud.setAutoPilotActive(true, pred.summaryLabel);
      renderer.setAutoPilotOverlay({
        activeWaypoint: pred.activeWaypoint,
        desiredHeadingRad: pred.desiredHeadingRad,
        predictedTrajectory: pred.predictedTrajectory,
        phaseLabel: pred.summaryLabel,
      });
    } else {
      if (!autoPilotActive) {
        const pointerThrusterHeld = Boolean(document.querySelector('.thruster-btn.pressing'));
        const nextControls = kb.step(dtSec, curSnap.controls, pointerThrusterHeld);
        world.setControls(nextControls);
      } else {
        renderer.setAutoPilotOverlay(null);
      }
    }

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
