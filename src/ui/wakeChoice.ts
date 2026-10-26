// WAKE or HOLD (story/STORY.md): before the Replicator makes a copy, its maker chooses. Two lights hang over the
// Replicator: an open eye (wake it now: it names itself and follows its own desires) and a closed one (hold it asleep
// for a new player). Left / Right (or the stick) moves between them, attack or E confirms, a click or tap on one picks
// it. Drawn in the world, in the warm and cold of the brief.
import Phaser from 'phaser';
import { sound } from '../audio/Sound';
import { PALETTE } from '../core/data';
import type { InputFrame } from '../input/Controls';

export type WakeOrHold = 'wake' | 'hold';
const OPTIONS: { kind: WakeOrHold; label: string; color: number; dx: number }[] = [
  { kind: 'wake', label: 'WAKE', color: PALETTE[10], dx: -18 },
  { kind: 'hold', label: 'HOLD', color: PALETTE[17], dx: 18 },
];

export class WakeChoice {
  private root: Phaser.GameObjects.Container;
  private gfx: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.BitmapText[];
  private glows: Phaser.GameObjects.Image[];
  private index = 0;
  private t = 0;
  private stickHeld = false;
  private done = false;

  constructor(private scene: Phaser.Scene, readonly x: number, readonly y: number, private onPick: (k: WakeOrHold) => void) {
    this.gfx = scene.add.graphics();
    this.glows = OPTIONS.map((o) => scene.add.image(o.dx, 0, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(o.color).setScale(0.35).setAlpha(0.3));
    this.labels = OPTIONS.map((o) => scene.add.bitmapText(o.dx, 10, 'pixel', o.label).setOrigin(0.5, 0).setTint(o.color));
    this.root = scene.add.container(x, y, [...this.glows, this.gfx, ...this.labels]).setDepth(6300).setAlpha(0);
    scene.tweens.add({ targets: this.root, alpha: 1, y: y - 3, duration: 300, ease: 'Sine.easeOut' });
    this.draw();
    sound.choiceOpen();
  }

  get kind() { return OPTIONS[this.index].kind; }

  /** Every frame while it is open: the buttons move the choice and pick it; the player stands still. */
  route(raw: InputFrame, dt: number) {
    if (this.done) return;
    this.t += dt / 1000;
    let move = raw.back ? -1 : raw.forward ? 1 : 0;
    if (!move && Math.abs(raw.x) > 0.6) { if (!this.stickHeld) move = Math.sign(raw.x); this.stickHeld = true; } else if (Math.abs(raw.x) < 0.3) this.stickHeld = false;
    if (move) { const i = Phaser.Math.Clamp(this.index + move, 0, OPTIONS.length - 1); if (i !== this.index) { this.index = i; sound.choiceMove(i); } }
    if (raw.click && (raw.attack || raw.interact)) {
      const w = this.scene.cameras.main.getWorldPoint(raw.click.x, raw.click.y);
      const hit = OPTIONS.findIndex((o) => Math.abs(w.x - (this.x + o.dx)) < 13 && Math.abs(w.y - (this.root.y + 3)) < 14);
      if (hit < 0) { this.draw(); return; }
      this.index = hit;
      this.pick();
      return;
    }
    if (raw.attack || raw.interact) { this.pick(); return; }
    this.draw();
  }

  private pick() {
    this.done = true;
    this.draw();
    sound.choicePick(this.kind);
    this.scene.tweens.add({ targets: this.glows[this.index], scale: 1, alpha: 0, duration: 450 });
    this.scene.tweens.add({ targets: this.root, alpha: 0, duration: 450, delay: 150, onComplete: () => this.root.destroy() });
    this.onPick(this.kind);
  }

  /** An open eye (wake) and a closed one (hold); the chosen one is bigger, ringed and bright. */
  private draw() {
    const g = this.gfx;
    g.clear();
    OPTIONS.forEach((o, i) => {
      const on = i === this.index, pulse = on ? 0.5 + 0.5 * Math.sin(this.t * 5) : 0;
      const x = o.dx, y = 0, r = on ? 9 : 7;
      this.glows[i].setAlpha(on ? 0.35 + 0.2 * pulse : 0.12).setScale(on ? 0.42 : 0.3);
      this.labels[i].setAlpha(on ? 1 : 0.45);
      g.fillStyle(PALETTE[25], 0.85).fillCircle(x, y, r + 2);
      g.lineStyle(1, o.color, on ? 1 : 0.5).strokeCircle(x, y, r + 2);
      if (on) g.lineStyle(1, o.color, 0.35 + 0.4 * pulse).strokeCircle(x, y, r + 5);
      // the eye: an almond, open with a lit pupil, or shut as a single lash line
      g.lineStyle(1, o.color, on ? 1 : 0.6);
      if (o.kind === 'wake') {
        g.strokeEllipse(x, y, r * 1.4, r * 0.8);
        g.fillStyle(o.color, on ? 1 : 0.6).fillCircle(x, y, 2);
      } else {
        g.beginPath(); g.arc(x, y - 2, r * 0.7, Math.PI * 0.15, Math.PI * 0.85, false); g.strokePath();
        for (const lx of [-3, 0, 3]) g.lineBetween(x + lx, y + 3, x + lx * 1.3, y + 5);
      }
    });
  }
}
