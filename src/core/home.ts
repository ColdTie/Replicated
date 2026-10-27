// Where the game starts: the Metanoia homeworld, LHS 1140 b (story/STORY.md). It is the first planet in
// src/data/planets.json; Earth stays in the catalog as a real place humanity left behind.
import { PLANETS } from './data';

export const HOME = { id: PLANETS[0].id, star: PLANETS[0].star, planet: PLANETS[0].planetIndex };
/** The homeworld's star and Sol (where humanity came from): known from the start. */
export const KNOWN_STARS = [HOME.star, 'sol', 'gliese-12'];
export const isHome = (star: string, planet: number) => star === HOME.star && planet === HOME.planet;
