// The Cems' design catalog in the game (src/data/designs.json; the models and the drawing are src/world/voxel.ts):
// each design's model built once, what stands on this world, which designs are open, and the drawings as textures.
import Phaser from 'phaser';
import CATALOG from '../data/designs.json';
import { PALETTE } from './data';
import { buildModel, printMs, renderModel, turntableSize, type Catalog, type Model, type Rendered } from '../world/voxel';

export const CAT = CATALOG as unknown as Catalog & { view: Catalog['view'] & { yaw: number }; gives: { houseMood: number; houseMoodMax: number; storehouseCap: number } };
const RGB = PALETTE.map((c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255] as [number, number, number]);
const models = new Map<string, Model>();

/** The model of a design (built on first use). */
export function designModel(id: string): Model | undefined {
  if (!models.has(id)) {
    const def = CAT.designs.find((d) => d.id === id);
    if (!def) return undefined;
    models.set(id, buildModel(def, CAT));
  }
  return models.get(id);
}

export const DESIGNS = CAT.designs;

/** The world's 3/4 view of a design: `cut` voxels printed (the rest a lattice), the last `alive` of them still Cems. */
export function worldView(m: Model, cut?: number, alive = 0): Rendered {
  return renderModel(m, CAT, { yaw: CAT.view.yaw, pitch: CAT.view.pitch, ppv: CAT.view.ppv, cut, alive, palette: RGB, light: CAT.view.light });
}

/** One turn of the menu's turntable on a canvas that holds every turn. */
export function turntableView(m: Model, yaw: number, ppv: number, size = turntableSize(m, CAT.view.turntablePitch, ppv)): Rendered {
  return renderModel(m, CAT, { yaw, pitch: CAT.view.turntablePitch, ppv, size, palette: RGB, light: CAT.view.light });
}

/** Writes a drawing into a canvas texture (made or resized as needed). */
export function paintTexture(scene: Phaser.Scene, key: string, r: { width: number; height: number; data: Uint8ClampedArray<ArrayBuffer> }) {
  let ct = scene.textures.exists(key) ? (scene.textures.get(key) as Phaser.Textures.CanvasTexture) : null;
  if (ct && (ct.width !== r.width || ct.height !== r.height)) { scene.textures.remove(key); ct = null; }
  ct ??= scene.textures.createCanvas(key, r.width, r.height)!;
  ct.getContext().putImageData(new ImageData(r.data, r.width, r.height), 0, 0);
  ct.refresh();
  return key;
}

/** Print time on a world with this many Cem Nurseries (ms). */
export const designPrintMs = (m: Model, nurseries: number) => printMs(m, CAT, nurseries);

/** Which designs a world can print: those whose needs all stand there (built). */
export function designOpen(id: string, built: Set<string>) {
  const def = CAT.designs.find((d) => d.id === id);
  return !!def && (def.needs ?? []).every((n) => built.has(n));
}

/** The names of what a design still waits for ("WORKSHOP", ...). */
export function designNeeds(id: string, built: Set<string>) {
  const def = CAT.designs.find((d) => d.id === id);
  return (def?.needs ?? []).filter((n) => !built.has(n)).map((n) => CAT.designs.find((d) => d.id === n)?.name.toUpperCase() ?? n.toUpperCase());
}
