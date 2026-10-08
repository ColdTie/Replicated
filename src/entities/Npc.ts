// A copy left behind to run the planet. It wanders the base, mines nearby crystals, carries Embers back to the
// Replicator, and greets you when you come close. Its drift (visor, headgear, trail) tells it apart at a glance.
import Phaser from 'phaser';
import { sound, type Instrument, type Mood, type Tempo } from '../audio/Sound';
import { anim, featureTex } from '../core/assets';
import { MIND, PALETTE, PLAYER, VILLAGE, WARREN } from '../core/data';
import { DRIFT, stat } from '../core/drift';
import type { Light } from '../fx/Lighting';
import type { ReplicantSave } from '../net/store';
import type { PlanetScene } from '../scenes/PlanetScene';
import { Gear } from './Gear';
import type { BuildJob } from './Village';
import type { BelowTask } from './Warren';
import type { WarrenRoom } from '../net/store';
import { squash } from './Player';

type State = 'idle' | 'walk' | 'mine' | 'carry' | 'greet' | 'born' | 'hammer' | 'chore' | 'below';
/** Something a copy decided to do with its hands: walk there, swing a few times, then it happens. */
interface Chore { x: number; y: number; swings: number; swing: () => void; done: () => void }
type Pt = { x: number; y: number };

export class Npc {
  readonly sprite: Phaser.GameObjects.Sprite;
  private shadow: Phaser.GameObjects.Image;
  private gear: Gear;
  private light: Light;
  private carried?: Phaser.GameObjects.Image;
  private key: string;
  readonly trailColor: number;
  x: number; y: number;
  state: State = 'idle';
  private target: Pt | null = null;
  private until = 0;
  private nextTrip: number;
  private nextGreet = 0;
  private nextSparkle = 0;
  private swings = 0;
  private mineAt: Pt | null = null;
  private job: BuildJob | null = null;
  private chore: Chore | null = null;
  /** heading for the hatch to go down and do this */
  private descent: { task: BelowTask; room?: WarrenRoom } | null = null;
  private nextBuild: number;
  /** hop height, added on top of the walking position */
  z = 0;
  /** 0 rested .. 1 weary: climbs while awake, cleared by a sleep in a resting station */
  weary = 0;
  private nextYawn = 0;
  /** the night level at which this copy turns in: early birds and night owls, from its id */
  readonly nightFrom: number;

  constructor(private scene: PlanetScene, readonly data: ReplicantSave, x: number, y: number) {
    this.x = x; this.y = y;
    const model = PLAYER.models[(data.model in PLAYER.models ? data.model : PLAYER.model) as keyof typeof PLAYER.models];
    this.key = featureTex(model.sprite, data.traits.feature ?? PLAYER.feature[1]);
    this.trailColor = PALETTE[data.traits.trail ?? 10];
    this.shadow = scene.add.image(x, y, 'shadow').setAlpha(0.45).setTint(PALETTE[25]).setDepth(50);
    this.sprite = scene.add.sprite(x, y, this.key).setOrigin(0.5, 1).play(anim(this.key, 'idle'));
    this.sprite.anims.setProgress(Math.random());
    this.gear = new Gear(scene, this.sprite, model.sprite, data.traits.gear ?? 0, this.trailColor);
    // a small warm light: copies are "ours", like the base
    this.light = scene.lighting.add({ x, y, radius: 34 * stat(data, 'light'), color: 0xffe2b8, intensity: 0.75 });
    this.nextTrip = scene.time.now + DRIFT.tripMs * (0.5 + Math.random()) / stat(data, 'gather');
    // copies get to work soon after you arrive, one after another
    this.nextBuild = scene.time.now + 3500 + Math.random() * 5000;
    const [lo, hi] = WARREN.rest.nightFrom;
    this.nightFrom = lo + ((this.voiceSeed >>> 8) % 100) / 100 * (hi - lo);
    // how tired it is carries over; a copy that slept while you were away comes back rested (Warren checks the bed)
    this.weary = data.traits.weary ?? Math.min(0.6, ((this.voiceSeed >>> 16) % 100) / 160);
    this.sync();
  }

  get weariness(): 'rested' | 'tired' | 'weary' { return this.weary < 0.35 ? 'rested' : this.weary < 0.8 ? 'tired' : 'weary'; }

