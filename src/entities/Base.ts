import Phaser from 'phaser';
import { anim } from '../core/assets';
import { PALETTE } from '../core/data';
import type { PlanetScene } from '../scenes/PlanetScene';

/**
 * The Replicator by the ship. Since 2026-10-28 it makes no copies: new Vessels come from the Vessel Printer
 * (src/entities/VesselPrinter.ts). It still stands where a world has one (the homeworld's, on whose ring Thales woke
 * the tenth Vessel, and older saves), with that ring before it; an empty pad is no longer built on.
 */
export class Base {
  private replicator?: Phaser.GameObjects.Sprite;

  constructor(private scene: PlanetScene, readonly x: number, readonly y: number, built: boolean) {
    if (built) this.placeReplicator();
  }

  get built() { return !!this.replicator; }

  /** The ring before the Replicator (where the opening's scan finds you) */
  get spotX() { return this.x; }
  get spotY() { return this.y + 16; }

  /** Scanner beam over the target while the Replicator flares (the opening). */
  scan(target: Phaser.GameObjects.Sprite, color: number, ms: number) {
    const beam = this.scene.add.rectangle(target.x, target.y - target.height, 18, 1, color).setBlendMode(Phaser.BlendModes.ADD).setDepth(6150);
    this.scene.tweens.add({ targets: beam, y: target.y, duration: ms / 2, yoyo: true, ease: 'Sine.easeInOut', onComplete: () => beam.destroy() });
    this.replicator?.setTint(0xffffff);
    this.scene.time.delayedCall(ms, () => this.replicator?.clearTint());
  }

  private placeReplicator() {
    this.scene.add.sprite(this.x, this.y, 'pad', 2).setDepth(60);
    const r = this.scene.add.sprite(this.x, this.y + 6, 'replicator').setOrigin(0.5, 1).setDepth(100 + this.y);
    r.play(anim('replicator', 'idle'));
    this.replicator = r;
    this.scene.lighting.add({ x: this.x, y: this.y - 10, radius: 80, color: PALETTE[10], intensity: 0.9, flicker: 0.12 });
    this.scene.add.image(this.x, this.y - 10, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(PALETTE[9]).setAlpha(0.25).setDepth(6100);
    this.scene.addSolid(this.x, this.y + 2, 24, 8);
    this.scene.add.ellipse(this.spotX, this.spotY, 20, 8).setDepth(55).setStrokeStyle(1, PALETTE[22], 0.35);
  }
}
