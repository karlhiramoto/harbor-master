import { ControlInputs, clamp } from '../physics/hydrodynamics';

export type CanonicalControlKey =
  | 'throttleUp'
  | 'throttleDown'
  | 'helmLeft'
  | 'helmRight'
  | 'thrusterPort'
  | 'thrusterStbd'
  | 'neutralStop'
  | 'centerHelm'
  | 'springLine'
  | 'resetStage'
  | 'toggleXRay'
  | 'openHelp';

export interface ActiveArrowHighlights {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

const HOLD_RAMP_DELAY_SEC = 0.14;
const THROTTLE_TAP_STEP = 0.1;
const HELM_TAP_STEP = 0.14;
const THROTTLE_RAMP_PER_SEC = 0.72;
const HELM_RAMP_PER_SEC = 1.35;

/**
 * Maps browser KeyboardEvent (`code` and `key` for full Cloudtop / remote-desktop / international layout compatibility)
 * into canonical boat helm & telegraph actions.
 */
export function resolveCanonicalKey(ev: { code?: string; key?: string }): CanonicalControlKey | null {
  const code = ev.code ?? '';
  const key = (ev.key ?? '').toLowerCase();

  if (code === 'ArrowUp' || key === 'arrowup' || code === 'KeyW' || key === 'w') {
    return 'throttleUp';
  }
  if (code === 'ArrowDown' || key === 'arrowdown' || code === 'KeyS' || key === 's') {
    return 'throttleDown';
  }
  if (code === 'ArrowLeft' || key === 'arrowleft' || code === 'KeyA' || key === 'a') {
    return 'helmLeft';
  }
  if (code === 'ArrowRight' || key === 'arrowright' || code === 'KeyD' || key === 'd') {
    return 'helmRight';
  }
  if (code === 'KeyQ' || key === 'q') {
    return 'thrusterPort';
  }
  if (code === 'KeyE' || key === 'e') {
    return 'thrusterStbd';
  }
  if (code === 'Space' || key === ' ') {
    return 'neutralStop';
  }
  if (code === 'KeyC' || key === 'c') {
    return 'centerHelm';
  }
  if (code === 'KeyM' || key === 'm') {
    return 'springLine';
  }
  if (code === 'KeyR' || key === 'r') {
    return 'resetStage';
  }
  if (code === 'KeyX' || key === 'x') {
    return 'toggleXRay';
  }
  if (code === 'KeyH' || key === 'h' || key === '?') {
    return 'openHelp';
  }
  return null;
}

/**
 * Steps throttle by a discrete increment while pausing cleanly on Neutral (0)
 * when crossing from Forward (> 0) into Reverse (< 0) or vice-versa.
 */
export function stepThrottleWithNeutralDetent(current: number, delta: number): number {
  const next = clamp(current + delta, -1, 1);
  if ((current > 0.01 && next < -0.01) || (current < -0.01 && next > 0.01)) {
    return 0;
  }
  if (Math.abs(next) < 0.03) {
    return 0;
  }
  return Math.round(next * 100) / 100;
}

export class KeyboardController {
  private readonly heldSinceSec = new Map<CanonicalControlKey, number>();
  private nowSec = 0;

  public onSpringLine?: () => void;
  public onResetStage?: () => void;
  public onToggleXRay?: () => void;
  public onOpenHelp?: () => void;

