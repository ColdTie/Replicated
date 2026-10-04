// Replication drift: a copy inherits its parent's look and stats, then changes a little.
import DRIFT from '../data/drift.json';
import { PLAYER } from './data';
import type { ReplicantSave } from '../net/store';

export { DRIFT };
export type StatKey = keyof typeof DRIFT.stats;
export type Stats = Partial<Record<StatKey, number>>;

const pick = <T>(arr: readonly T[], not?: T) => {
  const options = arr.filter((v) => v !== not);
  return options[Math.floor(Math.random() * options.length)] ?? arr[0];
};

/** Stat multiplier for a replicant (1 when unset). */
export const stat = (r: { stats?: Stats } | null | undefined, k: StatKey) => r?.stats?.[k] ?? 1;

/** Roman-ish suffix so copies have names: STEVE, STEVE II, STEVE III ... */
export function copyName(base: string, generation: number) {
  const roman = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
  const root = base.replace(/\s+[IVX]+$/, '');
  return generation + 1 < roman.length ? `${root} ${roman[generation + 1]}` : `${root} ${generation + 1}`;
}

/** Make the copy's row (not yet saved). */
export function replicate(parent: ReplicantSave, star: string, planetIndex: number, x: number, y: number): Omit<ReplicantSave, 'id'> {
  const pt = parent.traits;
  const visorLights = PLAYER.featureColors.map((f) => f[1]);
  const feature = Math.random() < DRIFT.visorChance ? pick(visorLights, pt.feature) : pt.feature ?? PLAYER.feature[1];
  const gear = Math.random() < DRIFT.gearChance || !pt.gear ? pick(DRIFT.gears, pt.gear) : pt.gear;
  const trail = Math.random() < DRIFT.trailChance || pt.trail === undefined ? pick(DRIFT.trails, pt.trail) : pt.trail;
  const stats: Stats = {};
  for (const [k, d] of Object.entries(DRIFT.stats) as [StatKey, { drift: number; min: number; max: number }][]) {
    const base = stat(parent, k);
    const v = base * (1 + (Math.random() * 2 - 1) * d.drift);
    stats[k] = Math.round(Math.min(d.max, Math.max(d.min, v)) * 100) / 100;
  }
  const generation = (parent.generation ?? 0) + 1;
  return {
    profile_id: null,
    parent_id: parent.id,
    generation,
    name: copyName(parent.name, generation),
    model: parent.model,
    traits: { awake: true, feature, gear, trail },
    stats,
    status: 'npc',
    star_id: star,
    planet_index: planetIndex,
    pos_x: Math.round(x),
    pos_y: Math.round(y),
  };
}
