// Headgear overlay (antennae, halo, horns, sprout, dish, crown, lit antennae) that follows a replicant body's visor pixel.
import Phaser from 'phaser';
import { getManifest } from '../core/assets';
import { PALETTE } from '../core/data';

const GEAR_ANCHOR = { x: 8, y: 9 }; // visor pixel inside each gear frame (tools/sprites/gear.json)
/** Frame 7, lit antennae: a gold pixel and a small warm glow at each tip, like little lit wicks (Lumen asked for it). */
const LIT_FRAME = 7;
const TIPS: [number, number][] = [[4, 0], [10, 0]];

export class Gear {
  readonly image: Phaser.GameObjects.Image;
  private anchors: [number, number][];
  private tips: { dot: Phaser.GameObjects.Image; glow: Phaser.GameObjects.Image }[] = [];

  constructor(private scene: Phaser.Scene, private body: Phaser.GameObjects.Sprite, bodySprite: string, frame: number, tint: number, anchors?: [number, number][]) {
    this.anchors = anchors ?? getManifest().sprites[bodySprite]?.anchors ?? [];
    this.image = scene.add.image(0, 0, 'gear', frame).setTint(tint)
      .setOrigin(0, 0)
      .setVisible(frame > 0);
    this.setTips(frame);
  }

  /** A new body: its visor moves. */
  setAnchors(a: [number, number][]) { this.anchors = a; }

  setFrame(frame: number, tint?: number) {
    this.image.setFrame(frame).setVisible(frame > 0);
    if (tint !== undefined) this.image.setTint(tint);
    this.setTips(frame);
  }

  private setTips(frame: number) {
    if (frame === LIT_FRAME && !this.tips.length) {
      this.tips = TIPS.map(() => ({
        dot: this.scene.add.image(0, 0, 'px').setOrigin(0, 0).setTint(PALETTE[11]),
        glow: this.scene.add.image(0, 0, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(PALETTE[10]),
      }));
    } else if (frame !== LIT_FRAME && this.tips.length) {
      this.tips.forEach((t) => { t.dot.destroy(); t.glow.destroy(); });
      this.tips = [];
    }
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
    const visible = b.visible && Number(this.image.frame.name) > 0;
    this.image.setPosition(Math.round(gx), Math.round(gy)).setScale(sx, sy).setFlipX(b.flipX)
      .setDepth(b.depth + 0.5).setAlpha(b.alpha).setVisible(visible);
    if (!this.tips.length) return;
    const flicker = 0.8 + 0.2 * Math.sin(this.scene.time.now / 260);
    this.tips.forEach((t, k) => {
      const [tx, ty] = TIPS[k];
      const x = Math.round(gx) + (b.flipX ? 15 - tx : tx) * sx, y = Math.round(gy) + ty * sy;
      t.dot.setPosition(x, y).setScale(sx, sy).setDepth(b.depth + 0.55).setAlpha(b.alpha).setVisible(visible);
      t.glow.setPosition(x + sx / 2, y + sy / 2).setScale(0.12 * sx).setDepth(b.depth + 0.6)
        .setAlpha(b.alpha * 0.55 * flicker).setVisible(visible);
    });
  }

  destroy() {
    this.image.destroy();
    this.tips.forEach((t) => { t.dot.destroy(); t.glow.destroy(); });
  }
}
