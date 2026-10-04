// Real-time day and night, sunbeams, fireflies and rain. The device clock picks the time of day; rain follows
// a schedule seeded by the real date and hour so the whole family sees the same weather.
import Phaser from 'phaser';
import { sound } from '../audio/Sound';
import { DAYCYCLE, PALETTE, hex, type PlanetDef } from '../core/data';
import type { Atmosphere } from './Atmosphere';
import type { Light, Lighting } from './Lighting';
import { makeRays, makeWeatherBits, rgb } from './textures';

interface Firefly { x: number; y: number; vx: number; vy: number; phase: number; light?: Light; dot: Phaser.GameObjects.Image }

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
function mix(c1: number, c2: number, t: number) {
  const a = rgb(c1), b = rgb(c2);
  return (Math.round(lerp(a[0], b[0], t)) << 16) | (Math.round(lerp(a[1], b[1], t)) << 8) | Math.round(lerp(a[2], b[2], t));
}
const scale = (c: number, f: number) => mix(0, c, f);

/** Hour of day (0..24, fractional) from ?hour=, else the device clock. */
export function currentHour(fallback?: number) {
  const q = new URLSearchParams(location.search).get('hour');
  if (q !== null && !isNaN(Number(q))) return Number(q);
  if (fallback !== undefined) return fallback;
  const d = new Date();
  return d.getHours() + d.getMinutes() / 60;
}

/** Same answer for everyone during a given real hour. */
function rainingNow() {
  const params = new URLSearchParams(location.search);
  const q = params.get('rain');
  if (q !== null) return q !== '0';
  if (params.has('shot')) return false;
  const d = new Date();
  let h = (d.getFullYear() * 400 + d.getMonth() * 32 + d.getDate()) * 24 + d.getHours();
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296 < DAYCYCLE.rainChance;
}

export class Environment {
  night = 0;
  private hour: number;
  private fixedHour: boolean;
  private rays?: Phaser.GameObjects.TileSprite;
  private sun?: Phaser.GameObjects.Rectangle;
  private fireflies: Firefly[] = [];
  private rain?: Phaser.GameObjects.Particles.ParticleEmitter;
  private ripples?: Phaser.GameObjects.Particles.ParticleEmitter;
  private flash?: Phaser.GameObjects.Rectangle;
  private raining = false;
  private rainLevel = 0;
  private t = 0;
  private nextThunder = 0;
  private recheckAt = 0;
  private low = false;

  /** Slow device: drop the full-screen sunbeams and firefly lights. */
  setLowQuality() {
    this.low = true;
    this.rays?.setVisible(false);
  }

  constructor(private scene: Phaser.Scene, private planet: PlanetDef, private lighting: Lighting, private atmosphere: Atmosphere,
    private isGround: (x: number, y: number) => boolean, shotHour?: number) {
    const { width: w, height: h } = scene.scale;
    this.fixedHour = new URLSearchParams(location.search).has('hour') || shotHour !== undefined;
    this.hour = currentHour(shotHour);
    if (!planet.dayCycle) return;

    makeRays(scene);
    makeWeatherBits(scene);
    this.rays = scene.add.tileSprite(0, 0, w, h, 'rays').setOrigin(0).setScrollFactor(0)
      .setBlendMode(Phaser.BlendModes.ADD).setDepth(6110).setAlpha(0);

    // warm daylight lift on top of the darkness layer (tiles are authored dark, this makes noon feel sunny)
    this.sun = scene.add.rectangle(0, 0, w, h, 0xffd9a0).setOrigin(0).setScrollFactor(0)
      .setBlendMode(Phaser.BlendModes.ADD).setDepth(6105).setAlpha(0);
    for (let i = 0; i < DAYCYCLE.fireflies; i++) {
      // only every other firefly casts light: cheaper, and the dots alone still read as fireflies
      const light = i % 2 === 0 ? lighting.add({ x: 0, y: 0, radius: 16, color: PALETTE[11], intensity: 0 }) : undefined;
      const dot = scene.add.image(0, 0, 'px1').setTint(PALETTE[11]).setBlendMode(Phaser.BlendModes.ADD).setDepth(6125).setAlpha(0);
      const f: Firefly = { x: 0, y: 0, vx: 0, vy: 0, phase: Math.random() * 10, light, dot };
      this.placeFirefly(f, true);
      this.fireflies.push(f);
    }

    if (planet.weather) {
      const zone = new Phaser.Geom.Rectangle(-60, -30, w + 120, 10);
      this.rain = scene.add.particles(0, 0, 'drop', {
        emitZone: { type: 'random', source: zone, quantity: 1 } as Phaser.Types.GameObjects.Particles.EmitZoneData,
        frequency: 6, quantity: 2,
        lifespan: { min: 500, max: 800 },
        speedY: { min: 300, max: 380 }, speedX: { min: -70, max: -50 },
        alpha: { min: 0.3, max: 0.7 },
        emitting: false,
      }).setDepth(6130);
      this.ripples = scene.add.particles(0, 0, 'ring', {
        lifespan: 450,
        scale: { start: 0.2, end: 1 },
        alpha: { start: 0.5, end: 0 },
        tint: PALETTE[20],
        emitting: false,
      }).setDepth(60);
      this.flash = scene.add.rectangle(0, 0, w, h, 0xdde8ff).setOrigin(0).setScrollFactor(0).setDepth(6140).setAlpha(0)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.setRaining(rainingNow());
    }
    this.apply();
  }

