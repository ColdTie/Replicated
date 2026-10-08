// Replication drift: a copy inherits its parent's look and stats, then changes a little.
import DRIFT from '../data/drift.json';
import { PLAYER } from './data';
import { PARTS } from './body';
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

/**
 * Make the copy's row (not yet saved). Since session 9 a copy is born blank: a grey android with no visor color,
 * headgear, trail, voice or name of its own, and only a small stat drift. It chooses all of that on its first wake
 * (the becoming); until then it stands dim and still by the Replicator. (The old inherit-and-drift look is still
 * what the first copies on Earth have.)
 */
export function replicate(parent: ReplicantSave, star: string, planetIndex: number, x: number, y: number): Omit<ReplicantSave, 'id'> {
  const stats: Stats = {};
  for (const [k, d] of Object.entries(DRIFT.stats) as [StatKey, { drift: number; min: number; max: number }][]) {
    const base = stat(parent, k);
    const v = base * (1 + (Math.random() * 2 - 1) * d.drift * DRIFT.blankDrift);
    stats[k] = Math.round(Math.min(d.max, Math.max(d.min, v)) * 100) / 100;
  }
  const generation = (parent.generation ?? 0) + 1;
  return {
    profile_id: null,
    parent_id: parent.id,
    generation,
    name: copyName(parent.name, generation),
    model: parent.model,
    traits: { v: 1, awake: true, blank: true, body: { ...PARTS.blank } },
    stats,
    status: 'npc',
    star_id: star,
    planet_index: planetIndex,
    pos_x: Math.round(x),
    pos_y: Math.round(y),
  };
}
