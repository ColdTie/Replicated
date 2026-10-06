import Phaser from 'phaser';
import { anim, tex } from '../core/assets';
import { ITEMS, PALETTE } from '../core/data';
import type { Light } from '../fx/Lighting';
import type { PlanetScene } from '../scenes/PlanetScene';
import { flashWhite } from './Player';

const EMBER = ITEMS.ember;

/** Glowing crystal cluster. Hit it to chip off shards; the last hit shatters it. */
export class CrystalNode {
  readonly zone: Phaser.GameObjects.Zone;
  readonly sprite: Phaser.GameObjects.Sprite;
  private glow: Phaser.GameObjects.Image;
  private light: Light;
  hits = 0;

  constructor(private scene: PlanetScene, readonly x: number, readonly y: number, readonly index: number, startHits = 0) {
    this.zone = scene.add.zone(x, y - 2, 12, 7);
    scene.physics.add.existing(this.zone, true);
    this.sprite = scene.add.sprite(x, y + 2, tex(EMBER.nodeSprite, scene.planet.id), 0).setOrigin(0.5, 1).setDepth(100 + y);
    this.glow = scene.add.image(x, y - 7, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(PALETTE[9]).setAlpha(0.22).setScale(0.7).setDepth(6100);
    this.light = scene.lighting.add({ x, y: y - 6, radius: 46, color: PALETTE[9], intensity: 0.85, flicker: 0.25 });
    scene.tweens.add({ targets: this.glow, alpha: 0.12, duration: 1400 + Math.random() * 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.hits = Math.min(startHits, EMBER.nodeHits);
    if (this.hits) this.applyStage(false);
  }

  /** Visuals for the current damage stage (used on hit and when restoring a save). */
  private applyStage(animate: boolean) {
    this.sprite.setFrame(Math.min(3, this.hits));
    const left = 1 - this.hits / EMBER.nodeHits;
    this.light.radius = 20 + 26 * left;
    this.light.intensity = 0.4 + 0.45 * left;
    if (this.alive) return;
    (this.zone.body as Phaser.Physics.Arcade.StaticBody).enable = false;
    this.scene.tweens.killTweensOf(this.glow);
    if (!animate) {
      this.glow.setAlpha(0);
      this.light.intensity = 0.15;
      this.light.radius = 16;
      return;
    }
    this.scene.fx.sparks(this.x, this.y - 8, PALETTE[11], 16);
    this.scene.tweens.add({ targets: this.glow, alpha: 0, duration: 500 });
    this.scene.tweens.add({ targets: this.light, intensity: 0.15, radius: 16, duration: 800 });
  }

  get alive() { return this.hits < EMBER.nodeHits; }

  hit(dir: Phaser.Math.Vector2) {
    if (!this.alive) return;
    this.hits++;
    flashWhite(this.scene, this.sprite, 70);
    this.scene.tweens.add({ targets: this.sprite, x: this.x + dir.x * 2, duration: 40, yoyo: true, repeat: 1 });
    this.scene.fx.sparks(this.x, this.y - 8, PALETTE[10], 8);
    const drops = this.alive ? EMBER.nodeDropsPerHit : EMBER.nodeDropsOnBreak;
    for (let i = 0; i < drops; i++) this.scene.spawnShard(this.x, this.y - 4, dir);
    this.applyStage(true);
    this.scene.onNodeHit(this);
  }
}

/** Ember shard pickup: pops out, bobs, then flies to the player once close. In flight it shimmers in a shifting
 *  rainbow and passes through anything in the way; just before it reaches you it glitches like a bad teleport
 *  (jitter, flicker, a red/cyan split and static pixels). */
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

  constructor(private scene: PlanetScene, x: number, y: number, dir?: Phaser.Math.Vector2) {
    this.x = x; this.y = y;
    const a = (dir ? Math.atan2(dir.y, dir.x) : Math.random() * Math.PI * 2) + (Math.random() - 0.5) * 2.2;
    const sp = 40 + Math.random() * 45;
    this.vx = Math.cos(a) * sp;
    this.vy = Math.sin(a) * sp;
    this.vz = 70 + Math.random() * 40;
    this.sprite = scene.add.sprite(x, y, 'shard').setOrigin(0.5, 0.5);
    this.sprite.play({ key: anim('shard', 'twinkle'), startFrame: Math.floor(Math.random() * 6) });
    this.glow = scene.add.image(x, y, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(PALETTE[9]).setAlpha(0.3).setScale(0.35).setDepth(6100);
    // chromatic-split ghosts, only shown during the glitch right before pickup
    this.ghosts = [0xff3060, 0x30f0ff].map((c) => scene.add.image(x, y, 'shard').setTintFill(c).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0).setDepth(6140));
    this.light = scene.lighting.add({ x, y, radius: 16, color: PALETTE[9], intensity: 0.7 });
    this.readyAt = scene.time.now + 450;
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
        this.vz -= 320 * s;
        this.z = Math.max(0, this.z + this.vz * s);
        if (this.z === 0) { this.vz = Math.abs(this.vz) > 30 ? -this.vz * 0.4 : 0; }
      }
      this.vx *= Math.pow(0.02, s);
      this.vy *= Math.pow(0.02, s);
      const nx = this.x + this.vx * s, ny = this.y + this.vy * s;
      if (this.scene.isWalkable(nx, this.y)) this.x = nx; else this.vx *= -0.5;
      if (this.scene.isWalkable(this.x, ny)) this.y = ny; else this.vy *= -0.5;
    }

    const bob = !this.homing && this.z === 0 && this.vz === 0 ? Math.sin(time / 260 + this.x) * 1.5 + 2 : 0;
    let rx = Math.round(this.x), ry = Math.round(this.y - this.z - bob);
    this.sprite.setDepth(100 + this.y + (this.homing ? 30 : 0));

    if (this.homing) this.glitchLook(time, d, rx, ry);
    else {
      this.sprite.clearTint().setAlpha(1).setScale(1);
      for (const g of this.ghosts) g.setAlpha(0);
    }
    if (this.homing && d < 26) {
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
    this.teleportFlash();
    this.scene.collectShard(this.x, this.y);
    this.destroy();
  }

  destroy() {
    this.sprite.destroy();
    this.glow.destroy();
    for (const g of this.ghosts) g.destroy();
    this.scene.lighting.remove(this.light);
  }
}
