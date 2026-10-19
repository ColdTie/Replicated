import Phaser from 'phaser';
import { sound } from '../../audio/Sound';
import { PALETTE } from '../../core/data';
import { session } from '../../core/session';
import RETURN from '../../data/return.json';
import type { Npc } from '../../entities/Npc';
import type { Letter, SeenState } from '../../net/store';
import type { PlanetScene } from '../PlanetScene';

interface Beat { x: number; y: number; by?: Npc }
interface Envelope { letter: Letter; img: Phaser.GameObjects.Image; glow: Phaser.GameObjects.Image }

/**
 * Coming back: the camera visits what changed since you last saw the place (planet_states.data.seen), without a
 * word, and the letters that came for you wait as envelopes in front of the vessel. Tunables: src/data/return.json.
 * Part of PlanetScene (src/scenes/PlanetScene.ts); `s` is the scene.
 */
export class Homecoming {
  constructor(readonly s: PlanetScene) {}

  /** the tour is running: the player waits */
  touring = false;
  private envelopes: Envelope[] = [];
  private lastSeenAt = 0;
  private skip?: () => void;

  /** A new planet (the scene object is reused). */
  reset() {
    this.touring = false;
    this.envelopes = [];
    this.lastSeenAt = 0;
    this.skip = undefined;
  }

  /** The village as you see it now. */
  snapshot(): SeenState {
    const s = this.s;
    const buildings: Record<string, number> = {};
    for (const b of s.buildings.list) if (!b.vetoed) buildings[b.id] = b.built ? 1 : Math.min(1, b.progress / s.buildings.swingsFor(b));
    const copies: Record<string, string> = {};
    for (const n of s.npcs) if (!n.data.id.startsWith('pending')) copies[n.data.id] = `${n.data.name}|${n.data.traits.body ? 'b' : ''}`;
    return {
      at: Date.now(),
      builds: s.village.structures.filter((x) => x.type !== 'replicator').map((x) => `${x.type}|${Math.round(x.x)}|${Math.round(x.y)}`),
      buildings,
      rooms: s.warren.data.rooms.filter((r) => r.dug).map((r) => r.id),
      copies,
    };
  }

  /** What changed between `old` and now, most telling first. */
  beats(old: SeenState): Beat[] {
    const s = this.s, out: Beat[] = [];
    for (const n of s.npcs) {
      const was = old.copies[n.data.id];
      if (n.below || n.blank) continue;
      if (!was || was !== `${n.data.name}|${n.data.traits.body ? 'b' : ''}`) out.push({ x: n.x, y: n.y - 8, by: n });
    }
    for (const b of s.buildings.list) {
      if (b.vetoed) continue;
      const now = b.built ? 1 : b.progress / s.buildings.swingsFor(b), was = old.buildings[b.id] ?? 0;
      if ((now >= 1 && was < 1) || now - was >= RETURN.buildingStep) out.push({ x: b.x, y: b.y - b.h * 8, by: s.npcs.find((n) => n.data.id === b.by) });
    }
    const seen = new Set(old.builds);
    const fresh = s.village.structures.filter((x) => x.type !== 'replicator' && !seen.has(`${x.type}|${Math.round(x.x)}|${Math.round(x.y)}`));
    // builds close together are one beat
    for (const x of fresh) if (!out.some((o) => Math.hypot(o.x - x.x, o.y - x.y) < 60)) out.push({ x: x.x, y: x.y - 6, by: s.npcs.find((n) => n.data.id === x.by) });
    const dug = s.warren.data.rooms.filter((r) => r.dug && !old.rooms.includes(r.id));
    if (dug.length) out.push({ x: s.warren.hatch.x, y: s.warren.hatch.y, by: s.npcs.find((n) => dug.some((r) => r.by === n.data.id)) });
    return out.slice(0, RETURN.maxBeats);
  }

  /**
   * After the landing or the fade-in: the tour (when you were away long enough), then `done` (the player moves).
   * The first visit only remembers what is here.
   */
  run(done: () => void) {
    const s = this.s;
    const old = session.planet?.data.seen;
    if (s.shot || s.visit) { done(); return; }
    void this.placeLetters(old?.at ?? Date.now() - 24 * 3_600_000);
    const away = old ? (Date.now() - old.at) / 60_000 : 0;
    const beats = old && away >= RETURN.minAwayMinutes ? this.beats(old) : [];
    if (!beats.length) { this.remember(); done(); return; }
    this.tour(beats, () => { this.remember(); done(); });
  }

