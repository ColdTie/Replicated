import Phaser from 'phaser';
import { sound } from '../audio/Sound';
import { anim, tex } from '../core/assets';
import { PALETTE, type SpitterDef } from '../core/data';
import type { Light } from '../fx/Lighting';
import type { PlanetScene } from '../scenes/PlanetScene';
import type { Enemy } from './Enemy';
import { flashWhite, squash } from './Player';

type State = 'idle' | 'windup' | 'cooldown' | 'dead';

/** Rooted spore plant: swells up (mouth glows), then spits a slow spore. Hit the spore to bat it back. */
export class Spitter implements Enemy {
  readonly zone: Phaser.GameObjects.Zone;
  readonly body: Phaser.Physics.Arcade.Body;
  readonly sprite: Phaser.GameObjects.Sprite;
  private shadow: Phaser.GameObjects.Image;
  private mouth: Light;
  private texKey: string;
  hp: number;
  state: State = 'idle';
  private stateUntil = 0;

  constructor(private scene: PlanetScene, readonly def: SpitterDef, readonly homeX: number, readonly homeY: number) {
    this.texKey = tex(def.sprite, scene.planet.id);
    this.zone = scene.add.zone(homeX, homeY, 10, 6);
    scene.physics.add.existing(this.zone);
    this.body = this.zone.body as Phaser.Physics.Arcade.Body;
    this.body.setImmovable(true);
    this.shadow = scene.add.image(homeX, homeY, 'shadow').setAlpha(0.45).setTint(PALETTE[25]).setDepth(50).setScale(1.2, 1);
    this.sprite = scene.add.sprite(homeX, homeY, this.texKey).setOrigin(0.5, 1);
    this.sprite.play(anim(this.texKey, 'idle'));
    this.mouth = scene.lighting.add({ x: homeX, y: homeY, radius: 14, color: PALETTE[8], intensity: 0.5 });
    this.hp = def.hp;
    this.stateUntil = Math.random() * def.cooldownMs;
  }

  get x() { return this.body.center.x; }
  get y() { return this.body.center.y; }
  get alive() { return this.state !== 'dead'; }

  update(time: number) {
    if (this.state === 'dead') return;
    this.body.setVelocity(0, 0);
    const p = this.scene.player;
    const dist = Math.hypot(p.x - this.x, p.y - this.y);
    const canSee = p.alive && !p.locked && dist < this.def.fireRange;
    if (this.state === 'idle' && canSee && time > this.stateUntil) {
      this.state = 'windup';
      this.stateUntil = time + this.def.windupMs;
      this.sprite.play(anim(this.texKey, 'windup'));
      this.scene.tweens.add({ targets: this.sprite, scaleX: 1.2, scaleY: 0.85, duration: this.def.windupMs, ease: 'Sine.easeIn' });
      sound.windup();
    } else if (this.state === 'windup' && time > this.stateUntil) {
      this.fire();
      this.state = 'cooldown';
      this.stateUntil = time + this.def.cooldownMs;
    } else if (this.state === 'cooldown' && time > this.stateUntil) {
      this.state = 'idle';
      this.sprite.play(anim(this.texKey, 'idle'));
    }
    this.mouth.color = this.state === 'windup' ? PALETTE[11] : PALETTE[8];
    this.mouth.intensity = this.state === 'windup' ? 1 : 0.5;
    this.sync();
  }

  private fire() {
    const p = this.scene.player;
    const dir = new Phaser.Math.Vector2(p.x - this.x, p.y - 6 - (this.y - 8)).normalize();
    squash(this.scene, this.sprite, 0.8, 1.3, 120);
    this.scene.spawnSpore(this.x + dir.x * 6, this.y - 8 + dir.y * 4, dir.scale(this.def.shotSpeed));
    sound.spit();
  }

  hit(damage: number, dir: Phaser.Math.Vector2) {
    if (this.state === 'dead') return;
    this.hp -= damage;
    flashWhite(this.scene, this.sprite, 80);
    squash(this.scene, this.sprite, 1.3, 0.75, 100);
    this.scene.fx.sparks(this.x, this.y - 6, PALETTE[19], 6);
    if (this.state === 'windup') { this.state = 'cooldown'; this.stateUntil = this.scene.time.now + this.def.cooldownMs; this.sprite.play(anim(this.texKey, 'idle')); }
    if (this.hp <= 0) this.die(dir);
  }

