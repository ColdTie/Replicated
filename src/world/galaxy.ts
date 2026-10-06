// The real neighborhood: star lookup, distances, travel time and fuel, and the planet each star gets.
import BIOMES from '../data/biomes.json';
import STARS from '../data/stars.json';
import TRAVEL from '../data/travel.json';
import { PLANETS, hex, type PlanetDef } from '../core/data';
import { rgb } from '../fx/textures';
import { planetAt, systemFor, type CatalogPlanet } from './system';

export interface Star { id: string; name: string; cls: string; ly: number; x: number; y: number; z: number; beacon?: boolean; planets?: CatalogPlanet[] }

export const STAR_LIST = STARS.stars as Star[];
export const BEACONS = STARS.beacons;
export { TRAVEL };

export const starById = (id: string) => STAR_LIST.find((s) => s.id === id);

export function distanceLy(a: string, b: string) {
  const s = starById(a), t = starById(b);
  if (!s || !t) return 0;
  return Math.hypot(s.x - t.x, s.y - t.y, s.z - t.z);
}

/** Trip length in milliseconds. fixedSeconds > 0 makes every trip that long; otherwise real time (?fast: minutes become seconds). */
export function travelMs(ly: number) {
  if (TRAVEL.fixedSeconds > 0) return TRAVEL.fixedSeconds * 1000;
  // a hop between planets of the same star is a short trip, not a free one
  const minutes = ly < 0.01 ? TRAVEL.inSystemMinutes : TRAVEL.minutesAtRef * Math.pow(ly / TRAVEL.refLy, TRAVEL.exponent);
  const fast = new URLSearchParams(location.search).has('fast');
  return Math.round(minutes * (fast ? 1000 : 60_000));
}

export const fuelFor = (ly: number) => Math.round(TRAVEL.fuelBase + TRAVEL.fuelPerLy * ly);

/** "45 MIN", "9 H 40 MIN", "6 DAYS 2 H" */
export function formatDuration(ms: number) {
  const m = Math.max(0, Math.round(ms / 60_000));
  if (m < 1) return `${Math.max(0, Math.round(ms / 1000))} SEC`;
  if (m < 60) return `${m} MIN`;
  const h = Math.floor(m / 60), mm = m % 60;
  if (h < 48) return mm ? `${h} H ${mm} MIN` : `${h} H`;
  const d = Math.floor(h / 24), hh = h % 24;
  return hh ? `${d} DAYS ${hh} H` : `${d} DAYS`;
}

function mix(a: string, b: string, t: number) {
  const x = rgb(hex(a)), y = rgb(hex(b));
  return x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

/** Star light color for a spectral class, as [hex, strength]. */
export function starLight(cls: string): [string, number] {
  const table = TRAVEL.starLight as unknown as Record<string, [string, number]>;
  return table[cls[0]] ?? table.G;
}

/** The world you land on: a hand-made one from planets.json (Earth), else the system's planet (or a giant's moon). */
export function planetFor(starId: string, planetIndex: number): PlanetDef | undefined {
  const fixed = PLANETS.find((p) => p.star === starId && p.planetIndex === planetIndex);
  if (fixed) return fixed;
  const star = starById(starId);
  if (!star) return undefined;
  const sp = planetAt(starId, planetIndex) ?? systemFor(starId)[0];
  if (!sp) return undefined;
  const biome = BIOMES.biomes.find((b) => b.id === sp.biome) ?? BIOMES.biomes[0];
  const [light, k] = starLight(star.cls);
  const subtitle = star.beacon ? 'A BEACON BURNS HERE' : sp.moon ? `MOON OF ${sp.name}` : biome.subtitle;
  const def = {
    ...structuredClone(biome),
    name: sp.landing,
    subtitle,
    star: star.id,
    planetIndex: sp.index,
    seed: sp.seed,
    ambient: mix(biome.ambient, light, k),
    sky: biome.sky.map((c, i) => (i === 0 ? c : mix(c, light, k * 0.6))),
    intro: 'land',
    dayCycle: false,
    weather: false,
  } as unknown as PlanetDef;
  // Beacon systems hold enormous resources
  if (star.beacon) def.resourceNodes *= 3;
  return def;
}

/** The planet a ship lands on at a star when none was chosen: Earth at Sol, else the first planet. */
export function defaultPlanetIndex(starId: string) {
  return starId === 'sol' ? 3 : TRAVEL.landedPlanetIndex;
}

export const BIOME_LIST = BIOMES.biomes;