  /**
   * Processes a keydown event and returns updated ControlInputs when an immediate
   * tap step or instant command applies. Returns `true` if event was handled.
   */
  public handleKeyDown(
    ev: { code?: string; key?: string; repeat?: boolean; preventDefault?: () => void },
    current: ControlInputs
  ): { handled: boolean; nextControls: ControlInputs } {
    const action = resolveCanonicalKey(ev);
    if (!action) {
      return { handled: false, nextControls: { ...current } };
    }

    ev.preventDefault?.();

    // Ignore OS key-repeat events because we compute smooth continuous hold ramps directly in step()
    if (ev.repeat && this.heldSinceSec.has(action)) {
      return { handled: true, nextControls: { ...current } };
    }

    if (!this.heldSinceSec.has(action)) {
      this.heldSinceSec.set(action, this.nowSec);
    }

    const next = { ...current };

    switch (action) {
      case 'throttleUp':
        next.throttle = stepThrottleWithNeutralDetent(next.throttle, THROTTLE_TAP_STEP);
        break;
      case 'throttleDown':
        next.throttle = stepThrottleWithNeutralDetent(next.throttle, -THROTTLE_TAP_STEP);
        break;
      case 'helmLeft': {
        const stepped = clamp(next.helm - HELM_TAP_STEP, -1, 1);
        next.helm = Math.abs(stepped) < 0.04 ? 0 : stepped;
        break;
      }
      case 'helmRight': {
        const stepped = clamp(next.helm + HELM_TAP_STEP, -1, 1);
        next.helm = Math.abs(stepped) < 0.04 ? 0 : stepped;
        break;
      }
      case 'thrusterPort':
        next.bowThruster = -1;
        break;
      case 'thrusterStbd':
        next.bowThruster = 1;
        break;
      case 'neutralStop':
        next.throttle = 0;
        break;
      case 'centerHelm':
        next.helm = 0;
        break;
      case 'springLine':
        this.onSpringLine?.();
        break;
      case 'resetStage':
        this.onResetStage?.();
        break;
      case 'toggleXRay':
        this.onToggleXRay?.();
        break;
      case 'openHelp':
        this.onOpenHelp?.();
        break;
    }

    return { handled: true, nextControls: next };
  }

  public handleKeyUp(ev: { code?: string; key?: string }): void {
    const action = resolveCanonicalKey(ev);
    if (action) {
      this.heldSinceSec.delete(action);
    }
  }

  public clearAllHeld(): void {
    this.heldSinceSec.clear();
  }

  public getActiveHighlights(): ActiveArrowHighlights {
    return {
      up: this.heldSinceSec.has('throttleUp'),
      down: this.heldSinceSec.has('throttleDown'),
      left: this.heldSinceSec.has('helmLeft'),
      right: this.heldSinceSec.has('helmRight'),
    };
  }

  /**
   * Advances smooth continuous hold ramping after HOLD_RAMP_DELAY_SEC so both
   * crisp discrete arrow key taps AND holding arrow keys feel responsive.
   */
  public step(dtSec: number, current: ControlInputs, hasPointerThrusterHold = false): ControlInputs {
    this.nowSec += dtSec;
    const next = { ...current };

    const upHeld = this.heldSinceSec.get('throttleUp');
    const downHeld = this.heldSinceSec.get('throttleDown');
    if (upHeld !== undefined && this.nowSec - upHeld >= HOLD_RAMP_DELAY_SEC) {
      const prev = next.throttle;
      const cand = clamp(prev + dtSec * THROTTLE_RAMP_PER_SEC, -1, 1);
      // Pause briefly on Neutral when crossing from Astern to Ahead unless already at 0
      next.throttle = prev < -0.02 && cand > 0 ? 0 : cand;
    } else if (downHeld !== undefined && this.nowSec - downHeld >= HOLD_RAMP_DELAY_SEC) {
      const prev = next.throttle;
      const cand = clamp(prev - dtSec * THROTTLE_RAMP_PER_SEC, -1, 1);
      next.throttle = prev > 0.02 && cand < 0 ? 0 : cand;
    }

    const leftHeld = this.heldSinceSec.get('helmLeft');
    const rightHeld = this.heldSinceSec.get('helmRight');
    if (rightHeld !== undefined && this.nowSec - rightHeld >= HOLD_RAMP_DELAY_SEC) {
      next.helm = clamp(next.helm + dtSec * HELM_RAMP_PER_SEC, -1, 1);
    } else if (leftHeld !== undefined && this.nowSec - leftHeld >= HOLD_RAMP_DELAY_SEC) {
      next.helm = clamp(next.helm - dtSec * HELM_RAMP_PER_SEC, -1, 1);
    }

    if (this.heldSinceSec.has('thrusterStbd')) {
      next.bowThruster = 1;
    } else if (this.heldSinceSec.has('thrusterPort')) {
      next.bowThruster = -1;
    } else if (!hasPointerThrusterHold) {
      next.bowThruster = 0;
    }

    return next;
  }
}
