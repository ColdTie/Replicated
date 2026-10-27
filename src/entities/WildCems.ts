// The wild Cems of Gliese 12 b (story/STORY.md: the planet with some life where Alaina found the Cems, flat saltlands
// under a red sun; planets.json wildCems). Fields of them lie on pale salt flats out on the pan, away from the town:
// untouched by Alaina's changes, so no ants and no fungus serve them and they build nothing on command. They breathe
// and drink the red light by day (motes falling into them), glow faintly at night, and stir as you walk among them:
// the ones near your feet flash green and the field breathes out. Salt blooms crust their rims (nodes wild0, ...).
import Phaser from 'phaser';
import { sound } from '../audio/Sound';
import { BACKEND, PALETTE } from '../core/data';
import { paintTexture } from '../core/designs';
import type { Light } from '../fx/Lighting';
import type { PlanetSave } from '../net/store';
import type { PlanetScene } from '../scenes/PlanetScene';
import { Cell } from '../world/planetGen';
import { paintFlat } from './Bioworks';
import { CrystalNode, NODE } from './Resources';

const DEPTH_GLOW = 6100;
interface Field {
  x: number; y: number; rx: number; ry: number;
  cems: { sprite: Phaser.GameObjects.Sprite; glow: Phaser.GameObjects.Image; stirred: number }[];
  drink: Phaser.GameObjects.Particles.ParticleEmitter;
  light: Light;
  near: boolean;
}

export class WildCems {
  readonly fields: Field[] = [];
  private nextLook = 0;
  private nextBreath = 0;

