import Phaser from 'phaser';
import { anim } from '../core/assets';
import { bodyFor } from '../core/body';
import type { ReplicantSave } from '../net/store';
import { PALETTE, PLAYER } from '../core/data';
import { isKid, session } from '../core/session';
import { sound } from '../audio/Sound';
import { stat } from '../core/drift';
import { Gear } from './Gear';
import type { Light } from '../fx/Lighting';
import type { InputFrame } from '../input/Controls';
import type { PlanetScene } from '../scenes/PlanetScene';

const WARM = PALETTE[10];
const WARM_RGB = Phaser.Display.Color.IntegerToColor(0xffe2b8);
const HURT_RGB = Phaser.Display.Color.IntegerToColor(PALETTE[8]);


export class Player {
  readonly zone: Phaser.GameObjects.Zone;
  readonly body: Phaser.Physics.Arcade.Body;
  readonly sprite: Phaser.GameObjects.Sprite;
  private shadow: Phaser.GameObjects.Image;
  private glow: Phaser.GameObjects.Image;
  private pool: Phaser.GameObjects.Image;
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
  private lastAttackAt = -Infinity;
  /** An attack pressed during the cooldown fires as soon as it ends (so mashing never drops a swing) */
  private attackBufferedUntil = 0;
  private combo = 0;
  private dashUntil = 0;
  private dashReadyAt = 0;
  private nextAfterimage = 0;
  private dashDir = new Phaser.Math.Vector2();
  /** Visor color (or drifted trail color), used for the dash trail */
  readonly featureColor: number;
  private gear?: Gear;
  private hologram = false;
  private hidden = false;
  private stepTimer = 0;
  private dead = false;
  private nextDamageFx = 0;
  private hurtFlashUntil = 0;
  private lowHpFlickerUntil = 0;

