import Phaser from 'phaser';
import { anim, featureTex } from '../core/assets';
import { PALETTE, PLAYER } from '../core/data';
import { isKid, session } from '../core/session';
import type { Light } from '../fx/Lighting';
import type { InputFrame } from '../input/Controls';
import type { PlanetScene } from '../scenes/PlanetScene';

const WARM = PALETTE[10];

type ModelId = keyof typeof PLAYER.models;

/** Body model from ?model= in the URL, else the default in player.json. */
function pickModel() {
  const q = new URLSearchParams(location.search).get('model');
  const id = (q && q in PLAYER.models ? q : PLAYER.model) as ModelId;
  return PLAYER.models[id];
}

export class Player {
  readonly zone: Phaser.GameObjects.Zone;
  readonly body: Phaser.Physics.Arcade.Body;
  readonly sprite: Phaser.GameObjects.Sprite;
  private shadow: Phaser.GameObjects.Image;
  private glow: Phaser.GameObjects.Image;
  readonly light: Light;
  private key: string;
  private headY: number;

  hp = PLAYER.maxHp;
  facing = 1;
  aim = new Phaser.Math.Vector2(1, 0);
  locked = true;
  private invulnUntil = 0;
  private lastHurtAt = -Infinity;
  private nextRegenAt = 0;
  private attackReadyAt = 0;
  private attackingUntil = 0;
  private stepTimer = 0;
  private dead = false;

