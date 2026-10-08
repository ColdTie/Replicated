// The warren at runtime: the hatch by the base, which copy goes down to dig or to rest, how far each dig has
// come, and the save. The copies decide the layout themselves (their minds call dig_room / furnish; the canned
// mind does too); this turns those decisions into rooms (src/world/warren.ts), spends the village work pool on
// the digging and keeps the planet's planet_states.data.warren up to date. WarrenScene is the view you walk
// through; it hooks `view` to see swings, finished rooms, songs and copies coming and going.
import Phaser from 'phaser';
import { sound } from '../audio/Sound';
import { tex } from '../core/assets';
import { PALETTE, WARREN } from '../core/data';
import { session } from '../core/session';
import type { Light } from '../fx/Lighting';
import type { MindAction, WarrenData, WarrenItem, WarrenRoom } from '../net/store';
import type { PlanetScene } from '../scenes/PlanetScene';
import { allRooms, digSpot, placeItem, placeRoom, restOf, type Dir, type ItemKind, type RoomSize } from '../world/warren';
import type { Npc } from './Npc';

export type BelowTask = 'dig' | 'rest' | 'furnish' | 'linger' | 'idle';
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

const LINGER_AT: string[] = ['bench', 'mural', 'planter', 'workbench', 'shelf'];

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

  constructor(private scene: PlanetScene, data: WarrenData | undefined) {
    this.data = data ? structuredClone(data) : { rooms: [], items: [] };
    this.hatch = this.data.hatch ?? this.findHatchSpot();
    this.data.hatch = this.hatch;
    const { x, y } = this.hatch;
    this.hatchSprite = scene.add.sprite(x, y + 2, tex('hatch', scene.planet.id), 0).setOrigin(0.5, 1).setDepth(52);
    this.hatchLight = scene.lighting.add({ x, y: y - 4, radius: 40, color: PALETTE[10], intensity: 0, flicker: 0.15 });
    this.hatchGlow = scene.add.image(x, y - 3, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(PALETTE[9]).setAlpha(0).setScale(0.6, 0.35).setDepth(6100);
    this.refreshHatch();
    // a copy with a bed slept while nobody was here
    for (const n of scene.npcs) if (restOf(this.data, n.data.id)) n.weary = 0;
  }

  /** Something has been dug: the hatch is open and you can go down. */
  get opened() { return this.data.rooms.some((r) => r.dug); }
  get planned() { return this.data.rooms.filter((r) => !r.dug); }

  /** A clear patch below the base for the way down, kept for good once chosen. */
  private findHatchSpot() {
    const c = this.scene.baseCenter;
    const tries = [[0, 46], [-34, 42], [34, 42], [-52, 24], [52, 24], [0, 64], [-24, 70], [24, 70], [-70, 40], [70, 40]];
    for (let i = 0; i < 60; i++) {
      const [ox, oy] = i < tries.length ? tries[i] : [(Math.random() - 0.5) * 160, 20 + Math.random() * 70];
      const x = Math.round(c.x + ox), y = Math.round(c.y + oy);
      if (!this.scene.isClear(x, y, 28, 16)) continue;
      const r = this.scene.replicatorSpot, v = this.scene.vesselPos;
      if (Math.hypot(x - r.x, y - r.y) < 34 || Math.hypot(x - v.x, y - v.y) < 40) continue;
      if (this.scene.nodes.some((n) => n.alive && Math.hypot(n.x - x, n.y - y) < 24)) continue;
      return { x, y };
    }
    return { x: Math.round(c.x), y: Math.round(c.y + 46) };
  }

  private refreshHatch() {
    const open = this.opened, any = this.data.rooms.length > 0;
    this.hatchSprite.setVisible(any).setFrame(open ? 1 : 0);
    this.hatchLight.intensity = open ? 0.7 : 0;
    this.hatchGlow.setAlpha(open ? 0.16 : 0);
  }

  playerOnHatch() {
    const p = this.scene.player;
    return this.opened && Math.abs(p.x - this.hatch.x) < 9 && Math.abs(p.y - this.hatch.y) < 6;
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

  /** furnish: something goes into a room (a resting station belongs to `forId`). */
  furnish(npc: Npc, a: MindAction): WarrenItem | null {
    const kind = (a.item ?? 'lamp') as ItemKind;
    const item = placeItem(this.data, { room: a.room, kind, by: npc.data.id, for: kind === 'rest' ? a.forId ?? npc.data.id : undefined, note: a.detail });
    if (!item) return null;
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

  // ------------------------------------------------------------ the copies' work down there

  /** What this copy should do about the warren now: dig a planned room, make its bed, go to bed, or nothing. */
  pickTask(npc: Npc, night: number): { task: BelowTask; room?: WarrenRoom } | null {
    const work = this.scene.village.work;
    // only rooms that open off a dug room: the warren grows out from the ladder, never as islands
    const dug = new Set(['entrance', ...this.data.rooms.filter((r) => r.dug).map((r) => r.id)]);
    const open = this.planned.filter((r) => !this.digging.has(r.id) && work >= WARREN.digWork[r.size] && dug.has(r.link ?? 'entrance'));
    if (open.length) {
      const room = open.sort((a, b) => (a.by === npc.data.id ? 0 : 1) - (b.by === npc.data.id ? 0 : 1) || a.at - b.at)[0];
      this.digging.set(room.id, npc);
      return { task: 'dig', room };
    }
    if (!this.opened) return null;
    const bed = restOf(this.data, npc.data.id);
    if (!bed) {
      // the home drive: a copy with no bed makes itself one in a dug room, as soon as there is work for it
      if (work < WARREN.furnishWork) return null;
      const room = allRooms(this.data).filter((r) => r.dug && r.id !== 'entrance' && this.roomHasSpot(r.name, 'rest'))
        .sort((a, b) => (a.kind === 'rest' ? 0 : 1) - (b.kind === 'rest' ? 0 : 1) || (a.by === npc.data.id ? 0 : 1) - (b.by === npc.data.id ? 0 : 1))[0];
      return room ? { task: 'furnish', room } : null;
    }
    // bed: at its own bedtime, when weary, or when it has simply been a while; never twice in quick succession
    const r = WARREN.rest;
    const every = r.everyMinutes * 60_000;
    const last = this.lastRest.get(npc.data.id) ?? (this.clock - every * (0.3 + Math.random() * 0.5));
    if (!this.lastRest.has(npc.data.id)) this.lastRest.set(npc.data.id, last);
    const since = this.clock - last;
    if (since < every * 0.6) return null;
    if (night >= npc.nightFrom || npc.weary >= 0.85 || since > every) { this.lastRest.set(npc.data.id, this.clock); return { task: 'rest' }; }
    return null;
  }

  private roomHasSpot(room: string, kind: ItemKind) {
    return !!placeItem(this.data, { room, kind, by: '' });
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
    npc.surface(this.hatch.x, this.hatch.y + 10);
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
          this.afterWork(b);
        }
      } else if (b.task === 'furnish') {
        if (!b.arrived || this.clock < b.nextSwingAt) continue;
        b.swings++;
        b.nextSwingAt = this.clock + WARREN.swingMs;
        this.view?.onSwing(b);
        if (b.swings >= 5) {
          const item = this.furnish(b.npc, { type: 'furnish', item: 'rest', room: b.room!.name, forId: b.npc.data.id });
          if (item) { this.scene.village.work = Math.max(0, this.scene.village.work - WARREN.furnishWork); this.scene.village.markWorkDirty(); }
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

  private completeRoom(room: WarrenRoom, npc: Npc) {
    room.dug = true;
    this.digging.delete(room.id);
    this.scene.village.work = Math.max(0, this.scene.village.work - WARREN.digWork[room.size]);
    this.scene.village.markWorkDirty();
    this.save();
    this.refreshHatch();
    this.view?.onRoomDug(room);
    if (Math.hypot(this.scene.player.x - this.hatch.x, this.scene.player.y - this.hatch.y) < 220 || this.view) sound.build();
    this.scene.mindLog.push({ t: this.scene.mindClock, text: `${npc.data.name} finished digging ${room.name}` });
    if (this.scene.canHear()) this.scene.game.events.emit('notice', `${npc.data.name.toUpperCase()} DUG ${room.name.toUpperCase()}`);
  }

  save() {
    this.scene.pending.warren = structuredClone(this.data);
    void this.scene.flushPlanet();
  }
}
