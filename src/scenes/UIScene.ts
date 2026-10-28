// Screen-space layer: the Ember counter and the store's (iron, hydrogen, salt, quartz, copper), landing title card, the talk box, and touch controls.
import Phaser from 'phaser';
import { PALETTE } from '../core/data';
import { isKid, session } from '../core/session';
import { onPress, touch } from '../input/Controls';
import { sound } from '../audio/Sound';
import { TalkBox } from '../ui/dialogue';

/** scenes that open over the world with their own buttons */
const MENUS = ['starmap', 'designs', 'vault'];

const STICK_RADIUS = 26;

export class UIScene extends Phaser.Scene {
  private counter!: Phaser.GameObjects.Container;
  private counterText!: Phaser.GameObjects.BitmapText;
  private counterFade?: Phaser.Time.TimerEvent;
  private sparkCounter!: Phaser.GameObjects.Container;
  /** the store's counters (n: the count shown) */
  private stock: Record<string, { c: Phaser.GameObjects.Container; text: Phaser.GameObjects.BitmapText; n: number }> = {};
  private sparkText!: Phaser.GameObjects.BitmapText;
  private location?: Phaser.GameObjects.Container;
  private stickBase!: Phaser.GameObjects.Arc;
  private stickKnob!: Phaser.GameObjects.Arc;
  private actionBtn!: Phaser.GameObjects.Container;
  private stickPointer: number | null = null;
  private stickOrigin = new Phaser.Math.Vector2();
  private touchUi!: Phaser.GameObjects.Container;
  private swipes = new Map<number, { x: number; y: number; t: number; done: boolean }>();
  /** the talk box (PlanetScene opens it, routes the buttons to it and closes it) */
  talkBox!: TalkBox;
  private talking = false;
  /** touch: a small round talk button beside the action button, while a copy is in range */
  private talkBtn!: Phaser.GameObjects.Container;
  private talkBtnCore!: Phaser.GameObjects.Arc;
  private talkTarget: number | null = null;

  constructor() { super('ui'); }

