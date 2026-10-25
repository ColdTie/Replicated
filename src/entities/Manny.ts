import Phaser from 'phaser';
import { sound } from '../audio/Sound';
import { anim } from '../core/assets';
import { MANNY, PALETTE } from '../core/data';
import { hasManny, inManny, worldKey } from '../core/mannies';
import { session } from '../core/session';
import type { Light } from '../fx/Lighting';
import type { PlanetScene } from '../scenes/PlanetScene';
import { squash } from './Player';

const COST = MANNY.cost as Record<string, number>;
const ICON: Record<string, number> = { iron: 13, hydrogen: 14 };
/** a powered-down manny: the body dimmed, its visor gone grey */
const STANDBY = 0x8a8aa6;

/**
 * The manny dock in the town square (manny.json). With enough iron and hydrogen in this world's store its pylons
 * light and a ghost of you stands in it; stand on its pad and press action and a manny is assembled there in your
 * likeness. From then on the world keeps a body for you: it waits on standby (in the dock, or where you left it)
 * whenever you are not in it, and any star map can link you into it.
 */
export class MannyDock {
  private sprite: Phaser.GameObjects.Sprite;
  private light: Light;
  private ghost: Phaser.GameObjects.Image;
  private readout: Phaser.GameObjects.Container;
  private counts: Record<string, Phaser.GameObjects.BitmapText> = {};
  /** the manny on standby, while you are here in another body */
  private idle?: { sprite: Phaser.GameObjects.Sprite; pilot: Phaser.GameObjects.Image; light: Light };
  building = false;

