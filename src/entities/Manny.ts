import Phaser from 'phaser';
import { sound } from '../audio/Sound';
import { anim } from '../core/assets';
import { MANNY, PALETTE } from '../core/data';
import { hasManny, inManny, mannyWorlds, worldKey } from '../core/mannies';
import { session } from '../core/session';
import type { Light } from '../fx/Lighting';
import type { PlanetScene } from '../scenes/PlanetScene';
import { squash } from './Player';

export const COST = MANNY.cost as Record<string, number>;
/** a powered-down husk: the body dimmed, its visor gone grey */
export const STANDBY = 0x8a8aa6;

/**
 * The husk vault's way in, in the town square (manny.json; player facing: husks, in code: mannies). A low bunker over
 * a small underground room where your husks are stored (src/scenes/VaultScene.ts): stand in its doorway for a moment
 * (a ring fills) or press action there and you go down to it. Its door is lit while a husk waits below or one can be
 * built. A husk you left standing somewhere on this world waits there on standby, dimmed with a slow pilot light.
 */
export class MannyDock {
  private sprite: Phaser.GameObjects.Sprite;
  private light: Light;
  private ring: Phaser.GameObjects.Graphics;
  private dwell = 0;
  readyAt = 0;
  /** the husk on standby where you left it, while you are here in another body */
  private idle?: { sprite: Phaser.GameObjects.Sprite; pilot: Phaser.GameObjects.Image; light: Light };
  building = false;

  constructor(private scene: PlanetScene, readonly x: number, readonly y: number) {
    this.sprite = scene.add.sprite(x, y + 4, 'huskvault', 0).setOrigin(0.5, 1).setDepth(100 + y - 6);
    this.light = scene.lighting.add({ x, y: y - 6, radius: 40, color: PALETTE[28], intensity: 0, flicker: 0.1 });
    this.ring = scene.add.graphics().setDepth(6150);
    this.readyAt = scene.time.now + 1500; // never straight back down on arriving
    // the bunker is solid; the doorway in its front is open
    for (const [dx, dy, w, h] of [[-11, -6, 10, 10], [11, -6, 10, 10], [0, -10, 12, 4]]) scene.addSolid(x + dx, y + dy, w, h);
    const m = session.replicant?.traits.mannies?.[this.key];
    if (this.built && !this.drivenHere && m?.x != null && m.y != null && scene.isWalkable(m.x, m.y)) this.standby({ x: m.x, y: m.y });
  }

  private get key() { return worldKey(this.scene.planet.star, this.scene.planet.planetIndex); }
  /** This world has a husk. */
  get built() { return hasManny(session.replicant, this.scene.planet.star, this.scene.planet.planetIndex); }
  /** You are in this world's husk right now. */
  get drivenHere() {
    const r = session.replicant, p = this.scene.planet;
    return inManny(r) && !this.scene.visit && r!.star_id === p.star && r!.planet_index === p.planetIndex;
  }
  /** Anything below: husks you own anywhere, or the makings of one here. */
  get lit() { return this.built || mannyWorlds(session.replicant).length > 0 || this.canBuild(); }

  /** Standing in the doorway (in front of the bunker). */
  playerOnPad() {
    const p = this.scene.player;
    return !!p && Math.abs(p.x - this.x) < 8 && p.y > this.y - 4 && p.y < this.y + 8;
  }

  have(m: string) { return Math.floor(this.scene.supplies[m] ?? 0); }
  canBuild() {
    return !this.built && !this.building && !this.scene.visit && !!session.replicant
      && Object.entries(COST).every(([m, n]) => this.have(m) >= n);
  }

  update(time: number, dt = 16) {
    const lit = this.lit;
    this.sprite.setFrame(lit ? 1 : 0);
    const pulse = 0.5 + 0.5 * Math.sin(time / 420);
    this.light.intensity = lit ? 0.35 + 0.25 * pulse : 0.08;
    // the doorway: a moment standing in it takes you down (walking past never does)
    const p = this.scene.player;
    const on = time > this.readyAt && !!p && p.alive && !p.locked && !this.scene.stopped && !this.scene.talker.talk && this.playerOnPad();
    this.dwell = on ? this.dwell + dt : 0;
    this.ring.clear();
    if (this.dwell) {
      const k = Math.min(1, this.dwell / MANNY.doorDwellMs);
      this.ring.lineStyle(1, PALETTE[29], 0.4 + 0.5 * k).beginPath().arc(this.x, this.y - 2, 10, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2).strokePath();
      if (k >= 1) { this.dwell = 0; this.ring.clear(); this.open(); }
    }
    if (this.idle) {
      this.idle.pilot.setAlpha(0.35 + 0.45 * (0.5 + 0.5 * Math.sin(time / 520)));
      this.idle.light.intensity = 0.25 + 0.15 * Math.sin(time / 520);
    }
  }

  /** Action in the doorway: down to the vault. Returns true: the doorway never lets a swing through. */
  tryBuild(): boolean {
    if (this.scene.time.now > this.readyAt) this.open();
    return true;
  }

  /** Down the steps: the vault opens over the planet, which waits until you come back up. */
  open() {
    const s = this.scene, pl = s.player;
    if (s.visit || s.launching) { sound.denied(); return; }
    pl.locked = true;
    pl.body.setVelocity(0, 0);
    this.readyAt = Infinity;
    sound.vaultDoor();
    s.tweens.add({ targets: pl.sprite, y: pl.sprite.y - 4, alpha: 0, duration: 260, ease: 'Quad.easeIn' });
    s.cameras.main.fadeOut(320, 11, 10, 22);
    s.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => { s.scene.pause(); s.scene.launch('vault', { host: s }); });
  }

  /** Back up the steps into the square. */
  closed() {
    const s = this.scene, pl = s.player;
    s.scene.resume();
    pl.setPosition(this.x, this.y + 10);
    pl.sprite.setAlpha(1);
    pl.locked = false;
    this.readyAt = s.time.now + 2500;
    s.cameras.main.centerOn(this.x, this.y);
    s.cameras.main.fadeIn(400, 11, 10, 22);
    squash(s, pl.sprite, 1.3, 0.7, 140);
    s.fx.dust(this.x, this.y + 8, 6);
    s.announceLocation();
  }

  /** A husk is made here from this world's iron and hydrogen (the vault plays it). False when it cannot be. */
  build(): boolean {
    if (!this.canBuild()) { sound.denied(); return false; }
    const s = this.scene, r = session.replicant!;
    for (const [m, n] of Object.entries(COST)) s.supplies[m] = Math.max(0, (s.supplies[m] ?? 0) - n);
    s.markSupplies();
    r.traits.mannies = { ...(r.traits.mannies ?? {}), [this.key]: { at: Date.now() } };
    void s.saver.saveReplicant();
    void s.saver.flushPlanet();
    s.minds.mindLog.push({ t: s.minds.mindClock, text: `${r.name} built a husk in its own likeness: an empty body kept in the vault that it can drive from any world` });
    return true;
  }

  /** The husk on standby where you left it: your body, dimmed, with a slow pink pilot light. */
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