  /** The camera visits each beat; any key or click ends it. */
  tour(beats: Beat[], done: () => void) {
    const s = this.s, cam = s.cameras.main;
    this.touring = true;
    cam.stopFollow();
    let i = 0, over = false;
    const finish = () => {
      if (over) return;
      over = true;
      this.skip = undefined;
      s.input.keyboard?.off('keydown', finish);
      s.input.off('pointerdown', finish);
      cam.pan(s.player.x, s.player.y - 8, 320, 'Sine.easeInOut', true, (_c: Phaser.Cameras.Scene2D.Camera, t: number) => {
        if (t < 1) return;
        cam.startFollow(s.player.zone, true, 0.1, 0.1, 0, 8);
        this.touring = false;
        done();
      });
    };
    this.skip = finish;
    s.input.keyboard?.once('keydown', finish);
    s.input.once('pointerdown', finish);
    const next = () => {
      if (over) return;
      if (i >= beats.length) { finish(); return; }
      const b = beats[i++];
      cam.pan(b.x, b.y, RETURN.panMs, 'Sine.easeInOut', true, (_c: Phaser.Cameras.Scene2D.Camera, t: number) => {
        if (t < 1 || over) return;
        this.pulse(b);
        s.time.delayedCall(RETURN.holdMs, next);
      });
    };
    s.time.delayedCall(300, next);
  }

  /** A warm swell of light where it changed; whoever made it hops. */
  private pulse(b: Beat) {
    const s = this.s;
    const light = s.lighting.add({ x: b.x, y: b.y, radius: 56, color: PALETTE[10], intensity: 0 });
    s.tweens.add({ targets: light, intensity: 0.9, duration: 260, yoyo: true, hold: 300, onComplete: () => s.lighting.remove(light) });
    s.fx.sparks(b.x, b.y - 4, PALETTE[10], 8);
    sound.collect();
    if (b.by && s.npcs.includes(b.by) && !b.by.below) b.by.thank();
  }

  /** What you see now is what you saw: written with the next flush. */
  remember() {
    this.s.pending.seen = this.snapshot();
    this.lastSeenAt = this.s.time.now;
  }

  /** Letters that came for you since you last were here: envelopes in a row in front of the vessel. */
  private async placeLetters(since: number) {
    const s = this.s, me = session.replicant, st = session.store;
    if (!me || !st) return;
    const letters = await st.lettersTo(me.id, new Date(since).toISOString(), RETURN.maxLetters).catch(() => [] as Letter[]);
    if (!letters.length || !s.sys.isActive() && !s.sys.isPaused()) return;
    if (!s.textures.exists('envelope')) {
      const g = s.make.graphics({}, false);
      g.fillStyle(PALETTE[11], 1).fillRect(0, 0, 9, 7);
      g.fillStyle(PALETTE[9], 1).fillRect(0, 0, 9, 1).fillRect(1, 1, 1, 1).fillRect(7, 1, 1, 1).fillRect(2, 2, 1, 1).fillRect(6, 2, 1, 1).fillRect(3, 3, 3, 1);
      g.generateTexture('envelope', 9, 7);
      g.destroy();
    }
    const v = s.vesselPos;
    letters.forEach((letter, k) => {
      const x = v.x - (letters.length - 1) * 7 + k * 14, y = v.y + 30;
      const glow = s.add.image(x, y - 3, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(PALETTE[10]).setAlpha(0.2).setScale(0.3).setDepth(6100);
      const img = s.add.image(x, y, 'envelope').setOrigin(0.5, 1).setDepth(100 + y);
      s.tweens.add({ targets: img, y: y - 2, duration: 900 + k * 70, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      s.tweens.add({ targets: glow, alpha: 0.08, duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      this.envelopes.push({ letter, img, glow });
    });
  }

  /** Every frame: walking into an envelope opens what it says; what you see is remembered now and then. */
  update(time: number) {
    const s = this.s, p = s.player;
    if (time - this.lastSeenAt > RETURN.seenEveryMs && this.lastSeenAt && !this.touring) this.remember();
    if (!this.envelopes.length || !p.alive || p.locked || p.isHidden || this.touring) return;
    const e = this.envelopes.find((x) => Math.hypot(x.img.x - p.x, x.img.y - p.y) < 10);
    if (!e) return;
    this.envelopes = this.envelopes.filter((x) => x !== e);
    s.tweens.killTweensOf(e.img);
    s.tweens.killTweensOf(e.glow);
    s.fx.sparks(e.img.x, e.img.y - 4, PALETTE[10], 6);
    e.img.destroy(); e.glow.destroy();
    sound.pet();
    const from = s.npcs.find((n) => n.data.id === e.letter.from_replicant && !n.below && !n.blank);
    if (from) s.talker.openTalk(from, 'letters:0');
    else void s.toggleJournal();
  }
}
