// Screen-space layer: ember counter, landing title card, and touch controls.
import Phaser from 'phaser';
import { PALETTE } from '../core/data';
import { isKid } from '../core/session';
import { touch } from '../input/Controls';
import { sound } from '../audio/Sound';

const STICK_RADIUS = 26;

export class UIScene extends Phaser.Scene {
  private counter!: Phaser.GameObjects.Container;
  private counterText!: Phaser.GameObjects.BitmapText;
  private counterFade?: Phaser.Time.TimerEvent;
  private location?: Phaser.GameObjects.Container;
  private stickBase!: Phaser.GameObjects.Arc;
  private stickKnob!: Phaser.GameObjects.Arc;
  private actionBtn!: Phaser.GameObjects.Container;
  private stickPointer: number | null = null;
  private stickOrigin = new Phaser.Math.Vector2();
  private touchUi!: Phaser.GameObjects.Container;
  private swipes = new Map<number, { x: number; y: number; t: number; done: boolean }>();

  constructor() { super('ui'); }

  create() {
    const { width, height } = this.scale;

    // Ember counter: icon + number, fades when idle
    const icon = this.add.image(0, 0, 'shard').setOrigin(0, 0);
    this.counterText = this.add.bitmapText(15, 5, 'pixel', '0');
    this.counter = this.add.container(6, 4, [icon, this.counterText]).setAlpha(0.35);
    // Kid mode: no numbers on screen; collected embers still float up and fill the shared base
    this.counter.setVisible(!isKid());

    this.game.events.on('embers', this.onEmbers, this);
    this.counterText.setText(String((this.scene.get('planet') as unknown as { embers: number }).embers ?? 0));
    this.game.events.on('titlecard', this.titleCard, this);
    this.game.events.on('location', this.showLocation, this);
    (this.scene.get('planet') as unknown as { announceLocation?: () => void }).announceLocation?.(); // the planet announced before this layer existed
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off('embers', this.onEmbers, this);
      this.game.events.off('titlecard', this.titleCard, this);
      this.game.events.off('location', this.showLocation, this);
    });

    // Touch controls: floating stick on the left half, big action button on the right
    this.input.addPointer(2);
    this.input.mouse?.disableContextMenu();
    this.stickBase = this.add.circle(0, 0, STICK_RADIUS, PALETTE[24], 0.35).setStrokeStyle(1, PALETTE[21], 0.6).setVisible(false);
    this.stickKnob = this.add.circle(0, 0, 10, PALETTE[20], 0.55).setVisible(false);
    const bx = width - 52, by = height - 52;
    const ring = this.add.circle(0, 0, 28, PALETTE[24], 0.35).setStrokeStyle(2, PALETTE[9], 0.8);
    const core = this.add.circle(0, 0, 18, PALETTE[9], 0.35);
    const glyph = this.add.image(1, 0, 'slash', 1).setScale(0.75).setAlpha(0.9);
    this.actionBtn = this.add.container(bx, by, [ring, core, glyph]);
    const hint = this.add.circle(52, height - 52, STICK_RADIUS, PALETTE[24], 0.25).setStrokeStyle(1, PALETTE[21], 0.4);
    this.touchUi = this.add.container(0, 0, [hint, this.actionBtn]);
    this.touchUi.setVisible(this.sys.game.device.input.touch);

    // Sound toggle: a tiny speaker in the top right corner (M on the keyboard)
    const speaker = this.add.graphics().setPosition(width - 16, 6).setAlpha(0.45);
    const drawSpeaker = () => {
      speaker.clear();
      speaker.fillStyle(PALETTE[20]).fillRect(0, 3, 3, 4).fillTriangle(2, 5, 6, 0, 6, 10);
      if (sound.muted) speaker.fillStyle(PALETTE[8]).fillRect(8, 2, 1, 1).fillRect(9, 3, 1, 1).fillRect(10, 4, 1, 1).fillRect(11, 5, 1, 1).fillRect(12, 6, 1, 1)
        .fillRect(12, 2, 1, 1).fillRect(11, 3, 1, 1).fillRect(9, 5, 1, 1).fillRect(8, 6, 1, 1);
      else speaker.fillStyle(PALETTE[20]).fillRect(8, 3, 1, 4).fillRect(10, 2, 1, 6);
    };
    drawSpeaker();
    const toggleSound = () => { sound.start(); sound.setMuted(!sound.muted); drawSpeaker(); };
    this.input.keyboard?.on('keydown-M', toggleSound);
    const onSpeaker = (p: Phaser.Input.Pointer) => p.x > width - 26 && p.y < 22;

    if (new URLSearchParams(location.search).has('fps')) {
      const fps = this.add.bitmapText(width - 40, 6, 'pixel', '').setTint(PALETTE[11]);
      this.time.addEvent({ delay: 500, loop: true, callback: () => fps.setText(String(Math.round(this.game.loop.actualFps))) });
    }

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (onSpeaker(p)) { toggleSound(); return; }
      // Mouse: left click attacks / interacts, right click dashes
      if (!p.wasTouch) {
        if (p.button === 0) touch.actionQueued = true;
        else if (p.button === 2) { touch.dashQueued = true; touch.dashX = 0; touch.dashY = 0; }
        return;
      }
      touch.active = true;
      this.touchUi.setVisible(true);
      if (p.x < width * 0.45 && this.stickPointer === null) {
        this.stickPointer = p.id;
        this.stickOrigin.set(p.x, p.y);
        this.stickBase.setPosition(p.x, p.y).setVisible(true);
        this.stickKnob.setPosition(p.x, p.y).setVisible(true);
        hint.setVisible(false);
      } else if (p.x >= width * 0.45) {
        touch.actionQueued = true;
        this.swipes.set(p.id, { x: p.x, y: p.y, t: this.time.now, done: false });
        this.tweens.add({ targets: this.actionBtn, scale: { from: 0.85, to: 1 }, duration: 140, ease: 'Back.easeOut' });
      }
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      // Swipe on the action side: dash in the swipe direction
      const sw = this.swipes.get(p.id);
      if (sw && !sw.done && this.time.now - sw.t < 300 && Math.hypot(p.x - sw.x, p.y - sw.y) > 14) {
        sw.done = true;
        const len = Math.hypot(p.x - sw.x, p.y - sw.y);
        touch.dashQueued = true;
        touch.dashX = (p.x - sw.x) / len;
        touch.dashY = (p.y - sw.y) / len;
      }
      if (p.id !== this.stickPointer) return;
      const v = new Phaser.Math.Vector2(p.x - this.stickOrigin.x, p.y - this.stickOrigin.y);
      const len = v.length();
      if (len > STICK_RADIUS) {
        // drag the base along so the stick never "runs out"
        const over = v.clone().normalize().scale(len - STICK_RADIUS);
        this.stickOrigin.add(over);
        this.stickBase.setPosition(this.stickOrigin.x, this.stickOrigin.y);
        v.normalize().scale(STICK_RADIUS);
      }
      this.stickKnob.setPosition(this.stickOrigin.x + v.x, this.stickOrigin.y + v.y);
      const n = v.length() / STICK_RADIUS;
      const dead = 0.18;
      const mag = n < dead ? 0 : Math.min(1, (n - dead) / (1 - dead) * 1.15);
      const dir = v.normalize();
      touch.x = dir.x * mag;
      touch.y = dir.y * mag;
    });
    const release = (p: Phaser.Input.Pointer) => {
      this.swipes.delete(p.id);
      if (p.id !== this.stickPointer) return;
      this.stickPointer = null;
      touch.x = 0; touch.y = 0;
      this.stickBase.setVisible(false);
      this.stickKnob.setVisible(false);
      hint.setVisible(true);
    };
    this.input.on('pointerup', release);
    this.input.on('pointerupoutside', release);
  }

  private onEmbers(n: number, quiet = false) {
    this.counterText.setText(String(n));
    if (quiet) return;
    this.counter.setAlpha(1);
    this.tweens.add({ targets: this.counter, scale: { from: 1.25, to: 1 }, duration: 160, ease: 'Back.easeOut' });
    this.counterFade?.remove();
    this.counterFade = this.time.delayedCall(2500, () => this.tweens.add({ targets: this.counter, alpha: 0.35, duration: 600 }));
  }

  /** Top left, under the counter: "MARS - SOL" and the replicants living here, each in its visor color. */
  private showLocation(place: string, who: { name: string; color: number }[]) {
    this.location?.destroy();
    const y0 = isKid() ? 5 : 19;
    const items: Phaser.GameObjects.GameObject[] = [this.add.bitmapText(0, 0, 'pixel', place).setTint(PALETTE[20])];
    who.slice(0, 7).forEach((w, i) => {
      items.push(this.add.rectangle(1, 11 + i * 9 + 3, 3, 3, w.color).setOrigin(0, 0.5));
      items.push(this.add.bitmapText(7, 11 + i * 9, 'pixel', w.name).setTint(w.color).setAlpha(0.85));
    });
    if (who.length > 7) items.push(this.add.bitmapText(7, 11 + 7 * 9, 'pixel', `+${who.length - 7}`).setTint(PALETTE[21]));
    this.location = this.add.container(7, y0, items).setAlpha(0.6).setDepth(10);
  }

  private titleCard(name: string, subtitle: string) {
    const { width, height } = this.scale;
    const title = this.add.bitmapText(width / 2, height * 0.3, 'pixel', name.split('').join(' ')).setOrigin(0.5).setScale(2).setTint(PALETTE[2]);
    const sub = this.add.bitmapText(width / 2, height * 0.3 + 18, 'pixel', subtitle).setOrigin(0.5).setTint(PALETTE[21]);
    const lineW = title.width / 2 + 6;
    const lines = this.add.graphics();
    lines.fillStyle(PALETTE[9], 1);
    lines.fillRect(width / 2 - lineW - 30, height * 0.3, 24, 1);
    lines.fillRect(width / 2 + lineW + 6, height * 0.3, 24, 1);
    const group = [title, sub, lines];
    group.forEach((o) => o.setAlpha(0));
    this.tweens.add({ targets: group, alpha: 1, duration: 700, ease: 'Sine.easeOut' });
    this.tweens.add({ targets: title, y: title.y - 3, duration: 3200, ease: 'Sine.easeOut' });
    this.tweens.add({
      targets: group, alpha: 0, delay: 2600, duration: 900, ease: 'Sine.easeIn',
      onComplete: () => group.forEach((o) => o.destroy()),
    });
  }
}
