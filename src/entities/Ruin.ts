import Phaser from 'phaser';
import { sound } from '../audio/Sound';
import { tex } from '../core/assets';
import { PALETTE } from '../core/data';
import type { Light } from '../fx/Lighting';
import type { DoorState } from '../net/store';
import type { PlanetScene } from '../scenes/PlanetScene';
import { DECOR } from '../world/planetGen';
import { flashWhite, squash } from './Player';

export const MODULES = ['light', 'dash', 'swing', 'listen'] as const;
export type ModuleKind = (typeof MODULES)[number];

type CoreState = 'machine' | 'ground' | 'carried' | 'home';

/**
 * A ruin puzzle that reads without words: the broken machine holds a glowing core the same color as the sealed
 * door. Hit the machine, the core pops out, it follows you, and the door opens when you bring it close.
 * Inside waits a module that upgrades the replicant who takes it.
 */
export class Ruin {
  private door: Phaser.GameObjects.Image;
  private doorGlow: Phaser.GameObjects.Image;
  private doorLight: Light;
  private machine: Phaser.GameObjects.Image;
  private machineLight: Light;
  private core?: Phaser.GameObjects.Sprite;
  private coreGlow?: Phaser.GameObjects.Image;
  private coreLight?: Light;
  private coreState: CoreState = 'machine';
  private module?: Phaser.GameObjects.Image;
  private moduleGlow?: Phaser.GameObjects.Image;
  private moduleLight?: Light;
  readonly kind: ModuleKind;
  open = false;
  taken = false;

