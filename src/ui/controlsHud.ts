import { CAMPAIGN_STAGES, CampaignStage } from '../physics/campaign';
import {
  FenderRigMode,
  VESSEL_SPECS,
  VesselId,
  sanitizeFenderRig,
  sanitizeVesselId,
} from '../physics/vessels';
import { SimulationSnapshot } from '../physics/world';
import { BerthCompletionReport, ScoreIncident } from '../physics/scoring';
import { clampWindKnots, normalizeCompassDeg } from '../physics/hydrodynamics';
import { ActiveArrowHighlights } from '../input/keyboardController';
import { getLocalizedStage, getLocalizedVessel, getUiStrings } from '../i18n';

const STORAGE_KEY = 'marina_docking_progress_v1';

interface SavedStageBest {
  rank: 'S' | 'A' | 'B' | 'C' | 'D';
  score: number;
}

type SavedProgressMap = Record<string, SavedStageBest>;

function loadSavedProgress(): SavedProgressMap {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const out: SavedProgressMap = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (v && typeof v === 'object') {
        const rec = v as Record<string, unknown>;
        if (
          typeof rec.score === 'number' &&
          Number.isFinite(rec.score) &&
          typeof rec.rank === 'string' &&
          ['S', 'A', 'B', 'C', 'D'].includes(rec.rank)
        ) {
          out[k] = {
            score: Math.max(0, Math.round(rec.score)),
            rank: rec.rank as SavedStageBest['rank'],
          };
        }
      }
    }
    return out;
  } catch {
    return {};
  }
}

function saveStageCompletion(stageId: string, rank: SavedStageBest['rank'], score: number): void {
  try {
    const map = loadSavedProgress();
    const prev = map[stageId];
    if (!prev || score > prev.score) {
      map[stageId] = { rank, score };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    }
  } catch {
    // Ignore storage quota errors in private browsing mode
  }
}

export interface HudCallbacks {
  onThrottleChange: (throttle: number) => void;
  onThrottleStep: (delta: number) => void;
  onTwinThrottleChange?: (side: 'port' | 'stbd', throttle: number) => void;
  onTwinThrottleStep?: (side: 'port' | 'stbd', delta: number) => void;
  onToggleThrottleMode?: () => void;
  onHelmChange: (helm: number) => void;
  onHelmStep: (delta: number) => void;
  onBowThrusterChange: (thruster: number) => void;
  onSelectFenderRig: (rig: FenderRigMode) => void;
  onToggleSpringLine: () => void;
  onResetStage: () => void;
  onSelectCampaignStage: (stage: CampaignStage) => void;
  onApplySandboxConfig: (cfg: {
    vesselId: VesselId;
    berthId: string;
    trueWindKnots: number;
    windFromDeg: number;
    enableTraffic: boolean;
  }) => void;
  onToggleXRay: () => boolean;
  onToggleCameraMode: () => boolean;
  onZoomDelta: (delta: number) => number;
  onResetZoom: () => number;
  onToggleMute: () => boolean;
  onToggleAutoPilot?: () => boolean;
}

export class ControlsHud {
  private readonly callbacks: HudCallbacks;

  private readonly stageBadgeEl: HTMLElement;
  private readonly scoreValEl: HTMLElement;
  private readonly repairValEl: HTMLElement;
  private readonly speedValEl: HTMLElement;
  private readonly windValEl: HTMLElement;
  private readonly briefingEl: HTMLElement;
  private readonly berthStatusEl: HTMLElement;
  private readonly toastEl: HTMLElement;

  private readonly throttleLblEl: HTMLElement;
  private readonly throttleModeBtnEl: HTMLButtonElement;
  private readonly singleThrottleWrapEl: HTMLElement;
  private readonly twinThrottleWrapEl: HTMLElement;
  private readonly throttleTrackEl: HTMLElement;
  private readonly throttleKnobEl: HTMLElement;
  private readonly portThrottleTrackEl: HTMLElement;
  private readonly portThrottleKnobEl: HTMLElement;
  private readonly stbdThrottleTrackEl: HTMLElement;
  private readonly stbdThrottleKnobEl: HTMLElement;
  private readonly helmTrackEl: HTMLElement;
  private readonly helmKnobEl: HTMLElement;
  private readonly keyUpBtn: HTMLButtonElement;
  private readonly keyDownBtn: HTMLButtonElement;
  private readonly portUpBtn: HTMLButtonElement;
  private readonly portDownBtn: HTMLButtonElement;
  private readonly stbdUpBtn: HTMLButtonElement;
  private readonly stbdDownBtn: HTMLButtonElement;
  private readonly keyLeftBtn: HTMLButtonElement;
  private readonly keyRightBtn: HTMLButtonElement;
  private readonly thrusterRowEl: HTMLElement;
  private readonly lassoBtnEl: HTMLButtonElement;
  private readonly zoomResetBtn: HTMLButtonElement;
  private readonly autoPilotBtn: HTMLButtonElement;
  private readonly rigBtns = new Map<FenderRigMode, HTMLButtonElement>();
  private readonly modalHostEl: HTMLElement;

