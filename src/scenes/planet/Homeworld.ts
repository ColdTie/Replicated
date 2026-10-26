import Phaser from 'phaser';
import { sound } from '../../audio/Sound';
import { PALETTE, PLAYER } from '../../core/data';
import { isHome } from '../../core/home';
import { session } from '../../core/session';
import { squash } from '../../entities/Player';
import type { Npc } from '../../entities/Npc';
import type { Building, PlanetSave, ReplicantSave } from '../../net/store';
import { buildingSpot, lotForBuilding } from '../../world/town';
import { askName } from '../../ui/overlay';
import HOMEWORLD from '../../data/homeworld.json';
import type { PlanetScene } from '../PlanetScene';

const T = HOMEWORLD.thales;

/**
 * The Metanoia homeworld (story/STORY.md, src/data/homeworld.json): Thales, the founded structures with their printer,
 * and the opening, where Thales finishes copying himself and wakes you. Part of PlanetScene; `s` is the scene.
 */
export class Homeworld {
  constructor(readonly s: PlanetScene) {}

  get here() { return isHome(this.s.planet.star, this.s.planet.planetIndex); }

  reset() { /* nothing kept between worlds */ }

  /** Thales lives on the homeworld: his row is made the first time anyone loads it (a stand-in for screenshots). */
  async ensureThales(rows: ReplicantSave[]): Promise<ReplicantSave[]> {
    if (!this.here || rows.some((r) => r.traits.thales)) return rows;
    const row: Omit<ReplicantSave, 'id'> = {
      profile_id: null, parent_id: null, generation: 0, name: T.name, model: PLAYER.model, status: 'npc',
      traits: {
        v: 1, thales: true, awake: true, body: { ...T.body }, feature: T.feature, trail: T.trail, gear: 0,
        voice: { ...T.voice }, temperament: { ...T.temperament } as ReplicantSave['traits']['temperament'],
        wants: T.wants.map((w) => ({ ...w, done: false, at: Date.now() })) as ReplicantSave['traits']['wants'],
      },
      star_id: this.s.planet.star, planet_index: this.s.planet.planetIndex, pos_x: null, pos_y: null,
    };
    const st = session.store;
    if (!st || this.s.shot || this.s.visit) return [{ ...row, id: 'thales' }, ...rows];
    try { return [await st.createReplicant(row), ...rows]; } catch (e) { console.warn('thales', e); return rows; }
  }

  /**
   * The first load of the homeworld: the Metanoia's structures stand on the town's civic lots (some finished, one
   * half printed) and the Replicator Thales just used stands on its pad. Written back with the first delta.
   */
  found(save: PlanetSave | null): PlanetSave | null {
    if (!this.here || save?.data.founded || this.s.visit) return save;
    const s = this.s, town = s.map.town;
    const data = save ? save.data : {};
    const buildings: Building[] = [...(data.buildings ?? [])];
    for (const f of HOMEWORLD.founded) {
      if (buildings.some((b) => b.id === f.id)) continue;
      const i = lotForBuilding(town, s.townState);
      if (i < 0) break;
      const at = buildingSpot(town.lots[i]);
      s.townState.civic[f.id] = i;
      const total = f.w * f.h * 3;
      buildings.push({
        id: f.id, name: f.name, purpose: f.purpose, w: f.w, h: f.h, x: at.x, y: at.y, by: 'thales', at: Date.now(),
        material: f.material, roof: f.roof, door: f.door, primary: f.primary, secondary: f.secondary,
        approved: true, paid: true, built: !!f.built, progress: f.built ? total : Math.round(total * (f.progress ?? 0)), helpers: [], cost: {},
      });
    }
    const structures = [...(data.structures ?? [])];
    if (!structures.some((x) => x.type === 'replicator')) structures.push({ type: 'replicator', x: s.map.base.pad.x, y: s.map.base.pad.y, at: Date.now() });
    const out: PlanetSave = save ? { ...save, data: { ...data, buildings, structures, founded: true } }
      : { star_id: s.planet.star, planet_index: s.planet.planetIndex, seed: s.planet.seed, embers: 0, data: { buildings, structures, founded: true } };
    if (!s.shot) {
      Object.assign(s.pending, { buildings: structuredClone(buildings), structures: structuredClone(structures), founded: true });
      s.towner.markTown();
    }
    return out;
  }

