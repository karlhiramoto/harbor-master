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

  private readonly throttleTrackEl: HTMLElement;
  private readonly throttleKnobEl: HTMLElement;
  private readonly helmTrackEl: HTMLElement;
  private readonly helmKnobEl: HTMLElement;
  private readonly keyUpBtn: HTMLButtonElement;
  private readonly keyDownBtn: HTMLButtonElement;
  private readonly keyLeftBtn: HTMLButtonElement;
  private readonly keyRightBtn: HTMLButtonElement;
  private readonly thrusterRowEl: HTMLElement;
  private readonly lassoBtnEl: HTMLButtonElement;
  private readonly zoomResetBtn: HTMLButtonElement;
  private readonly rigBtns = new Map<FenderRigMode, HTMLButtonElement>();
  private readonly modalHostEl: HTMLElement;

  private currentStage: CampaignStage = CAMPAIGN_STAGES[0];
  private toastClearTimer: number | null = null;
  private activeScorecardNextAction: (() => void) | null = null;

  constructor(container: HTMLElement, canvasViewportEl: HTMLElement, callbacks: HudCallbacks) {
    this.callbacks = callbacks;

    // Top Nautical Telemetry Strip
    const topBar = el('header', 'hud-top-bar');
    const brandGroup = el('div', 'brand-group');
    const titleEl = el('h1', 'app-title', 'Harbor Master');
    this.stageBadgeEl = el('span', 'stage-tag', this.currentStage.title);
    brandGroup.append(titleEl, this.stageBadgeEl);

    const strip = el('div', 'telemetry-strip');
    this.scoreValEl = el('span', 'stat-value good', '1000');
    this.repairValEl = el('span', 'stat-value good', '$0');
    this.speedValEl = el('span', 'stat-value', '0.0 kn');
    this.windValEl = el('span', 'stat-value warn', '2 kn N');

    strip.append(
      statChip('Score', this.scoreValEl),
      statChip('Repair Bill', this.repairValEl),
      statChip('Speed', this.speedValEl),
      statChip('Wind', this.windValEl)
    );

    const actions = el('div', 'top-actions');
    const stagesBtn = btn('Stages / Wind', 'hud-btn primary', () => this.openSetupModal());
    const retryBtn = btn('Retry (R)', 'hud-btn', () => this.callbacks.onResetStage());
    const xrayBtn = btn('X-Ray: ON', 'hud-btn active-toggle', () => {
      const on = this.callbacks.onToggleXRay();
      xrayBtn.textContent = on ? 'X-Ray: ON' : 'X-Ray: OFF';
      xrayBtn.classList.toggle('active-toggle', on);
    });
    const muteBtn = btn('Sound: ON', 'hud-btn', () => {
      const muted = this.callbacks.onToggleMute();
      muteBtn.textContent = muted ? 'Sound: Muted' : 'Sound: ON';
    });
    const helpBtn = btn('? Help (H)', 'hud-btn', () => this.openHelpModal());
    actions.append(stagesBtn, retryBtn, xrayBtn, muteBtn, helpBtn);
    topBar.append(brandGroup, strip, actions);

    // Center Live Briefing, Live Docking Checklist Pill & Incident Banner
    const bannerZone = el('div', 'hud-banner-zone');
    this.briefingEl = el('div', 'briefing-bar', this.currentStage.briefing);
    this.berthStatusEl = el('div', 'berth-checklist-pill');
    this.berthStatusEl.style.display = 'none';
    this.toastEl = el('div', 'incident-toast');
    this.toastEl.style.opacity = '0';
    bannerZone.append(this.briefingEl, this.berthStatusEl, this.toastEl);
    canvasViewportEl.append(bannerZone);

    // 1. Left Throttle Telegraph Lever + ↑ / ↓ Key Steppers
    const throttleCard = el('div', 'throttle-card');
    const throttleLbl = el('span', 'stat-label', 'Throttle (↑/↓ · W/S)');
    this.keyUpBtn = btn('▲', 'key-cap-btn', () => this.callbacks.onThrottleStep(0.1));
    this.keyUpBtn.title = 'Increase Forward Throttle (Up Arrow / W)';

    this.throttleTrackEl = el('div', 'throttle-track');
    this.throttleTrackEl.id = 'throttle-lever-track';
    const centerLine = el('div', 'throttle-center-line');
    this.throttleKnobEl = el('div', 'throttle-knob', 'N');
    this.throttleTrackEl.append(centerLine, this.throttleKnobEl);

    this.keyDownBtn = btn('▼', 'key-cap-btn', () => this.callbacks.onThrottleStep(-0.1));
    this.keyDownBtn.title = 'Decrease / Reverse Throttle (Down Arrow / S)';

    const stopBtn = btn('NEUTRAL (Space)', 'hud-btn', () => {
      this.callbacks.onThrottleChange(0);
    });
    throttleCard.append(
      throttleLbl,
      this.keyUpBtn,
      this.throttleTrackEl,
      this.keyDownBtn,
      stopBtn
    );

    // 2. Center Seamanship Utility Bar (4-Fender Rig Presets + Cleat Lasso + Camera)
    const centerBar = el('div', 'center-utility-bar');
    const rigGroup = el('div', 'rig-segment-group');
    const rigTitle = el('span', 'stat-label', 'Fenders:');
    rigGroup.append(rigTitle);

    for (const [mode, label] of [
      ['bow', 'Bow'],
      ['midships', 'Mid'],
      ['quarter', 'Aft'],
    ] as const) {
      const b = btn(label, mode === 'midships' ? 'hud-btn active-toggle' : 'hud-btn', () => {
        this.callbacks.onSelectFenderRig(mode);
      });
      this.rigBtns.set(mode, b);
      rigGroup.append(b);
    }

    this.lassoBtnEl = btn('Cleat Line (M)', 'hud-btn lasso-btn', () => {
      this.callbacks.onToggleSpringLine();
    });

    const camBtn = btn('Cam: North-Up', 'hud-btn', () => {
      const boatUp = this.callbacks.onToggleCameraMode();
      camBtn.textContent = boatUp ? 'Cam: Boat-Up' : 'Cam: North-Up';
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
    this.zoomResetBtn.title = 'Tap to reset camera zoom to 100%';
    const zoomInBtn = btn('+', 'hud-btn', () => {
      const z = this.callbacks.onZoomDelta(0.18);
      this.setZoomReadout(z);
    });

    centerBar.append(rigGroup, this.lassoBtnEl, camBtn, zoomOutBtn, this.zoomResetBtn, zoomInBtn);

    // 3. Right Helm Wheel + ◀ / ▶ Arrow Steppers & Bow Thruster Rocker
    const helmCluster = el('div', 'helm-cluster');
    this.thrusterRowEl = el('div', 'thruster-row');
    const btPortBtn = el('button', 'thruster-btn', '◀ BOW PORT (Q)');
    const btStbdBtn = el('button', 'thruster-btn', 'BOW STBD (E) ▶');
    this.wireHoldButton(btPortBtn, -1);
    this.wireHoldButton(btStbdBtn, 1);
    this.thrusterRowEl.append(btPortBtn, btStbdBtn);

    const helmLbl = el('span', 'stat-label', 'Helm (←/→ · A/D)');
    const helmRow = el('div', 'helm-row-with-keys');
    this.keyLeftBtn = btn('◀', 'key-cap-btn', () => this.callbacks.onHelmStep(-0.14));
    this.keyLeftBtn.title = 'Turn Helm Port / Left (Left Arrow / A)';

    this.helmTrackEl = el('div', 'helm-slider-track');
    this.helmTrackEl.id = 'helm-wheel-track';
    const helmCenterTick = el('div', 'helm-center-tick');
    this.helmKnobEl = el('div', 'helm-knob', '0°');
    this.helmTrackEl.append(helmCenterTick, this.helmKnobEl);

    this.keyRightBtn = btn('▶', 'key-cap-btn', () => this.callbacks.onHelmStep(0.14));
    this.keyRightBtn.title = 'Turn Helm Starboard / Right (Right Arrow / D)';
    helmRow.append(this.keyLeftBtn, this.helmTrackEl, this.keyRightBtn);

    const centerHelmBtn = btn('Center Helm (C)', 'hud-btn', () => {
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
    let dragging = false;
    const applyPointer = (clientY: number) => {
      const rect = this.throttleTrackEl.getBoundingClientRect();
      const norm = 1 - ((clientY - rect.top) / rect.height) * 2;
      const clamped = Math.max(-1, Math.min(1, norm));
      const snapped = Math.abs(clamped) < 0.08 ? 0 : clamped;
      this.callbacks.onThrottleChange(snapped);
    };

    this.throttleTrackEl.addEventListener('pointerdown', (e) => {
      dragging = true;
      this.throttleTrackEl.setPointerCapture(e.pointerId);
      applyPointer(e.clientY);
    });
    this.throttleTrackEl.addEventListener('pointermove', (e) => {
      if (dragging) applyPointer(e.clientY);
    });
    const stopDrag = () => {
      dragging = false;
    };
    this.throttleTrackEl.addEventListener('pointerup', stopDrag);
    this.throttleTrackEl.addEventListener('pointercancel', stopDrag);
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
    this.scoreValEl.textContent = `${snap.liveScore}`;
    this.repairValEl.textContent = `$${snap.repairCostUsd.toLocaleString('en-US')}`;
    this.repairValEl.className =
      snap.repairCostUsd === 0
        ? 'stat-value good'
        : snap.repairCostUsd >= 7000
          ? 'stat-value danger'
          : 'stat-value warn';

    const dirPrefix = snap.telemetry.surgeKnots < -0.08 ? 'AST ' : '';
    this.speedValEl.textContent = `${dirPrefix}${snap.telemetry.speedKnots.toFixed(1)} kn`;

    const gustKn = Math.round(snap.telemetry.windForceBody.effectiveKnots);
    const compassDirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const compassIdx = Math.round(normalizeCompassDeg(snap.windFromDeg) / 45) % 8;
    const shelterNote = snap.shelterFactor < 0.85 ? ' (Lee)' : '';
    this.windValEl.textContent = `${gustKn} kn ${compassDirs[compassIdx]}${shelterNote}`;

    // Update Throttle Knob Position
    const tPct = (1 - snap.controls.throttle) * 50;
    this.throttleKnobEl.style.top = `${Math.max(10, Math.min(90, tPct))}%`;
    const tInt = Math.round(snap.controls.throttle * 100);
    this.throttleKnobEl.textContent =
      Math.abs(tInt) < 4 ? 'N' : tInt > 0 ? `F${tInt}` : `R${Math.abs(tInt)}`;

    // Update Helm Knob Position
    const hPct = (snap.controls.helm + 1) * 50;
    this.helmKnobEl.style.left = `${Math.max(12, Math.min(88, hPct))}%`;
    const deg = Math.round(snap.telemetry.helmAngleDeg);
    this.helmKnobEl.textContent = deg === 0 ? '0°' : deg > 0 ? `${deg}°R` : `${Math.abs(deg)}°L`;

    // Illuminate Arrow Key Caps live when pressed on keyboard
    if (keyHighlights) {
      this.keyUpBtn.classList.toggle('active', keyHighlights.up);
      this.keyDownBtn.classList.toggle('active', keyHighlights.down);
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
      const c1 = chk.inBerthZone ? '✓ In Slip' : '○ Enter Slip Box';
      const c2 = chk.headingAligned
        ? `✓ Aligned (${Math.round(chk.headingErrorDeg)}°)`
        : `○ Align <=32° (${Math.round(chk.headingErrorDeg)}°)`;
      const c3 = chk.speedStopped
        ? `✓ Stopped (${chk.speedKnots.toFixed(1)} kn)`
        : `○ Slow <=0.6 kn (${chk.speedKnots.toFixed(1)} kn)`;

      if (chk.readyToMoor) {
        const pct = Math.round(snap.dockingHoldProgress * 100);
        this.berthStatusEl.textContent = `${c1} · ${c2} · ${c3} — Mooring ${pct}% (or Press M to Finish Now!)`;
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
      this.lassoBtnEl.textContent = '⚓ Tie Lines & Finish! (M)';
      this.lassoBtnEl.classList.add('attached');
      this.lassoBtnEl.disabled = false;
    } else if (snap.activeSpringLine) {
      this.lassoBtnEl.textContent = 'Cast Off Line (M)';
      this.lassoBtnEl.classList.add('attached');
      this.lassoBtnEl.disabled = false;
    } else if (snap.nearestCleatCandidate) {
      this.lassoBtnEl.textContent = `Lasso Cleat ${snap.nearestCleatCandidate.distM.toFixed(1)}m (M)`;
      this.lassoBtnEl.classList.remove('attached');
      this.lassoBtnEl.disabled = false;
    } else {
      this.lassoBtnEl.textContent = 'Cleat Out of Reach';
      this.lassoBtnEl.classList.remove('attached');
      this.lassoBtnEl.disabled = true;
    }
  }

  public openHelpModal(): void {
    if (this.modalHostEl.childElementCount > 0) {
      this.modalHostEl.replaceChildren();
      return;
    }
    const backdrop = el('div', 'modal-backdrop');
    const card = el('div', 'modal-card');

    const headerRow = el('div', 'brand-group');
    headerRow.style.justifyContent = 'space-between';
    headerRow.style.width = '100%';
    headerRow.append(
      el('h2', 'app-title', 'Controls & Marina Docking Guide'),
      btn('Close (Esc)', 'hud-btn', () => this.modalHostEl.replaceChildren())
    );

    const grid = el('div', 'help-grid');
    const items: Array<[string, string]> = [
      ['↑ / ↓  or  W / S', 'Adjust Throttle Ahead / Astern (pauses safely on Neutral when crossing 0%).'],
      ['← / →  or  A / D', 'Steer Helm Port / Starboard (tap for 5° nudge, hold to sweep wheel).'],
      ['Space  ·  C', 'Space cuts Throttle to Neutral immediately; C centers Helm to 0°.'],
      ['Q / E (8m Cruiser)', 'Fire Proportional Bow Thruster Port (Q) or Starboard (E) to walk sideways.'],
      ['Finish & Next Stage', 'Stop (< 0.65 kn) aligned inside the dashed slip for 2.5s OR press M to tie lines & finish immediately!'],
      ['Bow / Mid / Aft Fenders', 'Slide your 2 Port & 2 Starboard fenders to shield bow stems or quarters from yacht scrapes!'],
    ];

    for (const [keys, desc] of items) {
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
    const backdrop = el('div', 'modal-backdrop');
    const card = el('div', 'modal-card');

    const headerRow = el('div', 'brand-group');
    headerRow.style.justifyContent = 'space-between';
    headerRow.style.width = '100%';
    const heading = el('h2', 'app-title', 'Skipper License Campaign & Wind Sandbox');
    const closeBtn = btn('Close', 'hud-btn', () => this.modalHostEl.replaceChildren());
    headerRow.append(heading, closeBtn);

    const saved = loadSavedProgress();
    const grid = el('div', 'stage-grid');
    for (const st of CAMPAIGN_STAGES) {
      const item = el(
        'button',
        st.id === this.currentStage.id ? 'stage-item-btn selected' : 'stage-item-btn'
      );
      const best = saved[st.id];
      const badgeStr = best ? ` [${best.rank} · ${best.score} pts]` : '';
      const topLine = el('strong', '', `${st.title}${badgeStr}`);
      const subLine = el('span', 'stat-label', st.subtitle);
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
    const sandboxTitle = el('h3', 'app-title', 'Custom Wind & Vessel Sandbox (0–25 Knots)');
    const sbGrid = el('div', 'sandbox-controls-grid');

    const vesselSelect = document.createElement('select');
    vesselSelect.className = 'hud-btn';
    for (const v of Object.values(VESSEL_SPECS)) {
      const opt = document.createElement('option');
      opt.value = v.id;
      opt.textContent = v.name;
      if (v.id === this.currentStage.vesselId) opt.selected = true;
      vesselSelect.append(opt);
    }

    const berthSelect = document.createElement('select');
    berthSelect.className = 'hud-btn';
    for (const [bId, bLabel] of [
      ['slip-a-bow', 'North Slip A (Alongside Finger Pier)'],
      ['slip-b-tight', 'North Slip B — Beside Yacht'],
      ['east-seawall', 'East Seawall Parallel'],
      ['south-med-stern', 'South Med Stern-In'],
      ['south-east-spring', 'South-East Spring Berth'],
    ]) {
      const opt = document.createElement('option');
      opt.value = bId;
      opt.textContent = bLabel;
      if (bId === this.currentStage.berthId) opt.selected = true;
      berthSelect.append(opt);
    }

    const windSpeedInput = document.createElement('input');
    windSpeedInput.type = 'range';
    windSpeedInput.min = '0';
    windSpeedInput.max = '25';
    windSpeedInput.value = String(this.currentStage.trueWindKnots);
    const windSpeedVal = el('span', 'stat-value warn', `${windSpeedInput.value} knots`);
    windSpeedInput.addEventListener('input', () => {
      windSpeedVal.textContent = `${windSpeedInput.value} knots`;
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
      fieldWrap('Vessel Type', vesselSelect),
      fieldWrap('Target Marina Berth', berthSelect),
      fieldWrap('Wind Speed (0–25 kn)', windSpeedInput, windSpeedVal),
      fieldWrap('Wind From Direction (0°–355°)', windDirInput, windDirVal)
    );

    const launchSandboxBtn = btn('Launch Custom Sandbox Session', 'hud-btn primary', () => {
      const vId = sanitizeVesselId(vesselSelect.value);
      const bId = berthSelect.value;
      const wKn = clampWindKnots(Number(windSpeedInput.value));
      const wDeg = normalizeCompassDeg(Number(windDirInput.value));
      this.setCurrentStageMeta(
        `Sandbox: ${VESSEL_SPECS[vId].shortName}`,
        `${VESSEL_SPECS[vId].tip}`
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

    const backdrop = el('div', 'modal-backdrop');
    const card = el('div', 'modal-card');

    const title = el(
      'h2',
      'app-title',
      `Rank ${report.rank} — ${report.rankTitle} (${report.finalScore} pts)`
    );
    const sub = el(
      'div',
      'stat-label',
      `Alignment +${report.alignmentBonus} · Clean Hull +${report.cleanHullBonus} · Fender Kiss +${report.butterKissBonus} · Wind Multiplier ${report.windMultiplier}x · Repair Bill $${report.totalRepairCostUsd.toLocaleString('en-US')}`
    );

    const actionRow = el('div', 'top-actions');
    const nextIdx = CAMPAIGN_STAGES.findIndex((s) => s.id === this.currentStage.id) + 1;
    if (nextIdx > 0 && nextIdx < CAMPAIGN_STAGES.length) {
      const nextStage = CAMPAIGN_STAGES[nextIdx];
      const goNext = () => {
        this.activeScorecardNextAction = null;
        this.currentStage = nextStage;
        this.modalHostEl.replaceChildren();
        this.callbacks.onSelectCampaignStage(nextStage);
      };
      this.activeScorecardNextAction = goNext;
      const nextBtn = btn(`Next: ${nextStage.title} (Enter) ➔`, 'hud-btn primary', goNext);
      actionRow.append(nextBtn);
    }

    const replayBtn = btn('Replay Stage (R)', 'hud-btn', () => {
      this.activeScorecardNextAction = null;
      this.modalHostEl.replaceChildren();
      this.callbacks.onResetStage();
    });
    const chooseBtn = btn('All Stages', 'hud-btn', () => this.openSetupModal());
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

    const backdrop = el('div', 'modal-backdrop');
    const card = el('div', 'modal-card');
    card.style.borderColor = 'var(--accent-coral)';

    const title = el(
      'h2',
      'app-title',
      `💥 GAME OVER — Damage Over $10,000 ($${repairCostUsd.toLocaleString('en-US')})`
    );
    title.style.color = 'var(--accent-coral)';

    const latestCause = incidents[0] ? `Latest impact: ${incidents[0].label}. ` : '';
    const sub = el(
      'div',
      'stat-label',
      `${latestCause}Cumulative vessel hull & neighbor damage reached $${repairCostUsd.toLocaleString('en-US')}, exceeding the $10,000 marina insurance limit.`
    );

    const retryNow = () => {
      this.activeScorecardNextAction = null;
      this.modalHostEl.replaceChildren();
      this.callbacks.onResetStage();
    };
    this.activeScorecardNextAction = retryNow;

    const actionRow = el('div', 'top-actions');
    const retryBtn = btn('↻ Retry Stage (Enter / R)', 'hud-btn primary', retryNow);
    const chooseBtn = btn('Stages / Wind', 'hud-btn', () => this.openSetupModal());
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
