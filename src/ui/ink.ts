// The dark edge under the game's small text (src/data/light.json ink): the counters, the place and who lives here,
// title cards, notices and what a printer waits for are drawn straight over the world, and pale ground (salt flats,
// snow, a bright day) swallowed them.
import type Phaser from 'phaser';
import LIGHT from '../data/light.json';

const COLOR = parseInt(LIGHT.ink.color, 16);

/** Gives a bitmap text its dark edge, one pixel down and right. */
export function ink<T extends Phaser.GameObjects.BitmapText>(t: T): T {
  return t.setDropShadow(1, 1, COLOR, LIGHT.ink.alpha) as T;
}

/** How far a counter fades while nothing changes: further while it stands at zero. */
export const idleAlpha = (n: number) => (n > 0 ? LIGHT.ink.idle : LIGHT.ink.zero);