  /** Building-up effect when the Replicator makes this copy. Calls done() when it can walk. */
  playBirth(done: () => void) {
    this.state = 'born';
    const s = this.sprite;
    const h = s.height;
    const line = this.scene.add.rectangle(s.x, s.y, 16, 1, this.trailColor).setBlendMode(Phaser.BlendModes.ADD).setDepth(6150);
    const shown = { rows: 0 };
    this.gear.image.setAlpha(0);
    s.setTintFill(0xffffff);
    this.scene.tweens.add({
      targets: shown, rows: h, duration: 1400, ease: 'Linear',
      onUpdate: () => {
        const r = Math.floor(shown.rows);
        s.setCrop(0, h - r, s.width, r);
        line.setPosition(s.x, s.y - r);
        if (Math.random() < 0.4) this.scene.fx.sparks(s.x + (Math.random() - 0.5) * 12, s.y - r, this.trailColor, 1);
      },
      onComplete: () => {
        line.destroy();
        s.setCrop();
        s.clearTint();
        squash(this.scene, s, 1.3, 0.75, 140);
        this.scene.fx.sparks(s.x, s.y - 10, this.trailColor, 18);
        this.gear.image.setAlpha(1);
        // the visor flickers through colors and settles on its own drift color
        const keys = PLAYER.featureColors.map((f) => featureTex(PLAYER.models.replicant.sprite, f[1]));
        let i = 0;
        const flick = this.scene.time.addEvent({
          delay: 70, repeat: 8,
          callback: () => {
            i++;
            const k = i > 8 ? this.key : keys[i % keys.length];
            s.setTexture(k, s.frame.name);
            if (i > 8) { s.play(anim(this.key, 'idle')); flick.remove(); this.state = 'greet'; this.until = this.scene.time.now + 900; this.hop(); done(); }
          },
        });
      },
    });
  }

  private hop() {
    this.scene.tweens.add({ targets: this, z: 6, duration: 140, yoyo: true, ease: 'Quad.easeOut' });
    squash(this.scene, this.sprite, 0.8, 1.2, 120);
  }

  /** Down in the warren (digging or asleep): nothing of the copy is on the surface. */
  get below() { return this.state === 'below'; }

  update(time: number, dt: number) {
    if (this.state === 'born') { this.sync(); return; }
    if (this.state === 'below') return;
    const p = this.scene.player;
    const dp = Math.hypot(p.x - this.x, p.y - this.y);

    // say hello when you come close: turn, hop, chirp
    if (dp < 30 && time > this.nextGreet && p.alive && this.state !== 'mine') {
      this.nextGreet = time + 20_000;
      this.state = 'greet';
      this.until = time + 900;
      this.sprite.setFlipX(p.x < this.x);
      this.hop();
      sound.pet();
    }

    switch (this.state) {
      case 'greet':
        if (time > this.until) this.state = 'idle';
        break;
      case 'idle':
        if (time > this.until) this.think(time);
        break;
      case 'walk':
      case 'carry':
        if (this.target && this.walkTo(this.target, dt)) {
          if (this.state === 'carry') this.deliver(time);
          else if (this.mineAt) { this.state = 'mine'; this.swings = 0; this.until = time; }
          else if (this.chore) { this.state = 'chore'; this.swings = 0; this.until = time; }
          else if (this.descent) { const d = this.descent; this.descent = null; this.scene.warren.enter(this, d.task, d.room); return; }
          else if (this.job) { this.state = 'hammer'; this.swings = 0; this.until = time; this.scene.village.showGhost(this.job, 0); }
          else { this.state = 'idle'; this.until = time + 800 + Math.random() * 2500; }
        } else if (!this.target) {
          if (this.job) { this.scene.village.release(this.job); this.job = null; this.nextBuild = time + 5000; }
          if (this.descent) { this.scene.warren.release(this); this.descent = null; }
          this.chore = null;
          this.state = 'idle';
        }
        break;
      case 'chore':
        if (time > this.until) {
          const c = this.chore;
          if (!c) { this.state = 'idle'; break; }
          if (this.swings >= c.swings) {
            this.chore = null;
            c.done();
            this.hop();
            this.state = 'idle';
            this.until = time + 1500;
            break;
          }
          this.swings++;
          this.until = time + VILLAGE.hammerMs;
          this.sprite.play(anim(this.key, 'attack'), true);
          this.sprite.setFlipX(c.x < this.x);
          c.swing();
        }
        break;
      case 'hammer':
        if (time > this.until) {
          const job = this.job!;
          if (this.swings >= VILLAGE.hammerSwings) {
            this.scene.village.complete(job);
            this.job = null;
            if (dp < 220) sound.build();
            this.hop();
            this.state = 'idle';
            this.until = time + 1500;
            this.nextBuild = time + 4000 + Math.random() * 6000;
            break;
          }
          this.swings++;
          this.until = time + VILLAGE.hammerMs;
          this.sprite.play(anim(this.key, 'attack'), true);
          this.sprite.setFlipX(job.x < this.x);
          this.scene.fx.sparks(job.x + (Math.random() - 0.5) * 8, job.y - 6 - Math.random() * 10, job.tint !== undefined ? PALETTE[job.tint] : PALETTE[10], 3);
          this.scene.village.showGhost(job, this.swings / VILLAGE.hammerSwings);
          if (dp < 160) sound.hit();
        }
        break;
      case 'mine':
        if (time > this.until) {
          if (this.swings++ >= 3) { this.pickUp(); break; }
          this.until = time + 450;
          this.sprite.play(anim(this.key, 'attack'), true);
          this.sprite.setFlipX(this.mineAt!.x < this.x);
          this.scene.fx.sparks(this.mineAt!.x, this.mineAt!.y - 6, PALETTE[10], 3);
          if (dp < 160) sound.crystal();
        }
        break;
    }

    // weariness builds while awake; a weary copy is slower, dimmer, and yawns now and then
    this.weary = Math.min(1, this.weary + dt / (WARREN.rest.wearyAfterMinutes * 60_000));
    this.light.intensity = 0.75 * (1 - 0.45 * this.weary);
    if (this.weary > 0.7 && time > this.nextYawn && (this.state === 'idle' || this.state === 'walk')) {
      this.nextYawn = time + 9000 + Math.random() * 12000;
      squash(this.scene, this.sprite, 0.9, 1.12, 260);
      const puff = this.scene.add.image(this.x + (this.sprite.flipX ? -5 : 5), this.y - 16, 'px').setTint(PALETTE[21]).setAlpha(0.5).setDepth(6090);
      this.scene.tweens.add({ targets: puff, y: puff.y - 8, alpha: 0, scale: 2, duration: 900, onComplete: () => puff.destroy() });
    }
    const moving = this.state === 'walk' || this.state === 'carry';
    const working = this.state === 'mine' || this.state === 'hammer';
    if (!working || time > this.until - 300) {
      const want = anim(this.key, moving ? 'walk' : 'idle');
      if (this.sprite.anims.currentAnim?.key !== want && !working) this.sprite.play(want);
    }
    // trail: little sparkles in the copy's own color when it walks
    if (moving && time > this.nextSparkle) {
      this.nextSparkle = time + 160;
      this.scene.fx.sparks(this.x, this.y, this.trailColor, 1);
    }
    this.sync();
  }