  private setRaining(on: boolean) {
    this.raining = on;
    if (on) this.rain?.start(); else this.rain?.stop();
  }

  private placeFirefly(f: Firefly, anywhere = false) {
    const cam = this.scene.cameras.main;
    const v = cam.worldView;
    const w = v.width || this.scene.scale.width, h = v.height || this.scene.scale.height;
    if (anywhere || Math.random() < 0.5) { f.x = v.x + Math.random() * w; f.y = v.y + Math.random() * h; }
    else {
      const side = Math.floor(Math.random() * 4);
      f.x = v.x + (side === 0 ? -10 : side === 1 ? w + 10 : Math.random() * w);
      f.y = v.y + (side === 2 ? -10 : side === 3 ? h + 10 : Math.random() * h);
    }
    f.vx = (Math.random() - 0.5) * 10; f.vy = (Math.random() - 0.5) * 10;
  }

  /** Interpolate the day keyframes at the current hour. */
  private apply() {
    const keys = DAYCYCLE.keys;
    const hr = ((this.hour % 24) + 24) % 24;
    let i = 0;
    while (i < keys.length - 2 && keys[i + 1].hour <= hr) i++;
    const a = keys[i], b = keys[i + 1];
    const t = (hr - a.hour) / (b.hour - a.hour);
    let ambient = mix(hex(a.ambient), hex(b.ambient), t);
    const sky = mix(hex(a.sky), hex(b.sky), t);
    this.night = lerp(a.night, b.night, t);
    ambient = scale(ambient, lerp(1, DAYCYCLE.rainDarken, this.rainLevel));
    this.lighting.setAmbient(ambient);
    this.atmosphere.sky.setTint(sky);
    const starAlpha = Math.max(0.15, this.night) * (1 - this.rainLevel * 0.8);
    this.atmosphere.starsFar.setAlpha(starAlpha);
    this.atmosphere.starsNear.setAlpha(starAlpha);
    sound.setNight(this.night);
  }

  update(dt: number) {
    if (!this.planet.dayCycle) return;
    this.t += dt / 1000;
    const now = this.scene.time.now;
    if (now > this.recheckAt) {
      this.recheckAt = now + 30_000;
      if (!this.fixedHour) this.hour = currentHour();
      if (this.planet.weather && !new URLSearchParams(location.search).has('rain')) {
        const r = rainingNow();
        if (r !== this.raining) this.setRaining(r);
      }
    }
    this.rainLevel = Phaser.Math.Clamp(this.rainLevel + (this.raining ? 1 : -1) * dt / 6000, 0, 1);
    sound.setRain(this.rainLevel);
    this.apply();

    const cam = this.scene.cameras.main;
    const v = cam.worldView;
    const day = 1 - this.night;
    this.sun?.setAlpha(DAYCYCLE.sunLift * day * day * (1 - this.rainLevel * 0.7));
    if (this.rays) {
      this.rays.setAlpha(0.13 * day * (1 - this.rainLevel));
      this.rays.tilePositionX = cam.scrollX * 0.6 + this.t * 3;
      this.rays.tilePositionY = cam.scrollY * 0.6;
    }
    this.rain?.setPosition(cam.scrollX, cam.scrollY);

    // Lightning, only at night while it rains
    if (this.flash && this.rainLevel > 0.8 && this.night > 0.6 && this.t > this.nextThunder) {
      if (this.nextThunder > 0) {
        this.scene.tweens.add({ targets: this.flash, alpha: { from: 0.35, to: 0 }, duration: 500, ease: 'Expo.easeOut' });
        this.scene.time.delayedCall(700 + Math.random() * 1200, () => sound.thunder());
      }
      this.nextThunder = this.t + 20 + Math.random() * 40;
    }

    // Ripples where drops land on open ground
    if (this.ripples && this.rainLevel > 0.2) {
      const n = Math.random() < this.rainLevel ? 2 : 0;
      for (let i = 0; i < n; i++) {
        const x = v.x + Math.random() * v.width, y = v.y + Math.random() * v.height;
        if (this.isGround(x, y)) this.ripples.emitParticleAt(x, y);
      }
    }

    // Fireflies drift and blink at night
    const glow = Math.max(0, (this.night - 0.3) / 0.7) * (1 - this.rainLevel * 0.7);
    for (const f of this.fireflies) {
      f.phase += dt / 1000;
      f.vx += (Math.random() - 0.5) * 30 * dt / 1000;
      f.vy += (Math.random() - 0.5) * 30 * dt / 1000;
      f.vx = Phaser.Math.Clamp(f.vx, -12, 12); f.vy = Phaser.Math.Clamp(f.vy, -12, 12);
      f.x += f.vx * dt / 1000; f.y += f.vy * dt / 1000;
      if (f.x < v.x - 30 || f.x > v.right + 30 || f.y < v.y - 30 || f.y > v.bottom + 30) this.placeFirefly(f);
      const blink = Math.max(0, Math.sin(f.phase * 1.7) * 0.6 + Math.sin(f.phase * 0.7) * 0.6);
      const a = Math.min(1, blink) * glow;
      f.dot.setPosition(Math.round(f.x), Math.round(f.y)).setAlpha(a);
      if (f.light) { f.light.x = f.x; f.light.y = f.y; f.light.intensity = this.low ? 0 : a * 0.7; }
    }
  }
}
