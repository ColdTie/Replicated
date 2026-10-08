// Underground: the warren the copies dug beneath the base. Opens over the paused planet when you walk onto the
// hatch; the ladder at the top of the Entrance takes you back up. Dark cave with the copies' lanterns, their
// resting stations (sleepers glow faintly inside), their benches, shelves and murals; copies at work hammer at the
// chalk outline of the room they are digging. The planet's Warren controller keeps the state; this is the view.
import Phaser from 'phaser';
import { sound } from '../audio/Sound';
import { anim, featureTex, tex } from '../core/assets';
import { PALETTE, PLAYER, WARREN, hex } from '../core/data';
import { stat } from '../core/drift';
import { session } from '../core/session';
import { Gear } from '../entities/Gear';
import type { Npc } from '../entities/Npc';
import { squash } from '../entities/Player';
import type { Below, Warren, WarrenView } from '../entities/Warren';
import { Fx } from '../fx/Fx';
import { Lighting, type Light } from '../fx/Lighting';
import { makeVignette } from '../fx/textures';
import { Controls } from '../input/Controls';
import type { ReplicantSave, WarrenItem, WarrenRoom } from '../net/store';
import { CAVE, GRID_H, GRID_W, ladderTile, restOf, type ItemKind } from '../world/warren';
import { paintWarren } from '../world/warrenPaint';
import { DEPTH, type PlanetScene } from './PlanetScene';

/** A body walking the warren: the player or a copy. Same sprites as upstairs, no physics, tile collision. */
class Walker {
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly shadow: Phaser.GameObjects.Image;
  readonly gear?: Gear;
  readonly light: Light;
  readonly key: string;
  z = 0;
  constructor(private scene: WarrenScene, public x: number, public y: number, data: ReplicantSave | undefined, color: number, lightColor: number, radius: number) {
    const modelId = (data?.model && data.model in PLAYER.models ? data.model : PLAYER.model) as keyof typeof PLAYER.models;
    const model = PLAYER.models[modelId];
    this.key = featureTex(model.sprite, data?.traits.feature ?? PLAYER.feature[1]);
    this.shadow = scene.add.image(x, y, 'shadow').setAlpha(0.5).setTint(PALETTE[25]).setDepth(DEPTH.shadow);
    this.sprite = scene.add.sprite(x, y, this.key).setOrigin(0.5, 1).play(anim(this.key, 'idle'));
    this.sprite.anims.setProgress(Math.random());
    if (data?.traits.gear) this.gear = new Gear(scene, this.sprite, model.sprite, data.traits.gear, color);
    this.light = scene.lighting.add({ x, y: y - 9, radius, color: lightColor, intensity: 0.9 });
    this.sync();
  }
  play(name: string, force = false) {
    const want = anim(this.key, name);
    if (force || this.sprite.anims.currentAnim?.key !== want) this.sprite.play(want, force);
  }
  sync() {
    const x = Math.round(this.x), y = Math.round(this.y);
    this.sprite.setPosition(x, y + 3 - Math.round(this.z)).setDepth(DEPTH.actors + y);
    this.shadow.setPosition(x, y + 2);
    this.light.x = x; this.light.y = y - 9;
    this.gear?.sync();
  }
  destroy() {
    this.sprite.destroy(); this.shadow.destroy(); this.gear?.destroy();
    this.scene.lighting.remove(this.light);
  }
}

interface CopyView { w: Walker; b: Below; pod?: Phaser.GameObjects.Sprite; t: number }

export class WarrenScene extends Phaser.Scene implements WarrenView {
  lighting!: Lighting;
  private host!: PlanetScene;
  private warren!: Warren;
  private fx!: Fx;
  private controls!: Controls;
  private cells!: Uint8Array;
  private floor!: Phaser.GameObjects.Image;
  private me!: Walker;
  private facing = 1;
  private dashUntil = 0;
  private dashReadyAt = 0;
  private dashDir = new Phaser.Math.Vector2(1, 0);
  private nextAfterimage = 0;
  private stepTimer = 0;
  private copies = new Map<Npc, CopyView>();
  private items = new Map<string, { sprite: Phaser.GameObjects.Sprite; light?: Light; glow?: Phaser.GameObjects.Image }>();
  private solid = new Set<string>();
  private ladder = { x: 0, y: 0 };
  private ladderLight!: Light;
  private leaving = false;

  constructor() { super('warren'); }