  private currentStage: CampaignStage = CAMPAIGN_STAGES[0];
  private toastClearTimer: number | null = null;
  private activeScorecardNextAction: (() => void) | null = null;

  constructor(container: HTMLElement, canvasViewportEl: HTMLElement, callbacks: HudCallbacks) {
    this.callbacks = callbacks;
    const t = getUiStrings();
    const initialStageLoc = getLocalizedStage(this.currentStage);

    // Top Nautical Telemetry Strip
    const topBar = el('header', 'hud-top-bar');
    const brandGroup = el('div', 'brand-group');
    const titleEl = el('h1', 'app-title', t.appTitle);
    this.stageBadgeEl = el('span', 'stage-tag', initialStageLoc.title);
    brandGroup.append(titleEl, this.stageBadgeEl);

    const strip = el('div', 'telemetry-strip');
    this.scoreValEl = el('span', 'stat-value good', '1000');
    this.repairValEl = el('span', 'stat-value good', '$0');
    this.speedValEl = el('span', 'stat-value', `0.0 ${t.knotsUnit}`);
    this.windValEl = el('span', 'stat-value warn', `2 ${t.knotsUnit} ${t.compassDirs[0]}`);

    strip.append(
      statChip(t.scoreLabel, this.scoreValEl),
      statChip(t.repairBillLabel, this.repairValEl),
      statChip(t.speedLabel, this.speedValEl),
      statChip(t.windLabel, this.windValEl)
    );

    const actions = el('div', 'top-actions');
    const stagesBtn = btn(t.stagesWindBtn, 'hud-btn primary', () => this.openSetupModal());
    this.autoPilotBtn = btn(t.autoPilotOffBtn, 'hud-btn', () => {
      if (!this.callbacks.onToggleAutoPilot) return;
      const on = this.callbacks.onToggleAutoPilot();
      this.setAutoPilotActive(on);
    });
    const retryBtn = btn(t.retryBtn, 'hud-btn', () => this.callbacks.onResetStage());
    const xrayBtn = btn(t.xrayOnBtn, 'hud-btn active-toggle', () => {
      const on = this.callbacks.onToggleXRay();
      const s = getUiStrings();
      xrayBtn.textContent = on ? s.xrayOnBtn : s.xrayOffBtn;
      xrayBtn.classList.toggle('active-toggle', on);
    });
    const muteBtn = btn(t.soundOnBtn, 'hud-btn', () => {
      const muted = this.callbacks.onToggleMute();
      const s = getUiStrings();
      muteBtn.textContent = muted ? s.soundMutedBtn : s.soundOnBtn;
    });
    const helpBtn = btn(t.helpBtn, 'hud-btn', () => this.openHelpModal());
    actions.append(stagesBtn, this.autoPilotBtn, retryBtn, xrayBtn, muteBtn, helpBtn);
    topBar.append(brandGroup, strip, actions);

    // Center Live Briefing, Live Docking Checklist Pill & Incident Banner
    const bannerZone = el('div', 'hud-banner-zone');
    this.briefingEl = el('div', 'briefing-bar', initialStageLoc.briefing);
    this.berthStatusEl = el('div', 'berth-checklist-pill');
    this.berthStatusEl.style.display = 'none';
    this.toastEl = el('div', 'incident-toast');
    this.toastEl.style.opacity = '0';
    bannerZone.append(this.briefingEl, this.berthStatusEl, this.toastEl);
    canvasViewportEl.append(bannerZone);

    // 1. Left Throttle Telegraph Lever(s) (Single or Twin Port/Starboard + Unified/Split Toggle)
    const throttleCard = el('div', 'throttle-card');
    this.throttleLblEl = el('span', 'stat-label', t.throttleSingleLabel);
    this.throttleModeBtnEl = btn(t.modeUnifiedBtn, 'hud-btn throttle-mode-btn', () => {
      this.callbacks.onToggleThrottleMode?.();
    });
    this.throttleModeBtnEl.style.display = 'none';

    this.singleThrottleWrapEl = el('div', 'single-throttle-wrap');
    this.keyUpBtn = btn('▲', 'key-cap-btn', () => this.callbacks.onThrottleStep(0.1));
    this.keyUpBtn.title = t.increaseThrottleTooltip;

    this.throttleTrackEl = el('div', 'throttle-track');
    this.throttleTrackEl.id = 'throttle-lever-track';
    const centerLine = el('div', 'throttle-center-line');
    this.throttleKnobEl = el('div', 'throttle-knob', 'N');
    this.throttleTrackEl.append(centerLine, this.throttleKnobEl);

    this.keyDownBtn = btn('▼', 'key-cap-btn', () => this.callbacks.onThrottleStep(-0.1));
    this.keyDownBtn.title = t.decreaseThrottleTooltip;
    this.singleThrottleWrapEl.append(this.keyUpBtn, this.throttleTrackEl, this.keyDownBtn);

    // Twin-Engine Port & Starboard Levers
    this.twinThrottleWrapEl = el('div', 'twin-throttle-wrap');
    this.twinThrottleWrapEl.style.display = 'none';

    const portCol = el('div', 'twin-lever-col');
    const portTag = el('span', 'stat-label', t.portLeverLabel);
    this.portUpBtn = btn('▲', 'key-cap-btn', () =>
      this.callbacks.onTwinThrottleStep
        ? this.callbacks.onTwinThrottleStep('port', 0.1)
        : this.callbacks.onThrottleStep(0.1)
    );
    this.portUpBtn.title = t.increasePortThrottleTooltip;
    this.portThrottleTrackEl = el('div', 'throttle-track');
    this.portThrottleTrackEl.id = 'throttle-port-track';
    this.portThrottleKnobEl = el('div', 'throttle-knob', 'N');
    this.portThrottleTrackEl.append(el('div', 'throttle-center-line'), this.portThrottleKnobEl);
    this.portDownBtn = btn('▼', 'key-cap-btn', () =>
      this.callbacks.onTwinThrottleStep
        ? this.callbacks.onTwinThrottleStep('port', -0.1)
        : this.callbacks.onThrottleStep(-0.1)
    );
    this.portDownBtn.title = t.decreasePortThrottleTooltip;
    portCol.append(portTag, this.portUpBtn, this.portThrottleTrackEl, this.portDownBtn);

    const stbdCol = el('div', 'twin-lever-col');
    const stbdTag = el('span', 'stat-label', t.stbdLeverLabel);
    this.stbdUpBtn = btn('▲', 'key-cap-btn', () =>
      this.callbacks.onTwinThrottleStep
        ? this.callbacks.onTwinThrottleStep('stbd', 0.1)
        : this.callbacks.onThrottleStep(0.1)
    );
    this.stbdUpBtn.title = t.increaseStbdThrottleTooltip;
    this.stbdThrottleTrackEl = el('div', 'throttle-track');
    this.stbdThrottleTrackEl.id = 'throttle-stbd-track';
    this.stbdThrottleKnobEl = el('div', 'throttle-knob', 'N');
    this.stbdThrottleTrackEl.append(el('div', 'throttle-center-line'), this.stbdThrottleKnobEl);
    this.stbdDownBtn = btn('▼', 'key-cap-btn', () =>
      this.callbacks.onTwinThrottleStep
        ? this.callbacks.onTwinThrottleStep('stbd', -0.1)
        : this.callbacks.onThrottleStep(-0.1)
    );
    this.stbdDownBtn.title = t.decreaseStbdThrottleTooltip;
    stbdCol.append(stbdTag, this.stbdUpBtn, this.stbdThrottleTrackEl, this.stbdDownBtn);

    this.twinThrottleWrapEl.append(portCol, stbdCol);

    const stopBtn = btn(t.neutralBtn, 'hud-btn', () => {
      this.callbacks.onThrottleChange(0);
    });
    throttleCard.append(
      this.throttleLblEl,
      this.throttleModeBtnEl,
      this.singleThrottleWrapEl,
      this.twinThrottleWrapEl,
      stopBtn
    );

    // 2. Center Seamanship Utility Bar (4-Fender Rig Presets + Cleat Lasso + Camera)
    const centerBar = el('div', 'center-utility-bar');
    const rigGroup = el('div', 'rig-segment-group');
    const rigTitle = el('span', 'stat-label', t.fendersLabel);
    rigGroup.append(rigTitle);

    for (const [mode, label] of [
      ['bow', t.fenderBow],
      ['midships', t.fenderMid],
      ['quarter', t.fenderAft],
    ] as const) {
      const b = btn(label, mode === 'midships' ? 'hud-btn active-toggle' : 'hud-btn', () => {
        this.callbacks.onSelectFenderRig(mode);
      });
      this.rigBtns.set(mode, b);
      rigGroup.append(b);
    }

    this.lassoBtnEl = btn(t.cleatLineDefaultBtn, 'hud-btn lasso-btn', () => {
      this.callbacks.onToggleSpringLine();
    });

    const camBtn = btn(t.camNorthUpBtn, 'hud-btn', () => {
      const boatUp = this.callbacks.onToggleCameraMode();
      const s = getUiStrings();
      camBtn.textContent = boatUp ? s.camBoatUpBtn : s.camNorthUpBtn;
      camBtn.classList.toggle('active-toggle', boatUp);
    });

    const zoomOutBtn = btn('-', 'hud-btn', () => {
      const z = this.callbacks.onZoomDelta(-0.18);
      this.setZoomReadout(z);
    });
    this.zoomResetBtn = btn('100%', 'hud-btn', () => {
      const z = this.callbacks.onResetZoom();
      this.setZoomReadout(z);
    });
    this.zoomResetBtn.title = t.zoomResetTooltip;
    const zoomInBtn = btn('+', 'hud-btn', () => {
      const z = this.callbacks.onZoomDelta(0.18);
      this.setZoomReadout(z);
    });

    centerBar.append(rigGroup, this.lassoBtnEl, camBtn, zoomOutBtn, this.zoomResetBtn, zoomInBtn);

    // 3. Right Helm Wheel + ◀ / ▶ Arrow Steppers & Bow Thruster Rocker
    const helmCluster = el('div', 'helm-cluster');
    this.thrusterRowEl = el('div', 'thruster-row');
    const btPortBtn = el('button', 'thruster-btn', t.bowPortBtn);
    const btStbdBtn = el('button', 'thruster-btn', t.bowStbdBtn);
    this.wireHoldButton(btPortBtn, -1);
    this.wireHoldButton(btStbdBtn, 1);
    this.thrusterRowEl.append(btPortBtn, btStbdBtn);

    const helmLbl = el('span', 'stat-label', t.helmLabel);
    const helmRow = el('div', 'helm-row-with-keys');
    this.keyLeftBtn = btn('◀', 'key-cap-btn', () => this.callbacks.onHelmStep(-0.14));
    this.keyLeftBtn.title = t.helmLeftTooltip;

    this.helmTrackEl = el('div', 'helm-slider-track');
    this.helmTrackEl.id = 'helm-wheel-track';
    const helmCenterTick = el('div', 'helm-center-tick');
    this.helmKnobEl = el('div', 'helm-knob', '0°');
    this.helmTrackEl.append(helmCenterTick, this.helmKnobEl);

    this.keyRightBtn = btn('▶', 'key-cap-btn', () => this.callbacks.onHelmStep(0.14));
    this.keyRightBtn.title = t.helmRightTooltip;
    helmRow.append(this.keyLeftBtn, this.helmTrackEl, this.keyRightBtn);

    const centerHelmBtn = btn(t.centerHelmBtn, 'hud-btn', () => {
      this.callbacks.onHelmChange(0);
    });

    helmCluster.append(this.thrusterRowEl, helmLbl, helmRow, centerHelmBtn);

    this.modalHostEl = el('div', 'modal-host');
    container.append(
      topBar,
      canvasViewportEl,
      throttleCard,
      centerBar,
      helmCluster,
      this.modalHostEl
    );

    this.wireThrottleDrag();
    this.wireHelmDrag();
  }

