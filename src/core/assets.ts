// Generated sprite manifest (written by tools/gen-sprites.mjs).

export interface SpriteEntry {
  frameWidth: number;
  frameHeight: number;
  frames: number;
  animations: Record<string, { fps: number; frames: number[]; repeat?: number }>;
  tinted: boolean;
  featured?: boolean;
  variants?: Record<string, number>;
  files: Record<string, string>;
}

export interface Manifest {
  sprites: Record<string, SpriteEntry>;
  font: { file: string; width: number; height: number; chars: string } | null;
}

export const GEN_URL = `${import.meta.env.BASE_URL}assets/gen/`;

let manifest: Manifest;
export const setManifest = (m: Manifest) => (manifest = m);
export const getManifest = () => manifest;

/** Texture key for a sprite on a planet: tinted sprites have one texture per planet. */
export function tex(name: string, planetId: string): string {
  return manifest.sprites[name]?.tinted ? `${name}.${planetId}` : name;
}

/**
 * Animation prefix for a replicant body in a visor x cape color. The texture is the sprite name; the
 * variant picks the row. Falls back to the first variant when a color isn't in the palette lists.
 */
export function bodyVariant(name: string, visor: number, cape: number): string {
  const s = manifest.sprites[name];
  if (!s?.variants) return name;
  const v = `f${visor}.c${cape}`;
  return `${name}.${v in s.variants ? v : Object.keys(s.variants)[0]}`;
}

export const anim = (texKey: string, name: string) => `${texKey}:${name}`;
