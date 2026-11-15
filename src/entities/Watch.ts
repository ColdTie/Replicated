// The Observatory's watch (Watcher's wish, carried 2026-11-15; src/data/watch.json). In a day of life a copy at a
// finished Observatory turns its quartz lens toward a far star (keep_watch in the mind function) and writes what it
// sees into the archive (planet_states.data.archive). While a watch lasts (traits.watch.until) the village can see
// it: a faint blue glow on the quartz under the dome and a slow sweep of light, at night, and the watcher's name over
// the dome when you come near.
import Phaser from 'phaser';
import { PALETTE } from '../core/data';
import WATCH from '../data/watch.json';
import type { Light } from '../fx/Lighting';
import type { PlanetScene } from '../scenes/PlanetScene';
import { ink } from '../ui/ink';

interface Shown { id: string; light: Light; glow: Phaser.GameObjects.Image; beam: Phaser.GameObjects.Graphics; label: Phaser.GameObjects.BitmapText; x: number; y: number }

export class Watch {
  private shown: Shown | null = null;
  private nextCheck = 0;
  /** screenshots and playtests: a watcher staged without a day of life */
  staged: { name: string; until: number } | null = null;

  constructor(private s: PlanetScene) {}

  /** Who keeps a watch here now (the latest to begin one), or null. */
  watcher(now = Date.now()): { name: string; star?: string } | null {
    if (this.staged && this.staged.until > now) return { name: this.staged.name };
    let best: { name: string; star: string; at: number } | null = null;
    for (const n of this.s.npcs) {
      const w = n.data.traits.watch;
      if (w && w.until > now && (!best || w.at > best.at)) best = { name: n.data.name, star: w.star, at: w.at };
    }
    return best;
  }

  /** The finished Observatory the lens shows on (the first one standing). */
  private observatory() {
    return this.s.buildings.list.find((b) => b.design === 'observatory' && b.built && !b.vetoed);
  }

  get active() { return !!this.shown; }

  update(time: number) {
    const s = this.s;
    if (time >= this.nextCheck) {
      this.nextCheck = time + 1000;
      const who = this.watcher();
      const obs = who ? this.observatory() : undefined;
      if (!who || !obs) this.hide();
      else if (!this.shown || this.shown.id !== obs.id) this.show(obs.id);
      if (this.shown && who) this.shown.label.setText(who.name.toUpperCase());
    }
    const sh = this.shown;
    if (!sh) return;
    const k = Math.max(WATCH.nightMin, s.env.night);
    const turn = Math.sin((time / WATCH.sweepMs) * Math.PI * 2);
    sh.light.intensity = WATCH.light.intensity * k * (0.85 + 0.15 * Math.abs(turn));
    sh.glow.setAlpha(WATCH.glow.alpha * k * (0.8 + 0.2 * Math.sin(time / 700)));
    // the sweep: a thin wedge of the quartz's light turning slowly over the dome
    const a = -Math.PI / 2 + Phaser.Math.DegToRad(WATCH.sweepDeg) * turn;
    const L = WATCH.beam, half = 0.05;
    sh.beam.clear();
    sh.beam.fillStyle(PALETTE[WATCH.color], 0.22 * k);
    sh.beam.fillTriangle(sh.x, sh.y, sh.x + Math.cos(a - half) * L, sh.y + Math.sin(a - half) * L, sh.x + Math.cos(a + half) * L, sh.y + Math.sin(a + half) * L);
    const near = Math.hypot(s.player.x - sh.x, s.player.y - sh.y) < WATCH.labelRange + 30;
    sh.label.setAlpha(Phaser.Math.Linear(sh.label.alpha, near ? 0.9 : 0, 0.08));
  }

  private show(id: string) {
    this.hide();
    const s = this.s;
    const [vx, vy, vz] = WATCH.lens;
    const at = s.buildings.modelPoint(id, vx, vy, vz);
    if (!at) return;
    const color = PALETTE[WATCH.color];
    const light = s.lighting.add({ x: at.x, y: at.y, radius: WATCH.light.radius, color, intensity: 0, flicker: 0.05 });
    const glow = s.add.image(at.x, at.y, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(color).setScale(WATCH.glow.scale).setAlpha(0).setDepth(6100);
    const beam = s.add.graphics().setBlendMode(Phaser.BlendModes.ADD).setDepth(6100);
    const label = ink(s.add.bitmapText(at.x, at.y - 12, 'pixel', '').setTint(color).setOrigin(0.5, 1).setAlpha(0).setDepth(6200));
    this.shown = { id, light, glow, beam, label, x: at.x, y: at.y };
  }

  private hide() {
    const sh = this.shown;
    if (!sh) return;
    this.s.lighting.remove(sh.light);
    sh.glow.destroy(); sh.beam.destroy(); sh.label.destroy();
    this.shown = null;
  }
}
