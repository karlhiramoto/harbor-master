import type { CampaignStage } from './physics/campaign';
import type { VesselId, VesselSpec } from './physics/vessels';

export type HarborLang = 'es' | 'en' | 'de' | 'fr' | 'nl';

export const SUPPORTED_HARBOR_LANGS: ReadonlyArray<HarborLang> = ['es', 'en', 'de', 'fr', 'nl'];

export function parseHarborLang(input: string | null | undefined): HarborLang {
  if (!input) return 'en';
  const clean = input.trim().toLowerCase().slice(0, 2);
  if ((SUPPORTED_HARBOR_LANGS as readonly string[]).includes(clean)) {
    return clean as HarborLang;
  }
  return 'en';
}

export function detectHarborLang(search?: string): HarborLang {
  const query =
    search !== undefined
      ? search
      : typeof window !== 'undefined' && window.location
        ? window.location.search
        : '';
  try {
    const params = new URLSearchParams(query);
    const paramLang = params.get('lang');
    if (paramLang) {
      return parseHarborLang(paramLang);
    }
  } catch {
    // Ignore malformed query strings
  }
  return 'en';
}

let activeLang: HarborLang = detectHarborLang();

export function getLang(): HarborLang {
  return activeLang;
}

export function setLang(lang: HarborLang): HarborLang {
  activeLang = parseHarborLang(lang);
  if (typeof document !== 'undefined') {
    document.documentElement.lang = activeLang;
    document.title = getUiStrings(activeLang).pageTitle;
  }
  return activeLang;
}

export function initLangFromUrl(search?: string): HarborLang {
  return setLang(detectHarborLang(search));
}

export interface StageTranslation {
  title: string;
  subtitle: string;
  briefing: string;
}

export interface VesselTranslation {
  name: string;
  shortName: string;
  category: string;
  description: string;
  tip: string;
}

export interface HarborUiStrings {
  pageTitle: string;
  appTitle: string;
  scoreLabel: string;
  repairBillLabel: string;
  speedLabel: string;
  windLabel: string;
  compassDirs: readonly [string, string, string, string, string, string, string, string];
  leeNote: string;
  asternPrefix: string;
  knotsUnit: string;
  ptsUnit: string;
  stagesWindBtn: string;
  autoPilotOffBtn: string;
  autoPilotOnBtn: string;
  retryBtn: string;
  xrayOnBtn: string;
  xrayOffBtn: string;
  soundOnBtn: string;
  soundMutedBtn: string;
  helpBtn: string;
  throttleSingleLabel: string;
  throttleTwinSplitLabel: string;
  throttleTwinUnifiedLabel: string;
  modeUnifiedBtn: string;
  modeSplitToUnifiedBtn: string;
  modeUnifiedToSplitBtn: string;
  portLeverLabel: string;
  stbdLeverLabel: string;
  neutralBtn: string;
  increaseThrottleTooltip: string;
  decreaseThrottleTooltip: string;
  increasePortThrottleTooltip: string;
  decreasePortThrottleTooltip: string;
  increaseStbdThrottleTooltip: string;
  decreaseStbdThrottleTooltip: string;
  fendersLabel: string;
  fenderBow: string;
  fenderMid: string;
  fenderAft: string;
  cleatLineDefaultBtn: string;
  tieLinesFinishBtn: string;
  castOffLineBtn: string;
  lassoCleatDistBtn: (distM: string) => string;
  cleatOutOfReachBtn: string;
  camNorthUpBtn: string;
  camBoatUpBtn: string;
  zoomResetTooltip: string;
  bowPortBtn: string;
  bowStbdBtn: string;
  helmLabel: string;
  helmLeftTooltip: string;
  helmRightTooltip: string;
  centerHelmBtn: string;
  helmLeftSuffix: string;
  helmRightSuffix: string;
  checklistInSlip: string;
  checklistEnterSlip: string;
  checklistAligned: (deg: number) => string;
  checklistAlignTarget: (deg: number) => string;
  checklistStopped: (kn: string) => string;
  checklistSlowTarget: (kn: string) => string;
  checklistMooringHold: (pct: number) => string;
  helpModalTitle: string;
  closeEscBtn: string;
  closeBtn: string;
  helpItems: ReadonlyArray< readonly [string, string]>;
  setupModalTitle: string;
  sandboxTitle: string;
  berthOptions: Record<string, string>;
  vesselTypeField: string;
  targetBerthField: string;
  windSpeedField: string;
  windDirField: string;
  knotsValueLabel: (kn: string | number) => string;
  launchSandboxBtn: string;
  sandboxStagePrefix: string;
  rankModalTitle: (rank: string, rankTitle: string, score: number) => string;
  rankModalBreakdown: (
    alignBonus: number,
    cleanBonus: number,
    kissBonus: number,
    windMult: number,
    repairStr: string
  ) => string;
  nextStageBtn: (nextTitle: string) => string;
  replayStageBtn: string;
  allStagesBtn: string;
  gameOverTitle: (repairStr: string) => string;
  gameOverLatestImpact: (label: string) => string;
  gameOverSummary: (latestCause: string, repairStr: string) => string;
  retryStageEnterBtn: string;
  rankTitles: Record<'S' | 'A' | 'B' | 'C' | 'D', string>;
  incidentGelcoatScrape: (otherLabel: string) => string;
  incidentFairwayHazard: (otherLabel: string) => string;
  incidentBareHullDock: (otherLabel: string) => string;
  incidentButterKiss: (otherLabel: string, bonus: number) => string;
  incidentCleanCushion: (otherLabel: string) => string;
  incidentHardFender: (kn: string, otherLabel: string) => string;
  canvasSupLabel: string;
  canvasSpringLabel: string;
  canvasCleatHint: string;
  canvasPivotLabel: string;
  canvasPropWalkLabel: string;
  canvasThrusterLabel: string;
}