  private wireHoldButton(buttonEl: HTMLElement, dir: -1 | 1): void {
    const start = (ev: Event) => {
      ev.preventDefault();
      buttonEl.classList.add('pressing');
      this.callbacks.onBowThrusterChange(dir);
    };
    const end = (ev: Event) => {
      ev.preventDefault();
      buttonEl.classList.remove('pressing');
      this.callbacks.onBowThrusterChange(0);
    };
    buttonEl.addEventListener('pointerdown', start);
    buttonEl.addEventListener('pointerup', end);
    buttonEl.addEventListener('pointercancel', end);
    buttonEl.addEventListener('pointerleave', end);
  }

  private wireThrottleDrag(): void {
    const bindTrack = (trackEl: HTMLElement, onVal: (snapped: number) => void): void => {
      let dragging = false;
      const applyPointer = (clientY: number) => {
        const rect = trackEl.getBoundingClientRect();
        const norm = 1 - ((clientY - rect.top) / rect.height) * 2;
        const clamped = Math.max(-1, Math.min(1, norm));
        const snapped = Math.abs(clamped) < 0.08 ? 0 : clamped;
        onVal(snapped);
      };

      trackEl.addEventListener('pointerdown', (e) => {
        dragging = true;
        trackEl.setPointerCapture(e.pointerId);
        applyPointer(e.clientY);
      });
      trackEl.addEventListener('pointermove', (e) => {
        if (dragging) applyPointer(e.clientY);
      });
      const stopDrag = () => {
        dragging = false;
      };
      trackEl.addEventListener('pointerup', stopDrag);
      trackEl.addEventListener('pointercancel', stopDrag);
    };

    bindTrack(this.throttleTrackEl, (snapped) => this.callbacks.onThrottleChange(snapped));
    bindTrack(this.portThrottleTrackEl, (snapped) => {
      if (this.callbacks.onTwinThrottleChange) {
        this.callbacks.onTwinThrottleChange('port', snapped);
      } else {
        this.callbacks.onThrottleChange(snapped);
      }
    });
    bindTrack(this.stbdThrottleTrackEl, (snapped) => {
      if (this.callbacks.onTwinThrottleChange) {
        this.callbacks.onTwinThrottleChange('stbd', snapped);
      } else {
        this.callbacks.onThrottleChange(snapped);
      }
    });
  }

