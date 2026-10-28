// A Vessel being made at the Replicator (story/STORY.md Copying, Steve 2026-10-28; tunables in src/data/drift.json).
// Its maker has given it a Nous Chip and the Ember and has been scanned; the Replicator prints the body by itself, by
// the clock and also while nobody plays (planet_states.data.replication). The Cems and the Replicator are one system:
// where this world's Cems are awake they carry themselves to it and the body rises in printMs (quicker with their
// strain); without them it rises the slow way Thales made the tenth Vessel (printMsAlone). The newest rows are still
// the Cems' green (or the Replicator's warm light, alone); when the body is whole the Vessel steps out
// (PlanetScene.bornAt). Its row's id was chosen when it began, so it is made once whoever is here when it is done.
import Phaser from 'phaser';
import { sound } from '../audio/Sound';
import { bodyFor } from '../core/body';
import { PALETTE } from '../core/data';
import { DRIFT } from '../core/drift';
import { session } from '../core/session';
import type { Light } from '../fx/Lighting';
import type { PlanetSave, Replicating, ReplicantSave } from '../net/store';
import type { PlanetScene } from '../scenes/PlanetScene';

/** the rows at the top of the forming body that are still living Cems (or fresh light) */
const ALIVE_ROWS = 3;
const FLOW = 'replication';

export class Replication {
  /** the Vessel being printed, or null */
  state: Replicating | null;
  /** playtests: a print time to use instead of the world's (ms) */
  testMs?: number;
  private light?: Light;
  private forming?: { body: Phaser.GameObjects.Image; sheen: Phaser.GameObjects.Image; band: Phaser.GameObjects.Image; line: Phaser.GameObjects.Rectangle; glow: Phaser.GameObjects.Image; rows: number };
  private flowing = false;
  /** the body is whole and the Vessel has stepped out; its row is being saved (the print stays in the save until then) */
  private finishing = false;

  constructor(private scene: PlanetScene, save: PlanetSave | null) {
    this.state = save?.data.replication ?? null;
  }

  /** A Vessel is being printed here. */
  get busy() { return !!this.state; }

  /** How far the body is printed, 0..1. */
  get fraction() { const st = this.state; return st ? Math.max(0, Math.min(1, (Date.now() - st.start) / Math.max(1, st.ms))) : 0; }

  /** The Cems of this world are awake to work with the Replicator. */
  get withCems() { return !!this.scene.bioworks?.awake; }

  /** How long a body takes here now (ms): quick with the Cems (and their strain), slow without them. */
  printMsHere() {
    if (this.testMs) return this.testMs;
    return this.withCems ? Math.round(DRIFT.printMs * (this.scene.bioworks?.speed ?? 1)) : DRIFT.printMsAlone;
  }

  /** The maker's choice is made: the body starts to print where the Vessel will stand (after `delay` ms: the scan). */
  start(kind: Replicating['kind'], row: ReplicantSave, elder?: string, delay = 0) {
    const cems = this.withCems;
    this.state = { start: Date.now() + delay, ms: this.printMsHere(), kind, row, by: session.replicant?.id ?? '', cems, ...(elder ? { elder } : {}) };
    this.save();
    const at = this.spot;
    this.scene.fx.sparks(at.x, at.y - 6, cems ? PALETTE[12] : PALETTE[10], 10);
    if (cems) sound.cultureSeed(at);
  }

  /** Where the body rises: where the Vessel will stand. */
  private get spot() { const r = this.state?.row; return { x: r?.pos_x ?? this.scene.base.x, y: r?.pos_y ?? this.scene.base.y + 8 }; }

  private save() {
    const s = this.scene;
    if (session.planet) session.planet.data.replication = this.state;
    if (!s.shot && !s.visit) { s.pending.replication = this.state; void s.flushPlanet(); }
  }

  private clearForming() {
    const f = this.forming;
    if (!f) return;
    for (const o of [f.body, f.sheen, f.band, f.line, f.glow]) o.destroy();
    this.forming = undefined;
  }

