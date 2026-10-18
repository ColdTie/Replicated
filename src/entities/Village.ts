// The village the copies raise in the town while you are away: lamps, signs, flags, gardens, huts, totems.
// Work accrues per copy (offline from planet_states.data.npcTick, slowly while you watch) into one shared pool;
// a copy with enough work picks a project it likes that still has a free slot on its own lot (src/world/town.ts:
// the house at the back, gardens, a flag by the path, lamps at the frontage or along the street), walks there and
// hammers it up. A full lot builds nothing more. Builds are saved per planet in data.structures (with the builder,
// tint and variant) so the whole family sees the same village.
import Phaser from 'phaser';
import { anim } from '../core/assets';
import { PALETTE, VILLAGE } from '../core/data';
import { hashId } from '../world/system';
import { slotFor } from '../world/town';
import type { Light } from '../fx/Lighting';
import type { StructureSave } from '../net/store';
import type { PlanetScene } from '../scenes/PlanetScene';
import type { Npc } from './Npc';
import { squash } from './Player';

export type ProjectDef = (typeof VILLAGE.projects)[keyof typeof VILLAGE.projects] & {
  light?: { radius: number; color: number; intensity: number; flicker?: number };
  tint?: boolean; variants?: number; anim?: string; solid?: [number, number]; smoke?: boolean; sparkle?: boolean;
};
export interface BuildJob { type: string; def: ProjectDef; x: number; y: number; variant: number; tint?: number; by: string }

const PROJECTS = VILLAGE.projects as unknown as Record<string, ProjectDef>;

/** One finished build (or its ghost while it is being hammered up). */
class Structure {
  readonly sprite: Phaser.GameObjects.Sprite;
  private light?: Light;
  private glow?: Phaser.GameObjects.Image;
  private solid?: Phaser.GameObjects.Zone;
  private nextPuff = 0;

  /** Taken down: everything it put in the world goes. */
  destroy() {
    this.sprite.destroy();
    this.glow?.destroy();
    if (this.light) this.scene.lighting.remove(this.light);
    this.solid?.destroy();
  }

  constructor(private scene: PlanetScene, readonly save: StructureSave, readonly def: ProjectDef, animate: boolean) {
    const { x, y } = save;
    this.sprite = scene.add.sprite(x, y + 2, def.sprite, save.variant ?? 0).setOrigin(0.5, 1).setDepth(100 + y);
    if (def.tint && save.tint !== undefined) this.sprite.setTint(PALETTE[save.tint]);
    if (def.anim) {
      this.sprite.play(anim(def.sprite, def.anim));
      this.sprite.anims.setProgress(Math.random());
    }
    if (def.light) {
      const lh = this.sprite.height * 0.65;
      this.light = scene.lighting.add({ x, y: y - lh, radius: def.light.radius, color: PALETTE[def.light.color], intensity: animate ? 0 : def.light.intensity, flicker: def.light.flicker });
      this.glow = scene.add.image(x, y - lh, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(PALETTE[def.light.color]).setAlpha(animate ? 0 : 0.16).setScale(0.5).setDepth(6100);
      if (animate) {
        scene.tweens.add({ targets: this.light, intensity: def.light.intensity, duration: 700, delay: 200 });
        scene.tweens.add({ targets: this.glow, alpha: 0.16, duration: 700, delay: 200 });
      }
    }
    if (def.solid) this.solid = scene.addSolid(x, y - 2, def.solid[0], def.solid[1]);
    if (animate) {
      squash(scene, this.sprite, 1.3, 0.7, 160);
      scene.fx.dust(x, y + 2, 8);
    }
  }

  update(time: number) {
    if (this.def.smoke && time > this.nextPuff) {
      this.nextPuff = time + 2200 + Math.random() * 2500;
      const puff = this.scene.add.image(this.save.x + 5, this.save.y - this.sprite.height + 2, 'px').setTint(PALETTE[21]).setAlpha(0.6).setDepth(6090).setScale(1.5);
      this.scene.tweens.add({ targets: puff, y: puff.y - 14, x: puff.x + 3, alpha: 0, scale: 2.5, duration: 1800, ease: 'Sine.easeOut', onComplete: () => puff.destroy() });
    }
    if (this.def.sparkle && time > this.nextPuff) {
      this.nextPuff = time + 1500 + Math.random() * 3000;
      this.scene.fx.sparks(this.save.x + (Math.random() - 0.5) * 10, this.save.y - 8, PALETTE[18], 1);
    }
  }
}

export class Village {
  /** Every saved structure on this planet, the Replicator included. */
  structures: StructureSave[];
  work: number;
  private built: Structure[] = [];
  private claimed: BuildJob[] = [];
  private ghosts = new Map<BuildJob, Phaser.GameObjects.Image>();
  private lastSavedWork: number;
  private nextWorkSave = 0;