  init(d: { host: PlanetScene }) {
    this.host = d.host;
    this.warren = d.host.warren;
    this.copies = new Map(); this.items = new Map(); this.solid = new Set(); this.leaving = false; this.dashUntil = 0;
  }

  create() {
    const w = GRID_W * 16, h = GRID_H * 16;
    const p = this.host.planet;
    this.cameras.main.setBackgroundColor(hex(WARREN.ambient));
    this.lighting = new Lighting(this, hex(WARREN.ambient), DEPTH.dark);
    this.fx = new Fx(this, PALETTE[p.accent[1]], PALETTE[p.accent[2]]);
    this.controls = new Controls(this);
    this.paint();

    // the ladder up, on the back wall of the Entrance; a little daylight falls down the shaft
    const lt = ladderTile();
    this.ladder = { x: lt.x * 16 + 8, y: lt.y * 16 };
    this.add.sprite(this.ladder.x, this.ladder.y, tex('hatch', p.id), 2).setOrigin(0.5, 1).setDepth(DEPTH.walls);
    const day = 1 - this.host.env.night * 0.75;
    this.ladderLight = this.lighting.add({ x: this.ladder.x, y: this.ladder.y + 4, radius: 44, color: 0xb8c8ff, intensity: 0.5 + 0.5 * day });
    this.add.image(this.ladder.x, this.ladder.y + 6, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(PALETTE[20]).setAlpha(0.08 + 0.1 * day).setScale(0.8, 0.5).setDepth(DEPTH.glow);

    for (const it of this.warren.data.items) this.addItem(it, false);

    const me = session.replicant;
    const warm = 0xffe2b8;
    this.me = new Walker(this, this.ladder.x, this.ladder.y + 22, me ?? undefined, PALETTE[me?.traits.trail ?? me?.traits.feature ?? 10], warm, 70 * stat(me, 'light'));
    if (this.host.visit) this.me.sprite.setTint(0x9ae8ff).setAlpha(0.8);

    for (const b of this.warren.below.values()) this.onArrive(b);
    this.warren.view = this;

    const cam = this.cameras.main;
    cam.setBounds(0, 0, w, h);
    cam.setRoundPixels(true);
    cam.startFollow(this.me.sprite, true, 0.1, 0.1, 0, 8);
    cam.centerOn(this.me.x, this.me.y);
    cam.fadeIn(450, 11, 10, 22);
    if (!this.textures.exists('vignette')) makeVignette(this, this.scale.width, this.scale.height);
    this.add.image(0, 0, 'vignette').setOrigin(0).setScrollFactor(0).setDepth(DEPTH.vignette);
    this.game.events.emit('location', `THE WARREN - ${this.host.placeLabel}`, [...this.warren.below.keys()].map((n) => ({ name: n.data.name.toUpperCase(), color: PALETTE[n.data.traits.feature ?? PLAYER.feature[1]] })));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { if (this.warren.view === this) this.warren.view = undefined; });
    (window as unknown as { __warren: WarrenScene }).__warren = this;
  }

  /** The whole underground as one image (redrawn when a room is finished). */
  private paint() {
    const p = this.host.planet;
    const g = paintWarren(this.warren.data, p.accent, p.seed);
    this.cells = g.cells;
    const key = 'warren.floor';
    if (this.textures.exists(key)) this.textures.remove(key);
    const ct = this.textures.createCanvas(key, g.width, g.height)!;
    ct.getContext().putImageData(new ImageData(g.data, g.width, g.height), 0, 0);
    ct.refresh();
    this.floor?.destroy();
    this.floor = this.add.image(0, 0, key).setOrigin(0).setDepth(DEPTH.ground);
  }

  private roomDug(id: string) {
    return id === 'entrance' || !!this.warren.data.rooms.find((r) => r.id === id)?.dug;
  }

