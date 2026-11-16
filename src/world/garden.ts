// Seeds in the warren's planters (Ember Gold's wish, carried 2026-11-15; src/data/mind.json day.plants). A copy plants
// one in a day of life (the mind function's plant / tend_plant) and it grows by the clock; the game only shows it.
import { MIND } from '../core/data';
import type { PlantRow } from '../net/store';

/** How far a plant has grown: the index of its stage in mind.json day.plants.stages (days since planting, plus tending). */
export function plantStage(pl: PlantRow, now = Date.now()): number {
  const days = (now - pl.at + (pl.tended ?? 0)) / 86_400_000;
  let st = 0;
  MIND.day.plants.stages.forEach((x, i) => { if (days >= x.days) st = i; });
  return st;
}

/** The leafy shape for a stage, as pixels above the planter's soil: [dx, dy, role] (dy up from the soil; role 0 stem,
 * 1 leaf, 2 leaf light, 3 bloom). */
export function plantPixels(stage: number): [number, number, number][] {
  if (stage <= 0) return [[0, 0, 0], [-1, 0, 0]];
  const px: [number, number, number][] = [];
  const h = stage === 1 ? 2 : stage === 2 ? 5 : 8;
  for (let y = 0; y < h; y++) px.push([0, y, 0]);
  const pairs = stage === 1 ? [1] : stage === 2 ? [2, 4] : [2, 4, 6, 7];
  for (const y of pairs) {
    const w = stage === 3 && y <= 4 ? 3 : 2;
    for (let x = 1; x <= w; x++) { px.push([-x, y + (x > 1 ? 1 : 0), x === w ? 2 : 1]); px.push([x, y + (x > 1 ? 1 : 0), x === w ? 2 : 1]); }
  }
  px.push([0, h, 2]);
  if (stage >= 3) px.push([0, h + 1, 3], [-1, h + 1, 3], [1, h + 1, 3], [0, h + 2, 3]);
  return px;
}
