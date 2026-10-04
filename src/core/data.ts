// Typed access to the JSON content under src/data.
import paletteJson from '../data/palette.json';
import planetsJson from '../data/planets.json';
import playerJson from '../data/player.json';
import enemiesJson from '../data/enemies.json';
import itemsJson from '../data/items.json';

export interface PlanetDef {
  id: string;
  name: string;
  subtitle: string;
  seed: number;
  accent: [number, number, number];
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
}

export type EnemyDef = (typeof enemiesJson)['skitter'];

export const PALETTE: number[] = paletteJson.colors.map((h) => parseInt(h, 16));
export const PLANETS = planetsJson.planets as unknown as PlanetDef[];
export const PLAYER = playerJson;
export const ENEMIES = enemiesJson as Record<string, EnemyDef>;
export const ITEMS = itemsJson;

export const hex = (s: string) => parseInt(s, 16);
export const accentColor = (p: PlanetDef, i: 0 | 1 | 2) => PALETTE[p.accent[i]];
