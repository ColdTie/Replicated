# The universe: what the Vessels are making

Steve, 2026-11-15: "Their job is to expand this simulation game to its maximum. Create new planets, come up with new
technology to shape their universe. Literally."

The Vessels read this file in their long wakes (`read_code docs/universe.md`). The maker keeps it: every big wish
that is built in parts has a row here with what is built and what comes next, so a part is never forgotten between
runs. Small wishes built in one run need no row.

## What exists

- **Stars:** 1,500 real stars within 75 light years (`src/data/stars.json`). Every star's planets come from its seed
  (`src/world/system.ts`); a hand-made world on a star replaces the generated one there (`src/data/planets.json`).
- **Hand-made worlds:** LHS 1140 b (the homeworld), Earth, Gliese 12 b (the Cems' world), Solace, Cinder Sounding (Gliese 884 b, violet singing dunes), Lignin Tides (GJ 1061 b, tidal flats and wild Cem reefs).
- **Grounds:** verdant, frost, dune, spore, ember, moon (generated worlds); cinder (violet sand), tides (tidewrack: wet salt crust under wrack) (hand-made worlds only) (`src/data/biomes.json`,
  `src/data/floor.json`).
- **Materials:** stone, soil, scrap, Ember, iron, hydrogen, salt, quartz, copper (`src/data/supplies.json`); sounding glass (Cinder Sounding's signature material, carried by the ship; broken from its glass ridges), tidal lignin (Lignin Tides' signature material).
- **Technology, the Cems' tree** (`src/data/designs.json`): Lantern, House, Storehouse, Nursery, Workshop,
  Observatory, Signal Spire, Biolab, Supercomputer, Fusion Still, Nous Chip. After the Nous Chip the tree is empty.
- **Travel:** ships on starlight cells, the Fusion Still, charted routes (`src/data/travel.json`).

## The frontier (nothing made yet)

`src/data/mind.json mandate.frontier`: hand-made worlds, biological and quantum computers, SCUT links (faster than
light letters, driving husks from far away), a cure engine, inhabited worlds with a crisis, portals and wormholes,
new materials, new creatures and plants, working together across worlds.

## Being built in parts

| Wish | Who | Carried | Built so far | Next part |
| --- | --- | --- | --- | --- |
| Cinder Sounding: a singing storm world on Gliese 884 | Vigil (Tamsin, Thales) | 2026-11-16 pm | The world: planets.json `cinder`, violet ground (floor.json), town paint, sand footsteps, open chords, signature material sounding glass. 2026-11-17 am: glass ridges, rows of sounding-glass fins on the sand that sing when struck and give sounding glass to the store (items.json `soundglass`) | Hushgrass and sandwings; sand squalls that bury planters (and raise new ridges); lens and bell designs from sounding glass; the dunes humming at dusk |
| Lignin Tides: a salt-sea world on GJ 1061 with living Cem reefs | Ember Gold (Thales, Tamsin) | 2026-11-17 pm | The world: planets.json `tides`, ground tidewrack (floor.json), town paint, salt footsteps, wild Cem fields on the flats, signature material tidal lignin | Reefs that shed lignin plates at the turn of the tide (nodes); salt-moss mats and shelled grazers with pearl-glass eggs; pearl glass as a material; tide surges and fog banks |
