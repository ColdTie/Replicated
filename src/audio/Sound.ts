// Procedural sound: every effect and the ambient music are synthesized with WebAudio, so there are no audio
// files to download. The context starts on the first tap or key press (iOS requires a user gesture).
import SOUND from '../data/sound.json';
import TALK from '../data/talk.json';

type Wave = OscillatorType;
type Bus = 'sfx' | 'ui' | 'voice' | 'ambience';
/** what the ground sounds like underfoot (sound.json footsteps; PlanetScene.footSurface) */
export type Surface = 'grass' | 'stone' | 'water' | 'void' | 'snow' | 'ice' | 'metal' | 'printed' | 'sand';
/** a point in the world (px): sounds there fade with distance from you and pan to its side */
export type At = { x: number; y: number };
/** never twice the same: a value nudged by up to +-amount of itself */
const vary = (v: number, amount = 0.08) => v * (1 + (Math.random() * 2 - 1) * amount);
const pick = <T>(list: T[]) => list[Math.floor(Math.random() * list.length)];
interface Bed { wind?: { freq: number; q: number; vol: number; lfo: number }; drone?: { freq: number; vol: number }; event?: string; every?: number }

const PENTA = [0, 2, 4, 7, 9]; // major pentatonic steps
const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

// --- the copies' instruments, moods and tempos (a copy picks its own with the sing_as tool) ---
export type Instrument = 'hum' | 'bell' | 'flute' | 'glass' | 'pluck' | 'horn' | 'chime' | 'drum';
export type Mood = 'bright' | 'soft' | 'sad' | 'wild' | 'ancient' | 'dreamy';
export type Tempo = 'slow' | 'walking' | 'quick';
const INSTRUMENTS: Record<Instrument, { wave: Wave; attack: number; sustain: number; rev: number; gain: number; partial?: number; octave?: boolean }> = {
  hum: { wave: 'sine', attack: 0.06, sustain: 1.1, rev: 0.6, gain: 1 },
  bell: { wave: 'sine', attack: 0.004, sustain: 1.6, rev: 0.85, gain: 0.9, partial: 2.76 },
  flute: { wave: 'triangle', attack: 0.07, sustain: 1, rev: 0.5, gain: 0.95 },
  glass: { wave: 'sine', attack: 0.02, sustain: 1.8, rev: 0.95, gain: 0.8, octave: true },
  pluck: { wave: 'triangle', attack: 0.003, sustain: 0.45, rev: 0.35, gain: 1.1 },
  horn: { wave: 'square', attack: 0.04, sustain: 1, rev: 0.5, gain: 0.42 },
  chime: { wave: 'sine', attack: 0.003, sustain: 0.7, rev: 0.9, gain: 0.7, partial: 4, octave: true },
  drum: { wave: 'sine', attack: 0.002, sustain: 0.25, rev: 0.3, gain: 1.3 },
};
const INSTRUMENT_NAMES = Object.keys(INSTRUMENTS) as Instrument[];
/** Scale degrees -> semitones. Degree 0 is home; past the last step the mode repeats an octave up. */
const MOODS: Record<Mood, number[]> = {
  bright: [0, 2, 4, 7, 9],
  soft: [0, 2, 5, 7, 9],
  sad: [0, 3, 5, 7, 10],
  wild: [0, 2, 4, 6, 7, 11],
  ancient: [0, 2, 3, 7, 8],
  dreamy: [0, 4, 7, 11, 14],
};
const MOOD_NAMES = Object.keys(MOODS) as Mood[];
const TEMPOS: Record<Tempo, number> = { slow: 0.44, walking: 0.3, quick: 0.19 };

export interface SingOpts {
  pan?: number; harmony?: boolean; delay?: number; vol?: number; melodySeed?: number; rootOffset?: number;
  instrument?: Instrument; mood?: Mood; tempo?: Tempo;
  /** a composed melody: scale degrees separated by spaces, "-" a rest, "_" after a degree holds it, e.g. "0 2 4 7_ - 4 2 0_" */
  notes?: string;
}

/** "0 2 4_ - 7" -> notes with beats; null degree = rest. Up to 32 notes. */
export function parseMelody(notes: string): { deg: number | null; beats: number }[] {
  const out: { deg: number | null; beats: number }[] = [];
  for (const tok of notes.trim().split(/[\s,]+/).slice(0, 32)) {
    const m = /^(-?\d{1,2})(_*)$/.exec(tok);
    if (m) out.push({ deg: Math.max(-14, Math.min(21, Number(m[1]))), beats: 1 + m[2].length });
    else if (/^-+$|^\.+$/.test(tok)) out.push({ deg: null, beats: tok.length });
  }
  return out;
}

class SoundEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private ambienceBus!: GainNode;
  private uiBus!: GainNode;
  private voiceBus!: GainNode;
  /** music and ambience pass through here: it falls under a voice (duck) */
  private duckNode!: GainNode;
  private ducks = new Set<string>();
  private reverb!: ConvolverNode;
  /** where you are (world px), for distance and panning (listen) */
  private listener = { x: 0, y: 0, set: false };
  /** the ambience bed playing, the world's own under any place you went into (the cave, the vault) */
  private bed: { id: string; stop: () => void } | null = null;
  private world = 'default';
  private places: string[] = [];
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
      this.duckNode = ctx.createGain(); this.duckNode.connect(this.master);
      this.musicBus = ctx.createGain(); this.musicBus.gain.value = SOUND.music; this.musicBus.connect(this.duckNode);
      this.ambienceBus = ctx.createGain(); this.ambienceBus.gain.value = SOUND.ambience; this.ambienceBus.connect(this.duckNode);
      this.uiBus = ctx.createGain(); this.uiBus.gain.value = SOUND.ui; this.uiBus.connect(this.master);
      this.voiceBus = ctx.createGain(); this.voiceBus.gain.value = SOUND.voice; this.voiceBus.connect(this.master);
      this.reverb = ctx.createConvolver();
      this.reverb.buffer = this.impulse(SOUND.space.reverb.open.seconds);
      this.reverbSend = ctx.createGain(); this.reverbSend.gain.value = SOUND.space.reverb.open.send;
      this.reverbSend.connect(this.reverb).connect(this.master);
      this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.startMusic();
      this.applyPlace();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setMuted(m: boolean) {
    this.muted = m;
    try { localStorage.setItem('mute', m ? '1' : '0'); } catch { /* storage blocked */ }
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : SOUND.master, this.ctx.currentTime, 0.05);
  }

  setNight(n: number) { this.night = n; }

  /** Where you are, every frame: sounds given a place (At) fade and pan from here. */
  listen(x: number, y: number) { this.listener = { x, y, set: true }; }

  /** Loudness 0..1 and pan -0.8..0.8 of a sound at a point (sound.json space); full and centered without one. */
  private spatial(at?: At) {
    if (!at || !this.listener.set) return { k: 1, pan: 0 };
    const dx = at.x - this.listener.x, d = Math.hypot(dx, at.y - this.listener.y);
    const k = Math.max(0, 1 - d / SOUND.space.falloffPx);
    return { k: k * k, pan: Math.max(-0.8, Math.min(0.8, dx / SOUND.space.panPx)) };
  }

  /** Music and ambience step back under a voice (the talk box open, a song), each reason on its own. */
  duck(reason: string, on: boolean) {
    if (on) this.ducks.add(reason); else this.ducks.delete(reason);
    if (!this.ctx || !this.duckNode) return;
    this.duckNode.gain.setTargetAtTime(this.ducks.size ? SOUND.duck : 1, this.ctx.currentTime, SOUND.duckSeconds / 3);
  }

  /** The world you stand on: its ambience bed under open air (sound.json beds, space.reverb.open). */
  setWorld(id: string) { this.world = id; this.places = []; this.applyPlace(); }
  /** Into a place under the world (the cave of the warren, the husk vault): its bed and its reverb. */
  enterPlace(id: 'cave' | 'vault') { this.places.push(id); this.applyPlace(); }
  leavePlace() { this.places.pop(); this.applyPlace(); }

  private applyPlace() {
    if (!this.ctx || !this.reverb) return;
    const place = this.places[this.places.length - 1];
    const rv = (SOUND.space.reverb as Record<string, { seconds: number; send: number }>)[place ?? 'open'] ?? SOUND.space.reverb.open;
    this.reverb.buffer = this.impulse(rv.seconds);
    this.reverbSend.gain.setTargetAtTime(rv.send, this.ctx.currentTime, 0.3);
    const beds = SOUND.beds as Record<string, Bed>;
    const id = place ?? (this.world in beds ? this.world : 'default');
    if (this.bed?.id === id) return;
    this.bed?.stop();
    this.bed = { id, stop: this.startBed(beds[id] ?? beds.default) };
  }

  /** A bed: wind (filtered noise breathing slowly), a low drone, and small events now and then, panned about. */
  private startBed(b: Bed): () => void {
    const ctx = this.ctx!, t = ctx.currentTime, nodes: AudioScheduledSourceNode[] = [];
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(1, t + 2);
    out.connect(this.ambienceBus);
    if (b.wind) {
      const src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = b.wind.freq; f.Q.value = b.wind.q;
      const g = ctx.createGain(); g.gain.value = b.wind.vol;
      const lfo = ctx.createOscillator(); lfo.frequency.value = b.wind.lfo;
      const depth = ctx.createGain(); depth.gain.value = b.wind.vol * 0.6;
      lfo.connect(depth).connect(g.gain);
      const sweep = ctx.createGain(); sweep.gain.value = b.wind.freq * 0.35;
      lfo.connect(sweep).connect(f.frequency);
      src.connect(f).connect(g).connect(out);
      src.start(); lfo.start();
      nodes.push(src, lfo);
    }
    if (b.drone) {
      for (const det of [-4, 4]) {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = b.drone.freq; o.detune.value = det;
        const g = ctx.createGain(); g.gain.value = b.drone.vol;
        o.connect(g).connect(out); o.start(); nodes.push(o);
      }
    }
    let timer: number | null = null;
    if (b.event && b.every) {
      const tick = () => { this.bedEvent(b.event!); timer = window.setTimeout(tick, vary(b.every! * 1000, 0.5)); };
      timer = window.setTimeout(tick, vary(b.every * 1000, 0.5));
    }
    return () => {
      if (timer) window.clearTimeout(timer);
      const now = ctx.currentTime;
      out.gain.cancelScheduledValues(now); out.gain.setValueAtTime(out.gain.value, now); out.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);
      for (const n of nodes) n.stop(now + 1.3);
    };
  }

  /** One small thing in a bed, somewhere to the side. */
  private bedEvent(kind: string) {
    if (!this.ctx || this.ctx.state !== 'running' || this.muted) return;
    const pan = (Math.random() * 2 - 1) * 0.8, o = { bus: 'ambience' as Bus, pan };
    if (kind === 'creak') { this.tone(vary(700, 0.2), 0.5, { ...o, type: 'square', to: vary(420, 0.2), vol: 0.008, attack: 0.08 }); this.noise(0.08, { ...o, type: 'highpass', freq: 3500, vol: 0.02, delay: 0.3 }); }
    else if (kind === 'leaves') this.noise(vary(0.5, 0.3), { ...o, freq: vary(3200, 0.2), q: 1.2, vol: 0.018, attack: 0.15 });
    else if (kind === 'sand') this.noise(vary(0.8, 0.3), { ...o, type: 'highpass', freq: 4500, vol: 0.012, attack: 0.3 });
    else if (kind === 'bubble') [0, 1, 2].forEach((i) => this.tone(vary(500 + i * 160, 0.2), 0.07, { ...o, type: 'sine', to: vary(900, 0.2), vol: 0.02, delay: i * vary(0.12, 0.4) }));
    else if (kind === 'ember') this.noise(0.04, { ...o, type: 'highpass', freq: vary(5000, 0.2), vol: 0.03 });
    else if (kind === 'drip') this.tone(vary(1600, 0.25), 0.18, { ...o, type: 'sine', to: vary(1100, 0.2), vol: 0.03, rev: 0.9 });
    else if (kind === 'tick') this.noise(0.03, { ...o, freq: 2400, q: 6, vol: 0.02, rev: 0.4 });
  }

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

  private bus(b?: Bus) { return b === 'ui' ? this.uiBus : b === 'voice' ? this.voiceBus : b === 'ambience' ? this.ambienceBus : this.sfxBus; }

  private tone(freq: number, dur: number, opts: { type?: Wave; vol?: number; to?: number; attack?: number; delay?: number; rev?: number; pan?: number; bus?: Bus } = {}) {
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
    out.connect(this.bus(opts.bus));
    if (opts.rev) { const s = ctx.createGain(); s.gain.value = opts.rev; out.connect(s).connect(this.reverbSend); }
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private noise(dur: number, opts: { type?: BiquadFilterType; freq?: number; to?: number; q?: number; vol?: number; attack?: number; delay?: number; rev?: number; pan?: number; bus?: Bus } = {}) {
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
    let out: AudioNode = g;
    src.connect(f).connect(g);
    if (opts.pan) { const p = ctx.createStereoPanner(); p.pan.value = opts.pan; g.connect(p); out = p; }
    out.connect(this.bus(opts.bus));
    if (opts.rev) { const s = ctx.createGain(); s.gain.value = opts.rev; g.connect(s).connect(this.reverbSend); }
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  // --- effects ---

  /** A footstep on what is underfoot (sound.json footsteps), never twice the same; a copy's (at) fades with distance. */
  step(surface: Surface = 'grass', at?: At) {
    if (!this.ready(at ? 'stepFar' : 'step', 60)) return;
    const { k, pan } = this.spatial(at);
    if (k < 0.02) return;
    const o = { pan, vol: 1 };
    const v = (x: number) => vary(x, 0.15) * k;
    switch (surface) {
      case 'water': this.noise(0.12, { ...o, freq: vary(1700, 0.2), q: 2, vol: v(0.12) }); return;
      case 'void': return;
      case 'stone': this.noise(vary(0.05, 0.2), { ...o, type: 'highpass', freq: vary(2600, 0.15), q: 1.5, vol: v(0.07) }); return;
      case 'snow':
        // a crunch: two quick packed-snow bursts, low then a little higher
        this.noise(0.06, { ...o, type: 'lowpass', freq: vary(1300, 0.2), to: 500, vol: v(0.08) });
        this.noise(0.05, { ...o, freq: vary(2200, 0.2), q: 1.2, vol: v(0.05), delay: vary(0.03, 0.4) });
        return;
      case 'ice':
        // a hard click with a glassy ring under it
        this.noise(0.03, { ...o, type: 'highpass', freq: vary(4200, 0.15), vol: v(0.08) });
        this.tone(vary(pick([2400, 2800, 3300]), 0.05), 0.12, { ...o, type: 'sine', vol: v(0.012) });
        return;
      case 'metal':
        // a clank on plate: a short ringing partial and a click
        this.tone(vary(pick([180, 210, 240]), 0.06), 0.16, { ...o, type: 'triangle', to: vary(150, 0.05), vol: v(0.035) });
        this.noise(0.04, { ...o, freq: vary(1900, 0.1), q: 6, vol: v(0.06) });
        return;
      case 'printed':
        // a hollow tap on printed floor
        this.tone(vary(320, 0.08), 0.07, { ...o, type: 'triangle', to: 260, vol: v(0.03) });
        this.noise(0.04, { ...o, freq: vary(1500, 0.1), q: 3, vol: v(0.05) });
        return;
      case 'sand': this.noise(vary(0.1, 0.2), { ...o, type: 'lowpass', freq: vary(1100, 0.2), vol: v(0.06), attack: 0.02 }); return;
      default: this.noise(vary(0.07, 0.2), { ...o, freq: vary(pick([650, 750, 850]), 0.1), q: 1.5, vol: v(0.09) });
    }
  }

  swing(heavy = false) {
    if (!this.ready('swing', 40)) return;
    const f = vary(heavy ? 500 : pick([800, 900, 1000]), 0.08);
    this.noise(vary(heavy ? 0.2 : 0.12, 0.1), { freq: f, to: vary(heavy ? 2600 : 3200, 0.1), q: 2.5, vol: vary(heavy ? 0.3 : 0.2, 0.12) });
    if (heavy) this.tone(vary(140, 0.06), 0.18, { type: 'triangle', to: 70, vol: 0.2 });
  }

  hit(heavy = false, at?: At) {
    if (!this.ready('hit', 25)) return;
    const { k, pan } = this.spatial(at);
    if (k < 0.02) return;
    this.tone(vary(heavy ? 180 : pick([220, 240, 265]), 0.06), 0.12, { type: 'square', to: vary(60, 0.1), vol: vary(heavy ? 0.22 : 0.15, 0.12) * k, pan });
    this.noise(0.06, { type: 'highpass', freq: vary(3000, 0.15), vol: vary(0.2, 0.12) * k, pan });
  }

  crystal(at?: At) {
    if (!this.ready('crystal', 30)) return;
    const { k, pan } = this.spatial(at);
    if (k < 0.02) return;
    const n = 76 + PENTA[Math.floor(Math.random() * 5)] + 12 * Math.floor(Math.random() * 2);
    this.tone(midi(n), 0.9, { type: 'sine', vol: vary(0.07, 0.15) * k, rev: 0.6, pan });
    this.tone(midi(n) * 2.76, 0.4, { type: 'sine', vol: 0.025 * k, rev: 0.6, pan });
    this.noise(0.03, { type: 'highpass', freq: vary(5000, 0.1), vol: 0.07 * k, pan });
  }

  collect() {
    if (!this.ready('collect', 25)) return;
    const now = performance.now();
    this.collectStreak = now - this.lastCollect < 700 ? Math.min(this.collectStreak + 1, 9) : 0;
    this.lastCollect = now;
    const s = this.collectStreak;
    const n = 79 + PENTA[s % 5] + 12 * Math.floor(s / 5);
    const detune = 1 + (Math.random() - 0.5) * 0.008;
    this.tone(midi(n) * detune, vary(0.25, 0.1), { type: pick(['triangle', 'triangle', 'sine'] as Wave[]), vol: vary(0.075, 0.12), rev: 0.4 });
    this.tone(midi(n + 12) * detune, 0.15, { type: 'sine', vol: vary(0.035, 0.15), delay: vary(0.04, 0.3), rev: 0.4 });
  }

  hurt() {
    if (!this.ready('hurt', 80)) return;
    this.tone(220, 0.3, { type: 'square', to: 55, vol: 0.18 });
    this.noise(0.15, { type: 'lowpass', freq: 900, vol: 0.2 });
  }

  enemyDie(at?: At) {
    if (!this.ready('enemyDie', 40)) return;
    const { k, pan } = this.spatial(at);
    this.noise(0.3, { type: 'lowpass', freq: vary(2000, 0.15), to: 200, vol: 0.25 * k, pan });
    this.tone(vary(330, 0.1), 0.25, { type: 'triangle', to: 80, vol: 0.12 * k, pan });
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
  pop(at?: At) { if (this.ready('pop', 40)) { const { k, pan } = this.spatial(at); this.noise(0.12, { type: 'lowpass', freq: vary(1400, 0.15), to: 300, vol: 0.18 * k, pan }); } }

  splash(at?: At) { if (this.ready('splash', 120)) { const { k, pan } = this.spatial(at); this.noise(vary(0.3, 0.15), { freq: vary(1600, 0.15), to: 600, q: 0.8, vol: 0.16 * k, pan }); } }
  flutter(at?: At) {
    if (!this.ready('flutter', 300)) return;
    const { k, pan } = this.spatial(at);
    for (let i = 0; i < 6; i++) this.noise(0.03, { freq: vary(2500, 0.15), q: 2, vol: 0.06 * k, delay: i * vary(0.045, 0.2), pan });
  }

  pet() {
    if (!this.ready('pet', 300)) return;
    [0, 4, 7].forEach((s, i) => this.tone(midi(84 + s), 0.3, { type: 'sine', vol: 0.08, delay: i * 0.08, rev: 0.5 }));
  }

  // --- the copies' voices ---

  private lastSong = { at: 0, root: 0 };

  /** Who a copy sounds like, all from its seed: register, an instrument, a mode, and whether an octave shimmer rides on top. */
  private voice(seed: number) {
    let s = (seed >>> 0) || 1;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const root = 64 + Math.floor(rnd() * 14);
    const instrument = INSTRUMENT_NAMES[Math.floor(rnd() * INSTRUMENT_NAMES.length)];
    const mood = MOOD_NAMES[Math.floor(rnd() * MOOD_NAMES.length)];
    return { root, instrument, mood, shimmer: rnd() < 0.5 };
  }

  /** One note on an instrument. */
  private play(inst: Instrument, freq: number, dur: number, t: number, vol: number, pan?: number) {
    const i = INSTRUMENTS[inst];
    this.tone(freq, dur * i.sustain + 0.15, { type: i.wave, vol: vol * i.gain, delay: t, attack: i.attack, rev: i.rev, pan, bus: 'voice' });
    if (i.partial) this.tone(freq * i.partial, dur * 0.5, { type: 'sine', vol: vol * i.gain * 0.3, delay: t, attack: i.attack, rev: i.rev, pan, bus: 'voice' });
    if (i.octave) this.tone(freq * 2, dur * i.sustain * 0.8, { type: 'sine', vol: vol * i.gain * 0.22, delay: t + 0.02, rev: 0.8, pan, bus: 'voice' });
  }

  /**
   * A copy's song. The voice comes from its seed (or from what the copy chose with sing_as: instrument, mood,
   * tempo). With a composed melody the notes are its own; otherwise the words pick them (each word hashes to a
   * degree of the mode, longer words hold longer), so the same sentence always sings the same tune. A line ends on
   * a chord of its mode. A copy that answers within a few seconds sings a harmony, a third or a fifth above the
   * last voice. Returns the length of the phrase in seconds.
   */
  sing(seed: number, text = '', opts: SingOpts = {}) {
    if (!this.ctx || this.ctx.state !== 'running' || this.muted) return 0;
    const v = this.voice(seed);
    const inst = opts.instrument && opts.instrument in INSTRUMENTS ? opts.instrument : v.instrument;
    const moodName = opts.mood && opts.mood in MOODS ? opts.mood : v.mood;
    const mode = MOODS[moodName];
    const beat = TEMPOS[opts.tempo ?? 'walking'] ?? TEMPOS.walking;
    const words = (text || 'la la la.').split(/\s+/).filter(Boolean).slice(0, 14);
    const now = performance.now();
    const answering = opts.harmony ?? (now - this.lastSong.at < 6000);
    let root = v.root + (opts.rootOffset ?? 0);
    if (answering) root = this.lastSong.root + (seed % 2 ? 7 : 4);
    if (!answering) this.lastSong = { at: now, root };
    else this.lastSong.at = now;
    let t = opts.delay ?? 0;
    const vol = opts.vol ?? 0.084;
    const semis = (deg: number) => mode[((deg % mode.length) + mode.length) % mode.length] + 12 * Math.floor(deg / mode.length);
    let lastDeg = 0;
    const melody = opts.notes ? parseMelody(opts.notes) : null;
    if (melody && melody.length) {
      for (const n of melody) {
        const dur = beat * n.beats;
        if (n.deg !== null) { this.play(inst, midi(root + semis(n.deg)), dur, t, vol, opts.pan); lastDeg = n.deg; }
        t += dur;
      }
    } else {
      let h = (opts.melodySeed ?? seed) >>> 0;
      words.forEach((w) => {
        for (const c of w) h = (h * 31 + c.charCodeAt(0)) >>> 0;
        const deg = h % (mode.length + 2);
        const dur = beat * (0.6 + Math.min(7, w.length) * 0.14);
        this.play(inst, midi(root + semis(deg)), dur, t, vol, opts.pan);
        lastDeg = deg;
        t += dur;
        if (/[.!?]$/.test(w)) {
          const chord = [0, mode[2] ?? 4, mode[4] ?? 7].map((s) => s + 12 * Math.floor(semis(lastDeg) / 12));
          chord.forEach((s, k) => this.tone(midi(root + s), 1.1, { type: k ? 'sine' : INSTRUMENTS[inst].wave, vol: vol * 0.55, delay: t + k * 0.04, attack: 0.06, rev: 0.85, pan: opts.pan, bus: 'voice' }));
          t += 0.55;
        } else if (/,$/.test(w)) t += 0.18;
      });
    }
    if (melody && melody.length && moodName !== 'wild') {
      // the composed line ends on a chord of its mode
      const chord = [0, mode[2] ?? 4, mode[4] ?? 7].map((s) => s + 12 * Math.floor(semis(lastDeg) / 12));
      chord.forEach((s, k) => this.tone(midi(root + s), 1.3, { type: k ? 'sine' : INSTRUMENTS[inst].wave, vol: vol * 0.5, delay: t + k * 0.04, attack: 0.08, rev: 0.9, pan: opts.pan, bus: 'voice' }));
      t += 0.6;
    }
    this.duckFor(t + 0.6);
    return t;
  }

  /** Music and ambience step back while a song lasts. */
  private duckFor(seconds: number) {
    const id = `song${++this.songN}`;
    this.duck(id, true);
    window.setTimeout(() => this.duck(id, false), seconds * 1000);
  }
  private songN = 0;

  /**
   * Several copies sing one phrase together as a round: the same tune in every voice, each entering a beat
   * later on its own note of the chord, spread across the stereo field, and a long chord to end on.
   */
  chorus(seeds: number[], text: string, opts: SingOpts = {}) {
    if (!this.ctx || this.ctx.state !== 'running' || this.muted) return 0;
    const lead = seeds[0] ?? 1;
    const base = this.voice(lead).root;
    const chord = [0, 7, 4, 12, -5, 9];
    let longest = 0;
    seeds.slice(0, 6).forEach((seed, i) => {
      const pan = seeds.length > 1 ? -0.6 + (1.2 * i) / (seeds.length - 1) : 0;
      const len = this.sing(seed, text, { ...opts, pan, delay: i * 0.5, harmony: false, vol: 0.06, melodySeed: lead, rootOffset: base - this.voice(seed).root + chord[i], mood: opts.mood ?? this.voice(lead).mood });
      longest = Math.max(longest, len + i * 0.5);
    });
    [0, 4, 7, 12, 16, 19].forEach((s, k) => this.tone(midi(base + s), 2.8, { type: k % 2 ? 'sine' : 'triangle', vol: 0.066, delay: longest + 0.1 + k * 0.06, attack: 0.35, rev: 0.9, bus: 'voice' }));
    this.lastSong = { at: performance.now(), root: base };
    return longest + 3;
  }

  /**
   * One soft blip of a copy's voice while its words type out in the talk box: its own root and mode (or the mood
   * it chose with sing_as), the letter picking the degree, an octave above where it sings. Very quiet and rate
   * limited, so quick typing is a patter rather than a buzz.
   */
  blip(seed: number, voice?: { instrument?: string; mood?: string }, letter = '') {
    if (!this.ready('blip', TALK.blip.minGapMs)) return;
    const v = this.voice(seed);
    const mode = MOODS[voice?.mood && voice.mood in MOODS ? voice.mood as Mood : v.mood];
    const inst = INSTRUMENTS[voice?.instrument && voice.instrument in INSTRUMENTS ? voice.instrument as Instrument : v.instrument];
    const code = letter.toLowerCase().charCodeAt(0) || 97;
    const deg = (code * 5) % (mode.length + 1);
    const semis = mode[deg % mode.length] + 12 * Math.floor(deg / mode.length);
    const wave = inst.wave === 'square' ? 'triangle' : inst.wave;
    this.tone(midi(v.root + 12 + semis) * (1 + (Math.random() - 0.5) * 0.01), TALK.blip.seconds, { type: wave, vol: vary(TALK.blip.vol * inst.gain, 0.12), attack: 0.004, rev: 0.12, bus: 'voice' });
  }

  /** A letter arrived: two small bright notes. */
  letter() { if (this.ready('letter', 400)) [0, 5].forEach((st, i) => this.tone(midi(88 + st), 0.25, { type: 'triangle', vol: 0.06, delay: i * 0.1, rev: 0.5 })); }

  regen() { if (this.ready('regen', 400)) this.tone(midi(91), 0.3, { type: 'sine', vol: 0.04, rev: 0.6 }); }

  build(at?: At) {
    if (!this.ready('build', 200)) return;
    const { k, pan } = this.spatial(at);
    if (k < 0.02) return;
    [0, 4, 7, 12, 16].forEach((s, i) => this.tone(midi(60 + s), 1.6, { type: 'triangle', vol: 0.08 * k, delay: i * vary(0.12, 0.1), rev: 0.7, pan }));
    this.noise(1.2, { freq: 300, to: 3000, q: 2, vol: 0.06 * k, attack: 0.6, pan });
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
    // attack: the scanner's relay clicks in
    this.noise(0.03, { type: 'highpass', freq: 4000, vol: 0.08 });
    this.tone(1800, 0.04, { type: 'square', vol: 0.02 });
    this.tone(220, 0.8, { type: 'sine', to: 880, vol: 0.06, attack: 0.1, rev: 0.5 });
    this.tone(880, 0.8, { type: 'sine', to: 220, vol: 0.06, attack: 0.1, delay: 0.8, rev: 0.5 });
    this.noise(1.6, { freq: 2000, q: 8, vol: 0.03, attack: 0.3 });
  }

  /** A copy is born: a warm chord that ends on a bright note. */
  birth() {
    if (!this.ready('birth', 500)) return;
    // attack: a bright burst as the copy's last row is laid; body: the warm chord; tail: air and a shimmer that fades
    this.noise(0.12, { type: 'highpass', freq: 3000, to: 8000, vol: 0.06 });
    this.tone(110, 0.25, { type: 'sine', to: 55, vol: 0.12 });
    [0, 7, 12, 16, 19, 24].forEach((s, i) => this.tone(midi(62 + s), 1.8, { type: i % 2 ? 'sine' : 'triangle', vol: 0.07, delay: 0.05 + i * 0.09, rev: 0.8 }));
    this.noise(2.2, { type: 'bandpass', freq: 5000, q: 0.8, vol: 0.02, delay: 0.6, attack: 0.5, rev: 0.9 });
    [24, 28, 31, 36].forEach((s, i) => this.tone(midi(62 + s), 0.9, { type: 'sine', vol: 0.025, delay: 1.1 + i * 0.12, rev: 0.95 }));
  }

  /** A Vessel wakes (the opening, a held Vessel taken, a cradle): attack, the visor's relay clicks on; body, a hum
   * rising an octave as it powers up; tail, a soft high chord that hangs in the air. */
  wake() {
    if (!this.ready('wake', 800)) return;
    this.noise(0.025, { type: 'highpass', freq: 5000, vol: 0.09 });
    this.tone(2600, 0.05, { type: 'square', vol: 0.015 });
    this.tone(110, 0.9, { type: 'sine', to: 220, vol: 0.09, attack: 0.15, delay: 0.05 });
    this.tone(165, 0.9, { type: 'triangle', to: 330, vol: 0.03, attack: 0.2, delay: 0.1 });
    [0, 7, 12, 16].forEach((s, i) => this.tone(midi(76 + s), 1.6, { type: 'sine', vol: 0.03, delay: 0.8 + i * 0.1, attack: 0.1, rev: 0.9 }));
  }

  /** A link: attack, the beam strikes (a high zap); body, its hum sweeping up or down the column; tail, sparkle. */
  link(down: boolean) {
    if (!this.ready('link', 400)) return;
    this.noise(0.08, { type: 'highpass', freq: 6000, to: 2500, vol: 0.08 });
    for (const det of [0, 7]) this.tone(down ? 880 : 220, 0.6, { type: 'sawtooth', to: down ? 220 : 880, vol: 0.02, attack: 0.05, delay: 0.04 + det * 0.002 });
    this.noise(0.6, { freq: down ? 4000 : 800, to: down ? 800 : 4000, q: 5, vol: 0.03, delay: 0.05 });
    [0, 4, 7, 12, 16].forEach((s, i) => this.tone(midi(84 + s), 0.4, { type: 'sine', vol: 0.03, delay: 0.55 + i * 0.05, rev: 0.85 }));
  }

  /** Lift-off: attack, ignition (a thump and a crack); body, the roar rising as the ship climbs; tail, the whoosh
   * thinning into the sky. */
  launch() {
    if (!this.ready('launch', 2000)) return;
    this.tone(60, 0.4, { type: 'sine', to: 35, vol: 0.25 });
    this.noise(0.15, { type: 'highpass', freq: 2500, vol: 0.1 });
    this.noise(2.8, { type: 'lowpass', freq: 200, to: 1400, vol: 0.18, attack: 0.4, delay: 0.1 });
    this.tone(45, 2.6, { type: 'sawtooth', to: 90, vol: 0.04, attack: 0.4, delay: 0.1 });
    this.noise(1.6, { freq: 3000, to: 900, q: 0.7, vol: 0.06, delay: 2.4, attack: 0.3, rev: 0.6 });
  }

  /** Coming down: the roar descends with the ship (body), then the touchdown thump and a settling hiss (attack, tail). */
  landing(seconds = 1.7) {
    if (!this.ready('landing', 2000)) return;
    this.noise(seconds, { type: 'lowpass', freq: 1400, to: 250, vol: 0.14, attack: 0.3 });
    this.tone(90, seconds, { type: 'sawtooth', to: 45, vol: 0.03, attack: 0.3 });
    this.tone(70, 0.5, { type: 'sine', to: 30, vol: 0.3, delay: seconds });
    this.noise(0.25, { type: 'lowpass', freq: 600, to: 100, vol: 0.2, delay: seconds });
    this.noise(1.4, { type: 'highpass', freq: 3000, vol: 0.04, delay: seconds + 0.15, attack: 0.2 });
  }

  /** Wake or hold: the two lights open over the Replicator (a held breath), move between them, and the pick: a
   * rising open fifth for a waking, a low falling lullaby for one held asleep. */
  choiceOpen() { if (this.ready('choice', 300)) [0, 7].forEach((s, i) => this.tone(midi(69 + s), 0.6, { type: 'sine', vol: 0.05, delay: i * 0.12, attack: 0.08, rev: 0.7, bus: 'ui' })); }
  choiceMove(i: number) { if (this.ready('choiceMove', 60)) this.tone(midi(i ? 76 : 81), 0.12, { type: 'triangle', vol: 0.05, rev: 0.3, bus: 'ui' }); }
  choicePick(kind: 'wake' | 'hold') {
    if (!this.ready('choicePick', 300)) return;
    const notes = kind === 'wake' ? [0, 7, 12] : [12, 7, 3, 0];
    notes.forEach((s, i) => this.tone(midi((kind === 'wake' ? 69 : 57) + s), kind === 'wake' ? 0.5 : 0.9, { type: kind === 'wake' ? 'triangle' : 'sine', vol: 0.07, delay: i * (kind === 'wake' ? 0.08 : 0.16), rev: 0.7, bus: 'ui' }));
  }

  /** The husk vault: its door (a heavy iron slide, a hiss of air), the hum of the pods below while you are in it, and
   * the menu (a soft tick per row, a bright double tone to pick). */
  vaultDoor() {
    if (!this.ready('vaultDoor', 400)) return;
    this.noise(0.5, { type: 'lowpass', freq: 500, to: 160, vol: 0.18, attack: 0.02 });
    this.tone(70, 0.4, { type: 'square', to: 55, vol: 0.05 });
    this.noise(0.35, { freq: 3000, q: 1.5, vol: 0.05, delay: 0.3 });
  }
  /** The vault below: its own bed (the pods' hum, a tick now and then) and a short metal room's reverb. */
  vaultHum(on: boolean) { if (on) this.enterPlace('vault'); else this.leavePlace(); }
  menuMove(i: number) { if (this.ready('menuMove', 40)) this.tone(midi(84 + (i % 3) * 2), 0.06, { type: 'triangle', vol: 0.04, bus: 'ui' }); }
  menuPick() { if (this.ready('menuPick', 120)) [0, 7].forEach((s, i) => this.tone(midi(84 + s), 0.12, { type: 'triangle', vol: 0.06, delay: i * 0.06, rev: 0.3, bus: 'ui' })); }

  /** A printer lays a layer: the head's servo whirs across, a click as it sets down, a soft hiss of the bead. Quieter
   * and panned with distance (dx, d in px from the player); never twice the same. */
  printLayer(dx = 0, d = 0) {
    if (d > 260 || !this.ready('printLayer', 90)) return;
    const near = Math.max(0.15, 1 - d / 260), pan = Math.max(-0.8, Math.min(0.8, dx / 200)), r = 1 + (Math.random() - 0.5) * 0.12;
    this.tone(320 * r, 0.18, { type: 'square', to: 520 * r, vol: 0.025 * near, pan });
    this.noise(0.05, { freq: 3500 * r, q: 4, vol: 0.06 * near, delay: 0.17 });
    this.noise(0.22, { type: 'highpass', freq: 5000, vol: 0.025 * near, delay: 0.2, attack: 0.04 });
  }
  /** The last layer: a rising chord of the head running home, the gantry settling, the warm hum fading. */
  printDone() {
    if (!this.ready('printDone', 800)) return;
    [0, 4, 7, 12].forEach((s, i) => this.tone(midi(64 + s), 0.6, { type: 'triangle', vol: 0.06, delay: i * 0.07, rev: 0.6 }));
    this.noise(0.4, { type: 'lowpass', freq: 400, to: 120, vol: 0.12, delay: 0.32 });
    this.tone(110, 1.4, { type: 'sine', vol: 0.05, delay: 0.3, attack: 0.05, rev: 0.4 });
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
      src.connect(f).connect(this.rainGain).connect(this.ambienceBus);
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
