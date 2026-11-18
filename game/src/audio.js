// WebAudio synth only — no audio files. Everything guarded so headless
// screenshot mode (no user gesture) never throws.
export class AudioSys {
  constructor() {
    this.ctx = null; this.ok = false; this.muted = false;
    this.master = null; this._engOsc = null; this._engGain = null; this._engFilter = null;
    this._sirenOsc = null; this._sirenLfo = null; this._sirenGain = null;
    this._musicTimer = null; this._musicStep = 0; this.musicOn = false;
  }
  ensure() {
    if (this.ok) { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.9;
      this.master.connect(this.ctx.destination);
      this.ok = true;
    } catch (_) { this.ok = false; }
  }
  setMuted(m) { this.muted = !!m; if (this.master && this.ctx) this.master.gain.value = this.muted ? 0 : 0.9; }
  toggleMute() { this.setMuted(!this.muted); return this.muted; }
  _tone(freq, dur, type, vol, slideTo) {
    if (!this.ok || this.muted || !this.ctx) return;
    try {
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
    } catch (_) {}
  }
  _noise(dur, vol, filterFreq) {
    if (!this.ok || this.muted || !this.ctx) return;
    try {
      const t = this.ctx.currentTime, len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ctx.createBufferSource(); src.buffer = buf;
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filterFreq || 1200;
      const g = this.ctx.createGain(); g.gain.value = vol;
      src.connect(f); f.connect(g); g.connect(this.master); src.start(t);
    } catch (_) {}
  }
  engine(level01, dt) {
    if (!this.ok || !this.ctx) return;
    try {
      if (!this._engOsc) {
        this._engOsc = this.ctx.createOscillator(); this._engOsc.type = 'sawtooth';
        this._engFilter = this.ctx.createBiquadFilter(); this._engFilter.type = 'lowpass'; this._engFilter.frequency.value = 420;
        this._engGain = this.ctx.createGain(); this._engGain.gain.value = 0;
        this._engOsc.connect(this._engFilter); this._engFilter.connect(this._engGain); this._engGain.connect(this.master);
        this._engOsc.start();
      }
      const target = level01 <= 0.02 ? 0 : 0.02 + level01 * 0.05;
      const t = this.ctx.currentTime;
      this._engOsc.frequency.setTargetAtTime(48 + level01 * 110, t, 0.08);
      this._engGain.gain.setTargetAtTime(target, t, 0.1);
    } catch (_) {}
  }
  siren(on) {
    if (!this.ok || !this.ctx) return;
    try {
      if (on && !this._sirenOsc) {
        this._sirenOsc = this.ctx.createOscillator(); this._sirenOsc.type = 'triangle'; this._sirenOsc.frequency.value = 720;
        this._sirenLfo = this.ctx.createOscillator(); this._sirenLfo.frequency.value = 0.55;
        const lg = this.ctx.createGain(); lg.gain.value = 260;
        this._sirenLfo.connect(lg); lg.connect(this._sirenOsc.frequency);
        this._sirenGain = this.ctx.createGain(); this._sirenGain.gain.value = 0.028;
        this._sirenOsc.connect(this._sirenGain); this._sirenGain.connect(this.master);
        this._sirenOsc.start(); this._sirenLfo.start();
      } else if (!on && this._sirenOsc) {
        try { this._sirenOsc.stop(); this._sirenLfo.stop(); } catch (_) {}
        this._sirenOsc = null; this._sirenLfo = null; this._sirenGain = null;
      }
    } catch (_) {}
  }
  shot() { this._noise(0.12, 0.5, 1800); this._tone(160, 0.08, 'square', 0.22, 60); }
  pickup() { this._tone(880, 0.09, 'sine', 0.22); setTimeout(() => this._tone(1320, 0.12, 'sine', 0.22), 70); }
  fanfare() {
    // mission-complete arpeggio: C5 E5 G5 C6
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((n, i) => setTimeout(() => this._tone(n, 0.22, 'triangle', 0.2), i * 110));
  }
  click() { this._tone(660, 0.05, 'square', 0.12); }
  reload() { this._tone(500, 0.05, 'square', 0.14); setTimeout(() => this._tone(700, 0.05, 'square', 0.14), 90); }
  crash() { this._noise(0.3, 0.55, 420); this._tone(90, 0.25, 'sine', 0.35, 40); }
  horn() { this._tone(370, 0.25, 'sawtooth', 0.1); this._tone(466, 0.25, 'sawtooth', 0.08); }
  musicStart() {
    if (this.musicOn || !this.ok) return;
    this.musicOn = true; this._musicStep = 0;
    const notes = [55, 0, 55, 65.41, 0, 82.41, 73.42, 0, 55, 0, 55, 98, 82.41, 0, 73.42, 65.41];
    this._musicTimer = setInterval(() => {
      if (this.muted || !this.ok) { this._musicStep = (this._musicStep + 1) % notes.length; return; }
      const n = notes[this._musicStep % notes.length];
      if (n > 0) this._tone(n, 0.22, 'triangle', 0.09);
      this._musicStep++;
    }, 230);
  }
  musicStop() { if (this._musicTimer) clearInterval(this._musicTimer); this._musicTimer = null; this.musicOn = false; }
  update() {}
}
