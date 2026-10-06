// Procedural sound: every effect and the ambient music are synthesized with WebAudio, so there are no audio
// files to download. The context starts on the first tap or key press (iOS requires a user gesture).
import SOUND from '../data/sound.json';

type Wave = OscillatorType;

const PENTA = [0, 2, 4, 7, 9]; // major pentatonic steps
const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

class SoundEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private reverb!: ConvolverNode;
  private reverbSend!: GainNode;
  private noiseBuf!: AudioBuffer;
  private rainGain: GainNode | null = null;
  private musicTimer: number | null = null;
  private night = 0;        // 0 day .. 1 night, set by the day cycle
  private chordIdx = 0;
  private lastPlay: Record<string, number> = {};
  private collectStreak = 0;
  private lastCollect = 0;
  muted = false;

  constructor() {
    try { this.muted = localStorage.getItem('mute') === '1'; } catch { /* storage blocked */ }
    const unlock = () => {
      this.start();
      if (this.ctx?.state === 'running') {
        for (const ev of ['pointerdown', 'touchend', 'keydown']) window.removeEventListener(ev, unlock, true);
      }
    };
    for (const ev of ['pointerdown', 'touchend', 'keydown']) window.addEventListener(ev, unlock, true);
  }

  /** Create or resume the audio context. Must run inside a user gesture the first time. */
  start() {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      // Safari 16.4+: play even when the device is in silent mode, like a game should
      const nav = navigator as unknown as { audioSession?: { type: string } };
      if (nav.audioSession) try { nav.audioSession.type = 'playback'; } catch { /* older Safari */ }
      const ctx = new AC();
      this.ctx = ctx;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 4;
      comp.connect(ctx.destination);
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : SOUND.master;
      this.master.connect(comp);
      this.sfxBus = ctx.createGain(); this.sfxBus.gain.value = SOUND.sfx; this.sfxBus.connect(this.master);
      this.musicBus = ctx.createGain(); this.musicBus.gain.value = SOUND.music; this.musicBus.connect(this.master);
      this.reverb = ctx.createConvolver();
      this.reverb.buffer = this.impulse(2.8);
      this.reverbSend = ctx.createGain(); this.reverbSend.gain.value = 0.35;
      this.reverbSend.connect(this.reverb).connect(this.master);
      this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.startMusic();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setMuted(m: boolean) {
    this.muted = m;
    try { localStorage.setItem('mute', m ? '1' : '0'); } catch { /* storage blocked */ }
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : SOUND.master, this.ctx.currentTime, 0.05);
  }

  setNight(n: number) { this.night = n; }

  private impulse(seconds: number) {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    return buf;
  }

  private ready(name: string, minGapMs = 30) {
    if (!this.ctx || this.ctx.state !== 'running' || this.muted) return false;
    const now = performance.now();
    if (now - (this.lastPlay[name] ?? 0) < minGapMs) return false;
    this.lastPlay[name] = now;
    return true;
  }

  // --- building blocks ---

  private tone(freq: number, dur: number, opts: { type?: Wave; vol?: number; to?: number; attack?: number; delay?: number; rev?: number; pan?: number } = {}) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + (opts.delay ?? 0);
    const o = ctx.createOscillator();
    o.type = opts.type ?? 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (opts.to) o.frequency.exponentialRampToValueAtTime(Math.max(20, opts.to), t + dur);
    const g = ctx.createGain();
    const vol = opts.vol ?? 0.3;
    const atk = opts.attack ?? 0.004;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    let out: AudioNode = g;
    if (opts.pan) { const p = ctx.createStereoPanner(); p.pan.value = opts.pan; g.connect(p); out = p; }
    out.connect(this.sfxBus);
    if (opts.rev) { const s = ctx.createGain(); s.gain.value = opts.rev; out.connect(s).connect(this.reverbSend); }
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private noise(dur: number, opts: { type?: BiquadFilterType; freq?: number; to?: number; q?: number; vol?: number; attack?: number; delay?: number; rev?: number } = {}) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + (opts.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = opts.type ?? 'bandpass';
    f.frequency.setValueAtTime(opts.freq ?? 1000, t);
    if (opts.to) f.frequency.exponentialRampToValueAtTime(opts.to, t + dur);
    f.Q.value = opts.q ?? 1;
    const g = ctx.createGain();
    const vol = opts.vol ?? 0.3;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + (opts.attack ?? 0.003));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.sfxBus);
    if (opts.rev) { const s = ctx.createGain(); s.gain.value = opts.rev; g.connect(s).connect(this.reverbSend); }
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  // --- effects ---

  step(surface: 'grass' | 'stone' | 'water' | 'void' = 'grass') {
    if (!this.ready('step', 60)) return;
    if (surface === 'water') { this.noise(0.12, { freq: 1400 + Math.random() * 600, q: 2, vol: 0.12 }); return; }
    const stone = surface === 'stone';
    this.noise(stone ? 0.05 : 0.07, { type: stone ? 'highpass' : 'bandpass', freq: (stone ? 2400 : 700) + Math.random() * 300, q: 1.5, vol: stone ? 0.07 : 0.09 });
  }

  swing(heavy = false) {
    if (!this.ready('swing', 40)) return;
    this.noise(heavy ? 0.2 : 0.12, { freq: heavy ? 500 : 900, to: heavy ? 2600 : 3200, q: 2.5, vol: heavy ? 0.3 : 0.2 });
    if (heavy) this.tone(140, 0.18, { type: 'triangle', to: 70, vol: 0.2 });
  }

  hit(heavy = false) {
    if (!this.ready('hit', 25)) return;
    this.tone(heavy ? 180 : 240, 0.12, { type: 'square', to: 60, vol: heavy ? 0.22 : 0.15 });
    this.noise(0.06, { type: 'highpass', freq: 3000, vol: 0.2 });
  }

  crystal() {
    if (!this.ready('crystal', 30)) return;
    const n = 76 + PENTA[Math.floor(Math.random() * 5)] + 12 * Math.floor(Math.random() * 2);
    this.tone(midi(n), 0.9, { type: 'sine', vol: 0.12, rev: 0.6 });
    this.tone(midi(n) * 2.76, 0.4, { type: 'sine', vol: 0.04, rev: 0.6 });
    this.noise(0.03, { type: 'highpass', freq: 5000, vol: 0.12 });
  }

  collect() {
    if (!this.ready('collect', 25)) return;
    const now = performance.now();
    this.collectStreak = now - this.lastCollect < 700 ? Math.min(this.collectStreak + 1, 9) : 0;
    this.lastCollect = now;
    const s = this.collectStreak;
    const n = 79 + PENTA[s % 5] + 12 * Math.floor(s / 5);
    this.tone(midi(n), 0.25, { type: 'triangle', vol: 0.12, rev: 0.4 });
    this.tone(midi(n + 12), 0.15, { type: 'sine', vol: 0.06, delay: 0.04, rev: 0.4 });
  }

  hurt() {
    if (!this.ready('hurt', 80)) return;
    this.tone(220, 0.3, { type: 'square', to: 55, vol: 0.18 });
    this.noise(0.15, { type: 'lowpass', freq: 900, vol: 0.2 });
  }

  enemyDie() {
    if (!this.ready('enemyDie', 40)) return;
    this.noise(0.3, { type: 'lowpass', freq: 2000, to: 200, vol: 0.25 });
    this.tone(330, 0.25, { type: 'triangle', to: 80, vol: 0.12 });
  }

  dash() {
    if (!this.ready('dash', 60)) return;
    this.noise(0.18, { freq: 400, to: 4000, q: 3, vol: 0.18 });
  }

  hop() { if (this.ready('hop', 60)) this.tone(300, 0.12, { type: 'sine', to: 600, vol: 0.06 }); }
  land() { if (this.ready('land', 60)) this.tone(120, 0.15, { type: 'sine', to: 50, vol: 0.18 }); }
  windup() { if (this.ready('windup', 100)) this.tone(520, 0.18, { type: 'square', to: 760, vol: 0.04 }); }

  spit() { if (this.ready('spit', 60)) { this.tone(200, 0.15, { type: 'sine', to: 500, vol: 0.12 }); this.noise(0.08, { freq: 1200, vol: 0.08 }); } }
  reflect() { if (this.ready('reflect', 40)) this.tone(midi(88), 0.4, { type: 'triangle', vol: 0.12, rev: 0.5 }); }
  pop() { if (this.ready('pop', 40)) this.noise(0.12, { type: 'lowpass', freq: 1400, to: 300, vol: 0.18 }); }

  splash() { if (this.ready('splash', 120)) this.noise(0.3, { freq: 1600, to: 600, q: 0.8, vol: 0.16 }); }
  flutter() {
    if (!this.ready('flutter', 300)) return;
    for (let i = 0; i < 6; i++) this.noise(0.03, { freq: 2500, q: 2, vol: 0.06, delay: i * 0.045 });
  }

  pet() {
    if (!this.ready('pet', 300)) return;
    [0, 4, 7].forEach((s, i) => this.tone(midi(84 + s), 0.3, { type: 'sine', vol: 0.08, delay: i * 0.08, rev: 0.5 }));
  }

  regen() { if (this.ready('regen', 400)) this.tone(midi(91), 0.3, { type: 'sine', vol: 0.04, rev: 0.6 }); }

  build() {
    if (!this.ready('build', 200)) return;
    [0, 4, 7, 12, 16].forEach((s, i) => this.tone(midi(60 + s), 1.6, { type: 'triangle', vol: 0.08, delay: i * 0.12, rev: 0.7 }));
    this.noise(1.2, { freq: 300, to: 3000, q: 2, vol: 0.06, attack: 0.6 });
  }

  doorOpen() {
    if (!this.ready('door', 300)) return;
    this.tone(55, 1.4, { type: 'sawtooth', vol: 0.06, attack: 0.3 });
    this.noise(1.2, { type: 'lowpass', freq: 400, vol: 0.15, attack: 0.2 });
    [0, 7, 12, 19].forEach((s, i) => this.tone(midi(67 + s), 1.4, { type: 'sine', vol: 0.07, delay: 0.5 + i * 0.1, rev: 0.8 }));
  }

  upgrade() {
    if (!this.ready('upgrade', 300)) return;
    [0, 4, 7, 12, 7, 12, 16, 19].forEach((s, i) => this.tone(midi(72 + s), 0.5, { type: i % 2 ? 'sine' : 'triangle', vol: 0.08, delay: i * 0.07, rev: 0.6 }));
  }

  /** Replicator scanning the player: a soft rising and falling sweep. */
  scan() {
    if (!this.ready('scan', 500)) return;
    this.tone(220, 0.8, { type: 'sine', to: 880, vol: 0.06, attack: 0.1, rev: 0.5 });
    this.tone(880, 0.8, { type: 'sine', to: 220, vol: 0.06, attack: 0.1, delay: 0.8, rev: 0.5 });
    this.noise(1.6, { freq: 2000, q: 8, vol: 0.03, attack: 0.3 });
  }

  /** A copy is born: a warm chord that ends on a bright note. */
  birth() {
    if (!this.ready('birth', 500)) return;
    [0, 7, 12, 16, 19, 24].forEach((s, i) => this.tone(midi(62 + s), 1.8, { type: i % 2 ? 'sine' : 'triangle', vol: 0.07, delay: i * 0.09, rev: 0.8 }));
  }

  /** Not enough Embers: a low double buzz. */
  denied() {
    if (!this.ready('denied', 400)) return;
    this.tone(110, 0.12, { type: 'square', vol: 0.06 });
    this.tone(98, 0.14, { type: 'square', vol: 0.06, delay: 0.15 });
  }

  coreHum() { if (this.ready('core', 200)) this.tone(midi(64), 0.5, { type: 'sine', vol: 0.06, rev: 0.6 }); }
  thunder() { if (this.ready('thunder', 2000)) this.noise(2.5, { type: 'lowpass', freq: 300, to: 60, vol: 0.3, attack: 0.05, rev: 0.4 }); }

  // --- ambience ---

  setRain(level: number) {
    if (!this.ctx) return;
    if (!this.rainGain) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf; src.loop = true;
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2200;
      this.rainGain = this.ctx.createGain(); this.rainGain.gain.value = 0;
      src.connect(f).connect(this.rainGain).connect(this.musicBus);
      src.start();
    }
    this.rainGain.gain.setTargetAtTime(level * SOUND.rain, this.ctx.currentTime, 1.5);
  }

  /** Slow generative pad with sparse plucks. Brighter by day, sparser and lower at night. */
  private startMusic() {
    const chords = SOUND.chords;
    const tick = () => {
      if (!this.ctx) return;
      const ctx = this.ctx;
      const chord = chords[this.chordIdx++ % chords.length];
      const t = ctx.currentTime;
      const len = SOUND.chordSeconds;
      const n = this.night;
      const root = -12 * Math.round(n);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
      lp.frequency.value = 900 - 450 * n;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.06, t + len * 0.35);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len * 1.15);
      lp.connect(g).connect(this.musicBus);
      const sendGain = ctx.createGain(); sendGain.gain.value = 0.5; g.connect(sendGain).connect(this.reverbSend);
      for (const note of chord) {
        for (const det of [-6, 6]) {
          const o = ctx.createOscillator();
          o.type = 'triangle';
          o.frequency.value = midi(note + root);
          o.detune.value = det;
          o.connect(lp);
          o.start(t); o.stop(t + len * 1.2);
        }
      }
      // sparse melody plucks from the chord tones, more of them by day
      const plucks = Math.round((1 - n) * 3 + Math.random() * 2);
      for (let i = 0; i < plucks; i++) {
        const note = chord[Math.floor(Math.random() * chord.length)] + 12 + (Math.random() < 0.4 ? 12 : 0) + root;
        this.musicTone(midi(note), len * (0.15 + Math.random() * 0.7));
      }
      this.musicTimer = window.setTimeout(tick, len * 1000);
    };
    tick();
  }

  private musicTone(freq: number, delay: number) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.035, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
    o.connect(g).connect(this.musicBus);
    const s = ctx.createGain(); s.gain.value = 0.9; g.connect(s).connect(this.reverbSend);
    o.start(t); o.stop(t + 2.3);
  }
}

export const sound = new SoundEngine();