  constructor(private scene: PlanetScene, x: number, y: number) {
    this.zone = scene.add.zone(x, y, 8, 5);
    scene.physics.add.existing(this.zone);
    this.body = this.zone.body as Phaser.Physics.Arcade.Body;
    this.body.setDrag(0, 0);
    this.shadow = scene.add.image(x, y, 'shadow').setAlpha(0.45).setTint(PALETTE[25]).setDepth(50);
    const model = pickModel();
    this.key = featureTex(model.sprite, session.replicant?.traits.feature ?? session.profile?.feature_color ?? PLAYER.feature[1]);
    this.headY = model.headY;
    this.sprite = scene.add.sprite(x, y, this.key).setOrigin(0.5, 1);
    this.sprite.play(anim(this.key, 'idle'));
    this.glow = scene.add.image(x, y, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(WARM).setAlpha(0.18).setScale(0.9).setDepth(6100);
    this.light = scene.lighting.add({ x, y, radius: 70, color: 0xffe2b8, intensity: 1 });
  }

  get x() { return this.body.center.x; }
  get y() { return this.body.center.y; }
  get alive() { return !this.dead; }

  setPosition(x: number, y: number) {
    this.body.reset(x, y);
    this.syncVisuals();
  }

  update(time: number, dt: number, input: InputFrame) {
    if (this.dead) { this.syncVisuals(); return; }
    const moving = !this.locked && (input.x !== 0 || input.y !== 0);
    const speed = PLAYER.speed;
    const tx = this.locked ? 0 : input.x * speed, ty = this.locked ? 0 : input.y * speed;
    const a = (PLAYER.accel * dt) / 1000;
    const v = this.body.velocity;
    if (time > this.attackingUntil - 60) {
      v.x = approach(v.x, tx, a);
      v.y = approach(v.y, ty, a);
    } else {
      v.x *= 0.8; v.y *= 0.8;
    }
    if (moving) {
      this.aim.set(input.x, input.y).normalize();
      if (Math.abs(input.x) > 0.15) this.facing = Math.sign(input.x);
    }

    if (time > this.attackingUntil) {
      const key = moving ? 'walk' : 'idle';
      const cur = this.sprite.anims.currentAnim?.key;
      if (cur !== anim(this.key, key) && !(cur === anim(this.key, 'hurt') && time < this.invulnUntil - PLAYER.invulnMs + 250)) {
        this.sprite.play(anim(this.key, key), true);
      }
    }
    this.sprite.setFlipX(this.facing < 0);

    if (moving) {
      this.stepTimer -= dt;
      if (this.stepTimer <= 0) {
        this.stepTimer = 170;
        this.scene.fx.dust(this.x - this.facing * 3, this.y + 2, 2);
      }
    }

    if (!this.locked && input.attack && time >= this.attackReadyAt && !this.scene.tryInteract()) this.attack(time);

    // Out of danger for a moment: health slowly comes back
    const { delayMs, everyMs } = PLAYER.regen;
    if (!this.dead && this.hp < PLAYER.maxHp && time - this.lastHurtAt > delayMs && time >= this.nextRegenAt) {
      if (this.nextRegenAt > 0) {
        this.hp += 1;
        this.scene.fx.sparks(this.x, this.y - 8, WARM, 4);
      }
      this.nextRegenAt = time + everyMs;
    }

    // Health is the glow: smaller and dimmer as hp drops, flickering when low. The light never drops
    // so far that the body sinks into the darkness.
    const frac = this.hp / PLAYER.maxHp;
    const low = frac <= 0.4 ? 0.15 * (0.5 + 0.5 * Math.sin(time / 90)) : 0;
    this.light.radius = (60 + 40 * frac) * PLAYER.lightRadius;
    this.light.intensity = 0.8 + 0.2 * frac - low;
    this.glow.setAlpha((0.08 + 0.14 * frac) * (1 - low)).setScale(0.6 + 0.4 * frac);

    // invulnerability blink
    this.sprite.setVisible(time > this.invulnUntil || Math.floor(time / 70) % 2 === 0);
    this.syncVisuals();
  }

  private attack(time: number) {
    this.attackReadyAt = time + PLAYER.attack.cooldownMs;
    this.attackingUntil = time + 150;
    // gentle auto-aim: if standing still, swing toward the nearest target in reach
    const target = this.scene.nearestTarget(this.x, this.y, 46);
    if (target && this.body.velocity.length() < 10) {
      this.aim.set(target.x - this.x, target.y - this.y).normalize();
      if (Math.abs(this.aim.x) > 0.2) this.facing = Math.sign(this.aim.x);
    }
    this.sprite.play(anim(this.key, 'attack'), true);
    this.body.velocity.x += this.aim.x * 60;
    this.body.velocity.y += this.aim.y * 60;
    const { reach, radius } = PLAYER.attack;
    const hx = this.x + this.aim.x * reach, hy = this.y - 5 + this.aim.y * reach;
    this.scene.fx.slash(hx, hy, this.aim);
    squash(this.scene, this.sprite, 1.2, 0.85, 90);
    this.scene.resolveAttack(hx, hy, radius, this.aim);
  }

  hurt(fromX: number, fromY: number, damage: number) {
    const now = this.scene.time.now;
    if (this.dead || this.locked || now < this.invulnUntil) return;
    this.invulnUntil = now + PLAYER.invulnMs;
    this.hp = Math.max(0, this.hp - damage);
    this.lastHurtAt = now;
    this.nextRegenAt = 0;
    const dir = new Phaser.Math.Vector2(this.x - fromX, this.y - fromY).normalize();
    this.body.velocity.set(dir.x * 190, dir.y * 190);
    this.sprite.play(anim(this.key, 'hurt'), true);
    flashWhite(this.scene, this.sprite, 90);
    squash(this.scene, this.sprite, 0.75, 1.25, 110);
    this.scene.hitStop(100);
    this.scene.shake(140, 0.006);
    this.scene.fx.sparks(this.x, this.y - 6, PALETTE[8], 8);
    if (this.hp <= 0) this.die();
  }

  private die() {
    this.dead = true;
    this.body.setVelocity(0, 0);
    this.body.enable = false;
    if (isKid()) {
      // Kid mode never shows dying: a sparkle, then home to the base
      this.scene.fx.sparks(this.x, this.y - 8, PALETTE[18], 14);
      this.scene.tweens.add({ targets: this.sprite, alpha: 0, duration: 300 });
      this.scene.time.delayedCall(450, () => this.scene.respawnPlayer());
      return;
    }
    this.scene.fx.sparks(this.x, this.y - 6, PALETTE[10], 18);
    this.scene.tweens.add({ targets: this.sprite, alpha: 0, scaleY: 1.6, scaleX: 0.3, duration: 450, ease: 'Quad.easeIn' });
    this.scene.tweens.add({ targets: this.light, intensity: 0, duration: 600 });
    this.scene.time.delayedCall(900, () => this.scene.respawnPlayer());
  }

  respawn(x: number, y: number) {
    this.dead = false;
    this.hp = PLAYER.maxHp;
    this.body.enable = true;
    this.setPosition(x, y);
    this.sprite.setAlpha(1).setScale(1);
    this.invulnUntil = this.scene.time.now + 1500;
    this.light.intensity = 1;
    squash(this.scene, this.sprite, 1.3, 0.7, 160);
  }

  syncVisuals() {
    const x = Math.round(this.x), y = Math.round(this.y);
    this.sprite.setPosition(x, y + 3).setDepth(100 + y);
    this.shadow.setPosition(x, y + 2);
    this.glow.setPosition(x, y + this.headY);
    this.light.x = x;
    this.light.y = y + this.headY;
  }
}

export function approach(v: number, target: number, step: number) {
  return v < target ? Math.min(target, v + step) : Math.max(target, v - step);
}

/** Squash and stretch: jump to (sx, sy) then spring back to 1. */
export function squash(scene: Phaser.Scene, s: Phaser.GameObjects.Sprite | Phaser.GameObjects.Image, sx: number, sy: number, ms: number) {
  scene.tweens.killTweensOf(s);
  const bx = Math.sign(s.scaleX) || 1;
  s.setScale(sx * bx, sy);
  scene.tweens.add({ targets: s, scaleX: bx, scaleY: 1, duration: ms * 2, ease: 'Back.easeOut' });
}

export function flashWhite(scene: Phaser.Scene, s: Phaser.GameObjects.Sprite, ms: number) {
  s.setTintFill(0xffffff);
  scene.time.delayedCall(ms, () => s.active && s.clearTint());
}