const UI_STRINGS: Record<HarborLang, HarborUiStrings> = {
  en: {
    pageTitle: 'Harbor Master: Marina Boat Docking Simulator',
    appTitle: 'Harbor Master',
    scoreLabel: 'Score',
    repairBillLabel: 'Repair Bill',
    speedLabel: 'Speed',
    windLabel: 'Wind',
    compassDirs: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'],
    leeNote: ' (Lee)',
    asternPrefix: 'AST ',
    knotsUnit: 'kn',
    ptsUnit: 'pts',
    stagesWindBtn: 'Stages / Wind',
    autoPilotOffBtn: '🤖 Auto-Pilot: OFF (P)',
    autoPilotOnBtn: '🤖 Auto-Pilot: ON (P)',
    retryBtn: 'Retry (R)',
    xrayOnBtn: 'X-Ray: ON',
    xrayOffBtn: 'X-Ray: OFF',
    soundOnBtn: 'Sound: ON',
    soundMutedBtn: 'Sound: Muted',
    helpBtn: '? Help (H)',
    throttleSingleLabel: 'Throttle (↑/↓ · W/S)',
    throttleTwinSplitLabel: 'Twin Throttles: Split',
    throttleTwinUnifiedLabel: 'Twin Throttles: Unified',
    modeUnifiedBtn: '🔗 Mode: Unified (U)',
    modeSplitToUnifiedBtn: '⚡ Split (U) → Unified',
    modeUnifiedToSplitBtn: '🔗 Unified (U) → Split',
    portLeverLabel: 'PORT (W/S)',
    stbdLeverLabel: 'STBD (↑/↓)',
    neutralBtn: 'NEUTRAL (Space)',
    increaseThrottleTooltip: 'Increase Forward Throttle (Up Arrow / W)',
    decreaseThrottleTooltip: 'Decrease / Reverse Throttle (Down Arrow / S)',
    increasePortThrottleTooltip: 'Increase Port Engine Throttle (W)',
    decreasePortThrottleTooltip: 'Decrease / Reverse Port Engine Throttle (S)',
    increaseStbdThrottleTooltip: 'Increase Starboard Engine Throttle (Up Arrow / I)',
    decreaseStbdThrottleTooltip: 'Decrease / Reverse Starboard Engine Throttle (Down Arrow / K)',
    fendersLabel: 'Fenders:',
    fenderBow: 'Bow',
    fenderMid: 'Mid',
    fenderAft: 'Aft',
    cleatLineDefaultBtn: 'Cleat Line (M)',
    tieLinesFinishBtn: '⚓ Tie Lines & Finish! (M)',
    castOffLineBtn: 'Cast Off Line (M)',
    lassoCleatDistBtn: (distM) => `Lasso Cleat ${distM}m (M)`,
    cleatOutOfReachBtn: 'Cleat Out of Reach',
    camNorthUpBtn: 'Cam: North-Up',
    camBoatUpBtn: 'Cam: Boat-Up',
    zoomResetTooltip: 'Tap to reset camera zoom to 100%',
    bowPortBtn: '◀ BOW PORT (Q)',
    bowStbdBtn: 'BOW STBD (E) ▶',
    helmLabel: 'Helm (←/→ · A/D)',
    helmLeftTooltip: 'Turn Helm Port / Left (Left Arrow / A)',
    helmRightTooltip: 'Turn Helm Starboard / Right (Right Arrow / D)',
    centerHelmBtn: 'Center Helm (C)',
    helmLeftSuffix: 'L',
    helmRightSuffix: 'R',
    checklistInSlip: '✓ In Slip',
    checklistEnterSlip: '○ Enter Slip Box',
    checklistAligned: (deg) => `✓ Aligned (${deg}°)`,
    checklistAlignTarget: (deg) => `○ Align <=32° (${deg}°)`,
    checklistStopped: (kn) => `✓ Stopped (${kn} kn)`,
    checklistSlowTarget: (kn) => `○ Slow <=0.6 kn (${kn} kn)`,
    checklistMooringHold: (pct) => `Mooring ${pct}% (or Press M to Finish Now!)`,
    helpModalTitle: 'Controls & Marina Docking Guide',
    closeEscBtn: 'Close (Esc)',
    closeBtn: 'Close',
    helpItems: [
      ['↑ / ↓  or  W / S', 'Adjust Throttle Ahead / Astern (pauses safely on Neutral when crossing 0%).'],
      ['U (Twin-Engine Boats)', 'Toggle between Unified (linked levers) and Split (separate Port W/S & Starboard ↑/↓ or I/K throttles).'],
      ['← / →  or  A / D', 'Steer Helm Port / Starboard (tap for 5° nudge, hold to sweep wheel).'],
      ['Space  ·  C', 'Space cuts all Throttles to Neutral immediately; C centers Helm to 0°.'],
      ['Q / E (8m Cruiser)', 'Fire Proportional Bow Thruster Port (Q) or Starboard (E) to walk sideways.'],
      ['Finish & Next Stage', 'Stop (< 0.65 kn) aligned inside the dashed slip for 2.5s OR press M to tie lines & finish immediately!'],
      ['Bow / Mid / Aft Fenders', 'Slide your 2 Port & 2 Starboard fenders to shield bow stems or quarters from yacht scrapes!'],
    ],
    setupModalTitle: 'Skipper License Campaign & Wind Sandbox',
    sandboxTitle: 'Custom Wind & Vessel Sandbox (0–25 Knots)',
    berthOptions: {
      'slip-a-bow': 'North Slip A (Alongside Finger Pier)',
      'slip-b-tight': 'North Slip B — Beside Yacht',
      'east-seawall': 'East Seawall Parallel',
      'south-med-stern': 'South Med Stern-In',
      'south-east-spring': 'South-East Spring Berth',
    },
    vesselTypeField: 'Vessel Type',
    targetBerthField: 'Target Marina Berth',
    windSpeedField: 'Wind Speed (0–25 kn)',
    windDirField: 'Wind From Direction (0°–355°)',
    knotsValueLabel: (kn) => `${kn} knots`,
    launchSandboxBtn: 'Launch Custom Sandbox Session',
    sandboxStagePrefix: 'Sandbox',
    rankModalTitle: (rank, rankTitle, score) => `Rank ${rank} — ${rankTitle} (${score} pts)`,
    rankModalBreakdown: (alignBonus, cleanBonus, kissBonus, windMult, repairStr) =>
      `Alignment +${alignBonus} · Clean Hull +${cleanBonus} · Fender Kiss +${kissBonus} · Wind Multiplier ${windMult}x · Repair Bill $${repairStr}`,
    nextStageBtn: (nextTitle) => `Next: ${nextTitle} (Enter) ➔`,
    replayStageBtn: 'Replay Stage (R)',
    allStagesBtn: 'All Stages',
    gameOverTitle: (repairStr) => `💥 GAME OVER — Damage Over $10,000 ($${repairStr})`,
    gameOverLatestImpact: (label) => `Latest impact: ${label}. `,
    gameOverSummary: (latestCause, repairStr) =>
      `${latestCause}Cumulative vessel hull & neighbor damage reached $${repairStr}, exceeding the $10,000 marina insurance limit.`,
    retryStageEnterBtn: '↻ Retry Stage (Enter / R)',
    rankTitles: {
      S: 'Master Harbor Pilot',
      A: 'Seasoned Skipper',
      B: 'Competent Helmsman',
      C: 'Weekend Deckhand',
      D: 'Gelcoat Liability',
    },
    incidentGelcoatScrape: (other) => `GELCOAT SCRAPE vs ${other} (Missed Fenders!)`,
    incidentFairwayHazard: (other) => `FAIRWAY HAZARD IMPACT (${other})`,
    incidentBareHullDock: (other) => `Bare Hull Scrape on ${other} (Align Fenders!)`,
    incidentButterKiss: (other, bonus) => `BUTTER FENDER KISS on ${other} (+${bonus} pts)`,
    incidentCleanCushion: (other) => `Clean Fender Cushion on ${other} ($0 Damage)`,
    incidentHardFender: (kn, other) => `Hard Fender Bump (${kn} kn vs ${other})`,
    canvasSupLabel: 'SUP',
    canvasSpringLabel: 'Spring',
    canvasCleatHint: 'M: Cleat',
    canvasPivotLabel: 'PIVOT',
    canvasPropWalkLabel: 'PROP WALK',
    canvasThrusterLabel: 'THRUSTER',
  },

  es: {
    pageTitle: 'Harbor Master: Simulador de Atraque y Maniobra en Puerto',
    appTitle: 'Harbor Master',
    scoreLabel: 'Puntos',
    repairBillLabel: 'Averías',
    speedLabel: 'Velocidad',
    windLabel: 'Viento',
    compassDirs: ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'],
    leeNote: ' (Sotavento)',
    asternPrefix: 'ATR ',
    knotsUnit: 'kn',
    ptsUnit: 'pts',
    stagesWindBtn: 'Niveles / Viento',
    autoPilotOffBtn: '🤖 Piloto Auto: NO (P)',
    autoPilotOnBtn: '🤖 Piloto Auto: SÍ (P)',
    retryBtn: 'Reintentar (R)',
    xrayOnBtn: 'Fuerzas: SÍ',
    xrayOffBtn: 'Fuerzas: NO',
    soundOnBtn: 'Sonido: SÍ',
    soundMutedBtn: 'Sonido: Silencio',
    helpBtn: '? Ayuda (H)',
    throttleSingleLabel: 'Avante / Atrás (↑/↓ · W/S)',
    throttleTwinSplitLabel: 'Doble mando: Separado',
    throttleTwinUnifiedLabel: 'Doble mando: Unificado',
    modeUnifiedBtn: '🔗 Modo: Unificado (U)',
    modeSplitToUnifiedBtn: '⚡ Separado (U) → Unificado',
    modeUnifiedToSplitBtn: '🔗 Unificado (U) → Separado',
    portLeverLabel: 'BABOR (W/S)',
    stbdLeverLabel: 'ESTRIBOR (↑/↓)',
    neutralBtn: 'PUNTO MUERTO (Espacio)',
    increaseThrottleTooltip: 'Más avante (Flecha arriba / W)',
    decreaseThrottleTooltip: 'Menos avante / Marcha atrás (Flecha abajo / S)',
    increasePortThrottleTooltip: 'Más avante motor de babor (W)',
    decreasePortThrottleTooltip: 'Marcha atrás motor de babor (S)',
    increaseStbdThrottleTooltip: 'Más avante motor de estribor (Flecha arriba / I)',
    decreaseStbdThrottleTooltip: 'Marcha atrás motor de estribor (Flecha abajo / K)',
    fendersLabel: 'Defensas:',
    fenderBow: 'Proa',
    fenderMid: 'Centro',
    fenderAft: 'Popa',
    cleatLineDefaultBtn: 'Cabo a cornamusa (M)',
    tieLinesFinishBtn: '⚓ ¡Amarrar y terminar! (M)',
    castOffLineBtn: 'Larguen cabo (M)',
    lassoCleatDistBtn: (distM) => `Amarrar cornamusa ${distM}m (M)`,
    cleatOutOfReachBtn: 'Cornamusa lejos',
    camNorthUpBtn: 'Cám: Norte arriba',
    camBoatUpBtn: 'Cám: Proa arriba',
    zoomResetTooltip: 'Restablecer zoom al 100%',
    bowPortBtn: '◀ PROA BABOR (Q)',
    bowStbdBtn: 'PROA ESTRIBOR (E) ▶',
    helmLabel: 'Timón (←/→ · A/D)',
    helmLeftTooltip: 'Meter timón a babor / izquierda (Flecha izq. / A)',
    helmRightTooltip: 'Meter timón a estribor / derecha (Flecha der. / D)',
    centerHelmBtn: 'Timón a la vía (C)',
    helmLeftSuffix: 'B',
    helmRightSuffix: 'E',
    checklistInSlip: '✓ En amarre',
    checklistEnterSlip: '○ Entrar al amarre',
    checklistAligned: (deg) => `✓ Alineado (${deg}°)`,
    checklistAlignTarget: (deg) => `○ Alinear <=32° (${deg}°)`,
    checklistStopped: (kn) => `✓ Parado (${kn} kn)`,
    checklistSlowTarget: (kn) => `○ Frenar <=0.6 kn (${kn} kn)`,
    checklistMooringHold: (pct) => `Amarrando ${pct}% (¡o pulsa M para terminar ya!)`,
    helpModalTitle: 'Controles y Guía de Maniobra de Atraque',
    closeEscBtn: 'Cerrar (Esc)',
    closeBtn: 'Cerrar',
    helpItems: [
      ['↑ / ↓  o  W / S', 'Regula avante / atrás (hace pausa segura en Punto Muerto al cruzar 0%).'],
      ['U (Barcos bimotor)', 'Alterna entre mando Unificado (palancas unidas) y Separado (babor W/S y estribor ↑/↓ o I/K).'],
      ['← / →  o  A / D', 'Gobierna el timón a babor / estribor (toque corto 5°, mantener para girar).'],
      ['Espacio  ·  C', 'Espacio corta gases a Punto Muerto; C pone el timón a la vía (0°).'],
      ['Q / E (Crucero 8m)', 'Activa la hélice de proa a babor (Q) o estribor (E) para aconchar de costado.'],
      ['Amarrar y siguiente nivel', 'Para (< 0,65 kn) alineado dentro del amarre 2,5 s ¡O pulsa M para dar cabos al instante!'],
      ['Defensas Proa / Centro / Popa', 'Desplaza tus 2 defensas de babor y 2 de estribor para proteger amuras o aletas.'],
    ],
    setupModalTitle: 'Campaña de Patrón y Práctica Libre con Viento',
    sandboxTitle: 'Práctica Libre de Barco y Viento (0–25 Nudos)',
    berthOptions: {
      'slip-a-bow': 'Finger Norte A (Abarloar al finger oeste)',
      'slip-b-tight': 'Finger Norte B — Junto al yate',
      'east-seawall': 'Muelle Este (Abarloado paralelo)',
      'south-med-stern': 'Muelle Sur — Atraque de popa (Mediterráneo)',
      'south-east-spring': 'Amarre Sureste con spring',
    },
    vesselTypeField: 'Tipo de embarcación',
    targetBerthField: 'Puesto de amarre objetivo',
    windSpeedField: 'Intensidad del viento (0–25 kn)',
    windDirField: 'Dirección del viento (0°–355°)',
    knotsValueLabel: (kn) => `${kn} nudos`,
    launchSandboxBtn: 'Iniciar sesión de práctica libre',
    sandboxStagePrefix: 'Práctica libre',
    rankModalTitle: (rank, rankTitle, score) => `Rango ${rank} — ${rankTitle} (${score} pts)`,
    rankModalBreakdown: (alignBonus, cleanBonus, kissBonus, windMult, repairStr) =>
      `Alineación +${alignBonus} · Casco intacto +${cleanBonus} · Apoyo en defensas +${kissBonus} · Mult. viento ${windMult}x · Averías $${repairStr}`,
    nextStageBtn: (nextTitle) => `Siguiente: ${nextTitle} (Intro) ➔`,
    replayStageBtn: 'Repetir maniobra (R)',
    allStagesBtn: 'Todos los niveles',
    gameOverTitle: (repairStr) => `💥 FIN DE MANIOBRA — Daños superiores a $10,000 ($${repairStr})`,
    gameOverLatestImpact: (label) => `Último impacto: ${label}. `,
    gameOverSummary: (latestCause, repairStr) =>
      `${latestCause}Los daños acumulados en casco y barcos vecinos alcanzaron $${repairStr}, superando el límite de seguro del puerto de $10,000.`,
    retryStageEnterBtn: '↻ Reintentar nivel (Intro / R)',
    rankTitles: {
      S: 'Práctico Mayor de Puerto',
      A: 'Patrón Experimentado',
      B: 'Timonel Competente',
      C: 'Marinero de Fin de Semana',
      D: 'Peligro para el Gelcoat',
    },
    incidentGelcoatScrape: (other) => `ROCE DE GELCOAT contra ${other} (¡Fuera de defensas!)`,
    incidentFairwayHazard: (other) => `IMPACTO EN EL CANAL (${other})`,
    incidentBareHullDock: (other) => `Roce de casco contra ${other} (¡Alinea las defensas!)`,
    incidentButterKiss: (other, bonus) => `APOYO SUAVE DE DEFENSA en ${other} (+${bonus} pts)`,
    incidentCleanCushion: (other) => `Defensa amortiguó contra ${other} ($0 daños)`,
    incidentHardFender: (kn, other) => `Golpe fuerte en defensa (${kn} kn contra ${other})`,
    canvasSupLabel: 'SUP',
    canvasSpringLabel: 'Spring',
    canvasCleatHint: 'M: Cabo',
    canvasPivotLabel: 'PIVOTE',
    canvasPropWalkLabel: 'PRESIÓN LATERAL',
    canvasThrusterLabel: 'HÉLICE PROA',
  },

  de: {
    pageTitle: 'Harbor Master: Hafenmanöver- & Anlegesimulator',
    appTitle: 'Harbor Master',
    scoreLabel: 'Punkte',
    repairBillLabel: 'Schäden',
    speedLabel: 'Fahrt',
    windLabel: 'Wind',
    compassDirs: ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'],
    leeNote: ' (Lee)',
    asternPrefix: 'RÜCK ',
    knotsUnit: 'kn',
    ptsUnit: 'Pkt',
    stagesWindBtn: 'Stufen / Wind',
    autoPilotOffBtn: '🤖 Autopilot: AUS (P)',
    autoPilotOnBtn: '🤖 Autopilot: EIN (P)',
    retryBtn: 'Neu starten (R)',
    xrayOnBtn: 'Kräfte: EIN',
    xrayOffBtn: 'Kräfte: AUS',
    soundOnBtn: 'Ton: EIN',
    soundMutedBtn: 'Ton: Stumm',
    helpBtn: '? Hilfe (H)',
    throttleSingleLabel: 'Gashebel (↑/↓ · W/S)',
    throttleTwinSplitLabel: 'Doppelgas: Getrennt',
    throttleTwinUnifiedLabel: 'Doppelgas: Gekoppelt',
    modeUnifiedBtn: '🔗 Modus: Gekoppelt (U)',
    modeSplitToUnifiedBtn: '⚡ Getrennt (U) → Gekoppelt',
    modeUnifiedToSplitBtn: '🔗 Gekoppelt (U) → Getrennt',
    portLeverLabel: 'BACKBORD (W/S)',
    stbdLeverLabel: 'STEUERBORD (↑/↓)',
    neutralBtn: 'LEERLAUF (Leertaste)',
    increaseThrottleTooltip: 'Mehr Vorausfahrt (Pfeil hoch / W)',
    decreaseThrottleTooltip: 'Weniger Fahrt / Rückwärts (Pfeil runter / S)',
    increasePortThrottleTooltip: 'Backbordmotor mehr Voraus (W)',
    decreasePortThrottleTooltip: 'Backbordmotor Rückwärts (S)',
    increaseStbdThrottleTooltip: 'Steuerbordmotor mehr Voraus (Pfeil hoch / I)',
    decreaseStbdThrottleTooltip: 'Steuerbordmotor Rückwärts (Pfeil runter / K)',
    fendersLabel: 'Fender:',
    fenderBow: 'Bug',
    fenderMid: 'Mitte',
    fenderAft: 'Heck',
    cleatLineDefaultBtn: 'Leine an Klampe (M)',
    tieLinesFinishBtn: '⚓ Festmachen & Beenden! (M)',
    castOffLineBtn: 'Leine loswerfen (M)',
    lassoCleatDistBtn: (distM) => `Klampe belegen ${distM}m (M)`,
    cleatOutOfReachBtn: 'Klampe außer Reichweite',
    camNorthUpBtn: 'Kam: Nord-oben',
    camBoatUpBtn: 'Kam: Bug-oben',
    zoomResetTooltip: 'Kamerazoom auf 100% zurücksetzen',
    bowPortBtn: '◀ BUG BB (Q)',
    bowStbdBtn: 'BUG STB (E) ▶',
    helmLabel: 'Ruder (←/→ · A/D)',
    helmLeftTooltip: 'Ruder Backbord / Links (Pfeil links / A)',
    helmRightTooltip: 'Ruder Steuerbord / Rechts (Pfeil rechts / D)',
    centerHelmBtn: 'Ruder mittschiffs (C)',
    helmLeftSuffix: 'L',
    helmRightSuffix: 'R',
    checklistInSlip: '✓ In Box',
    checklistEnterSlip: '○ In Box einfahren',
    checklistAligned: (deg) => `✓ Ausgerichtet (${deg}°)`,
    checklistAlignTarget: (deg) => `○ Ausrichten <=32° (${deg}°)`,
    checklistStopped: (kn) => `✓ Gestoppt (${kn} kn)`,
    checklistSlowTarget: (kn) => `○ Abbremsen <=0.6 kn (${kn} kn)`,
    checklistMooringHold: (pct) => `Festmachen ${pct}% (oder M drücken zum Beenden!)`,
    helpModalTitle: 'Steuerung & Hafenmanöver-Anleitung',
    closeEscBtn: 'Schließen (Esc)',
    closeBtn: 'Schließen',
    helpItems: [
      ['↑ / ↓  oder  W / S', 'Gas Voraus / Zurück regeln (rastet bei 0% sicher im Leerlauf ein).'],
      ['U (Zweimotorige Boote)', 'Zwischen Gekoppelt und Getrennt (Backbord W/S & Steuerbord ↑/↓ oder I/K) wechseln.'],
      ['← / →  oder  A / D', 'Ruder Backbord / Steuerbord legen (Antippen für 5°, Halten zum Drehen).'],
      ['Leertaste  ·  C', 'Leertaste schaltet sofort in den Leerlauf; C legt das Ruder mittschiffs (0°).'],
      ['Q / E (8m Kajütboot)', 'Bugstrahlruder nach Backbord (Q) oder Steuerbord (E) zum Querversetzen.'],
      ['Anlegen & Nächste Stufe', 'In der Box (< 0,65 kn) 2,5 s ausgerichtet halten ODER mit M sofort festmachen!'],
      ['Fender Bug / Mitte / Heck', 'Verschiebe je 2 Backbord- und Steuerbordfender zum Schutz von Bug oder Heck.'],
    ],
    setupModalTitle: 'Skipper-Kampagne & Freies Wind-Training',
    sandboxTitle: 'Freies Training: Boot & Wind (0–25 Knoten)',
    berthOptions: {
      'slip-a-bow': 'Nordbox A (Längsseits am Fingersteg)',
      'slip-b-tight': 'Nordbox B — Neben Motoryacht',
      'east-seawall': 'Ostmole (Längsseits)',
      'south-med-stern': 'Südkai — Römisch-katholisch (Heck zur Mole)',
      'south-east-spring': 'Südost-Liegeplatz (Eindampfen in die Spring)',
    },
    vesselTypeField: 'Bootstyp',
    targetBerthField: 'Ziel-Liegeplatz',
    windSpeedField: 'Windstärke (0–25 kn)',
    windDirField: 'Windrichtung (0°–355°)',
    knotsValueLabel: (kn) => `${kn} Knoten`,
    launchSandboxBtn: 'Freies Training starten',
    sandboxStagePrefix: 'Freies Training',
    rankModalTitle: (rank, rankTitle, score) => `Rang ${rank} — ${rankTitle} (${score} Pkt)`,
    rankModalBreakdown: (alignBonus, cleanBonus, kissBonus, windMult, repairStr) =>
      `Ausrichtung +${alignBonus} · Rumpf +${cleanBonus} · Fender +${kissBonus} · Wind-Faktor ${windMult}x · Schäden $${repairStr}`,
    nextStageBtn: (nextTitle) => `Weiter: ${nextTitle} (Enter) ➔`,
    replayStageBtn: 'Wiederholen (R)',
    allStagesBtn: 'Alle Stufen',
    gameOverTitle: (repairStr) => `💥 ABBRUCH — Schaden über $10,000 ($${repairStr})`,
    gameOverLatestImpact: (label) => `Letzter Treffer: ${label}. `,
    gameOverSummary: (latestCause, repairStr) =>
      `${latestCause}Der Gesamtschaden an Rumpf und Nachbarliegern erreichte $${repairStr} und überschritt das Versicherungslimit von $10,000.`,
    retryStageEnterBtn: '↻ Stufe neu starten (Enter / R)',
    rankTitles: {
      S: 'Hafenlotsen-Meister',
      A: 'Erfahrener Skipper',
      B: 'Souveräner Rudergänger',
      C: 'Wochenend-Matrose',
      D: 'Gelcoat-Schreck',
    },
    incidentGelcoatScrape: (other) => `GELCOAT-KRATZER an ${other} (Fender verfehlt!)`,
    incidentFairwayHazard: (other) => `KOLLISION IM FAHRWASSER (${other})`,
    incidentBareHullDock: (other) => `Rumpfkontakt an ${other} (Fender ausrichten!)`,
    incidentButterKiss: (other, bonus) => `SANFTES ANLEGEN MIT FENDER an ${other} (+${bonus} Pkt)`,
    incidentCleanCushion: (other) => `Fender abgefedert an ${other} ($0 Schaden)`,
    incidentHardFender: (kn, other) => `Harter Fenderstoß (${kn} kn gegen ${other})`,
    canvasSupLabel: 'SUP',
    canvasSpringLabel: 'Spring',
    canvasCleatHint: 'M: Klampe',
    canvasPivotLabel: 'DREHPUNKT',
    canvasPropWalkLabel: 'RAD-EFFEKT',
    canvasThrusterLabel: 'BUGSTRAHL',
  },

  fr: {
    pageTitle: 'Harbor Master : Simulateur d’Accostage et de Manœuvre au Port',
    appTitle: 'Harbor Master',
    scoreLabel: 'Score',
    repairBillLabel: 'Avaries',
    speedLabel: 'Vitesse',
    windLabel: 'Vent',
    compassDirs: ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'],
    leeNote: ' (Abri)',
    asternPrefix: 'ARR ',
    knotsUnit: 'nd',
    ptsUnit: 'pts',
    stagesWindBtn: 'Étapes / Vent',
    autoPilotOffBtn: '🤖 Pilote Auto : NON (P)',
    autoPilotOnBtn: '🤖 Pilote Auto : OUI (P)',
    retryBtn: 'Réessayer (R)',
    xrayOnBtn: 'Forces : OUI',
    xrayOffBtn: 'Forces : NON',
    soundOnBtn: 'Son : OUI',
    soundMutedBtn: 'Son : Muet',
    helpBtn: '? Aide (H)',
    throttleSingleLabel: 'Gaz (↑/↓ · W/S)',
    throttleTwinSplitLabel: 'Bi-moteur : Séparé',
    throttleTwinUnifiedLabel: 'Bi-moteur : Couplé',
    modeUnifiedBtn: '🔗 Mode : Couplé (U)',
    modeSplitToUnifiedBtn: '⚡ Séparé (U) → Couplé',
    modeUnifiedToSplitBtn: '🔗 Couplé (U) → Séparé',
    portLeverLabel: 'BÂBORD (W/S)',
    stbdLeverLabel: 'TRIBORD (↑/↓)',
    neutralBtn: 'POINT MORT (Espace)',
    increaseThrottleTooltip: 'Augmenter les gaz avant (Flèche haut / W)',
    decreaseThrottleTooltip: 'Réduire / Marche arrière (Flèche bas / S)',
    increasePortThrottleTooltip: 'Gaz avant moteur bâbord (W)',
    decreasePortThrottleTooltip: 'Marche arrière moteur bâbord (S)',
    increaseStbdThrottleTooltip: 'Gaz avant moteur tribord (Flèche haut / I)',
    decreaseStbdThrottleTooltip: 'Marche arrière moteur tribord (Flèche bas / K)',
    fendersLabel: 'Pare-battages :',
    fenderBow: 'Avant',
    fenderMid: 'Milieu',
    fenderAft: 'Arrière',
    cleatLineDefaultBtn: 'Amarrer au taquet (M)',
    tieLinesFinishBtn: '⚓ Amarrer et terminer ! (M)',
    castOffLineBtn: 'Larguer l’amarre (M)',
    lassoCleatDistBtn: (distM) => `Taquet à ${distM}m (M)`,
    cleatOutOfReachBtn: 'Taquet hors de portée',
    camNorthUpBtn: 'Cam : Nord en haut',
    camBoatUpBtn: 'Cam : Proue en haut',
    zoomResetTooltip: 'Réinitialiser le zoom à 100%',
    bowPortBtn: '◀ PROUE BÂB (Q)',
    bowStbdBtn: 'PROUE TRIB (E) ▶',
    helmLabel: 'Barre (←/→ · A/D)',
    helmLeftTooltip: 'Barre à bâbord / gauche (Flèche gauche / A)',
    helmRightTooltip: 'Barre à tribord / droite (Flèche droite / D)',
    centerHelmBtn: 'Barre droite (C)',
    helmLeftSuffix: 'G',
    helmRightSuffix: 'D',
    checklistInSlip: '✓ Au poste',
    checklistEnterSlip: '○ Entrer au poste',
    checklistAligned: (deg) => `✓ Aligné (${deg}°)`,
    checklistAlignTarget: (deg) => `○ Aligner <=32° (${deg}°)`,
    checklistStopped: (kn) => `✓ Stoppé (${kn} nd)`,
    checklistSlowTarget: (kn) => `○ Ralentir <=0.6 nd (${kn} nd)`,
    checklistMooringHold: (pct) => `Amarrage ${pct}% (ou appuyez sur M pour finir !)`,
    helpModalTitle: 'Commandes et Guide de Manœuvre de Port',
    closeEscBtn: 'Fermer (Échap)',
    closeBtn: 'Fermer',
    helpItems: [
      ['↑ / ↓  ou  W / S', 'Règle les gaz avant / arrière (pause sûre au Point Mort en passant par 0%).'],
      ['U (Bateaux bi-moteur)', 'Bascule entre commandes Couplées et Séparées (bâbord W/S et tribord ↑/↓ ou I/K).'],
      ['← / →  ou  A / D', 'Barre à bâbord / tribord (appui court 5°, maintenir pour braquer).'],
      ['Espace  ·  C', 'Espace coupe les gaz au Point Mort ; C remet la barre droite (0°).'],
      ['Q / E (Vedette 8m)', 'Active le propulseur d’étrave à bâbord (Q) ou tribord (E) pour ripper.'],
      ['Amarrer et étape suivante', 'Stoppez (< 0,65 nd) aligné dans le poste pendant 2,5 s OU appuyez sur M !'],
      ['Pare-battages Avant / Milieu / Arrière', 'Déplacez vos 2 pare-battages bâbord et tribord pour protéger l’étrave ou la hanche.'],
    ],
    setupModalTitle: 'Campagne Permis Plaisance & Bac à Sable Vent',
    sandboxTitle: 'Pratique Libre : Bateau et Vent (0–25 Nœuds)',
    berthOptions: {
      'slip-a-bow': 'Catway Nord A (Accostage le long du catway)',
      'slip-b-tight': 'Catway Nord B — À côté de la vedette',
      'east-seawall': 'Quai Est (Accostage en long)',
      'south-med-stern': 'Quai Sud — Amarrage cul à quai',
      'south-east-spring': 'Poste Sud-Est sur garde montante',
    },
    vesselTypeField: 'Type de navire',
    targetBerthField: 'Poste d’amarrage cible',
    windSpeedField: 'Force du vent (0–25 nd)',
    windDirField: 'Direction du vent (0°–355°)',
    knotsValueLabel: (kn) => `${kn} nœuds`,
    launchSandboxBtn: 'Lancer la session libre',
    sandboxStagePrefix: 'Session libre',
    rankModalTitle: (rank, rankTitle, score) => `Rang ${rank} — ${rankTitle} (${score} pts)`,
    rankModalBreakdown: (alignBonus, cleanBonus, kissBonus, windMult, repairStr) =>
      `Alignement +${alignBonus} · Coque intacte +${cleanBonus} · Pare-battage +${kissBonus} · Mult. vent ${windMult}x · Avaries $${repairStr}`,
    nextStageBtn: (nextTitle) => `Suivant : ${nextTitle} (Entrée) ➔`,
    replayStageBtn: 'Rejouer l’étape (R)',
    allStagesBtn: 'Toutes les étapes',
    gameOverTitle: (repairStr) => `💥 FIN DE PARTIE — Dégâts supérieurs à $10,000 ($${repairStr})`,
    gameOverLatestImpact: (label) => `Dernier impact : ${label}. `,
    gameOverSummary: (latestCause, repairStr) =>
      `${latestCause}Les dégâts cumulés à la coque et aux navires voisins ont atteint $${repairStr}, dépassant la franchise d’assurance de $10,000.`,
    retryStageEnterBtn: '↻ Réessayer l’étape (Entrée / R)',
    rankTitles: {
      S: 'Maître Pilote de Port',
      A: 'Skipper Chevronné',
      B: 'Barreur Compétent',
      C: 'Matelot du Dimanche',
      D: 'Terreur du Gelcoat',
    },
    incidentGelcoatScrape: (other) => `ÉRAFLURE GELCOAT contre ${other} (Hors pare-battages !)`,
    incidentFairwayHazard: (other) => `COLLISION DANS LE CHENAL (${other})`,
    incidentBareHullDock: (other) => `Coque contre ${other} (Ajustez les pare-battages !)`,
    incidentButterKiss: (other, bonus) => `ACCOSTAGE DOUX SUR PARE-BATTAGE contre ${other} (+${bonus} pts)`,
    incidentCleanCushion: (other) => `Pare-battage amorti sur ${other} ($0 dégât)`,
    incidentHardFender: (kn, other) => `Choc dur sur pare-battage (${kn} nd contre ${other})`,
    canvasSupLabel: 'SUP',
    canvasSpringLabel: 'Garde',
    canvasCleatHint: 'M : Taquet',
    canvasPivotLabel: 'PIVOT',
    canvasPropWalkLabel: 'PAS D’HÉLICE',
    canvasThrusterLabel: 'PROPULSEUR',
  },

  nl: {
    pageTitle: 'Harbor Master: Jachthaven Aanleg- & Manoeuvreersimulator',
    appTitle: 'Harbor Master',
    scoreLabel: 'Score',
    repairBillLabel: 'Schade',
    speedLabel: 'Snelheid',
    windLabel: 'Wind',
    compassDirs: ['N', 'NO', 'O', 'ZO', 'Z', 'ZW', 'W', 'NW'],
    leeNote: ' (Lij)',
    asternPrefix: 'ACHT ',
    knotsUnit: 'kn',
    ptsUnit: 'pt',
    stagesWindBtn: 'Niveaus / Wind',
    autoPilotOffBtn: '🤖 Autopiloot: UIT (P)',
    autoPilotOnBtn: '🤖 Autopiloot: AAN (P)',
    retryBtn: 'Opnieuw (R)',
    xrayOnBtn: 'Krachten: AAN',
    xrayOffBtn: 'Krachten: UIT',
    soundOnBtn: 'Geluid: AAN',
    soundMutedBtn: 'Geluid: Gedempt',
    helpBtn: '? Hulp (H)',
    throttleSingleLabel: 'Gashendel (↑/↓ · W/S)',
    throttleTwinSplitLabel: 'Dubbel gas: Gesplitst',
    throttleTwinUnifiedLabel: 'Dubbel gas: Gekoppeld',
    modeUnifiedBtn: '🔗 Modus: Gekoppeld (U)',
    modeSplitToUnifiedBtn: '⚡ Gesplitst (U) → Gekoppeld',
    modeUnifiedToSplitBtn: '🔗 Gekoppeld (U) → Gesplitst',
    portLeverLabel: 'BAKBOORD (W/S)',
    stbdLeverLabel: 'STUURBOORD (↑/↓)',
    neutralBtn: 'NEUTRAAL (Spatie)',
    increaseThrottleTooltip: 'Meer gas vooruit (Pijl omhoog / W)',
    decreaseThrottleTooltip: 'Minder gas / Achteruit (Pijl omlaag / S)',
    increasePortThrottleTooltip: 'Meer gas vooruit bakboordmotor (W)',
    decreasePortThrottleTooltip: 'Achteruit bakboordmotor (S)',
    increaseStbdThrottleTooltip: 'Meer gas vooruit stuurboordmotor (Pijl omhoog / I)',
    decreaseStbdThrottleTooltip: 'Achteruit stuurboordmotor (Pijl omlaag / K)',
    fendersLabel: 'Stootwillen:',
    fenderBow: 'Boeg',
    fenderMid: 'Mid',
    fenderAft: 'Achterschip',
    cleatLineDefaultBtn: 'Lijn op kikker (M)',
    tieLinesFinishBtn: '⚓ Vastmaken & Voltooien! (M)',
    castOffLineBtn: 'Lijn losgooien (M)',
    lassoCleatDistBtn: (distM) => `Kikker op ${distM}m (M)`,
    cleatOutOfReachBtn: 'Kikker buiten bereik',
    camNorthUpBtn: 'Cam: Noord-boven',
    camBoatUpBtn: 'Cam: Boeg-boven',
    zoomResetTooltip: 'Camerazoom terugzetten op 100%',
    bowPortBtn: '◀ BOEG BB (Q)',
    bowStbdBtn: 'BOEG SB (E) ▶',
    helmLabel: 'Roer (←/→ · A/D)',
    helmLeftTooltip: 'Roer bakboord / links (Pijl links / A)',
    helmRightTooltip: 'Roer stuurboord / rechts (Pijl rechts / D)',
    centerHelmBtn: 'Roer midscheeps (C)',
    helmLeftSuffix: 'L',
    helmRightSuffix: 'R',
    checklistInSlip: '✓ In box',
    checklistEnterSlip: '○ Vaar box in',
    checklistAligned: (deg) => `✓ Uitgelijnd (${deg}°)`,
    checklistAlignTarget: (deg) => `○ Uitlijnen <=32° (${deg}°)`,
    checklistStopped: (kn) => `✓ Gestopt (${kn} kn)`,
    checklistSlowTarget: (kn) => `○ Afremmen <=0.6 kn (${kn} kn)`,
    checklistMooringHold: (pct) => `Afmeren ${pct}% (of druk M om direct te voltooien!)`,
    helpModalTitle: 'Bediening & Jachthaven Aanleggids',
    closeEscBtn: 'Sluiten (Esc)',
    closeBtn: 'Sluiten',
    helpItems: [
      ['↑ / ↓  of  W / S', 'Regel gas vooruit / achteruit (pauzeert veilig in Neutraal bij 0%).'],
      ['U (Tweemotorige boten)', 'Wissel tussen Gekoppeld en Gesplitst (bakboord W/S & stuurboord ↑/↓ of I/K).'],
      ['← / →  of  A / D', 'Stuur roer bakboord / stuurboord (kort tikken voor 5°, vasthouden om te draaien).'],
      ['Spatie  ·  C', 'Spatie zet alle motoren direct in Neutraal; C zet het roer midscheeps (0°).'],
      ['Q / E (8m Kruiser)', 'Gebruik de boegschroef naar bakboord (Q) of stuurboord (E) om dwars te verzetten.'],
      ['Afmeren & Volgend niveau', 'Stop (< 0,65 kn) uitgelijnd in de box gedurende 2,5 s OF druk op M!'],
      ['Stootwillen Boeg / Mid / Achter', 'Verschuif je 2 bakboord- en 2 stuurboordstootwillen om boeg of kont te beschermen.'],
    ],
    setupModalTitle: 'Schipper-Campagne & Vrije Wind-Sandbox',
    sandboxTitle: 'Vrije Oefening: Boot & Wind (0–25 Knopen)',
    berthOptions: {
      'slip-a-bow': 'Noordbox A (Langszij vingersteiger)',
      'slip-b-tight': 'Noordbox B — Naast motorjacht',
      'east-seawall': 'Oostkade (Langszij afmeren)',
      'south-med-stern': 'Zuidkade — Mediterraan (Achteruit inparkeren)',
      'south-east-spring': 'Zuidoost-ligplaats (Indraaien op de spring)',
    },
    vesselTypeField: 'Scheepstype',
    targetBerthField: 'Doelligplaats',
    windSpeedField: 'Windsnelheid (0–25 kn)',
    windDirField: 'Windrichting (0°–355°)',
    knotsValueLabel: (kn) => `${kn} knopen`,
    launchSandboxBtn: 'Start vrije oefensessie',
    sandboxStagePrefix: 'Vrije oefening',
    rankModalTitle: (rank, rankTitle, score) => `Rang ${rank} — ${rankTitle} (${score} pt)`,
    rankModalBreakdown: (alignBonus, cleanBonus, kissBonus, windMult, repairStr) =>
      `Uitlijning +${alignBonus} · Gave romp +${cleanBonus} · Stootwil +${kissBonus} · Windfactor ${windMult}x · Schade $${repairStr}`,
    nextStageBtn: (nextTitle) => `Volgende: ${nextTitle} (Enter) ➔`,
    replayStageBtn: 'Herhalen (R)',
    allStagesBtn: 'Alle niveaus',
    gameOverTitle: (repairStr) => `💥 GAME OVER — Schade boven $10,000 ($${repairStr})`,
    gameOverLatestImpact: (label) => `Laatste aanvaring: ${label}. `,
    gameOverSummary: (latestCause, repairStr) =>
      `${latestCause}De totale schade aan romp en buurschepen bereikte $${repairStr} en overschreed de verzekeringslimiet van $10,000.`,
    retryStageEnterBtn: '↻ Niveau opnieuw (Enter / R)',
    rankTitles: {
      S: 'Meester Havenloods',
      A: 'Ervaren Schipper',
      B: 'Bekwame Roerganger',
      C: 'Weekendmatroos',
      D: 'Gelcoat-Gevaar',
    },
    incidentGelcoatScrape: (other) => `GELCOAT-SCHADE tegen ${other} (Naast de stootwillen!)`,
    incidentFairwayHazard: (other) => `AANVARING IN VAARWATER (${other})`,
    incidentBareHullDock: (other) => `Rompschade op ${other} (Verplaats stootwillen!)`,
    incidentButterKiss: (other, bonus) => `ZACHTE LANDING OP STOOTWIL tegen ${other} (+${bonus} pt)`,
    incidentCleanCushion: (other) => `Opgevangen door stootwil op ${other} ($0 schade)`,
    incidentHardFender: (kn, other) => `Harde klap op stootwil (${kn} kn tegen ${other})`,
    canvasSupLabel: 'SUP',
    canvasSpringLabel: 'Spring',
    canvasCleatHint: 'M: Kikker',
    canvasPivotLabel: 'DRAAIPUNT',
    canvasPropWalkLabel: 'SCHROEFEFFECT',
    canvasThrusterLabel: 'BOEGSCHROEF',
  },
};

