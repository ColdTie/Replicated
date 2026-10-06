// A star's planetary system: the confirmed planets from the catalog (src/data/stars.json) where astronomers have
// found them, otherwise worlds generated from the star's id. Every planet is a destination; around a gas or ice
// giant you land on one of its moons.
import BIOMES from '../data/biomes.json';
import STARS from '../data/stars.json';

export type PlanetKind = 'rock' | 'super' | 'neptune' | 'giant';
export type Temp = 'hot' | 'warm' | 'cold';

export interface CatalogPlanet { letter: string; kind: PlanetKind; period: number; hz?: boolean; name?: string; moon?: string; biome?: string }

export interface SystemPlanet {
  star: string;
  index: number;         // 1-based, in orbit order (planet_index in saves)
  letter: string;
  name: string;          // "PROXIMA CENTAURI B", or an IAU name such as "DIMIDIUM"
  kind: PlanetKind;
  real: boolean;         // confirmed by astronomers (false: generated)
  period: number;        // orbital period in days
  hz: boolean;           // in the habitable zone
  temp: Temp;
  moon?: string;         // giants: the moon you land on
  landing: string;       // the name of the world you walk on (the planet, or its moon)
  biome: string;         // biome id of that world ('earth' for Earth)
  seed: number;
  size: number;          // relative draw size (Earth = 1)
}

export const BIOME_IDS = BIOMES.biomes.map((b) => b.id);

export function hashId(id: string) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Small deterministic rng from a string. */
function rngFrom(key: string) {
  let s = hashId(key) || 1;
  return () => {
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

/** Habitable-zone orbital periods (days) by spectral class letter: [inner, outer]. Giant stars (III) are wider. */
function hzPeriod(cls: string): [number, number] {
  const base: Record<string, [number, number]> = {
    M: [6, 45], K: [40, 200], G: [180, 700], F: [400, 1500], A: [900, 3500], B: [2000, 8000], O: [4000, 15000],
  };
  const [lo, hi] = base[cls[0]] ?? base.G;
  const k = /III/.test(cls) ? 4 : /IV/.test(cls) ? 1.6 : 1;
  return [lo * k, hi * k];
}

function tempFor(period: number, cls: string): Temp {
  const [lo, hi] = hzPeriod(cls);
  if (period < lo * 0.55) return 'hot';
  if (period > hi * 2.6) return 'cold';
  return 'warm';
}

function pick<T>(r: number, weights: [T, number][]): T {
  const total = weights.reduce((s, w) => s + w[1], 0);
  let acc = 0;
  for (const [v, w] of weights) { acc += w / total; if (r < acc) return v; }
  return weights[weights.length - 1][0];
}

function biomeFor(kind: PlanetKind, temp: Temp, hz: boolean, r: number): string {
  const onMoon = kind === 'giant' || kind === 'neptune';
  if (temp === 'hot') return pick(r, onMoon ? [['moon', 3], ['ember', 1]] : [['ember', 3], ['moon', 1]]);
  if (temp === 'cold') return pick(r, [['frost', 3], ['moon', 2]]);
  if (hz) return pick(r, [['verdant', 5], ['spore', 2], ['dune', 2]]);
  return pick(r, [['verdant', 2], ['spore', 2], ['dune', 3], ['frost', 1]]);
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];

/** Stars with saved worlds from before planetary systems existed (live family data, 2026-10-06). */
const LEGACY_WORLDS = ['sol', 'alpha-cen', 'fomalhaut', 'eta-cassiopeiae', 'pollux', 'regulus'];

function biomeFits(biome: string, temp: Temp) {
  if (temp === 'hot') return ['ember', 'moon', 'dune'].includes(biome);
  if (temp === 'cold') return ['frost', 'moon'].includes(biome);
  return true;
}

const cache = new Map<string, SystemPlanet[]>();

/** All planets of a star in orbit order (index 1..n). Empty when the star is unknown. */
export function systemFor(starId: string): SystemPlanet[] {
  const hit = cache.get(starId);
  if (hit) return hit;
  const star = STARS.stars.find((s) => s.id === starId) as (typeof STARS.stars)[number] & { planets?: CatalogPlanet[] } | undefined;
  if (!star) return [];
  const starHash = hashId(star.id);
  const legacyBiome = BIOME_IDS[starHash % BIOME_IDS.length];
  const legacySeed = starHash % 100000;

  let entries: CatalogPlanet[];
  if (star.planets?.length) entries = star.planets;
  else {
    // generated: 1 to 4 worlds on roughly geometric orbits, starting hot or warm
    const r = rngFrom(star.id + ':system');
    const [lo] = hzPeriod(star.cls);
    const n = 1 + Math.floor(r() * 4);
    let period = lo * (0.12 + r() * 0.6);
    entries = [];
    for (let i = 0; i < n; i++) {
      const kind = pick<PlanetKind>(r(), [['rock', 4], ['super', 3], ['neptune', 1.5], ['giant', 1.5]]);
      entries.push({ letter: String.fromCharCode(98 + i), kind, period: Math.round(period * 10) / 10 });
      period *= 1.7 + r() * 1.1;
    }
  }

  const planets = entries.map((e, i): SystemPlanet => {
    const index = i + 1;
    const r = rngFrom(`${star.id}:${index}`);
    const temp = tempFor(e.period, star.cls);
    const onMoon = e.kind === 'giant' || e.kind === 'neptune';
    const hz = !!e.hz;
    const name = e.name ?? `${star.name} ${e.letter.toUpperCase()}`;
    const moon = onMoon ? (e.moon ?? `${name} ${ROMAN[Math.floor(r() * 3)]}`) : undefined;
    // the first planet of a star the family had already settled before systems existed keeps the biome the game
    // used then, so those worlds stay exactly as they were; everywhere else the world type follows its orbit
    const legacy = index === 1 && (LEGACY_WORLDS.includes(star.id) || biomeFits(legacyBiome, temp));
    const biome = e.biome ?? (legacy ? legacyBiome : biomeFor(e.kind, temp, hz, r()));
    const seed = index === 1 ? legacySeed : hashId(`${star.id}:${index}`) % 100000;
    const size = e.kind === 'giant' ? 2.0 + r() * 0.5 : e.kind === 'neptune' ? 1.5 + r() * 0.3 : e.kind === 'super' ? 1.1 + r() * 0.3 : 0.65 + r() * 0.35;
    return {
      star: star.id, index, letter: e.letter, name, kind: e.kind, real: !!star.planets?.length, period: e.period,
      hz, temp, moon, landing: moon ?? name, biome: star.id === 'sol' && index === 3 ? 'earth' : biome, seed, size: Math.round(size * 100) / 100,
    };
  });
  cache.set(starId, planets);
  return planets;
}

export function planetAt(starId: string, index: number) {
  return systemFor(starId).find((p) => p.index === index);
}

/** True when the planet has a habitable-zone or temperate surface (used for map hints). */
export const isTemperate = (p: SystemPlanet) => p.temp === 'warm';
