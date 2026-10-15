// @ts-check
// Stand-in engine synth: 4 oscillators -> 2 low-pass filters -> gain, modulated every frame.
// Audio underruns show up as crackle, not frame time, so the soak has to be listened to.

export class Synth {
  constructor() {
    this.ctx = /** @type {AudioContext | null} */ (null);
    this.oscillators = /** @type {OscillatorNode[]} */ ([]);
    this.filter = /** @type {BiquadFilterNode | null} */ (null);
    this.error = '';
  }

  start() {
    try {
      const AC = window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
      const ctx = new AC();
      const lp1 = ctx.createBiquadFilter(), lp2 = ctx.createBiquadFilter(), gain = ctx.createGain();
      lp1.type = lp2.type = 'lowpass';
      lp1.frequency.value = 900; lp2.frequency.value = 1800;
      gain.gain.value = 0.06;
      lp1.connect(lp2); lp2.connect(gain); gain.connect(ctx.destination);
      for (let i = 0; i < 4; i++) {
        const osc = ctx.createOscillator();
        osc.type = i % 2 ? 'sawtooth' : 'square';
        osc.frequency.value = 60 * (1 + i * 0.5);
        osc.connect(lp1);
        osc.start();
        this.oscillators.push(osc);
      }
      this.ctx = ctx; this.filter = lp1;
    } catch (e) {
      this.error = String(e);
    }
  }

  /** @param {number} speedPercent 0..1 */
  modulate(speedPercent) {
    if (!this.ctx || !this.filter) return;
    const t = this.ctx.currentTime;
    const base = 45 + 220 * speedPercent;
    this.oscillators.forEach((o, i) => o.frequency.setTargetAtTime(base * (1 + i * 0.5), t, 0.02));
    this.filter.frequency.setTargetAtTime(400 + 2200 * speedPercent, t, 0.05);
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  get status() {
    if (!this.ctx) return this.error || 'off';
    const latency = this.ctx.baseLatency === undefined ? 'n/a' : `${Math.round(this.ctx.baseLatency * 1000)} ms`;
    return `${this.ctx.sampleRate} Hz ${this.ctx.state}, base latency ${latency}`;
  }
}