  private die(dir: Phaser.Math.Vector2) {
    this.state = 'dead';
    this.body.enable = false;
    const x = this.x, y = this.y;
    this.scene.fx.debris(x, y - 6, 16);
    this.scene.onEnemyKilled(this);
    this.scene.time.delayedCall(110, () => {
      for (let i = 0; i < (this.def.drops.ember ?? 0); i++) this.scene.spawnShard(x, y, dir);
    });
    this.scene.tweens.killTweensOf(this.sprite);
    this.scene.tweens.add({
      targets: this.sprite, alpha: 0, scaleX: 0.3, scaleY: 1.4, duration: 300, ease: 'Quad.easeIn',
      onComplete: () => { this.sprite.setVisible(false); this.shadow.setVisible(false); },
    });
    this.mouth.active = false;
    this.scene.time.delayedCall(this.def.respawnMs, () => this.tryRespawn());
  }

  private tryRespawn() {
    const p = this.scene.player;
    if (Math.hypot(p.x - this.homeX, p.y - this.homeY) < 200) {
      this.scene.time.delayedCall(4000, () => this.tryRespawn());
      return;
    }
    this.hp = this.def.hp;
    this.state = 'idle';
    this.body.enable = true;
    this.body.reset(this.homeX, this.homeY);
    this.sprite.setVisible(true).setAlpha(1).setScale(1).play(anim(this.texKey, 'idle'));
    this.shadow.setVisible(true);
    this.mouth.active = true;
  }

  sync() {
    const x = Math.round(this.x), y = Math.round(this.y);
    this.sprite.setPosition(x, y + 4).setDepth(100 + y);
    if (this.state !== 'windup' && !this.scene.tweens.isTweening(this.sprite)) this.sprite.setScale(1);
    this.shadow.setPosition(x, y + 3);
    this.mouth.x = x;
    this.mouth.y = y - 6;
  }
}

/** A slow glowing spore. Batted back by an attack, it flies faster and hurts creatures instead. */
export class Spore {
  readonly sprite: Phaser.GameObjects.Sprite;
  private glow: Phaser.GameObjects.Image;
  private light: Light;
  reflected = false;
  dead = false;
  private bornAt: number;

  constructor(private scene: PlanetScene, public x: number, public y: number, readonly v: Phaser.Math.Vector2, private lifeMs: number) {
    this.sprite = scene.add.sprite(x, y, 'spore').play('spore:spin').setDepth(6090);
    this.glow = scene.add.image(x, y, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(PALETTE[8]).setAlpha(0.3).setScale(0.35).setDepth(6100);
    this.light = scene.lighting.add({ x, y, radius: 22, color: PALETTE[10], intensity: 0.8 });
    this.bornAt = scene.time.now;
  }

  reflect(dir: Phaser.Math.Vector2, color: number) {
    if (this.reflected) return;
    this.reflected = true;
    const speed = this.v.length() * 2.2;
    this.v.set(dir.x * speed, dir.y * speed);
    this.sprite.setTint(color);
    this.glow.setTint(color).setScale(0.5);
    this.light.color = color;
    this.bornAt = this.scene.time.now;
    sound.reflect();
  }

  update(time: number, dt: number) {
    if (this.dead) return;
    this.x += this.v.x * dt / 1000;
    this.y += this.v.y * dt / 1000;
    this.sprite.setPosition(Math.round(this.x), Math.round(this.y));
    this.glow.setPosition(this.x, this.y);
    this.light.x = this.x; this.light.y = this.y;
    if (time - this.bornAt > this.lifeMs || !this.scene.isWalkable(this.x, this.y + 6)) this.pop();
  }

  pop() {
    if (this.dead) return;
    this.dead = true;
    this.scene.fx.sparks(this.x, this.y, this.reflected ? PALETTE[18] : PALETTE[10], 8);
    this.sprite.destroy();
    this.glow.destroy();
    this.scene.lighting.remove(this.light);
  }
}
