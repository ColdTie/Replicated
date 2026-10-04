import Phaser from 'phaser';
import { anim, ensurePlanetAnims, queuePlanetSprites, tex } from '../core/assets';
import { BACKEND, ENEMIES, ITEMS, PALETTE, PLANETS, PLAYER, STRUCTURES, TRAVEL, hex, starById, type HopperDef, type PlanetDef, type SkitterDef } from '../core/data';
import { session } from '../core/session';
import { DRIFT, accrue, makeCopy } from '../core/drift';
import { Base } from '../entities/Base';
import { Npc } from '../entities/Npc';
import type { Enemy } from '../entities/Enemy';
import { Hopper } from '../entities/Hopper';
import { Player, squash } from '../entities/Player';
import { CrystalNode, Shard } from '../entities/Resources';
import { Skitter } from '../entities/Skitter';
import { Atmosphere } from '../fx/Atmosphere';
import { Fx } from '../fx/Fx';
import { Lighting } from '../fx/Lighting';
import { makeVignette } from '../fx/textures';
import { Controls, touch } from '../input/Controls';
import { fuelCost, lyBetween, travelMinutes } from './StarMapScene';
import type { NodeState, PlanetData, PlanetSave, ReplicantSave } from '../net/store';
import { COLLIDE_TILES, Cell, DECOR, generatePlanet, type PlanetMap } from '../world/planetGen';

export const DEPTH = { ground: 0, walls: 1, shadow: 50, actors: 100, fog: 5000, dark: 6000, glow: 6100, fx: 6150, ui: 6300, vignette: 7000 };

