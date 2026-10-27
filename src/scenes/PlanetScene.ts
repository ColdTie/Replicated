import Phaser from 'phaser';
import SOUND_DATA from '../data/sound.json';
import { sound, type Surface } from '../audio/Sound';
import { anim, tex } from '../core/assets';
import { BACKEND, BEACON, BUILDINGS, ENEMIES, ITEMS, PALETTE, PLANETS, PLAYER, STRUCTURES, SUPPLIES, TOWN_SAFE_TILES, VILLAGE, WARREN, hex, type HopperDef, type PlanetDef, type SkitterDef, type SpitterDef } from '../core/data';
import { DRIFT, replicate, stat } from '../core/drift';
import { session } from '../core/session';
import { Base } from '../entities/Base';
import { Beacon } from '../entities/Beacon';
import { Guardian } from '../entities/Guardian';
import type { Enemy } from '../entities/Enemy';
import { Hopper } from '../entities/Hopper';
import { Npc } from '../entities/Npc';
import { Village } from '../entities/Village';
import { Warren } from '../entities/Warren';
import { Buildings } from '../entities/Buildings';
import { Bioworks } from '../entities/Bioworks';
import { WildCems } from '../entities/WildCems';
import { MannyDock } from '../entities/Manny';
import { inManny, vesselAway, vesselHere } from '../core/mannies';
import { demoWarren } from '../world/warren';
import { planetAt } from '../world/system';
import { Player, squash } from '../entities/Player';
import { CrystalNode, NODE, Shard, Spark, type NodeKind } from '../entities/Resources';
import { Skitter } from '../entities/Skitter';
import { Spitter, Spore } from '../entities/Spitter';
import { Butterflies, Flock, Grazer } from '../entities/Wildlife';
import { Atmosphere } from '../fx/Atmosphere';
import { Environment } from '../fx/Environment';
import { Fx } from '../fx/Fx';
import { Lighting } from '../fx/Lighting';
import { makeVignette } from '../fx/textures';
import { Controls } from '../input/Controls';
import type { AwayItem, SeenState, Building, DoorState, Gift, NodeState, PlanetData, PlanetSave, ReplicantSave, WarrenData } from '../net/store';
import { paintGround } from '../world/groundPaint';
import { paintRock } from '../world/rockPaint';
import { COLLIDE_TILES, Cell, DECOR, TILE, generatePlanet, type PlanetMap } from '../world/planetGen';
import { TOWN_TUNING, birthOrder, nextFreeLot, occupiedLots, type TownState } from '../world/town';
import { BEACONS, planetFor, starById } from '../world/galaxy';
import { Departure } from './planet/Departure';
import { Link } from './planet/Link';
import { Homeworld } from './planet/Homeworld';
import { Tutorial } from './planet/Tutorial';
import { WakeChoice, type WakeOrHold } from '../ui/wakeChoice';
import { Hands } from './planet/Hands';
import { Homecoming } from './planet/Homecoming';
import { Trade } from './planet/Trade';
import { Minds } from './planet/Minds';
import { Saving } from './planet/Saving';
import { Talk } from './planet/Talk';
import { Town } from './planet/Town';
import { NO_INPUT, kitLists } from './planet/shared';
import { PARTS } from '../core/body';
import HOMEWORLD from '../data/homeworld.json';

export const DEPTH = { ground: 0, walls: 1, shadow: 50, actors: 100, fog: 5000, dark: 6000, glow: 6100, fx: 6150, ui: 6300, vignette: 7000 };

interface InitData {
  planetId?: string;
  seed?: number;
  shot?: boolean;
  /** Visiting a settled planet as a hologram while your ship is in flight */
  visit?: { star: string; planetIndex: number };
  /** Just arrived from a journey: the vessel lands */
  arrival?: boolean;
  /** Just linked in (manny.json): woken in this world's manny, or back in your own body aboard the vessel here */
  link?: 'manny' | 'vessel';
}

const SAVE_EVERY_MS = 4000;
const POS_SAVE_EVERY_MS = 10000;

export class PlanetScene extends Phaser.Scene {
  planet!: PlanetDef;
  map!: PlanetMap;
  lighting!: Lighting;
  fx!: Fx;
  player!: Player;
  enemies: Enemy[] = [];
  nodes: CrystalNode[] = [];
  shards: Shard[] = [];
  sparks: Spark[] = [];
  spores: Spore[] = [];
  beacon?: Beacon;
  guardian?: Guardian;
  litBeacons: string[] = [];
  npcs: Npc[] = [];
  village!: Village;
  warren!: Warren;
  buildings!: Buildings;
  /** the Cem bed (homeworld): where supplies are shipped and the Cems build from */
  bioworks?: Bioworks;
  /** the Cems' world's wild fields (planets.json wildCems) */
  wild?: WildCems;
  embers = 0;
  /** the planet's materials (src/data/supplies.json); Ember is `embers` */
  supplies: Record<string, number> = {};
  /** real hours nobody was here before this load (0 while you play) */
  private awayHours = 0;
  env!: Environment;

  private atmosphere!: Atmosphere;
  private grazers: Grazer[] = [];
  private flocks: Flock[] = [];
  private butterflies?: Butterflies;
  /** Grass, reeds and flowers that bend when you walk through them, bucketed by tile */
  private bendables = new Map<number, Phaser.GameObjects.Image[]>();
  private reflection!: Phaser.GameObjects.Image;
  private glints!: Phaser.GameObjects.Particles.ParticleEmitter;
  private lookahead = new Phaser.Math.Vector2();
  private slow = 1;
  private lastKillAt = 0;
  private wasInWater = false;
  private fpsSamples: number[] = [];
  private nextFpsSample = 0;
  private lowQuality = new URLSearchParams(location.search).has('low');
  controls!: Controls;
  private walls!: Phaser.Tilemaps.TilemapLayer;
  private solids!: Phaser.Physics.Arcade.StaticGroup;
  vessel!: Phaser.GameObjects.Sprite;
  private cradle?: Phaser.GameObjects.Image;
  private vesselCue?: { group: Phaser.GameObjects.Container; icon: Phaser.GameObjects.Image; arrow: Phaser.GameObjects.Graphics; shown: number };
  base!: Base;
  private home = new Phaser.Math.Vector2();
  stopped = false;
  private seed?: number;
  shot = false;
  /** The player stands in the town (or close by): no creature goes after them (enemies.json townSafe). */
  playerSafe = false;
  /** Screenshot mode: enemies hold still. */
  private frozen = false;

  // pending changes not yet written to the store
  pending: { embers: number; nodes: Record<string, NodeState>; doors: Record<string, DoorState>; structures?: PlanetData['structures']; npcTick?: number; village?: PlanetData['village']; beacon?: PlanetData['beacon']; felled?: number[]; warren?: WarrenData; supplies?: Record<string, number>; buildings?: Building[]; label?: string; biome?: string; layout?: number; town?: TownState; gifts?: Gift[]; seen?: SeenState; founded?: boolean; cembed?: PlanetData['cembed'] } = { embers: 0, nodes: {}, doors: {} };
  /** who lives on which lot of the town (planet_states.data.town) */
  townState: TownState = { lots: {}, civic: {} };
  /** this load moved an old save into the town: saved positions of the player and the copies are ignored once */
  migrated = false;
  /** the copies did not load (or the planet did not): an old save is not moved into the town / nothing is saved */
  npcsLoaded = true;
  loadFailed = false;
  replicating = false;
  /** Hologram visit while the replicant's ship is flying elsewhere: no position saves, no launching */
  visit: { star: string; planetIndex: number } | null = null;
  arrival = false;
  link: InitData['link'] = undefined;
  /** You drive a manny here and the vessel is on another world (or flying): its berth stands empty */
  vesselAway = false;
  dock!: MannyDock;
  launching = false;
  boardSpot = { x: 0, y: 0 };
  private boardRing?: Phaser.GameObjects.Ellipse;
  /** after climbing out of the warren, the hatch waits a moment before it takes you again */
  private hatchReadyAt = 0;
  /** when this planet's load began (performance.now), for ?perf */
  private loadT0 = 0;
  /** how long the player has stood on the open hatch, and the ring that fills meanwhile */
  private hatchDwell = 0;
  private hatchRing?: Phaser.GameObjects.Graphics;
  trees: { index: number; x: number; y: number; sprite: Phaser.GameObjects.Sprite; zone: Phaser.GameObjects.Zone; alive: boolean }[] = [];
  // the scene's parts (src/scenes/planet/): made once, like the scene object they belong to
  readonly talker = new Talk(this);
  readonly minds = new Minds(this);
  readonly saver = new Saving(this);
  readonly towner = new Town(this);
  readonly departure = new Departure(this);
  readonly hands = new Hands(this);
  readonly homecoming = new Homecoming(this);
  readonly trade = new Trade(this);
  readonly linker = new Link(this);
  readonly homeworld = new Homeworld(this);
  readonly tutorial = new Tutorial(this);
  /** the maker's choice over the Replicator (wake or hold) while it is open */
  choice?: WakeChoice;

  constructor() { super('planet'); }

  // what entities, the warren view and the playtests reach on the scene
  get mindLog() { return this.minds.mindLog; }
  get mindClock() { return this.minds.mindClock; }
  set mindClock(v: number) { this.minds.mindClock = v; }
  get nextWake() { return this.minds.nextWake; }
  get talkable() { return this.talker.talkable; }
  tickMinds(dt: number) { this.minds.tickMinds(dt); }
  /** A talk wake (Talk asks for it through here, so a playtest can stand in for the mind). */
  requestTalk(npc: Npc, said = '') { return this.minds.requestTalk(npc, said); }
  mindContext(npc: Npc) { return this.minds.mindContext(npc); }
  wake(npc: Npc) { return this.minds.wake(npc); }
  replayAway(items: AwayItem[]) { this.minds.replayAway(items); }
  chorus(force = false) { this.minds.chorus(force); }
  cutTree(npc: Npc) { return this.minds.cutTree(npc); }
  toggleJournal() { return this.minds.toggleJournal(); }
  talkTo(id: string, text: string) { return this.minds.talkTo(id, text); }
  giveTo(id: string) { this.minds.giveTo(id); }
  awakenCopy(id: string) { return this.minds.awakenCopy(id); }
  flushPlanet() { return this.saver.flushPlanet(); }
  homeLot(id: string) { return this.towner.homeLot(id); }
  markTown() { this.towner.markTown(); }
  canLaunch() { return this.departure.canLaunch(); }

