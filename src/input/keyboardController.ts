import { ControlInputs, clamp } from '../physics/hydrodynamics';

export type CanonicalControlKey =
  | 'portThrottleUp'
  | 'portThrottleDown'
  | 'stbdThrottleUp'
  | 'stbdThrottleDown'
  | 'toggleThrottleMode'
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
  portUp: boolean;
  portDown: boolean;
  stbdUp: boolean;
  stbdDown: boolean;
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

  if (code === 'KeyW' || key === 'w') {
    return 'portThrottleUp';
  }
  if (code === 'KeyS' || key === 's') {
    return 'portThrottleDown';
  }
  if (code === 'ArrowUp' || key === 'arrowup' || code === 'KeyI' || key === 'i') {
    return 'stbdThrottleUp';
  }
  if (code === 'ArrowDown' || key === 'arrowdown' || code === 'KeyK' || key === 'k') {
    return 'stbdThrottleDown';
  }
  if (code === 'KeyU' || key === 'u') {
    return 'toggleThrottleMode';
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
  public onToggleThrottleMode?: () => void;

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
    const isSeparate = next.throttleMode === 'separate';

    const applyUnifiedStep = (delta: number): void => {
      const stepped = stepThrottleWithNeutralDetent(next.throttle, delta);
      next.throttle = stepped;
      if (next.throttlePort !== undefined || next.throttleMode !== undefined) {
        next.throttlePort = stepped;
      }
      if (next.throttleStbd !== undefined || next.throttleMode !== undefined) {
        next.throttleStbd = stepped;
      }
    };

    const applyPortStep = (delta: number): void => {
      const curP = next.throttlePort ?? next.throttle;
      const curS = next.throttleStbd ?? next.throttle;
      const steppedP = stepThrottleWithNeutralDetent(curP, delta);
      next.throttlePort = steppedP;
      next.throttleStbd = curS;
      next.throttle = Math.round(((steppedP + curS) * 0.5) * 100) / 100;
    };

    const applyStbdStep = (delta: number): void => {
      const curP = next.throttlePort ?? next.throttle;
      const curS = next.throttleStbd ?? next.throttle;
      const steppedS = stepThrottleWithNeutralDetent(curS, delta);
      next.throttlePort = curP;
      next.throttleStbd = steppedS;
      next.throttle = Math.round(((curP + steppedS) * 0.5) * 100) / 100;
    };

    switch (action) {
      case 'portThrottleUp':
        if (isSeparate) applyPortStep(THROTTLE_TAP_STEP);
        else applyUnifiedStep(THROTTLE_TAP_STEP);
        break;
      case 'portThrottleDown':
        if (isSeparate) applyPortStep(-THROTTLE_TAP_STEP);
        else applyUnifiedStep(-THROTTLE_TAP_STEP);
        break;
      case 'stbdThrottleUp':
        if (isSeparate) applyStbdStep(THROTTLE_TAP_STEP);
        else applyUnifiedStep(THROTTLE_TAP_STEP);
        break;
      case 'stbdThrottleDown':
        if (isSeparate) applyStbdStep(-THROTTLE_TAP_STEP);
        else applyUnifiedStep(-THROTTLE_TAP_STEP);
        break;
      case 'toggleThrottleMode': {
        const nextMode = next.throttleMode === 'separate' ? 'unified' : 'separate';
        next.throttleMode = nextMode;
        if (nextMode === 'unified') {
          next.throttlePort = next.throttle;
          next.throttleStbd = next.throttle;
        } else {
          next.throttlePort = next.throttlePort ?? next.throttle;
          next.throttleStbd = next.throttleStbd ?? next.throttle;
        }
        this.onToggleThrottleMode?.();
        break;
      }
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
        if (next.throttlePort !== undefined || next.throttleMode !== undefined) {
          next.throttlePort = 0;
        }
        if (next.throttleStbd !== undefined || next.throttleMode !== undefined) {
          next.throttleStbd = 0;
        }
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
    const portUp = this.heldSinceSec.has('portThrottleUp');
    const portDown = this.heldSinceSec.has('portThrottleDown');
    const stbdUp = this.heldSinceSec.has('stbdThrottleUp');
    const stbdDown = this.heldSinceSec.has('stbdThrottleDown');
    return {
      up: portUp || stbdUp,
      down: portDown || stbdDown,
      left: this.heldSinceSec.has('helmLeft'),
      right: this.heldSinceSec.has('helmRight'),
      portUp,
      portDown,
      stbdUp,
      stbdDown,
    };
  }

  /**
   * Advances smooth continuous hold ramping after HOLD_RAMP_DELAY_SEC so both
   * crisp discrete arrow key taps AND holding arrow keys feel responsive.
   */
  public step(dtSec: number, current: ControlInputs, hasPointerThrusterHold = false): ControlInputs {
    this.nowSec += dtSec;
    const next = { ...current };
    const isSeparate = next.throttleMode === 'separate';

    const rampValue = (prev: number, dir: 1 | -1): number => {
      const cand = clamp(prev + dir * dtSec * THROTTLE_RAMP_PER_SEC, -1, 1);
      if (dir > 0 && prev < -0.02 && cand > 0) return 0;
      if (dir < 0 && prev > 0.02 && cand < 0) return 0;
      return cand;
    };

    const portUpHeld = this.heldSinceSec.get('portThrottleUp');
    const portDownHeld = this.heldSinceSec.get('portThrottleDown');
    const stbdUpHeld = this.heldSinceSec.get('stbdThrottleUp');
    const stbdDownHeld = this.heldSinceSec.get('stbdThrottleDown');

    if (isSeparate) {
      let p = next.throttlePort ?? next.throttle;
      let s = next.throttleStbd ?? next.throttle;
      if (portUpHeld !== undefined && this.nowSec - portUpHeld >= HOLD_RAMP_DELAY_SEC) {
        p = rampValue(p, 1);
      } else if (portDownHeld !== undefined && this.nowSec - portDownHeld >= HOLD_RAMP_DELAY_SEC) {
        p = rampValue(p, -1);
      }
      if (stbdUpHeld !== undefined && this.nowSec - stbdUpHeld >= HOLD_RAMP_DELAY_SEC) {
        s = rampValue(s, 1);
      } else if (stbdDownHeld !== undefined && this.nowSec - stbdDownHeld >= HOLD_RAMP_DELAY_SEC) {
        s = rampValue(s, -1);
      }
      next.throttlePort = p;
      next.throttleStbd = s;
      next.throttle = Math.round(((p + s) * 0.5) * 100) / 100;
    } else {
      const upHeld =
        portUpHeld !== undefined && stbdUpHeld !== undefined
          ? Math.min(portUpHeld, stbdUpHeld)
          : (portUpHeld ?? stbdUpHeld);
      const downHeld =
        portDownHeld !== undefined && stbdDownHeld !== undefined
          ? Math.min(portDownHeld, stbdDownHeld)
          : (portDownHeld ?? stbdDownHeld);

      if (upHeld !== undefined && this.nowSec - upHeld >= HOLD_RAMP_DELAY_SEC) {
        next.throttle = rampValue(next.throttle, 1);
      } else if (downHeld !== undefined && this.nowSec - downHeld >= HOLD_RAMP_DELAY_SEC) {
        next.throttle = rampValue(next.throttle, -1);
      }
      if (next.throttlePort !== undefined || next.throttleMode !== undefined) {
        next.throttlePort = next.throttle;
      }
      if (next.throttleStbd !== undefined || next.throttleMode !== undefined) {
        next.throttleStbd = next.throttle;
      }
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
