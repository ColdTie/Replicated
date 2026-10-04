// Generated sprite manifest (written by tools/gen-sprites.mjs).

export interface SpriteEntry {
  frameWidth: number;
  frameHeight: number;
  frames: number;
  animations: Record<string, { fps: number; frames: number[]; repeat?: number }>;
  tinted: boolean;
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

export const anim = (texKey: string, name: string) => `${texKey}:${name}`;
