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

  constructor(private scene: PlanetScene, readonly x: number, readonly y: number) {
    this.zone = scene.add.zone(x, y - 2, 12, 7);
    scene.physics.add.existing(this.zone, true);
    this.sprite = scene.add.sprite(x, y + 2, tex(EMBER.nodeSprite, scene.planet.id), 0).setOrigin(0.5, 1).setDepth(100 + y);
    this.glow = scene.add.image(x, y - 7, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(PALETTE[9]).setAlpha(0.22).setScale(0.7).setDepth(6100);
    this.light = scene.lighting.add({ x, y: y - 6, radius: 46, color: PALETTE[9], intensity: 0.85, flicker: 0.25 });
    scene.tweens.add({ targets: this.glow, alpha: 0.12, duration: 1400 + Math.random() * 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
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
    this.sprite.setFrame(Math.min(3, this.hits));
    const left = 1 - this.hits / EMBER.nodeHits;
    this.light.radius = 20 + 26 * left;
    this.light.intensity = 0.4 + 0.45 * left;
    if (!this.alive) {
      (this.zone.body as Phaser.Physics.Arcade.StaticBody).enable = false;
      this.scene.fx.sparks(this.x, this.y - 8, PALETTE[11], 16);
      this.scene.tweens.killTweensOf(this.glow);
      this.scene.tweens.add({ targets: this.glow, alpha: 0, duration: 500 });
      this.scene.tweens.add({ targets: this.light, intensity: 0.15, radius: 16, duration: 800 });
    }
  }
}

/** Ember shard pickup: pops out, bobs, gets pulled toward the player. */
export class Shard {
  readonly sprite: Phaser.GameObjects.Sprite;
  private glow: Phaser.GameObjects.Image;
  private light: Light;
  private readyAt: number;
  private vx = 0;
  private vy = 0;
  private z = 0;
  private vz = 0;
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
    this.light = scene.lighting.add({ x, y, radius: 16, color: PALETTE[9], intensity: 0.7 });
    this.readyAt = scene.time.now + 450;
  }

  update(time: number, dt: number) {
    const s = dt / 1000;
    const p = this.scene.player;
    // bounce on the ground
    if (this.z > 0 || this.vz > 0) {
      this.vz -= 320 * s;
      this.z = Math.max(0, this.z + this.vz * s);
      if (this.z === 0) { this.vz = Math.abs(this.vz) > 30 ? -this.vz * 0.4 : 0; }
    }
    const dx = p.x - this.x, dy = p.y - 4 - this.y, d = Math.hypot(dx, dy);
    if (time > this.readyAt && p.alive && d < EMBER.magnetRange) {
      const pull = 1400 * s;
      this.vx = (this.vx + (dx / d) * pull) * 0.9;
      this.vy = (this.vy + (dy / d) * pull) * 0.9;
      if (d < 7) { this.collect(); return; }
    } else {
      this.vx *= Math.pow(0.02, s);
      this.vy *= Math.pow(0.02, s);
    }
    const nx = this.x + this.vx * s, ny = this.y + this.vy * s;
    if (this.scene.isWalkable(nx, this.y)) this.x = nx; else this.vx *= -0.5;
    if (this.scene.isWalkable(this.x, ny)) this.y = ny; else this.vy *= -0.5;
    const bob = this.z === 0 && this.vz === 0 ? Math.sin(time / 260 + this.x) * 1.5 + 2 : 0;
    const ry = Math.round(this.y - this.z - bob);
    this.sprite.setPosition(Math.round(this.x), ry).setDepth(100 + this.y);
    this.glow.setPosition(Math.round(this.x), ry);
    this.light.x = this.x; this.light.y = ry;
  }

  private collect() {
    this.collected = true;
    this.scene.collectShard(this.x, this.y);
    this.destroy();
  }

  destroy() {
    this.sprite.destroy();
    this.glow.destroy();
    this.scene.lighting.remove(this.light);
  }
}
