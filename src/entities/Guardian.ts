import Phaser from 'phaser';
import { sound } from '../audio/Sound';
import { anim, tex } from '../core/assets';
import { PALETTE, type GuardianDef } from '../core/data';
import { isKid } from '../core/session';
import type { Light } from '../fx/Lighting';
import type { PlanetScene } from '../scenes/PlanetScene';
import type { Enemy } from './Enemy';
import { flashWhite, squash } from './Player';

type State = 'asleep' | 'waking' | 'idle' | 'chase' | 'chargeWindup' | 'charge' | 'stunned' | 'slamWindup' | 'slamAir' | 'rest' | 'dead';

/**
 * The beacon keeper: a stone sentinel asleep in front of the monolith. Come close and it wakes. It walks at you,
 * telegraphs a charge (crouch, bright eye) that leaves it stunned and wide open if it hits a wall, and a slam
 * (crouch, ring on the ground) whose landing hurts everything around it. Heavy: your hits barely move it.
 */
export class Guardian implements Enemy {
  readonly zone: Phaser.GameObjects.Zone;
  readonly body: Phaser.Physics.Arcade.Body;
  readonly sprite: Phaser.GameObjects.Sprite;
  /** Extra reach for the player's swing: this body is wide. */
  readonly reach = 9;
  private shadow: Phaser.GameObjects.Image;
  private marker: Phaser.GameObjects.Ellipse;
  private eye: Light;
  private texKey: string;
  readonly maxHp: number;
  hp: number;
  state: State = 'asleep';
  private stateUntil = 0;
  private nextAttackAt = 0;
  private chargeDir = new Phaser.Math.Vector2(1, 0);
  private from = new Phaser.Math.Vector2();
  private to = new Phaser.Math.Vector2();
  private airStart = 0;
  private z = 0;
  private hasHit = false;
  private restAnim: 'idle' | 'slamDown' = 'idle';
  private facing = 1;

  constructor(private scene: PlanetScene, readonly def: GuardianDef, readonly homeX: number, readonly homeY: number, private onDefeated: () => void) {
    this.texKey = tex(def.sprite, scene.planet.id);
    this.zone = scene.add.zone(homeX, homeY, 18, 9);
    scene.physics.add.existing(this.zone);
    this.body = this.zone.body as Phaser.Physics.Arcade.Body;
    this.body.setDrag(0, 0);
    this.shadow = scene.add.image(homeX, homeY, 'shadow').setAlpha(0.5).setTint(PALETTE[25]).setScale(1.9, 1.4).setDepth(50);
    this.marker = scene.add.ellipse(homeX, homeY, def.slamRadius * 2, def.slamRadius * 0.9).setStrokeStyle(1, PALETTE[11], 0.9).setDepth(55).setVisible(false);
    this.sprite = scene.add.sprite(homeX, homeY, this.texKey).setOrigin(0.5, 1);
    this.sprite.play(anim(this.texKey, 'sleep'));
    this.eye = scene.lighting.add({ x: homeX, y: homeY - 14, radius: 26, color: PALETTE[8], intensity: 0 });
    this.maxHp = isKid() ? def.kidHp : def.hp;
    this.hp = this.maxHp;
  }

  get x() { return this.body.center.x; }
  get y() { return this.body.center.y; }
  get alive() { return this.state !== 'dead'; }
  get hittable() { return this.state !== 'slamAir' && this.state !== 'dead'; }
  get awake() { return this.state !== 'asleep' && this.state !== 'dead'; }