  private addItem(it: WarrenItem, animate: boolean) {
    if (this.items.has(it.id) || !this.roomDug(it.room)) return;
    const def = WARREN.items[it.kind as ItemKind];
    if (!def) return;
    const x = it.x * 16 + 8, y = it.y * 16 + 16;
    const sprite = this.add.sprite(x, y, tex('warren', this.host.planet.id), def.frame).setOrigin(0.5, 1).setDepth(DEPTH.actors + y - 2);
    if (it.kind === 'mural') {
      const by = this.host.npcs.find((n) => n.data.id === it.by);
      sprite.setTint(by?.trailColor ?? PALETTE[18]);
    }
    const entry: { sprite: Phaser.GameObjects.Sprite; light?: Light; glow?: Phaser.GameObjects.Image } = { sprite };
    const l = (def as { light?: { radius: number; color: number; intensity: number; flicker?: number } }).light;
    if (l) {
      entry.light = this.lighting.add({ x, y: y - 9, radius: l.radius, color: PALETTE[l.color], intensity: animate ? 0 : l.intensity, flicker: l.flicker });
      entry.glow = this.add.image(x, y - 9, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(PALETTE[l.color]).setAlpha(animate ? 0 : 0.14).setScale(0.45).setDepth(DEPTH.glow);
      if (animate) { this.tweens.add({ targets: entry.light, intensity: l.intensity, duration: 600 }); this.tweens.add({ targets: entry.glow, alpha: 0.14, duration: 600 }); }
    }
    if (def.solid) this.solid.add(`${it.x},${it.y}`);
    this.items.set(it.id, entry);
    if (animate) { squash(this, sprite, 1.3, 0.7, 150); this.fx.dust(x, y, 6); sound.build(); }
  }

  // ------------------------------------------------------------ WarrenView (the controller tells us)

  onSwing(b: Below) {
    const v = this.copies.get(b.npc);
    if (!v || !b.room) return;
    v.w.play('attack', true);
    if (b.task === 'furnish') {
      this.fx.sparks(v.w.x + (Math.random() - 0.5) * 8, v.w.y - 14 - Math.random() * 6, PALETTE[18], 3);
      if (Math.hypot(this.me.x - v.w.x, this.me.y - v.w.y) < 200) sound.hit();
      return;
    }
    // sparks off the chalk line nearest the digger
    const r = b.room;
    const edges = [{ x: r.x * 16, y: v.w.y }, { x: (r.x + r.w) * 16, y: v.w.y }, { x: v.w.x, y: r.y * 16 }, { x: v.w.x, y: (r.y + r.h) * 16 }];
    const e = edges[b.swings % edges.length];
    v.w.sprite.setFlipX(e.x < v.w.x);
    this.fx.sparks(e.x + (Math.random() - 0.5) * 6, e.y - 4 - Math.random() * 6, PALETTE[2], 4);
    if (Math.hypot(this.me.x - v.w.x, this.me.y - v.w.y) < 200) sound.hit();
    if (b.swings % 3 === 0) this.cameras.main.shake(60, 0.002 * PLAYER.shake);
  }

  onRoomDug(room: WarrenRoom) {
    this.paint();
    for (const it of this.warren.data.items) if (it.room === room.id) this.addItem(it, true);
    const cx = (room.x + room.w / 2) * 16, cy = (room.y + room.h / 2) * 16;
    for (let i = 0; i < 6; i++) this.fx.dust(cx + (Math.random() - 0.5) * room.w * 12, cy + (Math.random() - 0.5) * room.h * 12, 4);
    this.cameras.main.shake(200, 0.004 * PLAYER.shake);
    const v = [...this.copies.values()].find((c) => c.b.room === room);
    if (v) { v.w.play('idle'); this.hop(v.w); }
  }

  onItem(it: WarrenItem) { this.addItem(it, true); }

  onArrive(b: Below) {
    const npc = b.npc;
    if (this.copies.has(npc)) return;
    const s = this.warren.spotFor(b);
    const resting = b.task === 'rest';
    const w = new Walker(this, s.x, resting ? s.y - 5 : s.y, npc.data, npc.trailColor, resting ? PALETTE[18] : 0xffe2b8, resting ? 22 : 34 * stat(npc.data, 'light'));
    const v: CopyView = { w, b, t: Math.random() * 10 };
    if (resting) {
      const pod = restOf(this.warren.data, npc.data.id);
      const entry = pod && this.items.get(pod.id);
      if (entry) { entry.sprite.setFrame(1); v.pod = entry.sprite; }
      w.sprite.setTint(0x7c86a8);
      w.light.intensity = 0.45;
      w.gear?.image.setTint(0x7c86a8);
    } else {
      this.fx.dust(s.x, s.y + 2, 5);
    }
    this.copies.set(npc, v);
  }

  onLeave(npc: Npc) {
    const v = this.copies.get(npc);
    if (!v) return;
    v.pod?.setFrame(0);
    this.fx.dust(v.w.x, v.w.y + 2, 4);
    v.w.destroy();
    this.copies.delete(npc);
  }

  private hop(w: Walker) {
    this.tweens.add({ targets: w, z: 6, duration: 140, yoyo: true, ease: 'Quad.easeOut' });
    squash(this, w.sprite, 0.8, 1.2, 120);
  }

  // ------------------------------------------------------------ walking

  private blockedAt(px: number, py: number) {
    const tx = Math.floor(px / 16), ty = Math.floor(py / 16);
    if (tx < 0 || ty < 0 || tx >= GRID_W || ty >= GRID_H) return true;
    if (this.cells[ty * GRID_W + tx] !== CAVE.floor) return true;
    return this.solid.has(`${tx},${ty}`);
  }

  /** A 8x5 box at the feet must stay on dug floor. */
  private canStand(x: number, y: number) {
    return !this.blockedAt(x - 4, y - 2) && !this.blockedAt(x + 3, y - 2) && !this.blockedAt(x - 4, y + 2) && !this.blockedAt(x + 3, y + 2);
  }

  update(time: number, dt: number) {
    if (this.leaving) return;
    dt = Math.min(dt, 50);
    this.warren.update(dt);
    const input = this.controls.read();
    const me = this.me;
    const dashing = time < this.dashUntil;
    let vx = 0, vy = 0;
    if (dashing) {
      const sp = PLAYER.dash.speed;
      vx = this.dashDir.x * sp; vy = this.dashDir.y * sp;
      if (time > this.nextAfterimage) {
        this.nextAfterimage = time + PLAYER.dash.afterimageEveryMs;
        const s = me.sprite;
        const ghost = this.add.image(s.x, s.y, s.texture.key, s.frame.name).setOrigin(0.5, 1).setFlipX(s.flipX)
          .setTintFill(PALETTE[session.replicant?.traits.trail ?? session.replicant?.traits.feature ?? 10]).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.55).setDepth(s.depth - 1);
        this.tweens.add({ targets: ghost, alpha: 0, duration: 220, onComplete: () => ghost.destroy() });
      }
    } else {
      const speed = PLAYER.speed * stat(session.replicant, 'speed');
      vx = input.x * speed; vy = input.y * speed;
      if (input.dash && time > this.dashReadyAt) {
        this.dashUntil = time + PLAYER.dash.ms;
        this.dashReadyAt = time + PLAYER.dash.cooldownMs;
        const d = input.dashDir ?? (input.x || input.y ? { x: input.x, y: input.y } : { x: this.facing, y: 0 });
        this.dashDir.set(d.x, d.y).normalize();
        sound.dash();
      }
      if (input.attack) { me.play('attack', true); sound.swing(); }
    }
    const nx = me.x + (vx * dt) / 1000, ny = me.y + (vy * dt) / 1000;
    if (this.canStand(nx, me.y)) me.x = nx;
    if (this.canStand(me.x, ny)) me.y = ny;
    const moving = Math.abs(vx) + Math.abs(vy) > 1;
    if (Math.abs(vx) > 1) this.facing = Math.sign(vx);
    me.sprite.setFlipX(this.facing < 0);
    const cur = me.sprite.anims.currentAnim?.key ?? '';
    if (!cur.endsWith(':attack') || !me.sprite.anims.isPlaying) me.play(moving ? 'walk' : 'idle');
    if (moving && !dashing) {
      this.stepTimer += dt;
      if (this.stepTimer > 270) { this.stepTimer = 0; sound.step('stone'); }
    }
    me.sync();

    // copies: sleepers breathe, diggers face their work
    for (const v of this.copies.values()) {
      v.t += dt / 1000;
      if (v.b.task === 'rest') {
        v.w.z = Math.sin(v.t * 1.3) * 0.6;
        v.w.light.intensity = 0.35 + 0.1 * Math.sin(v.t * 1.3);
      }
      v.w.sync();
    }
    this.lighting.update(dt);

    // up the ladder
    if (Math.abs(me.x - this.ladder.x) < 7 && me.y < this.ladder.y + 11) this.ascend();
  }

  private ascend() {
    this.leaving = true;
    sound.doorOpen();
    this.tweens.add({ targets: this.me.sprite, y: this.me.sprite.y - 10, alpha: 0, duration: 300, ease: 'Quad.easeIn' });
    this.cameras.main.fadeOut(320, 11, 10, 22);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.warren.view = undefined;
      this.scene.stop();
      this.host.resurface();
    });
  }
}