  init(data: InitData) {
    const r = session.replicant;
    this.visit = data.visit ?? null;
    this.arrival = !!data.arrival;
    this.link = data.link;
    this.vesselAway = false;
    this.planet = PLANETS.find((p) => p.id === data.planetId)
      ?? (this.visit ? planetFor(this.visit.star, this.visit.planetIndex) : undefined)
      ?? (r ? planetFor(r.star_id, r.planet_index) : undefined)
      ?? PLANETS[0];
    this.seed = data.seed;
    this.shot = !!data.shot;
    this.enemies = []; this.nodes = []; this.shards = []; this.spores = []; this.embers = 0; this.stopped = false; this.frozen = false;
    this.grazers = []; this.flocks = []; this.butterflies = undefined; this.bendables = new Map(); this.slow = 1;
    this.npcs = []; this.replicating = false; this.launching = false;
    this.sparks = []; this.beacon = undefined; this.guardian = undefined; this.litBeacons = [];
    // the scene object is reused between planets: drop the old player so update() waits for the new world
    this.player = undefined as unknown as Player;
    this.pending = { embers: 0, nodes: {}, doors: {} };
    this.hands.reset();
    this.hatchRing = undefined;
    this.hatchDwell = 0;
    this.homecoming.reset();
    this.trade.reset();
    this.homeworld.reset();
    this.tutorial.reset();
    this.choice = undefined;
    this.bioworks = undefined;
    this.wild = undefined;
    this.townState = { lots: {}, civic: {} };
    this.migrated = false;
    this.npcsLoaded = true;
    this.loadFailed = false;
  }

  async preloadSave(): Promise<PlanetSave | null> {
    const st = session.store;
    if (!st) return null;
    return st.loadPlanet(this.planet.star, this.planet.planetIndex, this.seed ?? this.planet.seed);
  }

  async loadNpcs(): Promise<ReplicantSave[]> {
    const st = session.store;
    if (!st) return [];
    return st.listNpcs(this.planet.star, this.planet.planetIndex);
  }

  create() {
    // Loading the planet save is async; build the world once it arrives.
    this.loadT0 = performance.now();
    this.cameras.main.setBackgroundColor(PALETTE[25]);
    const save = this.preloadSave().catch(() => this.preloadSave())
      .catch((e) => { console.warn('planet load failed, playing without saving', e); this.loadFailed = true; return null; });
    const npcs = this.loadNpcs().catch(() => this.loadNpcs())
      .catch((e) => { console.warn('copies load failed', e); this.npcsLoaded = false; return [] as ReplicantSave[]; });
    void Promise.all([save, npcs.then((n) => this.homeworld.ensureThales(n))]).then(([s, n]) => this.build(s, n));
  }

  get baseCenter() { return this.map.base.center; }
  /** Where copies bring their Embers */
  get replicatorSpot() { return { x: this.base.x, y: this.base.y }; }
  get vesselPos() { return { x: this.vessel.x, y: this.vessel.y }; }

  /** Tells the UI where we are and who lives here (you and the copies), for the corner label. */
  announceLocation() {
    const star = starById(this.planet.star);
    const sp = planetAt(this.planet.star, this.planet.planetIndex);
    const place = sp?.moon ? `${this.planet.name} - ${sp.name}` : `${this.planet.name} - ${star?.name ?? '?'}`;
    const who: { name: string; color: number }[] = [];
    const me = session.replicant;
    if (me && !this.visit) who.push({ name: me.name.toUpperCase(), color: PALETTE[me.traits.feature ?? PLAYER.feature[1]] });
    for (const n of this.npcs) who.push({ name: n.data.name.toUpperCase(), color: PALETTE[n.data.traits.feature ?? PLAYER.feature[1]] });
    this.game.events.emit('location', place, who);
  }

  /** True when a point is inside a wall, a solid (tree, structure) or a crystal node. */
  blockedAt(x: number, y: number) {
    if (!this.isWalkable(x, y)) return true;
    for (const z of this.solids.getChildren() as Phaser.GameObjects.Zone[]) if (z.getBounds().contains(x, y)) return true;
    for (const n of this.nodes) if (n.alive && n.zone.getBounds().contains(x, y)) return true;
    return false;
  }

  /** Walkable ground with no solid (tree, wall, structure) in a w x h box around the point. */
  isClear(x: number, y: number, w: number, h: number) {
    for (const [ox, oy] of [[0, 0], [-w / 2, 0], [w / 2, 0], [0, -h / 2], [0, h / 2]]) {
      if (!this.isWalkable(x + ox, y + oy) || ['void', 'water'].includes(this.surfaceAt(x + ox, y + oy))) return false;
    }
    const box = new Phaser.Geom.Rectangle(x - w / 2, y - h / 2, w, h);
    for (const z of this.solids.getChildren() as Phaser.GameObjects.Zone[]) {
      if (Phaser.Geom.Intersects.RectangleToRectangle(box, z.getBounds())) return false;
    }
    return true;
  }