  private wireHelmDrag(): void {
    let dragging = false;
    const applyPointer = (clientX: number) => {
      const rect = this.helmTrackEl.getBoundingClientRect();
      const norm = ((clientX - rect.left) / rect.width) * 2 - 1;
      const clamped = Math.max(-1, Math.min(1, norm));
      const snapped = Math.abs(clamped) < 0.06 ? 0 : clamped;
      this.callbacks.onHelmChange(snapped);
    };

    this.helmTrackEl.addEventListener('pointerdown', (e) => {
      dragging = true;
      this.helmTrackEl.setPointerCapture(e.pointerId);
      applyPointer(e.clientX);
    });
    this.helmTrackEl.addEventListener('pointermove', (e) => {
      if (dragging) applyPointer(e.clientX);
    });
    const stopDrag = () => {
      dragging = false;
    };
    this.helmTrackEl.addEventListener('pointerup', stopDrag);
    this.helmTrackEl.addEventListener('pointercancel', stopDrag);
  }

  public setCurrentStageMeta(title: string, briefing: string, stageRef?: CampaignStage): void {
    if (stageRef) this.currentStage = stageRef;
    this.stageBadgeEl.textContent = title;
    this.briefingEl.textContent = briefing;
  }

  public setZoomReadout(zoom: number): void {
    const pct = Math.round(zoom * 100);
    this.zoomResetBtn.textContent = `${pct}%`;
    this.zoomResetBtn.classList.toggle('active-toggle', pct !== 100);
  }

