import Phaser from 'phaser';
import { anim, tex } from '../core/assets';
import { ENEMIES, PALETTE, PLANETS, PLAYER, hex, type PlanetDef } from '../core/data';
import { Player, squash } from '../entities/Player';
import { CrystalNode, Shard } from '../entities/Resources';
import { Skitter } from '../entities/Skitter';
import { Atmosphere } from '../fx/Atmosphere';
import { Fx } from '../fx/Fx';
import { Lighting } from '../fx/Lighting';
import { makeVignette } from '../fx/textures';
import { Controls } from '../input/Controls';
import { COLLIDE_TILES, Cell, DECOR, generatePlanet, type PlanetMap } from '../world/planetGen';

export const DEPTH = { ground: 0, walls: 1, shadow: 50, actors: 100, fog: 5000, dark: 6000, glow: 6100, fx: 6150, ui: 6300, vignette: 7000 };

interface InitData { planetId?: string; seed?: number; shot?: boolean }

export class PlanetScene extends Phaser.Scene {
  planet!: PlanetDef;
  map!: PlanetMap;
  lighting!: Lighting;
  fx!: Fx;
  player!: Player;
  enemies: Skitter[] = [];
  nodes: CrystalNode[] = [];
  shards: Shard[] = [];
  embers = 0;

  private atmosphere!: Atmosphere;
  private controls!: Controls;
  private walls!: Phaser.Tilemaps.TilemapLayer;
  private vessel!: Phaser.GameObjects.Sprite;
  private landing = new Phaser.Math.Vector2();
  private stopped = false;
  private seed?: number;
  private shot = false;
  /** Screenshot mode: enemies hold still. */
  private frozen = false;

  constructor() { super('planet'); }

  init(data: InitData) {
    this.planet = PLANETS.find((p) => p.id === data.planetId) ?? PLANETS[0];
    this.seed = data.seed;
    this.shot = !!data.shot;
    this.enemies = []; this.nodes = []; this.shards = []; this.embers = 0; this.stopped = false; this.frozen = false;
  }

