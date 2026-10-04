// Replication drift: a copy is its parent plus one or two small, visible changes.
import driftJson from '../data/drift.json';
import { PLAYER } from './data';
import type { ReplicantSave } from '../net/store';

export const DRIFT = driftJson;

const pickOther = (list: number[][], current: number) => {
  const options = list.map((c) => c[1]).filter((c) => c !== current);
  return options[Math.floor(Math.random() * options.length)];
};
const between = (min: number, max: number) => min + Math.random() * (max - min);
const round2 = (v: number) => Math.round(v * 100) / 100;

/** Build a new NPC copy of `parent`. Always at least one visible change so copies never look identical. */
export function makeCopy(parent: ReplicantSave, siblings: number, star: string, planetIndex: number, x: number, y: number): Omit<ReplicantSave, 'id'> {
  const t = parent.traits, s = parent.stats ?? {};
  const traits = { awake: true, feature: t.feature ?? PLAYER.feature[1], cape: t.cape ?? PLAYER.cape[1], drift: [] as string[] };
  const stats = { speed: s.speed ?? 1, maxHp: s.maxHp ?? 0, work: s.work ?? 1 };

  let visible = false;
  if (Math.random() < DRIFT.visorChance) { traits.feature = pickOther(PLAYER.featureColors, traits.feature); traits.drift.push('visor'); visible = true; }
  if (Math.random() < DRIFT.capeChance) { traits.cape = pickOther(PLAYER.capeColors, traits.cape); traits.drift.push('cape'); visible = true; }
  if (!visible) { traits.cape = pickOther(PLAYER.capeColors, traits.cape); traits.drift.push('cape'); }

  if (Math.random() < DRIFT.speed.chance) {
    const d = between(DRIFT.speed.min, DRIFT.speed.max);
    stats.speed = round2(stats.speed * (1 + d));
    traits.drift.push(d >= 0 ? 'speed+' : 'speed-');
  }
  if (Math.random() < DRIFT.maxHp.chance) {
    const d = DRIFT.maxHp.values[Math.floor(Math.random() * DRIFT.maxHp.values.length)];
    stats.maxHp = Math.max(-2, Math.min(3, stats.maxHp + d));
    traits.drift.push(d >= 0 ? 'hp+' : 'hp-');
  }
  if (Math.random() < DRIFT.work.chance) {
    const d = between(DRIFT.work.min, DRIFT.work.max);
    stats.work = round2(Math.max(0.5, stats.work * (1 + d)));
    traits.drift.push(d >= 0 ? 'work+' : 'work-');
  }

  const base = parent.name.replace(/ \d+$/, '');
  return {
    profile_id: null,
    parent_id: parent.id,
    generation: (parent.generation ?? 0) + 1,
    status: 'npc',
    name: `${base} ${siblings + 2}`,
    model: parent.model,
    traits,
    stats,
    star_id: star,
    planet_index: planetIndex,
    pos_x: x,
    pos_y: y,
  };
}

/** Embers produced by NPC copies between `tick` and now (ms), capped by what fits in the cache. */
export function accrue(npcs: ReplicantSave[], tick: number, now: number, cache: number) {
  const period = DRIFT.emberEveryMinutes * 60_000;
  if (!npcs.length || now <= tick) return { cache, tick: now };
  const work = npcs.reduce((sum, n) => sum + (n.stats?.work ?? 1), 0);
  const periods = Math.floor((now - tick) / period);
  const gained = Math.floor(periods * work);
  const next = Math.min(DRIFT.cacheCap, cache + gained);
  // Keep the leftover partial period so time is never lost (unless the cache is full)
  return { cache: next, tick: next >= DRIFT.cacheCap ? now : tick + periods * period };
}