  public setAutoPilotActive(active: boolean, statusLabel?: string): void {
    const t = getUiStrings();
    this.autoPilotBtn.textContent = active ? t.autoPilotOnBtn : t.autoPilotOffBtn;
    this.autoPilotBtn.classList.toggle('active-toggle', active);
    if (active && statusLabel) {
      this.briefingEl.textContent = statusLabel;
    } else if (!active) {
      this.briefingEl.textContent = getLocalizedStage(this.currentStage).briefing;
    }
  }

  public showIncidentToast(incident: ScoreIncident): void {
    this.toastEl.textContent = incident.label;
    this.toastEl.className = 'incident-toast';
    if (incident.kind === 'fender-butter-kiss') {
      this.toastEl.classList.add('kiss');
    } else if (incident.kind === 'fender-hard-bump') {
      this.toastEl.classList.add('bump');
    } else {
      this.toastEl.classList.add('scrape');
    }
    this.toastEl.style.opacity = '1';

    if (this.toastClearTimer !== null) {
      window.clearTimeout(this.toastClearTimer);
    }
    this.toastClearTimer = window.setTimeout(() => {
      this.toastEl.style.opacity = '0';
    }, 3100);
  }

  public updateTelemetry(snap: SimulationSnapshot, keyHighlights?: ActiveArrowHighlights): void {
    const t = getUiStrings();
    this.scoreValEl.textContent = `${snap.liveScore}`;
    this.repairValEl.textContent = `$${snap.repairCostUsd.toLocaleString('en-US')}`;
    this.repairValEl.className =
      snap.repairCostUsd === 0
        ? 'stat-value good'
        : snap.repairCostUsd >= 7000
          ? 'stat-value danger'
          : 'stat-value warn';

    const dirPrefix = snap.telemetry.surgeKnots < -0.08 ? t.asternPrefix : '';
    this.speedValEl.textContent = `${dirPrefix}${snap.telemetry.speedKnots.toFixed(1)} ${t.knotsUnit}`;

    const gustKn = Math.round(snap.telemetry.windForceBody.effectiveKnots);
    const compassIdx = Math.round(normalizeCompassDeg(snap.windFromDeg) / 45) % 8;
    const shelterNote = snap.shelterFactor < 0.85 ? t.leeNote : '';
    this.windValEl.textContent = `${gustKn} ${t.knotsUnit} ${t.compassDirs[compassIdx]}${shelterNote}`;

    // Update Single vs. Twin Throttle Levers & Mode Toggle
    const isTwin = snap.vesselSpec.engineCount === 2;
    const mode = isTwin
      ? (snap.controls.throttleMode ?? snap.vesselSpec.defaultThrottleMode)
      : 'unified';
    const isSeparate = isTwin && mode === 'separate';

    this.throttleModeBtnEl.style.display = isTwin ? 'inline-flex' : 'none';
    this.singleThrottleWrapEl.style.display = isTwin ? 'none' : 'flex';
    this.twinThrottleWrapEl.style.display = isTwin ? 'flex' : 'none';

    if (isTwin) {
      this.throttleLblEl.textContent = isSeparate
        ? t.throttleTwinSplitLabel
        : t.throttleTwinUnifiedLabel;
      this.throttleModeBtnEl.textContent = isSeparate
        ? t.modeSplitToUnifiedBtn
        : t.modeUnifiedToSplitBtn;
      this.throttleModeBtnEl.classList.toggle('active-toggle', isSeparate);
    } else {
      this.throttleLblEl.textContent = t.throttleSingleLabel;
    }

    const updateKnob = (knobEl: HTMLElement, val: number): void => {
      const pct = (1 - val) * 50;
      knobEl.style.top = `${Math.max(10, Math.min(90, pct))}%`;
      const tInt = Math.round(val * 100);
      knobEl.textContent =
        Math.abs(tInt) < 4 ? 'N' : tInt > 0 ? `F${tInt}` : `R${Math.abs(tInt)}`;
    };

    updateKnob(this.throttleKnobEl, snap.controls.throttle);
    updateKnob(this.portThrottleKnobEl, snap.controls.throttlePort ?? snap.controls.throttle);
    updateKnob(this.stbdThrottleKnobEl, snap.controls.throttleStbd ?? snap.controls.throttle);

    // Update Helm Knob Position
    const hPct = (snap.controls.helm + 1) * 50;
    this.helmKnobEl.style.left = `${Math.max(12, Math.min(88, hPct))}%`;
    const deg = Math.round(snap.telemetry.helmAngleDeg);
    this.helmKnobEl.textContent =
      deg === 0 ? '0°' : deg > 0 ? `${deg}°${t.helmRightSuffix}` : `${Math.abs(deg)}°${t.helmLeftSuffix}`;

    // Illuminate Arrow Key Caps live when pressed on keyboard
    if (keyHighlights) {
      this.keyUpBtn.classList.toggle('active', keyHighlights.up);
      this.keyDownBtn.classList.toggle('active', keyHighlights.down);
      this.portUpBtn.classList.toggle(
        'active',
        isSeparate ? keyHighlights.portUp : keyHighlights.up
      );
      this.portDownBtn.classList.toggle(
        'active',
        isSeparate ? keyHighlights.portDown : keyHighlights.down
      );
      this.stbdUpBtn.classList.toggle(
        'active',
        isSeparate ? keyHighlights.stbdUp : keyHighlights.up
      );
      this.stbdDownBtn.classList.toggle(
        'active',
        isSeparate ? keyHighlights.stbdDown : keyHighlights.down
      );
      this.keyLeftBtn.classList.toggle('active', keyHighlights.left);
      this.keyRightBtn.classList.toggle('active', keyHighlights.right);
    }

    // Show/hide Bow Thruster rocker for 8m Cruiser
    this.thrusterRowEl.style.display = snap.vesselSpec.hasBowThruster ? 'flex' : 'none';

    // Update Fender Rig Active Pill
    for (const [mode, buttonEl] of this.rigBtns.entries()) {
      buttonEl.classList.toggle('active-toggle', snap.fenderRig === mode);
    }

    // Live 3-Step Docking Checklist & Dual-Mode Completion Status
    const chk = snap.dockingChecklist;
    if (chk.nearBerth && !snap.completionReport && !snap.gameOver) {
      this.berthStatusEl.style.display = 'block';
      const c1 = chk.inBerthZone ? t.checklistInSlip : t.checklistEnterSlip;
      const degErr = Math.round(chk.headingErrorDeg);
      const c2 = chk.headingAligned
        ? t.checklistAligned(degErr)
        : t.checklistAlignTarget(degErr);
      const knStr = chk.speedKnots.toFixed(1);
      const c3 = chk.speedStopped
        ? t.checklistStopped(knStr)
        : t.checklistSlowTarget(knStr);

      if (chk.readyToMoor) {
        const pct = Math.round(snap.dockingHoldProgress * 100);
        this.berthStatusEl.textContent = `${c1} · ${c2} · ${c3} — ${t.checklistMooringHold(pct)}`;
        this.berthStatusEl.className = 'berth-checklist-pill ready';
      } else {
        this.berthStatusEl.textContent = `${c1} · ${c2} · ${c3}`;
        this.berthStatusEl.className = 'berth-checklist-pill';
      }
    } else {
      this.berthStatusEl.style.display = 'none';
    }

    // Update Cleat Lasso / Instant Tie Mooring Lines & Finish Button State
    if (chk.readyToMoor && !snap.completionReport) {
      this.lassoBtnEl.textContent = t.tieLinesFinishBtn;
      this.lassoBtnEl.classList.add('attached');
      this.lassoBtnEl.disabled = false;
    } else if (snap.activeSpringLine) {
      this.lassoBtnEl.textContent = t.castOffLineBtn;
      this.lassoBtnEl.classList.add('attached');
      this.lassoBtnEl.disabled = false;
    } else if (snap.nearestCleatCandidate) {
      this.lassoBtnEl.textContent = t.lassoCleatDistBtn(
        snap.nearestCleatCandidate.distM.toFixed(1)
      );
      this.lassoBtnEl.classList.remove('attached');
      this.lassoBtnEl.disabled = false;
    } else {
      this.lassoBtnEl.textContent = t.cleatOutOfReachBtn;
      this.lassoBtnEl.classList.remove('attached');
      this.lassoBtnEl.disabled = true;
    }
  }