  create() {
    const p = this.planet;
    const { width, height } = this.scale;
    this.map = generatePlanet(p, this.seed ?? p.seed);
    const m = this.map;
    const pw = m.w * 16, ph = m.h * 16;

    this.lighting = new Lighting(this, hex(p.ambient), DEPTH.dark);
    this.fx = new Fx(this, PALETTE[p.accent[1]], PALETTE[p.accent[2]]);
    this.atmosphere = new Atmosphere(this, p);
    this.controls = new Controls(this);

    // Tilemap: ground + walls (walls layer also holds invisible collision over the void)
    const tm = this.make.tilemap({ tileWidth: 16, tileHeight: 16, width: m.w, height: m.h });
    const ts = tm.addTilesetImage('tiles', tex('tiles', p.id), 16, 16, 0, 0)!;
    tm.createBlankLayer('ground', ts)!.putTilesAt(m.ground, 0, 0).setDepth(DEPTH.ground);
    this.walls = tm.createBlankLayer('walls', ts)!.putTilesAt(m.walls, 0, 0).setDepth(DEPTH.walls);
    this.walls.setCollision(COLLIDE_TILES);
    this.drawRockEdges();

    // Decor and the glows that make the world readable without words
    for (const d of m.decor) {
      this.add.image(d.x, d.y, tex('decor', p.id), d.frame).setOrigin(0.5, 1).setDepth(DEPTH.actors + d.y - (d.frame === DECOR.door ? 20 : 0));
    }
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

    // Landing site and vessel (warm, ours)
    this.landing.set(m.spawn.x * 16 + 8, m.spawn.y * 16 + 4);
    const vesselShadow = this.add.image(this.landing.x, this.landing.y + 2, 'shadow').setTint(PALETTE[25]).setAlpha(0.5).setScale(2.6, 2).setDepth(DEPTH.shadow);
    this.vessel = this.add.sprite(this.landing.x, this.landing.y + 4, 'vessel').setOrigin(0.5, 1).setDepth(DEPTH.actors + this.landing.y);
    this.vessel.play(anim('vessel', 'idle'));
    const vesselBody = this.add.zone(this.landing.x, this.landing.y - 4, 24, 10);
    this.physics.add.existing(vesselBody, true);
    const vesselLight = this.lighting.add({ x: this.landing.x, y: this.landing.y - 10, radius: 110, color: 0xffc98a, intensity: 1, flicker: 0.08 });
    const vesselGlow = this.add.image(this.landing.x, this.landing.y - 6, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(PALETTE[9]).setAlpha(0.22).setScale(1.4).setDepth(DEPTH.glow);

    // Resources and enemies
    for (const n of m.nodes) this.nodes.push(new CrystalNode(this, n.x * 16 + 8, n.y * 16 + 10));
    for (const e of m.enemies) this.enemies.push(new Skitter(this, ENEMIES[e.type], e.x * 16 + 8, e.y * 16 + 8));

    // Player
    this.player = new Player(this, this.landing.x, this.landing.y + 18);

    // Physics
    this.physics.world.setBounds(0, 0, pw, ph);
    const nodeZones = this.nodes.map((n) => n.zone);
    const enemyZones = this.enemies.map((e) => e.zone);
    this.physics.add.collider(this.player.zone, this.walls);
    this.physics.add.collider(this.player.zone, nodeZones);
    this.physics.add.collider(this.player.zone, vesselBody);
    this.physics.add.collider(enemyZones, this.walls);
    this.physics.add.collider(enemyZones, nodeZones);
    this.physics.add.collider(enemyZones, vesselBody);
    this.physics.add.collider(enemyZones, enemyZones);

    // Camera
    const cam = this.cameras.main;
    cam.setBounds(0, 0, pw, ph);
    cam.setRoundPixels(true);
    cam.startFollow(this.player.zone, true, 0.1, 0.1, 0, 8);
    cam.centerOn(this.landing.x, this.landing.y);

    makeVignette(this, width, height);
    this.add.image(0, 0, 'vignette').setOrigin(0).setScrollFactor(0).setDepth(DEPTH.vignette);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.game.events.off('restart'));
    this.game.events.emit('embers', this.embers);

    if (this.shot) {
      this.player.locked = false;
      this.stageForScreenshot();
    } else {
      this.playLanding(vesselShadow, vesselLight, vesselGlow);
    }
    (window as unknown as { __scene: PlanetScene }).__scene = this;
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

  /** Vessel descends, thumps down, the replicant hops out, title card. */
  private playLanding(shadow: Phaser.GameObjects.Image, light: { intensity: number }, glow: Phaser.GameObjects.Image) {
    const ly = this.vessel.y;
    this.vessel.y = ly - 190;
    shadow.setScale(0.6, 0.5).setAlpha(0.1);
    this.player.sprite.setVisible(false);
    this.player.locked = true;
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
    const sx = this.landing.x, sy = this.landing.y - 2, ex = this.landing.x, ey = this.landing.y + 18;
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
        this.game.events.emit('titlecard', this.planet.name, this.planet.subtitle);
      },
    });
  }

  /** Deterministic pose for screenshots: player next to a crystal, a skitter closing in, shards around. */
  private stageForScreenshot() {
    const node = this.nodes.slice().sort((a, b) =>
      Phaser.Math.Distance.Between(a.x, a.y, this.landing.x, this.landing.y) - Phaser.Math.Distance.Between(b.x, b.y, this.landing.x, this.landing.y))[0];
    let px = node.x - 30, py = node.y + 6;
    for (const [ox, oy] of [[-30, 6], [30, 6], [0, 26], [-26, 20], [26, 20], [0, -20]]) {
      if (this.isWalkable(node.x + ox, node.y + oy) && this.isWalkable(node.x + ox * 2.2, node.y + oy)) { px = node.x + ox; py = node.y + oy; break; }
    }
    this.player.setPosition(px, py);
    this.player.facing = 1;
    const e = this.enemies[0];
    e.body.reset(px + (px < node.x ? -40 : 40), py + 8);
    e.sync();
    this.cameras.main.centerOn(px, py);
    for (let i = 0; i < 3; i++) this.spawnShard(node.x - 12, node.y + 2);
    this.embers = 12;
    this.frozen = true;
  }

  update(time: number, dt: number) {
    dt = Math.min(dt, 50);
    const input = this.controls.read();
    if (!this.stopped) {
      this.player.update(time, dt, input);
      if (!this.frozen) for (const e of this.enemies) e.update(time, dt);
      for (const s of this.shards) s.update(time, dt);
      this.shards = this.shards.filter((s) => !s.collected);
    }
    this.lighting.update(dt);
    this.atmosphere.update(dt);
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
      if (!e.alive) continue;
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

  resolveAttack(hx: number, hy: number, radius: number, aim: Phaser.Math.Vector2) {
    let hit = false;
    for (const e of this.enemies) {
      if (!e.alive || Math.hypot(e.x - hx, e.y - 3 - hy) > radius + 5) continue;
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

  spawnShard(x: number, y: number, dir?: Phaser.Math.Vector2) {
    this.shards.push(new Shard(this, x, y, dir));
  }

  collectShard(x: number, y: number) {
    this.embers++;
    this.fx.sparks(x, y - 4, PALETTE[10], 5);
    this.fx.floatIcon(this.player.x, this.player.y - 18, 'shard');
    this.game.events.emit('embers', this.embers);
  }

  respawnPlayer() {
    const cam = this.cameras.main;
    cam.fadeOut(300, 24, 20, 37);
    cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.player.respawn(this.landing.x, this.landing.y + 18);
      cam.centerOn(this.landing.x, this.landing.y);
      cam.fadeIn(500, 24, 20, 37);
    });
  }

  isWalkable(px: number, py: number) {
    const t = this.walls.getTileAtWorldXY(px, py);
    return !t || t.index < 0;
  }
}
