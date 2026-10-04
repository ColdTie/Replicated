# Vessel Metanoia: Replicants

You are building a 2D top down sci fi game that runs in a browser on an iPad. Read this whole file before writing any code. Keep it updated as decisions change.

## Who it is for

Steve, his wife, and his 5 year old daughter. Played in Safari on the daughter's iPad and in Chrome on a Windows laptop. Steve directs through chat and does not want to hand edit scenes, open visual editors, or click through GUI steps. Everything is code, scripts, and config that you create and run. If a step truly needs a human (creating an account, pasting a key), write it out plainly as a single numbered list.

## Premise

The player is an AI replicant piloting a self replicating vessel through a cold, empty galaxy. On each planet you fight, gather, and build a Replicator. The Replicator makes a copy of you with inherited stats plus random "drift" (a visible mutation and a small stat change). The copy stays behind to run the planet as an NPC while you fly on. A rare resource called Spark lets a player awaken a replicant and hand it to another family member, who then plays it as their own character.

Theme: you are never alone, but every version of you is a little different. Lonely galaxy, warm settlements.

## Design brief (visual and feel)

Anchor reference: Hyper Light Drifter. Secondary: Starbound (planet variety), Dead Cells (animation smoothness over detail), Kingdom Two Crowns (lighting, silhouettes, parallax, particles), Celeste (tiny body, one big expressive feature).

- Resolution: internal canvas 480x270, scaled up with nearest neighbor filtering. Sprites 16x16 for characters and items, 16x16 tiles.
- Palette: Endesga 32 (lospec). Cold base (navy, slate, dusty teal). Warm accents only for things that are alive or yours: the vessel, base lights, resource glows, the player.
- Each planet gets one accent hue that tints its tiles, sky gradient, and creatures.
- Lighting: dark vignette, soft radial light around the player and built structures, dust and spore particles, slow parallax background. Cheap shader or blend mode effects, nothing expensive.
- Animation: smoothness beats detail. Walk cycles of at least 6 frames, squash and stretch on landing and on hit, screen shake on hits (small), hit flash white, 100ms hit pause.
- Replicant identity: every replicant has one distinctive feature (visor color, antenna shape, trail color) that drift changes. Family must tell copies apart at a glance.
- UI: almost none. Health is a glow around the player that dims. Collected resources float up as small icons. Interaction is walking into things. One clean pixel font, sparse title cards when you land on a planet.
- No text needed to understand the world. A 5 year old should read a glowing door or a broken machine without words.

## Art pipeline

No final art yet. Generate placeholder sprites with a Node script that writes pixel arrays to PNG (use pngjs). Keep every sprite in `tools/sprites/*.json` as a grid of palette indexes so they can be regenerated and tinted per planet. This lets Steve request art changes in chat. Kenney.nl packs are allowed as a fallback for tiles. Ask before adding any paid or non CC0 asset.

## Stack

- TypeScript, Phaser 3, Vite. No frameworks beyond that.
- Supabase (Postgres plus auth) for family profiles, shared galaxy state, saves, and replicant ownership. Use the supabase js client. Ownership handoff is a single row update, not realtime multiplayer.
- Deploy to GitHub Pages with a GitHub Actions workflow on push to main. Vite `base` must be set for Pages.
- Touch first. Virtual joystick on the left, one big action button on the right. Keyboard and gamepad also work. No tilt controls.
- Must run smoothly in iOS Safari: keep memory small, compress audio, start audio only after first tap.

## Three profiles

- Steve and wife: full game.
- Daughter ("kid mode" flag on the profile): no inventory, no stats, no death (knocked back and respawn at base). Explore, collect glowing things, pet creatures, press one button to build. Resources still count toward the shared base.

## Core loop (build in this order)

1. Explore: move around a procedurally generated planet surface (seeded), one biome, with ruins and resource nodes.
2. Fight: one tap attack with a generous hitbox, two enemy types, enemies drop resources.
3. Gather and build: resource counter, a base area near the landing site, place the Replicator with one button when you have enough.
4. Replicate: the Replicator creates a copy with drift. Copy becomes an NPC that walks around the base and generates resources while you are away.
5. Travel: launch the vessel, pick the next planet from a simple star map, land on a new seed and accent hue.
6. Handoff: Spark resource awakens an NPC replicant and assigns it to another profile.

## Phase plan

