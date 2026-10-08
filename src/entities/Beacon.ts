import Phaser from 'phaser';
import { sound } from '../audio/Sound';
import { anim } from '../core/assets';
import { PALETTE } from '../core/data';
import type { Light } from '../fx/Lighting';
import type { PlanetScene } from '../scenes/PlanetScene';
import { flashWhite } from './Player';

const LENS_Y = -38;
const LIT = 0x9fe8ff;

/**
 * The beacon monolith at the head of the plaza. Dormant it is a dark pillar with a dead lens; once its keeper
 * falls it lights for good: the lens burns white, cyan seams pulse, a beam climbs into the sky and motes rise.
 */
export class Beacon {
  readonly sprite: Phaser.GameObjects.Sprite;
  private glow: Phaser.GameObjects.Image;
  private light: Light;
  private beam?: Phaser.GameObjects.Rectangle;
  private beamWide?: Phaser.GameObjects.Rectangle;
  private motes?: Phaser.GameObjects.Particles.ParticleEmitter;
  lit: boolean;

  constructor(private scene: PlanetScene, readonly x: number, readonly y: number, lit: boolean) {
    this.lit = lit;
    this.sprite = scene.add.sprite(x, y, 'beacon', 0).setOrigin(0.5, 1).setDepth(100 + y);
    this.glow = scene.add.image(x, y + LENS_Y, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(PALETTE[21]).setAlpha(0.08).setScale(0.5).setDepth(6100);
    this.light = scene.lighting.add({ x, y: y + LENS_Y, radius: 34, color: PALETTE[22], intensity: 0.35 });
    if (lit) this.showLit(false);
  }

  /** The keeper is down: light it. */
  ignite() {
    if (this.lit) return;
    this.lit = true;
    const sc = this.scene, lx = this.x, ly = this.y + LENS_Y;
    flashWhite(sc, this.sprite, 160);
    sc.shake(500, 0.008);
    sound.beacon();
    sc.fx.sparks(lx, ly, PALETTE[19], 26);
    sc.fx.sparks(lx, ly, PALETTE[18], 16);
    sc.time.delayedCall(170, () => this.showLit(true));
  }

  private showLit(animate: boolean) {
    const sc = this.scene, lx = this.x, ly = this.y + LENS_Y;
    this.sprite.play(anim('beacon', 'lit'));
    this.glow.setTint(LIT);
    sc.tweens.killTweensOf(this.glow);
    const h = ly + 8; // up to the top of the world
    this.beamWide = sc.add.rectangle(lx, ly, 12, h, 0xbff8ff).setOrigin(0.5, 1).setAlpha(0.05).setBlendMode(Phaser.BlendModes.ADD).setDepth(6120);
    this.beam = sc.add.rectangle(lx, ly, 3, h, 0xe8ffff).setOrigin(0.5, 1).setAlpha(0.16).setBlendMode(Phaser.BlendModes.ADD).setDepth(6121);
    this.motes = sc.add.particles(lx, ly, 'px', {
      lifespan: { min: 1200, max: 2200 }, speedY: { min: -14, max: -40 }, speedX: { min: -6, max: 6 },
      x: { min: -3, max: 3 }, scale: { start: 1, end: 0 }, alpha: { start: 0.9, end: 0 },
      tint: [PALETTE[19], PALETTE[18], PALETTE[20]], blendMode: Phaser.BlendModes.ADD, frequency: 110,
    }).setDepth(6150);
    if (!animate) {
      this.light.color = LIT; this.light.radius = 150; this.light.intensity = 1; this.light.flicker = 0.08;
      this.glow.setAlpha(0.32).setScale(1.6);
    } else {
      this.light.color = LIT;
      sc.tweens.add({ targets: this.light, radius: 150, intensity: 1, duration: 1800, ease: 'Sine.easeOut', onComplete: () => { this.light.flicker = 0.08; } });
      sc.tweens.add({ targets: this.glow, alpha: 0.32, scale: 1.6, duration: 1600, ease: 'Sine.easeOut' });
      this.beam.setScale(1, 0); this.beamWide.setScale(1, 0);
      sc.tweens.add({ targets: [this.beam, this.beamWide], scaleY: 1, duration: 1500, ease: 'Quad.easeOut' });
      sc.time.delayedCall(1300, () => sc.game.events.emit('titlecard', 'BEACON LIT', this.scene.planet.name));
    }
    sc.tweens.add({ targets: this.glow, alpha: 0.22, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: animate ? 1600 : 0 });
  }

  update(time: number) {
    if (!this.beam || !this.beamWide) return;
    const f = 0.5 + 0.5 * Math.sin(time / 230) * Math.sin(time / 610);
    this.beam.setAlpha(0.13 + 0.06 * f);
    this.beamWide.setAlpha(0.04 + 0.03 * f);
  }
}