  private think(time: number) {
    const base = this.scene.baseCenter;
    // the warren first: a room waiting to be dug, or bed when it is night and there is a bed
    const down = this.scene.warren.pickTask(this, this.scene.env.night);
    if (down) {
      this.descent = down;
      this.mineAt = null;
      const h = this.scene.warren.hatch;
      this.target = { x: h.x, y: h.y + 2 };
      this.state = 'walk';
      return;
    }
    // something to build? (the pool has the work, the ring has room)
    if (time > this.nextBuild) {
      const job = this.scene.village.requestJob(this);
      if (job) {
        this.job = job;
        this.mineAt = null;
        this.target = { x: job.x + (this.x < job.x ? -13 : 13), y: job.y + 4 };
        this.state = 'walk';
        return;
      }
      this.nextBuild = time + 9000 + Math.random() * 6000;
    }
    // time for a trip: go mine the nearest healthy crystal near the base
    if (time > this.nextTrip) {
      this.nextTrip = time + DRIFT.tripMs / stat(this.data, 'gather');
      const node = this.scene.nodes.filter((n) => n.alive && Math.hypot(n.x - base.x, n.y - base.y) < 220)
        .sort((a, b) => Math.hypot(a.x - this.x, a.y - this.y) - Math.hypot(b.x - this.x, b.y - this.y))[0];
      if (node) {
        this.mineAt = { x: node.x, y: node.y };
        this.target = { x: node.x + (this.x < node.x ? -12 : 12), y: node.y + 4 };
        this.state = 'walk';
        return;
      }
    }
    this.mineAt = null;
    const a = Math.random() * Math.PI * 2, r = 20 + Math.random() * 70;
    this.target = { x: base.x + Math.cos(a) * r, y: base.y + 20 + Math.sin(a) * r * 0.6 };
    this.state = 'walk';
  }

