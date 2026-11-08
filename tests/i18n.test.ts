import { afterEach, describe, expect, it } from 'vitest';
import {
  SUPPORTED_HARBOR_LANGS,
  detectHarborLang,
  getLang,
  getLocalizedStage,
  getLocalizedVessel,
  getUiStrings,
  setLang,
  translateColliderLabel,
} from '../src/i18n';
import { CAMPAIGN_STAGES } from '../src/physics/campaign';
import { VESSEL_SPECS } from '../src/physics/vessels';
import { DockingScorer } from '../src/physics/scoring';

describe('Harbor Master Multilingual i18n (?lang=es|en|de|fr|nl)', () => {
  afterEach(() => {
    setLang('en');
  });

  it('parses ?lang= query parameter across all 5 supported languages and falls back to en', () => {
    expect(detectHarborLang('?lang=es')).toBe('es');
    expect(detectHarborLang('?lang=en')).toBe('en');
    expect(detectHarborLang('?lang=de')).toBe('de');
    expect(detectHarborLang('?lang=fr')).toBe('fr');
    expect(detectHarborLang('?lang=nl')).toBe('nl');
    expect(detectHarborLang('?lang=ES-ES')).toBe('es');
    expect(detectHarborLang('?lang=unknown')).toBe('en');
    expect(detectHarborLang('')).toBe('en');
  });

  it('provides complete localized HUD strings, 12 campaign stages, and 5 vessels for es, en, de, fr, nl', () => {
    for (const lang of SUPPORTED_HARBOR_LANGS) {
      setLang(lang);
      expect(getLang()).toBe(lang);

      const ui = getUiStrings(lang);
      expect(ui.pageTitle.length).toBeGreaterThan(10);
      expect(ui.scoreLabel.length).toBeGreaterThan(2);
      expect(ui.stagesWindBtn.length).toBeGreaterThan(4);
      expect(ui.helpItems.length).toBe(7);
      expect(Object.keys(ui.berthOptions)).toHaveLength(5);

      for (const stage of CAMPAIGN_STAGES) {
        const locStage = getLocalizedStage(stage, lang);
        expect(locStage.title.length).toBeGreaterThan(4);
        expect(locStage.subtitle.length).toBeGreaterThan(6);
        expect(locStage.briefing.length).toBeGreaterThan(20);
      }

      for (const spec of Object.values(VESSEL_SPECS)) {
        const locVessel = getLocalizedVessel(spec, lang);
        expect(locVessel.name.length).toBeGreaterThan(4);
        expect(locVessel.shortName.length).toBeGreaterThan(3);
        expect(locVessel.category.length).toBeGreaterThan(5);
        expect(locVessel.description.length).toBeGreaterThan(20);
        expect(locVessel.tip.length).toBeGreaterThan(15);
      }
    }

    // Verify Spanish translations differ from English
    expect(getUiStrings('es').scoreLabel).toBe('Puntos');
    expect(getUiStrings('de').scoreLabel).toBe('Punkte');
    expect(getUiStrings('fr').fendersLabel).toContain('Pare-battages');
    expect(getUiStrings('nl').fendersLabel).toContain('Stootwillen');
  });

  it('localizes scoring incident toasts and completion rank titles in the active language', () => {
    setLang('es');
    const scorer = new DockingScorer();
    const kiss = scorer.evaluateContact(1.5, {
      playerKind: 'boat-fender',
      otherKind: 'dock',
      otherLabel: 'East Seawall Quay',
      impactSpeedKnots: 0.25,
      worldX: 22,
      worldY: 0,
      dtSec: 1 / 60,
    });
    expect(kiss?.label).toContain('APOYO SUAVE DE DEFENSA');
    expect(kiss?.label).toContain('Muelle Este');

    const report = scorer.computeCompletionReport({
      distanceErrorM: 0.1,
      headingErrorDeg: 1,
      trueWindKnots: 10,
      elapsedSec: 25,
    });
    expect(report.rank).toBe('S');
    expect(report.rankTitle).toBe('Práctico Mayor de Puerto');
    expect(translateColliderLabel('M/Y Solaris (8m) Fender', 'es')).toBe(
      'M/Y Solaris (8m) (Defensa)'
    );
  });
});