  /** Thales by his work, and the town's answer when his Printworks is finished (the printers are the buildings'). */
  placePrinters() {
    if (!this.here) return;
    const th = this.thales, post = this.post();
    if (th && post) { th.home = post; if (th.data.pos_x == null) th.setPosition(post.x, post.y); }
    const done = (b: Building) => this.onBuilt(b);
    this.s.events.on('building-done', done);
    this.s.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.s.events.off('building-done', done));
  }

  get thales(): Npc | undefined { return this.s.npcs.find((n) => n.data.traits.thales); }

  /** Where Thales keeps: beside the unfinished goal, else by his Hall. */
  post(): { x: number; y: number } | undefined {
    const list = this.s.buildings?.list ?? [];
    const b = list.find((x) => x.id === HOMEWORLD.goal && !x.built) ?? list.find((x) => x.id === HOMEWORLD.founded[0].id);
    return b ? { x: b.x + (b.x > this.s.baseCenter.x ? -1 : 1) * (b.w * 8 + 10), y: b.y + 10 } : undefined;
  }

  private onBuilt(b: Building) {
    if (b.id !== HOMEWORLD.goal) return;
    // Thales' work, finished: the town lights up for a moment and he greets you
    const th = this.thales;
    this.s.cameras.main.flash(500, 254, 231, 97, false);
    sound.build();
    if (th) { th.home = this.post(); th.thank(); }
    this.s.mindLog.push({ t: this.s.mindClock, text: `${session.replicant?.name ?? 'The new Vessel'} finished Thales' ${b.name}` });
  }

  /**
   * The opening: the scan finishes on the Replicator's ring, Thales stands beside you and says his word in the talk
   * box (his voice, his portrait); when it closes your visor flickers on and the game begins.
   */
  playScan() {
    const s = this.s, pl = s.player, th = this.thales, I = HOMEWORLD.intro;
    const sx = s.base.spotX, sy = s.base.spotY;
    pl.locked = true;
    pl.setPosition(sx, sy);
    pl.facing = -1;
    pl.light.active = false;
    pl.sprite.setTint(0x404060);
    s.cameras.main.centerOn(sx, sy - 10);
    s.cameras.main.fadeIn(I.fadeMs, 24, 20, 37);
    if (th) { th.hold = true; th.home = { x: sx - 22, y: sy + 2 }; th.setPosition(sx - 22, sy + 2); th.sprite.setFlipX(false); }
    s.time.delayedCall(400, () => { sound.scan(); s.base.scan(pl.sprite, pl.featureColor, I.scanMs); });
    s.time.delayedCall(400 + I.scanMs + I.speakAfterMs, () => {
      pl.sprite.setTint(0x6a6a88);
      if (!th) { this.wake(); return; }
      th.sprite.setFlipX(false);
      s.talker.openScripted(th, T.line, () => this.wake());
    });
  }

  /** A Vessel held asleep and handed over: the new player wakes in it where it slept (no scan, no word). */
  playHeldWake() {
    const s = this.s, pl = s.player;
    pl.locked = true;
    pl.light.active = false;
    pl.sprite.setTint(0x6a7096);
    s.cameras.main.fadeIn(HOMEWORLD.intro.fadeMs, 24, 20, 37);
    s.time.delayedCall(HOMEWORLD.intro.fadeMs, () => this.wake());
  }

  /** The visor flickers on: dark, flash, dark, on. A Vessel without a name of its own names itself; then the game
   * begins and Thales walks to his unfinished work. */
  private wake() {
    const s = this.s, pl = s.player;
    sound.wake();
    const steps = [[0, 0], [140, 0], [260, 1], [360, 0], [HOMEWORLD.intro.flickerMs, 1]];
    for (const [t, v] of steps) s.time.delayedCall(t, () => { pl.light.active = v > 0.5; if (v > 0.5) pl.sprite.clearTint(); });
    s.time.delayedCall(HOMEWORLD.intro.flickerMs + 120, () => void this.nameSelf().then(() => this.begin()));
  }

  /** Its first wake: who it is. The profile and the row take the name (an empty answer keeps the given one). */
  private async nameSelf() {
    const me = session.replicant, st = session.store;
    if (!me?.traits.unnamed || this.s.shot) return;
    // the game's keys stand down while the name is typed (Space is captured for swinging)
    const kb = this.s.input.keyboard;
    if (kb) { kb.enabled = false; kb.disableGlobalCapture(); }
    const name = await askName(me.name);
    if (kb) { kb.enabled = true; kb.enableGlobalCapture(); }
    this.s.controls.clear();
    me.name = name;
    me.traits.unnamed = false;
    if (session.profile) session.profile.name = name;
    try { await st?.renameSelf(me, name); } catch (e) { console.warn('rename failed', e); }
    this.s.announceLocation();
    this.s.mindLog.push({ t: this.s.mindClock, text: `The new Vessel named itself ${name}` });
  }

  private begin() {
    const s = this.s, pl = s.player;
    {
      squash(s, pl.sprite, 1.3, 0.75, 140);
      s.fx.sparks(pl.x, pl.y - 12, PALETTE[session.replicant?.traits.feature ?? PLAYER.feature[1]], 10);
      s.fx.dust(pl.x, pl.y + 2, 6);
      pl.locked = false;
      s.saver.markAwake();
      s.homecoming.remember();
      s.game.events.emit('titlecard', s.planet.name, s.planet.subtitle);
      const th = this.thales;
      if (th) s.time.delayedCall(900, () => { th.hold = false; th.home = this.post(); });
    }
  }
}
