// The Cems' links between worlds (the Vessels' wishes, the maker 2026-11-19 pm; designs.json cemmind / watchglass).
// The Cem Mind (Tamsin's wish): a letter between two worlds where a finished Cem Mind stands arrives at once, the SCUT
// link (mailSeconds' `scut`). The Watchglass (Watcher's wish): every watch kept on a world where one stands reaches
// every other Watchglass world at light speed; nothing is copied, each world reads the others' archives once the
// light has crossed (arrivedWatches). The Tidewhisper (Vigil's wish, 2026-11-22 am): the nearest other dish's last
// watch hums here a day after its light (tidewhisperPulse). The mind function does the same on its side (supabase/functions/mind).
import type { ArchiveEntry, Building } from '../net/store';
import { distanceLy, type Temper } from '../world/galaxy';

/** One world of the galaxy as the network needs it: its star, planet, buildings and archive. */
export interface NetWorld { star: string; planet: number; buildings?: Partial<Building>[]; archive?: ArchiveEntry[] }

/** A building stands finished: built, or a Cem print whose time is done. */
export function standsDone(b: Partial<Building>, now = Date.now()) {
  if (b.vetoed) return false;
  if (b.built) return true;
  return b.printStart !== undefined && now >= b.printStart + (b.printMs ?? 0);
}

/** Whether a finished design stands on this world. */
export const hasDesign = (w: NetWorld, design: string, now = Date.now()) =>
  (w.buildings ?? []).some((b) => b.design === design && standsDone(b, now));

/** The stars where a finished Cem Mind stands: letters between them go at once. */
export const scutStars = (worlds: NetWorld[], now = Date.now()) =>
  [...new Set(worlds.filter((w) => hasDesign(w, 'cemmind', now)).map((w) => w.star))];

/** The stars where a finished Relay Cairn stands (Tamsin's wish): letters hop between them (galaxy.ts relayHops). */
export const relayStars = (worlds: NetWorld[], now = Date.now()) =>
  [...new Set(worlds.filter((w) => hasDesign(w, 'cairn', now)).map((w) => w.star))];

/** The stars where a finished Tether Beacon stands (Tamsin's wish): a hop from or to one costs a third (galaxy.ts tripCharge). */
export const tetherStars = (worlds: NetWorld[], now = Date.now()) =>
  [...new Set(worlds.filter((w) => hasDesign(w, 'tether', now)).map((w) => w.star))];

/**
 * The Flare Almanac as this world knows it (Watcher's wish): every star's temper from the watches kept here and the
 * ones the Watchglass brought (a watch carries its temper once a Flare Almanac stood where it was kept), by star id;
 * the first word on a star stays, so the next Vessel knows what it will meet.
 */
export function almanacOf(here: { star: string; planet: number }, worlds: NetWorld[], perLy: number, now = Date.now()) {
  const me = worlds.find((w) => w.star === here.star && w.planet === here.planet);
  const entries = [...(me?.archive ?? []), ...arrivedWatches(here, worlds, perLy, now)]
    .filter((a) => a.starId && a.temper).sort((a, b) => a.at - b.at);
  const out: Record<string, { temper: Temper; by: string; at: number }> = {};
  for (const a of entries) if (!out[a.starId!]) out[a.starId!] = { temper: a.temper!, by: a.name, at: a.at };
  return out;
}

/** A watch from another Watchglass world that has reached this one. */
export interface SharedWatch extends ArchiveEntry { fromStar: string; fromPlanet: number; arrives: number }

/**
 * The watches that came here through the Watchglass: kept on another world with a Watchglass after both stood (the
 * later of the two worlds' watches is what counts, so only watches since a Watchglass was there), and whose light
 * has crossed (perLy seconds a light year, at once between two Cem Minds). Newest first.
 */
export function arrivedWatches(here: { star: string; planet: number }, worlds: NetWorld[], perLy: number, now = Date.now()): SharedWatch[] {
  const me = worlds.find((w) => w.star === here.star && w.planet === here.planet);
  if (!me || !hasDesign(me, 'watchglass', now)) return [];
  const scut = scutStars(worlds, now);
  const out: SharedWatch[] = [];
  for (const w of worlds) {
    if (w === me || !hasDesign(w, 'watchglass', now)) continue;
    const since = Math.max(sinceOf(me), sinceOf(w));
    const delay = w.star === here.star || (scut.includes(w.star) && scut.includes(here.star)) ? 0 : distanceLy(w.star, here.star) * perLy * 1000;
    for (const a of w.archive ?? []) {
      const arrives = a.at + delay;
      if (a.at >= since && arrives <= now) out.push({ ...a, fromStar: w.star, fromPlanet: w.planet, arrives });
    }
  }
  return out.sort((a, b) => b.arrives - a.arrives);
}

/** When this world's first Watchglass began (a watch kept before it was sent nowhere). */
function sinceOf(w: NetWorld) {
  const starts = (w.buildings ?? []).filter((b) => b.design === 'watchglass' && standsDone(b)).map((b) => b.printStart ?? 0);
  return starts.length ? Math.min(...starts) : Infinity;
}

/** A pulse through the Tidewhisper (Vigil's wish): the last watch kept on the nearest other world where one stands. */
export interface Pulse extends SharedWatch { ly: number }

/**
 * Vigil's Tidewhisper (designs.json tidewhisper): where a finished dish stands, the nearest other world with one (the
 * nearest by star, then the lowest planet) hums its last watch here as a faint pulse, free of any ship's cells. It is
 * slower than a letter: it arrives a day (mind.json tidewhisper.pulseHours) after the watch's light would have. Only a
 * watch kept after both dishes stood is sent. Null when there is no other dish, or nothing has reached here yet.
 */
export function tidewhisperPulse(here: { star: string; planet: number }, worlds: NetWorld[], perLy: number, pulseHours: number, now = Date.now()): Pulse | null {
  const me = worlds.find((w) => w.star === here.star && w.planet === here.planet);
  if (!me || !hasDesign(me, 'tidewhisper', now)) return null;
  const others = worlds.filter((w) => w !== me && hasDesign(w, 'tidewhisper', now))
    .map((w) => ({ w, ly: w.star === here.star ? 0 : distanceLy(w.star, here.star) }))
    .sort((a, b) => a.ly - b.ly || a.w.planet - b.w.planet);
  const near = others[0];
  if (!near) return null;
  const since = Math.max(dishSince(me), dishSince(near.w)), delay = (near.ly * perLy + pulseHours * 3600) * 1000;
  const sent = (near.w.archive ?? []).filter((a) => a.at >= since && a.at + delay <= now).sort((a, b) => b.at - a.at)[0];
  return sent ? { ...sent, fromStar: near.w.star, fromPlanet: near.w.planet, arrives: sent.at + delay, ly: near.ly } : null;
}

/** When this world's first Tidewhisper began. */
function dishSince(w: NetWorld) {
  const starts = (w.buildings ?? []).filter((b) => b.design === 'tidewhisper' && standsDone(b)).map((b) => b.printStart ?? 0);
  return starts.length ? Math.min(...starts) : Infinity;
}
