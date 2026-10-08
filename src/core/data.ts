// Typed access to the JSON content under src/data.
import paletteJson from '../data/palette.json';
import planetsJson from '../data/planets.json';
import playerJson from '../data/player.json';
import enemiesJson from '../data/enemies.json';
import itemsJson from '../data/items.json';
import structuresJson from '../data/structures.json';
import backendJson from '../data/backend.json';
import dayJson from '../data/daycycle.json';
import villageJson from '../data/village.json';
import beaconJson from '../data/beacon.json';
import mindJson from '../data/mind.json';
import warrenJson from '../data/warren.json';

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
  dayCycle?: boolean;
  ponds?: number;
  flowers?: number;
  wildlife?: { grazers: number; birds: number; butterflies: number };
  weather?: boolean;
  /** Polar caps seen from orbit: size 0..1 of the way from equator to pole, colors = [edge, core] palette indexes. Missing = none. */
  poles?: { size: number; colors: [number, number] };
  /** A beacon world: the plaza, the monolith and its keeper are placed on it (set by planetFor) */
  beacon?: boolean;
}

export type SkitterDef = (typeof enemiesJson)['skitter'];
export type HopperDef = (typeof enemiesJson)['hopper'];
export type SpitterDef = (typeof enemiesJson)['spitter'];
export type EnemyDef = SkitterDef | HopperDef | SpitterDef;

export const PALETTE: number[] = paletteJson.colors.map((h) => parseInt(h, 16));
export const PLANETS = planetsJson.planets as unknown as PlanetDef[];
export const PLAYER = playerJson;
export const ENEMIES = enemiesJson as unknown as Record<string, EnemyDef>;
export const ITEMS = itemsJson;
export const STRUCTURES = structuresJson;
export const BACKEND = backendJson;
export const DAYCYCLE = dayJson;
export const VILLAGE = villageJson;
export const WARREN = warrenJson;
export const BEACON = beaconJson;
export const MIND = mindJson;
export type GuardianDef = (typeof beaconJson)['guardian'];

export const hex = (s: string) => parseInt(s, 16);
export const accentColor = (p: PlanetDef, i: 0 | 1 | 2) => PALETTE[p.accent[i]];
