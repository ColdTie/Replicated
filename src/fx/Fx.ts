// Particle bursts and the slash effect. A handful of pooled emitters, triggered with explode().
import Phaser from 'phaser';
import { anim } from '../core/assets';
import { PALETTE } from '../core/data';

export class Fx {
  private sparkEmitter: Phaser.GameObjects.Particles.ParticleEmitter;
  private dustEmitter: Phaser.GameObjects.Particles.ParticleEmitter;
  private debrisEmitter: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor(private scene: Phaser.Scene, accent: number, accentLight: number) {
    this.sparkEmitter = scene.add.particles(0, 0, 'px', {
      emitting: false,
      lifespan: { min: 180, max: 420 },
      speed: { min: 50, max: 150 },
      scale: { start: 1, end: 0 },
      alpha: { start: 1, end: 0.2 },
      blendMode: Phaser.BlendModes.ADD,
      gravityY: 120,
    }).setDepth(6150);
    this.dustEmitter = scene.add.particles(0, 0, 'px', {
      emitting: false,
      lifespan: { min: 350, max: 600 },
      speedX: { min: -14, max: 14 },
      speedY: { min: -14, max: -2 },
      scale: { start: 1.5, end: 0.5 },
      alpha: { start: 0.55, end: 0 },
      tint: PALETTE[22],
    }).setDepth(90);
    this.debrisEmitter = scene.add.particles(0, 0, 'px', {
      emitting: false,
      lifespan: { min: 300, max: 700 },
      speed: { min: 40, max: 120 },
      scale: { start: 1.5, end: 0 },
      tint: [accent, accentLight, PALETTE[19]],
      blendMode: Phaser.BlendModes.ADD,
      gravityY: 160,
    }).setDepth(6150);
  }

  sparks(x: number, y: number, color: number, n: number) {
    this.sparkEmitter.setParticleTint(color);
    this.sparkEmitter.explode(n, x, y);
  }

  dust(x: number, y: number, n: number) {
    this.dustEmitter.explode(n, x, y);
  }

  debris(x: number, y: number, n: number) {
    this.debrisEmitter.explode(n, x, y);
  }

  slash(x: number, y: number, dir: Phaser.Math.Vector2) {
    const s = this.scene.add.sprite(Math.round(x), Math.round(y), 'slash').setDepth(6150).setBlendMode(Phaser.BlendModes.ADD);
    const left = dir.x < -0.01;
    // slash art faces right; mirror for left so the arc sweeps naturally
    s.setRotation(left ? Math.atan2(dir.y, dir.x) + Math.PI : Math.atan2(dir.y, dir.x)).setFlipX(left);
    s.play(anim('slash', 'slash'));
    s.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => s.destroy());
  }

  /** Small icon that floats up from a point and fades: used for collected resources. */
  floatIcon(x: number, y: number, key: string) {
    const icon = this.scene.add.image(Math.round(x), Math.round(y), key).setDepth(6300);
    this.scene.tweens.add({ targets: icon, y: y - 18, alpha: { from: 1, to: 0 }, duration: 750, ease: 'Quad.easeOut', onComplete: () => icon.destroy() });
  }
}