  constructor(private scene: PlanetScene, structures: StructureSave[] | undefined, work: number | undefined) {
    this.structures = structures ? structures.map((s) => ({ ...s })) : [];
    this.work = work ?? 0;
    this.lastSavedWork = this.work;
    for (const s of this.structures) {
      const def = PROJECTS[s.type];
      if (def) this.built.push(new Structure(scene, s, def, false));
    }
  }

  get count() { return this.built.length; }

  /** Effort the copies earned (offline hours, or live time). */
  addWork(n: number, save = true) {
    if (n <= 0) return;
    this.work += n;
    if (save) this.markWorkDirty();
  }

  markWorkDirty() {
    this.scene.pending.village = { work: Math.round(this.work * 100) / 100 };
    this.lastSavedWork = this.work;
  }

  /** The Replicator (built by the player) is a structure too; keep one list for saves. */
  addStructure(s: StructureSave) {
    this.structures = [...this.structures.filter((x) => x.type !== s.type || s.type !== 'replicator'), s];
    this.scene.pending.structures = this.structures;
  }

  /** What this copy would like to build next, of what still fits: its own taste (from its id) weighs the project weights. */
  private pickProject(npc: Npc, fits: (type: string) => boolean) {
    const h = hashId(npc.data.id);
    const entries = Object.entries(PROJECTS);
    const weights = entries.map(([type, def], i) => {
      if (!fits(type)) return 0;
      const taste = 0.4 + (((h >>> (i * 4)) & 15) / 15) * 1.6;      // 0.4 .. 2.0
      const have = this.structures.filter((s) => s.type === type).length;
      return def.weight * taste / (1 + have * 0.35);                  // variety: fewer of what the village has plenty of
    });
    const total = weights.reduce((a, b) => a + b, 0);
    if (total <= 0) return null;
    let r = Math.random() * total;
    for (let i = 0; i < entries.length; i++) { r -= weights[i]; if (r <= 0 && weights[i] > 0) return entries[i]; }
    return entries.filter((_, i) => weights[i] > 0).pop() ?? null;
  }

  /** Spots built on or claimed for a build. */
  private get taken() {
    return [...this.structures.map((s) => ({ x: s.x, y: s.y })), ...this.claimed.map((j) => ({ x: j.x, y: j.y }))];
  }

  /**
   * A job for this copy if the pool has the work and its lot has room for something it likes; the slot is reserved
   * until done. A copy with no lot (the town is full) or a full lot builds nothing.
   */
  requestJob(npc: Npc): BuildJob | null {
    const lot = this.scene.homeLot(npc.data.id);
    if (!lot) return null;
    const town = this.scene.map.town, taken = this.taken;
    const spots = new Map<string, { x: number; y: number } | null>();
    const spotFor = (type: string) => { if (!spots.has(type)) spots.set(type, slotFor(town, lot, type, taken)); return spots.get(type)!; };
    const pick = this.pickProject(npc, (type) => !!spotFor(type));
    if (!pick) return null;
    const [type, def] = pick;
    if (this.work < def.work) return null;
    const spot = spotFor(type);
    if (!spot) return null;
    const job: BuildJob = { type, def, x: spot.x, y: spot.y, variant: def.variants ? Math.floor(Math.random() * def.variants) : 0, tint: def.tint ? npc.data.traits.trail ?? 10 : undefined, by: npc.data.id };
    this.claimed.push(job);
    return job;
  }