  constructor(private scene: PlanetScene, readonly x: number, readonly y: number) {
    this.sprite = scene.add.sprite(x, y + 6, 'mannydock', 0).setOrigin(0.5, 1).setDepth(100 + y - 6);
    this.light = scene.lighting.add({ x, y: y - 8, radius: 44, color: PALETTE[28], intensity: 0, flicker: 0.1 });
    this.ghost = scene.add.image(x, y + 2, scene.player?.sprite.texture.key ?? 'shard', 0).setOrigin(0.5, 1)
      .setTintFill(PALETTE[29]).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0).setDepth(100 + y);
    // what it still needs, over the dock while you are near and it is not built
    const items: Phaser.GameObjects.GameObject[] = [];
    Object.keys(COST).forEach((m, i) => {
      items.push(scene.add.image(i * 42, 0, 'supplies', ICON[m]).setOrigin(0, 0.5));
      this.counts[m] = scene.add.bitmapText(i * 42 + 10, -4, 'pixel', '').setTint(PALETTE[m === 'iron' ? 20 : 29]);
      items.push(this.counts[m]);
    });
    this.readout = scene.add.container(x - 38, y - 36, items).setDepth(6300).setAlpha(0);
    // the pylons and the back of the pad are solid; you step onto the pad from the front
    for (const [dx, dy, w, h] of [[-12, 0, 5, 5], [12, 0, 5, 5], [0, -5, 20, 3]]) scene.addSolid(x + dx, y + dy, w, h);
    if (this.built && !this.drivenHere) this.standby(this.restSpot());
  }

  private get key() { return worldKey(this.scene.planet.star, this.scene.planet.planetIndex); }
  /** This world has a manny. */
  get built() { return hasManny(session.replicant, this.scene.planet.star, this.scene.planet.planetIndex); }
  /** You are in this world's manny right now. */
  get drivenHere() {
    const r = session.replicant, p = this.scene.planet;
    return inManny(r) && !this.scene.visit && r!.star_id === p.star && r!.planet_index === p.planetIndex;
  }

  /** Where the manny waits: where you left it, or in its dock. */
  restSpot() {
    const m = session.replicant?.traits.mannies?.[this.key];
    return m?.x != null && m.y != null && this.scene.isWalkable(m.x, m.y) ? { x: m.x, y: m.y } : { x: this.x, y: this.y + 2 };
  }

  playerOnPad() {
    const p = this.scene.player;
    return Math.abs(p.x - this.x) < 13 && Math.abs(p.y - this.y) < 8;
  }

  have(m: string) { return Math.floor(this.scene.supplies[m] ?? 0); }
  canBuild() {
    return !this.built && !this.building && !this.scene.visit && !!session.replicant
      && Object.entries(COST).every(([m, n]) => this.have(m) >= n);
  }

  update(time: number) {
    const ready = this.canBuild();
    const lit = this.built || ready || this.building;
    this.sprite.setFrame(lit ? 1 : 0);
    const pulse = 0.5 + 0.5 * Math.sin(time / 280);
    const on = this.playerOnPad();
    this.light.intensity = this.building ? 1 : ready ? 0.5 + 0.3 * pulse + (on ? 0.2 : 0) : this.built ? 0.35 : 0;
    this.ghost.setAlpha(ready && !this.building ? (on ? 0.4 : 0.16) + 0.08 * Math.sin(time / 300) : 0);
    const p = this.scene.player;
    const near = !!p && !this.built && !this.building && !this.scene.visit && Math.hypot(p.x - this.x, p.y - this.y) < MANNY.nearPx;
    if (near) for (const [m, n] of Object.entries(COST)) this.counts[m].setText(`${Math.min(this.have(m), n)}/${n}`).setAlpha(this.have(m) >= n ? 1 : 0.7);
    this.readout.setAlpha(Phaser.Math.Linear(this.readout.alpha, near ? 0.9 : 0, 0.15));
    if (this.idle) {
      this.idle.pilot.setAlpha(0.35 + 0.45 * (0.5 + 0.5 * Math.sin(time / 520)));
      this.idle.light.intensity = 0.25 + 0.15 * Math.sin(time / 520);
    }
  }

  /** Not enough yet: the dock buzzes and the readout flashes. */
  private refuse() {
    sound.denied();
    this.scene.tweens.add({ targets: this.sprite, x: this.x + 1, duration: 40, yoyo: true, repeat: 3, onComplete: () => this.sprite.setX(this.x) });
    this.readout.setAlpha(1);
    this.scene.tweens.add({ targets: this.readout, scale: { from: 1.2, to: 1 }, duration: 200, ease: 'Back.easeOut' });
  }

  /** Action on the pad. Returns true: the pad never lets a swing through. */
  tryBuild(): boolean {
    if (this.building) return true;
    if (this.built || !this.canBuild()) { if (!this.built) this.refuse(); return true; }
    const s = this.scene, pl = s.player, r = session.replicant!;
    this.building = true;
    for (const [m, n] of Object.entries(COST)) s.supplies[m] = Math.max(0, (s.supplies[m] ?? 0) - n);
    s.markSupplies();
    pl.locked = true;
    pl.body.setVelocity(0, 0);
    // step off the pad to watch it rise
    const side = s.isWalkable(this.x + 24, this.y + 8) ? 1 : -1;
    const sx = pl.x, sy = pl.y, ex = this.x + side * 24, ey = this.y + 8;
    const hop = { t: 0 };
    s.tweens.add({ targets: hop, t: 1, duration: 300, onUpdate: () => { pl.setPosition(sx + (ex - sx) * hop.t, sy + (ey - sy) * hop.t); pl.sprite.y -= Math.sin(hop.t * Math.PI) * 8; } });
    pl.facing = -side;
    sound.build();
    // iron and hydrogen fly into the dock
    let k = 0;
    for (const [m, n] of Object.entries(COST)) for (let i = 0; i < Math.min(8, n); i++, k++) {
      const icon = s.add.image(ex, ey - 12, 'supplies', ICON[m]).setDepth(6300).setAlpha(0);
      const arc = { t: 0 };
      s.tweens.add({
        targets: arc, t: 1, delay: 300 + k * 70, duration: 520, ease: 'Sine.easeInOut',
        onStart: () => icon.setAlpha(1),
        onUpdate: () => icon.setPosition(ex + (this.x - ex) * arc.t, ey - 12 + (this.y - 10 - (ey - 12)) * arc.t - Math.sin(arc.t * Math.PI) * 18),
        onComplete: () => { icon.destroy(); s.fx.sparks(this.x, this.y - 10, PALETTE[m === 'iron' ? 20 : 29], 2); },
      });
    }
    // the scanner reads your likeness
    s.time.delayedCall(1100, () => { sound.scan(); s.base.scan(pl.sprite, pl.featureColor, 900); });
    // and the body rises on the pad: iron first, then the hydrogen lights it
    const body = s.add.sprite(this.x, this.y + 2, pl.sprite.texture.key, 0).setOrigin(0.5, 1).setDepth(100 + this.y)
      .setTintFill(PALETTE[22]).setScale(1, 0);
    s.time.delayedCall(1500, () => {
      s.tweens.add({ targets: body, scaleY: 1, duration: 600, ease: 'Sine.easeOut' });
      s.fx.sparks(this.x, this.y - 4, PALETTE[11], 10);
    });
    s.time.delayedCall(2150, () => {
      body.setTintFill(PALETTE[29]);
      s.fx.sparks(this.x, this.y - 12, PALETTE[29], 16);
      s.fx.sparks(this.x, this.y - 12, PALETTE[19], 8);
      s.cameras.main.flash(160, 246, 117, 122, false);
      s.shake(180, 0.005);
      sound.birth();
    });
    s.time.delayedCall(MANNY.buildMs, () => {
      body.destroy();
      r.traits.mannies = { ...(r.traits.mannies ?? {}), [this.key]: { at: Date.now() } };
      this.standby({ x: this.x, y: this.y + 2 }, true);
      this.building = false;
      pl.locked = false;
      void s.saver.saveReplicant();
      void s.saver.flushPlanet();
      s.minds.mindLog.push({ t: s.minds.mindClock, text: `${r.name} built a manny in its own likeness: a body that waits here and that it can drive from any world` });
      s.game.events.emit('notice', 'A MANNY WAITS HERE: LINK TO IT FROM ANY STAR MAP');
    });
    return true;
  }

  /** The manny on standby: your body, dimmed, with a slow pink pilot light. */
  private standby(at: { x: number; y: number }, fresh = false) {
    const s = this.scene;
    const key = s.player?.sprite.texture.key;
    if (!key || this.idle) return;
    const sprite = s.add.sprite(at.x, at.y, key, 0).setOrigin(0.5, 1).setDepth(100 + at.y).setTint(STANDBY);
    if (s.anims.exists(anim(key, 'idle'))) sprite.play({ key: anim(key, 'idle'), frameRate: 3 });
    const pilot = s.add.image(at.x, at.y - 9, 'px').setBlendMode(Phaser.BlendModes.ADD).setTint(PALETTE[29]).setDepth(6150);
    const light = s.lighting.add({ x: at.x, y: at.y - 8, radius: 22, color: PALETTE[28], intensity: 0.3 });
    this.idle = { sprite, pilot, light };
    if (fresh) squash(s, sprite, 1.25, 0.8, 140);
  }
}
