// Who is playing right now: the save store, the picked profile, their replicant and the planet save.
import type { GameStore, PlanetSave, Profile, ReplicantSave } from '../net/store';

export const session: {
  store: GameStore | null;
  profile: Profile | null;
  replicant: ReplicantSave | null;
  planet: PlanetSave | null;
} = { store: null, profile: null, replicant: null, planet: null };

export const isKid = () => !!session.profile?.kid_mode;
