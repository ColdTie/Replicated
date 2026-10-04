import Phaser from 'phaser';
import { sound } from '../audio/Sound';
import { anim, tex } from '../core/assets';
import { PALETTE, type HopperDef } from '../core/data';
import type { Light } from '../fx/Lighting';
import type { PlanetScene } from '../scenes/PlanetScene';
import type { Enemy } from './Enemy';
import { flashWhite, squash } from './Player';

type State = 'idle' | 'windup' | 'air' | 'rest' | 'dead';

/**
 * Plant bulb that hops. When it notices you it crouches (yellow eyes) and a ring marks where it
 * will land; it can only be hit while on the ground.
 */
export class Hopper implements Enemy {
  readonly zone: Phaser.GameObjects.Zone;
  readonly body: Phaser.Physics.Arcade.Body;
  readonly sprite: Phaser.GameObjects.Sprite;
  private shadow: Phaser.GameObjects.Image;
  private marker: Phaser.GameObjects.Ellipse;
  private glow: Light;
  private texKey: string;
  hp: number;
  state: State = 'idle';
  private stateUntil = 0;
  private from = new Phaser.Math.Vector2();
  private to = new Phaser.Math.Vector2();
  private airStart = 0;
  private z = 0;
  private aggressive = false;

  constructor(private scene: PlanetScene, readonly def: HopperDef, readonly homeX: number, readonly homeY: number) {
    this.texKey = tex(def.sprite, scene.planet.id);
    this.zone = scene.add.zone(homeX, homeY, 10, 6);
    scene.physics.add.existing(this.zone);
    this.body = this.zone.body as Phaser.Physics.Arcade.Body;
    this.shadow = scene.add.image(homeX, homeY, 'shadow').setAlpha(0.45).setTint(PALETTE[25]).setDepth(50);
    this.marker = scene.add.ellipse(homeX, homeY, 22, 9).setStrokeStyle(1, PALETTE[11], 0.9).setDepth(55).setVisible(false);
    this.sprite = scene.add.sprite(homeX, homeY, this.texKey).setOrigin(0.5, 1);
    this.sprite.play(anim(this.texKey, 'idle'));
    this.glow = scene.lighting.add({ x: homeX, y: homeY, radius: 16, color: PALETTE[scene.planet.accent[2]], intensity: 0.55, flicker: 0.3 });
    this.hp = def.hp;
    this.stateUntil = scene.time.now + Math.random() * def.wanderEveryMs;
  }

  get x() { return this.body.center.x; }
  get y() { return this.body.center.y; }
  get alive() { return this.state !== 'dead'; }
  get hittable() { return this.state !== 'air' && this.state !== 'dead'; }

  update(time: number) {
    if (this.state === 'dead') return;
    const p = this.scene.player;
    const dist = Math.hypot(p.x - this.x, p.y - this.y);
    this.aggressive = p.alive && !p.locked && dist < this.def.senseRange;
    this.body.velocity.scale(0.8);

    switch (this.state) {
      case 'idle':
      case 'rest':
        if (time < this.stateUntil) break;
        if (this.aggressive) this.windup(time, p.x, p.y);
        else if (this.state === 'idle' || time > this.stateUntil + 400) {
          // lazy wander hop around home
          const a = Math.random() * Math.PI * 2;
          const tx = this.homeX + Math.cos(a) * 30, ty = this.homeY + Math.sin(a) * 20;
          this.jump(time, tx, ty, false);
        }
        break;
      case 'windup':
        if (time > this.stateUntil) this.jump(time, this.to.x, this.to.y, true);
        break;
      case 'air': {
        const t = Math.min(1, (time - this.airStart) / this.def.airMs);
        const x = this.from.x + (this.to.x - this.from.x) * t;
        const y = this.from.y + (this.to.y - this.from.y) * t;
        if (this.scene.isWalkable(x, y)) this.body.reset(x, y);
        this.z = Math.sin(t * Math.PI) * 26;
        if (t >= 1) this.land(time);
        break;
      }
    }
    this.sync();
  }

