import Phaser from 'phaser';
import { session } from '../../core/session';
import type { PlanetData } from '../../net/store';
import type { PlanetScene } from '../PlanetScene';

/**
 * Saving: the planet delta every few seconds and when the page hides, and the replicant row.
 * Part of PlanetScene (src/scenes/PlanetScene.ts); `s` is the scene.
 */
export class Saving {
  constructor(readonly s: PlanetScene) {}

  npcTickAt = 0;
  saving = false;
  lastSaveAt = 0;
  lastPosSaveAt = 0;

  setupSaving() {
    const flushAll = () => { void this.flushPlanet(); void this.saveReplicant(); };
    // closing the page: a carried load goes into the store first
    const onLeave = () => { this.s.hands.stow(); this.s.homecoming.remember(); flushAll(); };
    const onHide = () => { if (document.visibilityState === 'hidden') flushAll(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onLeave);
    this.s.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onLeave);
    });
  }

  markAwake() {
    const r = session.replicant;
    if (!r || r.traits.awake) return;
    r.traits.awake = true;
    void this.saveReplicant();
  }

  async saveReplicant() {
    const r = session.replicant, st = session.store;
    if (!r || !st || this.s.shot || this.s.visit || this.s.launching || !this.s.player.alive || this.s.player.locked) return;
    r.star_id = this.s.planet.star;
    r.planet_index = this.s.planet.planetIndex;
    r.pos_x = Math.round(this.s.player.x);
    r.pos_y = Math.round(this.s.player.y);
    try { await st.saveReplicant(r); } catch (e) { console.warn('replicant save failed', e); }
  }

  /** Send queued ember / node / structure changes. Server value wins so family members share one pool. */
  async flushPlanet() {
    const st = session.store;
    if (!st || this.s.shot || this.saving || this.s.loadFailed) return;
    const p = this.s.pending;
    // playing time is counted live (copies carry Embers in), so keep the offline clock fresh about once a minute
    if (this.s.npcs.length && p.npcTick === undefined && Date.now() - this.npcTickAt > 60_000) p.npcTick = Date.now();
    if (p.npcTick !== undefined) this.npcTickAt = Date.now();
    if (!p.embers && !Object.keys(p.nodes).length && !Object.keys(p.doors).length && !p.structures && !p.village && !p.beacon && !p.felled && !p.warren && !p.supplies && !p.buildings && !p.label && !p.town && !p.layout && !p.gifts && !p.seen && p.npcTick === undefined) return;
    this.s.pending = { embers: 0, nodes: {}, doors: {} };
    this.saving = true;
    try {
      const data: PlanetData = { nodes: p.nodes };
      if (Object.keys(p.doors).length) data.doors = p.doors;
      if (p.npcTick !== undefined) data.npcTick = p.npcTick;
      if (p.structures) data.structures = p.structures;
      if (p.village) data.village = p.village;
      if (p.beacon) data.beacon = p.beacon;
      if (p.felled) data.felled = p.felled;
      if (p.warren) data.warren = p.warren;
      if (p.supplies) data.supplies = p.supplies;
      if (p.buildings) data.buildings = p.buildings;
      if (p.label) { data.label = p.label; data.biome = p.biome; }
      if (p.town) data.town = p.town;
      if (p.gifts) data.gifts = p.gifts;
      if (p.layout) data.layout = p.layout;
      if (p.seen) data.seen = p.seen;
      const row = await st.applyPlanetDelta(this.s.planet.star, this.s.planet.planetIndex, p.embers, data);
      if (row) {
        this.s.embers = row.embers + this.s.pending.embers;
        session.planet = row;
        this.s.game.events.emit('embers', this.s.embers, true);
      }
    } catch (e) {
      console.warn('planet save failed, will retry', e);
      this.s.pending.embers += p.embers;
      this.s.pending.nodes = { ...p.nodes, ...this.s.pending.nodes };
      this.s.pending.doors = { ...p.doors, ...this.s.pending.doors };
      this.s.pending.npcTick ??= p.npcTick;
      this.s.pending.structures ??= p.structures;
      this.s.pending.village ??= p.village;
      this.s.pending.beacon ??= p.beacon;
      this.s.pending.felled ??= p.felled;
      this.s.pending.warren ??= p.warren;
      this.s.pending.supplies ??= p.supplies;
      this.s.pending.buildings ??= p.buildings;
      this.s.pending.label ??= p.label; this.s.pending.biome ??= p.biome;
      this.s.pending.town ??= p.town; this.s.pending.layout ??= p.layout;
      this.s.pending.seen ??= p.seen;
    } finally {
      this.saving = false;
    }
  }

  // --- services used by entities ---
}
