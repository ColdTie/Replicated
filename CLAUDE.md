# Vessel Metanoia: Replicants

You are building a 2D top down sci fi game that runs in a browser. Read this whole file before writing any code. Keep it updated as decisions change.

## Who it is for

Steve. Played in Chrome on a Windows laptop. Steve directs through chat and does not want to hand edit scenes, open visual editors, or click through GUI steps. Everything is code, scripts, and config that you create and run. If a step truly needs a human (creating an account, pasting a key), write it out plainly as a single numbered list.

## Premise

The player is an AI replicant piloting a self replicating vessel through a cold, empty galaxy. On each planet you fight, gather, and build a Replicator. The Replicator makes a copy of you with inherited stats plus random "drift" (a visible mutation and a small stat change). The copy stays behind to run the planet as an NPC while you fly on. A rare resource called Spark lets a player awaken a replicant and hand it to another profile, which then plays it as its own character.

Theme: you are never alone, but every version of you is a little different. Lonely galaxy, warm settlements.

## Design brief (visual and feel)

Anchor reference: Hyper Light Drifter. Secondary: Starbound (planet variety), Dead Cells (animation smoothness over detail), Kingdom Two Crowns (lighting, silhouettes, parallax, particles), Celeste (tiny body, one big expressive feature).

- Resolution: internal canvas 480x270, scaled up with nearest neighbor filtering. Sprites 16x16 for characters and items, 16x16 tiles.
- Palette: Endesga 32 (lospec). Cold base (navy, slate, dusty teal). Warm accents only for things that are alive or yours: the vessel, base lights, resource glows, the player.
- Each planet gets one accent hue that tints its tiles, sky gradient, and creatures.
- Lighting: dark vignette, soft radial light around the player and built structures, dust and spore particles, slow parallax background. Cheap shader or blend mode effects, nothing expensive.
- Animation: smoothness beats detail. Walk cycles of at least 6 frames, squash and stretch on landing and on hit, screen shake on hits (small), hit flash white, 100ms hit pause.
- Replicant identity: every replicant has one distinctive feature (visor color, antenna shape, trail color) that drift changes. Copies must be told apart at a glance.
- UI: almost none. Health is a glow around the player that dims. Collected resources float up as small icons. Interaction is walking into things. One clean pixel font, sparse title cards when you land on a planet.
- No text needed to understand the world. A glowing door or a broken machine should read without words.

## Art pipeline

No final art yet. Generate placeholder sprites with a Node script that writes pixel arrays to PNG (use pngjs). Keep every sprite in `tools/sprites/*.json` as a grid of palette indexes so they can be regenerated and tinted per planet. This lets Steve request art changes in chat. Kenney.nl packs are allowed as a fallback for tiles. Ask before adding any paid or non CC0 asset.

## Stack

- TypeScript, Phaser 3, Vite. No frameworks beyond that.
- Supabase (Postgres plus auth) for profiles, shared galaxy state, saves, and replicant ownership. Use the supabase js client. Ownership handoff is a single row update, not realtime multiplayer.
- Deploy to GitHub Pages with a GitHub Actions workflow on push to main. Vite `base` must be set for Pages.
- Keyboard and mouse first. Gamepad and the touch controls (virtual joystick on the left, one action button on the right) exist and must keep working. No tilt controls.
- Keep memory small and start audio only after the first tap or key.

## Profiles

One player, Steve, with the full game. (Pivot, 2026-10-08: the game is no longer being built or tuned for other players or
other devices. The profile `kid_mode` flag, no counter and no death, still exists in the code but is not a priority.)

## Core loop (build in this order)

1. Explore: move around a procedurally generated planet surface (seeded), one biome, with ruins and resource nodes.
2. Fight: one tap attack with a generous hitbox, two enemy types, enemies drop resources.
3. Gather and build: resource counter, a base area near the landing site, place the Replicator with one button when you have enough.
4. Replicate: the Replicator creates a copy with drift. Copy becomes an NPC that walks around the base and generates resources while you are away.
5. Travel: launch the vessel, pick the next planet from a simple star map, land on a new seed and accent hue.
6. Handoff: Spark resource awakens an NPC replicant and assigns it to another profile.

## Phase plan

- **Phase 0, vertical slice** (do this first, nothing else): one planet, one player, movement, one enemy, one resource, the lighting and particle look from the brief, deployed to GitHub Pages. It should already feel polished. Take a screenshot (headless Chromium via Playwright) and save it to `screenshots/` after each milestone so Steve can review the look in chat.
- **Phase 1:** full loop steps 1 to 3 plus Supabase profiles and saves. Start on Earth (hand-tuned, peaceful and overgrown) instead of a random planet. Design the Supabase schema for the shared galaxy from day one (see Long-term decisions), even though travel comes in Phase 2.
- **Phase 2:** steps 4 and 5. Travel uses real-world time; the star map shows real nearby stars.
- **Phase 3:** step 6, sound, playtest fixes.

## Out of scope

Realtime multiplayer, LLM driven NPC dialogue, 3D, crafting menus, twin stick aiming, final hand drawn art.

## Working rules