  update(time: number) {
    if (!this.state || this.finishing) return;
    const s = this.scene, st = this.state, at = this.spot;
    // the Cems carry themselves from their bed while they print it (an awake bed on this world)
    if (st.cems && !this.flowing && s.bioworks?.awake) { this.flowing = true; s.bioworks.startFlow(FLOW, { x: at.x, y: at.y + 2 }, [PALETTE[12], PALETTE[11]], Date.now() - st.start < 3000); }
    if (!this.forming) {
      const key = bodyFor(s, st.row).key, depth = 100 + at.y;
      const tint = st.cems ? PALETTE[12] : PALETTE[10];
      const glow = s.add.image(at.x, at.y - 10, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(tint).setScale(0.45).setAlpha(0.3).setDepth(depth);
      const body = s.add.image(at.x, at.y, key, 0).setOrigin(0.5, 1).setDepth(depth);
      // the fresh print shines a little until it wakes
      const sheen = s.add.image(at.x, at.y, key, 0).setOrigin(0.5, 1).setDepth(depth).setTintFill(PALETTE[18]).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.4);
      const band = s.add.image(at.x, at.y, key, 0).setOrigin(0.5, 1).setDepth(depth).setTintFill(tint).setAlpha(0.9);
      const line = s.add.rectangle(at.x, at.y, 12, 1, 0xffffff).setBlendMode(Phaser.BlendModes.ADD).setDepth(depth + 1);
      this.forming = { body, sheen, band, line, glow, rows: -1 };
      this.light ??= s.lighting.add({ x: at.x, y: at.y - 10, radius: 30, color: tint, intensity: 0 });
    }
    const f = this.forming, h = f.body.height, w = f.body.width;
    const rows = Math.min(h, Math.ceil(h * this.fraction));
    if (rows !== f.rows) {
      const solid = Math.max(0, rows - ALIVE_ROWS);
      f.body.setCrop(0, h - solid, w, solid);
      f.sheen.setCrop(0, h - solid, w, solid);
      f.band.setCrop(0, h - rows, w, rows - solid);
      f.line.setPosition(at.x, at.y - rows);
      if (f.rows >= 0 && rows > f.rows) {
        s.fx.sparks(at.x + (Math.random() - 0.5) * 8, at.y - rows, st.cems ? PALETTE[12] : PALETTE[10], 2);
        const p = s.player;
        sound.printLayer(at.x - p.x, Math.hypot(at.x - p.x, at.y - p.y));
      }
      f.rows = rows;
    }
    f.line.setAlpha(0.5 + 0.4 * Math.sin(time / 90));
    f.glow.setAlpha(0.22 + 0.1 * Math.sin(time / 500));
    if (this.light) this.light.intensity = 0.55 + 0.2 * Math.sin(time / 500);
    // whole: it steps out (never on a visit, where nothing here is ours to change)
    if (this.fraction >= 1 && !s.visit) this.finish();
  }

  /**
   * The Vessel steps out where it rose; the light goes, the Cems go home. The print leaves the save only once the
   * Vessel's row exists, so a save that fails is tried again (here, or on the next load) with the same id.
   */
  private finish() {
    const st = this.state, at = this.spot;
    if (!st || this.finishing) return;
    this.finishing = true;
    this.clearForming();
    if (this.light) { const l = this.light; this.light = undefined; this.scene.tweens.add({ targets: l, intensity: 0, duration: 900, onComplete: () => this.scene.lighting.remove(l) }); }
    if (this.flowing) { this.flowing = false; this.scene.bioworks?.stopFlow(FLOW); }
    const cleared = () => { if (this.state === st) { this.state = null; this.save(); } this.finishing = false; };
    // (already among the copies here: it stepped out before, only the empty Replicator was not saved)
    if (this.scene.npcs.some((n) => n.data.id === st.row.id)) { cleared(); return; }
    this.scene.bornAt(st.row, at.x, at.y, st.elder, cleared);
  }
}