  /** The copy changed its mind (blocked): free the spot. */
  release(job: BuildJob) {
    this.claimed = this.claimed.filter((j) => j !== job);
    this.ghosts.get(job)?.destroy();
    this.ghosts.delete(job);
  }

  /** Faint outline of what is coming, brightening with every hammer blow. */
  showGhost(job: BuildJob, progress: number) {
    let g = this.ghosts.get(job);
    if (!g) {
      g = this.scene.add.image(job.x, job.y + 2, job.def.sprite, job.variant).setOrigin(0.5, 1).setDepth(6100).setBlendMode(Phaser.BlendModes.ADD)
        .setTintFill(job.tint !== undefined ? PALETTE[job.tint] : PALETTE[9]);
      this.ghosts.set(job, g);
    }
    g.setAlpha(0.12 + progress * 0.3);
  }

  complete(job: BuildJob) {
    this.release(job);
    this.work = Math.max(0, this.work - job.def.work);
    const save: StructureSave = { type: job.type, x: job.x, y: job.y, at: Date.now(), by: job.by, variant: job.variant, tint: job.tint };
    this.structures = [...this.structures, save];
    this.built.push(new Structure(this.scene, save, job.def, true));
    this.scene.pending.structures = this.structures;
    this.markWorkDirty();
  }

  /** Builds the original granted a copy (a gift): placed at once where the scene found room, popping up. */
  grant(type: string, by: string, spots: { x: number; y: number }[], tint?: number) {
    const def = PROJECTS[type];
    if (!def || !spots.length) return false;
    for (const [k, p] of spots.entries()) {
      const save: StructureSave = { type, x: Math.round(p.x), y: Math.round(p.y), at: Date.now() + k, by, variant: 0, tint: def.tint ? tint : undefined };
      this.structures = [...this.structures, save];
      this.scene.time.delayedCall(400 + k * 260, () => this.built.push(new Structure(this.scene, save, def, true)));
    }
    this.scene.pending.structures = this.structures;
    return true;
  }

  /** A copy takes one of its builds down (never the Replicator). Returns what fell, or null. */
  remove(save: StructureSave) {
    if (save.type === 'replicator') return null;
    const i = this.built.findIndex((b) => b.save === save);
    if (i < 0) return null;
    const [s] = this.built.splice(i, 1);
    s.destroy();
    this.structures = this.structures.filter((x) => x !== save);
    this.scene.pending.structures = this.structures;
    this.scene.fx.dust(save.x, save.y + 2, 10);
    return save;
  }

  /** What this copy built, nearest first to a point. Kind "any" = all of them. */
  ownBuilds(npcId: string, kind: string, near: { x: number; y: number }) {
    return this.structures
      .filter((s) => s.by === npcId && s.type !== 'replicator' && (kind === 'any' || s.type === kind))
      .sort((a, b) => Math.hypot(a.x - near.x, a.y - near.y) - Math.hypot(b.x - near.x, b.y - near.y));
  }

  update(time: number, dt: number, gatherSum: number) {
    // while someone plays, work keeps trickling in
    this.addWork((VILLAGE.liveWorkPerHour * gatherSum * dt) / 3_600_000, false);
    if (time > this.nextWorkSave && Math.abs(this.work - this.lastSavedWork) > 0.25) { this.nextWorkSave = time + 60_000; this.markWorkDirty(); }
    for (const s of this.built) s.update(time);
  }
}
