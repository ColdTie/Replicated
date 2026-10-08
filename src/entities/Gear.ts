// Headgear overlay (antennae, halo, horns, sprout, dish, crown) that follows a replicant body's visor pixel.
import Phaser from 'phaser';
import { getManifest } from '../core/assets';

const GEAR_ANCHOR = { x: 8, y: 9 }; // visor pixel inside each gear frame (tools/sprites/gear.json)

export class Gear {
  readonly image: Phaser.GameObjects.Image;
  private anchors: [number, number][];

  constructor(scene: Phaser.Scene, private body: Phaser.GameObjects.Sprite, bodySprite: string, frame: number, tint: number, anchors?: [number, number][]) {
    this.anchors = anchors ?? getManifest().sprites[bodySprite]?.anchors ?? [];
    this.image = scene.add.image(0, 0, 'gear', frame).setTint(tint)
      .setOrigin(0, 0)
      .setVisible(frame > 0);
  }

  /** A new body: its visor moves. */
  setAnchors(a: [number, number][]) { this.anchors = a; }

  setFrame(frame: number, tint?: number) {
    this.image.setFrame(frame).setVisible(frame > 0);
    if (tint !== undefined) this.image.setTint(tint);
  }

  /** Call after the body moved or changed animation frame. */
  sync() {
    const b = this.body;
    const fi = Number(b.frame.name) || 0;
    const [ax, ay] = this.anchors[fi] ?? [8, 5];
    const sx = Math.abs(b.scaleX), sy = b.scaleY;
    const left = b.x - b.width * b.originX * sx, top = b.y - b.height * b.originY * sy;
    // gear is 16 wide: its anchor column 8 mirrors to column 7 when flipped
    const gx = b.flipX ? left + (b.width - 1 - ax - (15 - GEAR_ANCHOR.x)) * sx : left + (ax - GEAR_ANCHOR.x) * sx;
    const gy = top + (ay - GEAR_ANCHOR.y) * sy;
    this.image.setPosition(Math.round(gx), Math.round(gy)).setScale(sx, sy).setFlipX(b.flipX)
      .setDepth(b.depth + 0.5).setAlpha(b.alpha).setVisible(b.visible && Number(this.image.frame.name) > 0);
  }

  destroy() { this.image.destroy(); }
}
