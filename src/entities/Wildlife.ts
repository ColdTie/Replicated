// Peaceful creatures that make a planet feel alive: grazers you can pet, birds that scatter, butterflies by day.
import Phaser from 'phaser';
import { sound } from '../audio/Sound';
import { anim, tex } from '../core/assets';
import { PALETTE } from '../core/data';
import { isKid } from '../core/session';
import type { Light } from '../fx/Lighting';
import type { PlanetScene } from '../scenes/PlanetScene';
import { squash } from './Player';

type Pt = { x: number; y: number };

/** Moss deer. Walk into it to pet it: it hops, hearts float up. In kid mode it then follows you around. */
export class Grazer {
  readonly sprite: Phaser.GameObjects.Sprite;
  private shadow: Phaser.GameObjects.Image;
  private antlers: Light;
  private texKey: string;
  private target: Pt | null = null;
  private nextThink = 0;
  private petReadyAt = 0;
  private followUntil = 0;
  private happyUntil = 0;
  x: number; y: number;

  constructor(private scene: PlanetScene, x: number, y: number) {
    this.x = x; this.y = y;
    this.texKey = tex('grazer', scene.planet.id);
    this.shadow = scene.add.image(x, y, 'shadow').setAlpha(0.45).setTint(PALETTE[25]).setDepth(50).setScale(1.3, 1);
    this.sprite = scene.add.sprite(x, y, this.texKey).setOrigin(0.5, 1).play(anim(this.texKey, 'idle'));
    this.sprite.anims.setProgress(Math.random());
    // the antler tips glow faintly so they show up at night
    this.antlers = scene.lighting.add({ x, y, radius: 12, color: PALETTE[11], intensity: 0.35, flicker: 0.3 });
  }

  update(time: number, dt: number) {
    const p = this.scene.player;
    const dp = Math.hypot(p.x - this.x, p.y - this.y);

    if (time > this.petReadyAt && p.alive && dp < 13) this.pet(time);

    if (time > this.nextThink && time > this.happyUntil) {
      this.nextThink = time + 1500 + Math.random() * 3000;
      if (time < this.followUntil && dp > 26) this.target = { x: p.x - p.facing * 16, y: p.y + 4 };
      else if (Math.random() < 0.45) {
        const a = Math.random() * Math.PI * 2, r = 20 + Math.random() * 30;
        this.target = { x: this.x + Math.cos(a) * r, y: this.y + Math.sin(a) * r * 0.6 };
      } else this.target = null;
    }
    if (time < this.followUntil && dp > 40) this.target = { x: p.x - p.facing * 16, y: p.y + 4 };

    let moving = false;
    if (this.target && time > this.happyUntil) {
      const dx = this.target.x - this.x, dy = this.target.y - this.y, d = Math.hypot(dx, dy);
      const speed = time < this.followUntil && dp > 40 ? 70 : 22;
      if (d < 2) this.target = null;
      else {
        const nx = this.x + (dx / d) * speed * dt / 1000, ny = this.y + (dy / d) * speed * dt / 1000;
        if (this.scene.isWalkable(nx, ny) && this.scene.surfaceAt(nx, ny) !== 'water') {
          this.x = nx; this.y = ny; moving = true;
          if (Math.abs(dx) > 1) this.sprite.setFlipX(dx < 0);
        } else this.target = null;
      }
    }
    if (time > this.happyUntil) {
      const want = anim(this.texKey, moving ? 'walk' : 'idle');
      if (this.sprite.anims.currentAnim?.key !== want) this.sprite.play(want);
    }
    const x = Math.round(this.x), y = Math.round(this.y);
    this.sprite.setPosition(x, y + 2).setDepth(100 + y);
    this.shadow.setPosition(x, y + 1);
    this.antlers.x = x + (this.sprite.flipX ? -3 : 3);
    this.antlers.y = y - 13;
  }

  private pet(time: number) {
    this.petReadyAt = time + 1800;
    this.happyUntil = time + 700;
    if (isKid()) this.followUntil = time + 25_000;
    this.target = null;
    this.sprite.play(anim(this.texKey, 'happy'));
    squash(this.scene, this.sprite, 0.8, 1.25, 140);
    this.scene.tweens.add({ targets: this.sprite, y: this.sprite.y - 6, duration: 160, yoyo: true, ease: 'Quad.easeOut' });
    for (let i = 0; i < 3; i++) {
      const h = this.scene.add.image(this.x + (i - 1) * 6, this.y - 16, 'heart').setDepth(6300).setAlpha(0);
      this.scene.tweens.add({ targets: h, y: h.y - 16 - i * 3, alpha: { from: 1, to: 0 }, delay: i * 120, duration: 900, ease: 'Quad.easeOut', onComplete: () => h.destroy() });
    }
    sound.pet();
  }
}

