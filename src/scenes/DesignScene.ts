// The design menu (story/STORY.md: you pick a design and the Cems build it on command; src/data/designs.json). Opens
// over the paused planet from the Printworks' door (src/entities/Bioworks.ts). Left: every design, what it is, and
// whether it can be printed now (READY), wants more of something (NEED), waits for another building (LOCKED), or how
// many stand here. Right: the chosen design turning in 3D (drag it to turn it yourself), its complexity, volume and
// print time, what it gives, and its price, each material with what the store holds. Up / Down (W / S, the stick)
// choose, attack / E / Enter prints, Esc or the X in the corner closes; a click or tap on a row chooses it and on PRINT
// prints. The words are laid out from the foot of the panel up, and the model fills the room left above them.
import Phaser from 'phaser';
import { sound } from '../audio/Sound';
import { PALETTE } from '../core/data';
import { CAT, DESIGNS, designModel, paintTexture, turntableView } from '../core/designs';
import { Controls, onPress } from '../input/Controls';
import { turntableSize, type Model } from '../world/voxel';
import type { PlanetScene } from './PlanetScene';

const ICON: Record<string, number> = { salt: 8, iron: 13, quartz: 15, copper: 16, wood: 2, ember: 6, hydrogen: 14 };
const LIST_X = 14, LIST_Y = 38, ROW_H = 24, INFO_X = 200, INFO_W = 270, PREV_Y = 14;
/** rows shown at once; a longer list scrolls to keep the chosen row in view, with a mark at the end that goes on */
const LIST_ROWS = 9;
/** the price row and the PRINT button sit at the foot of the panel; the words end just above them */
const PRICE_Y = 226, PRINT_Y = 242, TEXT_END = PRICE_Y - 4, MIN_PREVIEW = 64;
const TIERS = CAT.costing.tiers.map((t) => t.name);

type Row = { id: string; m: Model; why: string | null; built: number };

/** "55 SEC", "1 MIN 46 SEC" */
export function printTime(ms: number) {
  const s = Math.max(1, Math.round(ms / 1000)), m = Math.floor(s / 60);
  return m ? `${m} MIN${s % 60 ? ` ${s % 60} SEC` : ''}` : `${s} SEC`;
}

export class DesignScene extends Phaser.Scene {
  host!: PlanetScene;
  private controls!: Controls;
  private rows: Row[] = [];
  private index = 0;
  private list!: Phaser.GameObjects.Container;
  private info!: Phaser.GameObjects.Container;
  private preview!: Phaser.GameObjects.Image;
  private yaw = 0.6;
  /** the room the model turns in (above the words), and what the stage under it was last drawn for */
  private box = { top: PREV_Y, height: 120 };
  private stage!: Phaser.GameObjects.Graphics;
  private stageGlow!: Phaser.GameObjects.Image;
  private stageFor = '';
  private drag: { x: number; yaw: number } | null = null;
  private frame = 0;
  private busy = false;
  private stickHeld = false;
  private why?: Phaser.GameObjects.BitmapText;

  constructor() { super('designs'); }

  init(d: { host: PlanetScene }) {
    this.host = d.host;
    this.rows = []; this.index = 0; this.busy = false; this.stickHeld = false; this.drag = null; this.yaw = 0.6; this.stageFor = '';
  }

