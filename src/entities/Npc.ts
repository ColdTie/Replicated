import Phaser from 'phaser';
import { anim, bodyVariant } from '../core/assets';
import { PALETTE, PLAYER } from '../core/data';
import type { Light } from '../fx/Lighting';
import type { ReplicantSave } from '../net/store';
import type { PlanetScene } from '../scenes/PlanetScene';
import { squash } from './Player';

type ModelId = keyof typeof PLAYER.models;

/**
 * A copy left behind to run the base. Wanders near home, glows in its own visor color, and says
 * hello (a bounce and sparkle) when you walk into it.
 */
export class Npc {
  readonly zone: Phaser.GameObjects.Zone;
  readonly body: Phaser.Physics.Arcade.Body;
  readonly sprite: Phaser.GameObjects.Sprite;
  private shadow: Phaser.GameObjects.Image;
  private light: Light;
  private key: string;
  private target = new Phaser.Math.Vector2();
  private nextMoveAt = 0;
  private greetedAt = 0;
  private headY: number;

  constructor(private scene: PlanetScene, readonly save: ReplicantSave, x: number, y: number, private homeX: number, private homeY: number) {
    const model = PLAYER.models[(save.model in PLAYER.models ? save.model : PLAYER.model) as ModelId];
    this.headY = model.headY;
    this.key = bodyVariant(model.sprite, save.traits.feature ?? PLAYER.feature[1], save.traits.cape ?? PLAYER.cape[1]);
    this.zone = scene.add.zone(x, y, 8, 5);
    scene.physics.add.existing(this.zone);
    this.body = this.zone.body as Phaser.Physics.Arcade.Body;
    this.shadow = scene.add.image(x, y, 'shadow').setAlpha(0.45).setTint(PALETTE[25]).setDepth(50);
    this.sprite = scene.add.sprite(x, y, model.sprite).setOrigin(0.5, 1);
    this.sprite.play({ key: anim(this.key, 'idle'), startFrame: Math.floor(Math.random() * 4) });
    this.light = scene.lighting.add({ x, y, radius: 34, color: PALETTE[save.traits.feature ?? 10], intensity: 0.55, flicker: 0.1 });
    this.target.set(x, y);
    this.nextMoveAt = scene.time.now + 600 + Math.random() * 2000;
    this.sync();
  }

  get x() { return this.body.center.x; }
  get y() { return this.body.center.y; }

  update(time: number) {
    const speed = 34 * (this.save.stats?.speed ?? 1);
    const d = new Phaser.Math.Vector2(this.target.x - this.x, this.target.y - this.y);
    const moving = d.length() > 3;
    if (moving) {
      d.setLength(speed);
      this.body.setVelocity(d.x, d.y);
      if (Math.abs(d.x) > 2) this.sprite.setFlipX(d.x < 0);
    } else {
      this.body.setVelocity(0, 0);
      if (time > this.nextMoveAt) this.pickTarget(time);
    }
    // stuck against something: give up and pick somewhere else
    if (moving && this.body.blocked.none === false) this.pickTarget(time);
    const want = anim(this.key, moving ? 'walk' : 'idle');
    if (this.sprite.anims.currentAnim?.key !== want) this.sprite.play(want, true);

    // say hello when the player bumps into us
    const p = this.scene.player;
    if (p.alive && Math.hypot(p.x - this.x, p.y - this.y) < 12 && time - this.greetedAt > 1500) {
      this.greetedAt = time;
      this.sprite.setFlipX(p.x < this.x);
      squash(this.scene, this.sprite, 0.75, 1.3, 120);
      this.scene.fx.sparks(this.x, this.y + this.headY, PALETTE[this.save.traits.feature ?? 10], 6);
      this.nextMoveAt = time + 1200;
      this.target.set(this.x, this.y);
    }
    this.sync();
  }

  private pickTarget(time: number) {
    const a = Math.random() * Math.PI * 2, r = 20 + Math.random() * 60;
    const tx = this.homeX + Math.cos(a) * r, ty = this.homeY + Math.sin(a) * r * 0.6;
    if (this.scene.isWalkable(tx, ty)) this.target.set(tx, ty);
    this.nextMoveAt = time + 1500 + Math.random() * 3500;
  }

  /** Little hop used when the copy is created or delivers embers. */
  hop() {
    squash(this.scene, this.sprite, 0.7, 1.35, 140);
  }

  sync() {
    const x = Math.round(this.x), y = Math.round(this.y);
    this.sprite.setPosition(x, y + 3).setDepth(100 + y);
    this.shadow.setPosition(x, y + 2);
    this.light.x = x;
    this.light.y = y + this.headY;
  }
}
