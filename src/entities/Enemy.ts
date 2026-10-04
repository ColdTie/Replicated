import type Phaser from 'phaser';

/** What PlanetScene needs from any creature. */
export interface Enemy {
  readonly zone: Phaser.GameObjects.Zone;
  readonly body: Phaser.Physics.Arcade.Body;
  readonly x: number;
  readonly y: number;
  readonly alive: boolean;
  /** False while the creature can't be hit (e.g. mid-air). */
  readonly hittable?: boolean;
  update(time: number, dt: number): void;
  hit(damage: number, dir: Phaser.Math.Vector2, knockback: number): void;
  sync(): void;
}
