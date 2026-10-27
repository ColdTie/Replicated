import Phaser from 'phaser';
import { anim, tex } from '../core/assets';
import { BEACON, ITEMS, PALETTE } from '../core/data';
import type { Light } from '../fx/Lighting';
import type { PlanetScene } from '../scenes/PlanetScene';
import { flashWhite } from './Player';

const EMBER = ITEMS.ember;

/** What a node gives: an Ember crystal, iron ore, a hydrogen vent, a salt bloom, quartz or copper ore (items.json). */
export type NodeKind = 'ember' | 'iron' | 'hydrogen' | 'salt' | 'quartz' | 'copper';
/** The kinds that go into the world's store (all but Ember, which has its own pool). */
export type StoreKind = Exclude<NodeKind, 'ember'>;
type NodeDef = { hits: number; perHit: number; onBreak: number; glow: number; spark: [number, number]; sprite: string; tinted: boolean };
const fromItems = (k: StoreKind): NodeDef => {
  const it = ITEMS[k];
  return { hits: it.nodeHits, perHit: it.nodeDropsPerHit, onBreak: it.nodeDropsOnBreak, glow: PALETTE[it.glow], spark: [PALETTE[it.spark[0]], PALETTE[it.spark[1]]], sprite: it.nodeSprite, tinted: false };
};
/** How hard each kind is to break, what it drops, and how it shines. */
export const NODE: Record<NodeKind, NodeDef> = {
  ember: { hits: EMBER.nodeHits, perHit: EMBER.nodeDropsPerHit, onBreak: EMBER.nodeDropsOnBreak, glow: PALETTE[9], spark: [PALETTE[10], PALETTE[11]], sprite: EMBER.nodeSprite, tinted: true },
  iron: fromItems('iron'), hydrogen: fromItems('hydrogen'), salt: fromItems('salt'), quartz: fromItems('quartz'), copper: fromItems('copper'),
};
/** Hard ones (metal and stone) shine less and glint now and then; salt and quartz glint and sparkle. */
const HARD: NodeKind[] = ['iron', 'copper', 'salt', 'quartz'];

/** A resource node. Hit it to chip off pickups; the last hit breaks it. An Ember crystal glows warm; iron ore is dark
 *  rusted metal that glints now and then; a hydrogen vent holds a pink bubble of gas and lets smaller ones rise; a salt
 *  bloom sparkles white; quartz throws a little rainbow along its prisms; copper ore shows a warm glint in its cracks. */
export class CrystalNode {
  readonly zone: Phaser.GameObjects.Zone;
  readonly sprite: Phaser.GameObjects.Sprite;
  private glow: Phaser.GameObjects.Image;
  private light: Light;
  private bubbles?: Phaser.GameObjects.Particles.ParticleEmitter;
  private def: (typeof NODE)[NodeKind];
  hits = 0;

  /** saved under this key in planet_states.data.nodes (the generated nodes by index; the Cem bed's blooms by name) */
  readonly key: string;