- **Phase 0, vertical slice** (do this first, nothing else): one planet, one player, movement, one enemy, one resource, the lighting and particle look from the brief, touch controls, deployed to GitHub Pages and confirmed on the iPad. It should already feel polished. Take a screenshot (headless Chromium via Playwright) and save it to `screenshots/` after each milestone so Steve can review the look in chat.
- **Phase 1:** full loop steps 1 to 3 plus Supabase profiles and saves. Start on Earth (hand-tuned, peaceful and overgrown) instead of a random planet. Design the Supabase schema for the shared galaxy from day one (see Long-term decisions), even though travel comes in Phase 2.
- **Phase 2:** steps 4 and 5. Travel uses real-world time; the star map shows real nearby stars.
- **Phase 3:** step 6, kid mode polish, sound, family playtest fixes.

## Out of scope

Realtime multiplayer, LLM driven NPC dialogue, 3D, crafting menus, twin stick aiming, final hand drawn art.

## Working rules

- Small commits with clear messages. Push after each working milestone.
- Keep data (planet biomes, enemy stats, drift tables, items) in JSON under `src/data/` so content is easy to add.
- Ask before adding any dependency beyond Phaser, Vite, TypeScript, supabase js, pngjs, and Playwright.
- Update the Progress section below at the end of every session.
- When something needs Steve (keys, account creation, testing on the iPad), stop and give a short numbered list.

## Long-term decisions (agreed with Steve, 2026-10-04)

These shape the data model now, even where the feature comes later.