  public openHelpModal(): void {
    if (this.modalHostEl.childElementCount > 0) {
      this.modalHostEl.replaceChildren();
      return;
    }
    const t = getUiStrings();
    const backdrop = el('div', 'modal-backdrop');
    const card = el('div', 'modal-card');

    const headerRow = el('div', 'brand-group');
    headerRow.style.justifyContent = 'space-between';
    headerRow.style.width = '100%';
    headerRow.append(
      el('h2', 'app-title', t.helpModalTitle),
      btn(t.closeEscBtn, 'hud-btn', () => this.modalHostEl.replaceChildren())
    );

    const grid = el('div', 'help-grid');

    for (const [keys, desc] of t.helpItems) {
      const box = el('div', 'help-item');
      box.append(el('strong', '', keys), el('span', 'stat-label', desc));
      grid.append(box);
    }

    card.append(headerRow, grid);
    backdrop.append(card);
    this.modalHostEl.append(backdrop);
  }

  public openSetupModal(): void {
    this.activeScorecardNextAction = null;
    this.modalHostEl.replaceChildren();
    const t = getUiStrings();
    const backdrop = el('div', 'modal-backdrop');
    const card = el('div', 'modal-card');

    const headerRow = el('div', 'brand-group');
    headerRow.style.justifyContent = 'space-between';
    headerRow.style.width = '100%';
    const heading = el('h2', 'app-title', t.setupModalTitle);
    const closeBtn = btn(t.closeBtn, 'hud-btn', () => this.modalHostEl.replaceChildren());
    headerRow.append(heading, closeBtn);

    const saved = loadSavedProgress();
    const grid = el('div', 'stage-grid');
    for (const st of CAMPAIGN_STAGES) {
      const locSt = getLocalizedStage(st);
      const item = el(
        'button',
        st.id === this.currentStage.id ? 'stage-item-btn selected' : 'stage-item-btn'
      );
      const best = saved[st.id];
      const badgeStr = best ? ` [${best.rank} · ${best.score} ${t.ptsUnit}]` : '';
      const topLine = el('strong', '', `${locSt.title}${badgeStr}`);
      const subLine = el('span', 'stat-label', locSt.subtitle);
      item.append(topLine, subLine);
      item.addEventListener('click', () => {
        item.blur();
        this.currentStage = st;
        this.modalHostEl.replaceChildren();
        this.callbacks.onSelectCampaignStage(st);
      });
      grid.append(item);
    }

    // Custom Free Practice Sandbox Box (Any Boat + Wind 0..25 kn + Wind Direction 0..359 deg)
    const sandboxTitle = el('h3', 'app-title', t.sandboxTitle);
    const sbGrid = el('div', 'sandbox-controls-grid');

    const vesselSelect = document.createElement('select');
    vesselSelect.className = 'hud-btn';
    for (const v of Object.values(VESSEL_SPECS)) {
      const locV = getLocalizedVessel(v);
      const opt = document.createElement('option');
      opt.value = v.id;
      opt.textContent = locV.name;
      if (v.id === this.currentStage.vesselId) opt.selected = true;
      vesselSelect.append(opt);
    }

    const berthSelect = document.createElement('select');
    berthSelect.className = 'hud-btn';
    for (const bId of [
      'slip-a-bow',
      'slip-b-tight',
      'east-seawall',
      'south-med-stern',
      'south-east-spring',
    ] as const) {
      const opt = document.createElement('option');
      opt.value = bId;
      opt.textContent = t.berthOptions[bId] ?? bId;
      if (bId === this.currentStage.berthId) opt.selected = true;
      berthSelect.append(opt);
    }

    const windSpeedInput = document.createElement('input');
    windSpeedInput.type = 'range';
    windSpeedInput.min = '0';
    windSpeedInput.max = '25';
    windSpeedInput.value = String(this.currentStage.trueWindKnots);
    const windSpeedVal = el('span', 'stat-value warn', t.knotsValueLabel(windSpeedInput.value));
    windSpeedInput.addEventListener('input', () => {
      windSpeedVal.textContent = getUiStrings().knotsValueLabel(windSpeedInput.value);
    });

    const windDirInput = document.createElement('input');
    windDirInput.type = 'range';
    windDirInput.min = '0';
    windDirInput.max = '355';
    windDirInput.step = '5';
    windDirInput.value = String(this.currentStage.windFromDeg);
    const windDirVal = el('span', 'stat-value', `${windDirInput.value}°`);
    windDirInput.addEventListener('input', () => {
      windDirVal.textContent = `${windDirInput.value}°`;
    });

    const trafficCheck = document.createElement('input');
    trafficCheck.type = 'checkbox';
    trafficCheck.checked = this.currentStage.enableTraffic;

    sbGrid.append(
      fieldWrap(t.vesselTypeField, vesselSelect),
      fieldWrap(t.targetBerthField, berthSelect),
      fieldWrap(t.windSpeedField, windSpeedInput, windSpeedVal),
      fieldWrap(t.windDirField, windDirInput, windDirVal)
    );

    const launchSandboxBtn = btn(t.launchSandboxBtn, 'hud-btn primary', () => {
      const vId = sanitizeVesselId(vesselSelect.value);
      const bId = berthSelect.value;
      const wKn = clampWindKnots(Number(windSpeedInput.value));
      const wDeg = normalizeCompassDeg(Number(windDirInput.value));
      const locV = getLocalizedVessel(VESSEL_SPECS[vId]);
      const s = getUiStrings();
      this.setCurrentStageMeta(
        `${s.sandboxStagePrefix}: ${locV.shortName}`,
        `${locV.tip}`
      );
      this.modalHostEl.replaceChildren();
      this.callbacks.onApplySandboxConfig({
        vesselId: vId,
        berthId: bId,
        trueWindKnots: wKn,
        windFromDeg: wDeg,
        enableTraffic: trafficCheck.checked,
      });
    });

    card.append(headerRow, grid, sandboxTitle, sbGrid, launchSandboxBtn);
    backdrop.append(card);
    this.modalHostEl.append(backdrop);
  }