  update(time: number, _dt: number) {
    if (this.state === 'dead') return;
    const p = this.scene.player;
    const dx = p.x - this.x, dy = p.y - this.y, dist = Math.hypot(dx, dy);
    const sees = p.alive && !p.locked && !this.scene.visit && dist < this.def.senseRange;
    const v = this.body.velocity;
    const d = this.def;

    switch (this.state) {
      case 'asleep':
        v.set(0, 0);
        if (sees && dist < d.wakeRange) this.wake(time);
        break;
      case 'waking':
        v.set(0, 0);
        this.eye.intensity = Math.min(1, (time - (this.stateUntil - 1300)) / 900);
        if (time > this.stateUntil) this.enter(sees ? 'chase' : 'idle', 0);
        break;
      case 'idle': {
        const hx = this.homeX - this.x, hy = this.homeY - this.y, hd = Math.hypot(hx, hy);
        if (hd > 6) v.set((hx / hd) * d.speed, (hy / hd) * d.speed); else v.scale(0.7);
        if (sees) this.enter('chase', 0);
        break;
      }
      case 'chase':
        v.set((dx / dist) * d.chaseSpeed, (dy / dist) * d.chaseSpeed);
        if (!sees) { this.enter('idle', 0); break; }
        if (time > this.nextAttackAt) {
          if (dist < d.slamRange) this.slamWindup(time);
          else if (dist < d.chargeRange && dist > d.chargeMinRange) this.chargeWindup(time, dx, dy);
        }
        break;
      case 'chargeWindup':
        v.scale(0.7);
        this.chargeDir.set(dx, dy).normalize();
        if (time > this.stateUntil) {
          this.enter('charge', time + d.chargeMs);
          this.hasHit = false;
          squash(this.scene, this.sprite, 0.8, 1.25, 100);
          this.scene.fx.dust(this.x, this.y + 3, 8);
          sound.stomp();
        }
        break;
      case 'charge': {
        v.set(this.chargeDir.x * d.chargeSpeed, this.chargeDir.y * d.chargeSpeed);
        if (!this.hasHit && p.alive && dist < 17) {
          this.hasHit = true;
          p.hurt(this.x, this.y, isKid() ? d.kidDamage : d.chargeDamage);
          v.scale(-0.2);
          this.rest(time, d.restMs);
          break;
        }
        const b = this.body.blocked;
        if (b.left || b.right || b.up || b.down) {
          // ran into a wall: dazed and wide open
          this.enter('stunned', time + d.stunMs);
          v.set(-this.chargeDir.x * 40, -this.chargeDir.y * 40);
          this.scene.shake(260, 0.012);
          this.scene.fx.debris(this.x + this.chargeDir.x * 10, this.y - 8, 14);
          this.scene.fx.dust(this.x, this.y + 3, 10);
          sound.slam();
        } else if (time > this.stateUntil) this.rest(time, d.restMs);
        break;
      }
      case 'stunned':
        v.scale(0.85);
        if (time > this.stateUntil) this.rest(time, 200);
        break;
      case 'slamWindup':
        v.scale(0.7);
        if (time > this.stateUntil) {
          this.enter('slamAir', 0);
          this.airStart = time;
          this.from.set(this.x, this.y);
          const dv = new Phaser.Math.Vector2(dx, dy);
          if (dv.length() > d.slamRange * 0.8) dv.setLength(d.slamRange * 0.8);
          this.to.set(this.x + dv.x, this.y + dv.y);
          squash(this.scene, this.sprite, 0.75, 1.3, 90);
          sound.hop();
        }
        break;
      case 'slamAir': {
        const t = Math.min(1, (time - this.airStart) / d.slamAirMs);
        const x = this.from.x + (this.to.x - this.from.x) * t, y = this.from.y + (this.to.y - this.from.y) * t;
        if (this.scene.isWalkable(x, y)) this.body.reset(x, y);
        this.z = Math.sin(t * Math.PI) * 30;
        if (t >= 1) this.land(time);
        break;
      }
      case 'rest':
        v.scale(0.8);
        if (time > this.stateUntil) this.enter(sees ? 'chase' : 'idle', 0);
        break;
    }

    // animation, facing, eye
    const want: string = this.state === 'asleep' ? 'sleep' : this.state === 'chase' ? 'walk'
      : this.state === 'idle' ? (v.length() > 6 ? 'walk' : 'idle')
      : this.state === 'chargeWindup' || this.state === 'slamWindup' ? 'windup'
      : this.state === 'charge' ? 'charge' : this.state === 'stunned' ? 'stunned'
      : this.state === 'slamAir' ? 'slamUp' : this.state === 'rest' ? this.restAnim : 'idle';
    if (this.sprite.anims.currentAnim?.key !== anim(this.texKey, want)) this.sprite.play(anim(this.texKey, want));
    if (this.state === 'charge') this.facing = this.chargeDir.x < 0 ? -1 : 1;
    else if (this.state !== 'asleep' && this.state !== 'stunned' && Math.abs(dx) > 4) this.facing = dx < 0 ? -1 : 1;
    this.sprite.setFlipX(this.facing < 0);
    const windup = this.state === 'chargeWindup' || this.state === 'slamWindup';
    this.eye.color = windup ? PALETTE[11] : this.state === 'stunned' ? PALETTE[10] : PALETTE[8];
    if (this.state !== 'waking' && this.state !== 'asleep') {
      const frac = this.hp / this.maxHp;
      this.eye.intensity = (windup ? 1 : 0.55 + 0.35 * frac) * (this.state === 'stunned' ? 0.4 + 0.3 * Math.sin(time / 60) : 1);
    }
    this.sync();
  }

  private enter(s: State, until: number) {
    this.state = s;
    this.stateUntil = until;
    this.marker.setVisible(false);
  }

  private rest(time: number, ms: number) {
    this.restAnim = 'idle';
    this.enter('rest', time + ms);
    this.nextAttackAt = time + ms + 300;
  }

