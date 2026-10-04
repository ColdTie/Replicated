import Phaser from 'phaser';
import { sound } from '../audio/Sound';
import { anim, tex } from '../core/assets';
import { BACKEND, ENEMIES, ITEMS, PALETTE, PLANETS, PLAYER, STRUCTURES, hex, type HopperDef, type PlanetDef, type SkitterDef, type SpitterDef } from '../core/data';
import { session } from '../core/session';
import { Base } from '../entities/Base';
import type { Enemy } from '../entities/Enemy';
import { Hopper } from '../entities/Hopper';
import { Player, squash } from '../entities/Player';
import { CrystalNode, Shard } from '../entities/Resources';
import { Ruin } from '../entities/Ruin';
import { Skitter } from '../entities/Skitter';
import { Spitter, Spore } from '../entities/Spitter';
import { Butterflies, Flock, Grazer } from '../entities/Wildlife';
import { Atmosphere } from '../fx/Atmosphere';
import { Environment } from '../fx/Environment';
import { Fx } from '../fx/Fx';
import { Lighting } from '../fx/Lighting';
import { makeVignette } from '../fx/textures';
import { Controls } from '../input/Controls';
import type { DoorState, NodeState, PlanetData, PlanetSave } from '../net/store';
import { COLLIDE_TILES, Cell, DECOR, TILE, generatePlanet, type PlanetMap } from '../world/planetGen';

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
  spores: Spore[] = [];
  ruins: Ruin[] = [];
  embers = 0;
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
  private pending: { embers: number; nodes: Record<string, NodeState>; doors: Record<string, DoorState>; structures?: PlanetData['structures'] } = { embers: 0, nodes: {}, doors: {} };
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
    this.enemies = []; this.nodes = []; this.shards = []; this.spores = []; this.ruins = []; this.embers = 0; this.stopped = false; this.frozen = false;
    this.grazers = []; this.flocks = []; this.butterflies = undefined; this.bendables = new Map(); this.slow = 1;
    this.pending = { embers: 0, nodes: {}, doors: {} };
  }

  async preloadSave(): Promise<PlanetSave | null> {
    const st = session.store;
    if (!st) return null;
    return st.loadPlanet(this.planet.star, this.planet.planetIndex, this.seed ?? this.planet.seed);
  }

  create() {
    // Loading the planet save is async; build the world once it arrives.
    this.cameras.main.setBackgroundColor(PALETTE[25]);
    this.preloadSave()
      .catch((e) => { console.warn('planet load failed, playing without saving', e); return null; })
      .then((save) => this.build(save));
  }

  private build(save: PlanetSave | null) {
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
    const ts = tm.addTilesetImage('tiles', tex('tiles', p.id), 16, 16, 0, 0)!;
    tm.createBlankLayer('ground', ts)!.putTilesAt(m.ground, 0, 0).setDepth(DEPTH.ground);
    this.walls = tm.createBlankLayer('walls', ts)!.putTilesAt(m.walls, 0, 0).setDepth(DEPTH.walls);
    this.walls.setCollision(COLLIDE_TILES);
    this.drawRockEdges();
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
    m.ruins.forEach((r, i) => this.ruins.push(new Ruin(this, i, r.door, r.machine, r.inside, save?.data.doors?.[i])));
    for (const pr of m.props) {
      const s = this.add.sprite(pr.x, pr.y, tex(pr.sprite, p.id), pr.frame).setOrigin(0.5, 1).setDepth(DEPTH.actors + pr.y);
      if (pr.sprite === 'tree' && pr.frame === 0) this.time.delayedCall(Math.random() * 1500, () => s.play(anim(tex('tree', p.id), 'sway')));
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
      this.cradle = this.add.image(b.cradle.x, b.cradle.y + 6, tex('cradle', p.id), 1).setOrigin(0.5, 1).setDepth(DEPTH.actors + b.cradle.y - 4);
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
      else if (def.kind === 'spitter') this.enemies.push(new Spitter(this, def as SpitterDef, ex, ey));
      else this.enemies.push(new Skitter(this, def as SkitterDef, ex, ey));
    }

    // Player: a returning replicant appears where it was; a new one wakes in the cradle
    const r = session.replicant;
    const awake = !!r?.traits.awake;
    const saved = r && r.star_id === p.star && r.planet_index === p.planetIndex && r.pos_x != null && r.pos_y != null
      && this.isWalkable(r.pos_x, r.pos_y) ? { x: r.pos_x, y: r.pos_y! } : null;
    const start = saved ?? this.home;
    this.player = new Player(this, start.x, start.y);
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
    this.physics.add.collider(this.player.zone, [this.walls, this.solids, ...nodeZones, ...this.enemies.filter((e) => e instanceof Spitter).map((e) => e.zone)] as Phaser.Types.Physics.Arcade.ArcadeColliderType);
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
    if (view === 'base') { px = c.x + 20; py = c.y + 30; }
    if (view === 'pond') {
      const m = this.map;
      for (let i = 0; i < m.cells.length; i++) if (m.cells[i] === Cell.Water && m.cells[i - 1] === Cell.Water && m.cells[i + 1] === Cell.Water) {
        px = (i % m.w) * 16 + 8; py = Math.floor(i / m.w) * 16 + 8; break;
      }
    }
    if (view === 'ruin' && this.ruins.length) { const r = this.ruins[0]; px = r.inside.x + 12; py = r.inside.y + 24; }
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
    dt = Math.min(dt, 50) * this.slow;
    const input = this.controls.read();
    if (!this.stopped) {
      this.player.update(time, dt, input);
      if (!this.frozen) for (const e of this.enemies) e.update(time, dt);
      for (const s of this.shards) s.update(time, dt);
      this.shards = this.shards.filter((s) => !s.collected);
      this.updateSpores(time, dt);
    }
    for (const r of this.ruins) r.update(time);
    for (const g of this.grazers) g.update(time, dt);
    for (const f of this.flocks) f.update(time, dt);
    this.butterflies?.update(dt, this.env.night);
    this.updateBendables(time);
    this.updateWater();
    this.updateCamera();
    this.base.update(time, this.embers);
    this.watchFps(time);
    this.env.update(dt);
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
    if (!p.embers && !Object.keys(p.nodes).length && !Object.keys(p.doors).length && !p.structures) return;
    this.pending = { embers: 0, nodes: {}, doors: {} };
    this.saving = true;
    try {
      const data: PlanetData = { nodes: p.nodes };
      if (Object.keys(p.doors).length) data.doors = p.doors;
      if (p.structures) data.structures = p.structures;
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
      this.pending.doors = { ...p.doors, ...this.pending.doors };
      this.pending.structures ??= p.structures;
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

  /** The action button does something other than attack here (build). Returns true if it did. */
  tryInteract(): boolean {
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
      this.pending.structures = [...(session.planet?.data.structures ?? []).filter((s) => s.type !== 'replicator'),
        { type: 'replicator', x: this.base.x, y: this.base.y, at: Date.now() }];
      void this.flushPlanet();
    });
    return true;
  }

  resolveAttack(hx: number, hy: number, radius: number, aim: Phaser.Math.Vector2, heavy = false) {
    let hit = false, struck = false;
    const atk = PLAYER.attack;
    const damage = heavy ? atk.heavy.damage : atk.damage;
    const knock = atk.knockback * (heavy ? atk.heavy.knockbackScale : 1);
    for (const e of this.enemies) {
      if (!e.alive || e.hittable === false || Math.hypot(e.x - hx, e.y - 3 - hy) > radius + 5) continue;
      const dir = new Phaser.Math.Vector2(e.x - this.player.x, e.y - this.player.y).normalize();
      e.hit(damage, dir.lengthSq() ? dir : aim, knock);
      hit = struck = true;
    }
    for (const n of this.nodes) {
      if (!n.alive || Math.hypot(n.x - hx, n.y - 4 - hy) > radius + 4) continue;
      n.hit(aim);
      sound.crystal();
      hit = true;
    }
    for (const r of this.ruins) if (r.hitMachine(hx, hy, radius)) hit = true;
    for (const sp of this.spores) {
      if (sp.dead || sp.reflected || Math.hypot(sp.x - hx, sp.y - hy) > radius + 8) continue;
      sp.reflect(aim, this.player.featureColor);
      hit = true;
    }
    if (struck) sound.hit(heavy);
    if (hit) {
      this.hitStop(heavy ? 140 : 100);
      this.shake(heavy ? 160 : 90, heavy ? 0.008 : 0.004);
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
          this.shake(100, 0.005);
          sp.pop();
          break;
        }
      }
    }
    this.spores = this.spores.filter((s) => !s.dead);
  }

  onEnemyKilled(_e: Enemy) {
    sound.enemyDie();
    // the last creature of a fight goes down in slow motion
    const now = this.time.now;
    const fight = now - this.lastKillAt < 5000;
    this.lastKillAt = now;
    const p = this.player;
    const others = this.enemies.some((o) => o !== _e && o.alive && Math.hypot(o.x - p.x, o.y - p.y) < 130);
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

  onDoorChanged(r: Ruin) {
    this.pending.doors[r.index] = { open: r.open, taken: r.taken };
    void this.flushPlanet();
  }

  onModuleTaken(r: Ruin) {
    this.onDoorChanged(r);
    const rep = session.replicant;
    if (rep) {
      rep.traits.mods = [...(rep.traits.mods ?? []), r.kind];
      void this.saveReplicant();
    }
    this.fx.floatIcon(this.player.x, this.player.y - 24, 'module');
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

  splash(x: number, y: number, big: boolean) {
    this.glints.explode(big ? 8 : 3, x, y);
    const ring = this.add.image(x, y, 'ring').setDepth(DEPTH.ground + 4).setAlpha(0.7).setScale(0.3);
    this.tweens.add({ targets: ring, scale: big ? 2 : 1.3, alpha: 0, duration: 500, onComplete: () => ring.destroy() });
    if (big) sound.splash();
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
    this.pending.nodes[n.index] = { hits: n.hits, at: Date.now() };
  }

  spawnShard(x: number, y: number, dir?: Phaser.Math.Vector2) {
    this.shards.push(new Shard(this, x, y, dir));
  }

  collectShard(x: number, y: number) {
    sound.collect();
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
      for (const r of this.ruins) r.dropCore();
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