  public closeAnyModal(): void {
    this.activeScorecardNextAction = null;
    this.modalHostEl.replaceChildren();
  }

  public triggerScorecardPrimaryAction(): boolean {
    if (this.activeScorecardNextAction) {
      const fn = this.activeScorecardNextAction;
      this.activeScorecardNextAction = null;
      fn();
      return true;
    }
    return false;
  }

  public showCompletionModal(report: BerthCompletionReport): void {
    saveStageCompletion(this.currentStage.id, report.rank, report.finalScore);
    this.modalHostEl.replaceChildren();
    this.activeScorecardNextAction = null;
    const t = getUiStrings();

    const backdrop = el('div', 'modal-backdrop');
    const card = el('div', 'modal-card');

    const localizedRankTitle = t.rankTitles[report.rank] ?? report.rankTitle;
    const title = el(
      'h2',
      'app-title',
      t.rankModalTitle(report.rank, localizedRankTitle, report.finalScore)
    );
    const sub = el(
      'div',
      'stat-label',
      t.rankModalBreakdown(
        report.alignmentBonus,
        report.cleanHullBonus,
        report.butterKissBonus,
        report.windMultiplier,
        report.totalRepairCostUsd.toLocaleString('en-US')
      )
    );

    const actionRow = el('div', 'top-actions');
    const nextIdx = CAMPAIGN_STAGES.findIndex((s) => s.id === this.currentStage.id) + 1;
    if (nextIdx > 0 && nextIdx < CAMPAIGN_STAGES.length) {
      const nextStage = CAMPAIGN_STAGES[nextIdx];
      const locNext = getLocalizedStage(nextStage);
      const goNext = () => {
        this.activeScorecardNextAction = null;
        this.currentStage = nextStage;
        this.modalHostEl.replaceChildren();
        this.callbacks.onSelectCampaignStage(nextStage);
      };
      this.activeScorecardNextAction = goNext;
      const nextBtn = btn(t.nextStageBtn(locNext.title), 'hud-btn primary', goNext);
      actionRow.append(nextBtn);
    }

    const replayBtn = btn(t.replayStageBtn, 'hud-btn', () => {
      this.activeScorecardNextAction = null;
      this.modalHostEl.replaceChildren();
      this.callbacks.onResetStage();
    });
    const chooseBtn = btn(t.allStagesBtn, 'hud-btn', () => this.openSetupModal());
    actionRow.append(replayBtn, chooseBtn);

    card.append(title, sub, actionRow);
    backdrop.append(card);
    this.modalHostEl.append(backdrop);
  }

