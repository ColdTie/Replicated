// The husk vault (story/STORY.md; manny.json): a small underground room under the bunker in the town square where
// your husks are stored. Opens over the paused planet when you go down its steps. Pods line the back wall, one per
// husk you own (this world's stands in its pod, those on other worlds show as cold holograms of the same body), and a
// menu beside them lists every husk: pick one to link into it (src/scenes/planet/Link.ts), build this world's husk
// from its iron and hydrogen, go back to your own body, or go up. Up / Down (W / S, the stick) move, attack / E /
// Enter pick, Esc goes up; a click or tap on a row picks it.
import Phaser from 'phaser';
import { sound } from '../audio/Sound';
import { anim } from '../core/assets';
import { MANNY, PALETTE } from '../core/data';
import { inManny, mannyWorlds, worldKey } from '../core/mannies';
import { session } from '../core/session';
import { COST, STANDBY } from '../entities/Manny';
import { Lighting, type Light } from '../fx/Lighting';
import { makeVignette } from '../fx/textures';
import { Controls } from '../input/Controls';
import { distanceLy, planetFor, starById } from '../world/galaxy';
import { DEPTH, type PlanetScene } from './PlanetScene';

type Row = { kind: 'husk' | 'build' | 'body' | 'up'; label: string; sub: string; star?: string; planet?: number; enabled: boolean; here?: boolean };
const ICON: Record<string, number> = { iron: 13, hydrogen: 14 };
const POD_W = 30, POD_Y = 150, MENU_X = 300, ROW_H = 26;

export class VaultScene extends Phaser.Scene {
  host!: PlanetScene;
  private controls!: Controls;
  private lighting!: Lighting;
  private rows: Row[] = [];
  private index = 0;
  private menu!: Phaser.GameObjects.Container;
  private pods: { x: number; body?: Phaser.GameObjects.Sprite; light: Light; glass: Phaser.GameObjects.Rectangle }[] = [];
  private busy = false;
  private stickHeld = false;
  private t = 0;

  constructor() { super('vault'); }

  init(d: { host: PlanetScene }) {
    this.host = d.host;
    this.rows = []; this.index = 0; this.pods = []; this.busy = false; this.stickHeld = false;
  }