  constructor(private scene: PlanetScene, readonly x: number, readonly y: number, readonly index: number, startHits = 0, readonly kind: NodeKind = 'ember', key?: string) {
    this.key = key ?? String(index);
    const d = this.def = NODE[kind];
    this.zone = scene.add.zone(x, y - 2, 12, 7);
    scene.physics.add.existing(this.zone, true);
    this.sprite = scene.add.sprite(x, y + 2, d.tinted ? tex(d.sprite, scene.planet.id) : d.sprite, 0).setOrigin(0.5, 1).setDepth(100 + y);
    const metal = HARD.includes(kind);
    this.glow = scene.add.image(x, y - 7, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(d.glow).setAlpha(metal ? 0.1 : 0.22).setScale(metal ? 0.5 : 0.7).setDepth(6100);
    this.light = scene.lighting.add({ x, y: y - 6, radius: metal ? 30 : 46, color: d.glow, intensity: metal ? 0.5 : 0.85, flicker: metal ? 0.05 : 0.25 });
    scene.tweens.add({ targets: this.glow, alpha: metal ? 0.04 : 0.12, duration: 1400 + Math.random() * 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    if (kind === 'hydrogen') {
      // small bubbles of gas leave the vent and rise, fading
      this.bubbles = scene.add.particles(x, y - 5, 'px', {
        frequency: 420 + Math.random() * 200, lifespan: { min: 900, max: 1500 }, speedY: { min: -16, max: -8 }, speedX: { min: -4, max: 4 },
        scale: { start: 0.9, end: 0.3 }, alpha: { start: 0.85, end: 0 }, tint: [PALETTE[29], PALETTE[28], PALETTE[19]], blendMode: Phaser.BlendModes.ADD,
      }).setDepth(6090);
    }
    if (metal) {
      // a glint runs over it every few seconds: cold on iron, warm on copper, a white sparkle on salt, a rainbow on quartz
      scene.time.addEvent({ delay: (kind === 'salt' ? 900 : 1800) + Math.random() * 2400, loop: true, callback: () => {
        const p = scene.player;
        if (!this.alive || !p || Math.hypot(p.x - x, p.y - y) > 260) return;
        if (kind === 'quartz') { this.rainbow(); return; }
        const g = scene.add.image(x - 3 + Math.round(Math.random() * 6), y - 6 - Math.round(Math.random() * 4), 'px1').setDepth(6150).setBlendMode(Phaser.BlendModes.ADD).setScale(1);
        if (kind === 'copper') g.setTint(PALETTE[10]);
        if (kind === 'salt') { g.setScale(1); scene.tweens.add({ targets: g, scale: { from: 2, to: 0.5 }, alpha: { from: 1, to: 0 }, duration: 380, ease: 'Sine.easeOut', onComplete: () => g.destroy() }); return; }
        scene.tweens.add({ targets: g, scaleX: 5, alpha: { from: 1, to: 0 }, duration: 260, ease: 'Quad.easeOut', onComplete: () => g.destroy() });
      } });
    }
    this.hits = Math.min(startHits, d.hits);
    if (this.hits) this.applyStage(false);
  }

  /** Light running up a quartz prism: a short stack of rainbow pixels that rises and fades. */
  private rainbow() {
    const s = this.scene, x = this.x - 2 + Math.round(Math.random() * 4);
    [26, 9, 11, 12, 18, 28].forEach((c, k) => {
      const px = s.add.rectangle(x, this.y - 3 - k, 1, 1, PALETTE[c]).setDepth(6150).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
      s.tweens.add({ targets: px, alpha: { from: 0.9, to: 0 }, y: px.y - 3, delay: k * 45, duration: 420, onComplete: () => px.destroy() });
    });
  }

  /** Visuals for the current damage stage (used on hit and when restoring a save). */
  private applyStage(animate: boolean) {
    this.sprite.setFrame(Math.min(3, Math.round(this.hits / this.def.hits * 3)));
    const left = 1 - this.hits / this.def.hits;
    const metal = HARD.includes(this.kind);
    this.light.radius = (metal ? 14 : 20) + (metal ? 16 : 26) * left;
    this.light.intensity = (metal ? 0.25 : 0.4) + (metal ? 0.25 : 0.45) * left;
    if (this.alive) this.bubbles?.setFrequency(420 + 700 * (1 - left));
    if (this.alive) return;
    (this.zone.body as Phaser.Physics.Arcade.StaticBody).enable = false;
    this.scene.tweens.killTweensOf(this.glow);
    this.bubbles?.stop();
    if (!animate) {
      this.glow.setAlpha(0);
      this.light.intensity = 0.15;
      this.light.radius = 16;
      return;
    }
    this.scene.fx.sparks(this.x, this.y - 8, this.def.spark[1], 16);
    this.scene.tweens.add({ targets: this.glow, alpha: 0, duration: 500 });
    this.scene.tweens.add({ targets: this.light, intensity: 0.15, radius: 16, duration: 800 });
  }

  get alive() { return this.hits < this.def.hits; }

  hit(dir: Phaser.Math.Vector2) {
    if (!this.alive) return;
    this.hits++;
    flashWhite(this.scene, this.sprite, 70);
    this.scene.tweens.add({ targets: this.sprite, x: this.x + dir.x * 2, duration: 40, yoyo: true, repeat: 1 });
    this.scene.fx.sparks(this.x, this.y - 8, this.def.spark[0], 8);
    const drops = this.alive ? this.def.perHit : this.def.onBreak;
    for (let i = 0; i < drops; i++) this.scene.spawnShard(this.x, this.y - 4, dir, this.kind);
    this.applyStage(true);
    this.scene.onNodeHit(this);
  }
}

/** A pickup: pops out, bobs, then flies to the player once close. An Ember shard shimmers in a shifting rainbow in
 *  flight and passes through anything in the way; just before it reaches you it glitches like a bad teleport (jitter,
 *  flicker, a red/cyan split and static pixels). Iron falls heavy and gleams; hydrogen floats up and drifts. */
export class Shard {
  readonly sprite: Phaser.GameObjects.Sprite;
  private glow: Phaser.GameObjects.Image;
  private ghosts: Phaser.GameObjects.Image[];
  private light: Light;
  private readyAt: number;
  private vx = 0;
  private vy = 0;
  private z = 0;
  private vz = 0;
  /** once a shard starts flying to the player it keeps going, through walls, until collected */
  private homing = false;
  private hue = Math.random() * 360;
  private nextStatic = 0;
  collected = false;
  x: number;
  y: number;

  /** how strongly it falls back to the ground (hydrogen hardly does) */
  private gravity = 320;

  constructor(private scene: PlanetScene, x: number, y: number, dir?: Phaser.Math.Vector2, readonly kind: NodeKind = 'ember') {
    this.x = x; this.y = y;
    const a = (dir ? Math.atan2(dir.y, dir.x) : Math.random() * Math.PI * 2) + (Math.random() - 0.5) * 2.2;
    const sp = (kind === 'iron' || kind === 'copper' ? 30 : 40) + Math.random() * 45;
    this.vx = Math.cos(a) * sp;
    this.vy = Math.sin(a) * sp;
    this.vz = 70 + Math.random() * 40;
    if (kind === 'hydrogen') { this.gravity = 60; this.vz = 30 + Math.random() * 20; }
    const key = kind === 'ember' ? 'shard' : ITEMS[kind].sprite;
    const color = NODE[kind].glow;
    this.sprite = scene.add.sprite(x, y, key).setOrigin(0.5, 0.5);
    this.sprite.play({ key: anim(key, 'twinkle'), startFrame: Math.floor(Math.random() * 3) });
    this.glow = scene.add.image(x, y, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(color).setAlpha(kind === 'iron' || kind === 'copper' ? 0.15 : 0.3).setScale(0.35).setDepth(6100);
    // chromatic-split ghosts, only shown during the glitch right before pickup
    this.ghosts = kind === 'ember' ? [0xff3060, 0x30f0ff].map((c) => scene.add.image(x, y, 'shard').setTintFill(c).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0).setDepth(6140)) : [];
    this.light = scene.lighting.add({ x, y, radius: 16, color, intensity: kind === 'iron' || kind === 'copper' ? 0.4 : 0.7 });
    this.readyAt = scene.time.now + EMBER.pickupDelayMs;
  }

  update(time: number, dt: number) {
    const s = dt / 1000;
    const p = this.scene.player;
    const dx = p.x - this.x, dy = p.y - 4 - this.y, d = Math.hypot(dx, dy);
    if (!this.homing && time > this.readyAt && p.alive && d < EMBER.magnetRange) this.homing = true;
    if (this.homing && !p.alive) this.homing = false;

    if (this.homing) {
      // fly: rise a little off the ground and home in, ignoring walls, rocks and trees
      this.vz = 0;
      this.z += (6 - this.z) * Math.min(1, s * 10);
      const pull = EMBER.magnetPull * s;
      this.vx = (this.vx + (dx / d) * pull) * 0.9;
      this.vy = (this.vy + (dy / d) * pull) * 0.9;
      this.x += this.vx * s;
      this.y += this.vy * s;
      if (d < 7) { this.collect(); return; }
    } else {
      // bounce on the ground and slide to a stop
      if (this.z > 0 || this.vz > 0) {
        this.vz -= this.gravity * s;
        this.z = Math.max(0, this.z + this.vz * s);
        if (this.z === 0) { this.vz = Math.abs(this.vz) > 30 ? -this.vz * 0.4 : 0; }
      }
      this.vx *= Math.pow(0.02, s);
      this.vy *= Math.pow(0.02, s);
      const nx = this.x + this.vx * s, ny = this.y + this.vy * s;
      if (this.scene.isWalkable(nx, this.y)) this.x = nx; else this.vx *= -0.5;
      if (this.scene.isWalkable(this.x, ny)) this.y = ny; else this.vy *= -0.5;
    }

    // hydrogen hovers higher and sways; iron lies still
    const resting = !this.homing && this.z === 0 && this.vz === 0;
    const bob = !resting ? 0 : this.kind === 'hydrogen' ? Math.sin(time / 380 + this.x) * 2.5 + 6 : this.kind === 'iron' || this.kind === 'copper' ? 0 : Math.sin(time / 260 + this.x) * 1.5 + 2;
    let rx = Math.round(this.x + (resting && this.kind === 'hydrogen' ? Math.sin(time / 610 + this.y) * 1.5 : 0)), ry = Math.round(this.y - this.z - bob);
    this.sprite.setDepth(100 + this.y + (this.homing ? 30 : 0));

    if (this.homing && this.kind === 'ember') this.glitchLook(time, d, rx, ry);
    else {
      this.sprite.clearTint().setAlpha(1).setScale(1);
      for (const g of this.ghosts) g.setAlpha(0);
    }
    if (this.homing && d < 26 && this.kind === 'ember') {
      // teleport jitter right before pickup
      const t = 1 - d / 26;
      rx += Math.round((Math.random() * 2 - 1) * (1 + 2 * t));
      ry += Math.round((Math.random() * 2 - 1) * t);
    }
    this.sprite.setPosition(rx, ry);
    this.glow.setPosition(rx, ry);
    this.light.x = rx; this.light.y = ry;
  }

  /** Shifting rainbow while flying; static, flicker and a red/cyan split once it is close. */
  private glitchLook(time: number, d: number, x: number, y: number) {
    this.hue = (this.hue + 7) % 360;
    const c = (h: number) => Phaser.Display.Color.HSVToRGB(((h % 360) + 360) % 360 / 360, 0.75, 1) as Phaser.Types.Display.ColorObject;
    const col = (h: number) => Phaser.Display.Color.GetColor(c(h).r, c(h).g, c(h).b);
    // each corner a different hue: a weird oily rainbow that rolls across the shard
    this.sprite.setTint(col(this.hue), col(this.hue + 90), col(this.hue + 270), col(this.hue + 180));
    this.glow.setTint(col(this.hue)).setAlpha(0.4);
    this.light.color = col(this.hue);

    const t = Math.max(0, 1 - d / 26);
    if (t <= 0) {
      this.sprite.setAlpha(1).setScale(1);
      for (const g of this.ghosts) g.setAlpha(0);
      return;
    }
    // flicker in and out, stretch sideways like a scanline tear
    this.sprite.setAlpha(Math.random() < 0.3 * t ? 0.25 : 1);
    this.sprite.setScale(1 + Math.random() * 0.9 * t, 1 - 0.35 * t);
    const split = Math.round(1 + 4 * t);
    this.ghosts[0].setPosition(x - split, y).setAlpha(0.55 * t).setScale(this.sprite.scaleX, this.sprite.scaleY);
    this.ghosts[1].setPosition(x + split, y).setAlpha(0.55 * t).setScale(this.sprite.scaleX, this.sprite.scaleY);
    // static: single rainbow pixels crackling around it
    if (time > this.nextStatic) {
      this.nextStatic = time + 35;
      for (let i = 0; i < 1 + Math.round(2 * t); i++) {
        const px = this.scene.add.rectangle(x + Math.round((Math.random() - 0.5) * 14), y + Math.round((Math.random() - 0.5) * 10), 1, 1, col(this.hue + Math.random() * 360))
          .setDepth(6150).setBlendMode(Phaser.BlendModes.ADD);
        this.scene.tweens.add({ targets: px, alpha: 0, duration: 90 + Math.random() * 80, onComplete: () => px.destroy() });
      }
    }
  }

  /** The "arrives through the teleporter" flash at the player. */
  private teleportFlash() {
    const sc = this.scene, x = Math.round(this.x), y = Math.round(this.y - this.z);
    const line = sc.add.rectangle(x, y, 6, 1, 0xffffff).setDepth(6160).setBlendMode(Phaser.BlendModes.ADD);
    sc.tweens.add({ targets: line, scaleX: 3.5, alpha: 0, duration: 140, ease: 'Quad.easeOut', onComplete: () => line.destroy() });
    for (let i = 0; i < 6; i++) {
      const h = (this.hue + i * 60) % 360;
      const c = Phaser.Display.Color.HSVToRGB(h / 360, 0.75, 1) as Phaser.Types.Display.ColorObject;
      const px = sc.add.rectangle(x, y, 1, 1, Phaser.Display.Color.GetColor(c.r, c.g, c.b)).setDepth(6160).setBlendMode(Phaser.BlendModes.ADD);
      sc.tweens.add({ targets: px, x: x + (Math.random() - 0.5) * 18, y: y + (Math.random() - 0.5) * 6, alpha: 0, duration: 160, onComplete: () => px.destroy() });
    }
  }

  private collect() {
    this.collected = true;
    if (this.kind === 'ember') this.teleportFlash();
    this.scene.collectShard(this.x, this.y, this.kind);
    this.destroy();
  }

  destroy() {
    this.sprite.destroy();
    this.glow.destroy();
    for (const g of this.ghosts) g.destroy();
    this.scene.lighting.remove(this.light);
  }
}

const SPARK = BEACON.spark;

/** A Spark: the rare white light a lit beacon leaves behind. Pops out, settles, hovers and twinkles; walk up
 *  to it and it flies to you. */
export class Spark {
  readonly sprite: Phaser.GameObjects.Sprite;
  private glow: Phaser.GameObjects.Image;
  private light: Light;
  private readyAt: number;
  private vx: number;
  private vy: number;
  private vz = 90;
  private z = 0;
  private homing = false;
  collected = false;
  x: number;
  y: number;

  constructor(private scene: PlanetScene, x: number, y: number) {
    this.x = x; this.y = y;
    const a = Math.random() * Math.PI * 2;
    this.vx = Math.cos(a) * 30; this.vy = Math.sin(a) * 30;
    this.sprite = scene.add.sprite(x, y, SPARK.sprite).setDepth(6090);
    this.sprite.play(anim(SPARK.sprite, 'twinkle'));
    this.glow = scene.add.image(x, y, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(0x9fe8ff).setAlpha(0.4).setScale(0.8).setDepth(6100);
    scene.tweens.add({ targets: this.glow, alpha: 0.25, scale: 0.6, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.light = scene.lighting.add({ x, y, radius: 54, color: 0xbff8ff, intensity: 1, flicker: 0.15 });
    this.readyAt = scene.time.now + SPARK.pickupDelayMs;
  }

  update(time: number, dt: number) {
    const s = dt / 1000;
    const p = this.scene.player;
    const dx = p.x - this.x, dy = p.y - 6 - this.y, d = Math.hypot(dx, dy);
    if (!this.homing && time > this.readyAt && p.alive && !p.locked && d < SPARK.magnetRange) this.homing = true;
    if (this.homing) {
      this.z += (8 - this.z) * Math.min(1, s * 8);
      const pull = SPARK.magnetPull * s;
      this.vx = (this.vx + (dx / d) * pull) * 0.88;
      this.vy = (this.vy + (dy / d) * pull) * 0.88;
      this.x += this.vx * s; this.y += this.vy * s;
      if (d < 8) { this.collect(); return; }
    } else {
      if (this.z > 0 || this.vz > 0) {
        this.vz -= 300 * s;
        this.z = Math.max(0, this.z + this.vz * s);
        if (this.z === 0) this.vz = Math.abs(this.vz) > 30 ? -this.vz * 0.35 : 0;
      }
      this.vx *= Math.pow(0.02, s); this.vy *= Math.pow(0.02, s);
      const nx = this.x + this.vx * s, ny = this.y + this.vy * s;
      if (this.scene.isWalkable(nx, this.y)) this.x = nx; else this.vx *= -0.5;
      if (this.scene.isWalkable(this.x, ny)) this.y = ny; else this.vy *= -0.5;
    }
    const hover = !this.homing && this.z === 0 ? 6 + Math.sin(time / 320) * 2.5 : 0;
    const rx = Math.round(this.x), ry = Math.round(this.y - this.z - hover);
    this.sprite.setPosition(rx, ry);
    this.glow.setPosition(rx, ry);
    this.light.x = rx; this.light.y = ry;
  }

  private collect() {
    this.collected = true;
    this.scene.fx.sparks(this.x, this.y - 6, PALETTE[19], 18);
    this.scene.fx.sparks(this.x, this.y - 6, PALETTE[18], 10);
    this.scene.collectSpark(this.x, this.y);
    this.sprite.destroy();
    this.scene.tweens.killTweensOf(this.glow);
    this.scene.tweens.add({ targets: this.glow, alpha: 0, scale: 2.5, duration: 350, onComplete: () => this.glow.destroy() });
    this.scene.tweens.add({ targets: this.light, intensity: 0, radius: 120, duration: 400, onComplete: () => this.scene.lighting.remove(this.light) });
  }
}
