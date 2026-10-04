// Sky gradient + parallax stars behind the island, drifting fog, dust motes and spores.
import Phaser from 'phaser';
import { PALETTE, hex, type PlanetDef } from '../core/data';
import { makeFog, makeSky, makeStars } from './textures';

export class Atmosphere {
  readonly sky: Phaser.GameObjects.Image;
  readonly starsFar: Phaser.GameObjects.TileSprite;
  readonly starsNear: Phaser.GameObjects.TileSprite;
  readonly fog: Phaser.GameObjects.TileSprite;
  private dust: Phaser.GameObjects.Particles.ParticleEmitter;
  private spores: Phaser.GameObjects.Particles.ParticleEmitter;
  private t = 0;

  constructor(private scene: Phaser.Scene, planet: PlanetDef) {
    const { width: w, height: h } = scene.scale;
    const accent = PALETTE[planet.accent[1]];
    const accentLight = PALETTE[planet.accent[2]];

    makeSky(scene, `sky.${planet.id}`, planet.sky.map(hex), w, h);
    makeStars(scene, `stars.far.${planet.id}`, 128, 40, planet.seed, accent);
    makeStars(scene, `stars.near.${planet.id}`, 160, 18, planet.seed + 9, accentLight);
    makeFog(scene, `fog.${planet.id}`, 192, planet.seed);

    this.sky = scene.add.image(0, 0, `sky.${planet.id}`).setOrigin(0).setScrollFactor(0).setDepth(-1000);
    this.starsFar = scene.add.tileSprite(0, 0, w, h, `stars.far.${planet.id}`).setOrigin(0).setScrollFactor(0).setDepth(-990);
    this.starsNear = scene.add.tileSprite(0, 0, w, h, `stars.near.${planet.id}`).setOrigin(0).setScrollFactor(0).setDepth(-980);
    this.fog = scene.add.tileSprite(0, 0, w + 4, h + 4, `fog.${planet.id}`).setOrigin(0).setScrollFactor(0)
      .setDepth(5000).setTint(PALETTE[22]).setAlpha(0.16);

    // Dust motes: world space, emitted around the camera so they parallax with the ground
    const zone = new Phaser.Geom.Rectangle(-40, -40, w + 80, h + 80);
    this.dust = scene.add.particles(0, 0, 'px1', {
      emitZone: { type: 'random', source: zone, quantity: 1 } as Phaser.Types.GameObjects.Particles.EmitZoneData,
      frequency: 90,
      lifespan: { min: 4000, max: 7000 },
      speedX: { min: -5, max: 5 },
      speedY: { min: -7, max: -1 },
      tint: [PALETTE[20], PALETTE[21], 0xffe2b8],
      alpha: { onEmit: () => 0, onUpdate: (_p, _k, t) => Math.sin(t * Math.PI) * 0.55 },
      blendMode: Phaser.BlendModes.ADD,
      maxAliveParticles: 70,
    }).setDepth(6120);

    this.spores = scene.add.particles(0, 0, 'px', {
      emitZone: { type: 'random', source: zone, quantity: 1 } as Phaser.Types.GameObjects.Particles.EmitZoneData,
      frequency: 1000 / Math.max(0.1, planet.sporeRate),
      lifespan: { min: 5000, max: 8000 },
      speedX: { min: -6, max: 6 },
      speedY: { min: -10, max: -3 },
      scale: { min: 0.5, max: 1 },
      tint: [accent, accentLight],
      alpha: { onEmit: () => 0, onUpdate: (_p, _k, t) => Math.sin(t * Math.PI) * 0.9 },
      blendMode: Phaser.BlendModes.ADD,
      maxAliveParticles: 30,
    }).setDepth(6120);

    // Pre-warm so the first frame already has atmosphere
    this.dust.fastForward(5000);
    this.spores.fastForward(5000);
  }

  update(dt: number) {
    this.t += dt / 1000;
    const cam = this.scene.cameras.main;
    this.starsFar.tilePositionX = cam.scrollX * 0.08;
    this.starsFar.tilePositionY = cam.scrollY * 0.08;
    this.starsNear.tilePositionX = cam.scrollX * 0.2;
    this.starsNear.tilePositionY = cam.scrollY * 0.2;
    this.fog.tilePositionX = Math.round(cam.scrollX * 1.15 + this.t * 6);
    this.fog.tilePositionY = Math.round(cam.scrollY * 1.15 + this.t * 2);
    this.dust.setPosition(cam.scrollX, cam.scrollY);
    this.spores.setPosition(cam.scrollX, cam.scrollY);
  }
}