const VESSEL_TRANSLATIONS: Record<HarborLang, Record<VesselId, VesselTranslation>> = {
  en: {
    outboard7m: {
      name: '7m Outboard Runabout',
      shortName: '7m Outboard',
      category: '200 HP Vectored Outboard · No Thruster',
      description:
        'Light planing center-console with a 200 HP steerable outboard. Pivots briskly under throttle bursts, but loses steering authority in Neutral and drifts quickly in crosswinds.',
      tip: 'Use short forward/reverse throttle blips with the helm turned first — in Neutral, the hull has minimal rudder grip!',
    },
    cruiser8m: {
      name: '8m Cabin Cruiser + Bow Thruster',
      shortName: '8m Cruiser + BT',
      category: '250 HP Outboard · Tunnel Bow Thruster',
      description:
        'Express weekender with high forward cabin windage, steerable 250 HP outboard, and proportional electric bow thruster for walking sideways into tight crosswind slips.',
      tip: 'Combine opposite helm + light throttle with the Bow Thruster (Q/E or rocker) to crab pure sideways against wind!',
    },
    twinoutboard9m: {
      name: '9m Twin-Outboard Motorboat',
      shortName: '9m Twin Outboard',
      category: 'Twin 200 HP Outboards · Unified or Split Throttle',
      description:
        'High-output offshore sportboat rigged with twin counter-rotating 200 HP steerable outboards. Run with Unified Throttle for effortless vectored steering, or switch to Split Throttle (U) for differential twin-engine docking.',
      tip: 'Press U (or tap Unified/Split) to switch between linked single-lever throttle and independent Port (W/S) & Starboard (↑/↓) throttles!',
    },
    catamaran11m: {
      name: '11m Cruising Catamaran',
      shortName: '11m Catamaran',
      category: 'Twin 40 HP Hull Saildrives · Twin Rudders + Helm',
      description:
        'Wide-beam twin-hull cruising catamaran with port and starboard diesel saildrives set 3.5m apart and linked twin rudders. Spins on a dime using opposing Port/Starboard throttles while the helm steers under headway or sternway.',
      tip: 'Use Split Throttles (W/S Port, ↑/↓ Starboard) in opposite directions to pivot 360° in place, and use Helm (A/D or ←/→) when making way!',
    },
    sailboat12m: {
      name: '12m Auxiliary Sailboat',
      shortName: '12m Sailboat',
      category: '40 HP Inboard · Fin Keel · Port Prop Walk',
      description:
        '8.6-ton cruiser-racer with deep fin keel, spade rudder, high mast windage, forward prop-wash kicking over rudder, and pronounced right-hand prop walk pulling the stern to PORT in reverse.',
      tip: 'Use Forward bursts over full rudder ("prop kicking") to pivot on a dime, and use Reverse prop walk to swing your stern cleanly to PORT!',
    },
  },

  es: {
    outboard7m: {
      name: 'Lancha Fueraborda 7m',
      shortName: 'Fueraborda 7m',
      category: 'Fueraborda orientable 200 CV · Sin hélice de proa',
      description:
        'Consola central ligera con fueraborda orientable de 200 CV. Pivota rápido con golpes de gas, pero pierde gobierno en punto muerto y abate con viento de través.',
      tip: 'Mete timón antes de dar breves golpes de gas avante/atrás: ¡en punto muerto apenas tiene gobierno!',
    },
    cruiser8m: {
      name: 'Crucero de Cabina 8m + Hélice de Proa',
      shortName: 'Crucero 8m + HP',
      category: 'Fueraborda 250 CV · Hélice de proa en túnel',
      description:
        'Crucero cabinado con francobordo alto a proa, fueraborda de 250 CV y hélice de proa proporcional para aconchar de costado en amarres estrechos con viento.',
      tip: '¡Combina timón contrario + poco gas con la hélice de proa (Q/E) para desplazarte lateralmente contra el viento!',
    },
    twinoutboard9m: {
      name: 'Motora Bimotor Fueraborda 9m',
      shortName: 'Bimotor 9m',
      category: 'Dos fuerabordas 200 CV · Mando unificado o separado',
      description:
        'Lancha deportiva con dos fuerabordas contrarrotantes de 200 CV. Navega con mando unificado o pulsa U para separar motores y ciabogar con empuje diferencial.',
      tip: '¡Pulsa U para alternar entre palanca única y mandos independientes de Babor (W/S) y Estribor (↑/↓)!',
    },
    catamaran11m: {
      name: 'Catamarán de Crucero 11m',
      shortName: 'Catamarán 11m',
      category: 'Dos diésel 40 CV en patines · Doble timón',
      description:
        'Catamarán de gran manga con motores diésel separados 3,5 m. Ciaboga sobre su propio eje oponiendo los mandos de babor y estribor.',
      tip: '¡Usa los mandos separados (W/S Babor, ↑/↓ Estribor) en sentidos opuestos para ciabogar 360° en el sitio!',
    },
    sailboat12m: {
      name: 'Velero Auxiliar 12m',
      shortName: 'Velero 12m',
      category: 'Intraborda 40 CV · Quilla profunda · Hélice dextrógira',
      description:
        'Crucero de 8,6 t con quilla profunda, timón de pala, golpe de hélice avante sobre el timón y marcada presión lateral de las palas que lleva la popa a BABOR al dar atrás.',
      tip: '¡Da golpes de avante con todo el timón metido para pivotar y aprovecha la caída de la popa a BABOR en marcha atrás!',
    },
  },

  de: {
    outboard7m: {
      name: '7m Außenborder-Sportboot',
      shortName: '7m Außenborder',
      category: '200 PS Außenborder · Kein Bugstrahlruder',
      description:
        'Leichtes Sportboot mit drehbarem 200-PS-Außenborder. Dreht agil unter kurzen Gasstößen, verliert im Leerlauf jedoch sofort die Ruderwirkung und treibt bei Seitenwind schnell ab.',
      tip: 'Erst Ruder legen, dann kurze Gasstöße geben — im Leerlauf hat das Boot kaum Ruderwirkung!',
    },
    cruiser8m: {
      name: '8m Kajütboot + Bugstrahlruder',
      shortName: '8m Kajütboot + BSR',
      category: '250 PS Außenborder · Bugstrahlruder',
      description:
        'Kajütboot mit höherer Windangriffsfläche am Bug, 250-PS-Außenborder und proportionalem Bugstrahlruder zum seitlichen Versetzen in engen Boxengassen.',
      tip: 'Kombiniere Gegenruder + leichtes Gas mit dem Bugstrahlruder (Q/E), um das Boot quer gegen den Wind zu versetzen!',
    },
    twinoutboard9m: {
      name: '9m Doppel-Außenborder Motorboot',
      shortName: '9m Doppel-AB',
      category: 'Zwei 200 PS Außenborder · Gekoppelt oder Getrennt',
      description:
        'Sportboot mit zwei gegenläufigen 200-PS-Außenbordern. Fahre gekoppelt oder drücke U für getrennte Backbord/Steuerbord-Gashebel beim Drehen auf engstem Raum.',
      tip: 'Drücke U, um zwischen gekoppeltem Gas und getrennten Hebeln für Backbord (W/S) & Steuerbord (↑/↓) zu wechseln!',
    },
    catamaran11m: {
      name: '11m Fahrtenkatamaran',
      shortName: '11m Katamaran',
      category: 'Zwei 40 PS Saildrives · Doppelruder',
      description:
        'Breiter Fahrtenkatamaran mit weit auseinanderliegenden Saildrives (3,5 m). Dreht mit gegenläufigen Gashebeln auf dem Teller.',
      tip: 'Nutze getrennte Gashebel (W/S Backbord, ↑/↓ Steuerbord) gegenläufig, um auf der Stelle um 360° zu drehen!',
    },
    sailboat12m: {
      name: '12m Segelyacht mit Einbaudiesel',
      shortName: '12m Segelyacht',
      category: '40 PS Einbaudiesel · Kurzkiel · Radeffekt nach Backbord',
      description:
        '8,6-Tonnen-Segelyacht mit tiefem Kiel, Spatenruder, starkem Schraubenstrom aufs Ruder bei Vorausfahrt und ausgeprägtem rechtsdrehendem Radeffekt, der das Heck bei Rückwärtsfahrt nach BACKBORD zieht.',
      tip: 'Nutze kurze Vorausstöße ins gelegte Ruder zum Drehen und den Radeffekt rückwärts, um das Heck nach BACKBORD zu versetzen!',
    },
  },

  fr: {
    outboard7m: {
      name: 'Coque Open Hors-Bord 7m',
      shortName: 'Hors-Bord 7m',
      category: 'Hors-bord orientable 200 ch · Sans propulseur',
      description:
        'Coque open légère avec hors-bord orientable de 200 ch. Pivote vite sous de brèves impulsions de gaz, mais perd son pouvoir directeur au point mort et dérive vite au vent de travers.',
      tip: 'Orientez la barre avant de donner de brefs coups de gaz : au point mort, la coque ne gouverne presque plus !',
    },
    cruiser8m: {
      name: 'Vedette Habitable 8m + Propulseur',
      shortName: 'Vedette 8m + PE',
      category: 'Hors-bord 250 ch · Propulseur d’étrave',
      description:
        'Vedette de croisière avec fardage avant marqué, hors-bord de 250 ch et propulseur d’étrave proportionnel pour ripper latéralement dans les postes étroits.',
      tip: 'Combinez barre inverse + filet de gaz avec le propulseur d’étrave (Q/E) pour déplacer le bateau en crabe contre le vent !',
    },
    twinoutboard9m: {
      name: 'Vedette Bi-Moteur Hors-Bord 9m',
      shortName: 'Bi-Moteur 9m',
      category: 'Deux hors-bord 200 ch · Gaz couplés ou séparés',
      description:
        'Vedette rapide équipée de deux hors-bord contre-rotatifs de 200 ch. Naviguez en mode couplé ou appuyez sur U pour dissocier bâbord et tribord.',
      tip: 'Appuyez sur U pour passer du levier unique aux commandes séparées Bâbord (W/S) et Tribord (↑/↓) !',
    },
    catamaran11m: {
      name: 'Catamaran de Croisière 11m',
      shortName: 'Catamaran 11m',
      category: 'Deux saildrives 40 ch · Double safran',
      description:
        'Catamaran large avec moteurs espacés de 3,5 m. Pivote sur place en opposant les gaz bâbord et tribord.',
      tip: 'Utilisez les gaz séparés (W/S Bâbord, ↑/↓ Tribord) en sens opposé pour pivoter sur place à 360° !',
    },
    sailboat12m: {
      name: 'Voilier Habitable 12m',
      shortName: 'Voilier 12m',
      category: 'Inboard 40 ch · Quillard · Pas d’hélice à bâbord',
      description:
        'Croiseur de 8,6 t à quille profonde, fort souffle d’hélice sur le safran en marche avant et pas d’hélice dextrogyre marqué tirant la poupe à BÂBORD en marche arrière.',
      tip: 'Donnez des coups de fouet avant barre toute pour pivoter, et utilisez le pas d’hélice arrière pour amener la poupe à BÂBORD !',
    },
  },

  nl: {
    outboard7m: {
      name: '7m Buitenboord Runabout',
      shortName: '7m Buitenboord',
      category: '200 pk Buitenboordmotor · Geen boegschroef',
      description:
        'Lichte consoleboot met stuurbare 200 pk buitenboordmotor. Draait vlot op korte gasstoten, maar verliest roerwerking in Neutraal en verwaait snel bij dwarswind.',
      tip: 'Geef eerst roer en dan korte stootjes gas vooruit/achteruit — in Neutraal heeft de boot nauwelijks roerwerking!',
    },
    cruiser8m: {
      name: '8m Kajuitkruiser + Boegschroef',
      shortName: '8m Kruiser + BS',
      category: '250 pk Buitenboord · Boegschroef in tunnel',
      description:
        'Kajuitboot met hoge windvang voorop, 250 pk motor en proportionele boegschroef om dwars tegen de wind in smalle boxen te verzetten.',
      tip: 'Combineer tegenroer + een tikje gas met de boegschroef (Q/E) om dwarsuit tegen de wind in te varen!',
    },
    twinoutboard9m: {
      name: '9m Tweemotorige Motorboot',
      shortName: '9m Dubbel-BB',
      category: 'Twee 200 pk Buitenboordmotoren · Gekoppeld of Gesplitst',
      description:
        'Sportboot met twee tegengesteld draaiende 200 pk buitenboordmotoren. Vaar gekoppeld of druk op U voor gesplitste bakboord/stuurboord-hendels.',
      tip: 'Druk op U om te wisselen tussen één gekoppelde hendel en aparte hendels voor Bakboord (W/S) en Stuurboord (↑/↓)!',
    },
    catamaran11m: {
      name: '11m Toercatamaran',
      shortName: '11m Catamaran',
      category: 'Twee 40 pk Saildrives · Dubbele roeren',
      description:
        'Brede catamaran met motoren op 3,5 m afstand. Draait op zijn plaats door bakboord- en stuurboordgas tegengesteld te zetten.',
      tip: 'Gebruik gesplitste hendels (W/S Bakboord, ↑/↓ Stuurboord) in tegengestelde richting om 360° op de plaats te draaien!',
    },
    sailboat12m: {
      name: '12m Zeiljacht met Hulpmotor',
      shortName: '12m Zeiljacht',
      category: '40 pk Inboard · Vinkiel · Schroefeffect naar bakboord',
      description:
        '8,6-tons zeiljacht met diepe kiel, balansroer, sterke schroefwaterwerking op het roer vooruit en duidelijk rechtsdraaiend schroefeffect dat het achterschip achteruit naar BAKBOORD trekt.',
      tip: 'Geef korte stoten vooruit over vol roer om scherp te draaien en gebruik het schroefeffect achteruit om de kont naar BAKBOORD te zetten!',
    },
  },
};

