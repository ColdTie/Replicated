// Unified input: touch (written by UIScene), keyboard and gamepad.
import Phaser from 'phaser';

/** Shared touch state. UIScene writes it, PlanetScene reads it through Controls. */
export const touch = { x: 0, y: 0, actionQueued: false, active: false };

export interface InputFrame {
  x: number;       // -1..1
  y: number;       // -1..1
  attack: boolean; // pressed this frame
}

export class Controls {
  private keys: Record<string, Phaser.Input.Keyboard.Key> = {};
  private padWasDown = false;
  private attackQueued = false;

  constructor(private scene: Phaser.Scene) {
    const kb = scene.input.keyboard;
    if (kb) {
      this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT') as Record<string, Phaser.Input.Keyboard.Key>;
      // Event based so a quick tap between frames is never lost
      kb.on('keydown', (e: KeyboardEvent) => {
        touch.active = false;
        if (!e.repeat && ['Space', 'KeyJ', 'Enter', 'KeyZ'].includes(e.code)) this.attackQueued = true;
      });
      kb.addCapture('SPACE,UP,DOWN,LEFT,RIGHT');
    }
  }

  read(): InputFrame {
    let x = 0, y = 0, attack = false;
    const k = this.keys;
    if (k.A?.isDown || k.LEFT?.isDown) x -= 1;
    if (k.D?.isDown || k.RIGHT?.isDown) x += 1;
    if (k.W?.isDown || k.UP?.isDown) y -= 1;
    if (k.S?.isDown || k.DOWN?.isDown) y += 1;
    if (this.attackQueued) { attack = true; this.attackQueued = false; }

    const pad = this.scene.input.gamepad?.pad1;
    if (pad) {
      const sx = pad.leftStick.x, sy = pad.leftStick.y;
      if (Math.hypot(sx, sy) > 0.2) { x += sx; y += sy; }
      if (pad.left) x -= 1;
      if (pad.right) x += 1;
      if (pad.up) y -= 1;
      if (pad.down) y += 1;
      const down = pad.A || pad.B || pad.X || pad.R1 > 0.5;
      if (down && !this.padWasDown) attack = true;
      this.padWasDown = down;
    }

    if (touch.x || touch.y) { x += touch.x; y += touch.y; }
    if (touch.actionQueued) { attack = true; touch.actionQueued = false; }

    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    return { x, y, attack };
  }
}
