import Phaser from 'phaser';
import { anim, tex } from '../core/assets';
import { PALETTE, type SkitterDef } from '../core/data';
import type { Light } from '../fx/Lighting';
import type { PlanetScene } from '../scenes/PlanetScene';
import type { Enemy } from './Enemy';
import { flashWhite, squash } from './Player';

type State = 'wander' | 'chase' | 'windup' | 'lunge' | 'recover' | 'dead';

/** Low crawling creature: wanders, chases, telegraphs (crouch + yellow eyes), then lunges. */
export class Skitter implements Enemy {
  readonly zone: Phaser.GameObjects.Zone;
  readonly body: Phaser.Physics.Arcade.Body;
  readonly sprite: Phaser.GameObjects.Sprite;
  private shadow: Phaser.GameObjects.Image;
  private eye: Light;
  private texKey: string;
  hp: number;
  state: State = 'wander';
  private stateUntil = 0;
  private wanderDir = new Phaser.Math.Vector2();
  private lungeDir = new Phaser.Math.Vector2();
  private hasHit = false;

  constructor(private scene: PlanetScene, readonly def: SkitterDef, readonly homeX: number, readonly homeY: number) {
    this.texKey = tex(def.sprite, scene.planet.id);
    this.zone = scene.add.zone(homeX, homeY, 10, 6);
    scene.physics.add.existing(this.zone);
    this.body = this.zone.body as Phaser.Physics.Arcade.Body;
    this.body.setBounce(0.4, 0.4);
    this.shadow = scene.add.image(homeX, homeY, 'shadow').setAlpha(0.45).setTint(PALETTE[25]).setDepth(50);
    this.sprite = scene.add.sprite(homeX, homeY, this.texKey).setOrigin(0.5, 1);
    this.sprite.play(anim(this.texKey, 'walk'));
    this.eye = scene.lighting.add({ x: homeX, y: homeY, radius: 14, color: PALETTE[8], intensity: 0.7 });
    this.hp = def.hp;
  }

  get x() { return this.body.center.x; }
  get y() { return this.body.center.y; }
  get alive() { return this.state !== 'dead'; }

  update(time: number, _dt: number) {
    if (this.state === 'dead') return;
    const p = this.scene.player;
    const dx = p.x - this.x, dy = p.y - this.y;
    const dist = Math.hypot(dx, dy);
    const v = this.body.velocity;
    const canSee = p.alive && !p.locked && dist < this.def.senseRange;

    switch (this.state) {
      case 'wander':
        if (time > this.stateUntil) {
          const homeDx = this.homeX - this.x, homeDy = this.homeY - this.y;
          this.wanderDir.setToPolar(Math.random() * Math.PI * 2, 1);
          if (Math.hypot(homeDx, homeDy) > 48) this.wanderDir.set(homeDx, homeDy).normalize();
          if (Math.random() < 0.35) this.wanderDir.set(0, 0);
          this.stateUntil = time + 700 + Math.random() * 1400;
        }
        v.set(this.wanderDir.x * this.def.speed, this.wanderDir.y * this.def.speed);
        if (canSee) this.state = 'chase';
        break;
      case 'chase':
        v.set((dx / dist) * this.def.chaseSpeed, (dy / dist) * this.def.chaseSpeed);
        if (!canSee || dist > this.def.senseRange * 1.4) this.state = 'wander';
        else if (dist < this.def.lungeRange) this.enter('windup', time + this.def.windupMs);
        break;
      case 'windup':
        v.scale(0.8);
        this.lungeDir.set(dx, dy).normalize();
        if (time > this.stateUntil) {
          this.enter('lunge', time + this.def.lungeMs);
          v.set(this.lungeDir.x * this.def.lungeSpeed, this.lungeDir.y * this.def.lungeSpeed);
          squash(this.scene, this.sprite, 1.3, 0.75, 80);
          this.hasHit = false;
        }
        break;
      case 'lunge':
        if (!this.hasHit && p.alive && dist < 11) {
          this.hasHit = true;
          p.hurt(this.x, this.y, this.def.contactDamage);
          v.scale(-0.3);
        }
        if (time > this.stateUntil) this.enter('recover', time + this.def.cooldownMs);
        break;
      case 'recover':
        v.scale(0.85);
        if (time > this.stateUntil) this.state = canSee ? 'chase' : 'wander';
        break;
    }

    const want = this.state === 'windup' ? 'windup' : 'walk';
    if (this.sprite.anims.currentAnim?.key !== anim(this.texKey, want)) this.sprite.play(anim(this.texKey, want));
    this.sprite.anims.timeScale = this.state === 'chase' || this.state === 'lunge' ? 1.8 : v.length() < 4 ? 0.3 : 1;
    if (Math.abs(v.x) > 3) this.sprite.setFlipX(v.x < 0);
    if (this.state === 'windup') this.sprite.setFlipX(dx < 0);
    this.eye.color = this.state === 'windup' ? PALETTE[11] : PALETTE[8];
    this.eye.intensity = this.state === 'windup' ? 1 : 0.7;
    this.sync();
  }

  private enter(s: State, until: number) {
    this.state = s;
    this.stateUntil = until;
  }

  hit(damage: number, dir: Phaser.Math.Vector2, knockback: number) {
    if (this.state === 'dead') return;
    this.hp -= damage;
    flashWhite(this.scene, this.sprite, 80);
    squash(this.scene, this.sprite, 1.35, 0.7, 100);
    this.body.velocity.set(dir.x * knockback, dir.y * knockback);
    this.enter('recover', this.scene.time.now + 420);
    this.scene.fx.sparks(this.x, this.y - 4, PALETTE[19], 6);
    if (this.hp <= 0) this.die(dir);
  }

  private die(dir: Phaser.Math.Vector2) {
    this.state = 'dead';
    this.body.enable = false;
    const x = this.x, y = this.y;
    this.scene.fx.debris(x, y - 4, 14);
    this.scene.time.delayedCall(110, () => {
      for (let i = 0; i < (this.def.drops.ember ?? 0); i++) this.scene.spawnShard(x, y, dir);
    });
    this.scene.tweens.add({
      targets: this.sprite, alpha: 0, scaleX: 1.5, scaleY: 0.2, duration: 260, ease: 'Quad.easeOut',
      onComplete: () => { this.sprite.setVisible(false); this.shadow.setVisible(false); },
    });
    this.eye.active = false;
    this.scene.time.delayedCall(this.def.respawnMs, () => this.tryRespawn());
  }

  private tryRespawn() {
    const p = this.scene.player;
    if (Math.hypot(p.x - this.homeX, p.y - this.homeY) < 200) {
      this.scene.time.delayedCall(4000, () => this.tryRespawn());
      return;
    }
    this.hp = this.def.hp;
    this.state = 'wander';
    this.body.enable = true;
    this.body.reset(this.homeX, this.homeY);
    this.sprite.setVisible(true).setAlpha(1).setScale(1);
    this.shadow.setVisible(true);
    this.eye.active = true;
  }

  sync() {
    const x = Math.round(this.x), y = Math.round(this.y);
    this.sprite.setPosition(x, y + 4).setDepth(100 + y);
    this.shadow.setPosition(x, y + 3);
    this.eye.x = x + (this.sprite.flipX ? -4 : 4);
    this.eye.y = y - 1;
  }
}
