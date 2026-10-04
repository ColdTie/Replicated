// Typed access to the JSON content under src/data.
import paletteJson from '../data/palette.json';
import planetsJson from '../data/planets.json';
import playerJson from '../data/player.json';
import enemiesJson from '../data/enemies.json';
import itemsJson from '../data/items.json';
import structuresJson from '../data/structures.json';
import backendJson from '../data/backend.json';
import galaxyJson from '../data/galaxy.gen.json';
import travelJson from '../data/travel.json';

export interface PlanetDef {
  id: string;
  name: string;
  subtitle: string;
  star: string;
  planetIndex: number;
  seed: number;
  accent: [number, number, number];
  ground?: [number, number, number];
  ambient: string;
  sky: string[];
  size: [number, number];
  islandRadius: number;
  rockThreshold: number;
  ruins: number;
  resourceNodes: number;
  enemies: Record<string, number>;
  decorDensity: number;
  sporeRate: number;
  trees: number;
  towers: number;
  intro: 'wake' | 'land';
  beacon?: boolean;
  /** accent + ground palette, selects the tinted sprite set */
  paletteKey: string;
}

export interface StarDef {
  id: string;
  name: string;
  type: string;
  dist: number;
  x: number;
  y: number;
  z: number;
  beacon: boolean;
}

export type SkitterDef = (typeof enemiesJson)['skitter'];
export type HopperDef = (typeof enemiesJson)['hopper'];
export type EnemyDef = SkitterDef | HopperDef;

export const PALETTE: number[] = paletteJson.colors.map((h) => parseInt(h, 16));
const paletteKey = (p: { accent: number[]; ground?: number[] }) => `${p.accent.join('-')}_${(p.ground ?? [25, 24, 23]).join('-')}`;
type RawPlanet = Omit<PlanetDef, 'paletteKey'>;
const withKey = (p: RawPlanet): PlanetDef => ({ ...p, paletteKey: paletteKey(p) });

/** Hand-made planets first (Earth is the default start), then one generated planet per other star. */
export const PLANETS: PlanetDef[] = [
  ...(planetsJson.planets as unknown as RawPlanet[]).map(withKey),
  ...(galaxyJson.planets as unknown as RawPlanet[]).map(withKey),
];
export const STARS = galaxyJson.stars as StarDef[];
export const TRAVEL = travelJson;
export const starById = (id: string) => STARS.find((s) => s.id === id);
export const planetAt = (star: string, planetIndex: number) => PLANETS.find((p) => p.star === star && p.planetIndex === planetIndex);
/** The landable planet of a star (the hand-made one if there is one). */
export const planetOfStar = (star: string) => PLANETS.find((p) => p.star === star);
export const PLAYER = playerJson;
export const ENEMIES = enemiesJson as unknown as Record<string, EnemyDef>;
export const ITEMS = itemsJson;
export const STRUCTURES = structuresJson;
export const BACKEND = backendJson;

export const hex = (s: string) => parseInt(s, 16);
export const accentColor = (p: PlanetDef, i: 0 | 1 | 2) => PALETTE[p.accent[i]];
