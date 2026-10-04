// In flight between stars. Departure shows the planet from orbit, then the warp; the cruise shows the ship,
// streaking stars and the time left (real time). Settled planets can be visited while you wait. On arrival the
// destination planet grows on screen and the ship lands.
import Phaser from 'phaser';
import { sound } from '../audio/Sound';
import { PALETTE, type PlanetDef } from '../core/data';
import { isKid, session } from '../core/session';
import { valueNoise } from '../core/rng';
import { rgb } from '../fx/textures';
import type { Journey } from '../net/store';
import { TRAVEL, formatDuration, planetFor, starById } from '../world/galaxy';
import type { StarMapData } from './StarMapScene';

export interface TravelData { journey: Journey; depart?: boolean }

interface Streak { x: number; y: number; speed: number; layer: number }

export class TravelScene extends Phaser.Scene {
  private j!: Journey;
  private depart = false;
  private g!: Phaser.GameObjects.Graphics;
  private ship!: Phaser.GameObjects.Sprite;
  private thrust!: Phaser.GameObjects.Particles.ParticleEmitter;
  private streaks: Streak[] = [];
  private warp = 0;          // 0 = drifting in orbit, 1 = full warp
  private globe?: Globe;
  private globeImg?: Phaser.GameObjects.Image;
  private dest?: Globe;
  private destImg?: Phaser.GameObjects.Image;
  private eta!: Phaser.GameObjects.BitmapText;
  private ui!: Phaser.GameObjects.Container;
  private arriving = false;
  private t = 0;
  private nextGlobeAt = 0;

  constructor() { super('travel'); }

  init(d: TravelData) {
    this.j = d.journey;
    this.depart = !!d.depart;
    this.warp = this.depart ? 0 : 1;
    this.arriving = false;
    this.streaks = [];
    this.globe = undefined; this.dest = undefined;
    this.globeImg = undefined; this.destImg = undefined;
  }

  create() {
    const { width: w, height: h } = this.scale;
    this.cameras.main.setBackgroundColor(PALETTE[25]);
    this.cameras.main.fadeIn(600, 24, 20, 37);
    this.g = this.add.graphics();
    for (let i = 0; i < 140; i++) {
      const layer = i % 3;
      this.streaks.push({ x: Math.random() * w, y: Math.random() * h, speed: [8, 20, 45][layer] * (0.8 + Math.random() * 0.4), layer });
    }

    const from = planetFor(this.j.from_star, this.j.from_star === 'sol' ? 3 : TRAVEL.landedPlanetIndex);
    const to = planetFor(this.j.to_star, TRAVEL.landedPlanetIndex);
    if (this.depart && from) {
      this.globe = new Globe(this, 'globe.from', 120, from, this.j.from_star === 'sol');
      this.globeImg = this.add.image(w * 0.3, h * 0.62, 'globe.from');
    }
    if (to) {
      this.dest = new Globe(this, 'globe.to', 120, to, false);
      this.destImg = this.add.image(w * 0.86, h * 0.45, 'globe.to').setScale(0.02).setAlpha(0);
    }

    this.thrust = this.add.particles(0, 0, 'px', {
      lifespan: { min: 250, max: 500 }, speedX: { min: -90, max: -50 }, speedY: { min: -8, max: 8 },
      scale: { start: 1.4, end: 0 }, tint: [PALETTE[10], PALETTE[9], PALETTE[11]], blendMode: Phaser.BlendModes.ADD, frequency: 25,
    });
    this.ship = this.add.sprite(w * 0.38, h * 0.5, 'vessel').play('vessel:idle');

    // Bottom: route bar with the ship marker and the time left
    const fromName = starById(this.j.from_star)?.name ?? '?', toName = starById(this.j.to_star)?.name ?? '?';
    this.eta = this.add.bitmapText(w / 2, h - 34, 'pixel', '').setOrigin(0.5, 0).setTint(PALETTE[20]);
    const left = this.add.bitmapText(14, h - 18, 'pixel', fromName).setTint(PALETTE[21]);
    const right = this.add.bitmapText(w - 14, h - 18, 'pixel', toName).setOrigin(1, 0).setTint(PALETTE[11]);
    this.ui = this.add.container(0, 0, [this.eta, left, right]).setAlpha(this.depart ? 0 : 1);

    // Map button (top right) and visits to settled planets (top left)
    const mapBtn = this.add.container(w - 22, 18, [
      this.add.circle(0, 0, 12, PALETTE[24], 0.85).setStrokeStyle(1, PALETTE[18]),
      this.add.circle(-4, -2, 1.5, PALETTE[11]), this.add.circle(3, 3, 1.5, PALETTE[20]), this.add.circle(4, -4, 1, PALETTE[18]),
    ]).setSize(26, 26).setInteractive({ useHandCursor: true });
    mapBtn.on('pointerdown', () => this.openMap());
    this.ui.add(mapBtn);
    void this.addVisits();

    if (this.depart) this.playDeparture();
    sound.setNight(1);
  }