  create() {
    const { width: w, height: h } = this.scale;
    this.cameras.main.setBackgroundColor(PALETTE[25]);
    this.lighting = new Lighting(this, 0x585d7e, DEPTH.dark);
    this.controls = new Controls(this);
    this.controls.modal = true;
    this.drawRoom(w, h);
    this.buildRows();
    this.drawPods();
    this.menu = this.add.container(MENU_X, 0).setDepth(DEPTH.ui);
    this.drawMenu();
    for (const [key, d] of [['UP', -1], ['W', -1], ['DOWN', 1], ['S', 1]] as const) this.input.keyboard?.on(`keydown-${key}`, () => this.move(d));
    if (!this.textures.exists('vignette')) makeVignette(this, w, h);
    this.add.image(0, 0, 'vignette').setOrigin(0).setDepth(DEPTH.vignette);
    this.cameras.main.fadeIn(400, 11, 10, 22);
    this.game.events.emit('location', `THE HUSK VAULT - ${this.host.placeLabel}`, []);
    sound.vaultHum(true);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => sound.vaultHum(false));
    (window as unknown as { __vault: VaultScene }).__vault = this;
  }

  /** Steel floor, a back wall of plates, the steps down from the bunker with a little daylight at the top. */
  private drawRoom(w: number, h: number) {
    const g = this.add.graphics().setDepth(DEPTH.ground);
    g.fillStyle(PALETTE[24], 1).fillRect(0, 0, w, h);
    g.fillStyle(PALETTE[23], 1).fillRect(20, 70, MENU_X - 30, 120);
    for (let x = 20; x < MENU_X - 10; x += 24) g.lineStyle(1, PALETTE[25], 0.8).lineBetween(x, 70, x, 190);
    g.lineStyle(1, PALETTE[22], 0.6).lineBetween(20, 70, MENU_X - 10, 70);
    g.fillStyle(PALETTE[22], 1).fillRect(10, 190, MENU_X - 10, 70);
    for (let y = 196; y < 260; y += 10) for (let x = 14 + ((y / 10) % 2) * 12; x < MENU_X; x += 24) g.fillStyle(PALETTE[23], 1).fillRect(x, y, 22, 8);
    // the steps up, bottom left
    for (let i = 0; i < 5; i++) g.fillStyle(PALETTE[i % 2 ? 21 : 22], 1).fillRect(24 + i * 3, 230 - i * 8, 36 - i * 6, 8);
    this.lighting.add({ x: 40, y: 200, radius: 60, color: 0xb8c8ff, intensity: 0.6 });
    this.add.image(40, 196, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(PALETTE[20]).setAlpha(0.12).setScale(0.8, 0.5).setDepth(DEPTH.glow);
    // you, at the foot of the steps
    const key = this.host.player.sprite.texture.key;
    const me = this.add.sprite(78, 236, key, 0).setOrigin(0.5, 1).setDepth(DEPTH.actors + 236);
    if (this.anims.exists(anim(key, 'idle'))) me.play(anim(key, 'idle'));
    this.lighting.add({ x: 78, y: 226, radius: 50, color: 0xffe2b8, intensity: 0.8 });
  }

  /** The menu: every husk (this world's first, then the nearest), building one here, your own body, the way up. */
  private buildRows() {
    const r = session.replicant, s = this.host, p = s.planet, here = worldKey(p.star, p.planetIndex);
    const driving = inManny(r) && r!.star_id === p.star && r!.planet_index === p.planetIndex;
    const husks = mannyWorlds(r).sort((a, b) => (a.key === here ? -1 : b.key === here ? 1 : distanceLy(p.star, a.star) - distanceLy(p.star, b.star)));
    for (const m of husks) {
      const isHere = m.key === here, star = starById(m.star);
      const ly = distanceLy(p.star, m.star);
      const sub = isHere ? (driving ? 'YOU ARE IN IT' : 'HERE') : `${star?.name ?? m.star}  ${ly.toFixed(1)} LY`;
      this.rows.push({ kind: 'husk', label: planetFor(m.star, m.planet)?.name ?? m.key, sub, star: m.star, planet: m.planet, enabled: !(isHere && driving), here: isHere });
    }
    if (!s.dock.built) this.rows.push({ kind: 'build', label: 'BUILD A HUSK', sub: Object.entries(COST).map(([m, n]) => `${m.toUpperCase()} ${Math.min(s.dock.have(m), n)}/${n}`).join('  '), enabled: s.dock.canBuild() });
    if (inManny(r)) this.rows.push({ kind: 'body', label: 'TO YOUR BODY', sub: 'ABOARD THE SHIP', enabled: true });
    this.rows.push({ kind: 'up', label: 'UP THE STEPS', sub: '', enabled: true });
    this.index = Math.max(0, this.rows.findIndex((x) => x.enabled && x.kind !== 'up'));
  }

  /** A pod per husk (and an empty one waiting to be filled when one can be built here). */
  private drawPods() {
    const husks = this.rows.filter((x) => x.kind === 'husk' || x.kind === 'build');
    const key = this.host.player.sprite.texture.key;
    const n = Math.max(3, husks.length), x0 = 24 + (MENU_X - 30 - n * (POD_W + 6)) / 2 + POD_W / 2;
    for (let i = 0; i < n; i++) {
      const x = Math.round(x0 + i * (POD_W + 6)), row = husks[i];
      const g = this.add.graphics().setDepth(DEPTH.ground + 2);
      g.fillStyle(PALETTE[25], 1).fillRect(x - POD_W / 2, POD_Y - 64, POD_W, 66);
      g.lineStyle(1, PALETTE[21], 0.9).strokeRect(x - POD_W / 2, POD_Y - 64, POD_W, 66);
      g.fillStyle(PALETTE[22], 1).fillRect(x - POD_W / 2 - 2, POD_Y + 2, POD_W + 4, 6);
      const glass = this.add.rectangle(x, POD_Y - 31, POD_W - 4, 62, PALETTE[17], 0.06).setDepth(DEPTH.actors + POD_Y + 1);
      const light = this.lighting.add({ x, y: POD_Y - 20, radius: 30, color: PALETTE[28], intensity: row ? 0.35 : 0.1 });
      let body: Phaser.GameObjects.Sprite | undefined;
      if (row?.kind === 'husk') {
        body = this.add.sprite(x, POD_Y, key, 0).setOrigin(0.5, 1).setScale(2).setDepth(DEPTH.actors + POD_Y);
        if (row.here) body.setTint(STANDBY); else body.setTint(0x7ad8ff).setAlpha(0.55).setBlendMode(Phaser.BlendModes.ADD);
        if (row.sub === 'YOU ARE IN IT') body.setAlpha(0.15);
      }
      this.pods.push({ x, body, light, glass });
    }
  }

  private drawMenu() {
    this.menu.removeAll(true);
    const add = <T extends Phaser.GameObjects.GameObject>(o: T) => { this.menu.add(o); return o; };
    add(this.add.bitmapText(0, 24, 'pixel', 'HUSKS').setTint(PALETTE[29]));
    add(this.add.bitmapText(0, 36, 'pixel', 'EMPTY VESSELS YOU DRIVE').setTint(PALETTE[22]));
    this.rows.forEach((row, i) => {
      const y = 56 + i * ROW_H, on = i === this.index;
      const bg = add(this.add.rectangle(-4, y - 3, 172, ROW_H - 2, on ? PALETTE[23] : PALETTE[24], on ? 1 : 0.6).setOrigin(0, 0).setStrokeStyle(1, on ? PALETTE[29] : PALETTE[23], on ? 1 : 0.6));
      bg.setInteractive({ useHandCursor: true }).on('pointerdown', () => { if (this.busy) return; this.index = i; this.pick(); });
      const color = !row.enabled ? PALETTE[22] : row.kind === 'build' ? PALETTE[11] : row.kind === 'husk' ? PALETTE[20] : PALETTE[21];
      add(this.add.bitmapText(2, y, 'pixel', row.label.slice(0, 22)).setTint(color));
      if (row.sub) add(this.add.bitmapText(2, y + 10, 'pixel', row.sub.slice(0, 26)).setTint(PALETTE[22]).setScale(1));
      if (row.kind === 'build') Object.keys(COST).forEach((m, k) => add(this.add.image(156 - k * 12, y + 4, 'supplies', ICON[m]).setOrigin(0.5)));
    });
    // the pod of the chosen husk glows
    const huskRows = this.rows.filter((x) => x.kind === 'husk' || x.kind === 'build');
    const chosen = huskRows.indexOf(this.rows[this.index]);
    this.pods.forEach((p, k) => { p.glass.setFillStyle(k === chosen ? PALETTE[29] : PALETTE[17], k === chosen ? 0.16 : 0.06); });
  }

  private move(d: number) {
    if (this.busy || !this.rows.length) return;
    this.index = (this.index + d + this.rows.length) % this.rows.length;
    sound.menuMove(this.index);
    this.drawMenu();
  }

  /** The chosen row: link, build, back to your body, or up. */
  pick() {
    const row = this.rows[this.index];
    if (!row || this.busy) return;
    if (!row.enabled) { sound.denied(); return; }
    sound.menuPick();
    if (row.kind === 'up') { this.leave(); return; }
    if (row.kind === 'build') { this.build(); return; }
    this.busy = true;
    this.cameras.main.fadeOut(300, 11, 10, 22);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      const s = this.host;
      this.scene.stop();
      s.dock.closed();
      if (row.kind === 'body') s.linker.toVessel();
      else s.linker.linkTo(row.star!, row.planet!);
    });
  }

  /** This world's iron and hydrogen fly into the empty pod, the scanner reads you, and a husk rises in your likeness. */
  private build() {
    const s = this.host, pod = this.pods[this.rows.filter((x) => x.kind === 'husk').length];
    if (!pod || !s.dock.canBuild()) { sound.denied(); return; }
    this.busy = true;
    sound.build();
    let k = 0;
    for (const [m, n] of Object.entries(COST)) for (let i = 0; i < Math.min(8, n); i++, k++) {
      const icon = this.add.image(78, 210, 'supplies', ICON[m]).setDepth(DEPTH.ui).setAlpha(0);
      const arc = { t: 0 };
      this.tweens.add({
        targets: arc, t: 1, delay: k * 70, duration: 520, ease: 'Sine.easeInOut',
        onStart: () => icon.setAlpha(1),
        onUpdate: () => icon.setPosition(78 + (pod.x - 78) * arc.t, 210 + (POD_Y - 40 - 210) * arc.t - Math.sin(arc.t * Math.PI) * 30),
        onComplete: () => icon.destroy(),
      });
    }
    this.time.delayedCall(900, () => { sound.scan(); this.tweens.add({ targets: pod.light, intensity: 1, duration: 400, yoyo: true }); });
    const body = this.add.sprite(pod.x, POD_Y, s.player.sprite.texture.key, 0).setOrigin(0.5, 1).setScale(2, 0).setDepth(DEPTH.actors + POD_Y).setTintFill(PALETTE[22]);
    this.time.delayedCall(1300, () => this.tweens.add({ targets: body, scaleY: 2, duration: 700, ease: 'Sine.easeOut' }));
    this.time.delayedCall(MANNY.buildMs, () => {
      body.setTintFill(PALETTE[29]);
      this.cameras.main.flash(160, 246, 117, 122, false);
      sound.birth();
      this.time.delayedCall(250, () => body.clearTint().setTint(STANDBY));
      if (!s.dock.build()) { this.busy = false; return; }
      this.game.events.emit('notice', 'A HUSK WAITS IN THE VAULT: LINK TO IT FROM ANY WORLD');
      // the vault again, with the new husk in its pod and on the menu
      this.time.delayedCall(700, () => this.scene.restart({ host: s }));
    });
  }

  private leave() {
    this.busy = true;
    sound.vaultDoor();
    this.cameras.main.fadeOut(320, 11, 10, 22);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => { const s = this.host; this.scene.stop(); s.dock.closed(); });
  }

  update(_time: number, dt: number) {
    this.t += dt / 1000;
    const f = this.controls.read();
    if (!this.busy) {
      if (Math.abs(f.y) > 0.6) { if (!this.stickHeld) this.move(Math.sign(f.y)); this.stickHeld = true; } else if (Math.abs(f.y) < 0.3) this.stickHeld = false;
      if (f.cancel) this.leave();
      else if ((f.attack || f.interact) && !f.click) this.pick();
    }
    for (const p of this.pods) if (p.body) p.light.intensity = 0.3 + 0.12 * Math.sin(this.t * 2 + p.x);
    this.lighting.update(dt);
  }
}