  private windup(time: number, tx: number, ty: number) {
    this.state = 'windup';
    this.stateUntil = time + this.def.windupMs;
    const v = new Phaser.Math.Vector2(tx - this.x, ty - this.y);
    if (v.length() > this.def.hopRange) v.setLength(this.def.hopRange);
    this.to.set(this.x + v.x, this.y + v.y);
    this.sprite.play(anim(this.texKey, 'crouch'));
    this.sprite.setFlipX(v.x < 0);
    this.marker.setPosition(this.to.x, this.to.y).setVisible(true).setScale(1.4).setAlpha(0);
    this.scene.tweens.add({ targets: this.marker, scale: 1, alpha: 1, duration: this.def.windupMs, ease: 'Quad.easeIn' });
    sound.windup();
  }

  private jump(time: number, tx: number, ty: number, attack: boolean) {
    if (!attack) {
      const v = new Phaser.Math.Vector2(tx - this.x, ty - this.y);
      if (v.length() > this.def.hopRange * 0.6) v.setLength(this.def.hopRange * 0.6);
      tx = this.x + v.x; ty = this.y + v.y;
    }
    this.state = 'air';
    this.airStart = time;
    this.from.set(this.x, this.y);
    this.to.set(tx, ty);
    this.aggressive = attack;
    this.sprite.play(anim(this.texKey, 'air'));
    squash(this.scene, this.sprite, 0.7, 1.35, 90);
    if (this.near()) sound.hop();
  }

  /** Only make noise when the player could see it. */
  private near() {
    const p = this.scene.player;
    return Math.hypot(p.x - this.x, p.y - this.y) < 160;
  }

  private land(time: number) {
    this.z = 0;
    this.marker.setVisible(false);
    this.sprite.play(anim(this.texKey, 'idle'));
    squash(this.scene, this.sprite, 1.4, 0.65, 120);
    this.scene.fx.dust(this.x, this.y + 2, 4);
    if (this.near()) sound.land();
    const p = this.scene.player;
    if (this.aggressive && p.alive && Math.hypot(p.x - this.x, p.y - this.y) < this.def.landRadius) {
      p.hurt(this.x, this.y, this.def.contactDamage);
    }
    this.state = 'rest';
    this.stateUntil = time + (this.aggressive ? this.def.restMs : this.def.wanderEveryMs * (0.6 + Math.random() * 0.8));
  }

  hit(damage: number, dir: Phaser.Math.Vector2, knockback: number) {
    if (!this.hittable) return;
    this.hp -= damage;
    flashWhite(this.scene, this.sprite, 80);
    squash(this.scene, this.sprite, 1.4, 0.7, 100);
    this.body.velocity.set(dir.x * knockback, dir.y * knockback);
    this.marker.setVisible(false);
    if (this.state === 'windup') { this.state = 'rest'; this.sprite.play(anim(this.texKey, 'idle')); }
    this.stateUntil = this.scene.time.now + 500;
    this.scene.fx.sparks(this.x, this.y - 5, PALETTE[19], 6);
    if (this.hp <= 0) this.die(dir);
  }

  private die(dir: Phaser.Math.Vector2) {
    this.state = 'dead';
    this.body.enable = false;
    this.marker.setVisible(false);
    const x = this.x, y = this.y;
    this.scene.fx.debris(x, y - 5, 12);
    this.scene.onEnemyKilled(this);
    this.scene.time.delayedCall(110, () => {
      for (let i = 0; i < (this.def.drops.ember ?? 0); i++) this.scene.spawnShard(x, y, dir);
    });
    this.scene.tweens.add({
      targets: this.sprite, alpha: 0, scaleX: 0.2, scaleY: 1.6, duration: 240, ease: 'Quad.easeOut',
      onComplete: () => { this.sprite.setVisible(false); this.shadow.setVisible(false); },
    });
    this.glow.active = false;
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
    this.sprite.setVisible(true).setAlpha(1).setScale(1);
    this.shadow.setVisible(true);
    this.glow.active = true;
  }

  sync() {
    const x = Math.round(this.x), y = Math.round(this.y);
    this.sprite.setPosition(x, y + 4 - Math.round(this.z)).setDepth(100 + y + (this.z > 0 ? 20 : 0));
    this.shadow.setPosition(x, y + 3).setScale(1 - this.z / 60);
    this.glow.x = x;
    this.glow.y = y - 4 - this.z;
  }
}
