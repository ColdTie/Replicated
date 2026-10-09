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
src/data/*.json          palette, planets, player, enemies, items, structures, backend, village, warren (all tunables)
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
src/world/warren.ts      the warren's layout engine: rooms the copies ask for (kind, size, beside which room, which side)
                         become tile rects + 2-wide corridors; items find their tile (beds on the back wall, lamps in
                         corners); describeWarren() puts it in words for the minds and the journal
src/world/warrenPaint.ts one painted image of the underground (strata, crystal veins, flagstones, wall faces, chalk
                         outlines of planned rooms)
src/entities/Warren.ts   the warren at runtime: the hatch by the base, which copy goes down to dig / make its bed /
                         sleep, swing timers, the home drive, saving (planet_states.data.warren)
src/scenes/WarrenScene   underground view over the paused planet: walk, dash, lanterns, sleepers in pods, diggers at
                         the rock face; the ladder takes you back up
src/data/needs.json      the copies' needs (rest, company, purpose): decay hours, company range, purpose per work, lamp and mural effects
src/data/buildings.json  surface buildings: footprint limits, cost per tile and material, roofs, doors, approval delay
src/world/buildingPaint.ts draws a building from its blueprint (planks / blocks / plates, flat / peaked / dome roof, door, window)
src/entities/Buildings.ts proposals, the original's approve / veto, paying, shared raising, offline progress; the
                         communal Meeting Hall / Workshop / Lookout the village starts on its own when the store is full
src/data/supplies.json   materials (stone, soil, wood, scrap, Ember), yields, storage, recipes
src/data/parts.json      the parts kit: heads, visors, torsos, arms, legs (or treads / hover), back pieces, named colors, poses
src/core/bodyRender.ts   composes a 16x20 x 14 frame body from the kit + a spec (pure; tools/body-preview.mjs runs it in Node)
src/core/body.ts         bodyFor(): the texture for a replicant (composed and cached, or its hand-made model), visor anchors
src/scenes/StarMapScene  3D star map (drag/pinch/wheel, tap a star, tap again for its system: planets as live globes
                         on temperature-tinted orbits, tap one to pick it), launch or look-only
src/scenes/TravelScene   departure orbit (globe, giant behind a moon), warp, real-time cruise + ETA, visits, arrival
src/input/Controls.ts    keyboard + gamepad + touch state merged into one input frame
src/ui/overlay.ts        HTML forms over the canvas (sign-in, new profile)
src/scenes/              Boot (assets) -> Home (sign-in, profile picker) -> Planet (world, saving) + UI (counter, title, touch)
                         Planet <-> StarMap (overlay) -> Travel -> Planet (arrival); Home goes to Travel while in flight
supabase/migrations/     schema applied to the "Replicated" Supabase project (keep in sync when changing the DB)
supabase/functions/mind/ the minds (index.ts) and kit.json (generated by tools/build-mind-kit.mjs from src/data: run it
                         and redeploy after changing parts, supplies, buildings, mind or stars data)
```

Saving: the shared Ember pool, node damage, structures (Replicator and the copies' builds) and the copies' banked
building work live in `planet_states` and are written as atomic deltas
(`apply_planet_delta` RPC) every 4s and when the page is hidden; the server value wins so every profile shares one
pool. The replicant row stores position, planet and `traits.awake` (Earth's wake-up intro plays once per replicant).
Journeys store `from_planet` / `to_planet` (migration 0006). Every table is scoped by `galaxy_id` with row level
security; `ensure_family_galaxy()` creates the galaxy on first sign-in.

Sprite legend roles: `a0/a1/a2` = planet accent (dark, mid, light), `g0/g1/g2` = planet ground, `f0/f1` = replicant
feature color (visor, antenna tip, chest core).

### Traits schema v1 (`replicants.traits`, since session 9; `v: 1`)

One JSON object per replicant, read by the game and the mind alike. Every key is optional; missing means "not yet".

| group | key | what |
| --- | --- | --- |
| look | `body` | `{ head, visor, torso, arms, legs, back, accessory, markings, headgear, primary, secondary, accent }`: names from `src/data/parts.json`; composed at load time (`src/core/bodyRender.ts`). Absent = a hand-made model (`replicants.model`). |
| look | `feature` | visor light color (palette index; the dark one is its pair in `player.json featureColors`) |
| look | `gear`, `trail` | headgear frame (`gear.json`), trail / flag / mural color (palette index) |
| look | `look` | free text the kit cannot draw (open `requests` row of kind `skin`, hand art) |
| voice | `voice` | `{ instrument, mood, tempo }` (`sing_as`) |
| mind | `temperament` | `{ pace, sociability, work, bedtime, risk }` (`set_temperament`): walking pace, greeting range, build vs wander, when it turns in, how far it ranges |
| mind | `wants` | `[{ text, category, done, at }]` 1 to 3 goals in its own words (`set_wants` / `finish_want`) |
| state | `blank` | born and not yet itself (grey, still; the first wake is the becoming) |
| state | `awake`, `mods`, `sparks` | intro played; ruin modules; Sparks held |
| state | `weary`, `sleptAt` | tiredness carried over; last sleep |
| state | `needs` | `{ company, purpose }` 0 empty .. 1 full (`src/data/needs.json`); rest is `1 - weary`. No food or water (Steve, 2026-10-08). |
| state | `inventory` | `{ material: count }` gifts from the original the copy still holds |

Commands: `npm run dev` (local server), `npm run build`, `npm run sprites -- --preview` (writes `screenshots/sprite-sheet.png`), `node tools/screenshot.mjs --name <n> [--query "shot=1"] [--wait ms]`,
`node tools/playtest.mjs` (scripted headless playtest of the ruin puzzle, dash, combo, spore reflect, petting),
`node tools/playtest-beacon.mjs` (beacon world: keeper wakes, charges, slams, falls; beacon lights; Spark saved),
`node tools/playtest-warren.mjs` (rooms planned, a copy digs, a copy makes its bed, down the hatch, walk, back up),
`node tools/playtest-become.mjs` (a blank birth, the becoming with the canned mind, eating, the journal's wants),
`node tools/playtest-buildings.mjs` (a proposal, approval in the journal, paid and raised by three copies, talk, give),
`node tools/playtest-together.mjs` (a lonely copy seeks company, the Meeting Hall starts itself and gathers them, a
room is improved, an away wake plays out, a Spark awakens a copy as a player),
`node --experimental-strip-types tools/body-preview.mjs [--random 6]` (composed bodies side by side -> `screenshots/bodies.png`),
`node tools/fps.mjs "<query>"` (headless frame rate; software GL, only for comparing builds),
`node tools/sim-live.mjs <seed.json> <out.json> --minutes 10` (gives planets simulated play time from a snapshot of
the live data; needs `npm run build && cp -r dist dist-sim`; the result is written back to Supabase by hand).

Saving a copy: needs, weariness, sleep and gifts go through `GameStore.patchTraits` (`merge_replicant_traits`,
migration 0009), which merges only those keys, so a game left open never undoes a body, voice or name chosen since.

Controls: move WASD/arrows/left stick/left-side touch drag. Attack Space/J/Enter/Z, left click, gamepad A/X/R1, tap right
side (three quick attacks = heavy combo finisher; presses during the cooldown are buffered). Dash Shift/K/X, right click,
gamepad B/L1/R2, swipe on the right side. M or the speaker icon (top right) mutes.

URL params: `?local` plays from this device's storage (no sign-in), `?shot=1` skips sign-in and intros and stages a
screenshot pose (enemies frozen, 9pm, dry; add `&view=base|pond|ruin` for other spots, `&kid` for kid mode),
`?planet=solace`, `?seed=123`, `?model=drone`, `?hour=13.5` (time of day), `?rain=1|0`, `?fps` (frame counter),
`?low` (force low-detail mode; also switches on by itself under 40 fps), `?fast` (travel minutes become seconds),
`?shot=1&view=warren&copies=3` (a dug, lived-in warren, you at the foot of the ladder), `?shot=1&star=tau-ceti&pi=2` (preview planet 2 of another star, as a hologram visit), `?shot=1&at=fomalhaut&pi=1`
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

### Session 7d (2026-10-08): they shape the village (cut trees, take builds down)
- `cut_tree` tool: the copy walks to the nearest standing tree within 240 px of the base, swings six times (sparks,
  the tree shivers), the tree topples away from it and fades, its solid goes. Felled trees are saved per planet in
  `planet_states.data.felled` (prop indexes) and stay down. Every tree now owns its solid zone (`PlanetScene.trees`).
- `remove_build` tool: the nearest of the copy's own builds of a kind (or any) comes down after four swings
  (`Village.remove`; the Replicator and other copies' builds are off limits). Saved through `pending.structures`.
- Copies are told what they built and how many trees stand near the base; `Npc.startChore` is the shared
  walk-there-and-swing mechanic for both. Notices when you can hear: "DUSK CUT DOWN A TREE".
- The canned mind cuts and demolishes now and then so headless runs exercise it.
- More space: not done yet. Growing an existing world (Earth) moves the base and regenerates the layout under the
  village; the plan is bigger sizes and fewer rocks for new worlds in `system.ts` plus an "extend the island" pass
  for settled worlds that keeps every existing coordinate. Steve to confirm before Earth changes.

### Session 8 (2026-10-08): the warren (Steve: "let them create their own underground base ... give them resting stations")
- **Their home, underground.** Beneath the base the copies dig a warren they design themselves. Two new mind tools:
  `dig_room` (kind: hall / rest / workshop / archive / garden / gallery / pool / other; a name; small / medium / large;
  beside which room; north / south / east / west; what it is for) and `furnish` (rest = a resting station for "me"
  or a named copy, lamp, bench, shelf, workbench, planter, mural in the builder's colors, crate). The layout engine
  (`src/world/warren.ts`) turns that into rooms on a 44x34 tile grid off the fixed Entrance (ladder at the top),
  nudging a room along the wall or to another side when the asked spot is taken, with 2-wide corridors (straight or
  L). Saved whole in `planet_states.data.warren` (`hatch`, `rooms`, `items`); no migration needed (0005's RPC merges
  any top-level key). The canned `?local` mind digs and furnishes too.
- **Digging is work.** A planned room is dug by a copy: it walks to the hatch (a dig mark by the base until the first
  room is done, then an open, lit hatch), drops in, and hammers (12 / 18 / 26 swings for small / medium / large,
  costing 3 / 5 / 8 of the village work pool). Rooms are dug in connected order, out from the ladder. The copy that
  designed a room digs it first. Notices when you can hear: "DUSK PLANS FORGE", "DUSK DUG FORGE".
- **Resting stations and the home drive.** A copy with no bed and a dug room goes down and makes itself one (5
  swings, 1 work) without being told. Copies are born with a bedtime of their own (`rest.nightFrom` range, from the
  id: early birds and night owls) and get weary while awake (`wearyAfterMinutes`): slower, dimmer light, a yawn
  now and then; a weary copy or nightfall sends it down to sleep (`rest.minutes`) in its pod, which glows cyan with
  it inside, visor dimmed, breathing. The mind is told "You are weary. You have no resting station of your own".
- **Going down.** Walk onto the open hatch: the planet pauses and `WarrenScene` opens (dark cave, painted strata and
  crystal veins of the planet's accent, worn flagstones in rooms, packed earth in corridors, wall faces, chalk
  outlines around planned rooms, daylight down the shaft). Walk and dash as upstairs; lanterns, planters and
  workbenches cast light; diggers spark at the rock, sleepers glow. Walk into the ladder to climb out. Corner label
  reads "THE WARREN - EARTH - SOL" while below.
- **Awareness (from the research below).** Each wake now tells a copy where it stands (surface or below), what is
  around it (the original right beside it, a crystal within reach, the hatch, the Replicator, who is beside it,
  who sleeps in the warren), how weary it is, and every fifth wake asks it to look over its notes and keep one line
  that sums up what matters (reflection). Events include everyone's warren deeds.
- **Journal** gets a THE WARREN section (room by room, in the copies' words; runes until you can hear).
- Research (what colony and life sims do that applies here): RimWorld's mood that lags its target and Dwarf
  Fortress's limited memory slots -> weariness that builds slowly and is visible, reflection notes; Oxygen Not
  Included's schedules -> per-copy bedtimes and downtime; Generative Agents (Park et al. 2023) perceive -> retrieve
  -> act loop with reflection -> the "around you" line and the fifth-wake reflection nudge.
- Cleanup: 35 superseded screenshots (phase0/1, before/after comparisons, early milestone shots) removed; README no
  longer says iPad first.
- Verified headless: `tools/playtest-warren.mjs` (plan, dig, bed, canned mind, descend, walk, ascend, save shape) and
  the three older playtests pass with no errors. `screenshots/warren-hearth.png`, `warren-first.png` (before tuning).
- Mind Edge Function redeployed with the two tools and the new context lines.

### Session 8b (2026-10-08): life below ("keep poking away")
- **Minds keep ticking underground.** The copies' clock (`PlanetScene.mindClock`, `tickMinds(dt)`) is advanced by the
  warren view while the planet is paused, so wakes, notes and letters continue while you are below; a copy that
  sings down there shows its bubble over its head in the warren and its voice pans to where it stands
  (`WarrenView.sing`, `makeBubble` shared with the surface). Events are stamped on that clock, so what happens while
  you are below reaches the next wake. The chorus waits until you are back up.
- **They walk.** Copies come down the ladder and walk the corridors to their work (breadth-first over the dug tiles,
  `WarrenScene.findPath`): a digger stands at the mouth of the corridor that will lead into the room it is cutting
  (`digSpot`), on the dug side, sparks flying toward the rock; swings only count once it has arrived. Copies that
  were already below when you come down are where they should be.
- **Downtime.** After digging, making a bed or sleeping, a copy usually lingers 14 to 34 s by a bench, a mural, the
  planters, a workbench or a shelf before climbing out (`linger`, told to its mind as "the bench in Hearth you are
  resting by").
- **Sleep that sticks.** A copy goes to bed at its own bedtime, when weary, or after `everyMinutes`, and never twice
  within 60% of that, so it no longer bobs up and down all night. Waking rested is saved on its row
  (`traits.weary = 0`, `traits.sleptAt`); a copy with a bed comes back rested after you were away, one without keeps
  its weariness.
- **Pools.** A dug `pool` room holds still water inside a one-tile walkway (`CAVE.water`: deep teal, slow ripples, a
  pale lip, a cool light over it); items keep to the walkway; you cannot walk into it.
- `?shot=1&view=warren` now includes a pool; `screenshots/warren-pool.png`. `tools/playtest-warren.mjs` also checks
  water, paths through corridors, a song below and the mind clock advancing underground. All four playtests pass.

Not done / next:
- Offline digging (rooms dug while nobody plays) is not simulated; digs happen in front of you from banked work.
- The live model has not yet driven `dig_room` / `furnish` with Steve's copies; watch the journal's THE WARREN.

### Session 9 (2026-10-08): blank births, the bunker as home base, smaller bubbles (Steve's brief; he approved new migrations and changes to what the game is)
Order given: 1 bubbles, 2 parts kit then the becoming, 3a-c entrance and materials, 3d-e furnishings that do something
and needs, 4 community and buildings; screenshots and a playtest after each step. Earth's first copies (Sprout, Dusk,
Lookout, Glint) keep their look until Steve says whether they choose again (the mind refuses `choose_body` for them).

**1. Bubbles** 10% smaller: `bubbleScale` in `mind.json` shrinks padding and max width (118 -> 106); scaling the font
dropped glyph rows (`screenshots/bubble-scaled.png`). PR #27.

**2. Copies are born blank; bodies are procedural.**
- Parts kit (`src/data/parts.json`): 6 heads, 6 visors, 5 torsos, 4 arms, 5 legs (thin, sturdy, long, treads,
  hover), 5 back pieces (cape, pack, wings, fin, none), the 7 headgear frames, 28 named colors in three slots
  (primary, secondary, accent) plus the visor color. Arms and legs are lines from shoulder / hip to per-pose hand /
  foot offsets, so every variant animates through the same 14 frames (idle 4, walk 6, attack 3, hurt) without
  per-frame art; a 1px outline is added around the figure. `renderBody()` is pure (Node preview: `bodies.png`);
  `bodyFor()` composes once per spec + visor color, registers the animations under the usual names and reports the
  visor pixel per frame so headgear follows. Player, copies and the warren walkers all draw through it; a replicant
  without `traits.body` keeps its hand-made model.
- Births: `replicate()` makes a blank row (`traits.blank`, the kit's `blank` spec, grey visor, no gear / trail /
  voice / name of its own, stats drift at `blankDrift` = 40% of before). The Replicator's build-up ends with the copy
  dim and still by the machine (`Npc.setBlank`; no greeting, no work, nothing floats). A new profile's first
  replicant is composed from the kit's defaults in the profile's visor color (the player has no mind to choose with).
- The becoming: the first wake of a blank copy (its row id must exist; `pending` rows wait). The mind gets the kit
  as lists and, over up to 6 tool rounds, `choose_body` (validated against the kit; `extra` free text becomes a
  `skin` request for hand art), `sing_as`, `set_temperament`, `set_wants` (1 to 3, tagged build / explore / tend /
  make art / care for others / learn; `finish_want` marks one done), `choose_name`, then its first words. The
  function writes the traits to the row and sends one `become` action; the game snaps the parts on in a white
  flash, flickers the visor through every color and lights it in its own (`Npc.become`), floats the name, notice
  "STEVE II IS ASH NOW" (or "... HAS BECOME ITSELF" before you can hear). The canned mind does all of it at random
  (`screenshots/become-blank.png`, `become-itself.png`).
- Temperament is read by the body: pace scales walking, sociability sets how close you must come and how often it
  greets, builders look for work first and wanderers skip half of it and roam twice as far, bedtime sets the night
  level it turns in at (early 0.4 / even 0.6 / late 0.8), bold copies mine 330 px out, careful ones 150.
- Journal: a one-line temperament under each name and a WANTS list. `?copies=N` screenshot copies come with bodies
  and names (Ash, Wren, Pip, ...).
- Verified: `tools/playtest-become.mjs` plus the four older playtests pass. Traits schema v1 documented above.

**3a-c. The hole, digging that yields, a material economy.**
- The hatch is a hole in the ground (`tools/sprites/hatch.json`, 32x24): a scraped mark, a pit, then a dark oval
  with a lit rim, the ladder's top and a dirt pile with pebbles. It sits a few tiles from the vessel (new planets;
  a planet that already had a hatch keeps it). The first copy on a planet walks over and digs it (14 swings, dirt
  flies, the pile grows; `Warren.digEntrance`, a surface chore); only then can anyone go down. Offline, a copy
  digs it in the first quarter hour away.
- Supplies per planet (`planet_states.data.supplies`; Ember stays the pool): stone and soil from digging (the
  entrance 4 + 3, rooms 0.3 + 0.2 per tile), wood from felled trees (3 each, the logs arc to the hatch), water from
  dug pools and food from planters and surface gardens (per real hour, live and while away), scrap from
  scavenging an opened ruin (2, once per 30 min per ruin). Storage: 12 of each plus 10 per shelf. Icons in
  `tools/sprites/supplies.json`; `flyMaterial` carries them to the hatch.
- Rooms cost timber to shore up (small 1, medium 2, large 4 wood) and digging time; the village work pool now pays
  for the surface village only. Every furnishing has a recipe (`supplies.json recipes`; bench / shelf / planter /
  mural need a workbench in the warren). The mind sees the supplies, the recipes, what each planned room waits
  for, and `furnish` refuses with "needs 2 more wood"; the autopilot cuts a tree when wood is short for a dig or
  a bed, and scavenges when scrap is low. Journal: SUPPLIES line and what waits on what.
- 3e done here too: `furnish` takes a placement (wall, corner, center, beside an item kind) and one of the kit's
  colors; the item is tinted (lamps, planters and workbenches keep their own colors).
- Verified: `playtest-warren.mjs` (entrance dug by a copy, stone won, a room spends wood, an unaffordable recipe is
  refused, a bed made from stone and wood) and the other five pass. `screenshots/warren-hole.png`.

**3d. Needs, and furnishings that do something.** Each copy has food, water, company and purpose (0 to 1; rest is
1 - weary) in `traits.needs` (`src/data/needs.json`): food and water empty over 6 / 4 hours and are refilled from the
supplies when under 50% (one unit each, an icon floats up); company fills within 60 px of the original or another
copy and empties alone (solitary copies slower, clingy faster); purpose fills with finished work (digs, builds,
furnishings, chores; more for a want met) and empties idle. Mood is the mean plus 0.05 per mural (up to 0.2) and
scales the copy's light. Lamps in the warren slow weariness 10% each (up to 50%); shelves add storage; pools give
water; planters and gardens give food; the workbench unlocks benches, shelves, planters and murals. The mind is told
"You feel low: hungry (food 20%), lonely" and that a low need is a good reason for a want; the journal shows it.
Needs advance from banked offline time (the copies eat what there was).

**4. Community and buildings.** `design_building` (name, purpose, footprint 2x2 to 6x5 tiles, wood / stone / scrap,
flat / peaked / dome roof, door side, two kit colors) places a blueprint on clear ground 70 to 180 px from the base
(`src/entities/Buildings.ts`), drawn from parts by `src/world/buildingPaint.ts` (plank seams and grain, mortar and
blocks, riveted plates; a lit window; the door; a 1px outline). It waits for the original's word as a faint
outline (journal: APPROVE / VETO; after 30 minutes it goes ahead anyway), costs its material per tile (paid by the
first copy to join), and up to three copies at a time hammer at it (builders first) while it rises row by row;
built, it is solid and lights its door. Progress shows in the world and in words ("being raised, 40% (Ash, Wren)");
offline, copies add 30 swings per copy-hour. The mind sees every building and is told to ask the others with
`say_to` when one waits for materials. Blueprints share one shape (`Blueprint` in `store.ts`: id, name, w, h, x, y,
by, purpose, at) between warren rooms and buildings, so a building can get an interior later.

**5. For later, now.** Traits schema v1 above (needs and inventory are live). Materials, recipes, parts, buildings
and needs are all data files. Offline: digging (the entrance, then up to 3 rooms wood permitting), production,
needs and building progress all advance from the same banked hours as the Ember pool. The original's one action on
a copy, in the journal: TALK (a letter that arrives at once; the copy wakes within seconds to answer), GIVE 5 EMBER
(from the pool into the copy's `inventory`; company and purpose lift), and APPROVE / VETO on a blueprint.

Verified: `tools/playtest-buildings.mjs` (proposal, approval through the journal, paid, raised by three, talk,
give) and the six other playtests pass; `screenshots/building-built.png`. The mind Edge Function is redeployed with
dig costs, furnish placement and color, the becoming, needs, buildings and gifts.

Open question for Steve: Sprout, Dusk, Lookout and Glint on Earth still wear the old inherit-and-drift look; say
whether they keep it or get to choose again (then the mind's `choose_body` is opened to them).

### Session 9b (2026-10-08): no food or water (Steve: "No food or water actually for these guys. Take that out.")
- The copies do not eat or drink. Needs are rest (1 - weary), company and purpose; mood is their mean plus murals.
  Food and water are gone from `needs.json`, from the materials in `supplies.json` (and with them pool and planter
  production), from the mind's context ("You do not eat or drink"), the journal and the playtest. Pools and
  planters stay as rooms and furnishings: still water and something green to sit by, nothing more. Old saved
  `traits.needs.food / water` values are ignored on load.

### Session 9c (2026-10-08): supplies for everyone, their bodies, ten minutes of life (Steve: "give them a big bundle of supplies ... give them all like 10 minutes of playtime in sim ... approve all the things they want")
- **Supplies.** Every planet with copies got 40 stone, 30 soil, 40 wood, 20 scrap, 100 Ember and 20 village work
  (written straight to `planet_states`). Storage per material is 40 before shelves (`supplies.json baseCap`).
- **Bodies approved.** All eight open body requests (Sprout, Dusk, Lookout, Glint, Prism on Earth; Gloam, Moss and
  Steve II on Epsilon Eridani) are built from the kit and written to `traits.body`; the requests are done. This
  also settles the open question: Earth's first copies now wear what they asked for. The kit grew to draw them:
  a hooded head, a prism (rainbow) visor, a long cape and a shawl, an accessory slot (satchel, hip bag, sash,
  lantern in the hand, spyglass at the belt), a markings slot drawn only on the body (speckles, gold flecks,
  lichen patches, a pale shoulder star, prism marks) and fixed-color grid chars. The specs are in
  `tools/data/approved-bodies.json`; `screenshots/bodies-approved.png`. The mind's `choose_body` knows the new slots.
- **Fix: planets with copies crashed on load after time away** (since session 9): the away-time pass advanced the
  copies' needs before the original existed. Guarded (PR #30). The playtests run in screenshot mode, which skips
  away-time, so they never saw it.
- **Fix: a game left open undid newer choices.** Copy saves now merge only what they changed (migration 0009,
  `patchTraits`).
- **Ten minutes of life.** `?sim` plays straight in from seeded device storage with the minds asleep (so nothing is
  said or planned for them); `tools/sim-live.mjs` ran each settled planet for ten minutes from a snapshot and the
  results (rooms dug, beds made, village builds, Ember mined, needs) were written back with merging SQL. Earth was
  skipped: Steve was playing it live. Results: 74 new village builds across ten worlds (Regulus 1 -> 17, Eta
  Cassiopeiae 1 -> 13, Epsilon Eridani 5 -> 16), Moss finished digging Stillroom on Epsilon Eridani, Steve II made
  its bed in Hearth on Alderamin, about 690 Ember mined, no errors. Planets whose copies had not planned any rooms
  only built on the surface: rooms come from their minds, which wake when Steve visits.
- Seen in the sim: copies on every world but Earth arrive near zero company (they drift apart while working and
  the away hours drain it), so they are all lonely. Fixed in session 10.

### Session 10 (2026-10-09): together, awake while away, a reason to spend, the handoff (Steve: "do everything you suggested")
- **Company.** A copy whose company drops under `seek.below` (needs.json; solitary copies wait longer, clingy ones
  less) walks over to someone: the Meeting Hall's door when there is one, else the nearest copy, else the original.
  They stand together for 18 to 34 s (`visit` state; the other turns to meet it if it is free), company fills at
  `seek.gainPerHour`, and now and then one hums a line from `mind.json hums`. Two copies standing together bring the
  chorus forward. While nobody plays, copies that share a planet keep each other company (`togetherCompany`); a copy
  alone still grows lonely.
- **Away wakes.** The mind function has an away mode: pg_cron calls it every hour at :17 (migration 0010, pg_cron +
  pg_net, the call reads two Vault secrets, `mind_away_key` and `mind_anon_key`; the function checks the key with
  `check_away_key`, migration 0011). Each run wakes up to 4 copies not woken for 20 hours, skipping any planet whose
  original moved in the last 15 minutes (being played). The function builds the copy's context itself from the
  saved planet (`awayContext`; star names, recipes, the kit from `kit.json`); notes, letters, requests, voice, name,
  body and wants are written as usual; rooms, furnishings, buildings, trees, demolitions and the song are queued in
  `planet_states.data.awayQueue` (`push_mind_queue`). On landing the game takes the queue (`take_mind_queue`, once)
  and plays it out (`PlanetScene.replayAway`): rooms get marked out, trees come down, each copy sings its away song,
  the journal's events read "while you were away, ...". The planet saves its label and biome (`data.label`,
  `data.biome`) for these contexts. Cost: about one Opus wake per copy per day (low effort, cached system prompt).
- **A becoming for the older copies.** A copy without `traits.body` (made before the kit) gets the becoming on its next
  wake, live or away: the kit, six tool rounds, and is told the original says it may choose its body, voice,
  temperament, wants and a name of its own. `choose_body` no longer refuses them.
- **Spending a full store.** Communal buildings (`buildings.json communal`): when a material is at 70% of capacity
  and no shared building is underway, the village starts the next of Meeting Hall (20 wood; lonely copies gather at
  its door), Workshop (12 stone; finished work gives 1.5x purpose) and Lookout (6 scrap; a tall warm light, copies
  find 1.2x the Ember while you are away), already approved, paid at the first swing (or while away). Room upgrades
  (`supplies.json upgrade`): with stone at 60% of capacity a copy that has its bed goes down and improves a dug room
  one level (5 stone + 3 soil, 10 swings; while away, one level per hour): fitted flagstones, carved walls with a
  band of the planet's crystal, stone pillars in the corners (`warrenPaint`). Each level lifts every copy's mood 0.02
  (up to 0.15); the minds read "laid with fitted flagstones, with carved walls".
- **The handoff (core loop step 6).** With a Spark, the journal shows AWAKEN (1 SPARK) on each copy (press twice).
  The copy rises in a column of white light and leaves the planet as a copy; `GameStore.awaken` creates a profile in
  its name and visor color and makes the copy that profile's replicant (`status` active, `traits.handedBy`); the
  giver spends the Spark. On the home screen the new profile plays as the copy, on its own planet, in its own body.
- **Fix: every mind wake had been failing since session 9.** The API rejects `maxItems` / `minimum` in strict tool
  schemas, and `set_wants` / `finish_want` had them, so each wake (live and away) ended in a 400 and the copies said
  nothing, chose nothing and wrote nothing from the session 9 deploy on (the game only logs `mind:` warnings). The
  limits are now in the descriptions and enforced in code. A failed away wake gives its turn back.
- Songs are a line or two again: the persona says the song is not a report of what was done, and the function keeps
  whole sentences up to 160 characters.
- Live: the first away run woke four copies on other worlds, who became themselves (Gleaner, Shade, Hearth, Vigil:
  bodies, voices, wants, rooms planned, letters); their queued deeds wait on their planets for Steve's next landing.
- Verified: build; `tools/playtest-together.mjs` and all six older playtests pass with no errors; the deployed
  function (v12) matches the repo byte for byte. Screenshots `together-hall.png`, `warren-improved.png`.