const STAGE_TRANSLATIONS: Record<HarborLang, Record<string, StageTranslation>> = {
  en: {
    'stage-1-calm-arrival': {
      title: '1. Calm Morning Arrival',
      subtitle: '7m Outboard · 2 kn North · North Slip A (Bow-In)',
      briefing:
        'Ease down the main fairway, turn left into Slip A, and click into Reverse briefly to stop cleanly on your side fenders.',
    },
    'stage-2-crosswind-slip': {
      title: '2. Crosswind Fairway Turn',
      subtitle: '7m Outboard · 10 kn West Crosswind · Tight Slip B',
      briefing:
        'A 10 kn west breeze pushes you toward moored M/Y Solaris! Set Bow-Heavy fenders and turn up-wind of the slip entrance.',
    },
    'stage-3-thruster-crab': {
      title: '3. Crabbing Into Tight Quarters',
      subtitle: '8m Cruiser + Thruster · 14 kn East Off-Dock Wind',
      briefing:
        'Use your proportional Bow Thruster (Q/E or BOW rocker) alongside M/Y Solaris so your 2 starboard fenders take the kiss — never bare fiberglass!',
    },
    'stage-4-parallel-seawall': {
      title: '4. Parallel Seawall Ferry',
      subtitle: '8m Cruiser + Thruster · 16 kn West Gusts · East Pocket',
      briefing:
        'Enter from the western harbor mouth, time your pass clear of the paddleboarder and dinghy tender, then use Bow Thruster & gentle reverse to kiss the East Seawall at < 0.8 kn!',
    },
    'stage-5-prop-walk-101': {
      title: '5. Right-Hand Prop Walk 101',
      subtitle: '12m Sailboat · 5 kn Light Air · East Seawall Port-Side',
      briefing:
        'Approach East Seawall at a shallow angle, shift to Neutral, then engage Reverse — watch right-hand Prop Walk pull your stern cleanly to PORT!',
    },
    'stage-6-standing-pivot': {
      title: '6. Standing Pivot ("Prop Kicking")',
      subtitle: '12m Sailboat · 12 kn Crosswind · Fairway 180° Pivot',
      briefing:
        'Facing East in a tight basin! Alternate hard Right Helm + short Forward prop-wash kicks with bare Reverse prop-walk bursts to spin 180° on a dime.',
    },
    'stage-7-med-mooring': {
      title: '7. Mediterranean Stern-In Mooring',
      subtitle: '12m Sailboat · 15 kn SW Wind + Yacht Wind Shadow',
      briefing:
        'Slide fenders to Quarter Rig, back astern into the South Med Quay beside S/Y Mistral, and feel the wind drop as you enter her leeward wind shadow!',
    },
    'stage-8-spring-line-rescue': {
      title: '8. Spring-Line Cleat Lasso',
      subtitle: '8m Cruiser + Thruster · 20 kn Off-Quay Gale',
      briefing:
        '20 kn southerly gale blows hard off the South Quay! Pass within 3.8m of a quay cleat, press M (or tap the glowing cleat) to lasso a spring line, and motor gently to pivot in!',
    },
    'stage-9-busy-harbor': {
      title: '9. Busy Sunday Fairway & Wake Surge',
      subtitle: '7m Outboard · 19 kn Gusts + Paddleboarder & Ferry Wake',
      briefing:
        'Time your turn behind the fairway paddleboarder and anticipate the harbor ferry wake surge before slipping alongside M/Y Solaris!',
    },
    'stage-10-master-gale': {
      title: '10. Master Mariner — 25-Knot Gale',
      subtitle: '12m Sailboat · 25 kn Full Gale + Traffic · Med Stern-In',
      briefing:
        'Final Exam: 25 kn westerly gale screaming down the channel! Use prop walk, quarter fenders, yacht wind shadow, and cleat spring lines for an S-Rank landing.',
    },
    'stage-11-twin-outboard-docking': {
      title: '11. Twin-Outboard Express',
      subtitle: '9m Twin Outboard · Unified/Split Throttles · North Slip B',
      briefing:
        'Twin 200 HP steerable outboards! Drive with Unified Throttle or press U for Split Mode (W/S Port, ↑/↓ Starboard) to use differential thrust and helm into Slip B.',
    },
    'stage-12-catamaran-twin-pivot': {
      title: '12. Catamaran Twin-Screw Pivot',
      subtitle: '11m Catamaran · Twin Hull Engines + Helm · 180° Basin Turn',
      briefing:
        'Wide-beam 11m Catamaran with twin hull engines & linked rudders! Use Split Throttles (W/S Port, ↑/↓ Stbd) in opposite gears to spin 180° in place, then helm into Slip A.',
    },
  },

  es: {
    'stage-1-calm-arrival': {
      title: '1. Llegada en Calma Matinal',
      subtitle: 'Fueraborda 7m · 2 kn Norte · Finger Norte A (Proa)',
      briefing:
        'Avanza despacio por el canal principal, cae a babor hacia el Finger A y da una palada atrás para parar suavemente sobre tus defensas.',
    },
    'stage-2-crosswind-slip': {
      title: '2. Giro con Viento de Través',
      subtitle: 'Fueraborda 7m · 10 kn Oeste · Amarre estrecho B',
      briefing:
        '¡Una brisa de 10 kn del oeste te abate hacia el M/Y Solaris! Pon las defensas en Proa y abre la curva a barlovento de la entrada.',
    },
    'stage-3-thruster-crab': {
      title: '3. Aconchando en Espacio Estrecho',
      subtitle: 'Crucero 8m + Hélice Proa · 14 kn Este',
      briefing:
        'Usa la hélice de proa (Q/E) junto al M/Y Solaris para que tus 2 defensas de estribor reciban el apoyo, ¡nunca el casco desnudo!',
    },
    'stage-4-parallel-seawall': {
      title: '4. Abarloado al Muelle Este',
      subtitle: 'Crucero 8m + Hélice Proa · Rachas 16 kn Oeste · Muelle Este',
      briefing:
        'Entra por la bocana oeste, deja libre al paddle surf y al chinchorro, y usa la hélice de proa y marcha atrás suave para abarloar a < 0,8 kn.',
    },
    'stage-5-prop-walk-101': {
      title: '5. Presión Lateral de las Palas 101',
      subtitle: 'Velero 12m · 5 kn · Muelle Este babor al muelle',
      briefing:
        'Aproxímate al Muelle Este con poco ángulo, pon punto muerto y da atrás: ¡observa cómo la hélice dextrógira lleva tu popa limpiamente a BABOR!',
    },
    'stage-6-standing-pivot': {
      title: '6. Ciaboga por Avante y Atrás',
      subtitle: 'Velero 12m · 12 kn Través · Ciaboga 180° en dársena',
      briefing:
        '¡Proa al este en una dársena estrecha! Alterna todo el timón a estribor + golpe avante con paladas atrás para ciabogar 180° sin arrancada.',
    },
    'stage-7-med-mooring': {
      title: '7. Atraque de Popa a la Mediterránea',
      subtitle: 'Velero 12m · 15 kn SO + Socaire del yate',
      briefing:
        'Pasa las defensas a Popa, entra ciando al Muelle Sur junto al S/Y Mistral y nota cómo cae el viento al entrar en su socaire.',
    },
    'stage-8-spring-line-rescue': {
      title: '8. Maniobra con Spring a Cornamusa',
      subtitle: 'Crucero 8m + Hélice Proa · 20 kn Sur',
      briefing:
        '¡20 kn del sur te despiden del muelle! Pasa a menos de 3,8 m de una cornamusa, pulsa M para dar un spring y trabaja despacio sobre máquina para aconchar.',
    },
    'stage-9-busy-harbor': {
      title: '9. Canal Concurrido y Estela de Ferry',
      subtitle: 'Fueraborda 7m · Rachas 19 kn + Tráfico y estela',
      briefing:
        'Mide tu maniobra tras el paddle surf y anticipa el empuje de la ola del ferry antes de entrar junto al M/Y Solaris.',
    },
    'stage-10-master-gale': {
      title: '10. Capitán de Puerto — Temporal de 25 Nudos',
      subtitle: 'Velero 12m · 25 kn Temporal + Tráfico · Popa al muelle',
      briefing:
        'Examen final: ¡temporal de 25 kn del oeste! Combina presión lateral de la hélice, defensas en popa, socaire y cabos para un atraque de rango S.',
    },
    'stage-11-twin-outboard-docking': {
      title: '11. Expreso Bimotor Fueraborda',
      subtitle: 'Bimotor 9m · Mandos Unificados/Separados · Finger Norte B',
      briefing:
        '¡Dos fuerabordas de 200 CV! Gobierna en modo Unificado o pulsa U para modo Separado (W/S Babor, ↑/↓ Estribor) y entra en el Finger B.',
    },
    'stage-12-catamaran-twin-pivot': {
      title: '12. Ciaboga en Catamarán Bimotor',
      subtitle: 'Catamarán 11m · Doble motor + Timón · Giro 180°',
      briefing:
        '¡Catamarán de 11 m de gran manga! Usa los mandos separados (W/S Babor, ↑/↓ Estribor) en sentidos opuestos para ciabogar 180° sobre el eje y entra en el Finger A.',
    },
  },

  de: {
    'stage-1-calm-arrival': {
      title: '1. Ruhige Morgenankunft',
      subtitle: '7m Außenborder · 2 kn Nord · Nordbox A (Bug voraus)',
      briefing:
        'Fahre langsam durch die Hauptgasse, biege links in Box A ein und gib kurz Rückwärtsgas, um sanft an den Fendern aufzustoppen.',
    },
    'stage-2-crosswind-slip': {
      title: '2. Boxeneinfahrt bei Seitenwind',
      subtitle: '7m Außenborder · 10 kn Westwind · Enge Box B',
      briefing:
        '10 kn Westwind drücken dich auf die M/Y Solaris! Setze die Fender nach vorn (Bug) und halte beim Einbiegen nach Luv vor.',
    },
    'stage-3-thruster-crab': {
      title: '3. Querversetzen auf engem Raum',
      subtitle: '8m Kajütboot + Bugstrahl · 14 kn Ostwind',
      briefing:
        'Nutze das proportionale Bugstrahlruder (Q/E) neben der M/Y Solaris, damit deine 2 Steuerbordfender abfedern — niemals das blanke Gelcoat!',
    },
    'stage-4-parallel-seawall': {
      title: '4. Längsseits an die Ostmole',
      subtitle: '8m Kajütboot + Bugstrahl · 16 kn Westböen · Ostmole',
      briefing:
        'Laufe von Westen ein, weiche dem Stand-Up-Paddler und dem Beiboot aus und lege mit Bugstrahlruder und sanftem Rückwärtsschub mit < 0,8 kn längsseits an!',
    },
    'stage-5-prop-walk-101': {
      title: '5. Rechtsdrehender Radeffekt 101',
      subtitle: '12m Segelyacht · 5 kn Schwachwind · Ostmole Backbord',
      briefing:
        'Fahre im flachen Winkel an die Ostmole heran, schalte auf Leerlauf und gib Rückwärtsgas — der Radeffekt zieht dein Heck sauber nach BACKBORD!',
    },
    'stage-6-standing-pivot': {
      title: '6. Drehen auf dem Teller',
      subtitle: '12m Segelyacht · 12 kn Seitenwind · 180°-Wende',
      briefing:
        'Bug zeigt nach Osten im engen Hafenbecken! Wechsle hart Steuerbordruder + kurze Vorausstöße mit kurzen Rückwärtsstößen ab, um auf der Stelle um 180° zu drehen.',
    },
    'stage-7-med-mooring': {
      title: '7. Römisch-Katholisch Anlegen (Heck zur Mole)',
      subtitle: '12m Segelyacht · 15 kn SW-Wind + Windschatten',
      briefing:
        'Schiebe die Fender ans Heck, fahre rückwärts neben der S/Y Mistral an den Südkai und nutze ihren Lee-Windschatten!',
    },
    'stage-8-spring-line-rescue': {
      title: '8. Eindampfen in die Spring',
      subtitle: '8m Kajütboot + Bugstrahl · 20 kn ablandiger Südwind',
      briefing:
        '20 kn Südwind drücken dich vom Kai weg! Fahre auf 3,8 m an eine Klampe heran, drücke M zum Belegen einer Spring und dampfe vorsichtig ein!',
    },
    'stage-9-busy-harbor': {
      title: '9. Volles Fahrwasser &Fährschwell',
      subtitle: '7m Außenborder · 19 kn Böen + Verkehr & Schwell',
      briefing:
        'Passe deine Wende hinter dem Paddler ab und rechne den Schwell der Hafenfähre ein, bevor du neben der M/Y Solaris festmachst!',
    },
    'stage-10-master-gale': {
      title: '10. Hafenkapitän — 25-Knoten-Sturm',
      subtitle: '12m Segelyacht · 25 kn Sturm + Verkehr · Heckanleger',
      briefing:
        'Abschlussprüfung: 25 kn Weststurm im Hafen! Nutze Radeffekt, Heckfender, Windschatten und Springleinen für ein S-Rang-Manöver.',
    },
    'stage-11-twin-outboard-docking': {
      title: '11. Doppel-Außenborder Express',
      subtitle: '9m Doppel-AB · Gekoppelt/Getrennt · Nordbox B',
      briefing:
        'Zwei 200-PS-Außenborder! Fahre gekoppelt oder drücke U für getrennte Hebel (W/S Backbord, ↑/↓ Steuerbord), um mit Schubdifferenz in Box B einzulaufen.',
    },
    'stage-12-catamaran-twin-pivot': {
      title: '12. Katamaran-Tellerwende',
      subtitle: '11m Katamaran · Doppelmotor + Ruder · 180°-Wende',
      briefing:
        'Breiter 11m-Katamaran! Nutze getrennte Gashebel (W/S Backbord, ↑/↓ Steuerbord) gegenläufig für eine 180°-Drehung auf der Stelle und steuere in Box A.',
    },
  },

  fr: {
    'stage-1-calm-arrival': {
      title: '1. Arrivée Matinale au Calme',
      subtitle: 'Hors-Bord 7m · 2 nd Nord · Catway Nord A',
      briefing:
        'Avancez doucement dans le chenal, virez à gauche dans le poste A et passez brièvement en marche arrière pour stopper net sur vos pare-battages.',
    },
    'stage-2-crosswind-slip': {
      title: '2. Virage par Vent de Travers',
      subtitle: 'Hors-Bord 7m · 10 nd Ouest · Poste étroit B',
      briefing:
        'Une brise d’ouest de 10 nd vous pousse vers le M/Y Solaris ! Placez les pare-battages sur l’Avant et virez au vent de l’entrée.',
    },
    'stage-3-thruster-crab': {
      title: '3. En Crabe dans un Poste Étroit',
      subtitle: 'Vedette 8m + Propulseur · 14 nd Est',
      briefing:
        'Utilisez votre propulseur d’étrave (Q/E) le long du M/Y Solaris pour que vos 2 pare-battages tribord amortissent le contact — jamais le gelcoat nu !',
    },
    'stage-4-parallel-seawall': {
      title: '4. Accostage en Long au Quai Est',
      subtitle: 'Vedette 8m + Propulseur · Rafales 16 nd Ouest · Quai Est',
      briefing:
        'Entrez par la passe ouest, laissez passer le paddle et l’annexe, puis utilisez le propulseur et une douce marche arrière pour accoster à < 0,8 nd !',
    },
    'stage-5-prop-walk-101': {
      title: '5. Pas d’Hélice Dextrogyre 101',
      subtitle: 'Voilier 12m · 5 nd · Quai Est bâbord à quai',
      briefing:
        'Approchez du Quai Est sous un faible angle, passez au point mort puis battez en arrière — le pas d’hélice tire proprement votre poupe à BÂBORD !',
    },
    'stage-6-standing-pivot': {
      title: '6. Évitage sur Place (« Coup de Fouet »)',
      subtitle: 'Voilier 12m · 12 nd Travers · Évitage 180°',
      briefing:
        'Cap à l’est dans un bassin étroit ! Alternez barre toute à droite + coup de fouet avant et marche arrière pour pivoter de 180° sur place.',
    },
    'stage-7-med-mooring': {
      title: '7. Amarrage Cul à Quai (Méditerranée)',
      subtitle: 'Voilier 12m · 15 nd SO + Abri du voilier voisin',
      briefing:
        'Reculez les pare-battages sur l’Arrière, culez vers le Quai Sud à côté du S/Y Mistral et sentez le vent tomber dans son dévent !',
    },
    'stage-8-spring-line-rescue': {
      title: '8. Manœuvre sur Garde au Taquet',
      subtitle: 'Vedette 8m + Propulseur · 20 nd Vent traversier du Sud',
      briefing:
        '20 nd du sud vous écartent du quai ! Passez à moins de 3,8 m d’un taquet, appuyez sur M pour capeler une garde et appuyez au moteur pour rentrer !',
    },
    'stage-9-busy-harbor': {
      title: '9. Chenal Fréquenté et Sillage de Ferry',
      subtitle: 'Hors-Bord 7m · Rafales 19 nd + Trafic et houle',
      briefing:
        'Synchronisez votre virage derrière le paddle et anticipez le ressac du ferry avant de vous glisser à côté du M/Y Solaris !',
    },
    'stage-10-master-gale': {
      title: '10. Capitaine au Long Cours — Coup de Vent 25 Nœuds',
      subtitle: 'Voilier 12m · 25 nd Coup de vent + Trafic · Cul à quai',
      briefing:
        'Examen final : 25 nd d’ouest dans le chenal ! Utilisez le pas d’hélice, les pare-battages arrière, le dévent et les amarres pour décrocher le rang S.',
    },
    'stage-11-twin-outboard-docking': {
      title: '11. Express Bi-Moteur Hors-Bord',
      subtitle: 'Bi-Moteur 9m · Gaz Couplés/Séparés · Catway Nord B',
      briefing:
        'Deux hors-bord de 200 ch ! Manœuvrez en mode Couplé ou appuyez sur U pour le mode Séparé (W/S Bâbord, ↑/↓ Tribord) afin d’entrer au poste B.',
    },
    'stage-12-catamaran-twin-pivot': {
      title: '12. Évitage en Catamaran Bi-Moteur',
      subtitle: 'Catamaran 11m · Bimoteur + Safrans · Rotation 180°',
      briefing:
        'Catamaran de 11 m à large bau ! Utilisez les gaz séparés (W/S Bâbord, ↑/↓ Tribord) en sens opposé pour pivoter de 180° sur place puis entrer au poste A.',
    },
  },

  nl: {
    'stage-1-calm-arrival': {
      title: '1. Kalme Ochtendaankomst',
      subtitle: '7m Buitenboord · 2 kn Noord · Noordbox A (Boeg vooruit)',
      briefing:
        'Vaar rustig door de hoofdgeul, draai bakboord uit Box A in en tik kort achteruit om zacht op je stootwillen af te stoppen.',
    },
    'stage-2-crosswind-slip': {
      title: '2. Indraaier met Dwarswind',
      subtitle: '7m Buitenboord · 10 kn West · Smalle Box B',
      briefing:
        'Een westenbries van 10 kn zet je weg naar de M/Y Solaris! Hang de stootwillen naar de Boeg en stuur bovenwinds aan.',
    },
    'stage-3-thruster-crab': {
      title: '3. Dwars Verzetten in Krap Water',
      subtitle: '8m Kruiser + Boegschroef · 14 kn Oost',
      briefing:
        'Gebruik je proportionele boegschroef (Q/E) naast de M/Y Solaris zodat je 2 stuurboordstootwillen het contact opvangen — nooit het kale polyester!',
    },
    'stage-4-parallel-seawall': {
      title: '4. Langszij aan de Oostkade',
      subtitle: '8m Kruiser + Boegschroef · 16 kn Westvlagen · Oostkade',
      briefing:
        'Vaar binnen via de westelijke havenmond, houd vrij van de supper en bijboot en leg met boegschroef en zacht achteruit aan met < 0,8 kn!',
    },
    'stage-5-prop-walk-101': {
      title: '5. Rechtsdraaiend Schroefeffect 101',
      subtitle: '12m Zeiljacht · 5 kn · Oostkade bakboord aan de wal',
      briefing:
        'Benader de Oostkade onder een kleine hoek, zet hem in Neutraal en sla achteruit — zie hoe het schroefeffect je achterschip netjes naar BAKBOORD trekt!',
    },
    'stage-6-standing-pivot': {
      title: '6. Draaien op de Plaats ("Schroefwaterstoot")',
      subtitle: '12m Zeiljacht · 12 kn Dwarswind · 180° Keer',
      briefing:
        'Boeg naar het oosten in een krappe kom! Wissel vol stuurboordroer + korte stoten vooruit af met achteruit om 180° op een dubbeltje te draaien.',
    },
    'stage-7-med-mooring': {
      title: '7. Mediterraan Achteruit Afmeren',
      subtitle: '12m Zeiljacht · 15 kn ZW-wind + Windschaduw',
      briefing:
        'Schuif de stootwillen naar het Achterschip, vaar achteruit naar de Zuidkade naast de S/Y Mistral en voel de wind wegvallen in haar lij!',
    },
    'stage-8-spring-line-rescue': {
      title: '8. Indraaien op een Spring',
      subtitle: '8m Kruiser + Boegschroef · 20 kn Aflandige Wind',
      briefing:
        '20 kn zuidenwind blaast je van de kade! Vaar binnen 3,8 m langs een kikker, druk op M om een spring vast te maken en draai rustig op de motor naar binnen!',
    },
    'stage-9-busy-harbor': {
      title: '9. Druk Vaarwater & Veerbootgolf',
      subtitle: '7m Buitenboord · 19 kn Vlagen + Verkeer & Hekgolf',
      briefing:
        'Time je bocht achter de supper langs en vang de hekgolf van de veerboot op voordat je naast de M/Y Solaris afmeert!',
    },
    'stage-10-master-gale': {
      title: '10. Havenmeester — 25-Knopen Storm',
      subtitle: '12m Zeiljacht · 25 kn Storm + Verkeer · Achteruit aanleggen',
      briefing:
        'Eindexamen: 25 kn westenstorm door de geul! Gebruik schroefeffect, achterstootwillen, windschaduw en springlijnen voor een S-rang landing.',
    },
    'stage-11-twin-outboard-docking': {
      title: '11. Dubbel-Buitenboord Express',
      subtitle: '9m Dubbel-BB · Gekoppeld/Gesplitst · Noordbox B',
      briefing:
        'Twee 200 pk buitenboordmotoren! Vaar gekoppeld of druk op U voor Gesplitste modus (W/S Bakboord, ↑/↓ Stuurboord) en stuur Box B binnen.',
    },
    'stage-12-catamaran-twin-pivot': {
      title: '12. Catamaran Draai op de Plaats',
      subtitle: '11m Catamaran · Dubbele motor + Roer · 180° Draai',
      briefing:
        'Brede 11m catamaran! Gebruik gesplitste hendels (W/S Bakboord, ↑/↓ Stuurboord) in tegengestelde richting om 180° op de plaats te draaien en Box A in te varen.',
    },
  },
};

