// Unified input: touch (written by UIScene), keyboard and gamepad.
import Phaser from 'phaser';

/** Shared touch state. UIScene writes it, PlanetScene reads it through Controls (the only reader that clears it). */
export const touch = { x: 0, y: 0, actionQueued: false, active: false, dashQueued: false, dashX: 0, dashY: 0, interactQueued: false, replyQueued: false };

export interface InputFrame {
  x: number;       // -1..1
  y: number;       // -1..1
  attack: boolean; // pressed this frame
  dash: boolean;   // pressed this frame
  /** talk to the copy beside you: E, right click, gamepad Y, the touch talk button */
  interact: boolean;
  /** while a talk box is open: previous page (Left / A, d-pad left), next page (Right / D, d-pad right),
   * close (Esc / Tab, gamepad B), reply (R) */
  back: boolean;
  forward: boolean;
  cancel: boolean;
  reply: boolean;
  /** Optional dash direction (touch swipe); otherwise the player uses its move or facing direction */
  dashDir?: { x: number; y: number };
}

const KEYS = {
  attack: ['Space', 'KeyJ', 'Enter', 'KeyZ'],
  dash: ['ShiftLeft', 'ShiftRight', 'KeyK', 'KeyX'],
  interact: ['KeyE'],
  back: ['ArrowLeft', 'KeyA'],
  forward: ['ArrowRight', 'KeyD'],
  cancel: ['Escape'],
  reply: ['KeyR'],
};

export class Controls {
  private keys: Record<string, Phaser.Input.Keyboard.Key> = {};
  private padWasDown = false;
  private padDashWasDown = false;
  private padTalkWasDown = false;
  private padBWasDown = false;
  private padLeftWasDown = false;
  private padRightWasDown = false;
  private queued = { attack: false, dash: false, interact: false, back: false, forward: false, cancel: false, reply: false };
  /**
   * A talk box is open: Tab closes it instead of opening the journal (and I does nothing). Set by PlanetScene.
   * The Key's own 'down' fires before the scene's keydown-TAB handlers, so stopping it there keeps the journal shut.
   */
  modal = false;

  constructor(private scene: Phaser.Scene) {
    const kb = scene.input.keyboard;
    if (kb) {
      this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT') as Record<string, Phaser.Input.Keyboard.Key>;
      // Event based so a quick tap between frames is never lost
      kb.on('keydown', (e: KeyboardEvent) => {
        touch.active = false;
        if (e.repeat) return;
        for (const [k, codes] of Object.entries(KEYS)) if (codes.includes(e.code)) this.queued[k as keyof typeof KEYS] = true;
      });
      for (const name of ['TAB', 'I']) {
        kb.addKey(name, false).on('down', (_k: Phaser.Input.Keyboard.Key, e: KeyboardEvent & { stopImmediatePropagation(): void }) => {
          if (!this.modal) return;
          if (name === 'TAB') this.queued.cancel = true;
          e.stopImmediatePropagation();
        });
      }
      kb.addCapture('SPACE,UP,DOWN,LEFT,RIGHT');
    }
  }

  /** Drops every press still waiting (a talk box just closed: the key that closed it must not also swing). */
  clear() {
    for (const k of Object.keys(this.queued) as (keyof typeof this.queued)[]) this.queued[k] = false;
    touch.actionQueued = false; touch.dashQueued = false; touch.interactQueued = false; touch.replyQueued = false;
  }

  read(): InputFrame {
    let x = 0, y = 0;
    const q = this.queued;
    const f: InputFrame = { x: 0, y: 0, attack: q.attack, dash: q.dash, interact: q.interact, back: q.back, forward: q.forward, cancel: q.cancel, reply: q.reply };
    for (const k of Object.keys(q) as (keyof typeof q)[]) q[k] = false;
    const k = this.keys;
    if (k.A?.isDown || k.LEFT?.isDown) x -= 1;
    if (k.D?.isDown || k.RIGHT?.isDown) x += 1;
    if (k.W?.isDown || k.UP?.isDown) y -= 1;
    if (k.S?.isDown || k.DOWN?.isDown) y += 1;

    const pad = this.scene.input.gamepad?.pad1;
    if (pad) {
      const sx = pad.leftStick.x, sy = pad.leftStick.y;
      if (Math.hypot(sx, sy) > 0.2) { x += sx; y += sy; }
      if (pad.left) x -= 1;
      if (pad.right) x += 1;
      if (pad.up) y -= 1;
      if (pad.down) y += 1;
      const down = pad.A || pad.X || pad.R1 > 0.5;
      if (down && !this.padWasDown) f.attack = true;
      this.padWasDown = down;
      const dashDown = pad.B || pad.L1 > 0.5 || pad.R2 > 0.5;
      if (dashDown && !this.padDashWasDown) f.dash = true;
      this.padDashWasDown = dashDown;
      if (pad.B && !this.padBWasDown) f.cancel = true;
      this.padBWasDown = pad.B;
      if (pad.Y && !this.padTalkWasDown) f.interact = true;
      this.padTalkWasDown = pad.Y;
      if (pad.left && !this.padLeftWasDown) f.back = true;
      this.padLeftWasDown = pad.left;
      if (pad.right && !this.padRightWasDown) f.forward = true;
      this.padRightWasDown = pad.right;
    }

    if (touch.x || touch.y) { x += touch.x; y += touch.y; }
    if (touch.actionQueued) { f.attack = true; touch.actionQueued = false; }
    if (touch.interactQueued) { f.interact = true; touch.interactQueued = false; }
    if (touch.replyQueued) { f.reply = true; touch.replyQueued = false; }
    if (touch.dashQueued) {
      f.dash = true;
      touch.dashQueued = false;
      if (touch.dashX || touch.dashY) f.dashDir = { x: touch.dashX, y: touch.dashY };
    }

    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    f.x = x; f.y = y;
    return f;
  }
}
