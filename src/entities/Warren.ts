// The warren at runtime: the hole by the vessel the first copy digs, which copy goes down to dig or to rest, how
// far each dig has come, the planet's supplies (stone, soil, wood, scrap; Ember is the pool) and the
// save. The copies decide the layout themselves (their minds call dig_room / furnish; the canned mind does too);
// this turns those decisions into rooms (src/world/warren.ts), pays for them in wood, stone and the rest
// (src/data/supplies.json) and keeps planet_states.data.warren / data.supplies up to date. WarrenScene is the
// view you walk through; it hooks `view` to see swings, finished rooms, songs and copies coming and going.
import Phaser from 'phaser';
import { sound } from '../audio/Sound';
import { tex } from '../core/assets';
import { kitColor } from '../core/body';
import { PALETTE, SUPPLIES, WARREN } from '../core/data';
import { session } from '../core/session';
import type { Light } from '../fx/Lighting';
import type { MindAction, WarrenData, WarrenItem, WarrenRoom } from '../net/store';
import type { PlanetScene } from '../scenes/PlanetScene';
import { allRooms, digSpot, placeItem, placeRoom, restOf, type Dir, type ItemKind, type RoomSize } from '../world/warren';
import type { Npc } from './Npc';

export type BelowTask = 'dig' | 'rest' | 'furnish' | 'linger' | 'idle';
/** What a copy does about the warren next: below (dig, furnish, rest) or on the surface (entrance, wood, scrap). */
export type WarrenTask = { task: BelowTask | 'entrance' | 'wood' | 'scavenge'; room?: WarrenRoom; ruinIndex?: number };
export interface Below {
  npc: Npc; task: BelowTask; room?: WarrenRoom; item?: WarrenItem;
  /** it has walked to where it works or sleeps (always true when nobody is watching) */
  arrived: boolean;
  swings: number; nextSwingAt: number; until: number;
}

export interface WarrenView {
  onSwing(b: Below): void;
  onRoomDug(room: WarrenRoom): void;
  onItem(item: WarrenItem): void;
  onArrive(b: Below): void;
  /** the copy's task changed (work done, now lingering by a bench) */
  onRetask(b: Below): void;
  onLeave(npc: Npc): void;
  sing(npc: Npc, text: string, readable: boolean, opts: { silent?: boolean; harmony?: boolean; notes?: string }): void;
}

type Recipe = Record<string, number | boolean>;
const LINGER_AT: string[] = ['bench', 'mural', 'planter', 'workbench', 'shelf'];
const MATERIALS = Object.keys(SUPPLIES.materials).filter((m) => m !== 'ember');
const RECIPES = SUPPLIES.recipes as Record<string, Recipe>;

export class Warren {
  data: WarrenData;
  readonly hatch: { x: number; y: number };
  below = new Map<Npc, Below>();
  /** the open underground view, while you are down there */
  view?: WarrenView;
  /** ms, advanced by whichever scene is running (the planet pauses while you are below) */
  clock = 0;
  private hatchSprite: Phaser.GameObjects.Sprite;
  private hatchLight: Light;
  private hatchGlow: Phaser.GameObjects.Image;
  private digging = new Map<string, Npc>();
  private lastRest = new Map<string, number>();
  private entranceDigger: { npc: Npc; at: number } | null = null;
  private nextWood = new Map<Npc, number>();

