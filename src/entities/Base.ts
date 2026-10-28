import Phaser from 'phaser';
import { anim } from '../core/assets';
import { PALETTE, STRUCTURES } from '../core/data';
import type { Light } from '../fx/Lighting';
import type { PlanetScene } from '../scenes/PlanetScene';
import { squash } from './Player';

const REPLICATOR = STRUCTURES.replicator;

/**
 * The base by the vessel: a build pad that glows when the shared pool has enough Embers. Standing on
 * the glowing pad and pressing the action button builds the Replicator there.
 */
export class Base {
  private pad: Phaser.GameObjects.Sprite;
  private padLight: Light;
  private ghost: Phaser.GameObjects.Image;
  private replicator?: Phaser.GameObjects.Sprite;
  /** Glowing ring in front of the Replicator: stand here to make a copy */
  private spot?: Phaser.GameObjects.Ellipse;
  private spotLight?: Light;
  private ready = false;
  building = false;

  constructor(private scene: PlanetScene, readonly x: number, readonly y: number, built: boolean) {
    this.pad = scene.add.sprite(x, y, 'pad', 0).setDepth(60);
    this.padLight = scene.lighting.add({ x, y, radius: 34, color: PALETTE[9], intensity: 0 });
    this.ghost = scene.add.image(x, y + 6, 'replicator', 0).setOrigin(0.5, 1).setAlpha(0).setTint(PALETTE[9]).setDepth(DEPTH_GHOST);
    if (built) this.placeReplicator(false);
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

  /** Where you stand to replicate */
  get spotX() { return this.x; }
  get spotY() { return this.y + 16; }

  playerOnSpot() {
    const p = this.scene.player;
    return this.built && Math.abs(p.x - this.spotX) < 13 && Math.abs(p.y - this.spotY) < 9;
  }

  /** Spot glows and pulses when a copy can be made; dim otherwise. */
  updateSpot(time: number, canReplicate: boolean) {
    if (!this.spot || !this.spotLight) return;
    const on = this.playerOnSpot();
    const pulse = 0.5 + 0.5 * Math.sin(time / 260);
    this.spot.setStrokeStyle(1, canReplicate ? PALETTE[18] : PALETTE[22], canReplicate ? 0.6 + 0.4 * pulse : 0.35);
    this.spot.setFillStyle(PALETTE[18], canReplicate ? (on ? 0.35 : 0.12 * pulse) : 0);
    this.spotLight.intensity = canReplicate ? 0.4 + 0.3 * pulse + (on ? 0.3 : 0) : 0;
  }

  /** Short "not enough Embers" feedback: the Replicator dims and buzzes. */
  hungry() {
    if (!this.replicator) return;
    this.scene.tweens.add({ targets: this.replicator, x: this.x + 1, duration: 40, yoyo: true, repeat: 3 });
    this.replicator.setTint(0x8080a0);
    this.scene.time.delayedCall(300, () => this.replicator?.clearTint());
  }

  /** Scanner beam over the player, then the copy forms beside the Replicator. */
  scan(target: Phaser.GameObjects.Sprite, color: number, ms: number) {
    const beam = this.scene.add.rectangle(target.x, target.y - target.height, 18, 1, color).setBlendMode(Phaser.BlendModes.ADD).setDepth(6150);
    this.scene.tweens.add({ targets: beam, y: target.y, duration: ms / 2, yoyo: true, ease: 'Sine.easeInOut', onComplete: () => beam.destroy() });
    this.replicator?.setTint(0xffffff);
    this.scene.time.delayedCall(ms, () => this.replicator?.clearTint());
  }

  update(time: number, embers: number) {
    if (this.built) return;
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

  private placeReplicator(animate: boolean) {
    this.ghost.setAlpha(0);
    this.pad.stop().setFrame(2);
    const r = this.scene.add.sprite(this.x, this.y + 6, 'replicator').setOrigin(0.5, 1).setDepth(100 + this.y);
    r.play(anim('replicator', 'idle'));
    this.replicator = r;
    this.padLight.intensity = 0;
    const light = this.scene.lighting.add({ x: this.x, y: this.y - 10, radius: 80, color: PALETTE[10], intensity: animate ? 0 : 0.9, flicker: 0.12 });
    const glow = this.scene.add.image(this.x, this.y - 10, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(PALETTE[9]).setAlpha(animate ? 0 : 0.25).setDepth(6100);
    this.scene.addSolid(this.x, this.y + 2, 24, 8);
    this.spot = this.scene.add.ellipse(this.spotX, this.spotY, 20, 8).setDepth(55);
    this.spotLight = this.scene.lighting.add({ x: this.spotX, y: this.spotY, radius: 26, color: PALETTE[18], intensity: 0 });
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