  constructor(
    private scene: PlanetScene,
    readonly index: number,
    readonly doorPos: { x: number; y: number },
    readonly machinePos: { x: number; y: number },
    readonly inside: { x: number; y: number },
    state: DoorState | undefined,
  ) {
    const p = scene.planet.id;
    this.kind = MODULES[index % MODULES.length];
    this.open = !!state?.open;
    this.taken = !!state?.taken;

    this.door = scene.add.image(doorPos.x, doorPos.y, tex('decor', p), this.open ? DECOR.doorOpen : DECOR.door)
      .setOrigin(0.5, 1).setDepth(100 + doorPos.y - 20);
    this.doorGlow = scene.add.image(doorPos.x, doorPos.y - 7, 'glow').setBlendMode(Phaser.BlendModes.ADD)
      .setTint(this.open ? PALETTE[18] : PALETTE[9]).setAlpha(0.3).setScale(0.9).setDepth(6100);
    scene.tweens.add({ targets: this.doorGlow, alpha: 0.14, duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.doorLight = scene.lighting.add({ x: doorPos.x, y: doorPos.y - 7, radius: 64, color: this.open ? PALETTE[18] : PALETTE[10], intensity: 0.95, flicker: 0.15 });

    this.machine = scene.add.image(machinePos.x, machinePos.y, tex('decor', p), this.open ? DECOR.machineEmpty : DECOR.machine)
      .setOrigin(0.5, 1).setDepth(100 + machinePos.y);
    this.machineLight = scene.lighting.add({ x: machinePos.x - 2, y: machinePos.y - 6, radius: 18, color: PALETTE[8], intensity: this.open ? 0 : 0.7, flicker: 0.8 });
    if (!this.open) {
      // the core peeks out of the machine, glowing like the door
      this.coreGlow = scene.add.image(machinePos.x, machinePos.y - 8, 'glow').setBlendMode(Phaser.BlendModes.ADD)
        .setTint(PALETTE[9]).setAlpha(0.18).setScale(0.35).setDepth(6100);
    }
    if (this.open && !this.taken) this.showModule(false);
  }

  /** Near the machine when attacked: release the core. */
  hitMachine(hx: number, hy: number, radius: number) {
    if (this.open || this.coreState !== 'machine') return false;
    if (Math.hypot(this.machinePos.x - hx, this.machinePos.y - 6 - hy) > radius + 6) return false;
    this.coreState = 'ground';
    this.machine.setFrame(DECOR.machineEmpty);
    this.machineLight.intensity = 0;
    this.scene.tweens.add({ targets: this.machine, x: this.machinePos.x + 2, duration: 40, yoyo: true, repeat: 2 });
    this.scene.fx.sparks(this.machinePos.x, this.machinePos.y - 8, PALETTE[10], 14);
    sound.pop();
    this.coreGlow?.destroy();
    this.coreGlow = undefined;
    const sx = this.machinePos.x, sy = this.machinePos.y - 8;
    const { x: tx, y: ty } = this.landingSpot();
    this.core = this.scene.add.sprite(sx, sy, 'core').play('core:pulse').setDepth(6090);
    this.coreGlow = this.scene.add.image(sx, sy, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(PALETTE[9]).setAlpha(0.3).setScale(0.6).setDepth(6100);
    this.coreLight = this.scene.lighting.add({ x: sx, y: sy, radius: 40, color: PALETTE[10], intensity: 0.9 });
    const arc = { t: 0 };
    this.scene.tweens.add({
      targets: arc, t: 1, duration: 450, ease: 'Linear',
      onUpdate: () => this.placeCore(sx + (tx - sx) * arc.t, sy + (ty - sy) * arc.t - Math.sin(arc.t * Math.PI) * 18),
      onComplete: () => { squash(this.scene, this.core!, 1.3, 0.7, 120); this.scene.fx.dust(tx, ty + 3, 4); },
    });
    return true;
  }

  /** Where the core falls: the first open floor spot around the machine, never inside a wall. */
  private landingSpot() {
    const m = this.machinePos;
    for (const [ox, oy] of [[10, 10], [-10, 10], [14, 2], [-14, 2], [0, 14], [10, -2], [-10, -2], [0, 4]]) {
      const x = m.x + ox, y = m.y + oy;
      if (this.scene.isWalkable(x, y) && !this.scene.blockedAt(x, y) && this.scene.isWalkable(x, y + 6)) return { x, y };
    }
    return { x: m.x, y: m.y + 4 };
  }

  private placeCore(x: number, y: number) {
    this.core?.setPosition(Math.round(x), Math.round(y));
    this.coreGlow?.setPosition(x, y);
    if (this.coreLight) { this.coreLight.x = x; this.coreLight.y = y; }
  }

  /** Called when the player respawns: a carried core goes back to where it fell. */
  dropCore() {
    if (this.coreState === 'carried' && this.core) {
      this.coreState = 'ground';
      const spot = this.landingSpot();
      this.placeCore(spot.x, spot.y);
    }
  }

  update(time: number) {
    const pl = this.scene.player;
    if (this.core && this.coreState === 'ground') {
      this.core.y += Math.sin(time / 300) * 0.05;
      // the core wants to be picked up: when you come near it drifts toward you, so a bad spot never strands it
      const dx = pl.x - this.core.x, dy = pl.y - 6 - this.core.y, d = Math.hypot(dx, dy);
      if (pl.alive && d < 44 && d > 4) this.placeCore(this.core.x + (dx / d) * 0.6, this.core.y + (dy / d) * 0.6);
      if (pl.alive && d < 20) {
        this.coreState = 'carried';
        sound.coreHum();
        squash(this.scene, this.core, 1.4, 0.7, 100);
      }
    } else if (this.core && this.coreState === 'carried') {
      // floats behind the player's shoulder
      const tx = pl.x - pl.facing * 10, ty = pl.y - 20 + Math.sin(time / 250) * 2;
      this.placeCore(this.core.x + (tx - this.core.x) * 0.12, this.core.y + (ty - this.core.y) * 0.12);
      if (Math.hypot(pl.x - this.doorPos.x, pl.y - this.doorPos.y - 8) < 30) this.openDoor();
    }
    if (this.module && !this.taken) {
      this.module.y = this.inside.y - 10 + Math.sin(time / 350) * 2;
      this.moduleGlow?.setPosition(this.module.x, this.module.y);
      if (pl.alive && Math.hypot(pl.x - this.module.x, pl.y - 8 - this.module.y) < 13) this.take();
    }
  }

  private openDoor() {
    if (this.open || !this.core) return;
    this.coreState = 'home';
    this.open = true;
    const core = this.core;
    this.scene.tweens.add({
      targets: core, x: this.doorPos.x, y: this.doorPos.y - 10, duration: 500, ease: 'Quad.easeIn',
      onUpdate: () => this.placeCore(core.x, core.y),
      onComplete: () => {
        core.destroy(); this.coreGlow?.destroy();
        if (this.coreLight) this.scene.lighting.remove(this.coreLight);
        this.core = undefined;
        this.door.setFrame(DECOR.doorOpen);
        flashWhite(this.scene, this.door as unknown as Phaser.GameObjects.Sprite, 120);
        this.doorGlow.setTint(PALETTE[18]);
        this.doorLight.color = PALETTE[18];
        this.scene.shake(300, 0.006);
        this.scene.fx.sparks(this.doorPos.x, this.doorPos.y - 10, PALETTE[18], 20);
        sound.doorOpen();
        this.scene.onDoorChanged(this);
        this.scene.time.delayedCall(600, () => this.showModule(true));
      },
    });
  }

  private showModule(animate: boolean) {
    const { x, y } = this.inside;
    const color = this.kind === 'light' ? PALETTE[11] : this.kind === 'dash' ? PALETTE[18] : this.kind === 'listen' ? PALETTE[9] : PALETTE[19];
    this.module = this.scene.add.image(x, y - 10, 'module', MODULES.indexOf(this.kind)).setDepth(6090);
    this.moduleGlow = this.scene.add.image(x, y - 10, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(color).setAlpha(0.35).setScale(0.7).setDepth(6100);
    this.moduleLight = this.scene.lighting.add({ x, y: y - 10, radius: 44, color, intensity: 0.9, flicker: 0.1 });
    if (animate) {
      this.module.setScale(0);
      this.scene.tweens.add({ targets: this.module, scale: 1, duration: 500, ease: 'Back.easeOut' });
      this.scene.fx.sparks(x, y - 10, color, 12);
    }
  }

  private take() {
    this.taken = true;
    const m = this.module!;
    sound.upgrade();
    this.scene.fx.sparks(m.x, m.y, PALETTE[11], 20);
    this.scene.tweens.add({ targets: [m, this.moduleGlow], y: m.y - 16, alpha: 0, scale: 1.6, duration: 500, onComplete: () => { m.destroy(); this.moduleGlow?.destroy(); } });
    if (this.moduleLight) this.scene.tweens.add({ targets: this.moduleLight, intensity: 0, duration: 600 });
    this.scene.onModuleTaken(this);
  }
}
