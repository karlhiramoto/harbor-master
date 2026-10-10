/**
 * Zero-asset Web Audio API synthesizer generating realistic marine acoustics:
 * - Outboard hum (7m/8m) vs. deep 12m auxiliary diesel chug
 * - Mechanical gearbox detent clunk (Ahead / Neutral / Astern)
 * - Proportional electric bow thruster whine + frothy cavitation bubbles
 * - Rubber side-fender kiss squeak vs. bare-fiberglass gelcoat crunch + angry yacht airhorn
 * - Spring-line cleat cinch & brass ship's bell on berth completion
 */
export class MarineSoundEngine {
  private ctx: AudioContext | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private thrusterOsc: OscillatorNode | null = null;
  private thrusterGain: GainNode | null = null;
  private muted = false;
  private prevGearSign = 0;

  public unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      return;
    }
    const AudioCtx = window.AudioContext;
    if (!AudioCtx) return;

    this.ctx = new AudioCtx();
    // Engine base tone
    this.engineOsc = this.ctx.createOscillator();
    this.engineGain = this.ctx.createGain();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 34;
    this.engineGain.gain.value = 0;

    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 145;

    this.engineOsc.connect(lp);
    lp.connect(this.engineGain);
    this.engineGain.connect(this.ctx.destination);
    this.engineOsc.start();

    // Bow thruster high-frequency whine
    this.thrusterOsc = this.ctx.createOscillator();
    this.thrusterGain = this.ctx.createGain();
    this.thrusterOsc.type = 'triangle';
    this.thrusterOsc.frequency.value = 185;
    this.thrusterGain.gain.value = 0;
    this.thrusterOsc.connect(this.thrusterGain);
    this.thrusterGain.connect(this.ctx.destination);
    this.thrusterOsc.start();
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted && this.ctx) {
      const t = this.ctx.currentTime;
      this.engineGain?.gain.setTargetAtTime(0, t, 0.05);
      this.thrusterGain?.gain.setTargetAtTime(0, t, 0.05);
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public updateContinuous(params: {
    isDiesel: boolean;
    throttle: number;
    bowThruster: number;
  }): void {
    if (this.muted || !this.ctx || !this.engineOsc || !this.engineGain || !this.thrusterOsc || !this.thrusterGain) {
      return;
    }
    const now = this.ctx.currentTime;
    const absT = Math.abs(params.throttle);
    const gearSign = absT < 0.04 ? 0 : Math.sign(params.throttle);
    if (gearSign !== this.prevGearSign) {
      this.prevGearSign = gearSign;
      this.playGearClunk();
    }

    const baseHz = params.isDiesel ? 25 + absT * 36 : 42 + absT * 68;
    const gainLevel = 0.014 + absT * 0.045;
    this.engineOsc.frequency.setTargetAtTime(baseHz, now, 0.08);
    this.engineGain.gain.setTargetAtTime(gainLevel, now, 0.08);

    const absBT = Math.abs(params.bowThruster);
    this.thrusterOsc.frequency.setTargetAtTime(165 + absBT * 95, now, 0.04);
    this.thrusterGain.gain.setTargetAtTime(absBT * 0.038, now, 0.04);
  }

  public playGearClunk(): void {
    if (this.muted || !this.ctx) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const t = this.ctx.currentTime;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(115, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.075);
    g.gain.setValueAtTime(0.09, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    osc.connect(g);
    g.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.09);
  }

  public playFenderKiss(hard: boolean): void {
    if (this.muted || !this.ctx) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const t = this.ctx.currentTime;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(hard ? 140 : 280, t);
    osc.frequency.exponentialRampToValueAtTime(hard ? 58 : 390, t + 0.14);
    g.gain.setValueAtTime(hard ? 0.14 : 0.07, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.connect(g);
    g.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.16);
  }

  public playBareHullScrape(neighborYacht: boolean): void {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime;

    // 1. Fiberglass crunch noise burst
    const bufLen = Math.floor(this.ctx.sampleRate * 0.24);
    const buf = this.ctx.createBuffer(1, bufLen, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufLen * 0.45));
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 920;
    const ng = this.ctx.createGain();
    ng.gain.value = 0.18;
    noise.connect(bp);
    bp.connect(ng);
    ng.connect(this.ctx.destination);
    noise.start(t);

    // 2. Angry moored neighbor yacht dual-tone airhorn blast!
    if (neighborYacht) {
      for (const freq of [196, 247]) {
        const horn = this.ctx.createOscillator();
        const hg = this.ctx.createGain();
        horn.type = 'sawtooth';
        horn.frequency.value = freq;
        hg.gain.setValueAtTime(0.055, t + 0.08);
        hg.gain.exponentialRampToValueAtTime(0.001, t + 0.48);
        horn.connect(hg);
        hg.connect(this.ctx.destination);
        horn.start(t + 0.08);
        horn.stop(t + 0.5);
      }
    }
  }

  public playCleatLatch(): void {
    if (this.muted || !this.ctx) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const t = this.ctx.currentTime;
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(420, t);
    osc.frequency.exponentialRampToValueAtTime(660, t + 0.09);
    g.gain.setValueAtTime(0.08, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    osc.connect(g);
    g.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.11);
  }

  public playShipsBell(): void {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime;
    for (const [offset, freq] of [
      [0, 1046.5],
      [0.22, 1318.5],
    ]) {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0.14, t + offset);
      g.gain.exponentialRampToValueAtTime(0.001, t + offset + 0.95);
      osc.connect(g);
      g.connect(this.ctx.destination);
      osc.start(t + offset);
      osc.stop(t + offset + 1.0);
    }
  }
}