  create() {
    const { width, height } = this.scale;

    // Ember counter: icon + number, fades when idle
    const icon = this.add.image(0, 0, 'shard').setOrigin(0, 0);
    this.counterText = this.add.bitmapText(15, 5, 'pixel', '0');
    this.counter = this.add.container(6, 4, [icon, this.counterText]).setAlpha(0.35);
    // Kid mode: no numbers on screen; collected embers still float up and fill the shared base
    this.counter.setVisible(!isKid());

    // Iron and hydrogen (the materials of a husk), salt, quartz and copper (the Cems' designs) in this world's store,
    // beside the Embers
    const tints: Record<string, number> = { iron: 20, hydrogen: 29, salt: 2, quartz: 28, copper: 9 };
    for (const [i, kind] of (['iron', 'hydrogen', 'salt', 'quartz', 'copper'] as const).entries()) {
      const text = this.add.bitmapText(15, 5, 'pixel', '0').setTint(PALETTE[tints[kind]]);
      const c = this.add.container(44 + i * 38, 4, [this.add.image(0, 0, kind).setOrigin(0, 0), text]).setAlpha(0.35).setVisible(!isKid());
      this.stock[kind] = { c, text, n: -1 };
    }
    this.onSupplies((this.scene.get('planet') as unknown as { supplies?: Record<string, number> }).supplies ?? {}, true);
    this.game.events.on('supplies', this.onSupplies, this);

    // Sparks (rare): a white star next to the rest, only once the family has one
    const sparkIcon = this.add.image(0, 0, 'spark', 0).setOrigin(0, 0).setScale(0.75);
    this.sparkText = this.add.bitmapText(14, 5, 'pixel', '0').setTint(PALETTE[18]);
    this.sparkCounter = this.add.container(234, 3, [sparkIcon, this.sparkText]).setAlpha(0.6).setVisible(false);
    this.onSparks(session.replicant?.traits.sparks ?? 0, true);
    this.game.events.on('sparks', this.onSparks, this);

    this.game.events.on('embers', this.onEmbers, this);
    this.counterText.setText(String((this.scene.get('planet') as unknown as { embers: number }).embers ?? 0));
    this.game.events.on('titlecard', this.titleCard, this);
    this.game.events.on('location', this.showLocation, this);
    this.game.events.on('notice', this.notice, this);
    this.game.events.on('perf', this.perf, this);
    this.game.events.on('talkable', this.onTalkable, this);
    (this.scene.get('planet') as unknown as { announceLocation?: () => void }).announceLocation?.(); // the planet announced before this layer existed
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off('embers', this.onEmbers, this);
      this.game.events.off('sparks', this.onSparks, this);
      this.game.events.off('supplies', this.onSupplies, this);
      this.game.events.off('titlecard', this.titleCard, this);
      this.game.events.off('location', this.showLocation, this);
      this.game.events.off('notice', this.notice, this);
      this.game.events.off('perf', this.perf, this);
      this.game.events.off('talkable', this.onTalkable, this);
    });
    this.talkBox = new TalkBox(this);
    this.talking = false;
    this.talkTarget = null;

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
    // talk: a speech mark in the copy's visor color, up and left of the action button
    const talkRing = this.add.circle(0, 0, 13, PALETTE[24], 0.45).setStrokeStyle(1, PALETTE[21], 0.7);
    this.talkBtnCore = this.add.circle(0, 0, 9, PALETTE[10], 0.3);
    const talkGlyph = this.add.image(0, 1, 'talkhint');
    this.talkBtn = this.add.container(bx - 46, by - 24, [talkRing, this.talkBtnCore, talkGlyph]).setVisible(false);
    this.touchUi = this.add.container(0, 0, [hint, this.actionBtn, this.talkBtn]);
    this.touchUi.setVisible(this.sys.game.device.input.touch);
    const onTalkBtn = (p: Phaser.Input.Pointer) => this.talkBtn.visible && this.touchUi.visible && Math.hypot(p.x - this.talkBtn.x, p.y - this.talkBtn.y) < 17;

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
    onPress(this, ['M'], toggleSound);
    const onSpeaker = (p: Phaser.Input.Pointer) => p.x > width - 26 && p.y < 22;

    if (new URLSearchParams(location.search).has('fps')) {
      const fps = this.add.bitmapText(width - 40, 6, 'pixel', '').setTint(PALETTE[11]);
      this.time.addEvent({ delay: 500, loop: true, callback: () => fps.setText(String(Math.round(this.game.loop.actualFps))) });
    }

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (onSpeaker(p)) { toggleSound(); return; }
      // a menu over the world (the star map, the designs, the husk vault) takes its own taps and clicks: they must not
      // also swing or interact in the world once it closes
      if (MENUS.some((k) => this.scene.isActive(k))) return;
      // the talk box is open: a tap or a click turns the page (or taps REPLY), nothing else
      if (this.talking) {
        if (this.talkBox.hitReply(p.x, p.y)) touch.replyQueued = true;
        else if (!p.wasTouch && p.button === 2) touch.interactQueued = true;
        else touch.actionQueued = true;
        return;
      }
      // Mouse: left click attacks / interacts, right click talks to the copy beside you; either one on a copy talks to it
      if (!p.wasTouch) {
        // a touchscreen laptop shows the touch talk button: a click on it talks too
        if (onTalkBtn(p)) {
          touch.interactQueued = true;
          this.tweens.add({ targets: this.talkBtn, scale: { from: 0.8, to: 1 }, duration: 140, ease: 'Back.easeOut' });
          return;
        }
        if (p.button === 0) touch.actionQueued = true;
        else if (p.button === 2) touch.interactQueued = true;
        else return;
        touch.click = { x: p.x, y: p.y };
        return;
      }
      touch.active = true;
      this.touchUi.setVisible(true);
      this.talkBox.replyLabel = 'REPLY';
      if (onTalkBtn(p)) {
        touch.interactQueued = true;
        this.tweens.add({ targets: this.talkBtn, scale: { from: 0.8, to: 1 }, duration: 140, ease: 'Back.easeOut' });
        return;
      }
      // a tap on the corner label (place and who lives here) opens the journal
      if (p.x < 130 && p.y > 14 && p.y < 70) { this.game.events.emit('journal'); return; }
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

  update(time: number, dt: number) {
    this.talkBox.update(time, dt);
  }

  /** The talk box opened or closed: taps turn its pages, the touch controls step aside. */
  setTalking(on: boolean) {
    this.talking = on;
    if (on) { this.stickPointer = null; touch.x = 0; touch.y = 0; this.stickBase.setVisible(false); this.stickKnob.setVisible(false); this.swipes.clear(); }
    this.tweens.add({ targets: this.touchUi, alpha: on ? 0 : 1, duration: 160 });
    this.onTalkable(on ? null : this.talkTarget, true);
  }

  /** A copy came into talking range (its visor color), or none is (null): the touch talk button shows or hides. */
  private onTalkable(color: number | null, keep = false) {
    if (!keep) this.talkTarget = color;
    const show = color !== null && !this.talking;
    if (show) { this.talkBtnCore.setFillStyle(color, 0.35); (this.talkBtn.list[2] as Phaser.GameObjects.Image).setTint(color); }
    if (show === this.talkBtn.visible) return;
    this.talkBtn.setVisible(show);
    if (show) this.tweens.add({ targets: this.talkBtn, scale: { from: 0.6, to: 1 }, alpha: { from: 0, to: 1 }, duration: 160, ease: 'Back.easeOut' });
  }

  private onEmbers(n: number, quiet = false) {
    this.counterText.setText(String(n));
    if (quiet) return;
    this.counter.setAlpha(1);
    this.tweens.add({ targets: this.counter, scale: { from: 1.25, to: 1 }, duration: 160, ease: 'Back.easeOut' });
    this.counterFade?.remove();
    this.counterFade = this.time.delayedCall(2500, () => this.tweens.add({ targets: this.counter, alpha: 0.35, duration: 600 }));
  }

  /** The world's store changed: a counter lights up when its material did. */
  private onSupplies(supplies: Record<string, number>, quiet = false) {
    for (const [kind, st] of Object.entries(this.stock)) {
      const n = Math.floor(supplies[kind] ?? 0);
      if (n === st.n) continue;
      const first = st.n < 0;
      st.n = n;
      st.text.setText(String(n));
      if (quiet || first) continue;
      st.c.setAlpha(1);
      this.tweens.killTweensOf(st.c);
      this.tweens.add({ targets: st.c, scale: { from: 1.25, to: 1 }, duration: 160, ease: 'Back.easeOut' });
      this.tweens.add({ targets: st.c, alpha: 0.35, delay: 2500, duration: 600 });
    }
  }

  private onSparks(n: number, quiet = false) {
    this.sparkText.setText(String(n));
    this.sparkCounter.setVisible(n > 0 && !isKid());
    if (quiet) return;
    this.sparkCounter.setAlpha(1);
    this.tweens.add({ targets: this.sparkCounter, scale: { from: 1.4, to: 1 }, duration: 220, ease: 'Back.easeOut' });
    this.time.delayedCall(3000, () => this.tweens.add({ targets: this.sparkCounter, alpha: 0.6, duration: 600 }));
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

  /** ?perf: where the planet's load went, bottom left, for a while. */
  private perf(text: string) {
    const t = this.add.bitmapText(7, this.scale.height - 12, 'pixel', text).setTint(PALETTE[21]).setDepth(20);
    this.tweens.add({ targets: t, alpha: 0, delay: 12_000, duration: 800, onComplete: () => t.destroy() });
  }

  /** A short one-line notice ("STEVE GETS +20% DASH") that rises in and fades, lower middle of the screen. */
  private notice(text: string) {
    const { width, height } = this.scale;
    // above the talk box while it is open
    const y = this.talking ? this.talkBox.y - 16 : height * 0.72;
    const label = this.add.bitmapText(width / 2, y + 6, 'pixel', text).setOrigin(0.5).setTint(PALETTE[11]).setAlpha(0).setDepth(20);
    const lineW = label.width / 2 + 8;
    const lines = this.add.graphics().setAlpha(0).setDepth(20);
    lines.fillStyle(PALETTE[9], 1).fillRect(width / 2 - lineW - 14, y + 6, 10, 1).fillRect(width / 2 + lineW + 4, y + 6, 10, 1);
    this.tweens.add({ targets: [label, lines], alpha: 1, y: '-=6', duration: 350, ease: 'Sine.easeOut' });
    this.tweens.add({
      targets: [label, lines], alpha: 0, delay: 2600, duration: 700, ease: 'Sine.easeIn',
      onComplete: () => { label.destroy(); lines.destroy(); },
    });
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
