export type ColliderKind =
  | 'bare-hull'
  | 'boat-fender'
  | 'moored-hull'
  | 'moored-fender'
  | 'dock'
  | 'piling'
  | 'hazard';

export interface ScoreIncident {
  id: number;
  timeSec: number;
  kind:
    | 'fender-butter-kiss'
    | 'fender-hard-bump'
    | 'bare-hull-moored-scrape'
    | 'bare-hull-dock-scrape'
    | 'hazard-bump';
  label: string;
  deltaPoints: number;
  repairCostUsd: number;
  worldX: number;
  worldY: number;
  impactKnots: number;
}

export interface ContactSample {
  playerKind: 'bare-hull' | 'boat-fender';
  otherKind: 'moored-hull' | 'moored-fender' | 'dock' | 'piling' | 'hazard';
  otherLabel: string;
  impactSpeedKnots: number;
  worldX: number;
  worldY: number;
  dtSec: number;
}

export interface BerthCompletionReport {
  completed: boolean;
  rank: 'S' | 'A' | 'B' | 'C' | 'D';
  rankTitle: string;
  baseScore: number;
  alignmentBonus: number;
  cleanHullBonus: number;
  butterKissBonus: number;
  totalPenalties: number;
  windMultiplier: number;
  finalScore: number;
  totalRepairCostUsd: number;
  bareHullScrapesCount: number;
  fenderKissesCount: number;
  elapsedSec: number;
  incidents: ScoreIncident[];
}

export const MAX_DAMAGE_GAME_OVER_USD = 10_000;

export class DockingScorer {
  private baseScore = 1000;
  private penalties = 0;
  private bonuses = 0;
  private repairCostUsd = 0;
  private bareHullScrapesCount = 0;
  private fenderKissesCount = 0;
  private hasHadButterKiss = false;
  private nextIncidentId = 1;
  private incidents: ScoreIncident[] = [];
  private lastImpactTimestampByKey = new Map<string, number>();

  public reset(): void {
    this.penalties = 0;
    this.bonuses = 0;
    this.repairCostUsd = 0;
    this.bareHullScrapesCount = 0;
    this.fenderKissesCount = 0;
    this.hasHadButterKiss = false;
    this.nextIncidentId = 1;
    this.incidents = [];
    this.lastImpactTimestampByKey.clear();
  }

  public getLiveScore(): number {
    return Math.max(0, Math.round(this.baseScore + this.bonuses - this.penalties));
  }

  public getRepairCostUsd(): number {
    return Math.round(this.repairCostUsd);
  }

  public isGameOverDamage(): boolean {
    return this.getRepairCostUsd() > MAX_DAMAGE_GAME_OVER_USD;
  }

  public getBareHullScrapesCount(): number {
    return this.bareHullScrapesCount;
  }

  public getIncidents(): ReadonlyArray<ScoreIncident> {
    return this.incidents;
  }