  constructor(private scene: PlanetScene, x: number, y: number) {
    this.zone = scene.add.zone(x, y, 8, 5);
    scene.physics.add.existing(this.zone);
    this.body = this.zone.body as Phaser.Physics.Arcade.Body;
    this.body.setDrag(0, 0);
    this.shadow = scene.add.image(x, y, 'shadow').setAlpha(0.45).setTint(PALETTE[25]).setDepth(50);
    const rep = session.replicant;
    const feature = rep?.traits.feature ?? session.profile?.feature_color ?? PLAYER.feature[1];
    const traits = rep?.traits;
    this.featureColor = PALETTE[traits?.trail ?? feature];
    // ?model=drone tries a hand-made body; otherwise the replicant's own (composed from the kit when it has one)
    const q = new URLSearchParams(location.search).get('model');
    const data = q && q in PLAYER.models ? ({ ...(rep ?? { id: '', profile_id: null, name: '', star_id: 'sol', planet_index: 3, pos_x: null, pos_y: null }), model: q, traits: { ...(traits ?? {}), body: undefined, blank: false } } as ReplicantSave) : rep;
    const look = bodyFor(scene, data ?? undefined, feature);
    this.key = look.key;
    this.headY = look.headY;
    this.sprite = scene.add.sprite(x, y, this.key).setOrigin(0.5, 1);
    this.sprite.play(anim(this.key, 'idle'));
    if (traits?.gear) this.gear = new Gear(scene, this.sprite, look.model, traits.gear, this.featureColor, look.anchors);
    // Two layers of light: a tight halo hugging the body (it is the source) and a wide, faint pool on the ground.
    this.glow = scene.add.image(x, y, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(WARM).setAlpha(0.3).setScale(0.45).setDepth(6100);
    this.pool = scene.add.image(x, y, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(WARM).setAlpha(0.07).setScale(1.5, 1.0).setDepth(6100);
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
    const speed = PLAYER.speed * stat(session.replicant, 'speed') * (this.scene.surfaceAt(this.x, this.y + 2) === 'water' ? 0.72 : 1);
    const tx = this.locked ? 0 : input.x * speed, ty = this.locked ? 0 : input.y * speed;
    const a = (PLAYER.accel * dt) / 1000;
    const v = this.body.velocity;
    const dashing = time < this.dashUntil;
    if (dashing) {
      const sp = PLAYER.dash.speed * this.mod('dash');
      v.set(this.dashDir.x * sp, this.dashDir.y * sp);
      if (time > this.nextAfterimage) {
        this.nextAfterimage = time + PLAYER.dash.afterimageEveryMs;
        this.afterimage();
      }
    } else if (time > this.attackingUntil - 60) {
      v.x = approach(v.x, tx, a);
      v.y = approach(v.y, ty, a);
    } else {
      v.x *= 0.8; v.y *= 0.8;
    }
    if (moving) {
      this.aim.set(input.x, input.y).normalize();
      if (Math.abs(input.x) > 0.15) this.facing = Math.sign(input.x);
      if (!dashing) this.slideAroundCorners(input, dt);
    }

    if (time > this.attackingUntil) {
      const key = moving ? 'walk' : 'idle';
      const cur = this.sprite.anims.currentAnim?.key;
      if (cur !== anim(this.key, key) && !(cur === anim(this.key, 'hurt') && time < this.invulnUntil - PLAYER.invulnMs + 250)) {
        this.sprite.play(anim(this.key, key), true);
      }
    }
    this.sprite.setFlipX(this.facing < 0);

    if (moving && !dashing) {
      this.stepTimer -= dt;
      if (this.stepTimer <= 0) {
        this.stepTimer = 170;
        const surface = this.scene.surfaceAt(this.x, this.y);
        if (surface === 'water') this.scene.splash(this.x, this.y + 2, false);
        else this.scene.fx.dust(this.x - this.facing * 3, this.y + 2, 2);
        sound.step(surface);
      }
    }

    if (!this.locked && input.dash && time >= this.dashReadyAt) this.dash(time, input);
    if (input.attack) this.attackBufferedUntil = time + 200;
    if (!this.locked && time < this.attackBufferedUntil && time >= this.attackReadyAt) {
      this.attackBufferedUntil = 0;
      if (!this.scene.tryInteract()) this.attack(time);
    }

    // Out of danger for a moment: health slowly comes back
    const { delayMs, everyMs } = PLAYER.regen;
    if (!this.dead && this.hp < PLAYER.maxHp && time - this.lastHurtAt > delayMs && time >= this.nextRegenAt) {
      if (this.nextRegenAt > 0) {
        this.hp += 1;
        this.scene.fx.sparks(this.x, this.y - 8, WARM, 4);
        sound.regen();
      }
      this.nextRegenAt = time + everyMs;
    }

    // Health shows as damage, not as fading: the glow and light turn from warm to red as hp drops, the light
    // only shrinks a little, and a hurt body sheds sparks and smoke (faster the worse it is) with a red flicker.
    const frac = this.hp / PLAYER.maxHp;
    const hurt = 1 - frac;
    this.light.radius = (80 + 20 * frac) * PLAYER.lightRadius * this.mod('light') * stat(session.replicant, 'light');
    this.light.intensity = 1;
    const col = Phaser.Display.Color.Interpolate.ColorWithColor(WARM_RGB, HURT_RGB, 100, Math.round(hurt * 100));
    const colNum = Phaser.Display.Color.GetColor(col.r, col.g, col.b);
    this.light.color = this.hologram ? 0x9fe8ff : colNum;
    // The halo is the health readout: it dims and tightens as hp drops (and turns red); the pool fades less.
    this.glow.setTint(colNum).setAlpha(0.3 - 0.16 * hurt).setScale(0.45 - 0.1 * hurt);
    this.pool.setTint(colNum).setAlpha(0.07 - 0.04 * hurt);
    if (hurt > 0 && !this.dead && time > this.nextDamageFx) {
      this.nextDamageFx = time + (frac <= 0.4 ? 180 : 700) / (0.5 + hurt);
      const sx = this.x + (Math.random() - 0.5) * 8, sy = this.y - 4 - Math.random() * 10;
      if (Math.random() < 0.6) this.scene.fx.sparks(sx, sy, Math.random() < 0.5 ? PALETTE[8] : PALETTE[11], 2);
      else {
        const puff = this.scene.add.image(sx, sy, 'px').setTint(PALETTE[22]).setAlpha(0.55).setDepth(6090).setScale(1.2);
        this.scene.tweens.add({ targets: puff, y: sy - 10, alpha: 0, scale: 2.2, duration: 700, ease: 'Sine.easeOut', onComplete: () => puff.destroy() });
      }
      if (frac <= 0.4 && Math.random() < 0.5) this.lowHpFlickerUntil = time + 60;
    }

    // The body is always solid: never hidden, never faded. Invulnerability after a hit shows as an opaque red
    // pulse (not while dashing: the trail already shows it), low health as a quick red flicker.
    this.sprite.setVisible(!this.hidden);
    this.applyTint(time, dashing);
    if (this.hologram) this.sprite.setAlpha(Math.random() < 0.04 ? 0.5 : 0.85);
    this.syncVisuals();
  }

  /** One place decides the body tint so no effect can leave the sprite in a half state. */
  private applyTint(time: number, dashing: boolean) {
    const s = this.sprite;
    if (time < this.hurtFlashUntil) { s.setTintFill(0xffffff); return; }
    if (!dashing && !this.hologram && time < this.invulnUntil && Math.floor(time / 70) % 2 === 0) { s.setTint(0xff8080); return; }
    if (time < this.lowHpFlickerUntil && !this.hologram) { s.setTint(0xff6a6a); return; }
    if (this.hologram) { s.setTint(0x9fe8ff); return; }
    s.clearTint();
  }

  /**
   * Pushing into the edge of a tree, rock or building: if one side of what you are pressing against is open,
   * ease the body that way so you slip around the corner instead of sticking to it.
   */
  private slideAroundCorners(input: InputFrame, dt: number) {
    const b = this.body;
    const hit = { l: b.blocked.left || b.touching.left, r: b.blocked.right || b.touching.right, u: b.blocked.up || b.touching.up, d: b.blocked.down || b.touching.down };
    const step = 70 * dt / 1000;
    const half = b.halfHeight + 2, halfW = b.halfWidth + 2;
    if ((hit.l && input.x < 0) || (hit.r && input.x > 0)) {
      const px = this.x + (hit.l ? -1 : 1) * (halfW + 4);
      const upFree = !this.scene.blockedAt(px, this.y - half - 3), downFree = !this.scene.blockedAt(px, this.y + half + 3);
      if (upFree && !downFree && input.y <= 0.3) b.y -= step;
      else if (downFree && !upFree && input.y >= -0.3) b.y += step;
    }
    if ((hit.u && input.y < 0) || (hit.d && input.y > 0)) {
      const py = this.y + (hit.u ? -1 : 1) * (half + 4);
      const leftFree = !this.scene.blockedAt(this.x - halfW - 3, py), rightFree = !this.scene.blockedAt(this.x + halfW + 3, py);
      if (leftFree && !rightFree && input.x <= 0.3) b.x -= step;
      else if (rightFree && !leftFree && input.x >= -0.3) b.x += step;
    }
  }

  /** Multiplier from collected modules (ruins): light, dash, swing. */
  mod(kind: 'light' | 'dash' | 'swing') {
    const mods = session.replicant?.traits.mods ?? [];
    return 1 + mods.filter((m) => m === kind).length * 0.2;
  }

  private attack(time: number) {
    // Combo: attacks in quick succession chain up to a heavy third swing
    this.combo = time - this.lastAttackAt < PLAYER.attack.comboWindowMs && this.combo < 3 ? this.combo + 1 : 1;
    const heavy = this.combo === 3;
    this.lastAttackAt = time;
    this.attackReadyAt = time + (heavy ? PLAYER.attack.heavy.cooldownMs : PLAYER.attack.cooldownMs);
    this.attackingUntil = time + (heavy ? 220 : 150);
    this.dashUntil = 0;
    // gentle auto-aim: if standing still, swing toward the nearest target in reach
    const target = this.scene.nearestTarget(this.x, this.y, 46);
    if (target && this.body.velocity.length() < 10) {
      this.aim.set(target.x - this.x, target.y - this.y).normalize();
      if (Math.abs(this.aim.x) > 0.2) this.facing = Math.sign(this.aim.x);
    }
    this.sprite.play(anim(this.key, 'attack'), true);
    const lunge = heavy ? 130 : 60;
    this.body.velocity.x += this.aim.x * lunge;
    this.body.velocity.y += this.aim.y * lunge;
    const { reach } = PLAYER.attack;
    const radius = PLAYER.attack.radius * this.mod('swing') * (heavy ? PLAYER.attack.heavy.radiusScale : 1);
    const r = reach * (heavy ? 1.2 : 1);
    const hx = this.x + this.aim.x * r, hy = this.y - 5 + this.aim.y * r;
    this.scene.fx.slash(hx, hy, this.aim, heavy ? 1.45 : 1, this.combo === 2);
    if (heavy) squash(this.scene, this.sprite, 1.35, 0.75, 120);
    else squash(this.scene, this.sprite, 1.2, 0.85, 90);
    sound.swing(heavy);
    this.scene.resolveAttack(hx, hy, radius, this.aim, heavy);
  }

  private dash(time: number, input: InputFrame) {
    const d = input.dashDir ?? (input.x || input.y ? { x: input.x, y: input.y } : { x: this.aim.x, y: this.aim.y });
    this.dashDir.set(d.x, d.y);
    if (this.dashDir.lengthSq() < 0.01) this.dashDir.set(this.facing, 0);
    this.dashDir.normalize();
    this.aim.copy(this.dashDir);
    if (Math.abs(this.dashDir.x) > 0.15) this.facing = Math.sign(this.dashDir.x);
    this.dashUntil = time + PLAYER.dash.ms;
    this.dashReadyAt = time + PLAYER.dash.cooldownMs;
    this.attackingUntil = 0;
    this.nextAfterimage = 0;
    this.scene.fx.dust(this.x, this.y + 2, 6);
    squash(this.scene, this.sprite, 1.4, 0.7, 100);
    sound.dash();
  }

  /** Hologram look for visits while your ship is flying: cool tint and a gentle flicker. */
  setHologram() {
    this.hologram = true;
    this.sprite.setTint(0x9fe8ff);
    this.light.color = 0x9fe8ff;
  }

  /** Gone into the vessel: no light, glow or shadow left behind. */
  hide() {
    this.locked = true;
    this.light.intensity = 0;
    this.light.active = false;
    this.glow.setVisible(false);
    this.pool.setVisible(false);
    this.shadow.setVisible(false);
    this.gear?.image.setVisible(false);
    this.sprite.setVisible(false);
    this.hidden = true;
  }

  /** Back out of the vessel or the cradle: light, glow and shadow return (the caller unlocks when its intro ends). */
  show() {
    this.hidden = false;
    this.light.active = true;
    this.glow.setVisible(true);
    this.pool.setVisible(true);
    this.shadow.setVisible(true);
    this.gear?.image.setVisible(true);
    this.sprite.setVisible(true);
    this.syncVisuals();
  }

  get dashing() { return this.scene.time.now < this.dashUntil; }
  /** Inside the vessel or the cradle (nothing of the body is drawn). */
  get isHidden() { return this.hidden; }

  private afterimage() {
    const s = this.sprite;
    const ghost = this.scene.add.image(s.x, s.y, s.texture.key, s.frame.name).setOrigin(0.5, 1).setFlipX(s.flipX)
      .setTintFill(this.featureColor).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.55).setDepth(s.depth - 1);
    this.scene.tweens.add({ targets: ghost, alpha: 0, duration: 220, onComplete: () => ghost.destroy() });
  }

  hurt(fromX: number, fromY: number, damage: number) {
    const now = this.scene.time.now;
    if (this.dead || this.locked || now < this.invulnUntil || now < this.dashUntil) return;
    this.invulnUntil = now + PLAYER.invulnMs;
    this.hp = Math.max(0, this.hp - damage);
    this.lastHurtAt = now;
    this.nextRegenAt = 0;
    const dir = new Phaser.Math.Vector2(this.x - fromX, this.y - fromY).normalize();
    this.body.velocity.set(dir.x * 190, dir.y * 190);
    this.sprite.play(anim(this.key, 'hurt'), true);
    sound.hurt();
    this.hurtFlashUntil = now + 90;
    this.sprite.setTintFill(0xffffff);
    squash(this.scene, this.sprite, 0.75, 1.25, 110);
    this.scene.hitStop(100);
    this.scene.shake(120, 0.004);
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
    this.pool.setPosition(x, y + 1);
    this.light.x = x;
    this.light.y = y + this.headY;
    this.gear?.sync();
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
