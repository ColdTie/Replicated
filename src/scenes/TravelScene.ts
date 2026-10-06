// In flight between stars. Departure shows the planet from orbit, then the warp; the cruise shows the ship,
// streaking stars and the time left (real time). Settled planets can be visited while you wait. On arrival the
// destination planet grows on screen and the ship lands.
import Phaser from 'phaser';
import { sound } from '../audio/Sound';
import { PALETTE, type PlanetDef } from '../core/data';
import { isKid, session } from '../core/session';
import { Globe } from '../fx/Globe';
import type { Journey } from '../net/store';
import { formatDuration, planetFor, starById } from '../world/galaxy';
import { planetAt } from '../world/system';
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
  private giantImg?: Phaser.GameObjects.Image;
  private destGiant?: Globe;
  private destGiantImg?: Phaser.GameObjects.Image;
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
    this.giantImg = undefined; this.destGiant = undefined; this.destGiantImg = undefined;
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

    const from = planetFor(this.j.from_star, this.j.from_planet);
    const to = planetFor(this.j.to_star, this.j.to_planet);
    const fromSp = planetAt(this.j.from_star, this.j.from_planet), toSp = planetAt(this.j.to_star, this.j.to_planet);
    if (this.depart && from) {
      // leaving a moon: the giant it orbits fills the corner behind it
      if (fromSp?.moon) {
        new Globe(this, 'globe.from.giant', 220, from, { kind: fromSp.kind, temp: fromSp.temp });
        this.giantImg = this.add.image(w * 0.08, h * 0.95, 'globe.from.giant');
      }
      this.globe = new Globe(this, 'globe.from', fromSp?.moon ? 70 : 120, from, { earth: from.id === 'earth' });
      this.globeImg = this.add.image(w * 0.3, h * 0.62, 'globe.from');
    }
    if (to) {
      if (toSp?.moon) {
        this.destGiant = new Globe(this, 'globe.to.giant', 160, to, { kind: toSp.kind, temp: toSp.temp });
        this.destGiantImg = this.add.image(w * 0.86, h * 0.45, 'globe.to.giant').setScale(0.02).setAlpha(0);
      }
      this.dest = new Globe(this, 'globe.to', toSp?.moon ? 60 : 120, to, { earth: to.id === 'earth' });
      this.destImg = this.add.image(w * 0.86, h * 0.45, 'globe.to').setScale(0.02).setAlpha(0);
    }

    this.thrust = this.add.particles(0, 0, 'px', {
      lifespan: { min: 250, max: 500 }, speedX: { min: -90, max: -50 }, speedY: { min: -8, max: 8 },
      scale: { start: 1.4, end: 0 }, tint: [PALETTE[10], PALETTE[9], PALETTE[11]], blendMode: Phaser.BlendModes.ADD, frequency: 25,
    });
    this.ship = this.add.sprite(w * 0.38, h * 0.5, 'vessel').play('vessel:idle');

    // Bottom: route bar with the ship marker and the time left
    const fromName = from?.name ?? starById(this.j.from_star)?.name ?? '?', toName = to?.name ?? starById(this.j.to_star)?.name ?? '?';
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
    const where = new Map<string, [string, number]>();
    for (const r of reps) if (r.status !== 'in_transit') where.set(`${r.star_id}:${r.planet_index}`, [r.star_id, r.planet_index]);
    [...where.values()].slice(0, 4).forEach(([sid, pi], i) => {
      const p = planetFor(sid, pi);
      if (!p || !this.scene.isActive()) return;
      const x = 22 + i * 34, y = 22;
      const key = `globe.visit.${sid}.${pi}`;
      new Globe(this, key, 22, p, { earth: p.id === 'earth' });
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
      mode: 'view', from: this.j.from_star, fromPlanet: this.j.from_planet, journey: this.j,
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
    if (this.giantImg) this.tweens.add({ targets: this.giantImg, x: -60, y: h * 1.1, scale: 0.7, duration: 4500, ease: 'Sine.easeIn' });
    this.time.delayedCall(2600, () => {
      sound.dash();
      this.tweens.add({ targets: this, warp: 1, duration: 1800, ease: 'Quad.easeIn' });
      this.tweens.add({ targets: [this.globeImg, this.giantImg].filter(Boolean), alpha: 0, x: -80, duration: 1500, ease: 'Quad.easeIn' });
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
    if (this.destGiantImg) {
      this.destGiantImg.setAlpha(1);
      this.tweens.add({ targets: this.destGiantImg, scale: 1.5, x: w * 0.8, y: h * 0.3, duration: 3200, ease: 'Sine.easeInOut' });
      this.tweens.add({ targets: this.destImg, scale: 1.3, x: w * 0.5, y: h * 0.62, duration: 3200, ease: 'Sine.easeInOut' });
    } else this.tweens.add({ targets: this.destImg, scale: 1.6, x: w * 0.62, y: h * 0.55, duration: 3200, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: this.ship, x: w * 0.6, y: h * 0.52, scale: 0.15, duration: 3200, ease: 'Sine.easeIn' });
    this.time.delayedCall(3000, () => {
      this.cameras.main.fadeOut(500, 24, 20, 37);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => void this.land());
    });
  }

  private async land() {
    const r = session.replicant, st = session.store;
    if (r && st) {
      try { await st.completeJourney(r, this.j); } catch (e) { console.warn('arrival save failed', e); }
    } else if (r) {
      r.status = 'active'; r.star_id = this.j.to_star; r.planet_index = this.j.to_planet; r.pos_x = null; r.pos_y = null;
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
      if (this.arriving) { this.dest?.draw(this.t * 0.05); this.destGiant?.draw(this.t * 0.02); }
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
