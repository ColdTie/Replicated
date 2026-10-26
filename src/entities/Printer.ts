// A Metanoia 3D printer standing beside a building it prints (tools/sprites/printer.json, printhead.json). The head
// runs along the gantry and lays a glowing layer with every blow on the building; while the building waits to be
// finished the printer calls for hands with light and motion: a slow pulse on its bed and a thread of light to the
// rows still missing. Once the building is done it powers down to a soft standby glow.
import Phaser from 'phaser';
import { PALETTE } from '../core/data';
import type { Light } from '../fx/Lighting';
import type { Building } from '../net/store';
import type { PlanetScene } from '../scenes/PlanetScene';

export class Printer {
  readonly x: number; readonly y: number;
  private frame: Phaser.GameObjects.Sprite;
  private head: Phaser.GameObjects.Sprite;
  private light: Light;
  private glow: Phaser.GameObjects.Image;
  private thread: Phaser.GameObjects.Graphics;
  private headX = 0;
  private headTo = 0;
  private flashUntil = 0;
  private t = Math.random() * 10;
  done = false;

  constructor(private scene: PlanetScene, readonly b: Building) {
    // beside the building, on the side away from its door path, standing on the same row
    const side = b.x > scene.baseCenter.x ? 1 : -1;
    this.x = b.x + side * (b.w * 8 + 16);
    this.y = b.y + 2;
    this.frame = scene.add.sprite(this.x, this.y, 'printer', 0).setOrigin(0.5, 1).setDepth(100 + this.y);
    this.head = scene.add.sprite(this.x, this.y - 19, 'printhead', 0).setOrigin(0.5, 0).setDepth(100 + this.y + 1);
    this.light = scene.lighting.add({ x: this.x, y: this.y - 8, radius: 46, color: PALETTE[10], intensity: 0.5, flicker: 0.1 });
    this.glow = scene.add.image(this.x, this.y - 6, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(PALETTE[10]).setAlpha(0.18).setScale(0.55).setDepth(6100);
    this.thread = scene.add.graphics().setDepth(6100).setBlendMode(Phaser.BlendModes.ADD);
    scene.addSolid(this.x, this.y - 4, 22, 8);
    if (b.built) this.standby();
  }

  /** A layer laid: the head jumps along the rail, the nozzle flares, sparks fall on the bed. */
  pulse() {
    if (this.done) return;
    this.headTo = (Math.random() - 0.5) * 22;
    this.flashUntil = this.scene.time.now + 260;
    this.frame.setFrame(1);
    this.head.setFrame(1);
    this.scene.fx.sparks(this.x + this.headX, this.y - 9, PALETTE[11], 3);
  }

  /** The building is finished: a bright swell, then standby. */
  finish() {
    if (this.done) return;
    this.scene.fx.sparks(this.x, this.y - 14, PALETTE[11], 16);
    this.scene.tweens.add({ targets: this.light, intensity: 1.2, radius: 90, duration: 500, yoyo: true, onComplete: () => this.standby() });
    this.done = true;
    this.thread.clear();
  }

  private standby() {
    this.done = true;
    this.frame.setFrame(0);
    this.head.setFrame(0);
    this.light.intensity = 0.25;
    this.light.radius = 30;
    this.glow.setAlpha(0.06);
    this.thread.clear();
  }

  update(time: number, dt: number) {
    this.t += dt / 1000;
    if (this.done) { this.head.x = this.x + this.headX; return; }
    // the head glides to its next spot, and wanders the rail on its own while it waits
    if (Math.abs(this.headTo - this.headX) < 0.5 && time > this.flashUntil + 900) this.headTo = Math.sin(this.t * 0.7) * 9;
    this.headX += (this.headTo - this.headX) * Math.min(1, dt / 120);
    this.head.x = Math.round(this.x + this.headX);
    if (time > this.flashUntil && this.frame.frame.name !== '0') { this.frame.setFrame(0); this.head.setFrame(0); }
    // the call for hands: bed and light breathe, a thread of light runs from the nozzle to the unfinished rows
    const breath = 0.5 + 0.5 * Math.sin(this.t * 2.4);
    this.light.intensity = 0.45 + 0.4 * breath;
    this.glow.setAlpha(0.1 + 0.14 * breath);
    const b = this.b;
    const tx = b.x + Math.sin(this.t * 1.3) * b.w * 5, ty = b.y - 6 - Math.abs(Math.sin(this.t * 0.9)) * b.h * 6;
    const hx = this.head.x, hy = this.y - 12;
    this.thread.clear();
    this.thread.lineStyle(1, PALETTE[10], 0.18 + 0.3 * breath).lineBetween(hx, hy, tx, ty);
    this.thread.fillStyle(PALETTE[11], 0.5 + 0.4 * breath).fillRect(Math.round(tx) - 1, Math.round(ty) - 1, 2, 2);
  }
}