  create() {
    const { width: w, height: h } = this.scale;
    // the world stays behind, dimmed
    this.add.rectangle(0, 0, w, h, PALETTE[25], 0.8).setOrigin(0);
    const g = this.add.graphics();
    g.fillStyle(PALETTE[24], 0.92).fillRect(8, 8, 184, h - 16).lineStyle(1, PALETTE[23], 1).strokeRect(8.5, 8.5, 184, h - 17);
    g.fillStyle(PALETTE[24], 0.92).fillRect(INFO_X - 4, 8, INFO_W + 6, h - 16).lineStyle(1, PALETTE[23], 1).strokeRect(INFO_X - 3.5, 8.5, INFO_W + 6, h - 17);
    // the stage the design turns on (a ring of the Cems' light under its floor, faint lines rising), drawn per design
    this.stage = this.add.graphics();
    this.stageGlow = this.add.image(INFO_X + INFO_W / 2, 0, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(PALETTE[12]).setAlpha(0.25);
    this.preview = this.add.image(INFO_X + INFO_W / 2, PREV_Y, '__WHITE');
    this.add.bitmapText(LIST_X, 16, 'pixel', 'DESIGNS').setTint(PALETTE[12]);
    this.add.bitmapText(LIST_X, 26, 'pixel', 'YOU CHOOSE, THE CEMS BUILD').setTint(PALETTE[22]);
    this.list = this.add.container(0, 0);
    this.info = this.add.container(0, 0);
    this.controls = new Controls(this);
    this.controls.modal = true;
    this.buildRows();
    const ready = this.rows.findIndex((r) => !r.why);
    this.index = ready >= 0 ? ready : Math.max(0, this.rows.findIndex((r) => !r.why?.startsWith('NEEDS')));
    this.drawList();
    this.drawInfo();
    // a key moves one row on its press; the held key also reads as the stick, so that counts as held (no second row)
    for (const [key, d] of [['UP', -1], ['W', -1], ['DOWN', 1], ['S', 1]] as const) onPress(this, [key], () => { this.move(d); this.stickHeld = true; });
    for (const [key, d] of [['LEFT', -1], ['A', -1], ['RIGHT', 1], ['D', 1]] as const) onPress(this, [key], () => { this.yaw += d * 0.6; });
    // the wheel walks the list
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => { if (dy) this.move(Math.sign(dy)); });
    // drag the model to turn it
    const zone = this.add.zone(INFO_X, PREV_Y, INFO_W, TEXT_END - 60 - PREV_Y).setOrigin(0).setInteractive({ useHandCursor: true });
    zone.on('pointerdown', (p: Phaser.Input.Pointer) => { this.drag = { x: p.x, yaw: this.yaw }; });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => { if (this.drag && p.isDown) this.yaw = this.drag.yaw + (p.x - this.drag.x) * 0.03; });
    this.input.on('pointerup', () => { this.drag = null; });
    // close (X), top right, the same as the star map's (a phone has no Esc)
    const xg = this.add.graphics();
    xg.lineStyle(2, PALETTE[20], 0.9).lineBetween(-4, -4, 4, 4).lineBetween(-4, 4, 4, -4);
    this.add.container(INFO_X + INFO_W - 10, PREV_Y + 6, [this.add.circle(0, 0, 9, PALETTE[24], 0.85).setStrokeStyle(1, PALETTE[22]), xg])
      .setSize(22, 22).setInteractive({ useHandCursor: true }).on('pointerdown', () => this.close());
    this.cameras.main.fadeIn(220, 11, 10, 22);
    (window as unknown as { __designs: DesignScene }).__designs = this;
  }

  private buildRows() {
    const b = this.host.buildings, built = b.designsBuilt();
    this.rows = DESIGNS.map((d) => ({ id: d.id, m: designModel(d.id)!, why: b.whyNot(d.id), built: built.get(d.id) ?? 0 }));
  }

  private drawList() {
    this.list.removeAll(true);
    const add = <T extends Phaser.GameObjects.GameObject>(o: T) => { this.list.add(o); return o; };
    const top = Phaser.Math.Clamp(this.index - Math.floor(LIST_ROWS / 2), 0, Math.max(0, this.rows.length - LIST_ROWS));
    // more above or below: a small arrow at that end of the list
    if (top > 0) add(this.add.triangle(LIST_X + 166, LIST_Y - 7, 0, 3, 3, 0, 6, 3, PALETTE[22]));
    if (top + LIST_ROWS < this.rows.length) add(this.add.triangle(LIST_X + 166, LIST_Y + LIST_ROWS * ROW_H - 2, 0, 0, 6, 0, 3, 3, PALETTE[22]));
    this.rows.forEach((r, i) => {
      if (i < top || i >= top + LIST_ROWS) return;
      const y = LIST_Y + (i - top) * ROW_H, on = i === this.index;
      const locked = !!r.why?.startsWith('NEEDS');
      const bg = add(this.add.rectangle(LIST_X - 4, y - 3, 176, ROW_H - 2, on ? PALETTE[23] : PALETTE[24], on ? 1 : 0.5).setOrigin(0, 0).setStrokeStyle(1, on ? PALETTE[12] : PALETTE[23], on ? 1 : 0.5));
      bg.setInteractive({ useHandCursor: true }).on('pointerdown', () => { if (this.busy) return; if (this.index === i) this.print(); else { this.index = i; sound.designMove(i); this.refresh(); } });
      add(this.add.bitmapText(LIST_X, y, 'pixel', r.m.def.name.toUpperCase()).setTint(locked ? PALETTE[22] : on ? PALETTE[19] : PALETTE[20]));
      // complexity as five pips
      const tier = TIERS.indexOf(r.m.tier);
      for (let k = 0; k < TIERS.length; k++) add(this.add.rectangle(LIST_X + k * 5, y + 12, 3, 3, k <= tier ? (locked ? PALETTE[22] : PALETTE[12]) : on ? PALETTE[22] : PALETTE[23]).setOrigin(0));
      add(this.add.bitmapText(LIST_X + 28, y + 10, 'pixel', r.m.tier).setTint(PALETTE[22]));
      const [word, tint] = locked ? ['LOCKED', 22] : !r.why ? ['READY', 12] : r.why.startsWith('NEED MORE') ? ['NEED', 29] : ['WAIT', 21];
      add(this.add.bitmapText(LIST_X + 168, y, 'pixel', word).setOrigin(1, 0).setTint(PALETTE[tint]));
      if (r.built) add(this.add.bitmapText(LIST_X + 168, y + 10, 'pixel', `x${r.built}`).setOrigin(1, 0).setTint(PALETTE[10]));
    });
  }

  private drawInfo() {
    this.info.removeAll(true);
    const r = this.rows[this.index];
    if (!r) return;
    const add = <T extends Phaser.GameObjects.GameObject>(o: T) => { this.info.add(o); return o; };
    const m = r.m, x = INFO_X + 4, right = INFO_X + INFO_W - 4;
    // the words, measured once wrapped, end just above the price; the model gets the room above them
    const name = add(this.add.bitmapText(x, 0, 'pixel', m.def.name.toUpperCase()).setTint(PALETTE[19]));
    const tier = add(this.add.bitmapText(right, 0, 'pixel', `${m.tier}  COMPLEXITY ${m.complexity}`).setOrigin(1, 0).setTint(PALETTE[12]));
    const volume = add(this.add.bitmapText(x, 0, 'pixel', `VOLUME ${m.volume}`).setTint(PALETTE[21]));
    const time = add(this.add.bitmapText(right, 0, 'pixel', `PRINT ${printTime(this.host.buildings.printMsFor(r.id))}`).setOrigin(1, 0).setTint(PALETTE[21]));
    const gives = add(this.add.bitmapText(x, 0, 'pixel', m.def.gives).setTint(PALETTE[11]).setMaxWidth(INFO_W - 8));
    const about = add(this.add.bitmapText(x, 0, 'prose', m.def.about).setTint(PALETTE[20]).setMaxWidth(INFO_W - 8));
    let y = Math.max(PREV_Y + MIN_PREVIEW + 4, TEXT_END - (12 + 12 + gives.height + 4 + about.height));
    this.box = { top: PREV_Y, height: y - 4 - PREV_Y };
    name.setY(y); tier.setY(y); y += 12;
    volume.setY(y); time.setY(y); y += 12;
    gives.setY(y); y += gives.height + 4;
    about.setY(y);
    // the price: each material, what the store holds of what it needs
    y = PRICE_Y;
    const entries = Object.entries(m.cost);
    const step = Math.min(46, (INFO_W - 4) / Math.max(1, entries.length));
    entries.forEach(([k, n], i) => {
      const have = k === 'ember' ? this.host.embers : Math.floor(this.host.supplies[k] ?? 0);
      const ex = x + i * step;
      add(this.add.image(ex + 4, y + 4, 'supplies', ICON[k] ?? 0));
      add(this.add.bitmapText(ex + 10, y, 'pixel', `${Math.min(have, n)}/${n}`).setTint(PALETTE[have >= n ? 12 : 29]));
    });
    // print, or why not
    y = PRINT_Y;
    if (!r.why) {
      const btn = add(this.add.rectangle(INFO_X + INFO_W / 2, y + 4, 90, 14, PALETTE[14], 1).setStrokeStyle(1, PALETTE[12], 1));
      btn.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.print());
      add(this.add.bitmapText(INFO_X + INFO_W / 2, y + 1, 'pixel', 'PRINT').setOrigin(0.5, 0).setTint(PALETTE[19]));
      this.tweens.add({ targets: btn, alpha: { from: 1, to: 0.6 }, duration: 700, yoyo: true, repeat: -1 });
    } else {
      this.why = add(this.add.bitmapText(INFO_X + INFO_W / 2, y + 1, 'pixel', r.why).setOrigin(0.5, 0).setTint(PALETTE[r.why.startsWith('NEED MORE') ? 29 : 22]));
    }
  }

  private refresh() { this.drawList(); this.drawInfo(); this.frame = 0; }

  private move(d: number) {
    if (this.busy || !this.rows.length) return;
    this.index = (this.index + d + this.rows.length) % this.rows.length;
    sound.designMove(this.index);
    this.refresh();
  }

  /** The chosen design goes to the Cems, or the menu says why it cannot. */
  print() {
    const r = this.rows[this.index];
    if (!r || this.busy) return;
    if (r.why) {
      sound.denied();
      if (this.why) this.tweens.add({ targets: this.why, x: this.why.x + 3, duration: 50, yoyo: true, repeat: 2 });
      return;
    }
    this.busy = true;
    sound.designPrint();
    this.cameras.main.fadeOut(260, 11, 10, 22);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      const s = this.host;
      this.scene.stop();
      s.controls.clear();
      s.bioworks?.closed();
      const b = s.buildings.print(r.id);
      if (b) s.bioworks?.showPrint(b);
    });
  }

  private close() {
    if (this.busy) return;
    this.busy = true;
    sound.menuMove(0);
    this.cameras.main.fadeOut(200, 11, 10, 22);
    // (a press still waiting must not swing in the world the moment the menu is gone)
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => { const s = this.host; this.scene.stop(); s.controls.clear(); s.bioworks?.closed(); });
  }

  update(_time: number, dt: number) {
    const f = this.controls.read();
    if (!this.busy) {
      if (Math.abs(f.y) > 0.6) { if (!this.stickHeld) this.move(Math.sign(f.y)); this.stickHeld = true; } else if (Math.abs(f.y) < 0.3) this.stickHeld = false;
      if (f.cancel) this.close();
      else if ((f.attack || f.interact) && !f.click) this.print();
    }
    if (!this.drag) this.yaw += (CAT.view.turntableSpeed * Math.PI / 180) * (dt / 1000);
    // the turntable: redrawn every other frame
    if (this.frame++ % 2) return;
    const r = this.rows[this.index];
    if (!r) return;
    const R = Math.hypot(r.m.w, r.m.d), p = (CAT.view.turntablePitch * Math.PI) / 180, box = this.box;
    const ppv = Math.min(6, (INFO_W - 24) / R, (box.height - 8) / (R * Math.sin(p) + r.m.h * Math.cos(p)));
    const img = turntableView(r.m, this.yaw, ppv, turntableSize(r.m, CAT.view.turntablePitch, ppv));
    // the whole turning model stays inside its room, centered in it
    const cx = INFO_X + INFO_W / 2, cy = box.top + box.height / 2;
    this.preview.setTexture(paintTexture(this, `design-preview:${r.id}`, img)).setPosition(cx, Math.round(cy));
    const floor = Math.round(cy - img.height / 2 + img.toImage(r.m.w / 2, r.m.d / 2, 0).y);
    this.drawStage(`${r.id}:${ppv}:${box.height}`, cx, floor, R * ppv);
  }

  /** The stage under the model: faint lines rising in its room, and a ring of the Cems' light where its floor is. */
  private drawStage(key: string, cx: number, floor: number, span: number) {
    if (key === this.stageFor) return;
    this.stageFor = key;
    const g = this.stage.clear(), box = this.box;
    for (let y = box.top + 8; y < box.top + box.height - 2; y += 14) g.lineStyle(1, PALETTE[15], 0.5).lineBetween(INFO_X + 6, y, INFO_X + INFO_W - 6, y);
    const w = Math.min(INFO_W - 16, span + 36), h = w * 0.15;
    g.lineStyle(1, PALETTE[13], 0.8).strokeEllipse(cx, floor, w, h).lineStyle(1, PALETTE[12], 0.35).strokeEllipse(cx, floor, w * 0.8, h * 0.72);
    g.fillStyle(PALETTE[14], 0.35).fillEllipse(cx, floor, w * 0.77, h * 0.64);
    this.stageGlow.setPosition(cx, floor).setScale(w / 94, h / 63);
  }
}