  /** Steps toward a point; true when arrived. Gives up (clears target) when blocked. */
  private walkTo(t: Pt, dt: number) {
    const dx = t.x - this.x, dy = t.y - this.y, d = Math.hypot(dx, dy);
    if (d < 3) return true;
    const speed = PLAYER.speed * 0.55 * stat(this.data, 'speed') * (1 - 0.3 * this.weary);
    const nx = this.x + (dx / d) * speed * dt / 1000, ny = this.y + (dy / d) * speed * dt / 1000;
    if (this.scene.isWalkable(nx, ny) && this.scene.surfaceAt(nx, ny) !== 'void') {
      this.x = nx; this.y = ny;
      if (Math.abs(dx) > 1) this.sprite.setFlipX(dx < 0);
    } else if (this.scene.isWalkable(nx, this.y)) this.x = nx;
    else if (this.scene.isWalkable(this.x, ny)) this.y = ny;
    else { this.target = null; this.mineAt = null; }
    return false;
  }

  private pickUp() {
    this.mineAt = null;
    this.carried = this.scene.add.image(this.x, this.y - 22, 'shard').setDepth(6090);
    const r = this.scene.replicatorSpot;
    this.target = { x: r.x + (Math.random() - 0.5) * 20, y: r.y + 14 };
    this.state = 'carry';
  }

  private deliver(time: number) {
    const r = this.scene.replicatorSpot;
    const c = this.carried;
    this.carried = undefined;
    if (c) {
      this.scene.tweens.add({
        targets: c, x: r.x, y: r.y - 12, duration: 300, ease: 'Quad.easeIn',
        onComplete: () => { c.destroy(); this.scene.npcDelivered(this, r.x, r.y - 10); },
      });
    }
    this.state = 'idle';
    this.until = time + 1200;
  }

  /** Go and do something by hand (cut a tree, take a build down). Drops whatever it was doing. */
  startChore(c: Chore) {
    if (this.state === 'born' || this.state === 'below') return false;
    if (this.job) { this.scene.village.release(this.job); this.job = null; }
    if (this.carried) { this.carried.destroy(); this.carried = undefined; }
    this.mineAt = null;
    this.chore = c;
    this.target = { x: c.x + (this.x < c.x ? -12 : 12), y: c.y + 3 };
    this.state = 'walk';
    return true;
  }

  /** Drops into the hatch: everything on the surface goes until it comes back up. */
  hideBelow() {
    if (this.job) { this.scene.village.release(this.job); this.job = null; }
    if (this.carried) { this.carried.destroy(); this.carried = undefined; }
    this.chore = null; this.mineAt = null; this.target = null; this.descent = null;
    this.bubble?.destroy(); this.bubble = undefined;
    this.sprite.setVisible(false); this.shadow.setVisible(false); this.gear.image.setVisible(false);
    this.light.active = false;
    this.state = 'below';
  }

  /** Climbs out of the hatch. */
  surface(x: number, y: number) {
    this.x = x; this.y = y;
    this.sprite.setVisible(true); this.shadow.setVisible(true); this.gear.image.setVisible(true);
    this.light.active = true;
    this.state = 'idle';
    this.until = this.scene.time.now + 1200;
    this.nextBuild = this.scene.time.now + 3000;
    this.sync();
    this.hop();
  }

  // --- the copy's voice ---

  private bubble?: Phaser.GameObjects.Container;
  private bubbleUntil = 0;

  /** Every copy sounds like itself: a seed from its id. */
  get voiceSeed() {
    let h = 2166136261;
    for (const c of this.data.id) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
    return h;
  }

  /**
   * Say something out loud: the song plays and a bubble floats over the head. Readable only once the player can
   * hear them; before that the words are runes in the copy's trail color. `silent` shows the bubble without the song
   * (the chorus plays its own sound).
   */
  sing(text: string, readable: boolean, opts: { silent?: boolean; harmony?: boolean; notes?: string } = {}) {
    if (this.state === 'below') { this.scene.warren.view?.sing(this, text, readable, opts); return; } // sung down in the warren
    const sc = this.scene;
    const p = sc.player;
    const dp = Math.hypot(p.x - this.x, p.y - this.y);
    const v = this.data.traits.voice;
    const len = opts.silent ? 2 : (dp < 260 ? sound.sing(this.voiceSeed, text, {
      harmony: opts.harmony, pan: Math.max(-0.7, Math.min(0.7, (this.x - p.x) / 200)), notes: opts.notes,
      instrument: v?.instrument as Instrument | undefined, mood: v?.mood as Mood | undefined, tempo: v?.tempo as Tempo | undefined,
    }) : 0);
    if (this.state === 'idle' || this.state === 'walk' || this.state === 'greet') {
      this.state = 'greet';
      this.until = sc.time.now + Math.max(900, len * 1000);
      this.sprite.setFlipX(p.x < this.x);
      this.hop();
    }
    this.bubble?.destroy();
    this.bubble = makeBubble(sc, text, readable, this.trailColor, this.voiceSeed);
    this.bubbleUntil = sc.time.now + MIND.bubbleMs * (readable ? 0.8 + text.length / 90 : 0.7);
    this.sync();
  }