  constructor(private scene: PlanetScene, save: PlanetSave | null, def: { fields: number; perField: [number, number]; blooms: number }) {
    const s = scene, m = s.map, T = 16;
    let seed = (s.planet.seed * 2654435761) >>> 0 || 7;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const tb = m.town.bounds;
    const floor = (x: number, y: number) => { const tx = Math.floor(x / T), ty = Math.floor(y / T); return tx >= 0 && ty >= 0 && tx < m.w && ty < m.h && m.cells[ty * m.w + tx] === Cell.Floor; };
    const inTown = (x: number, y: number) => x > (tb.x - 4) * T && x < (tb.x + tb.w + 4) * T && y > (tb.y - 4) * T && y < (tb.y + tb.h + 4) * T;
    const spots: { x: number; y: number; rx: number; ry: number }[] = [];
    for (let tries = 0; spots.length < def.fields && tries < 600; tries++) {
      const x = Math.round((0.08 + rnd() * 0.84) * m.w * T), y = Math.round((0.08 + rnd() * 0.84) * m.h * T);
      const rx = 30 + Math.round(rnd() * 16), ry = 18 + Math.round(rnd() * 8);
      if (inTown(x, y)) continue;
      // the whole flat on open floor, clear of the other fields and of the nodes already there
      if (![[0, 0], [rx, 0], [-rx, 0], [0, ry], [0, -ry], [rx * 0.7, ry * 0.7], [-rx * 0.7, ry * 0.7], [rx * 0.7, -ry * 0.7], [-rx * 0.7, -ry * 0.7]].every(([dx, dy]) => floor(x + dx, y + dy))) continue;
      if (spots.some((q) => Math.hypot(q.x - x, q.y - y) < 150)) continue;
      if (s.nodes.some((n) => Math.abs(n.x - x) < rx + 14 && Math.abs(n.y - y) < ry + 12)) continue;
      spots.push({ x, y, rx, ry });
    }
    const regrowMs = BACKEND.nodeRegrowMinutes * 60_000;
    spots.forEach((f, i) => {
      s.add.image(f.x, f.y, paintTexture(s, `wildflat:${i}`, paintFlat(f.rx, f.ry, s.planet.seed + i * 31))).setDepth(1.6);
      const cems: Field['cems'] = [];
      const n = def.perField[0] + Math.floor(rnd() * (def.perField[1] - def.perField[0] + 1));
      const pts: { x: number; y: number }[] = [];
      for (let k = 0; pts.length < n && k < 200; k++) {
        const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * 0.78;
        const p = { x: Math.round(f.x + Math.cos(a) * f.rx * rr), y: Math.round(f.y + Math.sin(a) * f.ry * rr) };
        if (pts.every((q) => Math.abs(q.x - p.x) > 15 || Math.abs(q.y - p.y) > 8)) pts.push(p);
      }
      for (const p of pts) {
        const sprite = s.add.sprite(p.x, p.y, 'cem', 0).setDepth(2 + p.y / 10000).setFlipX(rnd() < 0.5);
        // the wild strain: a little more gold in it, its breath its own
        sprite.play({ key: 'cem:breathe', startFrame: Math.floor(rnd() * 3) });
        sprite.anims.timeScale = 0.7 + rnd() * 0.5;
        if (rnd() < 0.5) sprite.setTint(0xf4ffc8);
        const glow = s.add.image(p.x, p.y, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(PALETTE[12]).setAlpha(0).setScale(0.35, 0.18).setDepth(DEPTH_GLOW);
        cems.push({ sprite, glow, stirred: 0 });
      }
      const drink = s.add.particles(f.x, f.y - 30, 'px1', {
        x: { min: -f.rx * 0.8, max: f.rx * 0.8 }, y: { min: -6, max: 6 }, lifespan: 1600, speedY: { min: 14, max: 22 },
        alpha: { start: 0, end: 0.7, ease: 'Sine.easeIn' }, tint: [PALETTE[11], PALETTE[8], PALETTE[10]], frequency: 340, blendMode: Phaser.BlendModes.ADD,
      }).setDepth(DEPTH_GLOW);
      drink.stop();
      const light = s.lighting.add({ x: f.x, y: f.y, radius: f.rx * 1.5, color: PALETTE[12], intensity: 0, flicker: 0.1 });
      this.fields.push({ ...f, cems, drink, light, near: false });
      // salt blooms on the rim
      for (let k = 0; k < def.blooms; k++) {
        const a = rnd() * Math.PI * 2, x = Math.round(f.x + Math.cos(a) * (f.rx + 7)), y = Math.round(f.y + Math.sin(a) * (f.ry + 6));
        if (!floor(x, y)) continue;
        const key = `wild${i * def.blooms + k}`;
        let hits = save?.data.nodes?.[key]?.hits ?? 0;
        if (hits >= NODE.salt.hits && Date.now() - (save?.data.nodes?.[key]?.at ?? 0) > regrowMs) { hits = 0; s.pending.nodes[key] = { hits: 0, at: Date.now() }; }
        s.nodes.push(new CrystalNode(s, x, y, -100 - i * def.blooms - k, hits, 'salt', key));
      }
    });
  }

  /** On a wild flat (footsteps crunch). */
  onFlat(x: number, y: number) {
    return this.fields.some((f) => ((x - f.x) / f.rx) ** 2 + ((y - f.y) / f.ry) ** 2 < 1);
  }

  update(time: number) {
    const s = this.scene, night = s.env?.night ?? 0, p = s.player;
    // only the fields near the camera drink (by day) and glow
    if (time > this.nextLook) {
      this.nextLook = time + 400;
      const v = s.cameras.main.worldView;
      for (const f of this.fields) {
        f.near = f.x > v.x - 120 && f.x < v.right + 120 && f.y > v.y - 90 && f.y < v.bottom + 90;
        const drink = f.near && night < 0.6;
        if (drink && !f.drink.emitting) f.drink.start(); else if (!drink && f.drink.emitting) f.drink.stop();
        if (!f.near) f.light.intensity = 0;
      }
    }
    const breath = 0.5 + 0.5 * Math.sin(time / 1500);
    for (const f of this.fields) {
      if (!f.near) continue;
      f.light.intensity = (0.08 + 0.26 * night) * (0.8 + 0.2 * breath);
      f.drink.setAlpha(1 - night);
      const on = !!p && ((p.x - f.x) / (f.rx + 6)) ** 2 + ((p.y - f.y) / (f.ry + 6)) ** 2 < 1;
      for (const c of f.cems) {
        // they stir as you pass: the ones at your feet flash the Cems' green
        if (on && p && Math.hypot(p.x - c.sprite.x, p.y - c.sprite.y) < 14 && time > c.stirred + 1200) {
          c.stirred = time;
          c.sprite.setTintFill(PALETTE[12]);
          s.time.delayedCall(110, () => { if (c.sprite.active) { c.sprite.clearTint(); } });
          s.fx.sparks(c.sprite.x, c.sprite.y - 2, PALETTE[12], 2);
        }
        c.glow.setAlpha(night * (0.1 + 0.08 * Math.sin(time / 900 + c.sprite.x)) + (time - c.stirred < 600 ? 0.25 * (1 - (time - c.stirred) / 600) : 0));
      }
      if (on && time > this.nextBreath) { this.nextBreath = time + 4200 + Math.random() * 2500; sound.cemBreath({ x: f.x, y: f.y }); }
    }
  }
}