  private build(save: PlanetSave | null, npcRows: ReplicantSave[] = []) {
    const tSaved = performance.now();
    npcRows = birthOrder(npcRows);
    session.planet = save;
    const p = this.planet;
    const { width, height } = this.scale;
    this.map = generatePlanet(p, this.seed ?? p.seed);
    const tGen = performance.now();
    const m = this.map;
    const pw = m.w * 16, ph = m.h * 16;
    npcRows = this.withScreenshotCopies(npcRows);
    this.towner.settleTown(save, npcRows);
    save = this.homeworld.found(save);
    session.planet = save;
    this.embers = save?.embers ?? 0;
    this.supplies = { ...(save?.data.supplies ?? {}) };
    this.awayHours = 0;

    this.lighting = new Lighting(this, hex(p.ambient), DEPTH.dark);
    this.fx = new Fx(this, PALETTE[p.accent[1]], PALETTE[p.accent[2]]);
    this.atmosphere = new Atmosphere(this, p);
    this.controls = new Controls(this);
    this.solids = this.physics.add.staticGroup();

    // Floor: one painted image for the whole planet (src/world/groundPaint.ts); the tilemap keeps water and walls
    // (the walls layer also holds invisible collision over the void)
    const tPaint0 = performance.now();
    this.addPaintedGround(p.id, this.seed ?? p.seed, save?.data.buildings);
    sound.setWorld(p.id);
    const tPaint1 = performance.now();
    this.addPaintedRock(p.id, this.seed ?? p.seed);
    // paint times (ground, rock) for tools/playtest-town.mjs
    (window as unknown as { __paintMs: number[] }).__paintMs = [tPaint1 - tPaint0, performance.now() - tPaint1];
    const tm = this.make.tilemap({ tileWidth: 16, tileHeight: 16, width: m.w, height: m.h });
    const ts = tm.addTilesetImage('tiles', tex('tiles', p.id), 16, 16, 0, 0)!;
    const waterOnly = m.ground.map((row, y) => row.map((t, x) => (m.cells[y * m.w + x] === Cell.Water ? t : -1)));
    tm.createBlankLayer('ground', ts)!.putTilesAt(waterOnly, 0, 0).setDepth(DEPTH.ground);
    this.walls = tm.createBlankLayer('walls', ts)!.putTilesAt(m.walls, 0, 0).setDepth(DEPTH.walls);
    this.walls.setCollision(COLLIDE_TILES);
    this.drawWaterEdges();
    this.env = new Environment(this, p, this.lighting, this.atmosphere, (x, y) => this.surfaceAt(x, y) !== 'void' && this.isWalkable(x, y), this.shot ? 21 : undefined);

    // Decor, landmarks and the glows that make the world readable without words
    const bend = new Set<number>([DECOR.tuft, DECOR.tuftSmall, DECOR.reeds, DECOR.flower]);
    for (const d of m.decor) {
      const img = this.add.image(d.x, d.y, tex('decor', p.id), d.frame).setOrigin(0.5, 1).setDepth(d.frame === DECOR.lily ? DEPTH.ground + 2 : DEPTH.actors + d.y);
      if (bend.has(d.frame)) {
        const k = Math.floor(d.y / 16) * m.w + Math.floor(d.x / 16);
        if (!this.bendables.has(k)) this.bendables.set(k, []);
        this.bendables.get(k)!.push(img);
      }
    }
    // Trees keep their own solid so a copy can cut one down (felled ones are remembered per planet)
    const felled = new Set(save?.data.felled ?? []);
    const treeBlockers = new Set<number>();
    this.trees = [];
    m.props.forEach((pr, i) => {
      if (pr.sprite === 'tree') {
        const bi = m.blockers.findIndex((b, k) => !treeBlockers.has(k) && b.x === pr.x && b.y === pr.y - 2 && b.w === 8);
        if (bi >= 0) treeBlockers.add(bi);
        if (felled.has(i)) return;
        const s = this.add.sprite(pr.x, pr.y, tex('tree', p.id), pr.frame).setOrigin(0.5, 1).setDepth(DEPTH.actors + pr.y);
        if (pr.frame === 0) this.time.delayedCall(Math.random() * 1500, () => { if (s.active) s.play(anim(tex('tree', p.id), 'sway')); });
        this.trees.push({ index: i, x: pr.x, y: pr.y, sprite: s, zone: this.addSolid(pr.x, pr.y - 2, 8, 5), alive: true });
        return;
      }
      this.add.sprite(pr.x, pr.y, tex(pr.sprite, p.id), pr.frame).setOrigin(0.5, 1).setDepth(DEPTH.actors + pr.y);
    });
    m.blockers.forEach((b, k) => { if (!treeBlockers.has(k)) this.addSolid(b.x, b.y, b.w, b.h); });
    for (const g of m.glows) {
      if (g.kind === 'door') {
        this.lighting.add({ x: g.x, y: g.y, radius: 64, color: PALETTE[10], intensity: 0.95, flicker: 0.15 });
        const glow = this.add.image(g.x, g.y, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(PALETTE[9]).setAlpha(0.3).setScale(0.9).setDepth(DEPTH.glow);
        this.tweens.add({ targets: glow, alpha: 0.16, duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      } else if (g.kind === 'mushroom') {
        this.lighting.add({ x: g.x, y: g.y, radius: 22, color: PALETTE[p.accent[2]], intensity: 0.6, flicker: 0.3 });
        this.add.image(g.x, g.y, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(PALETTE[p.accent[2]]).setAlpha(0.18).setScale(0.3).setDepth(DEPTH.glow);
      } else {
        this.lighting.add({ x: g.x, y: g.y, radius: 18, color: PALETTE[8], intensity: 0.7, flicker: 0.8 });
      }
    }

    // Base: vessel (warm, ours), the cradle on Earth, the build pad
    const b = m.base;
    this.home.set(b.cradle.x, b.cradle.y + 16);
    const vesselShadow = this.add.image(b.vessel.x, b.vessel.y + 2, 'shadow').setTint(PALETTE[25]).setAlpha(0.5).setScale(2.6, 2).setDepth(DEPTH.shadow);
    this.vessel = this.add.sprite(b.vessel.x, b.vessel.y + 4, 'vessel').setOrigin(0.5, 1).setDepth(DEPTH.actors + b.vessel.y);
    this.vessel.play(anim('vessel', 'idle'));
    const vesselSolid = this.addSolid(b.vessel.x, b.vessel.y - 4, 24, 10);
    // stand here (just below the vessel) and press action to open the star map
    this.boardSpot = { x: b.vessel.x, y: b.vessel.y + 14 };
    this.boardRing = this.add.ellipse(this.boardSpot.x, this.boardSpot.y, 20, 8).setDepth(55).setStrokeStyle(1, PALETTE[9], 0.4);
    const vesselLight = this.lighting.add({ x: b.vessel.x, y: b.vessel.y - 10, radius: 110, color: 0xffc98a, intensity: 1, flicker: 0.08 });
    const vesselGlow = this.add.image(b.vessel.x, b.vessel.y - 6, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(PALETTE[9]).setAlpha(0.2).setScale(1.2).setDepth(DEPTH.glow);
    // a warm pool on the ground under the ship so the base reads as a hearth from a distance
    this.add.image(b.vessel.x, b.vessel.y + 8, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(PALETTE[9]).setAlpha(0.1).setScale(2.2, 0.9).setDepth(DEPTH.glow);
    this.makeVesselCue();
    // driving a manny while the vessel is on another world (or flying): an empty berth where it lands
    const me = session.replicant;
    this.vesselAway = !!me && inManny(me) && !this.visit && !vesselHere(me, p.star, p.planetIndex);
    if (this.vesselAway) {
      for (const o of [this.vessel, vesselShadow, vesselGlow]) o.setVisible(false);
      vesselLight.intensity = 0.25;
      this.solids.remove(vesselSolid, true, true);
      const berth = this.add.graphics().setDepth(DEPTH.ground + 5);
      berth.lineStyle(1, PALETTE[22], 0.7).strokeEllipse(b.vessel.x, b.vessel.y - 2, 40, 14);
      berth.lineStyle(1, PALETTE[9], 0.5).strokeEllipse(b.vessel.x, b.vessel.y - 2, 26, 8);
      for (const [dx, dy] of [[-24, 0], [24, 0], [0, -9], [0, 7]]) berth.fillStyle(PALETTE[9], 0.6).fillRect(b.vessel.x + dx - 1, b.vessel.y - 2 + dy, 2, 1);
    }
    // a flight that went on without you and has landed since: the star is reached
    if (me && inManny(me) && !this.shot) void vesselAway(me, session.store);
    if (p.intro === 'wake') {
      this.cradle = this.add.image(b.cradle.x, b.cradle.y + 6, tex('cradle', p.id), 1).setOrigin(0.5, 1).setDepth(DEPTH.actors + b.cradle.y - 4);
      this.lighting.add({ x: b.cradle.x, y: b.cradle.y, radius: 30, color: PALETTE[18], intensity: 0.5, flicker: 0.2 });
    }
    const built = !!save?.data.structures?.some((s) => s.type === 'replicator');
    this.base = new Base(this, b.pad.x, b.pad.y, built);
    this.village = new Village(this, save?.data.structures, save?.data.village?.work);
    this.spawnNpcs(npcRows, save);
    this.announceLocation();

    // Resources (restoring chipped/broken crystals; they regrow after a while) and creatures
    // iron ore and hydrogen vents follow the crystals (their indexes go on after them)
    const regrowMs = BACKEND.nodeRegrowMinutes * 60_000;
    [...m.nodes.map((n) => ({ ...n, kind: 'ember' as NodeKind })), ...m.ores].forEach((n, i) => {
      let hits = save?.data.nodes?.[i]?.hits ?? 0;
      const at = save?.data.nodes?.[i]?.at ?? 0;
      if (hits >= NODE[n.kind].hits && Date.now() - at > regrowMs) {
        hits = 0;
        this.pending.nodes[i] = { hits: 0, at: Date.now() };
      }
      this.nodes.push(new CrystalNode(this, n.x * 16 + 8, n.y * 16 + 10, i, hits, n.kind));
    });
    // the way down to the warren the copies dig (hatch spot kept per planet); it moved on while nobody was here
    this.warren = new Warren(this, save?.data.warren);
    this.bioworks = new Bioworks(this, save);
    if (p.wildCems) this.wild = new WildCems(this, save, p.wildCems);
    this.buildings = new Buildings(this, save?.data.buildings);
    this.homeworld.placePrinters();
    this.time.delayedCall(2500, () => this.towner.grantGifts(save?.data.gifts));
    if (!this.shot && !this.visit) { this.warren.applyOffline(this.awayHours); this.buildings.applyOffline(this.awayHours); this.trade.accrueAway(this.awayHours); }
    for (const e of m.enemies) {
      const def = ENEMIES[e.type];
      const ex = e.x * 16 + 8, ey = e.y * 16 + 8;
      if (def.kind === 'hopper') this.enemies.push(new Hopper(this, def as HopperDef, ex, ey));
      else if (def.kind === 'spitter') this.enemies.push(new Spitter(this, def as SpitterDef, ex, ey));
      else this.enemies.push(new Skitter(this, def as SkitterDef, ex, ey));
    }

    // Beacon worlds: the monolith and, until it is lit, its sleeping keeper
    if (m.beacon) {
      const lit = !!save?.data.beacon?.lit;
      this.beacon = new Beacon(this, m.beacon.x, m.beacon.y, lit);
      if (!lit) {
        this.guardian = new Guardian(this, BEACON.guardian, m.beacon.guardian.x, m.beacon.guardian.y, () => this.onKeeperDown());
        this.enemies.push(this.guardian);
        if (p.beacon) p.subtitle = 'A BEACON SLEEPS HERE';
      }
    }
    session.store?.litBeacons().then((l) => { this.litBeacons = l; }).catch(() => undefined);

    // Player: a returning replicant appears where it was; a new one wakes in the cradle
    const r = session.replicant;
    const awake = !!r?.traits.awake;
    const saved = r && r.star_id === p.star && r.planet_index === p.planetIndex && r.pos_x != null && r.pos_y != null
      && this.isWalkable(r.pos_x, r.pos_y) && !this.migrated ? { x: r.pos_x, y: r.pos_y! } : null;
    // just moved into the town: the replicant stands by the vessel (its old spot belongs to the old layout); linked
    // into a husk that waited in the vault: just out of its door
    const start = saved ?? (this.link === 'manny' ? { x: b.dock.x, y: b.dock.y + 10 } : this.link === 'vessel' ? this.boardSpot
      : this.migrated ? { x: b.vessel.x + 20, y: b.vessel.y + 18 } : this.home);
    this.player = new Player(this, start.x, start.y);
    this.dock = new MannyDock(this, b.dock.x, b.dock.y);
    this.reflection = this.add.image(0, 0, this.player.sprite.texture.key).setOrigin(0.5, 0).setFlipY(true)
      .setAlpha(0.3).setTint(0x9ab8ff).setDepth(DEPTH.ground + 3).setVisible(false);
    this.glints = this.add.particles(0, 0, 'px1', {
      emitting: false, lifespan: 700, alpha: { start: 0.9, end: 0 }, scaleX: { start: 1, end: 3 },
      blendMode: Phaser.BlendModes.ADD, tint: PALETTE[20],
    }).setDepth(DEPTH.ground + 4);
    this.spawnWildlife();

    // Physics
    this.physics.world.setBounds(0, 0, pw, ph);
    const nodeZones = this.nodes.map((n) => n.zone);
    const enemyZones = this.enemies.map((e) => e.zone);
    this.physics.add.collider(this.player.zone, [this.walls, this.solids, ...nodeZones, ...this.enemies.filter((e) => e instanceof Spitter || e instanceof Guardian).map((e) => e.zone)] as Phaser.Types.Physics.Arcade.ArcadeColliderType);
    this.physics.add.collider(enemyZones, [this.walls, this.solids, ...nodeZones] as Phaser.Types.Physics.Arcade.ArcadeColliderType);
    this.physics.add.collider(enemyZones, enemyZones);

    // Camera
    const cam = this.cameras.main;
    cam.setBounds(0, 0, pw, ph);
    cam.setRoundPixels(true);
    cam.startFollow(this.player.zone, true, 0.1, 0.1, 0, 8);
    cam.centerOn(start.x, start.y);

    makeVignette(this, width, height);
    this.add.image(0, 0, 'vignette').setOrigin(0).setScrollFactor(0).setDepth(DEPTH.vignette);

    this.game.events.emit('embers', this.embers);
    this.saver.setupSaving();

    this.scene.launch('ui'); // (re)starts the overlay; the previous planet's shutdown stopped it
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scene.stop('ui'));
    if (this.visit) this.player.setHologram();
    if (this.shot) {
      this.player.locked = false;
      this.stageForScreenshot();
    } else if (this.arrival) {
      this.playLanding(vesselShadow, vesselLight, vesselGlow);
    } else if (this.link) {
      this.linker.playLinkIn(this.link);
    } else if (this.visit) {
      this.playReturn();
    } else if (!awake && r?.traits.handedBy) {
      this.homeworld.playHeldWake();
    } else if (p.intro === 'scan' && !awake) {
      this.homeworld.playScan();
    } else if (p.intro === 'wake' && !awake) {
      this.playWake();
    } else if (p.intro === 'land' && !saved && !awake) {
      this.playLanding(vesselShadow, vesselLight, vesselGlow);
    } else {
      this.playReturn();
    }
    (window as unknown as { __scene: PlanetScene }).__scene = this;
    // where the load went (ms): ?perf shows it on screen, so it can be read on the laptop it is played on
    const t = performance.now(), paint = (window as unknown as { __paintMs: number[] }).__paintMs;
    const phases = { save: tSaved - this.loadT0, world: tGen - tSaved, ground: paint[0], rock: paint[1], rest: t - tGen - paint[0] - paint[1], total: t - this.loadT0 };
    (window as unknown as { __loadMs: typeof phases }).__loadMs = phases;
    if (new URLSearchParams(location.search).has('perf')) {
      const f = (ms: number) => (ms / 1000).toFixed(2);
      this.time.delayedCall(600, () => this.game.events.emit('perf', `LOAD ${f(phases.total)}S  SAVE ${f(phases.save)}  WORLD ${f(phases.world)}  GROUND ${f(phases.ground)}  ROCK ${f(phases.rock)}  REST ${f(phases.rest)}`));
    }
  }

  addSolid(x: number, y: number, w: number, h: number) {
    const z = this.add.zone(x, y, w, h);
    this.solids.add(z);
    return z;
  }

  private addPaintedGround(styleId: string, seed: number, buildings?: Building[]) {
    // the streets are worn as far out as someone lives; a footpath leads to every home and building
    const g = paintGround(this.map, styleId, seed, occupiedLots(this.map.town, this.townState, buildings));
    const key = 'floor';
    if (this.textures.exists(key)) this.textures.remove(key);
    const ct = this.textures.createCanvas(key, g.width, g.height)!;
    ct.getContext().putImageData(new ImageData(g.data, g.width, g.height), 0, 0);
    ct.refresh();
    this.add.image(0, 0, key).setOrigin(0).setDepth(DEPTH.ground - 1);
  }

  /** Rock outcrops: one painted image over the wall tiles (which stay for collision). */
  private addPaintedRock(styleId: string, seed: number) {
    const g = paintRock(this.map, styleId, seed);
    const key = 'rock';
    if (this.textures.exists(key)) this.textures.remove(key);
    const ct = this.textures.createCanvas(key, g.width, g.height)!;
    ct.getContext().putImageData(new ImageData(g.data, g.width, g.height), 0, 0);
    ct.refresh();
    this.add.image(0, 0, key).setOrigin(0).setDepth(DEPTH.walls + 0.5);
  }

  /** Dark 1px banks along pond sides so water reads as sunk into the ground. */
  private drawWaterEdges() {
    const m = this.map;
    const water = (x: number, y: number) => x >= 0 && y >= 0 && x < m.w && y < m.h && m.cells[y * m.w + x] === Cell.Water;
    const g = this.add.graphics().setDepth(DEPTH.ground + 1);
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
      if (!water(x, y)) continue;
      g.fillStyle(PALETTE[15]);
      if (!water(x - 1, y)) g.fillRect(x * 16, y * 16, 1, 16);
      if (!water(x + 1, y)) g.fillRect(x * 16 + 15, y * 16, 1, 16);
      g.fillStyle(PALETTE[17], 0.6);
      if (!water(x, y + 1)) g.fillRect(x * 16, y * 16 + 15, 16, 1);
    }
  }

  /** Random open floor point (pixel coords), away from the base. */
  randomOpenPoint(minFromBase = 80): { x: number; y: number } | null {
    const m = this.map;
    const c = m.base.center;
    for (let i = 0; i < 200; i++) {
      const x = Phaser.Math.Between(2, m.w - 3), y = Phaser.Math.Between(2, m.h - 3);
      if (m.cells[y * m.w + x] !== Cell.Floor || m.walls[y][x] >= 0) continue;
      const px = x * 16 + 8, py = y * 16 + 8;
      if (Math.hypot(px - c.x, py - c.y) < minFromBase) continue;
      return { x: px, y: py };
    }
    return null;
  }

  private spawnWildlife() {
    const w = this.planet.wildlife;
    if (!w) return;
    const c = this.map.base.center;
    // one grazer always near the base so it is the first friend you meet
    if (w.grazers) this.grazers.push(new Grazer(this, c.x + 60, c.y + 40));
    for (let i = 1; i < w.grazers; i++) {
      const pt = this.randomOpenPoint(120);
      if (pt) this.grazers.push(new Grazer(this, pt.x, pt.y));
    }
    for (let i = 0; i < Math.ceil(w.birds / 4); i++) this.flocks.push(new Flock(this, () => this.randomOpenPoint(100), Math.min(4, w.birds - i * 4)));
    const flowers = this.map.decor.filter((d) => d.frame === DECOR.flower);
    const homes = [];
    for (let i = 0; i < w.butterflies; i++) {
      const f = flowers.length ? flowers[Math.floor(Math.random() * flowers.length)] : this.randomOpenPoint(40);
      if (f) homes.push({ x: f.x, y: f.y });
    }
    homes.push({ x: c.x + 20, y: c.y + 50 });
    if (w.butterflies) this.butterflies = new Butterflies(this, homes);
  }

  // --- intros ---

  /** Earth, first time: the cradle glows, opens, and the replicant boots up (visor flickers on). */
  private playWake() {
    const pl = this.player;
    const c = this.cradle!;
    c.setFrame(0);
    pl.hide(); // nothing of the replicant shows until the cradle opens
    this.cameras.main.fadeIn(1400, 24, 20, 37);
    const lid = this.lighting.add({ x: c.x, y: c.y - 8, radius: 40, color: PALETTE[18], intensity: 0 });
    this.tweens.add({ targets: lid, intensity: 1, duration: 900, yoyo: true, hold: 500, delay: 600 });
    this.time.delayedCall(1700, () => {
      c.setFrame(1);
      this.fx.sparks(c.x, c.y - 8, PALETTE[18], 12);
      this.shake(120, 0.004);
      pl.setPosition(c.x, c.y - 2);
      pl.show();
      pl.light.active = false;
      pl.sprite.setTint(0x404060);
      // visor flickers on: dark, flash, dark, on
      sound.wake();
      const steps = [[0, 0], [140, 0], [260, 1], [360, 0], [520, 1]];
      for (const [t, v] of steps) this.time.delayedCall(t, () => { pl.light.active = v > 0.5; if (v > 0.5) pl.sprite.clearTint(); });
    });
    this.time.delayedCall(2500, () => {
      const hop = { t: 0 };
      const sx = c.x, sy = c.y - 2, ex = this.home.x, ey = this.home.y;
      this.tweens.add({
        targets: hop, t: 1, duration: 360,
        onUpdate: () => { pl.setPosition(sx + (ex - sx) * hop.t, sy + (ey - sy) * hop.t); pl.sprite.y -= Math.sin(hop.t * Math.PI) * 10; },
        onComplete: () => {
          pl.setPosition(ex, ey);
          squash(this, pl.sprite, 1.35, 0.7, 120);
          this.fx.dust(ex, ey + 2, 6);
          pl.locked = false;
          this.saver.markAwake();
          this.homecoming.remember();
          this.game.events.emit('titlecard', this.planet.name, this.planet.subtitle);
        },
      });
    });
  }

  /** Returning replicant: fades in where it was standing. */
  private playReturn() {
    const pl = this.player;
    pl.locked = true;
    this.cameras.main.fadeIn(700, 24, 20, 37);
    pl.sprite.setAlpha(0);
    this.tweens.add({ targets: pl.sprite, alpha: 1, duration: 500, delay: 250 });
    this.time.delayedCall(450, () => {
      squash(this, pl.sprite, 0.7, 1.3, 140);
      this.fx.sparks(pl.x, pl.y - 8, PALETTE[10], 8);
      this.game.events.emit('titlecard', this.planet.name, this.planet.subtitle);
      this.homecoming.run(() => { pl.locked = false; this.saver.markAwake(); });
    });
  }

  /** Vessel descends, thumps down, the replicant hops out, title card. */
  private playLanding(shadow: Phaser.GameObjects.Image, light: { intensity: number }, glow: Phaser.GameObjects.Image) {
    const ly = this.vessel.y;
    this.vessel.y = ly - 190;
    shadow.setScale(0.6, 0.5).setAlpha(0.1);
    this.player.hide(); // nothing of the replicant on the ground until it hops out
    this.cameras.main.centerOn(this.vessel.x, ly);
    sound.landing(1.7);
    light.intensity = 0.5;
    glow.setAlpha(0.1);
    const thrust = this.add.particles(0, 0, 'px', {
      lifespan: { min: 200, max: 420 },
      speedY: { min: 60, max: 120 },
      speedX: { min: -18, max: 18 },
      scale: { start: 1.5, end: 0 },
      tint: [PALETTE[10], PALETTE[9], PALETTE[11]],
      blendMode: Phaser.BlendModes.ADD,
      frequency: 12,
    }).setDepth(DEPTH.fx);
    const thrustLight = this.lighting.add({ x: this.vessel.x, y: this.vessel.y, radius: 60, color: PALETTE[9], intensity: 0.9 });
    const follow = () => {
      thrust.setPosition(this.vessel.x, this.vessel.y - 4);
      thrustLight.x = this.vessel.x;
      thrustLight.y = this.vessel.y;
    };
    follow();
    this.tweens.add({ targets: shadow, scaleX: 2.6, scaleY: 2, alpha: 0.5, duration: 1700, ease: 'Sine.easeOut' });
    this.tweens.add({
      targets: this.vessel, y: ly, duration: 1700, ease: 'Sine.easeOut', onUpdate: follow,
      onComplete: () => {
        thrust.stop();
        this.time.delayedCall(500, () => thrust.destroy());
        this.lighting.remove(thrustLight);
        this.shake(220, 0.01);
        for (let i = 0; i < 6; i++) this.fx.dust(this.vessel.x - 18 + i * 7, ly - 1, 4);
        squash(this, this.vessel, 1.15, 0.85, 140);
        this.tweens.add({ targets: light, intensity: 1, duration: 600 });
        this.tweens.add({ targets: glow, alpha: 0.22, duration: 600 });
        this.time.delayedCall(450, () => this.hopOut());
      },
    });
  }

  hopOut() {
    const pl = this.player;
    const sx = this.vessel.x, sy = this.vessel.y - 6, ex = this.vessel.x, ey = this.vessel.y + 14;
    pl.setPosition(sx, sy);
    pl.show();
    const hop = { t: 0 };
    this.tweens.add({
      targets: hop, t: 1, duration: 380, ease: 'Linear',
      onUpdate: () => {
        pl.setPosition(sx + (ex - sx) * hop.t, sy + (ey - sy) * hop.t);
        pl.sprite.y -= Math.sin(hop.t * Math.PI) * 14;
      },
      onComplete: () => {
        pl.setPosition(ex, ey);
        squash(this, pl.sprite, 1.35, 0.7, 120);
        this.fx.dust(ex, ey + 2, 6);
        this.game.events.emit('titlecard', this.planet.name, this.planet.subtitle);
        this.trade.unload();
        this.bioworks?.announce();
        this.tutorial.landed();
        this.homecoming.run(() => { pl.locked = false; this.saver.markAwake(); });
      },
    });
  }

  /** Deterministic pose for screenshots: player next to a crystal, a creature nearby, shards around. */
  private stageForScreenshot() {
    const c = this.map.base.center;
    const node = this.nodes.filter((n) => n.kind === 'ember').sort((a, b) =>
      Phaser.Math.Distance.Between(a.x, a.y, c.x, c.y) - Phaser.Math.Distance.Between(b.x, b.y, c.x, c.y))[0];
    let px = node.x - 30, py = node.y + 6;
    for (const [ox, oy] of [[-30, 6], [30, 6], [0, 26], [-26, 20], [26, 20], [0, -20]]) {
      if (this.isWalkable(node.x + ox, node.y + oy) && this.isWalkable(node.x + ox * 2.2, node.y + oy)) { px = node.x + ox; py = node.y + oy; break; }
    }
    const view = new URLSearchParams(location.search).get('view');
    if (view === 'base') { px = c.x + 20; py = c.y + 30; }
    if (view === 'pond') {
      const m = this.map;
      for (let i = 0; i < m.cells.length; i++) if (m.cells[i] === Cell.Water && m.cells[i - 1] === Cell.Water && m.cells[i + 1] === Cell.Water) {
        px = (i % m.w) * 16 + 8; py = Math.floor(i / m.w) * 16 + 8; break;
      }
    }
    const atBeacon = view?.startsWith('beacon') && this.map.beacon;
    if (atBeacon) { px = this.map.beacon!.guardian.x - 6; py = this.map.beacon!.guardian.y + 46; }
    this.player.setPosition(px, py);
    this.player.facing = 1;
    this.enemies.forEach((e, i) => {
      if (i > 1 || atBeacon) return;
      e.body.reset(px + (i ? 46 : -40), py + (i ? -14 : 8));
      e.sync();
    });
    this.cameras.main.centerOn(px, py);
    for (let i = 0; i < 3; i++) this.spawnShard(node.x - 12, node.y + 2);
    this.embers = Math.max(this.embers, view === 'base' ? STRUCTURES.replicator.cost : 12);
    this.game.events.emit('embers', this.embers, true);
    this.frozen = true;
    if (view === 'beacon-lit' && this.beacon && this.guardian) {
      this.guardian.sprite.setVisible(false);
      this.enemies = this.enemies.filter((e) => e !== this.guardian);
      this.onKeeperDown();
    }
    if (view === 'warren') {
      // a warren already dug and lived in: rooms, a few things inside, copies asleep and digging
      this.warren.data = demoWarren(this.npcs.map((n) => n.data.id));
      this.warren.data.hatch = this.warren.hatch;
      this.npcs.forEach((n, i) => {
        const planned = this.warren.planned[0];
        if (i === 0 && planned) this.warren.enter(n, 'dig', planned);
        else this.warren.enter(n, 'rest');
      });
      this.player.setPosition(this.warren.hatch.x, this.warren.hatch.y + 14);
      this.time.delayedCall(200, () => this.descend(true));
    }
    // the Cem bed awake (the Printworks finished), the store full; prints under way; the design menu open
    if (view === 'bioworks' || view === 'printing' || view === 'designs') {
      const goal = this.buildings.list.find((b) => b.id === HOMEWORLD.goal);
      if (goal && !goal.built) this.buildings.finishNow(goal.id);
      this.bioworks?.wake(false);
      for (const k of ['salt', 'iron', 'quartz', 'copper', 'wood']) this.supplies[k] = 38;
      this.markSupplies();
      this.embers = Math.max(this.embers, 40);
      const bw = this.bioworks;
      if (bw?.lot) { px = bw.center.x - 30; py = bw.center.y + 34; }
      if (view === 'printing') {
        const first = (['house', 'storehouse'] as const).map((id, k) => {
          const b = this.buildings.print(id);
          if (b) b.printStart = Date.now() - (b.printMs ?? 0) * (k ? 0.3 : 0.55);
          return b;
        })[0];
        if (first) { px = first.x - 50; py = first.y + 26; }
      }
      if (view === 'designs') this.time.delayedCall(300, () => { if (this.bioworks) { this.bioworks.readyAt = 0; this.bioworks.openMenu(); } });
      this.player.setPosition(px, py);
      this.cameras.main.centerOn(px, py - 10);
    }
    // a Biolab standing by the awake bed, wild Cems aboard: in front of its door (view=strain changes them a moment later)
    if (view === 'biolab' || view === 'strain') {
      const goal = this.buildings.list.find((b) => b.id === HOMEWORLD.goal);
      if (goal && !goal.built) this.buildings.finishNow(goal.id);
      this.bioworks?.wake(false);
      const lab = this.buildings.standNow('biolab');
      const me = session.replicant;
      if (me) me.traits.wild = { from: 'gliese-12:1', at: Date.now() };
      if (lab) { px = lab.x + 30; py = lab.y + 22; }
      if (view === 'strain') this.time.delayedCall(400, () => this.bioworks?.alter());
      this.player.setPosition(px, py);
      this.cameras.main.centerOn(lab ? lab.x : px, py - 16);
    }
    // the Cems' world: beside the wild field nearest the town
    if (view === 'wild' && this.wild?.fields.length) {
      const c = this.baseCenter, f = [...this.wild.fields].sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y))[0];
      px = f.x - 10; py = f.y + f.ry + 14;
      this.player.setPosition(px, py);
      this.cameras.main.centerOn(px, py - 14);
    }
    // a culture of Cems aboard on a world without a bed: the ghost of the bed with the salt for it; seeded
    if ((view === 'seed' || view === 'seeded') && !this.bioworks?.active) {
      const me = session.replicant;
      if (me) me.traits.culture = { from: 'lhs-1140:2', at: Date.now() };
      this.supplies.salt = 14;
      this.markSupplies();
      this.bioworks?.offer(session.planet);
      const bw = this.bioworks;
      if (bw?.lot) { px = bw.center.x - 34; py = bw.center.y + 40; }
      if (view === 'seeded') this.time.delayedCall(400, () => this.bioworks?.seed());
      this.player.setPosition(px, py);
      this.cameras.main.centerOn(px, py - 10);
    }
    // a wider look for reviewing a layout (?zoom=0.5)
    const zoom = Number(new URLSearchParams(location.search).get('zoom') ?? 1);
    if (zoom > 0 && zoom !== 1) this.cameras.main.setZoom(zoom);
    if (view === 'replicate') {
      (this.base as unknown as { placeReplicator(a: boolean): void }).placeReplicator(false);
      this.embers = DRIFT.cost;
      this.player.setPosition(this.base.spotX, this.base.spotY);
      this.cameras.main.centerOn(this.base.x, this.base.y + 10);
      this.time.delayedCall(300, () => this.tryReplicate());
    }
  }

  update(time: number, dt: number) {
    if (!this.player) return; // still loading the save
    sound.listen(this.player.x, this.player.y);
    dt = Math.min(dt, 50) * this.slow;
    let input = this.talker.routeTalk(time, this.controls.read());
    // wake or hold: the choice over the Replicator has the buttons
    if (this.choice) { this.choice.route(input, dt); input = NO_INPUT; }
    if (!this.stopped) {
      this.player.update(time, dt, input);
      this.playerSafe = this.inTown(this.player.x, this.player.y);
      if (!this.frozen) for (const e of this.enemies) e.update(time, dt);
      for (const s of this.shards) s.update(time, dt);
      this.shards = this.shards.filter((s) => !s.collected);
      for (const s of this.sparks) s.update(time, dt);
      this.sparks = this.sparks.filter((s) => !s.collected);
      this.updateSpores(time, dt);
    }
    this.beacon?.update(time);
    for (const g of this.grazers) g.update(time, dt);
    for (const f of this.flocks) f.update(time, dt);
    this.butterflies?.update(dt, this.env.night);
    this.updateBendables(time);
    this.updateWater();
    this.updateCamera();
    this.base.update(time, this.embers);
    this.base.updateSpot(time, this.canReplicate());
    this.dock.update(time, dt);
    if (this.boardRing) {
      const ready = this.departure.boardReady();
      const on = this.departure.playerOnBoardSpot();
      this.boardRing.setStrokeStyle(1, ready ? PALETTE[9] : PALETTE[22], ready ? 0.5 + 0.4 * Math.sin(time / 300) : 0.3)
        .setFillStyle(PALETTE[9], ready && on ? 0.3 : 0);
    }
    for (const n of this.npcs) n.update(time, dt);
    if (!this.shot && !this.visit) this.village.update(time, dt, this.npcs.reduce((a, n) => a + stat(n.data, 'gather'), 0));
    else this.village.update(time, 0, 0);
    this.updateVesselCue(time, dt);
    this.hands.update(time);
    this.homecoming.update(time);
    this.trade.update(dt);
    this.buildings.update(time, dt);
    this.homeworld.update(time);
    this.tutorial.update(time, dt);
    this.bioworks?.update(time, dt);
    this.wild?.update(time);
    this.warren.update(dt);
    this.updateHatch(dt);
    this.minds.tickMinds(dt);
    this.watchFps(time);
    this.env.update(dt);
    this.lighting.update(dt);
    this.atmosphere.update(dt);
    if (time - this.saver.lastSaveAt > SAVE_EVERY_MS) { this.saver.lastSaveAt = time; void this.saver.flushPlanet(); }
    if (time - this.saver.lastPosSaveAt > POS_SAVE_EVERY_MS) { this.saver.lastPosSaveAt = time; void this.saver.saveReplicant(); }
  }

  // --- talking to a copy (E, right click, gamepad Y, the touch talk button) ---

  /** Supplies changed: write them with the next flush. */
  markSupplies() {
    this.pending.supplies = { ...this.supplies };
    this.game.events.emit('supplies', this.supplies);
  }

  /** Embers in or out of the shared pool (recipes, gifts). */
  addEmbers(n: number) {
    this.embers = Math.max(0, this.embers + n);
    this.pending.embers += n;
    this.game.events.emit('embers', this.embers, true);
  }

  /** Trees a copy may cut for wood: near the base or near its own home (the town itself is kept clear of trees). */
  woodTrees(npc?: Npc) {
    const base = this.baseCenter, home = npc?.home;
    return this.trees.filter((t) => t.alive && (Math.hypot(t.x - base.x, t.y - base.y) < TOWN_TUNING.woodRadiusPx
      || (!!home && Math.hypot(t.x - home.x, t.y - home.y) < TOWN_TUNING.woodHomeRadiusPx)));
  }

  treesNearBase(npc?: Npc) {
    return this.woodTrees(npc).length;
  }

  /** Material icons arc from where they were won to the hatch (or the Replicator) and join the supplies. */
  flyMaterial(material: string, from: { x: number; y: number }, to: { x: number; y: number }, n: number) {
    const def = (SUPPLIES.materials as Record<string, { icon: number }>)[material];
    const count = Math.max(1, Math.round(n));
    for (let i = 0; i < Math.min(count, 8); i++) {
      const s = this.add.image(from.x + (Math.random() - 0.5) * 10, from.y - 8, 'supplies', def?.icon ?? 0).setDepth(6300).setAlpha(0);
      const arc = { t: 0 };
      const sx = s.x, sy = s.y;
      this.tweens.add({
        targets: arc, t: 1, delay: 120 + i * 140, duration: 700, ease: 'Sine.easeInOut',
        onStart: () => s.setAlpha(1),
        onUpdate: () => { s.setPosition(sx + (to.x - sx) * arc.t, sy + (to.y - 6 - sy) * arc.t - Math.sin(arc.t * Math.PI) * 26); },
        onComplete: () => { s.destroy(); this.fx.sparks(to.x, to.y - 6, PALETTE[(SUPPLIES.materials as Record<string, { color: number }>)[material]?.color ?? 20], 2); if (Math.hypot(this.player.x - to.x, this.player.y - to.y) < 200) sound.collect(); },
      });
    }
    this.warren.add(material, n);
  }

  hitStop(ms: number) {
    if (this.stopped) return;
    this.stopped = true;
    this.physics.world.pause();
    this.anims.pauseAll();
    setTimeout(() => {
      this.stopped = false;
      this.physics.world.resume();
      this.anims.resumeAll();
    }, ms);
  }

  /**
   * Directional cue to the vessel: a small ship icon with a chevron that sits on the edge of the screen in the
   * direction of the ship whenever the ship is off screen, so you can always find your way home without a map.
   */
  private makeVesselCue() {
    const halo = this.add.image(0, 0, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(PALETTE[9]).setScale(0.5).setAlpha(0.55);
    const icon = this.add.image(0, 0, 'vessel', 0).setScale(0.6);
    const arrow = this.add.graphics();
    arrow.fillStyle(PALETTE[9], 1).fillTriangle(-1, -4, 5, 0, -1, 4).fillStyle(PALETTE[11], 1).fillTriangle(0, -2, 3, 0, 0, 2);
    const group = this.add.container(0, 0, [halo, icon, arrow]).setScrollFactor(0).setDepth(DEPTH.ui).setAlpha(0);
    this.vesselCue = { group, icon, arrow, shown: 0 };
  }

  private updateVesselCue(time: number, dt: number) {
    const c = this.vesselCue;
    if (!c) return;
    const cam = this.cameras.main;
    const view = cam.worldView;
    const vx = this.vessel.x, vy = this.vessel.y - 8;
    const margin = 18;
    const onScreen = vx > view.x + margin && vx < view.right - margin && vy > view.y + margin && vy < view.bottom - margin;
    const want = !onScreen && !this.player.isHidden && !this.stopped;
    c.shown = Phaser.Math.Clamp(c.shown + (want ? dt : -dt) / 350, 0, 1);
    c.group.setAlpha(c.shown * (0.85 + 0.15 * Math.sin(time / 260)));
    if (c.shown <= 0) return;
    // Walk the ray from the player (in screen space) toward the ship until it meets the inset screen rectangle
    const px = this.player.x - view.x, py = this.player.y - view.y;
    const dx = vx - this.player.x, dy = vy - this.player.y;
    const ang = Math.atan2(dy, dx);
    const inset = 16;
    const w = cam.width, h = cam.height;
    const tx = dx > 0 ? (w - inset - px) / dx : dx < 0 ? (inset - px) / dx : Infinity;
    const ty = dy > 0 ? (h - inset - py) / dy : dy < 0 ? (inset - py) / dy : Infinity;
    const t = Math.max(0, Math.min(tx, ty));
    const ex = Phaser.Math.Clamp(px + dx * t, inset, w - inset), ey = Phaser.Math.Clamp(py + dy * t, inset, h - inset);
    c.group.setPosition(Math.round(ex), Math.round(ey));
    c.icon.setPosition(Math.round(-Math.cos(ang) * 7), Math.round(-Math.sin(ang) * 7));
    c.arrow.setPosition(Math.round(Math.cos(ang) * 9), Math.round(Math.sin(ang) * 9)).setRotation(ang);
  }

  /** Camera shake, scaled by `shake` in player.json (0 turns every shake off). */
  shake(ms: number, intensity: number) {
    if (PLAYER.shake <= 0) return;
    this.cameras.main.shake(ms, intensity * PLAYER.shake, true);
  }

  nearestTarget(x: number, y: number, range: number) {
    let best: { x: number; y: number } | null = null;
    let bd = range;
    for (const e of this.enemies) {
      if (!e.alive || e.hittable === false) continue;
      const d = Math.hypot(e.x - x, e.y - y);
      if (d < bd) { bd = d; best = e; }
    }
    if (!best) for (const n of this.nodes) {
      if (!n.alive) continue;
      const d = Math.hypot(n.x - x, n.y - y);
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }

  /** The action button does something other than attack here (build). Returns true if it did. */
  tryInteract(): boolean {
    if (this.bioworks?.playerAtDoor()) { this.bioworks.openMenu(); return true; }
    if (this.bioworks?.playerOnGhost() && this.bioworks.canSeed()) return this.bioworks.seed();
    if (this.bioworks?.playerAtLab() && session.replicant?.traits.wild) return this.bioworks.alter();
    if (this.departure.playerOnBoardSpot()) return this.departure.tryBoard();
    if (this.dock.playerOnPad()) return this.dock.tryBuild();
    if (this.time.now > this.hatchReadyAt && this.warren.playerOnHatch()) { this.descend(); return true; }
    if (this.base.playerOnSpot()) return this.tryReplicate();
    if (!this.base.playerOnPad() || !this.base.canBuild(this.embers)) return false;
    const cost = STRUCTURES.replicator.cost;
    this.embers -= cost;
    this.pending.embers -= cost;
    this.game.events.emit('embers', this.embers);
    this.player.locked = true;
    this.player.body.setVelocity(0, 0);
    sound.build();
    this.base.build(this.player.x, this.player.y, () => {
      this.player.locked = false;
      this.village.addStructure({ type: 'replicator', x: this.base.x, y: this.base.y, at: Date.now() });
      void this.saver.flushPlanet();
    });
    return true;
  }

  // --- the warren ---

  /** Standing on the open hatch for a moment (warren.json hatchDwellMs) takes you down; crossing it never does. */
  private updateHatch(dt: number) {
    const on = this.time.now > this.hatchReadyAt && this.player.alive && !this.player.locked && !this.talker.talk && !this.stopped && this.warren.playerOnHatch();
    this.hatchDwell = on ? this.hatchDwell + dt : 0;
    this.hatchRing ??= this.add.graphics().setDepth(DEPTH.fx);
    this.hatchRing.clear();
    if (!this.hatchDwell) return;
    const h = this.warren.hatch, k = Math.min(1, this.hatchDwell / WARREN.hatchDwellMs);
    this.hatchRing.lineStyle(1, PALETTE[10], 0.4 + 0.5 * k).beginPath().arc(h.x, h.y - 2, 10, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2).strokePath();
    if (k >= 1) { this.hatchDwell = 0; this.hatchRing.clear(); this.descend(); }
  }

  /** Down the hatch: the underground opens over this scene, which waits (and keeps nothing running) until you climb back. */
  private descend(instant = false) {
    const pl = this.player;
    pl.locked = true;
    pl.body.setVelocity(0, 0);
    this.hatchReadyAt = Infinity;
    sound.doorOpen();
    const go = () => {
      this.scene.pause();
      this.scene.launch('warren', { host: this });
    };
    if (instant) { go(); return; }
    this.tweens.add({ targets: pl.sprite, y: pl.sprite.y + 6, alpha: 0, duration: 260, ease: 'Quad.easeIn' });
    this.cameras.main.fadeOut(320, 11, 10, 22);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, go);
  }

  /** Back up the ladder: the hatch spits you out just below it. */
  resurface() {
    const pl = this.player, h = this.warren.hatch;
    this.scene.resume();
    pl.setPosition(h.x, h.y + 14);
    pl.sprite.setAlpha(1);
    pl.locked = false;
    this.hatchReadyAt = this.time.now + 2500;
    this.cameras.main.centerOn(h.x, h.y);
    this.cameras.main.fadeIn(400, 11, 10, 22);
    squash(this, pl.sprite, 1.3, 0.7, 140);
    this.fx.dust(h.x, h.y + 2, 6);
    this.announceLocation();
  }

  // --- leaving the planet ---

  canReplicate() {
    return this.base.built && !this.replicating && !!session.replicant && this.embers >= DRIFT.cost && this.npcs.length < DRIFT.maxPerPlanet;
  }

  private tryReplicate(): boolean {
    if (!this.canReplicate()) {
      if (this.replicating) return true;
      this.base.hungry();
      sound.denied();
      return true; // standing on the spot: never swing at the Replicator
    }
    // the maker chooses first: wake the copy now, or hold it asleep for a new player (src/ui/wakeChoice.ts)
    this.replicating = true;
    const pl = this.player;
    pl.locked = true;
    pl.body.setVelocity(0, 0);
    pl.setPosition(this.base.spotX, this.base.spotY);
    this.choice = new WakeChoice(this, this.base.x, this.base.y - 40, (kind) => { this.choice = undefined; this.replicate(kind); });
    return true;
  }

  /** The Replicator makes the copy: woken (born blank; its first wake makes it itself) or held (asleep in its maker's likeness). */
  private replicate(kind: WakeOrHold) {
    const me = session.replicant!;
    // with a Spark and a copy standing by the ring, the newborn comes from that copy and carries its memories
    const elder = (me.traits.sparks ?? 0) > 0 && !this.visit ? this.sparkElder() : undefined;
    const parent = elder?.data ?? me;
    this.embers -= DRIFT.cost;
    this.pending.embers -= DRIFT.cost;
    this.game.events.emit('embers', this.embers);
    const pl = this.player;
    pl.locked = true;
    pl.body.setVelocity(0, 0);
    pl.facing = 1;
    pl.setPosition(this.base.spotX, this.base.spotY);
    sound.scan();
    this.base.scan(pl.sprite, pl.featureColor, 1600);
    if (elder) {
      me.traits.sparks = (me.traits.sparks ?? 1) - 1;
      this.game.events.emit('sparks', me.traits.sparks);
      void this.saver.saveReplicant();
      elder.thank();
      this.base.scan(elder.sprite, elder.trailColor, 1600);
      // the Spark leaves the original and goes into the machine
      const spark = this.add.image(pl.x, pl.y - 16, BEACON.spark.sprite).setDepth(6300).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({ targets: spark, x: this.base.x, y: this.base.y - 12, duration: 700, ease: 'Quad.easeIn', onComplete: () => { spark.destroy(); this.fx.sparks(this.base.x, this.base.y - 12, PALETTE[19], 14); sound.spark(); } });
    }
    // the copy appears beside the Replicator, on whichever side is open
    const side = this.isWalkable(this.base.x + 24, this.base.y + 8) ? 24 : -24;
    const bx = this.base.x + side, by = this.base.y + 8;
    const row = replicate(parent, this.planet.star, this.planet.planetIndex, bx, by);
    if (kind === 'hold') {
      // asleep in its maker's likeness until a new player takes it (the journal gives it away)
      const t = parent.traits;
      row.traits = { v: 1, awake: true, held: true, body: structuredClone(t.body ?? PARTS.defaults), feature: t.feature, trail: t.trail, gear: t.gear ?? 0 };
      this.mindLog.push({ t: this.mindClock, text: `${me.name} made a copy and held it asleep for a new player` });
    }
    if (elder) {
      const wants = (elder.data.traits.wants ?? []).filter((w) => !w.done).map((w) => w.text);
      row.traits.inherit = { from: elder.data.id, name: elder.data.name, ...(wants.length ? { wants } : {}) };
      this.mindLog.push({ t: this.mindClock, text: `${me.name} spent a Spark: a new copy was made from ${elder.data.name} and remembers being it` });
      if (this.canHear()) this.game.events.emit('notice', `A NEW COPY CARRIES ${elder.data.name.toUpperCase()}'S MEMORIES`);
    }
    this.time.delayedCall(1700, () => {
      const npc = new Npc(this, { ...row, id: 'pending' }, bx, by);
      // its home: the next free lot, recorded under its id once the row is saved
      const lotIndex = nextFreeLot(this.map.town, this.townState, 'home');
      const lot = lotIndex >= 0 ? this.map.town.lots[lotIndex] : undefined;
      npc.home = lot ? { ...lot.yard } : undefined;
      // held under a key of its own until the row is saved (never written as 'pending')
      const lotKey = `pending:${Date.now()}`;
      if (lot) this.townState.lots[lotKey] = lotIndex;
      this.npcs.push(npc);
      this.announceLocation();
      this.warren.refreshHatch();
      sound.birth();
      npc.playBirth(() => {
        this.player.locked = false;
        this.replicating = false;
        this.floatName(npc);
      });
      const st = session.store;
      if (st && !this.shot) {
        st.createReplicant(row).then((saved) => {
          const lotIndex = this.townState.lots[lotKey];
          Object.assign(npc.data, saved);
          if (elder) st.inheritNotes(elder.data.id, saved.id, DRIFT.spark.notes).catch((e) => console.warn('inherit notes failed', e));
          if (lotIndex !== undefined) { delete this.townState.lots[lotKey]; this.townState.lots[saved.id] = lotIndex; this.towner.markTown(); }
        })
          .catch((e) => { console.warn('copy save failed', e); delete this.townState.lots[lotKey]; });
        this.pending.npcTick ??= Date.now();
      }
    });
    return true;
  }

  /** A copy (not blank, up here) standing close to the Replicator's ring: a Spark birth would come from it. */
  private sparkElder() {
    const sx = this.base.spotX, sy = this.base.spotY;
    return this.npcs.filter((n) => !n.blank && !n.below && n.state !== 'born' && !n.data.traits.thales && !n.data.id.startsWith('pending') && Math.hypot(n.x - sx, n.y - sy) < DRIFT.spark.range)
      .sort((a, b) => Math.hypot(a.x - sx, a.y - sy) - Math.hypot(b.x - sx, b.y - sy))[0];
  }

  /** The copy's name floats above it for a moment so the family knows who is who (a blank copy has none yet). */
  floatName(npc: Npc) {
    if (npc.data.traits.blank) return;
    const t = this.add.bitmapText(npc.x, npc.y - 30, 'pixel', npc.data.name.toUpperCase()).setOrigin(0.5).setTint(npc.trailColor).setDepth(6300).setAlpha(0);
    this.tweens.add({ targets: t, alpha: 1, y: t.y - 4, duration: 400, ease: 'Sine.easeOut' });
    this.tweens.add({ targets: t, alpha: 0, delay: 2200, duration: 600, onComplete: () => t.destroy() });
  }

  /** Screenshots: ?copies=3 shows made-up copies, already themselves (a body from the kit, a visor color, a name). */
  private withScreenshotCopies(rows: ReplicantSave[]) {
    const fake = Number(new URLSearchParams(location.search).get('copies') ?? 0);
    if (!this.shot || !fake || !session.replicant) return rows;
    rows = [...rows];
    let parent = session.replicant;
    const kit = kitLists();
    const at = <T>(a: T[], k: number) => a[k % a.length];
    for (let i = 0; i < fake; i++) {
      const r = { ...replicate(parent, this.planet.star, this.planet.planetIndex, 0, 0), id: `fake${i}` } as ReplicantSave;
      const body = { head: at(kit.head, i * 5 + 1), visor: at(kit.visor, i * 3), torso: at(kit.torso, i * 2 + 1), arms: at(kit.arms, i), legs: at(kit.legs, i * 2), back: at(kit.back, i + 1), headgear: (i * 2 + 1) % 7, primary: at(kit.colors, i * 7 + 2), secondary: at(kit.colors, i * 11 + 5), accent: at(kit.colors, i * 13 + 8) };
      r.traits = { ...r.traits, blank: false, body, feature: at(kit.visorLights, i + 1), trail: kit.colorIndex[body.accent], gear: body.headgear };
      r.name = at(['Ash', 'Wren', 'Pip', 'Moth', 'Ferro', 'Lark'], i);
      rows.push(r);
      parent = r;
    }
    return rows;
  }

  private spawnNpcs(rows: ReplicantSave[], save: PlanetSave | null) {
    const c = this.map.base.center;
    rows.forEach((r, i) => {
      const lot = this.towner.homeLot(r.id);
      let x = r.pos_x ?? 0, y = r.pos_y ?? 0;
      // at home when the saved spot is no good, or belongs to the layout before the town
      if (!x || !this.isWalkable(x, y) || this.migrated) {
        if (lot) { x = lot.yard.x + (i % 2 ? 8 : -8); y = lot.yard.y; } else { x = c.x - 30 + (i % 3) * 30; y = c.y + 50 + Math.floor(i / 3) * 18; }
      }
      const npc = new Npc(this, r, x, y);
      npc.home = lot ? { ...lot.yard } : undefined;
      this.npcs.push(npc);
    });
    this.minds.setupMinds();
    // Embers the copies gathered while nobody was here
    if (!this.npcs.length || this.shot) return;
    const tick = save?.data.npcTick;
    const now = Date.now();
    this.pending.npcTick = now;
    if (!tick) return;
    const hours = Math.min(DRIFT.offlineCapHours, Math.max(0, (now - tick) / 3_600_000));
    this.awayHours = hours;
    const gatherSum = this.npcs.reduce((s, n) => s + stat(n.data, 'gather'), 0);
    // a Lookout over the village: they find more while you are away
    const lookout = save?.data.buildings?.some((b) => b.kind === 'lookout' && b.built && !b.vetoed);
    const rate = gatherSum * DRIFT.gatherPerHour * (lookout ? BUILDINGS.communal.lookoutGather : 1);
    // building effort banks up the same way; the copies spend it in front of you once you land
    this.village.addWork(Math.min(VILLAGE.offlineCapHours, hours) * VILLAGE.workPerHour * gatherSum);
    const gained = Math.floor(rate * hours);
    if (gained <= 0) return;
    this.embers += gained;
    this.pending.embers += gained;
    this.time.delayedCall(2600, () => this.showAwayGain(gained));
  }

  // ------------------------------------------------------------------ the copies' minds

  /**
   * The replicant understands the copies. It used to need the listening module from a ruin; the ruins were taken out
   * (2026-10-26), so every replicant reads their words from the start.
   */
  canHear() {
    return true;
  }

  /** "EARTH - SOL" or "TITAN - SATURN" */
  get placeLabel() {
    const star = starById(this.planet.star);
    const sp = planetAt(this.planet.star, this.planet.planetIndex);
    return sp?.moon ? `${this.planet.name} - ${sp.name}` : `${this.planet.name} - ${star?.name ?? '?'}`;
  }

  /** Copies bring in what they gathered while you were away: a stream of Embers into the Replicator. */
  private showAwayGain(n: number) {
    const target = this.base.built ? this.replicatorSpot : this.map.base.center;
    const count = Math.min(24, n);
    for (let i = 0; i < count; i++) {
      const from = this.npcs[i % this.npcs.length];
      const s = this.add.image(from.x, from.y - 14, 'shard').setDepth(6300);
      this.tweens.add({
        targets: s, x: target.x, y: target.y - 10, delay: i * 90, duration: 600, ease: 'Quad.easeIn',
        onComplete: () => { s.destroy(); this.fx.sparks(target.x, target.y - 10, PALETTE[10], 2); sound.collect(); },
      });
    }
    this.time.delayedCall(count * 90 + 600, () => this.game.events.emit('embers', this.embers));
  }

  /** A copy dropped an Ember it mined into the Replicator. */
  npcDelivered(_npc: Npc, x: number, y: number) {
    this.embers++;
    this.pending.embers++;
    this.fx.sparks(x, y, PALETTE[10], 4);
    if (Math.hypot(this.player.x - x, this.player.y - y) < 200) sound.collect();
    this.game.events.emit('embers', this.embers, true);
  }

  resolveAttack(hx: number, hy: number, radius: number, aim: Phaser.Math.Vector2, heavy = false) {
    let hit = false, struck = false;
    const atk = PLAYER.attack;
    const damage = heavy ? atk.heavy.damage : atk.damage;
    const knock = atk.knockback * (heavy ? atk.heavy.knockbackScale : 1);
    for (const e of this.enemies) {
      if (!e.alive || e.hittable === false || Math.hypot(e.x - hx, e.y - 3 - hy) > radius + 5 + (e.reach ?? 0)) continue;
      const dir = new Phaser.Math.Vector2(e.x - this.player.x, e.y - this.player.y).normalize();
      e.hit(damage, dir.lengthSq() ? dir : aim, knock);
      hit = struck = true;
    }
    for (const n of this.nodes) {
      if (!n.alive || Math.hypot(n.x - hx, n.y - 4 - hy) > radius + 4) continue;
      n.hit(aim);
      sound.mineral(n.kind);
      hit = true;
    }
    // nothing alive in reach: the swing works on the village (a tree, rock, a building being raised)
    if (!hit && this.hands.swing(hx, hy, radius)) hit = true;
    for (const sp of this.spores) {
      if (sp.dead || sp.reflected || Math.hypot(sp.x - hx, sp.y - hy) > radius + 8) continue;
      sp.reflect(aim, this.player.featureColor);
      hit = true;
    }
    if (struck) sound.hit(heavy);
    if (hit) {
      // The hit pause, white flash and squash sell a normal hit; only the heavy finisher shakes the camera.
      this.hitStop(heavy ? 140 : 100);
      if (heavy) this.shake(120, 0.004);
    }
  }

  spawnSpore(x: number, y: number, v: Phaser.Math.Vector2) {
    this.spores.push(new Spore(this, x, y, v, (ENEMIES.spitter as SpitterDef).shotLifeMs));
  }

  private updateSpores(time: number, dt: number) {
    const p = this.player;
    for (const sp of this.spores) {
      sp.update(time, dt);
      if (sp.dead) continue;
      if (!sp.reflected) {
        if (p.alive && Math.hypot(p.x - sp.x, p.y - 6 - sp.y) < 7) { p.hurt(sp.x, sp.y, 1); sp.pop(); }
      } else {
        for (const e of this.enemies) {
          if (!e.alive || e.hittable === false || Math.hypot(e.x - sp.x, e.y - 5 - sp.y) > 10) continue;
          e.hit(2, sp.v.clone().normalize(), PLAYER.attack.knockback);
          sound.hit(true);
          sp.pop();
          break;
        }
      }
    }
    this.spores = this.spores.filter((s) => !s.dead);
  }

  onEnemyKilled(e: Enemy) {
    sound.enemyDie({ x: e.x, y: e.y });
    // the last creature of a fight goes down in slow motion
    const now = this.time.now;
    const fight = now - this.lastKillAt < 5000;
    this.lastKillAt = now;
    const p = this.player;
    const others = this.enemies.some((o) => o !== e && o.alive && Math.hypot(o.x - p.x, o.y - p.y) < 130);
    if (fight && !others) {
      this.slow = 0.3;
      this.physics.world.timeScale = 1 / 0.3;
      this.tweens.timeScale = 0.3;
      this.anims.globalTimeScale = 0.3;
      setTimeout(() => {
        this.slow = 1;
        this.physics.world.timeScale = 1;
        this.tweens.timeScale = 1;
        this.anims.globalTimeScale = 1;
      }, 450);
    }
  }

  /** The beacon keeper is down: the monolith lights for good and leaves a Spark where the keeper fell. */
  private onKeeperDown() {
    const b = this.beacon, g = this.guardian;
    if (!b || b.lit) return;
    b.ignite();
    if (!this.litBeacons.includes(this.planet.star)) this.litBeacons.push(this.planet.star);
    // the lattice around the Sun: how many points are lit now (beacon.json lattice)
    const points = this.litBeacons.filter((id) => BEACONS.includes(id)).length;
    this.time.delayedCall(4200, () => this.game.events.emit('notice', points >= BEACONS.length ? 'THE LATTICE IS WHOLE: EVERY LETTER ARRIVES AT ONCE' : `THE LATTICE: ${points} OF ${BEACONS.length} LIT`));
    this.mindLog.push({ t: this.mindClock, text: points >= BEACONS.length ? 'the last beacon was lit: the lattice is whole, and every letter between the worlds now arrives at once' : `a beacon was lit: the lattice around the Sun is lit at ${points} of ${BEACONS.length} points, and letters near it arrive at once` });
    this.pending.beacon = { lit: true, at: Date.now(), by: session.replicant?.id };
    void this.saver.flushPlanet();
    const sx = g?.x ?? b.x, sy = g?.y ?? b.y + 30;
    this.time.delayedCall(700, () => this.sparks.push(new Spark(this, sx, sy)));
  }

  collectSpark(x: number, y: number) {
    sound.spark();
    this.hitStop(80);
    const r = session.replicant;
    let n = 1;
    if (r && !this.visit) {
      r.traits.sparks = (r.traits.sparks ?? 0) + 1;
      n = r.traits.sparks;
      void this.saver.saveReplicant();
    }
    this.fx.sparks(x, y - 4, PALETTE[19], 6);
    this.fx.floatIcon(this.player.x, this.player.y - 24, 'spark');
    this.game.events.emit('sparks', n);
  }

  surfaceAt(x: number, y: number): 'grass' | 'stone' | 'water' | 'void' {
    const m = this.map;
    const tx = Math.floor(x / 16), ty = Math.floor(y / 16);
    if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) return 'void';
    const c = m.cells[ty * m.w + tx];
    if (c === Cell.Water) return 'water';
    if (c === Cell.Void) return 'void';
    return m.ground[ty][tx] === TILE.ruinFloor ? 'stone' : 'grass';
  }

  /** What a footstep here sounds like (sound.json footsteps): metal by the ship and the vault door, printed floor
   * before a built building, stone on the square, ice by open water on a cold world, else the world's own ground. */
  footSurface(x: number, y: number): Surface {
    const s = this.surfaceAt(x, y);
    if (s === 'water' || s === 'void') return s;
    if (Math.hypot(x - this.vessel.x, y - this.vessel.y) < 24 || (this.dock && Math.hypot(x - this.dock.x, y - this.dock.y) < 14)) return 'metal';
    if (this.bioworks?.onFlat(x, y) || this.wild?.onFlat(x, y)) return 'salt';
    if (this.buildings?.list.some((b) => b.built && !b.vetoed && Math.abs(x - b.x) < b.w * 8 + 4 && y > b.y - 6 && y < b.y + 12)) return 'printed';
    const sq = this.map.town.square, tx = Math.floor(x / 16), ty = Math.floor(y / 16);
    if (s === 'stone' || (tx >= sq.x && ty >= sq.y && tx < sq.x + sq.w && ty < sq.y + sq.h)) return 'stone';
    const steps = SOUND_DATA.footsteps as Record<string, Surface>;
    if (SOUND_DATA.iceNearWater.includes(this.planet.id)) {
      for (const [dx, dy] of [[16, 0], [-16, 0], [0, 16], [0, -16]]) if (this.surfaceAt(x + dx, y + dy) === 'water') return 'ice';
    }
    return steps[this.planet.id] ?? steps.default;
  }

  splash(x: number, y: number, big: boolean) {
    this.glints.explode(big ? 8 : 3, x, y);
    const ring = this.add.image(x, y, 'ring').setDepth(DEPTH.ground + 4).setAlpha(0.7).setScale(0.3);
    this.tweens.add({ targets: ring, scale: big ? 2 : 1.3, alpha: 0, duration: 500, onComplete: () => ring.destroy() });
    if (big) sound.splash({ x, y });
  }

  /** Grass leans away as you walk through it and sways gently in the wind. */
  private updateBendables(time: number) {
    const v = this.cameras.main.worldView, m = this.map;
    const x0 = Math.max(0, Math.floor(v.x / 16) - 1), x1 = Math.min(m.w - 1, Math.ceil(v.right / 16) + 1);
    const y0 = Math.max(0, Math.floor(v.y / 16) - 1), y1 = Math.min(m.h - 1, Math.ceil(v.bottom / 16) + 1);
    const p = this.player;
    const movers = [p as { x: number; y: number }, ...this.grazers];
    const wind = 0.05 + (this.env.night < 0.5 ? 0.02 : 0);
    const t = time / 1000;
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      const list = this.bendables.get(ty * m.w + tx);
      if (!list) continue;
      for (const g of list) {
        let target = Math.sin(t * 1.6 + g.x * 0.07 + g.y * 0.03) * wind;
        for (const o of movers) {
          const dx = g.x - o.x, dy = g.y - o.y;
          if (Math.abs(dx) < 11 && Math.abs(dy) < 7) target = (dx >= 0 ? 1 : -1) * (0.55 - Math.abs(dx) * 0.03);
        }
        g.rotation += (target - g.rotation) * 0.25;
      }
    }
  }

  private updateWater() {
    const p = this.player;
    const inWater = this.surfaceAt(p.x, p.y + 2) === 'water';
    if (inWater !== this.wasInWater && p.alive && !p.locked) this.splash(p.x, p.y + 2, true);
    this.wasInWater = inWater;
    const s = p.sprite;
    this.reflection.setVisible(inWater && s.visible && p.alive);
    if (inWater) {
      this.reflection.setTexture(s.texture.key, s.frame.name).setFlipX(s.flipX).setPosition(s.x, s.y - 1);
    }
    // glints on open water in view
    const v = this.cameras.main.worldView;
    for (let i = 0; i < 3; i++) {
      const x = v.x + Math.random() * v.width, y = v.y + Math.random() * v.height;
      if (this.surfaceAt(x, y) === 'water' && Math.random() < 0.5) this.glints.emitParticleAt(x, y);
    }
  }

  /** If the device can't keep up (under 40 fps for several seconds), switch the extra effects off. */
  private watchFps(time: number) {
    if (this.lowQuality || this.shot) {
      if (this.lowQuality && !this.fpsSamples.length) { this.fpsSamples.push(0); this.env.setLowQuality(); }
      return;
    }
    if (time < this.nextFpsSample) return;
    this.nextFpsSample = time + 1000;
    this.fpsSamples.push(this.game.loop.actualFps);
    if (this.fpsSamples.length > 12 && this.fpsSamples.slice(-6).every((f) => f < 40)) {
      this.lowQuality = true;
      this.env.setLowQuality();
      console.info('low quality mode');
    }
  }

  /** The camera leans ahead of where you are moving. */
  private updateCamera() {
    const v = this.player.body.velocity;
    const tx = Phaser.Math.Clamp(v.x * 0.22, -26, 26), ty = Phaser.Math.Clamp(v.y * 0.18, -18, 18);
    this.lookahead.x += (tx - this.lookahead.x) * 0.04;
    this.lookahead.y += (ty - this.lookahead.y) * 0.04;
    this.cameras.main.setFollowOffset(-Math.round(this.lookahead.x), 8 - Math.round(this.lookahead.y));
  }

  onNodeHit(n: CrystalNode) {
    this.pending.nodes[n.key] = { hits: n.hits, at: Date.now() };
  }

  spawnShard(x: number, y: number, dir?: Phaser.Math.Vector2, kind: NodeKind = 'ember') {
    this.shards.push(new Shard(this, x, y, dir, kind));
  }

  collectShard(x: number, y: number, kind: NodeKind = 'ember') {
    sound.collect();
    if (kind !== 'ember') {
      // iron, hydrogen, salt, quartz and copper go into this world's store (husks and the Cems' designs are made of them)
      sound.pickup(kind);
      this.warren.add(kind, 1);
      this.fx.sparks(x, y - 4, NODE[kind].spark[0], 5);
      this.fx.floatIcon(this.player.x, this.player.y - 22, ITEMS[kind].sprite);
      return;
    }
    this.embers++;
    this.pending.embers++;
    this.fx.sparks(x, y - 4, PALETTE[10], 5);
    this.fx.floatIcon(this.player.x, this.player.y - 22, 'shard');
    this.game.events.emit('embers', this.embers);
  }

  respawnPlayer() {
    const cam = this.cameras.main;
    cam.fadeOut(300, 24, 20, 37);
    cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.player.respawn(this.home.x, this.home.y);
      cam.centerOn(this.home.x, this.home.y);
      cam.fadeIn(500, 24, 20, 37);
    });
  }

  /** Within townSafe tiles of the town's lots, streets or square. */
  inTown(px: number, py: number) {
    const m = this.map, r = TOWN_SAFE_TILES;
    const tx = Math.floor(px / 16), ty = Math.floor(py / 16);
    for (let y = ty - r; y <= ty + r; y++) for (let x = tx - r; x <= tx + r; x++) {
      if (x >= 0 && y >= 0 && x < m.w && y < m.h && m.townMask[y * m.w + x] >= 2) return true;
    }
    return false;
  }

  isWalkable(px: number, py: number) {
    const t = this.walls.getTileAtWorldXY(px, py);
    return !t || t.index < 0;
  }
}