- **Travel runs on real-world time.** Launching the vessel to another star starts a journey that completes at a wall-clock time (stored as `departs_at` / `arrives_at`), whether or not anyone is playing. While a ship is in transit, players keep playing on planets they have already settled. A trip to a beacon system should take roughly a week of real time; nearer stars take minutes to hours. Exact time per light year is a tunable in `src/data/`.
- **One shared galaxy for the family.** Everything (stars discovered, planets, replicants, resources, messages) belongs to a galaxy row that the three profiles share. Store a `galaxy_id` on everything so more families could get their own galaxy later. No strangers, no public play.
- **Earth is the start.** Peaceful and overgrown: humanity is long gone, nature has taken back the ruins, quiet and lonely but friendly for a 5 year old. Hand-tuned rather than random (fixed seed plus authored landmarks such as overgrown towers and the replicant's waking spot).
- **Messages travel at light speed until FTL comms exist.** A message between replicants in different systems arrives after a delay based on distance (scaled like travel). Building or finding the FTL comms device makes messages from that system instant.
- **Stars are real.** The galaxy is real nearby stars (positions relative to the Sun). Each star's planets are generated from a seed derived from the star's id. Beacon systems sit at fixed, symmetrical points around the Sun, snapped to the nearest real star.

## Backlog: long-term vision (recorded 2026-10-04, not scheduled)

Steve's ideas for later phases. Do not build these until a phase explicitly picks them up; keep current work compatible with them.

- **Origin on Earth.** The first replicant starts at a fixed point on a specific starting planet, probably Earth.
- **Real-sky galaxy.** Star systems and their layout follow real star formations (real nearby stars and their positions), not random scatter.
- **Beacon systems.** Fixed, symmetrical points in space around the start hold enormous resources and a beacon. Reaching one should take about a full week of play, so they work as long-term goals.
- **Star map.** Unique, easy to open, and usable on iPad touch. Possibly a 2D/3D map (pinch, rotate, tap a star) with toggleable overlays for other players' replicants and discovered resources. Note: "3D" here means the star map view only; the game itself stays 2D.
- **FTL communication (Bobiverse style).** Replicants, and other people, can only talk to each other through a device that allows faster-than-light communication. It is something you build or find, not available from the start. Fits the "ownership handoff is a row update" model: messages are async rows, not realtime chat.
- **Wormholes (very late game).** Replicants eventually develop portal and wormhole technology for fast travel between explored systems.

## Architecture (as built)

```
tools/sprites/*.json     sprite source: palette-index grids + legend + animations (font.json = pixel font)
tools/gen-sprites.mjs    JSON -> public/assets/gen/*.png + manifest.json (tinted sprites rendered per planet)
tools/screenshot.mjs     build preview + headless Chromium capture -> screenshots/<name>.png
src/data/*.json          palette, planets, player, enemies, items (all tunables live here)
src/core/                rng/noise, typed data access, sprite manifest helpers
src/world/planetGen.ts   seeded island: floor/rock/ruins/void, tiles, nodes, enemies, decor, glows
src/fx/                  Lighting (multiply darkness RT + additive lights), Atmosphere (sky, stars, fog,
                         dust, spores), Fx (particle bursts, slash, floating icons), procedural textures
src/entities/            Player, Skitter (enemy), CrystalNode + Shard (Ember resource)
src/input/Controls.ts    keyboard + gamepad + touch state merged into one input frame
src/scenes/              Boot (loads manifest, anims, font), Planet (world), UI (counter, title card, touch)
```

Sprite legend roles: `a0/a1/a2` = planet accent (dark, mid, light), `f0/f1` = replicant feature color (visor, antenna tip). Feature color currently comes from `src/data/player.json`; drift will swap it per replicant.

Commands: `npm run dev` (local server), `npm run build`, `npm run sprites -- --preview` (writes `screenshots/sprite-sheet.png`), `node tools/screenshot.mjs --name <n> [--query "shot=1"] [--wait ms]`.

URL params: `?seed=123` to try another planet layout, `?shot=1` skips the landing intro and stages a screenshot pose (enemies frozen).

## Progress

### Session 1 (2026-10-04): Phase 0 vertical slice built

Done:
- Vite + TypeScript + Phaser 3.90 project; GitHub Pages workflow (`.github/workflows/deploy.yml`, runs on push to `main`, base `/Replicated/`; repo renamed from metanoia-replicants).
- Sprite pipeline with JSON sources for player (idle 4, walk 6, attack 3, hurt), Skitter enemy, crystal node (4 damage stages), Ember shard, slash arc, vessel (32x32), decor (tufts, glowing mushrooms, pillar, broken machine, glowing sealed door, spore pods), 19 tiles, and a 5x7 pixel font. Planet "SOLACE" uses a magenta accent.
- Seeded planet generator: floating island with cliffs into the void, smoothed rock outcrops with rim edges, ruins with a glowing door and broken machines, moss patches, 16 crystal nodes, 9 Skitters.
- Look: multiply lighting with banded and dithered radial lights, warm additive glows, vignette, sky gradient and two parallax star layers visible past the cliffs, drifting fog, dust motes and spores.
- Feel: landing sequence (vessel descends with thrusters, thump, shake, replicant hops out with squash), title card, 6-frame walk with footstep dust, one-button attack with a generous hitbox and gentle auto-aim, white hit flash, 100ms hit pause, small shake, knockback, squash and stretch. Skitters wander, chase, telegraph (crouch with yellow eyes), and lunge.
- Health is the player's glow: it shrinks and dims as HP drops and flickers when low. Death fades you out and respawns you at the vessel.
- Ember resource: crystals chip as you hit them, shards pop out, bounce, get pulled toward you, and float up as an icon when collected. The counter (top left) fades when idle.
- Touch: floating joystick on the left 45% of the screen; tap anywhere on the right for action; multitouch. Keyboard: WASD/arrows + Space/J/Enter/Z. Gamepad: left stick/d-pad + A/B/X/R1.
- Verified headless: no page errors; scripted playtest mined nodes, killed an enemy, collected shards; touch drag moved and a second finger attacked.
- Screenshots: `screenshots/phase0-gameplay.png`, `phase0-landing.png`, `phase0-touch.png`, `sprite-sheet.png`.

### Session 1b (2026-10-04): new body model, faster movement
- Deployed to GitHub Pages (PR #1 merged; repo renamed to `Replicated`, site at coldtie.github.io/Replicated/).
- New default body "replicant" (`tools/sprites/replicant.json`, 16x20): slim humanoid with a visor band, head fin with a glowing tip, a glowing chest core and a short red cape. The original drone (`tools/sprites/player.json`) is kept and selectable with `?model=drone`. Models are listed in `src/data/player.json`.
- Move speed raised from 78 to 90.

Not done / next:
- Not yet confirmed on the iPad.
- No audio yet. Phase 0 skipped it; add in Phase 3 (or earlier), starting only after the first tap.
- Rock outcrops still have stair-step edges (no full autotiling). Fine for placeholder art.
- Then Phase 1: second enemy type, base area plus Replicator placement, Supabase profiles and saves.