interface Bird { s: Phaser.GameObjects.Sprite; x: number; y: number; vx: number; vy: number; peckAt: number }

/** A little flock on the ground. Gets spooked when you come close (more so when dashing) and flies off. */
export class Flock {
  private birds: Bird[] = [];
  private flying = false;
  private returnAt = 0;

  constructor(private scene: PlanetScene, private spot: () => Pt | null, size: number) {
    for (let i = 0; i < size; i++) {
      const s = scene.add.sprite(0, 0, 'bird').setOrigin(0.5, 1).play('bird:sit');
      s.anims.setProgress(Math.random());
      this.birds.push({ s, x: 0, y: 0, vx: 0, vy: 0, peckAt: 0 });
    }
    this.land(false);
  }

  private land(fromSky: boolean) {
    const c = this.spot();
    if (!c) return;
    this.flying = false;
    for (const b of this.birds) {
      b.x = c.x + (Math.random() - 0.5) * 24;
      b.y = c.y + (Math.random() - 0.5) * 14;
      b.s.play('bird:sit').setFlipX(Math.random() < 0.5);
      b.s.setPosition(Math.round(b.x), Math.round(b.y)).setDepth(100 + b.y).setVisible(true);
      if (fromSky) {
        b.s.y -= 120;
        this.scene.tweens.add({ targets: b.s, y: Math.round(b.y), duration: 1200 + Math.random() * 400, ease: 'Sine.easeOut' });
      }
    }
  }

  update(time: number, dt: number) {
    const p = this.scene.player;
    if (!this.flying) {
      const near = this.birds.some((b) => Math.hypot(p.x - b.x, p.y - b.y) < (p.dashing ? 70 : 38));
      if (near && p.alive) this.scatter(time);
      return;
    }
    let anyVisible = false;
    const view = this.scene.cameras.main.worldView;
    for (const b of this.birds) {
      b.vy -= 40 * dt / 1000;
      b.x += b.vx * dt / 1000; b.y += b.vy * dt / 1000;
      b.s.setPosition(Math.round(b.x), Math.round(b.y));
      if (Phaser.Geom.Rectangle.Contains(view, b.x, b.y)) anyVisible = true;
    }
    if (!anyVisible && time > this.returnAt) this.land(true);
  }

  private scatter(time: number) {
    this.flying = true;
    this.returnAt = time + 15_000 + Math.random() * 15_000;
    const p = this.scene.player;
    for (const b of this.birds) {
      const away = Math.sign(b.x - p.x) || 1;
      b.vx = away * (40 + Math.random() * 50);
      b.vy = -40 - Math.random() * 40;
      b.s.play('bird:fly').setFlipX(away < 0).setDepth(5900);
    }
    this.scene.fx.dust(this.birds[0].x, this.birds[0].y, 6);
    sound.flutter();
  }
}

interface Butterfly { s: Phaser.GameObjects.Sprite; home: Pt; t: number; speed: number; r: number }

/** Butterflies circle flowers by day and fade out at night (the fireflies take over). */
export class Butterflies {
  private list: Butterfly[] = [];

  constructor(private scene: PlanetScene, homes: Pt[]) {
    const tints = [0xffffff, 0xffe080, 0xa0e8ff];
    for (const h of homes) {
      const s = scene.add.sprite(h.x, h.y, 'butterfly').play('butterfly:fly').setTint(tints[Math.floor(Math.random() * tints.length)]);
      s.anims.setProgress(Math.random());
      this.list.push({ s, home: { ...h }, t: Math.random() * 10, speed: 0.6 + Math.random() * 0.6, r: 8 + Math.random() * 10 });
    }
  }

  update(dt: number, night: number) {
    const p = this.scene.player;
    const a = Math.max(0, 1 - night * 1.6);
    for (const b of this.list) {
      b.t += dt / 1000 * b.speed;
      // drift toward the player a little when close: they like the light
      const dp = Math.hypot(p.x - b.home.x, p.y - b.home.y);
      if (dp < 50) { b.home.x += (p.x - b.home.x) * 0.002; b.home.y += (p.y - 14 - b.home.y) * 0.002; }
      const x = b.home.x + Math.cos(b.t * 1.3) * b.r + Math.sin(b.t * 3.1) * 3;
      const y = b.home.y - 10 + Math.sin(b.t * 1.7) * b.r * 0.5 + Math.cos(b.t * 4.3) * 2;
      b.s.setPosition(Math.round(x), Math.round(y)).setDepth(100 + b.home.y + 4).setAlpha(a).setVisible(a > 0.02);
    }
  }
}