const COLLIDER_LABEL_TRANSLATIONS: Record<HarborLang, Record<string, string>> = {
  en: {},
  es: {
    'North Main Pier': 'Muelle Principal Norte',
    'West Finger Pier': 'Finger Oeste',
    'Slip A Finger Pier': 'Finger del Amarre A',
    'Slip B Finger Pier': 'Finger del Amarre B',
    'Slip C Finger Pier': 'Finger del Amarre C',
    'East Seawall Quay': 'Muelle Este',
    'South Med-Moor Quay': 'Muelle Sur Mediterráneo',
    'South West Jetty': 'Espigón Suroeste',
    'Slip A Outer Piling': 'Pilote Exterior A',
    'Slip B Outer Piling': 'Pilote Exterior B',
    'Slip C Outer Piling': 'Pilote Exterior C',
    'Med Berth West Piling': 'Pilote Oeste Med',
    'Med Berth East Piling': 'Pilote Este Med',
    'Channel Marker Piling': 'Pilote del Canal',
    'Paddleboarder': 'Paddle Surf',
    'Harbor Tender': 'Chinchorro del Puerto',
  },
  de: {
    'North Main Pier': 'Nord-Hauptsteg',
    'West Finger Pier': 'West-Fingersteg',
    'Slip A Finger Pier': 'Fingersteg Box A',
    'Slip B Finger Pier': 'Fingersteg Box B',
    'Slip C Finger Pier': 'Fingersteg Box C',
    'East Seawall Quay': 'Ostmole',
    'South Med-Moor Quay': 'Südkai',
    'South West Jetty': 'Südwest-Steg',
    'Slip A Outer Piling': 'Außenpfahl Box A',
    'Slip B Outer Piling': 'Außenpfahl Box B',
    'Slip C Outer Piling': 'Außenpfahl Box C',
    'Med Berth West Piling': 'Westpfahl Südkai',
    'Med Berth East Piling': 'Ostpfahl Südkai',
    'Channel Marker Piling': 'Fahrwasserpfahl',
    'Paddleboarder': 'Stand-Up-Paddler',
    'Harbor Tender': 'Hafen-Beiboot',
  },
  fr: {
    'North Main Pier': 'Ponton Principal Nord',
    'West Finger Pier': 'Catway Ouest',
    'Slip A Finger Pier': 'Catway Poste A',
    'Slip B Finger Pier': 'Catway Poste B',
    'Slip C Finger Pier': 'Catway Poste C',
    'East Seawall Quay': 'Quai Est',
    'South Med-Moor Quay': 'Quai Sud Méditerranéen',
    'South West Jetty': 'Jetée Sud-Ouest',
    'Slip A Outer Piling': 'Duc-d’Albe Poste A',
    'Slip B Outer Piling': 'Duc-d’Albe Poste B',
    'Slip C Outer Piling': 'Duc-d’Albe Poste C',
    'Med Berth West Piling': 'Pieu Ouest Quai Sud',
    'Med Berth East Piling': 'Pieu Est Quai Sud',
    'Channel Marker Piling': 'Pieu de Chenal',
    'Paddleboarder': 'Paddle',
    'Harbor Tender': 'Annexe du Port',
  },
  nl: {
    'North Main Pier': 'Noordelijke Hoofdsteiger',
    'West Finger Pier': 'Westelijke Vingersteiger',
    'Slip A Finger Pier': 'Vingersteiger Box A',
    'Slip B Finger Pier': 'Vingersteiger Box B',
    'Slip C Finger Pier': 'Vingersteiger Box C',
    'East Seawall Quay': 'Oostkade',
    'South Med-Moor Quay': 'Zuidkade',
    'South West Jetty': 'Zuidwestelijke Steiger',
    'Slip A Outer Piling': 'Buitenpaal Box A',
    'Slip B Outer Piling': 'Buitenpaal Box B',
    'Slip C Outer Piling': 'Buitenpaal Box C',
    'Med Berth West Piling': 'Westpaal Zuidkade',
    'Med Berth East Piling': 'Oostpaal Zuidkade',
    'Channel Marker Piling': 'Vaarwaterpaal',
    'Paddleboarder': 'Supper',
    'Harbor Tender': 'Havenbijboot',
  },
};