  public showGameOverModal(
    repairCostUsd: number,
    incidents: ReadonlyArray<ScoreIncident>
  ): void {
    this.modalHostEl.replaceChildren();
    this.activeScorecardNextAction = null;
    const t = getUiStrings();
    const repairStr = repairCostUsd.toLocaleString('en-US');

    const backdrop = el('div', 'modal-backdrop');
    const card = el('div', 'modal-card');
    card.style.borderColor = 'var(--accent-coral)';

    const title = el('h2', 'app-title', t.gameOverTitle(repairStr));
    title.style.color = 'var(--accent-coral)';

    const latestCause = incidents[0] ? t.gameOverLatestImpact(incidents[0].label) : '';
    const sub = el('div', 'stat-label', t.gameOverSummary(latestCause, repairStr));

    const retryNow = () => {
      this.activeScorecardNextAction = null;
      this.modalHostEl.replaceChildren();
      this.callbacks.onResetStage();
    };
    this.activeScorecardNextAction = retryNow;

    const actionRow = el('div', 'top-actions');
    const retryBtn = btn(t.retryStageEnterBtn, 'hud-btn primary', retryNow);
    const chooseBtn = btn(t.stagesWindBtn, 'hud-btn', () => this.openSetupModal());
    actionRow.append(retryBtn, chooseBtn);

    card.append(title, sub, actionRow);
    backdrop.append(card);
    this.modalHostEl.append(backdrop);
  }
}

export { sanitizeFenderRig };

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function btn(label: string, className: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = className;
  b.textContent = label;
  b.addEventListener('click', () => {
    // Release focus from HUD buttons immediately so keyboard Arrow Keys (↑/↓/←/→) never get intercepted!
    b.blur();
    onClick();
  });
  return b;
}

function statChip(label: string, valueNode: HTMLElement): HTMLElement {
  const box = el('div', 'stat-chip');
  box.append(el('span', 'stat-label', label), valueNode);
  return box;
}

function fieldWrap(label: string, inputNode: HTMLElement, extraNode?: HTMLElement): HTMLElement {
  const box = el('label', 'control-field');
  const top = el('span', 'stat-label', label);
  box.append(top, inputNode);
  if (extraNode) box.append(extraNode);
  return box;
}
