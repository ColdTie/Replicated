// Mannies (manny.json): the bodies the original builds on the worlds it reaches, and where its own body and vessel are
// while it drives one. Pure helpers over the replicant row (traits.mannies, traits.ship).
import type { GameStore, Journey, ReplicantSave } from '../net/store';

export const worldKey = (star: string, planet: number) => `${star}:${planet}`;

/** The worlds where this replicant has a manny. */
export function mannyWorlds(r: ReplicantSave | null | undefined): { star: string; planet: number; key: string }[] {
  return Object.keys(r?.traits.mannies ?? {}).map((key) => {
    const i = key.lastIndexOf(':');
    return { star: key.slice(0, i), planet: Number(key.slice(i + 1)), key };
  });
}

export const hasManny = (r: ReplicantSave | null | undefined, star: string, planet: number) => !!r?.traits.mannies?.[worldKey(star, planet)];

/** It drives a manny right now; its own body waits aboard the vessel (traits.ship). */
export const inManny = (r: ReplicantSave | null | undefined) => !!r?.traits.ship;

/** A vessel flying on without anyone aboard. */
export const shipFlying = (ship: { journey?: Journey } | null | undefined) => !!ship?.journey && Date.parse(ship.journey.arrives_at) > Date.now();

/**
 * Where the vessel is while you are not aboard (null when you are: in your own body, or flying). A flight that has
 * landed since is settled first: the star counts as reached and the vessel waits there.
 */
export async function vesselAway(r: ReplicantSave, store: GameStore | null) {
  const ship = r.traits.ship;
  if (!ship) return null;
  if (ship.journey && !shipFlying(ship)) {
    try { await store?.discover(ship.journey.to_star, r.id); } catch (e) { console.warn('discover failed', e); }
    r.traits.ship = { star: ship.star, planet: ship.planet };
    try { await store?.saveReplicant(r); } catch (e) { console.warn('replicant save failed', e); }
  }
  return r.traits.ship!;
}

/** The vessel stands on this world (you are in your own body here, or your manny here while it waits). */
export function vesselHere(r: ReplicantSave | null | undefined, star: string, planet: number) {
  if (!r) return true;
  const ship = r.traits.ship;
  if (!ship) return r.status !== 'in_transit' && r.star_id === star && r.planet_index === planet;
  return !shipFlying(ship) && ship.star === star && ship.planet === planet;
}