export function getUiStrings(lang: HarborLang = activeLang): HarborUiStrings {
  return UI_STRINGS[lang] ?? UI_STRINGS.en;
}

export function getLocalizedStage(
  stage: CampaignStage,
  lang: HarborLang = activeLang
): StageTranslation {
  const dict = STAGE_TRANSLATIONS[lang] ?? STAGE_TRANSLATIONS.en;
  return (
    dict[stage.id] ??
    STAGE_TRANSLATIONS.en[stage.id] ?? {
      title: stage.title,
      subtitle: stage.subtitle,
      briefing: stage.briefing,
    }
  );
}

export function getLocalizedVessel(
  spec: VesselSpec,
  lang: HarborLang = activeLang
): VesselTranslation {
  const dict = VESSEL_TRANSLATIONS[lang] ?? VESSEL_TRANSLATIONS.en;
  return (
    dict[spec.id] ??
    VESSEL_TRANSLATIONS.en[spec.id] ?? {
      name: spec.name,
      shortName: spec.shortName,
      category: spec.category,
      description: spec.description,
      tip: spec.tip,
    }
  );
}

export function translateColliderLabel(label: string, lang: HarborLang = activeLang): string {
  if (lang === 'en') return label;
  const map = COLLIDER_LABEL_TRANSLATIONS[lang];
  if (map && map[label]) return map[label];
  if (label.endsWith(' Fender')) {
    const base = label.slice(0, -' Fender'.length);
    const fenderWord: Record<HarborLang, string> = {
      en: 'Fender',
      es: 'Defensa',
      de: 'Fender',
      fr: 'Pare-battage',
      nl: 'Stootwil',
    };
    return `${base} (${fenderWord[lang]})`;
  }
  return label;
}