  constructor(private scene: PlanetScene, data: WarrenData | undefined) {
    this.data = data ? structuredClone(data) : { rooms: [], items: [] };
    // warrens from before the entrance was its own dig (session 9): a dug room means the hole is open
    this.data.entrance ??= { dug: this.data.rooms.some((r) => r.dug), swings: 0 };
    this.hatch = this.data.hatch ?? this.findHatchSpot();
    this.data.hatch = this.hatch;
    const { x, y } = this.hatch;
    this.hatchSprite = scene.add.sprite(x, y + 4, tex('hatch', scene.planet.id), 0).setOrigin(0.5, 1).setDepth(52);
    this.hatchLight = scene.lighting.add({ x, y: y - 2, radius: 44, color: PALETTE[10], intensity: 0, flicker: 0.15 });
    this.hatchGlow = scene.add.image(x, y - 1, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(PALETTE[9]).setAlpha(0).setScale(0.7, 0.4).setDepth(6100);
    this.refreshHatch();
    // a copy with a bed slept while nobody was here
    for (const n of scene.npcs) if (restOf(this.data, n.data.id)) n.weary = 0;
  }

  /** The hole is open: you (and the copies) can go down. */
  get opened() { return !!this.data.entrance?.dug; }
  get planned() { return this.data.rooms.filter((r) => !r.dug); }
  get supplies() { return this.scene.supplies; }

  /** A clear patch a few tiles from the vessel for the way down, kept for good once chosen. */
  private findHatchSpot() {
    const v = this.scene.vesselPos, c = this.scene.baseCenter;
    const tries = [[46, 24], [-46, 24], [56, 6], [-56, 6], [42, 44], [-42, 44], [0, 52], [64, 30], [-64, 30]];
    for (let i = 0; i < 80; i++) {
      const [ox, oy] = i < tries.length ? tries[i] : [(Math.random() - 0.5) * 180, (Math.random() - 0.3) * 90];
      const x = Math.round(v.x + ox), y = Math.round(v.y + oy);
      if (!this.scene.isClear(x, y, 36, 22)) continue;
      const r = this.scene.replicatorSpot;
      if (Math.hypot(x - r.x, y - r.y) < 36 || Math.hypot(x - v.x, y - v.y) < 36 || Math.hypot(x - c.x, y - c.y) < 30) continue;
      if (Math.abs(x - v.x) < 22 && y > v.y && y < v.y + 30) continue; // the boarding ring
      if (this.scene.nodes.some((n) => n.alive && Math.hypot(n.x - x, n.y - y) < 26)) continue;
      return { x, y };
    }
    return { x: Math.round(v.x + 46), y: Math.round(v.y + 24) };
  }

  /** Nothing until a copy lives here; then the mark, the pit, the open hole. */
  refreshHatch() {
    const e = this.data.entrance!;
    const any = this.scene.npcs.length > 0 || this.data.rooms.length > 0 || e.swings > 0 || e.dug;
    this.hatchSprite.setVisible(any).setFrame(e.dug ? 2 : e.swings >= SUPPLIES.entrance.swings / 2 ? 1 : 0);
    this.hatchLight.intensity = e.dug ? 0.7 : 0;
    this.hatchGlow.setAlpha(e.dug ? 0.16 : 0);
  }

  playerOnHatch() {
    const p = this.scene.player;
    return this.opened && Math.abs(p.x - this.hatch.x) < 11 && Math.abs(p.y - this.hatch.y) < 7;
  }

  // ------------------------------------------------------------ supplies

  /** Storage per material: the base plus every shelf in a dug room. */
  get cap() {
    const dug = new Set(['entrance', ...this.data.rooms.filter((r) => r.dug).map((r) => r.id)]);
    const shelves = this.data.items.filter((i) => i.kind === 'shelf' && dug.has(i.room)).length;
    return SUPPLIES.baseCap + shelves * SUPPLIES.shelfCap;
  }

  /** Adds to the planet's supplies (Ember to the pool); returns what fit. */
  add(material: string, n: number) {
    if (n <= 0) return 0;
    if (material === 'ember') { this.scene.addEmbers(Math.round(n)); return n; }
    const have = this.supplies[material] ?? 0;
    const got = Math.max(0, Math.min(n, this.cap - have));
    if (got > 0) { this.supplies[material] = Math.round((have + got) * 100) / 100; this.scene.markSupplies(); }
    return got;
  }

  /** Why this recipe cannot be paid right now, or null. */
  shortage(recipe: Recipe): string | null {
    const short: string[] = [];
    for (const [m, n] of Object.entries(recipe)) {
      if (m === 'bench') { if (n && !this.hasWorkbench) short.push('a workbench'); continue; }
      const have = m === 'ember' ? this.scene.embers : Math.floor(this.supplies[m] ?? 0);
      if (have < (n as number)) short.push(`${(n as number) - have} more ${m}`);
    }
    return short.length ? short.join(', ') : null;
  }

  /** Pays a recipe (after shortage() said it can be paid). */
  pay(recipe: Recipe) {
    for (const [m, n] of Object.entries(recipe)) {
      if (m === 'bench' || typeof n !== 'number') continue;
      if (m === 'ember') this.scene.addEmbers(-n);
      else this.supplies[m] = Math.round(((this.supplies[m] ?? 0) - n) * 100) / 100;
    }
    this.scene.markSupplies();
  }

  /** Lamps and murals in dug rooms: lamps stretch the copies' waking hours, murals lift their mood. */
  get lampCount() {
    const dug = new Set(['entrance', ...this.data.rooms.filter((r) => r.dug).map((r) => r.id)]);
    return this.data.items.filter((i) => i.kind === 'lamp' && dug.has(i.room)).length;
  }
  get muralCount() {
    const dug = new Set(['entrance', ...this.data.rooms.filter((r) => r.dug).map((r) => r.id)]);
    return this.data.items.filter((i) => i.kind === 'mural' && dug.has(i.room)).length;
  }

  get hasWorkbench() {
    const dug = new Set(['entrance', ...this.data.rooms.filter((r) => r.dug).map((r) => r.id)]);
    return this.data.items.some((i) => i.kind === 'workbench' && dug.has(i.room));
  }

  /** What is waiting on what, for the minds and the journal. */
  shortages(): string[] {
    const out: string[] = [];
    if (!this.opened) out.push('the way down is not dug yet');
    for (const r of this.planned) {
      const need = SUPPLIES.roomWood[r.size] - Math.floor(this.supplies.wood ?? 0);
      if (need > 0) out.push(`${r.name} waits for ${need} more wood to shore it up (cut a tree)`);
    }
    return out;
  }

  /**
   * Time passed while nobody was here: the copies dug on (up to a few rooms,
   * wood permitting) so the warren moves while you are away, the way the Ember pool does.
   */
  applyOffline(hours: number) {
    if (hours <= 0.05) return;
    if (!this.scene.npcs.length) return;
    // the copies grew lonely and aimless meanwhile
    for (const n of this.scene.npcs) n.advanceNeeds(hours);
    let dug = 0;
    if (!this.data.entrance!.dug && hours >= 0.25) { this.data.entrance!.dug = true; this.add('stone', SUPPLIES.entrance.yield.stone); this.add('soil', SUPPLIES.entrance.yield.soil); dug++; }
    for (const r of [...this.planned].sort((a, b) => a.at - b.at)) {
      if (dug >= SUPPLIES.offline.maxRoomsDugAway || hours < 0.25 * (dug + 1)) break;
      const anchorDug = r.link === 'entrance' || this.data.rooms.find((x) => x.id === r.link)?.dug;
      if (!anchorDug || !this.data.entrance!.dug || Math.floor(this.supplies.wood ?? 0) < SUPPLIES.roomWood[r.size]) continue;
      this.finishRoom(r);
      dug++;
    }
    if (dug) { this.save(); this.refreshHatch(); }
  }

  // ------------------------------------------------------------ what the minds decide

  /** dig_room: the copy marks out a room. Returns it, or null when there is no space left. */
  dig(npc: Npc, a: MindAction): WarrenRoom | null {
    const room = placeRoom(this.data, {
      kind: WARREN.kinds.includes(a.kind ?? '') ? a.kind! : 'other', name: a.name ?? '', size: (a.size ?? 'small') as RoomSize,
      beside: a.beside, dir: a.direction as Dir | undefined, purpose: a.purpose, by: npc.data.id,
    });
    if (!room) return null;
    this.data.rooms.push(room);
    this.save();
    this.refreshHatch();
    this.scene.mindLog.push({ t: this.scene.mindClock, text: `${npc.data.name} marked out ${room.name} in the warren (${room.size} ${room.kind}, ${room.dir} of ${this.nameOfRoom(room.link)})` });
    if (this.scene.canHear()) this.scene.game.events.emit('notice', `${npc.data.name.toUpperCase()} PLANS ${room.name.toUpperCase()}`);
    return room;
  }

  /**
   * furnish: something goes into a room, paid from the supplies (a resting station belongs to `forId`); placed
   * where the copy said (wall, corner, center, beside an item) and tinted in its chosen color.
   */
  furnish(npc: Npc, a: MindAction): WarrenItem | null {
    const kind = (a.item ?? 'lamp') as ItemKind;
    const recipe = RECIPES[kind];
    if (recipe && this.shortage(recipe)) return null;
    const tint = a.color ? kitColor(a.color, -1) : -1;
    const item = placeItem(this.data, {
      room: a.room, kind, by: npc.data.id, for: kind === 'rest' ? a.forId ?? npc.data.id : undefined, note: a.detail,
      placement: a.placement, beside: a.beside, tint: tint >= 0 ? tint : undefined,
    });
    if (!item) return null;
    if (recipe) this.pay(recipe);
    if (item.kind === 'rest' && item.for) {
      // one resting station each: a new one replaces the old
      this.data.items = this.data.items.filter((i) => !(i.kind === 'rest' && i.for === item.for));
    }
    this.data.items.push(item);
    this.save();
    const room = this.nameOfRoom(item.room);
    const who = item.for ? (item.for === npc.data.id ? 'itself' : this.scene.npcs.find((n) => n.data.id === item.for)?.data.name ?? 'someone') : '';
    this.scene.mindLog.push({ t: this.scene.mindClock, text: `${npc.data.name} put a ${item.kind === 'rest' ? `resting station for ${who}` : item.kind} in ${room}` });
    if (this.scene.canHear()) this.scene.game.events.emit('notice', item.kind === 'rest' ? `${npc.data.name.toUpperCase()} MAKES A RESTING STATION` : `${npc.data.name.toUpperCase()} ADDS A ${item.kind.toUpperCase()} TO ${room.toUpperCase()}`);
    if (this.data.rooms.find((r) => r.id === item.room)?.dug || item.room === 'entrance') this.view?.onItem(item);
    return item;
  }

  nameOfRoom(id: string | undefined) {
    return id === 'entrance' || !id ? 'the Entrance' : this.data.rooms.find((r) => r.id === id)?.name ?? 'a room';
  }

  // ------------------------------------------------------------ the copies' work

  /**
   * What this copy should do about the warren now: dig the way down, shore up and dig a planned room (cutting a
   * tree for the timber first), make its bed, scavenge a ruin for scrap, go to bed, or nothing.
   */
  pickTask(npc: Npc, night: number): WarrenTask | null {
    const e = this.data.entrance!;
    if (!e.dug) {
      if (this.entranceDigger && this.clock - this.entranceDigger.at > 60_000) this.entranceDigger = null;
      if (!this.entranceDigger) { this.entranceDigger = { npc, at: this.clock }; return { task: 'entrance' }; }
      return null;
    }
    const wood = Math.floor(this.supplies.wood ?? 0);
    const canCut = this.scene.treesNearBase() > 0 && this.clock > (this.nextWood.get(npc) ?? 0);
    const cut = () => { this.nextWood.set(npc, this.clock + 45_000); return { task: 'wood' } as WarrenTask; };
    // rooms that open off a dug room: the warren grows out from the ladder, never as islands
    const dug = new Set(['entrance', ...this.data.rooms.filter((r) => r.dug).map((r) => r.id)]);
    const open = this.planned.filter((r) => !this.digging.has(r.id) && dug.has(r.link ?? 'entrance'))
      .sort((a, b) => (a.by === npc.data.id ? 0 : 1) - (b.by === npc.data.id ? 0 : 1) || a.at - b.at);
    if (open.length) {
      const room = open.find((r) => wood >= SUPPLIES.roomWood[r.size]);
      if (room) { this.digging.set(room.id, npc); return { task: 'dig', room }; }
      if (canCut) return cut();
    }
    const bed = restOf(this.data, npc.data.id);
    if (!bed) {
      // the home drive: a copy with no bed makes itself one in a dug room, once the stone and wood are there
      const room = allRooms(this.data).filter((r) => r.dug && r.id !== 'entrance' && this.roomHasSpot(r.name, 'rest'))
        .sort((a, b) => (a.kind === 'rest' ? 0 : 1) - (b.kind === 'rest' ? 0 : 1) || (a.by === npc.data.id ? 0 : 1) - (b.by === npc.data.id ? 0 : 1))[0];
      if (room) {
        const short = this.shortage(RECIPES.rest);
        if (!short) return { task: 'furnish', room };
        if (short.includes('wood') && canCut) return cut();
      }
    }
    // scrap for lamps and workbenches: scavenge an opened ruin now and then
    if ((this.supplies.scrap ?? 0) < 2 && Math.random() < 0.3) {
      const ruin = this.scene.ruins.find((r) => r.open && Date.now() - (this.data.scavenged?.[r.index] ?? 0) > SUPPLIES.ruinCooldownMinutes * 60_000);
      if (ruin) return { task: 'scavenge', ruinIndex: ruin.index };
    }
    // bed: at its own bedtime, when weary, or when it has simply been a while; never twice in quick succession
    const r = WARREN.rest;
    const every = r.everyMinutes * 60_000;
    const last = this.lastRest.get(npc.data.id) ?? (this.clock - every * (0.3 + Math.random() * 0.5));
    if (!this.lastRest.has(npc.data.id)) this.lastRest.set(npc.data.id, last);
    const since = this.clock - last;
    if (!bed || since < every * 0.6) return null;
    if (night >= npc.nightFrom || npc.weary >= 0.85 || since > every) { this.lastRest.set(npc.data.id, this.clock); return { task: 'rest' }; }
    return null;
  }

  private roomHasSpot(room: string, kind: ItemKind) {
    return !!placeItem(this.data, { room, kind, by: '' });
  }

  /** The first copy digs the hole: walks to the mark and breaks ground; the pile grows, then the ladder goes in. */
  digEntrance(npc: Npc) {
    const e = this.data.entrance!;
    const h = this.hatch;
    const ok = npc.startChore({
      x: h.x, y: h.y + 6, swings: Math.max(1, SUPPLIES.entrance.swings - e.swings),
      swing: () => {
        e.swings++;
        this.scene.fx.dust(h.x + (Math.random() - 0.5) * 14, h.y + 2, 3);
        this.scene.fx.sparks(h.x + (Math.random() - 0.5) * 10, h.y - 2, PALETTE[4], 2);
        if (Math.hypot(this.scene.player.x - h.x, this.scene.player.y - h.y) < 180) sound.hit();
        this.refreshHatch();
      },
      done: () => {
        this.entranceDigger = null;
        if (e.dug) return;
        e.dug = true;
        this.add('stone', SUPPLIES.entrance.yield.stone);
        this.add('soil', SUPPLIES.entrance.yield.soil);
        this.save();
        this.refreshHatch();
        this.scene.fx.dust(h.x, h.y + 2, 12);
        if (Math.hypot(this.scene.player.x - h.x, this.scene.player.y - h.y) < 240) sound.build();
        this.scene.mindLog.push({ t: this.scene.mindClock, text: `${npc.data.name} dug the way down into the warren, by the vessel` });
        if (this.scene.canHear()) this.scene.game.events.emit('notice', `${npc.data.name.toUpperCase()} DUG THE WAY DOWN`);
      },
    });
    if (!ok) this.entranceDigger = null;
  }

  /** A copy picks over an opened ruin for scrap. */
  scavenge(npc: Npc, ruinIndex: number) {
    const ruin = this.scene.ruins.find((r) => r.index === ruinIndex);
    if (!ruin) return;
    const m = ruin.machinePos;
    npc.startChore({
      x: m.x, y: m.y + 4, swings: 4,
      swing: () => { this.scene.fx.sparks(m.x + (Math.random() - 0.5) * 8, m.y - 8, PALETTE[9], 3); if (Math.hypot(this.scene.player.x - m.x, this.scene.player.y - m.y) < 180) sound.hit(); },
      done: () => {
        this.data.scavenged = { ...(this.data.scavenged ?? {}), [ruinIndex]: Date.now() };
        this.scene.flyMaterial('scrap', m, this.hatch, SUPPLIES.scrapPerRuin);
        this.save();
        this.scene.mindLog.push({ t: this.scene.mindClock, text: `${npc.data.name} scavenged ${SUPPLIES.scrapPerRuin} scrap from a ruin` });
      },
    });
  }

  /** The copy could not get to the hatch: free its room for someone else. */
  release(npc: Npc) {
    for (const [id, n] of this.digging) if (n === npc) this.digging.delete(id);
  }

  /** The copy reached the hatch and drops in. */
  enter(npc: Npc, task: BelowTask, room?: WarrenRoom) {
    if (task === 'dig' && (!room || room.dug)) task = 'idle';
    if (task === 'furnish' && (!room || !room.dug)) task = 'idle';
    const b: Below = { npc, task, room, arrived: !this.view, swings: 0, nextSwingAt: this.clock + 900, until: this.clock + (task === 'rest' ? WARREN.rest.minutes * 60_000 : 2000) };
    this.below.set(npc, b);
    npc.hideBelow();
    this.scene.fx.dust(this.hatch.x, this.hatch.y + 2, 6);
    if (Math.hypot(this.scene.player.x - this.hatch.x, this.scene.player.y - this.hatch.y) < 200) sound.pop();
    this.view?.onArrive(b);
  }

  /** The view walked the copy to its spot. */
  arrive(b: Below) {
    b.arrived = true;
    b.nextSwingAt = this.clock + 500;
    if (b.task === 'rest') b.until = Math.max(b.until, this.clock + WARREN.rest.minutes * 60_000 * 0.6);
  }

  /** Back up the ladder. */
  leave(npc: Npc) {
    if (!this.below.delete(npc)) return;
    this.release(npc);
    this.view?.onLeave(npc);
    npc.surface(this.hatch.x, this.hatch.y + 12);
    this.scene.fx.dust(this.hatch.x, this.hatch.y + 2, 5);
  }

  /** Where a copy stands while it works, sleeps or lingers, in warren pixels (feet). */
  spotFor(b: Below): { x: number; y: number } {
    const px = (t: { x: number; y: number }) => ({ x: t.x * 16 + 8, y: t.y * 16 + 11 });
    if (b.task === 'dig' && b.room) return px(digSpot(this.data, b.room));
    if (b.task === 'furnish' && b.room) return { x: (b.room.x + b.room.w / 2) * 16, y: (b.room.y + 1) * 16 + 11 };
    if (b.task === 'rest') {
      const pod = restOf(this.data, b.npc.data.id);
      if (pod) return { x: pod.x * 16 + 8, y: pod.y * 16 + 13 };
    }
    if (b.task === 'linger' && b.item) return { x: b.item.x * 16 + 8, y: (b.item.y + 1) * 16 + 11 };
    const e = this.data.rooms.find((r) => r.dug);
    const base = e ?? { x: 20, y: 2, w: 5, h: 4 };
    return { x: (base.x + base.w / 2) * 16, y: (base.y + base.h - 1) * 16 + 11 };
  }

  update(dt: number) {
    this.clock += dt;
    for (const b of [...this.below.values()]) {
      if (b.task === 'dig') {
        const room = b.room!;
        if (room.dug) { this.afterWork(b); continue; }
        if (!b.arrived || this.clock < b.nextSwingAt) continue;
        b.swings++;
        b.nextSwingAt = this.clock + WARREN.swingMs;
        this.view?.onSwing(b);
        if (b.swings >= WARREN.digSwings[room.size]) {
          this.completeRoom(room, b.npc);
          b.npc.onWorked();
          this.afterWork(b);
        }
      } else if (b.task === 'furnish') {
        if (!b.arrived || this.clock < b.nextSwingAt) continue;
        b.swings++;
        b.nextSwingAt = this.clock + WARREN.swingMs;
        this.view?.onSwing(b);
        if (b.swings >= 5) {
          if (this.furnish(b.npc, { type: 'furnish', item: 'rest', room: b.room!.name, forId: b.npc.data.id })) b.npc.onWorked();
          this.afterWork(b);
        }
      } else if (this.clock >= b.until) {
        if (b.task === 'rest') this.finishRest(b);
        else this.leave(b.npc);
      }
    }
  }

  /** Work done: a while by a bench, a mural or the planters (downtime), or straight back up. */
  private afterWork(b: Below) {
    const dugRooms = new Set(['entrance', ...this.data.rooms.filter((r) => r.dug).map((r) => r.id)]);
    const spots = this.data.items.filter((i) => LINGER_AT.includes(i.kind) && dugRooms.has(i.room));
    if (spots.length && Math.random() < 0.7) {
      b.task = 'linger';
      b.item = spots[Math.floor(Math.random() * spots.length)];
      b.room = undefined;
      b.arrived = !this.view;
      b.until = this.clock + 14_000 + Math.random() * 20_000;
    } else {
      b.task = 'idle';
      b.room = undefined;
      b.until = this.clock + 2200;
    }
    this.view?.onRetask(b);
  }

  /** Slept: rested for good (remembered on its row), then maybe a quiet moment before going up. */
  private finishRest(b: Below) {
    const npc = b.npc;
    npc.weary = 0;
    npc.data.traits.weary = 0;
    npc.data.traits.sleptAt = Date.now();
    const st = session.store;
    if (st && !this.scene.shot && !npc.data.id.startsWith('fake') && npc.data.id !== 'pending') st.saveReplicant(npc.data).catch(() => undefined);
    this.scene.mindLog.push({ t: this.scene.mindClock, text: `${npc.data.name} slept in its resting station and woke rested` });
    if (Math.random() < 0.5) this.afterWork(b);
    else this.leave(npc);
  }

  /** The room is cut: timber spent, stone and soil won. */
  private finishRoom(room: WarrenRoom) {
    room.dug = true;
    this.digging.delete(room.id);
    this.supplies.wood = Math.max(0, Math.round(((this.supplies.wood ?? 0) - SUPPLIES.roomWood[room.size]) * 100) / 100);
    const tiles = room.w * room.h;
    this.add('stone', tiles * SUPPLIES.digYield.stonePerTile);
    this.add('soil', tiles * SUPPLIES.digYield.soilPerTile);
    this.scene.markSupplies();
  }

  private completeRoom(room: WarrenRoom, npc: Npc) {
    this.finishRoom(room);
    this.save();
    this.refreshHatch();
    this.view?.onRoomDug(room);
    if (Math.hypot(this.scene.player.x - this.hatch.x, this.scene.player.y - this.hatch.y) < 220 || this.view) sound.build();
    this.scene.mindLog.push({ t: this.scene.mindClock, text: `${npc.data.name} finished digging ${room.name} (${Math.round(room.w * room.h * SUPPLIES.digYield.stonePerTile)} stone won)` });
    if (this.scene.canHear()) this.scene.game.events.emit('notice', `${npc.data.name.toUpperCase()} DUG ${room.name.toUpperCase()}`);
  }

  save() {
    this.scene.pending.warren = structuredClone(this.data);
    void this.scene.flushPlanet();
  }

  /** The supplies in words, for the minds and the journal. */
  describeSupplies() {
    const s = MATERIALS.map((m) => `${m} ${Math.floor(this.supplies[m] ?? 0)}`).join(', ');
    return `${s}, ember ${this.scene.embers} (the base holds ${this.cap} of each; shelves add ${SUPPLIES.shelfCap})`;
  }
}
