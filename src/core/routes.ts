// Charted routes (travel.json routes, migration 0017): the first flight between two stars charts the route for the
// whole Metanoia; flying it again costs a fifth of the charge and takes half the time. Loaded once per session and
// kept as it changes; a store that cannot answer leaves every route uncharted.
import { session } from './session';
import { routeKey } from '../world/galaxy';

let known = new Set<string>();
let loading: Promise<Set<string>> | null = null;

/** The charted routes, loaded once (call again after a sign-in to reload). */
export function loadRoutes(force = false): Promise<Set<string>> {
  if (loading && !force) return loading;
  const st = session.store;
  loading = st ? st.routes().then((r) => (known = new Set(r))).catch((e) => { console.warn('routes', e); return known; }) : Promise.resolve(known);
  return loading;
}

export const isCharted = (a: string, b: string) => a !== b && known.has(routeKey(a, b));
export const chartedRoutes = () => known;

/** A flight between two stars: the route is charted from now on (saved; the next flight there is cheaper). */
export function chart(a: string, b: string, by: string) {
  if (a === b) return;
  known.add(routeKey(a, b));
  void session.store?.chartRoute(a, b, by).catch((e) => console.warn('chart route', e));
}