  private async addVisits() {
    const st = session.store;
    if (!st) return;
    let reps;
    try { reps = await st.listReplicants(); } catch { return; }
    // planets with someone living there (copies or family) can be visited as a hologram while you fly
    const stars = [...new Set(reps.filter((r) => r.status !== 'in_transit').map((r) => r.star_id))].slice(0, 4);
    stars.forEach((sid, i) => {
      const p = planetFor(sid, sid === 'sol' ? 3 : TRAVEL.landedPlanetIndex);
      if (!p || !this.scene.isActive()) return;
      const x = 22 + i * 34, y = 22;
      const key = `globe.visit.${sid}`;
      new Globe(this, key, 22, p, sid === 'sol');
      const icon = this.add.image(0, 0, key);
      const ring = this.add.circle(0, 0, 13, 0x000000, 0).setStrokeStyle(1, PALETTE[9], 0.8);
      const name = this.add.bitmapText(0, 15, 'pixel', p.name.split(' ')[0]).setOrigin(0.5, 0).setTint(PALETTE[21]);
      const c = this.add.container(x, y, [icon, ring, name]).setSize(28, 28).setInteractive({ useHandCursor: true });
      c.on('pointerdown', () => this.visit(sid, p));
      this.ui.add(c);
    });
  }

  private visit(star: string, p: PlanetDef) {
    sound.coreHum();
    this.cameras.main.fadeOut(400, 24, 20, 37);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start('planet', { visit: { star, planetIndex: p.planetIndex } });
    });
  }

  private openMap() {
    this.scene.pause();
    const data: StarMapData = {
      mode: 'view', from: this.j.from_star, journey: this.j,
      onClose: () => this.scene.resume(),
    };
    this.scene.launch('starmap', data);
  }

  /** Orbit, ship pulls away, then the stars stretch into warp. */
  private playDeparture() {
    const { width: w, height: h } = this.scale;
    this.ship.setPosition(w * 0.3, h * 0.62).setScale(0.3);
    this.tweens.add({ targets: this.ship, x: w * 0.38, y: h * 0.5, scale: 1, duration: 2600, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: this.globeImg, x: w * 0.1, y: h * 0.85, scale: 0.6, duration: 4500, ease: 'Sine.easeIn' });
    this.time.delayedCall(2600, () => {
      sound.dash();
      this.tweens.add({ targets: this, warp: 1, duration: 1800, ease: 'Quad.easeIn' });
      this.tweens.add({ targets: this.globeImg, alpha: 0, x: -80, duration: 1500, ease: 'Quad.easeIn' });
      this.time.delayedCall(1500, () => {
        this.cameras.main.flash(250, 200, 230, 255);
        this.tweens.add({ targets: this.ui, alpha: 1, duration: 800 });
      });
    });
  }

  private arrive() {
    if (this.arriving) return;
    this.arriving = true;
    const { width: w, height: h } = this.scale;
    sound.birth();
    this.tweens.add({ targets: this, warp: 0.05, duration: 1500, ease: 'Quad.easeOut' });
    this.tweens.add({ targets: this.ui, alpha: 0, duration: 600 });
    this.destImg?.setAlpha(1);
    this.tweens.add({ targets: this.destImg, scale: 1.6, x: w * 0.62, y: h * 0.55, duration: 3200, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: this.ship, x: w * 0.6, y: h * 0.52, scale: 0.15, duration: 3200, ease: 'Sine.easeIn' });
    this.time.delayedCall(3000, () => {
      this.cameras.main.fadeOut(500, 24, 20, 37);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => void this.land());
    });
  }

  private async land() {
    const r = session.replicant, st = session.store;
    const planetIndex = this.j.to_star === 'sol' ? 3 : TRAVEL.landedPlanetIndex;
    if (r && st) {
      try { await st.completeJourney(r, this.j, planetIndex); } catch (e) { console.warn('arrival save failed', e); }
    } else if (r) {
      r.status = 'active'; r.star_id = this.j.to_star; r.planet_index = planetIndex; r.pos_x = null; r.pos_y = null;
    }
    this.scene.start('planet', { arrival: true });
  }

  update(_time: number, dt: number) {
    const { width: w, height: h } = this.scale;
    this.t += dt / 1000;
    const g = this.g;
    g.clear();
    // stars: dots in orbit, streaks in warp
    for (const s of this.streaks) {
      const v = s.speed * (0.15 + this.warp * 9);
      s.x -= v * dt / 1000;
      if (s.x < -40) { s.x = w + Math.random() * 40; s.y = Math.random() * h; }
      const len = Math.max(1, v * 0.06 * this.warp);
      const col = [PALETTE[22], PALETTE[21], PALETTE[20]][s.layer];
      g.lineStyle(1, col, 0.4 + s.layer * 0.25).lineBetween(Math.round(s.x), Math.round(s.y), Math.round(s.x + len), Math.round(s.y));
    }
    // ship bob + thruster
    if (!this.arriving && this.warp > 0.9) this.ship.y = h * 0.5 + Math.sin(this.t * 1.8) * 3;
    this.thrust.setPosition(this.ship.x - 14 * this.ship.scale, this.ship.y);
    // spinning globes (redrawn a few times a second; cheap at this size)
    if (this.t > this.nextGlobeAt) {
      this.nextGlobeAt = this.t + 1 / 12;
      this.globe?.draw(this.t * 0.05);
      if (this.arriving) this.dest?.draw(this.t * 0.05);
    }
    // time left
    const now = Date.now();
    const t0 = Date.parse(this.j.departs_at), t1 = Date.parse(this.j.arrives_at);
    const f = Phaser.Math.Clamp((now - t0) / Math.max(1, t1 - t0), 0, 1);
    const left = t1 - now;
    this.eta.setText(left > 0 ? (isKid() ? '' : `ARRIVES IN ${formatDuration(left)}`) : 'ARRIVING');
    // route bar
    const bx = 14, bw = w - 28, by = h - 22;
    g.lineStyle(1, PALETTE[23], this.ui.alpha).lineBetween(bx, by, bx + bw, by);
    g.lineStyle(1, PALETTE[18], this.ui.alpha).lineBetween(bx, by, bx + bw * f, by);
    g.fillStyle(PALETTE[10], this.ui.alpha).fillRect(Math.round(bx + bw * f) - 1, by - 2, 3, 5);
    // destination star glows brighter as you get close
    const glow = 2 + f * 6;
    g.fillStyle(PALETTE[11], 0.15 * this.ui.alpha).fillCircle(w - 30, h * 0.45, glow * 3);
    g.fillStyle(PALETTE[11], 0.9 * this.ui.alpha).fillCircle(w - 30, h * 0.45, glow * 0.6);
    if (left <= 0 && this.warp >= 0.99 && this.ui.alpha >= 0.99) this.arrive();
  }
}