interface InitData { planetId?: string; seed?: number; shot?: boolean }

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
  embers = 0;

  private atmosphere!: Atmosphere;
  private controls!: Controls;
  private walls!: Phaser.Tilemaps.TilemapLayer;
  private solids!: Phaser.Physics.Arcade.StaticGroup;
  private vessel!: Phaser.GameObjects.Sprite;
  private cradle?: Phaser.GameObjects.Image;
  private base!: Base;
  private home = new Phaser.Math.Vector2();
  private stopped = false;
  private seed?: number;
  private shot = false;
  /** Screenshot mode: enemies hold still. */
  private frozen = false;

  // pending changes not yet written to the store
  private pending: { embers: number; nodes: Record<string, NodeState>; set: Omit<PlanetData, 'nodes'> } = { embers: 0, nodes: {}, set: {} };
  npcs: Npc[] = [];
  /** Embers the copies have gathered (waiting in the pile) and the wall-clock time counted up to */
  private pileEmbers = 0;
  private tick = 0;
  private lastAccrueAt = 0;
  private saving = false;
  private lastSaveAt = 0;
  private lastPosSaveAt = 0;

  constructor() { super('planet'); }

  init(data: InitData) {
    const r = session.replicant;
    this.planet = PLANETS.find((p) => p.id === data.planetId)
      ?? PLANETS.find((p) => r && p.star === r.star_id && p.planetIndex === r.planet_index)
      ?? PLANETS[0];
    this.seed = data.seed;
    this.shot = !!data.shot;
    this.enemies = []; this.nodes = []; this.shards = []; this.embers = 0; this.stopped = false; this.frozen = false;
    this.pending = { embers: 0, nodes: {}, set: {} };
    this.npcs = [];
  }

  async preloadSave(): Promise<{ save: PlanetSave | null; npcs: ReplicantSave[] }> {
    const st = session.store;
    if (!st) return { save: null, npcs: [] };
    const [save, npcs] = await Promise.all([
      st.loadPlanet(this.planet.star, this.planet.planetIndex, this.seed ?? this.planet.seed),
      st.listNpcs(this.planet.star, this.planet.planetIndex),
    ]);
    return { save, npcs };
  }

  preload() {
    queuePlanetSprites(this, this.planet);
  }

  create() {
    ensurePlanetAnims(this, this.planet);
    // Loading the planet save is async; build the world once it arrives.
    this.cameras.main.setBackgroundColor(PALETTE[25]);
    this.preloadSave()
      .catch((e) => { console.warn('planet load failed, playing without saving', e); return { save: null, npcs: [] }; })
      .then(({ save, npcs }) => this.build(save, npcs));
  }

  private build(save: PlanetSave | null, npcSaves: ReplicantSave[]) {
    session.planet = save;
    const p = this.planet;
    const { width, height } = this.scale;
    this.map = generatePlanet(p, this.seed ?? p.seed);
    const m = this.map;
    const pw = m.w * 16, ph = m.h * 16;
    this.embers = save?.embers ?? 0;

    this.lighting = new Lighting(this, hex(p.ambient), DEPTH.dark);
    this.fx = new Fx(this, PALETTE[p.accent[1]], PALETTE[p.accent[2]]);
    this.atmosphere = new Atmosphere(this, p);
    this.controls = new Controls(this);
    this.solids = this.physics.add.staticGroup();

    // Tilemap: ground + walls (walls layer also holds invisible collision over the void)
    const tm = this.make.tilemap({ tileWidth: 16, tileHeight: 16, width: m.w, height: m.h });
    const ts = tm.addTilesetImage('tiles', tex('tiles', p), 16, 16, 0, 0)!;
    tm.createBlankLayer('ground', ts)!.putTilesAt(m.ground, 0, 0).setDepth(DEPTH.ground);
    this.walls = tm.createBlankLayer('walls', ts)!.putTilesAt(m.walls, 0, 0).setDepth(DEPTH.walls);
    this.walls.setCollision(COLLIDE_TILES);
    this.drawRockEdges();

    // Decor, landmarks and the glows that make the world readable without words
    for (const d of m.decor) {
      this.add.image(d.x, d.y, tex('decor', p), d.frame).setOrigin(0.5, 1).setDepth(DEPTH.actors + d.y - (d.frame === DECOR.door ? 20 : 0));
    }
    for (const pr of m.props) {
      const s = this.add.sprite(pr.x, pr.y, tex(pr.sprite, p), pr.frame).setOrigin(0.5, 1).setDepth(DEPTH.actors + pr.y);
      if (pr.sprite === 'tree' && pr.frame === 0) this.time.delayedCall(Math.random() * 1500, () => s.play(anim(tex('tree', p), 'sway')));
    }
    for (const b of m.blockers) this.addSolid(b.x, b.y, b.w, b.h);
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
    this.addSolid(b.vessel.x, b.vessel.y - 4, 24, 10);
    const vesselLight = this.lighting.add({ x: b.vessel.x, y: b.vessel.y - 10, radius: 110, color: 0xffc98a, intensity: 1, flicker: 0.08 });
    const vesselGlow = this.add.image(b.vessel.x, b.vessel.y - 6, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(PALETTE[9]).setAlpha(0.22).setScale(1.4).setDepth(DEPTH.glow);
    if (p.intro === 'wake') {
      this.cradle = this.add.image(b.cradle.x, b.cradle.y + 6, tex('cradle', p), 1).setOrigin(0.5, 1).setDepth(DEPTH.actors + b.cradle.y - 4);
      this.lighting.add({ x: b.cradle.x, y: b.cradle.y, radius: 30, color: PALETTE[18], intensity: 0.5, flicker: 0.2 });
    }
    const built = !!save?.data.structures?.some((s) => s.type === 'replicator');
    this.base = new Base(this, b.pad.x, b.pad.y, built);

    // Resources (restoring chipped/broken crystals; they regrow after a while) and creatures
    const regrowMs = BACKEND.nodeRegrowMinutes * 60_000;
    m.nodes.forEach((n, i) => {
      let hits = save?.data.nodes?.[i]?.hits ?? 0;
      const at = save?.data.nodes?.[i]?.at ?? 0;
      if (hits >= ITEMS.ember.nodeHits && Date.now() - at > regrowMs) {
        hits = 0;
        this.pending.nodes[i] = { hits: 0, at: Date.now() };
      }
      this.nodes.push(new CrystalNode(this, n.x * 16 + 8, n.y * 16 + 10, i, hits));
    });
    for (const e of m.enemies) {
      const def = ENEMIES[e.type];
      const ex = e.x * 16 + 8, ey = e.y * 16 + 8;
      if (def.kind === 'hopper') this.enemies.push(new Hopper(this, def as HopperDef, ex, ey));
      else this.enemies.push(new Skitter(this, def as SkitterDef, ex, ey));
    }

    // Player: a returning replicant appears where it was; a new one wakes in the cradle
    const r = session.replicant;
    const awake = !!r?.traits.awake;
    const saved = r && r.star_id === p.star && r.planet_index === p.planetIndex && r.pos_x != null && r.pos_y != null
      && this.isWalkable(r.pos_x, r.pos_y) ? { x: r.pos_x, y: r.pos_y! } : null;
    const start = saved ?? this.home;
    this.player = new Player(this, start.x, start.y);

    // Physics
    this.physics.world.setBounds(0, 0, pw, ph);
    const nodeZones = this.nodes.map((n) => n.zone);
    const enemyZones = this.enemies.map((e) => e.zone);
    this.physics.add.collider(this.player.zone, [this.walls, this.solids, ...nodeZones] as Phaser.Types.Physics.Arcade.ArcadeColliderType);
    this.physics.add.collider(enemyZones, [this.walls, this.solids, ...nodeZones] as Phaser.Types.Physics.Arcade.ArcadeColliderType);
    this.physics.add.collider(enemyZones, enemyZones);

    // Copies left at this base, and what they gathered while nobody was here
    for (const n of npcSaves) this.addNpc(n);
    this.pileEmbers = save?.data.cache ?? 0;
    this.tick = save?.data.tick ?? Date.now();
    this.accrueNow(true);

    // Camera
    const cam = this.cameras.main;
    cam.setBounds(0, 0, pw, ph);
    cam.setRoundPixels(true);
    cam.startFollow(this.player.zone, true, 0.1, 0.1, 0, 8);
    cam.centerOn(start.x, start.y);

    makeVignette(this, width, height);
    this.add.image(0, 0, 'vignette').setOrigin(0).setScrollFactor(0).setDepth(DEPTH.vignette);

    this.game.events.emit('embers', this.embers);
    this.setupSaving();

    if (this.shot) {
      this.player.locked = false;
      this.stageForScreenshot();
    } else if (p.intro === 'wake' && !awake) {
      this.playWake();
    } else if (p.intro === 'land' && !saved) {
      this.playLanding(vesselShadow, vesselLight, vesselGlow);
    } else {
      this.playReturn();
    }
    (window as unknown as { __scene: PlanetScene }).__scene = this;
  }

  addSolid(x: number, y: number, w: number, h: number) {
    const z = this.add.zone(x, y, w, h);
    this.solids.add(z);
    return z;
  }

  /** 1px rims on the sides of rock and ruins so outcrops read as raised shapes, not flat blocks. */
  private drawRockEdges() {
    const m = this.map;
    const at = (x: number, y: number) => (x < 0 || y < 0 || x >= m.w || y >= m.h ? Cell.Void : m.cells[y * m.w + x]);
    const solid = (c: number) => c === Cell.Rock || c === Cell.Ruin;
    const g = this.add.graphics().setDepth(DEPTH.walls + 1);
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
      if (!solid(at(x, y))) continue;
      const face = !solid(at(x, y + 1));
      if (!solid(at(x - 1, y)) && at(x - 1, y) !== Cell.Void) {
        g.fillStyle(PALETTE[face ? 22 : 21]).fillRect(x * 16, y * 16, 1, 16);
        g.fillStyle(PALETTE[25], 0.5).fillRect(x * 16 - 1, y * 16 + 2, 1, 14);
      }
      if (!solid(at(x + 1, y)) && at(x + 1, y) !== Cell.Void) {
        g.fillStyle(PALETTE[face ? 24 : 23]).fillRect(x * 16 + 15, y * 16, 1, 16);
        g.fillStyle(PALETTE[25], 0.5).fillRect(x * 16 + 16, y * 16 + 2, 1, 14);
      }
    }
  }

  // --- intros ---

  /** Earth, first time: the cradle glows, opens, and the replicant boots up (visor flickers on). */
  private playWake() {
    const pl = this.player;
    const c = this.cradle!;
    c.setFrame(0);
    pl.locked = true;
    pl.sprite.setVisible(false);
    pl.light.intensity = 0;
    this.cameras.main.fadeIn(1400, 24, 20, 37);
    const lid = this.lighting.add({ x: c.x, y: c.y - 8, radius: 40, color: PALETTE[18], intensity: 0 });
    this.tweens.add({ targets: lid, intensity: 1, duration: 900, yoyo: true, hold: 500, delay: 600 });
    this.time.delayedCall(1700, () => {
      c.setFrame(1);
      this.fx.sparks(c.x, c.y - 8, PALETTE[18], 12);
      this.shake(120, 0.004);
      pl.setPosition(c.x, c.y - 2);
      pl.sprite.setVisible(true).setTint(0x404060);
      // visor flickers on: dark, flash, dark, on
      const steps = [[0, 0.15], [140, 0], [260, 0.6], [360, 0.2], [520, 1]];
      for (const [t, v] of steps) this.time.delayedCall(t, () => { pl.light.intensity = v; if (v > 0.5) pl.sprite.clearTint(); });
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
          this.markAwake();
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
      pl.locked = false;
      this.markAwake();
      this.game.events.emit('titlecard', this.planet.name, this.planet.subtitle);
    });
  }

  /** Vessel descends, thumps down, the replicant hops out, title card. */
  private playLanding(shadow: Phaser.GameObjects.Image, light: { intensity: number }, glow: Phaser.GameObjects.Image) {
    const ly = this.vessel.y;
    this.vessel.y = ly - 190;
    shadow.setScale(0.6, 0.5).setAlpha(0.1);
    this.player.sprite.setVisible(false);
    this.player.locked = true;
    this.cameras.main.centerOn(this.vessel.x, ly);
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

  private hopOut() {
    const pl = this.player;
    const sx = this.vessel.x, sy = this.vessel.y - 6, ex = this.vessel.x, ey = this.vessel.y + 14;
    pl.sprite.setVisible(true);
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
        pl.locked = false;
        this.markAwake();
        this.game.events.emit('titlecard', this.planet.name, this.planet.subtitle);
      },
    });
  }

  /** Deterministic pose for screenshots: player next to a crystal, a creature nearby, shards around. */
  private stageForScreenshot() {
    const c = this.map.base.center;
    const node = this.nodes.slice().sort((a, b) =>
      Phaser.Math.Distance.Between(a.x, a.y, c.x, c.y) - Phaser.Math.Distance.Between(b.x, b.y, c.x, c.y))[0];
    let px = node.x - 30, py = node.y + 6;
    for (const [ox, oy] of [[-30, 6], [30, 6], [0, 26], [-26, 20], [26, 20], [0, -20]]) {
      if (this.isWalkable(node.x + ox, node.y + oy) && this.isWalkable(node.x + ox * 2.2, node.y + oy)) { px = node.x + ox; py = node.y + oy; break; }
    }
    const view = new URLSearchParams(location.search).get('view');
    if (view === 'base' || view === 'copies') { px = c.x + 20; py = c.y + 30; }
    if (view === 'copies') {
      if (!this.base.built) this.base.placeReplicator(false);
      const parent = session.replicant!;
      for (let i = 0; i < 3; i++) {
        const copy = makeCopy(parent, i, this.planet.star, this.planet.planetIndex, c.x - 30 + i * 34, c.y + 44 - (i % 2) * 14);
        this.addNpc({ ...copy, id: `shot-${i}` });
      }
      this.pileEmbers = 7;
      this.base.setPile(7);
    }
    this.player.setPosition(px, py);
    this.player.facing = 1;
    this.enemies.forEach((e, i) => {
      if (i > 1) return;
      e.body.reset(px + (i ? 46 : -40), py + (i ? -14 : 8));
      e.sync();
    });
    this.cameras.main.centerOn(px, py);
    for (let i = 0; i < 3; i++) this.spawnShard(node.x - 12, node.y + 2);
    this.embers = Math.max(this.embers, view === 'base' ? STRUCTURES.replicator.cost : 12);
    this.game.events.emit('embers', this.embers, true);
    this.frozen = true;
  }

  update(time: number, dt: number) {
    if (!this.player) return; // still loading the save
    dt = Math.min(dt, 50);
    const input = this.controls.read();
    if (!this.stopped) {
      this.player.update(time, dt, input);
      if (!this.frozen) for (const e of this.enemies) e.update(time, dt);
      for (const s of this.shards) s.update(time, dt);
      this.shards = this.shards.filter((s) => !s.collected);
    }
    for (const n of this.npcs) n.update(time);
    this.base.update(time, this.embers, this.npcs.length);
    if (this.base.playerAtPile() && this.pileEmbers > 0 && this.player.alive) this.collectPile();
    if (time - this.lastAccrueAt > 20_000) { this.lastAccrueAt = time; this.accrueNow(false); }
    this.lighting.update(dt);
    this.atmosphere.update(dt);
    if (time - this.lastSaveAt > SAVE_EVERY_MS) { this.lastSaveAt = time; void this.flushPlanet(); }
    if (time - this.lastPosSaveAt > POS_SAVE_EVERY_MS) { this.lastPosSaveAt = time; void this.saveReplicant(); }
  }

  // --- saving ---

  private setupSaving() {
    const flushAll = () => { void this.flushPlanet(); void this.saveReplicant(); };
    const onHide = () => { if (document.visibilityState === 'hidden') flushAll(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flushAll);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flushAll);
    });
  }

  private markAwake() {
    const r = session.replicant;
    if (!r || r.traits.awake) return;
    r.traits.awake = true;
    void this.saveReplicant();
  }

  private async saveReplicant() {
    const r = session.replicant, st = session.store;
    if (!r || !st || this.shot || !this.player.alive || this.player.locked) return;
    r.star_id = this.planet.star;
    r.planet_index = this.planet.planetIndex;
    r.pos_x = Math.round(this.player.x);
    r.pos_y = Math.round(this.player.y);
    try { await st.saveReplicant(r); } catch (e) { console.warn('replicant save failed', e); }
  }

  /** Send queued ember / node / structure changes. Server value wins so family members share one pool. */
  private async flushPlanet() {
    const st = session.store;
    if (!st || this.shot || this.saving) return;
    const p = this.pending;
    if (!p.embers && !Object.keys(p.nodes).length && !Object.keys(p.set).length) return;
    this.pending = { embers: 0, nodes: {}, set: {} };
    this.saving = true;
    try {
      const data: PlanetData = { ...p.set, nodes: p.nodes };
      const row = await st.applyPlanetDelta(this.planet.star, this.planet.planetIndex, p.embers, data);
      if (row) {
        this.embers = row.embers + this.pending.embers;
        session.planet = row;
        this.game.events.emit('embers', this.embers, true);
      }
    } catch (e) {
      console.warn('planet save failed, will retry', e);
      this.pending.embers += p.embers;
      this.pending.nodes = { ...p.nodes, ...this.pending.nodes };
      this.pending.set = { ...p.set, ...this.pending.set };
    } finally {
      this.saving = false;
    }
  }

  // --- services used by entities ---

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

  shake(ms: number, intensity: number) {
    this.cameras.main.shake(ms, intensity, true);
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

  /** The action button does something other than attack here (build, replicate). Returns true if it did. */
  tryInteract(): boolean {
    if (this.playerAtVessel()) {
      this.openStarMap();
      return true;
    }
    if (this.base.playerAtReplicator() && this.base.canReplicate(this.embers, this.npcs.length)) {
      this.replicate();
      return true;
    }
    if (!this.base.playerOnPad() || !this.base.canBuild(this.embers)) return false;
    const cost = STRUCTURES.replicator.cost;
    this.embers -= cost;
    this.pending.embers -= cost;
    this.game.events.emit('embers', this.embers);
    this.player.locked = true;
    this.player.body.setVelocity(0, 0);
    this.base.build(this.player.x, this.player.y, () => {
      this.player.locked = false;
      this.pending.set.structures = [...(session.planet?.data.structures ?? []).filter((s) => s.type !== 'replicator'),
        { type: 'replicator', x: this.base.x, y: this.base.y, at: Date.now() }];
      void this.flushPlanet();
    });
    return true;
  }

  // --- the vessel: star map and launch ---

  /** Standing at the vessel's ramp (just below it). */
  playerAtVessel() {
    const p = this.player, v = this.vessel;
    return !this.shot && p.alive && Math.abs(p.x - v.x) < 16 && p.y - v.y > -4 && p.y - v.y < 18;
  }

  private openStarMap() {
    this.player.body.setVelocity(0, 0);
    touch.x = 0; touch.y = 0;
    this.scene.pause();
    this.scene.sleep('ui');
    this.scene.launch('starmap', { mode: 'pick', from: this.planet.star, embers: this.embers });
    const ev = this.game.events;
    const done = () => {
      ev.off('starmap-close', onClose);
      ev.off('starmap-launch', onLaunch);
      this.scene.stop('starmap');
      this.scene.resume();
      this.scene.wake('ui');
    };
    const onClose = () => done();
    const onLaunch = (starId: string) => { done(); this.launch(starId); };
    ev.on('starmap-close', onClose);
    ev.on('starmap-launch', onLaunch);
  }

  /** Pay the fuel, climb aboard, take off, and start the real-time journey. */
  private launch(toStar: string) {
    const from = starById(this.planet.star), to = starById(toStar);
    if (!from || !to) return;
    const ly = lyBetween(from, to);
    const cost = fuelCost(ly);
    if (this.embers < cost || ly > TRAVEL.jumpRangeLy) return;
    this.embers -= cost;
    this.pending.embers -= cost;
    this.game.events.emit('embers', this.embers);
    const pl = this.player, v = this.vessel;
    pl.locked = true;
    pl.body.setVelocity(0, 0);
    // hop up the ramp and vanish inside
    this.tweens.add({ targets: pl.sprite, x: v.x, y: v.y - 6, scaleX: 0.6, scaleY: 0.6, alpha: 0, duration: 380, ease: 'Quad.easeIn' });
    pl.light.intensity = 0;
    const thrust = this.add.particles(v.x, v.y - 4, 'px', {
      lifespan: { min: 200, max: 420 }, speedY: { min: 60, max: 140 }, speedX: { min: -20, max: 20 },
      scale: { start: 1.5, end: 0 }, tint: [PALETTE[10], PALETTE[9], PALETTE[11]], blendMode: Phaser.BlendModes.ADD, frequency: 10,
    }).setDepth(DEPTH.fx);
    this.time.delayedCall(450, () => {
      this.shake(500, 0.008);
      for (let i = 0; i < 6; i++) this.fx.dust(v.x - 18 + i * 7, v.y - 1, 5);
      this.cameras.main.stopFollow();
      this.tweens.add({
        targets: v, y: v.y - 220, duration: 1600, ease: 'Quad.easeIn',
        onUpdate: () => thrust.setPosition(v.x, v.y - 4),
      });
      this.cameras.main.fadeOut(1500, 24, 20, 37);
    });
    const arrivesAt = new Date(Date.now() + travelMinutes(ly) * 60000);
    const start = (async () => {
      await this.flushPlanet();
      const r = session.replicant, st = session.store;
      if (!r || !st) return null;
      return st.startJourney(r, toStar, arrivesAt);
    })();
    this.time.delayedCall(2100, async () => {
      let journey;
      try { journey = await start; } catch (e) { console.warn('launch failed', e); }
      this.scene.stop('ui');
      if (journey) this.scene.start('starmap', { mode: 'transit', journey });
      else this.scene.start('home');
    });
  }

  // --- copies ---

  private addNpc(save: ReplicantSave) {
    const b = this.map.base;
    const homeX = (b.pad.x + b.vessel.x) / 2, homeY = b.pad.y + 10;
    let x = save.pos_x ?? homeX, y = save.pos_y ?? homeY;
    if (!this.isWalkable(x, y)) { x = homeX; y = homeY; }
    const npc = new Npc(this, save, x, y, homeX, homeY);
    this.physics.add.collider(npc.zone, [this.walls, this.solids] as Phaser.Types.Physics.Arcade.ArcadeColliderType);
    this.npcs.push(npc);
    return npc;
  }

  /** The Replicator makes a drifted copy of you that stays here. */
  private replicate() {
    const cost = DRIFT.replicateCost;
    const parent = session.replicant;
    this.embers -= cost;
    this.pending.embers -= cost;
    this.game.events.emit('embers', this.embers);
    this.player.locked = true;
    this.player.body.setVelocity(0, 0);
    this.base.replicate(this.player.x, this.player.y, () => {
      this.player.locked = false;
      const x = this.base.x, y = this.base.y + 20;
      const parentSave: ReplicantSave = parent ?? { id: 'local', profile_id: null, name: 'REPLICANT', model: 'replicant', traits: {}, star_id: this.planet.star, planet_index: this.planet.planetIndex, pos_x: null, pos_y: null };
      const copy = makeCopy(parentSave, this.npcs.length, this.planet.star, this.planet.planetIndex, x, y);
      const npc = this.addNpc({ ...copy, id: `pending-${Date.now()}` });
      npc.sprite.setTintFill(0xffffff);
      npc.sprite.setAlpha(0);
      this.tweens.add({ targets: npc.sprite, alpha: 1, duration: 260 });
      this.time.delayedCall(380, () => { npc.sprite.clearTint(); npc.hop(); });
      this.fx.sparks(x, y - 10, PALETTE[copy.traits.feature ?? 10], 18);
      // a fresh pile clock starts with the first copy
      if (this.npcs.length === 1) { this.tick = Date.now(); this.pending.set.tick = this.tick; }
      void this.flushPlanet();
      void session.store?.createReplicant(copy)
        .then((saved) => Object.assign(npc.save, saved))
        .catch((e) => console.warn('copy save failed', e));
    });
  }

  /** Count NPC work since the last tick into the pile. */
  private accrueNow(initial: boolean) {
    const saves = this.npcs.map((n) => n.save);
    const before = this.pileEmbers;
    const r = accrue(saves, this.tick, Date.now(), this.pileEmbers);
    if (r.cache !== before || r.tick !== this.tick) {
      this.pileEmbers = r.cache;
      this.tick = r.tick;
      this.pending.set.cache = this.pileEmbers;
      this.pending.set.tick = this.tick;
      if (!initial && r.cache > before) this.npcs.forEach((n) => n.hop());
    }
    this.base.setPile(this.pileEmbers);
  }

  private collectPile() {
    const n = this.pileEmbers;
    this.base.collectPile(this.player.x, this.player.y);
    this.pileEmbers = 0;
    this.pending.set.cache = 0;
    this.pending.set.tick = this.tick;
    this.embers += n;
    this.pending.embers += n;
    this.fx.floatIcon(this.player.x, this.player.y - 22, 'shard');
    this.game.events.emit('embers', this.embers);
    void this.flushPlanet();
  }

  resolveAttack(hx: number, hy: number, radius: number, aim: Phaser.Math.Vector2) {
    let hit = false;
    for (const e of this.enemies) {
      if (!e.alive || e.hittable === false || Math.hypot(e.x - hx, e.y - 3 - hy) > radius + 5) continue;
      const dir = new Phaser.Math.Vector2(e.x - this.player.x, e.y - this.player.y).normalize();
      e.hit(PLAYER.attack.damage, dir.lengthSq() ? dir : aim, PLAYER.attack.knockback);
      hit = true;
    }
    for (const n of this.nodes) {
      if (!n.alive || Math.hypot(n.x - hx, n.y - 4 - hy) > radius + 4) continue;
      n.hit(aim);
      hit = true;
    }
    if (hit) {
      this.hitStop(100);
      this.shake(90, 0.004);
    }
  }

  onNodeHit(n: CrystalNode) {
    this.pending.nodes[n.index] = { hits: n.hits, at: Date.now() };
  }

  spawnShard(x: number, y: number, dir?: Phaser.Math.Vector2) {
    this.shards.push(new Shard(this, x, y, dir));
  }

  collectShard(x: number, y: number) {
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

  isWalkable(px: number, py: number) {
    const t = this.walls.getTileAtWorldXY(px, py);
    return !t || t.index < 0;
  }
}