  /**
   * Evaluates a single physical contact between player boat collider (`bare-hull` or `boat-fender`)
   * and marina obstacle (`moored-hull`, `moored-fender`, `dock`, `piling`, `hazard`).
   * Returns a newly triggered discrete incident for visual toast/sound, or null if continuous/debounced.
   */
  public evaluateContact(nowSec: number, sample: ContactSample): ScoreIncident | null {
    const { playerKind, otherKind, otherLabel, impactSpeedKnots, worldX, worldY, dtSec } = sample;
    const isNeighborBoat = otherKind === 'moored-hull' || otherKind === 'moored-fender';

    // Case 1: BARE HULL touching MOORED NEIGHBOR BOAT (missed our 2 side fenders!)
    if (playerKind === 'bare-hull' && isNeighborBoat) {
      // Continuous grinding fiberglass penalty every step while hulls grind
      const grindPenalty = 60 * dtSec * (1 + Math.min(2, impactSpeedKnots));
      const grindUsd = 850 * dtSec * (1 + Math.min(2, impactSpeedKnots));
      this.penalties += grindPenalty;
      this.repairCostUsd += grindUsd;

      const key = `bare-neighbor:${otherLabel}`;
      const prevTime = this.lastImpactTimestampByKey.get(key) ?? -999;
      if (nowSec - prevTime >= 1.15) {
        this.lastImpactTimestampByKey.set(key, nowSec);
        this.bareHullScrapesCount += 1;
        const burstPenalty = Math.round(150 + impactSpeedKnots * 95);
        const burstUsd = Math.round(2500 + impactSpeedKnots * 1800);
        this.penalties += burstPenalty;
        this.repairCostUsd += burstUsd;

        const incident: ScoreIncident = {
          id: this.nextIncidentId++,
          timeSec: nowSec,
          kind: 'bare-hull-moored-scrape',
          label: `GELCOAT SCRAPE vs ${otherLabel} (Missed Fenders!)`,
          deltaPoints: -burstPenalty,
          repairCostUsd: burstUsd,
          worldX,
          worldY,
          impactKnots: impactSpeedKnots,
        };
        this.incidents.unshift(incident);
        return incident;
      }
      return null;
    }

    // Case 2: BARE HULL touching DOCK / PILING / HAZARD (missed side fenders!)
    if (playerKind === 'bare-hull') {
      const grindPenalty = (otherKind === 'hazard' ? 90 : 35) * dtSec;
      this.penalties += grindPenalty;
      this.repairCostUsd += (otherKind === 'hazard' ? 1200 : 350) * dtSec;

      const key = `bare-dock:${otherKind}:${otherLabel}`;
      const prevTime = this.lastImpactTimestampByKey.get(key) ?? -999;
      if (nowSec - prevTime >= 1.2) {
        this.lastImpactTimestampByKey.set(key, nowSec);
        this.bareHullScrapesCount += 1;
        const burstPenalty =
          otherKind === 'hazard'
            ? Math.round(220 + impactSpeedKnots * 110)
            : Math.round(75 + impactSpeedKnots * 65);
        const burstUsd =
          otherKind === 'hazard'
            ? Math.round(3200 + impactSpeedKnots * 1500)
            : Math.round(800 + impactSpeedKnots * 650);
        this.penalties += burstPenalty;
        this.repairCostUsd += burstUsd;

        const incident: ScoreIncident = {
          id: this.nextIncidentId++,
          timeSec: nowSec,
          kind: otherKind === 'hazard' ? 'hazard-bump' : 'bare-hull-dock-scrape',
          label:
            otherKind === 'hazard'
              ? `FAIRWAY HAZARD IMPACT (${otherLabel})`
              : `Bare Hull Scrape on ${otherLabel} (Align Fenders!)`,
          deltaPoints: -burstPenalty,
          repairCostUsd: burstUsd,
          worldX,
          worldY,
          impactKnots: impactSpeedKnots,
        };
        this.incidents.unshift(incident);
        return incident;
      }
      return null;
    }

    // Case 3: PLAYER SIDE FENDER (`boat-fender`) contact!
    // Gentle fender kiss (<= 0.90 kn): 0 penalty, $0 damage! First ultra-soft kiss (< 0.35 kn) earns +50 Butter Kiss bonus!
    const key = `fender:${otherLabel}`;
    const prevTime = this.lastImpactTimestampByKey.get(key) ?? -999;
    if (nowSec - prevTime < 1.35) {
      return null;
    }
    this.lastImpactTimestampByKey.set(key, nowSec);

    if (impactSpeedKnots <= 0.9) {
      this.fenderKissesCount += 1;
      let bonus = 0;
      if (!this.hasHadButterKiss && impactSpeedKnots <= 0.4) {
        this.hasHadButterKiss = true;
        bonus = 50;
        this.bonuses += bonus;
      }
      const incident: ScoreIncident = {
        id: this.nextIncidentId++,
        timeSec: nowSec,
        kind: 'fender-butter-kiss',
        label:
          bonus > 0
            ? `BUTTER FENDER KISS on ${otherLabel} (+${bonus} pts)`
            : `Clean Fender Cushion on ${otherLabel} ($0 Damage)`,
        deltaPoints: bonus,
        repairCostUsd: 0,
        worldX,
        worldY,
        impactKnots: impactSpeedKnots,
      };
      this.incidents.unshift(incident);
      return incident;
    }

    // Hard Fender Impact (> 0.90 kn): rubber fender compressed past limit!
    const excessKn = impactSpeedKnots - 0.9;
    const hardPenalty = Math.min(140, Math.round(25 + excessKn * 55));
    const hardUsd = Math.round(150 + excessKn * 380);
    this.penalties += hardPenalty;
    this.repairCostUsd += hardUsd;

    const incident: ScoreIncident = {
      id: this.nextIncidentId++,
      timeSec: nowSec,
      kind: 'fender-hard-bump',
      label: `Hard Fender Bump (${impactSpeedKnots.toFixed(1)} kn vs ${otherLabel})`,
      deltaPoints: -hardPenalty,
      repairCostUsd: hardUsd,
      worldX,
      worldY,
      impactKnots: impactSpeedKnots,
    };
    this.incidents.unshift(incident);
    return incident;
  }

  public computeCompletionReport(params: {
    distanceErrorM: number;
    headingErrorDeg: number;
    trueWindKnots: number;
    elapsedSec: number;
  }): BerthCompletionReport {
    const posScore = Math.max(0, 1 - params.distanceErrorM / 2.2);
    const angleScore = Math.max(0, 1 - params.headingErrorDeg / 18);
    const alignmentBonus = Math.round(250 * (0.6 * posScore + 0.4 * angleScore));
    const cleanHullBonus = this.bareHullScrapesCount === 0 ? 200 : 0;
    const butterKissBonus = this.hasHadButterKiss ? 150 : this.fenderKissesCount > 0 ? 75 : 0;
    const windMultiplier = Number((1 + Math.min(25, Math.max(0, params.trueWindKnots)) * 0.024).toFixed(2));

    const rawNet = Math.max(
      0,
      this.baseScore + alignmentBonus + cleanHullBonus + butterKissBonus - this.penalties
    );
    const finalScore = Math.round(rawNet * windMultiplier);

    let rank: BerthCompletionReport['rank'] = 'D';
    let rankTitle = 'Gelcoat Liability';
    if (finalScore >= 1350 && this.bareHullScrapesCount === 0) {
      rank = 'S';
      rankTitle = 'Master Harbor Pilot';
    } else if (finalScore >= 1050 && this.bareHullScrapesCount === 0) {
      rank = 'A';
      rankTitle = 'Seasoned Skipper';
    } else if (finalScore >= 800) {
      rank = 'B';
      rankTitle = 'Competent Helmsman';
    } else if (finalScore >= 500) {
      rank = 'C';
      rankTitle = 'Weekend Deckhand';
    }

    return {
      completed: true,
      rank,
      rankTitle,
      baseScore: this.baseScore,
      alignmentBonus,
      cleanHullBonus,
      butterKissBonus,
      totalPenalties: Math.round(this.penalties),
      windMultiplier,
      finalScore,
      totalRepairCostUsd: Math.round(this.repairCostUsd),
      bareHullScrapesCount: this.bareHullScrapesCount,
      fenderKissesCount: this.fenderKissesCount,
      elapsedSec: params.elapsedSec,
      incidents: [...this.incidents].slice(0, 8),
    };
  }
}
