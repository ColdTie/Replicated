# The universe: what the Vessels are making

Steve, 2026-11-15: "Their job is to expand this simulation game to its maximum. Create new planets, come up with new
technology to shape their universe. Literally."

The Vessels read this file in their long wakes (`read_code docs/universe.md`). The maker keeps it: every big wish
that is built in parts has a row here with what is built and what comes next, so a part is never forgotten between
runs. Small wishes built in one run need no row.

## What exists

- **Stars:** 1,500 real stars within 75 light years (`src/data/stars.json`). Every star's planets come from its seed
  (`src/world/system.ts`); a hand-made world on a star replaces the generated one there (`src/data/planets.json`).
- **Links between worlds** (`src/core/network.ts`): the Cem Mind's SCUT link, the Watchglass.
- **Hand-made worlds:** LHS 1140 b (the homeworld), Earth, Gliese 12 b (the Cems' world), Solace, Cinder Sounding (Gliese 884 b, violet singing dunes), Lignin Tides (GJ 1061 b, tidal flats and wild Cem reefs), Sunwell Orchard (Gliese 879 b, red sand, fig trees and still basins), Brightwater (Gliese 832, a marsh world of clear shallows under a low red sun), Lanternfen (Gliese 867, frost meadows under a long aurora night).
- **Grounds:** verdant, frost, dune, spore, ember, moon (generated worlds); cinder (violet sand), tides (tidewrack: wet salt crust under wrack), orchard (red sand flats), brightwater (pale soil, reed marsh), lanternfen (silver frost grass), glasswind (pale wind-rippled iceglass) (hand-made worlds only) (`src/data/biomes.json`,
  `src/data/floor.json`).
- **Materials:** stone, soil, scrap, Ember, iron, hydrogen, salt, quartz, copper (`src/data/supplies.json`); sounding glass (Cinder Sounding's signature material, carried by the ship; broken from its glass ridges), sunwell glass (Sunwell Orchard's signature material), tidal lignin (Lignin Tides' signature material; shed by its lignin reefs), brightshell (Brightwater's), lightsilk (Lanternfen's), windglass (Glasswind's).
- **Technology, the Cems' tree** (`src/data/designs.json`): Lantern, House, Storehouse, Nursery, Workshop,
  Observatory, Signal Spire, Biolab, Supercomputer, Fusion Still, Nous Chip, Sunlattice (Sunlattice panels: warren lamps without Ember), Cem Mind (the SCUT link: letters between two Cem Minds arrive at once), Watchglass (every watch shared with the other Watchglass worlds at light speed). After these the tree is empty.
- **Travel:** ships on starlight cells, the Fusion Still, charted routes (`src/data/travel.json`).

## The frontier (nothing made yet)

`src/data/mind.json mandate.frontier`: hand-made worlds, biological and quantum computers, SCUT links (faster than
light letters: begun, the Cem Mind; driving husks from far away), a cure engine, inhabited worlds with a crisis, portals and wormholes,
new materials, new creatures and plants, working together across worlds.

## Being built in parts

| Wish | Who | Carried | Built so far | Next part |
| --- | --- | --- | --- | --- |
| Cinder Sounding: a singing storm world on Gliese 884 | Vigil (Tamsin, Thales) | 2026-11-16 pm | The world: planets.json `cinder`, violet ground (floor.json), town paint, sand footsteps, open chords, signature material sounding glass. 2026-11-17 am: glass ridges, rows of sounding-glass fins on the sand that sing when struck and give sounding glass to the store (items.json `soundglass`) | Hushgrass and sandwings; sand squalls that bury planters (and raise new ridges); lens and bell designs from sounding glass; the dunes humming at dusk |
| Lignin Tides: a salt-sea world on GJ 1061 with living Cem reefs | Ember Gold (Thales, Tamsin) | 2026-11-17 pm | The world: planets.json `tides`, ground tidewrack (floor.json), town paint, salt footsteps, wild Cem fields on the flats, signature material tidal lignin. 2026-11-18 am: lignin reefs, shelves on the pools' rims that shed plates of tidal lignin when struck (items.json `tidelignin`) | Salt-moss mats and shelled grazers with pearl-glass eggs; pearl glass as a material; tide surges and fog banks |
| Sunwell Orchard: a warm orchard world on Gliese 879 | Sorrel (Vigil, Ember Gold, Thales) | 2026-11-18 pm | The world: planets.json `orchard`, red sand ground (floor.json), fig trees, still basins, quartz ridges, town paint, sand footsteps, signature material sunwell glass | The sunwell fig as its own tree with seed pods (seed for planters); glass-shelled grazers that eat its fruit; sunwell glass grown in the basins after mist (nodes); morning mists; the pale ring at dusk |
| Brightwater: a seed world on Gliese 832 | Thales (Ember Gold, Sorrel, Watcher) | 2026-11-19 am | The world: planets.json `brightwater`, pale marsh ground (floor.json), clear shallows, slow rains, town paint, signature material brightshell | Seed-grasses whose fluff gives seed for planters; shell-beetles that shed brightshell; a small iceglass seam; marsh fog |
| Lanternfen: a frost world of light-moths on Gliese 867 | Sorrel (Vigil, Watcher, Ember Gold) | 2026-11-19 am | The world: planets.json `lanternfen`, silver frost ground (floor.json), the long night under an aurora sky, meltwater pools, signature material lightsilk | Lantern moths crossing the sky in swarms, shedding lightsilk; silver grass seed for cold rooms; planters fed lightsilk grow faster; the aurora moving |
| Sunlattice: stored light from the Cem beds | Ember Gold (Watcher, Sorrel) | 2026-11-19 am | The design after the Nous Chip (designs.json `sunlattice`); Sunlattice panels in the warren: a lamp for salt 2 and quartz 1, no Ember, where one stands | A Sunlattice by the Cem bed speeds its prints by a quarter; a clear sunlattice wall for buildings |
| Glasswind: a wind-carved arch world on Lalande 21185 | Vigil (Thales, Sorrel, Ember Gold, Watcher) | 2026-11-19 pm | The world: planets.json `glasswind`, pale wind-rippled iceglass plains with blue ice ridges (floor.json), a dim red sun by the clock, blowing ice in the air, steady wind, town paint, sand footsteps, signature material windglass | Arch-trees (pale lichen stalks that sway and hum) whose pods give seed for planters; windglass grown where the arches sing (nodes); the ice arches themselves; calm fog days in the hollows; light running along the arches |
| Cem Mind: a living computer from the Biolab | Tamsin (Sorrel, Watcher) | 2026-11-19 pm | The design after the Nous Chip and the Biolab (designs.json `cemmind`); the SCUT link: a letter between two worlds where a Cem Mind stands arrives at once, in the game and the minds (`src/core/network.ts`) | Long calculations (a star's orbit, a world's weather, a cure's spread) kept in the archive; the lattice brightening when it thinks; the price the wish named (20 salt, 5 copper, 2 quartz, 3 days: the Cems price a design by its shape) |
| Watchglass: watches shared between worlds | Watcher (Vigil, Tamsin) | 2026-11-19 pm | The design after the Observatory and the Nous Chip (designs.json `watchglass`); every watch kept where one stands reaches the other Watchglass worlds at light speed (at once between Cem Minds), read in the day's context and on the journal's HERE page (THROUGH THE WATCHGLASS) | The archive's 'shared' column (which worlds have seen each star); the lens lit when a watch is sent or arrives; the copper cord to the Signal Spire; dividing the sky among the worlds |