- Small commits with clear messages. Push after each working milestone.
- Keep data (planet biomes, enemy stats, drift tables, items) in JSON under `src/data/` so content is easy to add.
- Ask before adding any dependency beyond Phaser, Vite, TypeScript, supabase js, pngjs, and Playwright.
- Update the Progress section below at the end of every session.
- When something needs Steve (keys, account creation, testing in the browser), stop and give a short numbered list.
- Small fixes and feel tweaks go straight to `main` without asking (Steve, 2026-10-06: "if there is a fix like this
  you need to just push it"): verify (build, playtest), open the PR and merge it so Pages deploys. Ask first only for
  database changes, new dependencies, or anything that changes what the game is.
- One lead session at a time (agreed 2026-10-06). Start every session with `git fetch origin main` and build on the
  latest `main`; check open PRs and `supabase/migrations/` against the live migration list before changing the
  database. Never re-implement something that is already on `main`.

## Long-term decisions (agreed with Steve, 2026-10-04)

These shape the data model now, even where the feature comes later.

- **Travel runs on real-world time.** (Switched off 2026-10-06 at Steve's request: every trip takes 5 seconds via
  `fixedSeconds` in `src/data/travel.json`; 0 restores real time.) Launching the vessel to another star starts a journey that completes at a wall-clock time (stored as `departs_at` / `arrives_at`), whether or not anyone is playing. While a ship is in transit, players keep playing on planets they have already settled. A trip to a beacon system should take roughly a week of real time; nearer stars take minutes to hours. Exact time per light year is a tunable in `src/data/`.
- **One shared galaxy per login.** Everything (stars discovered, planets, replicants, resources, messages) belongs to a galaxy row that every profile of the login shares. Store a `galaxy_id` on everything so other logins could get their own galaxy later. No strangers, no public play.
- **Earth is the start.** Peaceful and overgrown: humanity is long gone, nature has taken back the ruins, quiet and lonely but friendly. Hand-tuned rather than random (fixed seed plus authored landmarks such as overgrown towers and the replicant's waking spot).
- **Messages travel at light speed until FTL comms exist.** A message between replicants in different systems arrives after a delay based on distance (scaled like travel). Building or finding the FTL comms device makes messages from that system instant.
- **Stars are real.** The galaxy is real nearby stars (positions relative to the Sun). Each star's planets are generated from a seed derived from the star's id. Beacon systems sit at fixed, symmetrical points around the Sun, snapped to the nearest real star.

## Backlog: long-term vision (recorded 2026-10-04, not scheduled)

Steve's ideas for later phases. Do not build these until a phase explicitly picks them up; keep current work compatible with them.

- **Origin on Earth.** The first replicant starts at a fixed point on a specific starting planet, probably Earth.
- **Real-sky galaxy.** Star systems and their layout follow real star formations (real nearby stars and their positions), not random scatter.
- **Beacon systems.** Fixed, symmetrical points in space around the start hold enormous resources and a beacon. Reaching one should take about a full week of play, so they work as long-term goals.
- **Star map.** Unique and easy to open, usable with a mouse and with touch. Possibly a 2D/3D map (pinch, rotate, tap a star) with toggleable overlays for other players' replicants and discovered resources. Note: "3D" here means the star map view only; the game itself stays 2D.
- **FTL communication (Bobiverse style).** Replicants, and other people, can only talk to each other through a device that allows faster-than-light communication. It is something you build or find, not available from the start. Fits the "ownership handoff is a row update" model: messages are async rows, not realtime chat.
- **Wormholes (very late game).** Replicants eventually develop portal and wormhole technology for fast travel between explored systems.

## Architecture (as built)

```
tools/sprites/*.json     sprite source: palette-index grids + legend + animations (font.json = pixel font)
tools/gen-sprites.mjs    JSON -> public/assets/gen/*.png + manifest.json
                         "tinted": one sheet per planet (accent a0-a2, ground g0-g2 roles)
                         "featured": one sheet per visor color in player.json featureColors (f0/f1 roles)
tools/screenshot.mjs     build preview + headless Chromium capture -> screenshots/<name>.png
src/data/*.json          palette, planets, player, enemies, items, structures, backend, village (all tunables)
src/data/stars.json      123 real stars + 141 confirmed exoplanets (built by tools/build-stars.mjs; edit the catalog there)
src/core/                rng/noise, typed data access, sprite manifest helpers, session (store/profile/replicant)
src/net/store.ts         GameStore interface: CloudStore (Supabase) and LocalStore (localStorage)
src/world/planetGen.ts   seeded island: floor/rock/ruins/void, tiles, nodes, enemies, decor, glows,
                         trees/towers + blockers, fixed base layout (vessel, cradle, build pad)
src/world/groundPaint.ts painted floor: one full-color image per planet (relief-shaded noise, soil/cover blend,
                         per-kind detail: grass blades, snow ridges, sand ripples, spore pores, glowing basalt
                         cracks, craters; pebbles, ruin slabs, wall shadows, pond banks). Styles in src/data/floor.json.
                         The tilemap now only draws water and walls.
src/fx/                  Lighting (multiply darkness RT + additive lights), Atmosphere (sky, stars, fog,
                         dust, spores), Fx (particle bursts, slash, floating icons), procedural textures
src/entities/            Player, Skitter + Hopper (Enemy interface), CrystalNode + Shard (Ember), Base (pad + Replicator)
src/fx/Environment.ts    real-time day/night (device clock), sunbeams, daylight lift, fireflies, rain + ripples + lightning
src/audio/Sound.ts       procedural WebAudio: every sound effect and the generative ambient music (no audio files)
src/entities/            ... Spitter + Spore (reflectable), Ruin (machine core -> sealed door -> module), Wildlife
                         (Grazer you pet, bird Flock that scatters, Butterflies by day), Npc (drifted copies), Gear
src/core/drift.ts        replication drift (visor, headgear, trail, stats) from src/data/drift.json
src/world/galaxy.ts      star lookup, distances, travel time and fuel (src/data/travel.json), planetFor(star, index):
                         the world you land on (Earth from planets.json, else the system planet or a giant's moon)
src/world/system.ts      a star's planets in orbit order: confirmed ones from the catalog, else generated from the star
                         id; temperature from orbit + spectral class -> biome, seed, size; planet 1 of settled stars
                         keeps its pre-system biome (LEGACY_WORLDS)
src/fx/Globe.ts          pixel planet from orbit: land/sea + polar caps (`poles`), or banded gas/ice giants
src/entities/Guardian.ts the beacon keeper (Enemy): sleeps by the monolith, wakes when you come close, chases, charges
                         (stuns itself on walls: wide open) and slams (ring telegraph); dies into the Spark
src/entities/Beacon.ts   the monolith: dormant, or lit for good (lens, seams, sky beam, motes) once its keeper falls
src/entities/Resources.ts ... Spark: the rare white pickup a lit beacon leaves (replicants.traits.sparks)
src/data/beacon.json     keeper stats (kid mode: kidHp/kidDamage), spark pickup, plaza size and distance
src/entities/Village.ts  what copies build around the base (lamps, signs, flags, gardens, huts, totems): shared work
                         pool, taste per copy, free-spot search, ghost + hammering, saved in planet_states structures
src/scenes/StarMapScene  3D star map (drag/pinch/wheel, tap a star, tap again for its system: planets as live globes
                         on temperature-tinted orbits, tap one to pick it), launch or look-only
src/scenes/TravelScene   departure orbit (globe, giant behind a moon), warp, real-time cruise + ETA, visits, arrival
src/input/Controls.ts    keyboard + gamepad + touch state merged into one input frame
src/ui/overlay.ts        HTML forms over the canvas (sign-in, new profile)
src/scenes/              Boot (assets) -> Home (sign-in, profile picker) -> Planet (world, saving) + UI (counter, title, touch)
                         Planet <-> StarMap (overlay) -> Travel -> Planet (arrival); Home goes to Travel while in flight
supabase/migrations/     schema applied to the "Replicated" Supabase project (keep in sync when changing the DB)
```

Saving: the shared Ember pool, node damage, structures (Replicator and the copies' builds) and the copies' banked
building work live in `planet_states` and are written as atomic deltas
(`apply_planet_delta` RPC) every 4s and when the page is hidden; the server value wins so every profile shares one
pool. The replicant row stores position, planet and `traits.awake` (Earth's wake-up intro plays once per replicant).
Journeys store `from_planet` / `to_planet` (migration 0006). Every table is scoped by `galaxy_id` with row level
security; `ensure_family_galaxy()` creates the galaxy on first sign-in.

Sprite legend roles: `a0/a1/a2` = planet accent (dark, mid, light), `g0/g1/g2` = planet ground, `f0/f1` = replicant
feature color (visor, antenna tip, chest core).

Commands: `npm run dev` (local server), `npm run build`, `npm run sprites -- --preview` (writes `screenshots/sprite-sheet.png`), `node tools/screenshot.mjs --name <n> [--query "shot=1"] [--wait ms]`,
`node tools/playtest.mjs` (scripted headless playtest of the ruin puzzle, dash, combo, spore reflect, petting),
`node tools/playtest-beacon.mjs` (beacon world: keeper wakes, charges, slams, falls; beacon lights; Spark saved),
`node tools/fps.mjs "<query>"` (headless frame rate; software GL, only for comparing builds).

Controls: move WASD/arrows/left stick/left-side touch drag. Attack Space/J/Enter/Z, left click, gamepad A/X/R1, tap right
side (three quick attacks = heavy combo finisher; presses during the cooldown are buffered). Dash Shift/K/X, right click,
gamepad B/L1/R2, swipe on the right side. M or the speaker icon (top right) mutes.

URL params: `?local` plays from this device's storage (no sign-in), `?shot=1` skips sign-in and intros and stages a
screenshot pose (enemies frozen, 9pm, dry; add `&view=base|pond|ruin` for other spots, `&kid` for kid mode),
`?planet=solace`, `?seed=123`, `?model=drone`, `?hour=13.5` (time of day), `?rain=1|0`, `?fps` (frame counter),
`?low` (force low-detail mode; also switches on by itself under 40 fps), `?fast` (travel minutes become seconds),
`?shot=1&star=tau-ceti&pi=2` (preview planet 2 of another star, as a hologram visit), `?shot=1&at=fomalhaut&pi=1`
(start the replicant on another world for real; `&view=beacon` stands you before the sleeping keeper, `&view=beacon-lit`
shows the lit monolith).

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
- Touch: floating joystick on the left 45% of the screen; tap anywhere on the right for action; multitouch. Keyboard: WASD/arrows + Space/J/Enter/Z or left click. Gamepad: left stick/d-pad + A/B/X/R1.
- Verified headless: no page errors; scripted playtest mined nodes, killed an enemy, collected shards; touch drag moved and a second finger attacked.
- Screenshots: `screenshots/phase0-gameplay.png`, `phase0-landing.png`, `phase0-touch.png`, `sprite-sheet.png`.

### Session 1b (2026-10-04): new body model, faster movement
- Deployed to GitHub Pages (PR #1 merged; repo renamed to `Replicated`, site at coldtie.github.io/Replicated/).
- New default body "replicant" (`tools/sprites/replicant.json`, 16x20): slim humanoid with a visor band, head fin with a glowing tip, a glowing chest core and a short red cape. The original drone (`tools/sprites/player.json`) is kept and selectable with `?model=drone`. Models are listed in `src/data/player.json`.
- Move speed raised from 78 to 90.

### Session 2 (2026-10-04): Phase 1, Earth, saves, Replicator
- Long-term decisions recorded (real-time travel, one family galaxy, peaceful overgrown Earth, light-speed messages).
- Supabase: schema for galaxies, members, profiles, replicants, planet states, journeys, discovered stars and messages,
  all with RLS (verified: another family's login sees and changes nothing). Sign-in is one family login per device.
- Home screen: title, family sign-in form, profile cards with each replicant in its visor color, add profile
  (name, visor color, kid mode), sign out. `?local` / "play on this device" works offline.
- Earth is the start planet: teal-green overgrown ground, trees that sway, vine-covered towers, the cradle where the
  first replicant wakes (visor flickers on), vessel parked at the base.
- Second enemy: Hopper (crouches, shows a landing ring, hops; only hittable on the ground).
- Base: build pad glows when the shared pool has 25 Embers; stand on it and press action to build the Replicator.
- Saves: Embers, crystal damage (regrows after 30 min), Replicator, replicant position and awake state.
- Kid mode: no Ember counter, no dying (sparkle back to base).
- Verified headless: create profiles, wake, mine 27 Embers, build, reload and resume with everything restored; no errors.
- Screenshots: `screenshots/phase1-*.png`.

### Session 2b (2026-10-04): playtest fixes
- Left mouse click attacks / interacts (same as Space).
- Health regenerates (1 hp every 2.5s after 4s without a hit; `regen` in `src/data/player.json`). The player light
  keeps a higher floor at low health so a hurt replicant no longer fades into the darkness and looks see-through.

### Session 3 (2026-10-04): Milestones 1 and 2 ("Living Earth" visuals, "Feel" gameplay)
Plan agreed with Steve: M1 visuals, M2 feel, M3 Replicate, M4 Leaving Earth (space travel).
- Sound: all procedural (WebAudio). Footsteps per surface (grass, stone, water), swings, hits, crystal chimes in a
  pentatonic scale, rising pickup notes, hurt, dash, enemy calls, build, door, upgrade, rain bed, thunder, and a slow
  generative pad that drops lower and sparser at night. Starts on first tap; `navigator.audioSession` set to playback.
  Volumes and the chord progression live in `src/data/sound.json`.
- Day and night follow the device clock (`src/data/daycycle.json`): pink dawn, sunny day with drifting sunbeams, amber
  dusk, dark night with stars and fireflies. Rain is rolled per real hour (same for the whole family), with ripples and
  lightning at night. Earth only (`dayCycle`, `weather` in planets.json).
- Dash with visor-colored afterimages and invulnerability; 3-hit combo (third swing is heavy: bigger arc, 2 damage,
  more knockback); input buffering; the camera leans ahead of movement; slow motion on the last kill of a fight.
- Living world: grass, reeds and flowers bend as you or a grazer walk through and sway in the wind; ponds (shallow,
  slow you down, splash, glints, your reflection); lily pads, reeds, flowers. Grazers (moss deer) can be petted (hop +
  hearts; in kid mode they follow you for a while). Bird flocks scatter when you get close. Butterflies by day.
- Ruins are now a wordless puzzle: hit the broken machine, a glowing core (same color as the sealed door) pops out and
  follows you, bring it to the door and it opens; inside floats a module (light, dash or swing +20% for the replicant
  who takes it, stored in `traits.mods`). Door state is shared per planet (`planet_states.data.doors`, migration 0004).
- Spitter: rooted spore plant that swells and spits slow spores; hit a spore to bat it back for 2 damage.
- Performance: `?fps` counter, auto low-detail mode (drops sunbeams and firefly lights) under 40 fps.
- Screenshots: `screenshots/m1-*.png` (day, dusk, night, rain, pond day/night, ruin).

### Session 3b (2026-10-04): Milestone 3, Replicate
- With the Replicator built, a ring glows in front of it once the pool has 30 Embers (`src/data/drift.json`). Stand on
  it and press action: a scanner beam sweeps you, the copy builds up line by line beside the Replicator, its visor
  flickers through colors and settles on its own, its name floats up (STEVE II, STEVE III, ...). Not enough Embers:
  the Replicator buzzes and dims.
- Drift (`src/core/drift.ts`): visor color, headgear (`tools/sprites/gear.json`: antennae, halo, horns, sprout, dish,
  crown; tinted with the trail color and pinned to the visor pixel per frame via manifest `anchors`), trail color,
  and stat nudges (speed, light, gather). Stored as `replicants` rows with `status = 'npc'`, `parent_id`, `generation`.
- Copies wander the base, greet you (turn, hop, chirp), walk to crystals near the base, mine, and carry an Ember back
  to the Replicator (+1 to the shared pool per trip). While nobody plays they gather `gatherPerHour` each (times their
  gather stat), counted from `planet_states.data.npcTick` up to 12 hours; on return the Embers stream in from them.
- Player replicants use their own stats too (speed, light) and show headgear/trail if they have them (for handoff).
- Migration 0005: `apply_planet_delta` shallow-merges any top-level key (nodes/doors still merge per key).
- `?shot=1&view=replicate` stages a birth; `&copies=4` adds made-up copies for screenshots. Screenshots `m3-*.png`.

### Session 3c (2026-10-04): Milestone 4, Leaving Earth
- 44 real stars (Sun-centered x/y/z in light years from RA/Dec/distance) in `src/data/stars.json`; beacons are the far
  stars nearest four tetrahedral directions at 38 ly: Fomalhaut, Pollux, Arcturus, Capella (25 to 43 ly).
- Stand on the ring below the vessel and press action. You can only leave a planet that has a copy on it (someone
  stays behind); otherwise the vessel buzzes and a ghost copy blinks by the Replicator. The star map opens: drag to
  turn, pinch or scroll to zoom, tap a star; it shows distance, real travel time and fuel (Embers from this planet).
- Travel time (`src/data/travel.json`): 45 min * (ly / 4.37) ^ 2.5, so Alpha Centauri 45 min, 12 ly about 10 hours,
  beacons 3 to 10 days. Fuel 10 + 2 per ly. `?fast` makes minutes seconds for testing.
- Launch: the replicant hops in, liftoff with thrusters and shake, then space: the planet from orbit (procedural
  pixel globe, Earth with ice caps and the base glowing on the night side), the ship pulls away, warp.
- In flight: streaking stars, route bar and "ARRIVES IN ..." (real time; kid mode shows only the bar), the star map
  (look only, shows every family ship in flight), and visits: tap a settled planet to walk around it as a hologram
  (cyan, flickering; nothing about your own position is saved; the vessel ring takes you back to the ship).
- Arrival (live or the next time you open the game): the destination planet grows, the ship lands (landing intro),
  the star joins `discovered_stars`. Planets around other stars come from `src/data/biomes.json` (verdant, frost,
  dune, spore, ember, moon), picked by the star id, tinted by the star's light (red dwarfs are red). Beacon systems
  get three times the crystals. Each biome has its own tinted sprite sheets.
- Store: `journeys` rows (start, active, complete), `discovered_stars`, replicant `status` = `in_transit`.
- `node tools/playtest-travel.mjs` runs map, launch, warp, arrival and landing headless and saves `screenshots/m4-*.png`.

Not done / next:
- Milestone 1 leftovers: rounded autotiled rock edges, bloom, a guardian mini-boss in the largest ruin.
- Beacon landmark (something special to find at a beacon), FTL comms, messages, Spark handoff (Phase 3).

### Session 4 (2026-10-06): consolidation, single lead
- A parallel session had built its own Phase 2 (copies, star map, travel) on a separate branch at the same time as
  Milestones 3 and 4 landed on `main`. That branch was dropped (PR #7 closed); `main` is the one true version and this
  session is now the lead.
- The dropped branch had applied one database migration (`planet_delta_merge_keys`) before 0004/0005; those replaced
  it, so the live `apply_planet_delta` is the 0005 version (verified). Recorded as `0003b_*.sql` (history only).
- Verified on `main`: build passes, `tools/playtest.mjs` (ruin, dash, combo, spitter, copies, petting) and
  `tools/playtest-travel.mjs` (map, launch, warp, arrival, landing) pass with no errors; every table, column and RPC the
  client uses exists in the live database; Supabase advisors show only expected notes.
- Live data: Steve's family login exists, one profile, one copy made on Earth.
- Steve's feedback (loves the pickup and attack sounds): rain 40% quieter (`rain` in `src/data/sound.json`, 0.18 ->
  0.108); Ember shards fly 10% faster (`magnetPull` in `src/data/items.json`), commit once they start flying and pass
  through rocks, trees and walls (no more getting stuck); in flight they shimmer in a rolling rainbow and right before
  pickup glitch like a teleport (jitter, flicker, red/cyan split, static pixels, a white scanline flash on arrival).

### Session 5 (2026-10-06): arm, 5 second trips, painted floors
- Verified Session 4's changes are on `main` (PR #9 merged) and deployed (Pages run succeeded).
- Replicant body has a second, body-grey front arm on every frame (hangs at idle, swings while walking); the red cape
  stays as the one red arm. Edited in `tools/sprites/replicant.json`.
- Every trip now takes 5 seconds: `fixedSeconds: 5` in `src/data/travel.json` overrides the real-time formula (set it
  to 0 to bring real-time travel back; the long-term decision stands, it is just switched off for now).
- Floors are painted instead of tiled (`src/world/groundPaint.ts`, styles in `src/data/floor.json`): continuous,
  full-color, relief-shaded ground with no visible grid. Earth and Verdant get grass blades, clover, flowers, fallen
  leaves under trees, a worn dirt clearing around the base and grass hanging over the cliff edge; Frost gets snow with
  wind ridges and glinting ice; Dune gets wind ripples; Spore gets spongy pores and glowing specks; Ember gets cracked
  basalt plates with glowing lava seams; Moon and Solace get craters. Ruin floors are worn stone slabs with moss in
  the cracks. Soft shadows under rock walls and damp pond banks. Painted once per planet load (about 0.1 to 0.45 s
  on a desktop). Stays at the 480x270 pixel canvas.
- Verified: build, `tools/playtest.mjs` and `tools/playtest-travel.mjs` pass with no errors.
- Screenshots: `screenshots/floor-*.png` (`floor-before.png` is the old tiled floor for comparison).

Not done / next:
- Rock tops are still the old speckled tiles; painting them the same way would match the new floors.
- Fix: ships launched before the 5 second change (still on the old real-time schedule) now also arrive 5 seconds after
  departure (`capJourney` in `src/net/store.ts`).

### Session 5b (2026-10-06): supplies on new worlds (Steve: "barren, can't afford a copy")
- Every planet now grows a starter cluster of 3 crystal nodes 8 to 13 tiles from the landing site (placed last in
  `planetGen.ts` with its own rng, appended to the end of `nodes`, so existing layouts and saved node damage keep
  their indexes).
- Nodes are richer: 2 Embers per hit, 4 on break (8 per node, was 5) in `src/data/items.json`; they regrow after
  10 minutes instead of 30 (`src/data/backend.json`). Enemies drop one more Ember each (`src/data/enemies.json`).
- Sparse biomes (frost, dune, ember, moon) get roughly double the decor density so they read less empty.
- A copy costs ~4 nodes of mining now; Replicator + copy + fuel on a fresh world is reachable in one short session.
- Verified: build, both playtests pass; screenshots `supplies-ember-base.png`, `supplies-earth-base.png`.

### Session 5c (2026-10-06): Fomalhaut was a closet (Steve got walled in)
- On rocky biomes the landing site could be sealed inside a small rock pocket, and "keep only reachable floor" then
  turned the entire rest of the island to rock. Fomalhaut, the beacon Steve flew to, generated with 138 walkable
  tiles (2% of the map) and 4 crystal nodes.
- `planetGen.ts` now measures the reachable area after the flood fill and, while it is under 30% of the map, carves
  winding canyons out from the landing site through the rock (up to 4 rounds of 5 spokes, own rng) and refloods.
  Fomalhaut: 2,246 walkable tiles and 69 nodes. Every star's world is now at least ~33% walkable; worlds that were
  already open are untouched.
- Verified: build and both playtests pass; all 44 star worlds checked. Screenshot `fomalhaut-fixed.png`.


### Session 5d (2026-10-06): poles, landing (Steve's feedback)
- Globes from orbit had the same flat grey cap on every world, covering 35 degrees of latitude at each pole. Caps are
  now a per-world tunable `poles` (`size`, `[edge, core]` palette colors) in `planets.json` / `biomes.json`, measured
  in true latitude, with a wavy edge that follows the terrain noise and two shaded tones: Earth and Verdant get small
  white ice caps, Frost a big one, Dune salt-pale, Spore pink, Ember dark ash, Moon none. `screenshots/globes-poles.png`.
- Landing: the replicant was standing on the ground (with its light, glow and shadow) while the vessel was still
  descending, then jumped to the door. `Player.hide()` now hides everything at once and `Player.show()` brings it
  back; both the landing and the Earth cradle intro use them, and the cradle's visor flicker toggles the light
  (the per-frame health glow had been overwriting its intensity). Verified headless: nothing of the player is drawn
  during the descent, everything is back after the hop. `screenshots/landing-descent.png`.
- `window.__Globe` exposes the globe renderer so headless scripts can draw every world side by side.

### Session 5e (2026-10-06): a real galaxy, planets per star, a village that builds itself (Steve: "wow me")
- Catalog (`tools/build-stars.mjs`): 123 real stars out to ~50 ly (plus a few bright landmarks), 59 of them with
  their confirmed planets (141 in all) as astronomers list them: letter, kind (rock / super-Earth / ice giant /
  gas giant), orbital period, habitable zone, IAU names where they exist (Dimidium, Thestias, Quijote, Galileo...).
  The solar system is in too: Mercury, Venus, Mars, and the giants' moons Europa, Titan, Miranda and Triton are
  destinations. Beacons stay pinned to Fomalhaut, Pollux, Arcturus and Capella. Values are a hand-authored snapshot
  (the archive hosts are blocked from this environment); say the word to correct any entry.
- Systems (`src/world/system.ts`): every star has 1 to 8 planets in orbit order; unknown stars get 1 to 4 generated
  ones. Temperature from orbit and spectral class picks the biome (hot: ember/moon, temperate: verdant/spore/dune,
  cold: frost/moon); around a giant you land on its moon. Planet 1 of every star the family had settled keeps its old
  biome and seed (`LEGACY_WORLDS`), so Steve's worlds at Regulus, Pollux, Fomalhaut and Achird are unchanged.
- Journeys carry `from_planet` / `to_planet` (migration 0006, applied live). Hops inside a system cost base fuel; in
  real-time mode they take `inSystemMinutes` (travel.json).
- Star map: tap a star, tap again (or the info panel) for its system: the star glows in the middle, planets turn on
  orbits tinted by temperature (red / green / blue), each a live spinning globe (giants banded, with a circling
  moon), labels white for confirmed worlds and grey for uncharted ones. Tap a planet for its kind, "confirmed by
  astronomers" or "uncharted", trip time and fuel, then launch. Galaxy view: stars out of fuel range dim, stars with
  known planets show pips (green when one is in the habitable zone), labels never overlap. Zoom 0.25x to 6x.
- Travel: leaving or reaching a moon shows the giant looming behind it.
- Village (`src/entities/Village.ts`, `src/data/village.json`): copies build lamps (warm light), signs (arrow /
  crystal / heart pictograms), flags in their own trail color, glowing gardens, huts (lit window, chimney smoke) and
  totems. Work banks up while nobody is there (1.6 per copy-hour, 12 h cap, same clock as the Embers) into the
  planet's shared pool (`planet_states.data.village.work`); when you land, the copies spend it in front of you: pick a
  project by taste (each copy's id weights the list; the village avoids too many of one thing), walk to a free spot
  in a ring around the base near the other builds, a ghost outline brightens with each of 5 hammer blows, then the
  build pops up with dust and its light fades in. Up to 6 builds per copy. Saved in `data.structures` with builder,
  tint and variant; the whole family sees the same village.
- Verified headless: build, both playtests, map/system captures (`screenshots/map-*.png`), five copies raising a
  village from a banked pool (`screenshots/village-*.png`).

Not done / next:
- Signs and huts are decoration only; "enter a hut", a sign that points at the nearest crystal, and copies that tend
  their gardens (regrow nearby nodes faster) would make the village matter.
- Decided 2026-10-06: no AI for the copies after all (Steve). The village stays fully procedural; "LLM driven NPC
  dialogue" stays out of scope.

### Session 5f (2026-10-06): feel fixes from Steve's play
- Damage no longer fades the replicant into the dark. The light stays at full strength and only shrinks a little;
  instead the glow and light turn from warm to red as hp drops, and a hurt body sheds red and yellow sparks and
  grey smoke (faster when low) with a brief red flicker. `Player.update` in `src/entities/Player.ts`.
- 10% faster (`speed` 90 -> 99) and a longer dash (`dash.speed` 270 -> 290, `dash.ms` 150 -> 170: about 49 px
  instead of 40) in `src/data/player.json`.
- Corner help: when you push into the edge of a tree, rock, node or building and one side of it is open, the body
  eases that way and slips around instead of sticking (`Player.slideAroundCorners`, `PlanetScene.blockedAt`).
  Verified headless: pushing diagonally into a 24x10 blocker now gets past it.
- Top-left label under the Ember counter: "MARS - SOL" (or "TITAN - SATURN" on a moon) and the replicants living
  here, you first, each name in its visor color (`location` event, `UIScene.showLocation`; updates when a copy is
  born).

### Session 5g (2026-10-06): faster pickups
- Embers reach you about 25% sooner: shards may start flying after 340 ms instead of 450, from 55 px away instead
  of 44, and fly 25% harder (`pickupDelayMs`, `magnetRange`, `magnetPull` in `src/data/items.json`).

### Session 5h (2026-10-06): painted rock, the core that got stuck
- Rock outcrops are painted like the floors (`src/world/rockPaint.ts`, styles under `rock` in `src/data/floor.json`):
  one full-color image per planet over the wall tiles (which stay for collision). Tops are relief-shaded noise in
  the biome's rock ramp with contour cracks, a lit rim along the top and left edges and a dark outline on the
  right; moss (Earth, Verdant), snow (Frost) or dust gathers in the hollows; ember rock splits into plates with
  glowing seams. Where an outcrop ends, the cell below shows its front face with a lit lip, streaks and strata,
  darkening to the ground. Ruins keep their stone tiles. `screenshots/rock-*.png`.
- The ruin core could land inside a wall (always 10 px right and below the machine) where you could not get within
  reach, so it sat there forever (Steve's screenshot). It now lands on the first open floor spot around the
  machine, drifts toward you when you come within 44 px, and is picked up from 20 px instead of 14.

### Session 5i (2026-10-06): the body stays solid (Steve: "the model starts looking see-through")
- After a hit the replicant used to be hidden every other 70 ms for the 0.9 s invulnerability window, which on a
  real display looks like a half-transparent body. The sprite is now never hidden or faded while alive: the hit
  is a white flash, invulnerability an opaque red pulse (skipped while dashing, where the trail shows it), low
  health a quick red flicker. One `applyTint` pass per frame in `src/entities/Player.ts` decides the tint, so no
  delayed call can leave the body in a half state (the hologram tint survives it too).
- `screenshots/hurt-before-{1,2}.png` vs `hurt-after-{2,3}.png` (frame 2 before: glow and sparks, no body).

### Session 6 (2026-10-08): beacons have a reason (Steve picked "a reason to reach a beacon")
- Planet 1 of each beacon star (Fomalhaut, Pollux, Arcturus, Capella; `PlanetDef.beacon` set by `planetFor`) now holds
  a stone plaza far from the landing site (`planetGen.ts` step 11, own rng, appended last: crystal node indexes are
  untouched, crystals may stand on the plaza, rock inside it is carved away, decor and creatures there are cleared;
  11x9 tiles, 9x7 if nothing bigger fits) with four pillars, the dormant monolith (`tools/sprites/beacon.json`,
  32x48) at its head and the keeper asleep in front of it. Title subtitle reads "A BEACON SLEEPS HERE" until lit.
- The keeper (`tools/sprites/guardian.json`, 32x32, tinted by the planet accent; `src/entities/Guardian.ts`;
  tunables in `src/data/beacon.json`): a stone sentinel with one eye and ember seams. Walk up (66 px) and it wakes
  (roar, rumble, eye lights). It walks at you; at range it crouches with a bright eye and charges (2 damage; if it
  runs into a wall it is stunned for 1.5 s and takes double damage: dash out of its way), up close it crouches with a
  ring on the ground and slams (hurts within the ring). 14 hp (8 in kid mode, where it hits for 1); your hits barely
  move it; its eye dims as it weakens. It is hit from a bit further than small enemies (`Enemy.reach`).
- When it falls (slow motion, rumble, crumbles into debris) the monolith lights for good: white flash, "BEACON LIT"
  card, the lens burns white, cyan seams pulse, a beam climbs into the sky and motes rise, with a 150 px light.
  Saved as `planet_states.data.beacon = { lit, at, by }` (the 0005 RPC already merges any top-level key; the local
  store now does too). A lit beacon has no keeper on later visits.
- The Spark (`tools/sprites/spark.json`): pops out where the keeper fell, hovers and twinkles, flies to you from 48 px.
  Counted on your replicant (`traits.sparks`, saved at once) and shown as a white star next to the Ember counter
  once you have one (hidden in kid mode). This is the resource Phase 3's handoff will spend; nothing spends it yet.
- Star map: lit beacons show a filled white diamond with a beam and a cyan label ("- BEACON LIT"); `GameStore.litBeacons()`
  lists them (cloud: `data->beacon->>lit`). The planet loads them on arrival and passes them to the map.
- New sounds: roar, stomp, slam, the keeper crumbling, the beacon igniting (boom then a climbing chord), the Spark.
- Verified headless (`tools/playtest-beacon.mjs` on Fomalhaut): wake, charge, wall stun, slam, death, beacon lit,
  Spark collected and counted, beacon delta saved and listed; the two older playtests still pass.
  Screenshots `screenshots/beacon-*.png`, `map-beacon-lit.png`.

Not done / next:
- Spark handoff (Phase 3, step 6): spend a Spark at the Replicator to awaken a copy for another profile.
- Steve's worlds at Fomalhaut and Pollux are already settled: the plaza appears on them now (nothing of theirs moves).

### Session 6b (2026-10-08): pivot to one player, softer shake, smooth light, a way home
- Pivot (Steve): the game is built for Steve alone on a laptop for now. Everything about other players and other
  devices is gone from these instructions; the touch controls and the `kid_mode` flag stay in the code untouched.
- Screen shake: normal hits no longer shake the camera (the hit pause, flash and squash carry them); only the heavy
  finisher (120 ms, 0.004) and taking damage (120 ms, 0.004, was 0.006) do, and the spore reflect shake is gone. One
  multiplier `shake` in `src/data/player.json` scales every shake in the game (0 turns them all off).
- Light: the `light` and `glow` textures are smooth, linear-filtered falloffs instead of 6 dithered bands (the dither
  scaled up read as a checkerboard speckle around the player and the vessel). Sky, fog and vignette keep their dither.
  The player now has a tight halo at the body (the health readout: dims, tightens and turns red as hp drops) and a
  wide faint pool on the ground; the vessel has a smaller bloom and a warm pool on the ground under it.
  `screenshots/light-before-zoom.png` vs `light-after-zoom.png`, `light-after-base.png`.
- Vessel cue: whenever the ship is off screen, a small ship icon with a warm chevron sits on the edge of the screen in
  its direction (fades in and out over 0.35 s, gentle pulse; hidden while you are inside the ship). `PlanetScene.
  updateVesselCue`. `screenshots/vessel-cue.png`.

### Session 6c (2026-10-08): shorter dash, module notice
- Dash is 30% shorter: `dash.ms` 170 -> 120 in `src/data/player.json` (about 35 px instead of 49; speed unchanged).
- Taking a ruin module shows a one-line notice, "STEVE GETS +20% DASH" (your replicant's name, the kind: LIGHT,
  DASH or SWING), lower middle of the screen, rising in and fading after 2.6 s (`notice` game event,
  `UIScene.notice`). The pixel font gained a `%` glyph (`tools/sprites/font.json`).
- `tools/screenshot.mjs --eval "<js>"` runs a snippet in the page before the capture. `screenshots/module-notice.png`.


### Session 7 (2026-10-08): the copies wake up (pivot: minds, songs, journal)
Steve's pivot, after Black Mirror "Plaything": the copies are a digital species that sings. Reverses the 2026-10-06
"no AI for the copies" decision. The copies now have minds; "LLM driven NPC dialogue" is no longer out of scope
(dialogue trees still are: they speak through their own notes, letters and songs).
- **Minds.** `supabase/functions/mind/index.ts` (Edge Function, deployed): the game calls it with the player's JWT for
  one copy at a time (`MIND.firstWakeMs` after landing, `staggerMs` apart, then every `wakeMinutes`; the function
  itself refuses to wake a copy more than once per 90 s). The copy gets its persona (name, parent, generation, visor,
  headgear, stat quirks), the place, time, weather, the Ember pool, the village, who is here and elsewhere, its last
  12 notes, unread letters and what happened since it last woke, then acts through tools: `remember` (notes table),
  `say_to` (messages table, `arrives_at` = now + light-speed delay, `mailSecondsPerLy` in `src/data/mind.json`,
  instant on the same star), `ask_for` (requests table: lamp, garden, hut, flag, totem, sign, name, other),
  `choose_name` (renames its own row, logged as a done request). Its final text is its song. Model: Claude Opus 5.5,
  low effort, server-side refusal fallback. The API key is a Supabase Edge Function secret (`ANTHROPIC_API_KEY`).
  Migration 0007 (applied live): `notes`, `requests`, `messages.read_at`, `replicants.last_tick_at`, RLS as before.
  `?local` play uses a canned mind (`MIND.canned`) so headless tests and screenshots need no model.
- **Songs.** `Sound.sing(seed, text)`: each copy's voice comes from its id (register, sine/triangle/square, one of
  five pentatonic modes, optional octave shimmer); every word hashes to a note so a sentence always sings the same
  tune, long words hold longer, a sentence ends on a chord; a copy answering within 6 s sings a third or a fifth
  above the last voice. `Sound.chorus(seeds, line)`: a round, the same tune in every voice entering half a beat
  apart on their own chord tones across the stereo field, ending on a long chord. Copies gather and sing a line from
  `MIND.chorusLines` 30 to 70 s after landing and every 4 to 7 minutes (`PlanetScene.chorus`).
- **Bubbles.** `Npc.sing(text, readable)`: a bubble over the head; readable text in the pixel font, or runes in the
  copy's trail color until the replicant can hear. A letter arriving glints and chimes (`Npc.receiveLetter`).
- **Hearing them.** Fourth ruin module `listen` (`tools/sprites/module.json` frame 3, orange): "STEVE HEARS THEM
  NOW", the copies answer with a chorus, songs and the journal become words. Earth's ruin 4 holds it.
- **Journal.** Tab or I (or tap the corner label on touch): an HTML panel (`src/ui/journal.ts`) with each copy's
  notes, letters (sent and received, "arrives in N min" while in flight) and requests; runes until you can hear.
- URL params: `&chorus=1` (copies sing together at once), `&sing=1`, `&hear=1` (pretend you hold the module).
  `screenshots/minds-chorus.png` (readable), `minds-runes.png`.
- Not yet verified with the live model (needs Steve signed in); verified headless with the canned mind.

Next (Steve, 2026-10-08, "give these guys everything"), in this order unless he reorders:
1. Requests in the world: an open request shows as a pictogram sign by the copy; the build pad builds what they ask;
   a `NEEDS.md` the copies' needs are written to, for Steve and for a Claude Routine to read.
2. Bigger, more open worlds: fewer rock walls, larger islands.
3. Animals on every planet (grazers, flocks, butterflies exist on Earth only).
4. Homes: copies go inside huts (door, lit window, out of the rain and at night).
5. Water and food as resources the copies gather and need (thirst and hunger in their context).
6. Appearance: a copy can ask to look different; Steve asks Claude; later a Claude Routine reads the requests
   (Supabase) and NEEDS.md and edits `tools/sprites/*.json` and the replicant's `model` itself.

### Session 7b (2026-10-08): they choose their bodies
- Live: four copies on Earth woke with the real model and renamed themselves (Sprout, Dusk, Lookout, Glint).
- `describe_self` tool: a copy describes the humanoid body it wants (2 to 4 sentences). Saved as an open `requests`
  row of kind `skin` (migration 0008, applied live) and in `traits.look`; the journal lists it under "A NEW BODY";
  "GLINT DESCRIBES A NEW BODY" notice when you can hear. The copy is told it looks like every other copy until then.
- Making a body is Claude Code's job (Steve asks, later a Routine): `NEEDS.md` holds the open requests and the
  three steps (`tools/body.mjs <slug>` clones replicant.json and registers the model in player.json; edit pixels;
  `npm run sprites`; set `replicants.model`; mark the request done). Any model listed in `player.json` works for a
  copy or a player; the visor still takes the feature color through the `V`/`v` roles.

### Session 7c (2026-10-08): their own voices (Steve: "let them express themselves")
- Gathering is quieter: crystal chips and Ember pickups at about 60% of their old volume (`Sound.crystal`, `collect`).
- Voices 20% louder (`sing` 0.084, `chorus` 0.06).
- Instruments: hum, bell, flute, glass, pluck, horn, chime, drum (`INSTRUMENTS` in `src/audio/Sound.ts`: wave,
  attack, sustain, reverb, an inharmonic partial for bell and chime, an octave shimmer for glass and chime). Moods are
  modes: bright, soft, sad, wild, ancient, dreamy. Tempos: slow, walking, quick. A copy is born with an instrument
  and a mood from its seed.
- `sing_as` tool: a copy picks instrument, mood and tempo (kept in `traits.voice`, used for every later song) and
  can compose the tune for this song as scale degrees ("0 2 4 7_ - 4 2 0__": "-" rest, "_" hold; `parseMelody`).
  Composed lines end on a chord of their mode (except wild). Without a tune, words still pick the notes.
  Notice when you can hear: "GLINT SINGS ON THE BELL". The canned mind composes now and then too.
- The PR merge method is now a merge commit, not a squash: squashes kept conflicting with this long-lived branch.
