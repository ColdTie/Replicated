import Phaser from 'phaser';
import { anim } from '../core/assets';
import { PALETTE, STRUCTURES } from '../core/data';
import { DRIFT } from '../core/drift';
import type { Light } from '../fx/Lighting';
import type { PlanetScene } from '../scenes/PlanetScene';
import { squash } from './Player';

const REPLICATOR = STRUCTURES.replicator;

/**
 * The base by the vessel: a build pad that glows when the shared pool has enough Embers. Standing on
 * the glowing pad and pressing the action button builds the Replicator there. Once built, its core
 * pulses when a copy can be made; standing in front of it and pressing action makes one. Embers the
 * copies gather wait in a glowing pile beside it; walk into the pile to collect them.
 */
export class Base {
  private pad: Phaser.GameObjects.Sprite;
  private padLight: Light;
  private ghost: Phaser.GameObjects.Image;
  private replicator?: Phaser.GameObjects.Sprite;
  private ready = false;
  private coreLight?: Light;
  private coreGlow?: Phaser.GameObjects.Image;
  private pile: Phaser.GameObjects.Image[] = [];
  private pileGlow: Phaser.GameObjects.Image;
  private pileLight: Light;
  building = false;

  constructor(private scene: PlanetScene, readonly x: number, readonly y: number, built: boolean) {
    this.pad = scene.add.sprite(x, y, 'pad', 0).setDepth(60);
    this.padLight = scene.lighting.add({ x, y, radius: 34, color: PALETTE[9], intensity: 0 });
    this.ghost = scene.add.image(x, y + 6, 'replicator', 0).setOrigin(0.5, 1).setAlpha(0).setTint(PALETTE[9]).setDepth(DEPTH_GHOST);
    const px = this.pileX, py = this.pileY;
    this.pileGlow = scene.add.image(px, py - 3, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(PALETTE[9]).setAlpha(0).setScale(0.6).setDepth(6100);
    this.pileLight = scene.lighting.add({ x: px, y: py - 4, radius: 30, color: PALETTE[9], intensity: 0, flicker: 0.2 });
    if (built) this.placeReplicator(false);
  }

  get pileX() { return this.x + 30; }
  get pileY() { return this.y + 18; }

  /** Show `n` waiting embers as a little heap of shards (up to 9 drawn). */
  setPile(n: number) {
    const shown = Math.min(9, n);
    while (this.pile.length > shown) this.pile.pop()!.destroy();
    while (this.pile.length < shown) {
      const i = this.pile.length;
      const ox = ((i % 3) - 1) * 4 + (Math.floor(i / 3) % 2) * 2, oy = -Math.floor(i / 3) * 3;
      this.pile.push(this.scene.add.image(this.pileX + ox, this.pileY + oy, 'shard').setDepth(100 + this.pileY + i));
    }
    this.pileGlow.setAlpha(n ? 0.28 : 0);
    this.pileLight.intensity = n ? 0.8 : 0;
  }

  playerAtPile() {
    const p = this.scene.player;
    return this.pile.length > 0 && Math.hypot(p.x - this.pileX, p.y - this.pileY) < 12;
  }

  /** Shards fly from the pile into the player. */
  collectPile(toX: number, toY: number) {
    for (const [i, s] of this.pile.entries()) {
      this.scene.tweens.add({ targets: s, x: toX, y: toY - 12, delay: i * 40, duration: 260, ease: 'Quad.easeIn', onComplete: () => s.destroy() });
    }
    this.pile = [];
    this.pileGlow.setAlpha(0);
    this.pileLight.intensity = 0;
    this.scene.fx.sparks(toX, toY - 10, PALETTE[10], 12);
  }

  /** Standing in front of the built Replicator. */
  playerAtReplicator() {
    const p = this.scene.player;
    return this.built && Math.abs(p.x - this.x) < 18 && p.y - this.y > 4 && p.y - this.y < 28;
  }

  canReplicate(embers: number, copies: number) {
    return this.built && !this.building && embers >= DRIFT.replicateCost && copies < DRIFT.maxCopiesPerPlanet;
  }

  /** Embers stream into the core, it flares, then done() places the copy. */
  replicate(fromX: number, fromY: number, done: () => void) {
    this.building = true;
    for (let i = 0; i < 10; i++) {
      const s = this.scene.add.image(fromX, fromY - 10, 'shard').setDepth(6300);
      this.scene.tweens.add({ targets: s, x: this.x, y: this.y - 10, delay: i * 45, duration: 320, ease: 'Quad.easeIn', onComplete: () => s.destroy() });
    }
    this.scene.time.delayedCall(800, () => {
      if (this.coreLight) this.scene.tweens.add({ targets: this.coreLight, radius: 150, intensity: 1.4, duration: 220, yoyo: true });
      this.scene.cameras.main.flash(160, 255, 255, 255, false);
      this.scene.shake(200, 0.006);
      this.scene.fx.sparks(this.x, this.y - 10, PALETTE[19], 20);
      if (this.replicator) squash(this.scene, this.replicator, 1.15, 0.9, 120);
    });
    this.scene.time.delayedCall(1050, () => { this.building = false; done(); });
  }

  get built() { return !!this.replicator; }

  /** True when the player is standing on the pad. */
  playerOnPad() {
    const p = this.scene.player;
    return Math.abs(p.x - this.x) < 15 && Math.abs(p.y - this.y) < 8;
  }

  canBuild(embers: number) {
    return !this.built && !this.building && embers >= REPLICATOR.cost;
  }

  update(time: number, embers: number, copies = 0) {
    if (this.built) {
      // Core pulses harder when a copy can be made, brighter still when you stand in front of it
      const can = this.canReplicate(embers, copies);
      const at = can && this.playerAtReplicator();
      if (this.coreLight) this.coreLight.intensity = 0.9 + (can ? 0.25 * Math.sin(time / 200) + (at ? 0.3 : 0.1) : 0);
      if (this.coreGlow) this.coreGlow.setAlpha(0.25 + (can ? 0.12 + 0.1 * Math.sin(time / 200) : 0));
      return;
    }
    const ready = this.canBuild(embers);
    if (ready !== this.ready) {
      this.ready = ready;
      if (ready) this.pad.play(anim('pad', 'ready'));
      else this.pad.stop().setFrame(0);
    }
    const on = ready && this.playerOnPad();
    this.padLight.intensity = ready ? 0.6 + 0.25 * Math.sin(time / 240) + (on ? 0.3 : 0) : 0;
    // Ghost outline of what will be built: shows only when you could build it
    this.ghost.setAlpha(ready ? (on ? 0.45 : 0.18) + 0.08 * Math.sin(time / 300) : 0);
  }

  /** Spend embers, play the build sequence, then call done(). */
  build(fromX: number, fromY: number, done: () => void) {
    this.building = true;
    const n = 14;
    for (let i = 0; i < n; i++) {
      const s = this.scene.add.image(fromX, fromY - 10, 'shard').setDepth(6300);
      this.scene.tweens.add({
        targets: s, x: this.x + (Math.random() - 0.5) * 16, y: this.y - 8, delay: i * 50, duration: 380, ease: 'Quad.easeIn',
        onComplete: () => { s.destroy(); this.scene.fx.sparks(this.x, this.y - 6, PALETTE[10], 2); },
      });
    }
    this.scene.time.delayedCall(n * 50 + 400, () => {
      this.placeReplicator(true);
      this.building = false;
      done();
    });
  }

  placeReplicator(animate: boolean) {
    this.ghost.setAlpha(0);
    this.pad.stop().setFrame(2);
    const r = this.scene.add.sprite(this.x, this.y + 6, 'replicator').setOrigin(0.5, 1).setDepth(100 + this.y);
    r.play(anim('replicator', 'idle'));
    this.replicator = r;
    this.padLight.intensity = 0;
    const light = this.scene.lighting.add({ x: this.x, y: this.y - 10, radius: 80, color: PALETTE[10], intensity: animate ? 0 : 0.9, flicker: 0.12 });
    const glow = this.scene.add.image(this.x, this.y - 10, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(PALETTE[9]).setAlpha(animate ? 0 : 0.25).setDepth(6100);
    this.coreLight = light;
    this.coreGlow = glow;
    this.scene.addSolid(this.x, this.y + 2, 24, 8);
    if (!animate) return;
    r.setScale(1, 0);
    this.scene.tweens.add({ targets: r, scaleY: 1, duration: 420, ease: 'Back.easeOut', onComplete: () => squash(this.scene, r, 1.2, 0.85, 120) });
    this.scene.tweens.add({ targets: light, intensity: 0.9, duration: 700 });
    this.scene.tweens.add({ targets: glow, alpha: 0.25, duration: 700 });
    this.scene.shake(260, 0.008);
    this.scene.fx.sparks(this.x, this.y - 12, PALETTE[11], 24);
    this.scene.cameras.main.flash(180, 254, 231, 97, false);
  }
}

const DEPTH_GHOST = 6110;