  private wake(time: number) {
    this.enter('waking', time + 1300);
    sound.roar();
    this.scene.shake(700, 0.006);
    this.scene.fx.dust(this.x - 8, this.y + 3, 6);
    this.scene.fx.dust(this.x + 8, this.y + 3, 6);
    this.scene.fx.sparks(this.x, this.y - 14, PALETTE[8], 10);
    squash(this.scene, this.sprite, 1.2, 0.85, 200);
    this.nextAttackAt = time + 1900;
  }

  private chargeWindup(time: number, dx: number, dy: number) {
    this.enter('chargeWindup', time + this.def.chargeWindupMs);
    this.chargeDir.set(dx, dy).normalize();
    sound.windup();
  }

  private slamWindup(time: number) {
    this.enter('slamWindup', time + this.def.slamWindupMs);
    this.marker.setPosition(this.x, this.y + 4).setVisible(true).setScale(1.5).setAlpha(0);
    this.scene.tweens.add({ targets: this.marker, scale: 1, alpha: 1, duration: this.def.slamWindupMs, ease: 'Quad.easeIn' });
    sound.windup();
  }

  private land(time: number) {
    this.z = 0;
    const d = this.def;
    this.restAnim = 'slamDown';
    this.rest(time, d.restMs * 1.3);
    squash(this.scene, this.sprite, 1.45, 0.6, 140);
    this.scene.shake(240, 0.014);
    this.scene.fx.dust(this.x, this.y + 3, 14);
    this.scene.fx.debris(this.x, this.y - 2, 8);
    sound.slam();
    // shockwave ring
    const ring = this.scene.add.image(this.x, this.y + 3, 'ring').setDepth(56).setAlpha(0.9).setScale(0.4);
    this.scene.tweens.add({ targets: ring, scaleX: d.slamRadius / 8, scaleY: d.slamRadius / 18, alpha: 0, duration: 420, ease: 'Quad.easeOut', onComplete: () => ring.destroy() });
    const p = this.scene.player;
    if (p.alive && Math.hypot(p.x - this.x, p.y - this.y) < d.slamRadius) p.hurt(this.x, this.y, isKid() ? d.kidDamage : d.contactDamage);
  }

  hit(damage: number, dir: Phaser.Math.Vector2, knockback: number) {
    if (!this.hittable) return;
    const now = this.scene.time.now;
    if (this.state === 'asleep') this.wake(now);
    const stunned = this.state === 'stunned';
    this.hp -= damage * (stunned ? this.def.stunDamageScale : 1);
    flashWhite(this.scene, this.sprite, 80);
    squash(this.scene, this.sprite, stunned ? 1.3 : 1.12, stunned ? 0.75 : 0.9, 100);
    const k = knockback * this.def.knockbackScale * (stunned ? 3 : 1);
    this.body.velocity.x += dir.x * k;
    this.body.velocity.y += dir.y * k;
    this.scene.fx.sparks(this.x, this.y - 10, stunned ? PALETTE[11] : PALETTE[9], stunned ? 12 : 6);
    if (this.hp <= 0) this.die();
  }

  private die() {
    this.state = 'dead';
    this.body.enable = false;
    this.marker.setVisible(false);
    const x = this.x, y = this.y, sc = this.scene;
    sc.onEnemyKilled(this);
    sc.shake(600, 0.012);
    sound.guardianDie();
    this.eye.color = PALETTE[19];
    sc.tweens.add({ targets: this.eye, intensity: 0, duration: 900 });
    for (let i = 0; i < 3; i++) sc.time.delayedCall(i * 220, () => { sc.fx.debris(x + (Math.random() - 0.5) * 16, y - 6 - Math.random() * 14, 10); sc.fx.dust(x, y + 3, 6); });
    sc.tweens.add({ targets: this.sprite, x: x + 1, duration: 50, yoyo: true, repeat: 7 });
    sc.tweens.add({
      targets: this.sprite, scaleY: 0.15, scaleX: 1.3, alpha: 0, delay: 500, duration: 500, ease: 'Quad.easeIn',
      onComplete: () => { this.sprite.setVisible(false); this.shadow.setVisible(false); sc.fx.dust(x, y + 3, 16); },
    });
    sc.time.delayedCall(1050, () => this.onDefeated());
  }

  sync() {
    const x = Math.round(this.x), y = Math.round(this.y);
    this.sprite.setPosition(x, y + 6 - Math.round(this.z)).setDepth(100 + y + (this.z > 0 ? 24 : 0));
    this.shadow.setPosition(x, y + 4).setScale(1.9 * (1 - this.z / 90), 1.4 * (1 - this.z / 90));
    this.eye.x = x;
    this.eye.y = y - 14 - this.z;
  }
}
