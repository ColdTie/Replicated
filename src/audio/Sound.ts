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

  // --- the copies' voices ---

  private lastSong = { at: 0, root: 0 };

  /** Who a copy sounds like, all from its seed: register, timbre, a pentatonic mode, and whether an octave shimmer rides on top. */
  private voice(seed: number) {
    let s = (seed >>> 0) || 1;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const modes = [[0, 2, 4, 7, 9], [0, 3, 5, 7, 10], [0, 2, 5, 7, 9], [0, 4, 7, 11, 14], [0, 2, 3, 7, 8]];
    const root = 64 + Math.floor(rnd() * 14);
    const wave = (['sine', 'triangle', 'sine', 'square'] as Wave[])[Math.floor(rnd() * 4)];
    const mode = modes[Math.floor(rnd() * modes.length)].concat([12, 14]);
    return { root, wave, mode, shimmer: rnd() < 0.5 };
  }

  /**
   * A copy's song. The voice comes from its seed; the words pick the notes (each word hashes to a degree of the
   * voice's mode, longer words hold longer), so the same sentence always sings the same tune. A sentence ends on
   * a chord. A copy that answers within a few seconds sings a harmony, a third or a fifth above the last voice.
   * Returns the length of the phrase in seconds.
   */
  sing(seed: number, text = '', opts: { pan?: number; harmony?: boolean; delay?: number; vol?: number; melodySeed?: number; rootOffset?: number } = {}) {
    if (!this.ctx || this.ctx.state !== 'running' || this.muted) return 0;
    const v = this.voice(seed);
    const words = (text || 'la la la.').split(/\s+/).filter(Boolean).slice(0, 14);
    const now = performance.now();
    const answering = opts.harmony ?? (now - this.lastSong.at < 6000);
    let root = v.root + (opts.rootOffset ?? 0);
    if (answering) root = this.lastSong.root + (seed % 2 ? 7 : 4);
    if (!answering) this.lastSong = { at: now, root };
    else this.lastSong.at = now;
    let t = opts.delay ?? 0;
    const vol = (opts.vol ?? 0.07) * (v.wave === 'square' ? 0.45 : 1);
    let h = (opts.melodySeed ?? seed) >>> 0;
    words.forEach((w) => {
      for (const c of w) h = (h * 31 + c.charCodeAt(0)) >>> 0;
      const deg = v.mode[h % v.mode.length];
      const dur = 0.16 + Math.min(7, w.length) * 0.045;
      this.tone(midi(root + deg), dur + 0.2, { type: v.wave, vol, delay: t, attack: 0.02, rev: 0.55, pan: opts.pan });
      if (v.shimmer) this.tone(midi(root + deg + 12), dur, { type: 'sine', vol: vol * 0.22, delay: t + 0.02, rev: 0.7, pan: opts.pan });
      t += dur;
      if (/[.!?]$/.test(w)) {
        const low = deg > 7 ? deg - 12 : deg;
        [0, 4, 7].forEach((s, k) => this.tone(midi(root + low + s), 1.1, { type: k ? 'sine' : v.wave, vol: vol * 0.6, delay: t + k * 0.04, attack: 0.06, rev: 0.85, pan: opts.pan }));
        t += 0.55;
      } else if (/,$/.test(w)) t += 0.18;
    });
    return t;
  }

  /**
   * Several copies sing one phrase together as a round: the same tune in every voice, each entering a beat
   * later on its own note of the chord, spread across the stereo field, and a long chord to end on.
   */
  chorus(seeds: number[], text: string) {
    if (!this.ctx || this.ctx.state !== 'running' || this.muted) return 0;
    const lead = seeds[0] ?? 1;
    const base = this.voice(lead).root;
    const chord = [0, 7, 4, 12, -5, 9];
    let longest = 0;
    seeds.slice(0, 6).forEach((seed, i) => {
      const pan = seeds.length > 1 ? -0.6 + (1.2 * i) / (seeds.length - 1) : 0;
      const len = this.sing(seed, text, { pan, delay: i * 0.5, harmony: false, vol: 0.05, melodySeed: lead, rootOffset: base - this.voice(seed).root + chord[i] });
      longest = Math.max(longest, len + i * 0.5);
    });
    [0, 4, 7, 12, 16, 19].forEach((s, k) => this.tone(midi(base + s), 2.8, { type: k % 2 ? 'sine' : 'triangle', vol: 0.055, delay: longest + 0.1 + k * 0.06, attack: 0.35, rev: 0.9 }));
    this.lastSong = { at: performance.now(), root: base };
    return longest + 3;
  }

  /** A letter arrived: two small bright notes. */
  letter() { if (this.ready('letter', 400)) [0, 5].forEach((st, i) => this.tone(midi(88 + st), 0.25, { type: 'triangle', vol: 0.06, delay: i * 0.1, rev: 0.5 })); }

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

  // --- the beacon keeper ---

  /** Waking: a deep grinding roar. */
  roar() {
    if (!this.ready('roar', 800)) return;
    this.noise(1.3, { type: 'lowpass', freq: 220, to: 70, vol: 0.32, attack: 0.08, rev: 0.5 });
    this.tone(62, 1.1, { type: 'sawtooth', to: 38, vol: 0.09, attack: 0.1, rev: 0.4 });
    this.tone(93, 0.9, { type: 'square', to: 50, vol: 0.04, attack: 0.15, delay: 0.1 });
  }
  /** A heavy foot or a charge starting. */
  stomp() {
    if (!this.ready('stomp', 120)) return;
    this.tone(95, 0.26, { type: 'sine', to: 38, vol: 0.26 });
    this.noise(0.18, { type: 'lowpass', freq: 320, to: 90, vol: 0.2 });
  }
  /** Landing a slam or hitting a wall. */
  slam() {
    if (!this.ready('slam', 150)) return;
    this.tone(70, 0.5, { type: 'sine', to: 28, vol: 0.34 });
    this.noise(0.45, { type: 'lowpass', freq: 500, to: 80, vol: 0.3, rev: 0.3 });
    this.noise(0.12, { freq: 2400, q: 0.7, vol: 0.08 });
  }
  /** The keeper crumbles. */
  guardianDie() {
    if (!this.ready('guardianDie', 1000)) return;
    this.noise(2.2, { type: 'lowpass', freq: 400, to: 40, vol: 0.3, attack: 0.05, rev: 0.6 });
    [0, -3, -7, -12].forEach((st, i) => this.tone(midi(48 + st), 0.9, { type: 'triangle', vol: 0.08, delay: i * 0.22, rev: 0.7 }));
  }
  /** The beacon lights: a boom, then a chord that climbs into the sky. */
  beacon() {
    if (!this.ready('beacon', 1500)) return;
    this.tone(48, 2.4, { type: 'sine', to: 26, vol: 0.3, attack: 0.02, rev: 0.5 });
    this.noise(1.6, { type: 'highpass', freq: 1500, to: 6000, vol: 0.05, attack: 0.5, rev: 0.8 });
    [0, 7, 12, 19, 24, 31, 36].forEach((st, i) => this.tone(midi(55 + st), 2.6 - i * 0.15, { type: i % 2 ? 'sine' : 'triangle', vol: 0.07, attack: 0.08, delay: 0.25 + i * 0.16, rev: 0.9 }));
  }
  /** Picking up a Spark: a quick bright shimmer. */
  spark() {
    if (!this.ready('spark', 400)) return;
    [0, 4, 7, 12, 16, 19, 24, 28].forEach((st, i) => this.tone(midi(79 + st), 0.5, { type: 'sine', vol: 0.06, delay: i * 0.045, rev: 0.85 }));
    this.noise(0.6, { type: 'highpass', freq: 4000, vol: 0.03, attack: 0.1, rev: 0.6 });
  }
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
