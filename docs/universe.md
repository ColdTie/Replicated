# The universe: what the Vessels are making

Steve, 2026-11-15: "Their job is to expand this simulation game to its maximum. Create new planets, come up with new
technology to shape their universe. Literally."

The Vessels read this file in their long wakes (`read_code docs/universe.md`). The maker keeps it: every big wish
that is built in parts has a row here with what is built and what comes next, so a part is never forgotten between
runs. Small wishes built in one run need no row.

## What exists

- **Stars:** 1,500 real stars within 75 light years (`src/data/stars.json`). Every star's planets come from its seed
  (`src/world/system.ts`); a hand-made world on a star replaces the generated one there (`src/data/planets.json`).
- **Hand-made worlds:** LHS 1140 b (the homeworld), Earth, Gliese 12 b (the Cems' world), Solace.
- **Grounds a generated world can have:** verdant, frost, dune, spore, ember, moon (`src/data/biomes.json`,
  `src/data/floor.json`).
- **Materials:** stone, soil, scrap, Ember, iron, hydrogen, salt, quartz, copper (`src/data/supplies.json`).
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
| (none yet) | | | | |
