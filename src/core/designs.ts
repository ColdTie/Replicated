// The Cems' design catalog in the game (src/data/designs.json; the models and the drawing are src/world/voxel.ts):
// each design's model built once, what stands on this world, which designs are open, and the drawings as textures.
import Phaser from 'phaser';
import CATALOG from '../data/designs.json';
import { PALETTE } from './data';
import { buildModel, printMs, renderModel, turntableSize, type Catalog, type DesignDef, type Model, type Rendered } from '../world/voxel';

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

/** What a copy's blueprint asks for, as the Cems read it (src/net/store.ts Building). */
export interface BlueprintSpec { id: string; name: string; purpose?: string; w: number; h: number; material: string; roof: string; door: string; kind?: string }
const WALLS: Record<string, string> = { wood: 'lignin', stone: 'salt', scrap: 'steel' };
const blueprints = new Map<string, Model>();

/**
 * A copy's blueprint printed by the Cems (one building system: where a bed is awake, the copies' buildings are printed
 * too): its footprint in voxels at the world's scale (4 a tile across, about 4 a tile deep), walls of the material it
 * chose as the Cems lay it (wood as lignin, stone as pale salt, scrap as steel), its roof, its door on its side, warm
 * windows across its front; a Lookout gets its tower. Built once per building.
 */
export function blueprintModel(b: BlueprintSpec): Model {
  const key = `${b.id}:${b.w}x${b.h}:${b.material}:${b.roof}:${b.door}`;
  const have = blueprints.get(key);
  if (have) return have;
  const W = b.w * 4, D = Math.max(6, Math.round(b.h * 3.8)), H = 4 + Math.min(4, b.h), wall = WALLS[b.material] ?? 'lignin';
  const parts: DesignDef['parts'] = [
    { box: [0, 0, 0, W, D, 1], mat: 'salt' },
    { box: [1, 1, 1, W - 2, D - 2, H], mat: wall },
  ];
  if (b.roof === 'peaked') parts.push({ gable: [0, 0, H + 1, W, D, Math.max(3, Math.ceil(D / 2))], ridge: 'x', mat: 'roof' });
  else if (b.roof === 'dome') parts.push({ box: [1, 1, H + 1, W - 2, D - 2, 1], mat: 'roof' }, { dome: [2, 2, H + 2, W - 4, D - 4, Math.max(3, Math.round(Math.min(W, D) / 2.5))], mat: b.kind === 'lookout' ? 'glass' : 'steel' });
  else parts.push({ box: [0, 0, H + 1, W, D, 1], mat: 'roof' }, { box: [1, 1, H + 2, W - 2, D - 2, 1], mat: 'moss' });
  const doorH = Math.min(4, H - 1);
  if (b.door === 'west') parts.push({ paint: [1, Math.floor(D / 2) - 1, 1, 1, 2, doorH], mat: 'door' });
  else if (b.door === 'east') parts.push({ paint: [W - 2, Math.floor(D / 2) - 1, 1, 1, 2, doorH], mat: 'door' });
  else parts.push({ paint: [Math.floor(W / 2) - 1, 1, 1, 2, 1, doorH], mat: 'door' });
  // a window either side of the middle of the front, when it is wide enough
  if (W >= 10) parts.push({ paint: [2, 1, H - 2, 2, 1, 2], mat: 'warm' }, { paint: [W - 4, 1, H - 2, 2, 1, 2], mat: 'warm' });
  if (b.kind === 'lookout') parts.push({ cyl: [Math.floor(W / 2) - 2, Math.floor(D / 2) - 2, H + 2, 4, 4, 8], mat: wall }, { box: [Math.floor(W / 2) - 1, Math.floor(D / 2) - 1, H + 10, 2, 2, 2], mat: 'ember' });
  const m = buildModel({ id: `bp:${b.id}`, name: b.name, gives: '', about: b.purpose ?? '', parts }, CAT);
  blueprints.set(key, m);
  return m;
}

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