  /** A letter reached this copy: a small glint over its head. */
  receiveLetter() {
    const p = this.scene.player;
    if (Math.hypot(p.x - this.x, p.y - this.y) < 260) sound.letter();
    this.scene.fx.sparks(this.x, this.y - 18, this.trailColor, 6);
  }

  private updateBubble(time: number) {
    if (!this.bubble) return;
    if (time > this.bubbleUntil) {
      const b = this.bubble;
      this.bubble = undefined;
      this.scene.tweens.add({ targets: b, alpha: 0, y: b.y - 4, duration: 400, onComplete: () => b.destroy() });
    }
  }

  sync() {
    const x = Math.round(this.x), y = Math.round(this.y);
    this.sprite.setPosition(x, y + 3 - Math.round(this.z));
    this.sprite.setDepth(100 + y);
    this.shadow.setPosition(x, y + 2);
    this.carried?.setPosition(x, y - 22 + Math.sin(this.scene.time.now / 200));
    this.light.x = x; this.light.y = y - 9;
    this.gear.sync();
    this.bubble?.setPosition(x, y - 24 - Math.round(this.z));
    this.updateBubble(this.scene.time.now);
  }
}

/** A song bubble: readable words in the pixel font, or runes in the singer's color until the replicant can hear. */
export function makeBubble(sc: Phaser.Scene, text: string, readable: boolean, color: number, seed: number) {
  // bubbleScale shrinks the box (padding, width) rather than the font: the 5x7 font drops rows when scaled
  const k = MIND.bubbleScale;
  const items: Phaser.GameObjects.GameObject[] = [];
  let w: number, h: number;
  if (readable) {
    const t = sc.add.bitmapText(0, -3 + Math.round((1 - k) * 4), 'pixel', text.toUpperCase()).setMaxWidth(Math.round(118 * k)).setTint(PALETTE[20]).setOrigin(0.5, 1).setCenterAlign();
    w = t.width + Math.round(8 * k); h = t.height + Math.round(6 * k);
    items.push(t);
  } else {
    const words = text.split(/\s+/).filter(Boolean).length;
    const n = Math.max(2, Math.min(12, words));
    const g = sc.add.graphics();
    g.fillStyle(color, 1);
    let hh = seed;
    for (let i = 0; i < n; i++) {
      hh = (hh * 1103515245 + 12345) >>> 0;
      const rune = RUNES[hh % RUNES.length];
      const ox = -Math.floor((n * 6) / 2) + i * 6;
      rune.forEach((row, ry) => row.split('').forEach((c, rx) => { if (c === '#') g.fillRect(ox + rx, -9 + ry, 1, 1); }));
    }
    w = n * 6 + Math.round(6 * k); h = Math.round(12 * k);
    items.push(g);
  }
  const box = sc.add.rectangle(0, 0, w, h, PALETTE[25], 0.88).setOrigin(0.5, 1).setStrokeStyle(1, color, 0.9);
  const tail = sc.add.rectangle(0, 1, 2, 2, color, 0.9).setOrigin(0.5, 0);
  const bubble = sc.add.container(0, 0, [box, tail, ...items]).setDepth(6200).setAlpha(0);
  sc.tweens.add({ targets: bubble, alpha: 1, duration: 200 });
  return bubble;
}

/** Little 5x5 runes for songs you cannot read yet. */
const RUNES = [
  ['#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
  ['..#..', '.###.', '#.#.#', '..#..', '..#..'],
  ['#####', '....#', '..##.', '.#...', '#####'],
  ['.###.', '#...#', '#...#', '#...#', '.###.'],
  ['#....', '##...', '#.#..', '#..#.', '#...#'],
  ['..#..', '..#..', '#####', '..#..', '..#..'],
  ['#...#', '#...#', '.###.', '..#..', '..#..'],
  ['.#.#.', '#.#.#', '.#.#.', '#.#.#', '.#.#.'],
  ['#####', '#...#', '#...#', '#...#', '#####'],
  ['....#', '...#.', '..#..', '.#...', '#....'],
];