/** A pixel planet seen from space: shaded sphere with drifting land, ice caps, and a warm light where the base is. */
class Globe {
  private ct: Phaser.Textures.CanvasTexture;
  private img: ImageData;
  private sea: number[][]; private land: number[][]; private cap: number[];

  constructor(scene: Phaser.Scene, readonly key: string, readonly size: number, p: PlanetDef, private earth: boolean) {
    if (scene.textures.exists(key)) scene.textures.remove(key);
    this.ct = scene.textures.createCanvas(key, size, size)!;
    this.img = this.ct.getContext().createImageData(size, size);
    const acc = p.accent.map((i) => rgb(PALETTE[i]));
    const gr = (p.ground ?? [25, 24, 23]).map((i) => rgb(PALETTE[i]));
    this.sea = earth ? [rgb(PALETTE[15]), rgb(PALETTE[16])] : [gr[0], gr[1]];
    this.land = earth ? [rgb(PALETTE[14]), rgb(PALETTE[13]), rgb(PALETTE[12])] : [acc[0], acc[1], acc[2]];
    this.cap = rgb(PALETTE[20]);
    this.draw(0);
  }

  draw(rot: number) {
    const n = this.size, c = n / 2, d = this.img.data;
    const lx = -0.6, ly = -0.35, lz = 0.72; // light from the upper left
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const i = (y * n + x) * 4;
      const nx = (x + 0.5 - c) / c, ny = (y + 0.5 - c) / c;
      const r2 = nx * nx + ny * ny;
      if (r2 > 1) { d[i + 3] = 0; continue; }
      const nz = Math.sqrt(1 - r2);
      // rotate the surface point around the vertical axis
      const cr = Math.cos(rot * Math.PI * 2), sr = Math.sin(rot * Math.PI * 2);
      const px = nx * cr + nz * sr, pz = -nx * sr + nz * cr;
      const h = valueNoise(px * 2.2 + 10, ny * 2.2 + pz * 1.7 + 10, 7) * 0.65 + valueNoise(px * 5 + 3, ny * 5 + pz * 4, 9) * 0.35;
      const lat = Math.abs(ny);
      let col: number[];
      if (lat > 0.82 - h * 0.1) col = this.cap;
      else if (h > 0.52) col = this.land[h > 0.66 ? 2 : h > 0.58 ? 1 : 0];
      else col = this.sea[h > 0.42 ? 1 : 0];
      const lambert = Math.max(0, nx * lx + ny * ly + nz * lz);
      // banded, dithered light so it matches the pixel look
      const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5][(y & 3) * 4 + (x & 3)] / 16;
      const band = Math.min(4, Math.floor(lambert * 4 + bayer));
      let k = [0.18, 0.4, 0.65, 0.85, 1][band];
      // rim haze
      if (r2 > 0.88) k = Math.max(k, 0.35);
      let r = col[0] * k, g = col[1] * k, b = col[2] * k;
      if (r2 > 0.88) { r += 20; g += 40; b += 70; }
      // the base: a warm light on the night side of Earth
      if (this.earth && lambert < 0.15 && Math.abs(px - 0.2) < 0.05 && Math.abs(ny - 0.15) < 0.05) { r = 254; g = 174; b = 52; }
      d[i] = Math.min(255, r); d[i + 1] = Math.min(255, g); d[i + 2] = Math.min(255, b); d[i + 3] = 255;
    }
    this.ct.getContext().putImageData(this.img, 0, 0);
    this.ct.refresh();
  }
}
