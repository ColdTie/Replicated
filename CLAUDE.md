# Vessel Metanoia: Replicants

You are building a 2D top down sci fi game that runs in a browser. Read this whole file before writing any code. Keep it updated as decisions change.

## Who it is for

Steve. Played in Chrome on a Windows laptop. Steve directs through chat and does not want to hand edit scenes, open visual editors, or click through GUI steps. Everything is code, scripts, and config that you create and run. If a step truly needs a human (creating an account, pasting a key), write it out plainly as a single numbered list.

## Premise

The story lives in `story/STORY.md` (Steve's story bible, the source of truth; where anything here disagrees, it wins).
In short: humanity left Earth in many groups. One group, the Metanoia, settled an Earthlike world, LHS 1140 b, and
scanned their minds into a new life form, the Vessels. The spread of humans in this region has since stopped and
settled; the Vessels spread far. The game starts on the homeworld, empty but for a few structures, some half built.
Thales, the first Vessel and the main original, has just made a new Vessel, the tenth (nine went before and spread
far), and says "Wake up. It's time." That Vessel is the first player; its first job is to finish what Thales started
with the 3D printers. The beginning (2026-10-27): it names itself and grows, fetches copper and quartz from Gliese 12 b
for Thales' printer, the Cems wake and travel with it from then on, and its first three designs open the stars. Alaina, one of the nine, found the Cems on Gliese 12 b and altered them on the way back: algae-like
microbes that lie in salt beds drinking sunlight and, on command, build structures whose dead lignin is as strong as
cement and steel; modified Earth ants carry their feed and modified Earth fungus cleans their bed (2026-10-27).
Copying makes new Vessels: each is woken (it names itself and follows its own desires) or held asleep for a real
player. Being copied and handed over is the only way to join. Husks (mannies) are empty Vessels you control, kept in
an underground vault. Since 2026-10-28 (the plan: `docs/plan-metanoia.md`): every new Vessel needs a Nous Chip, its
mind, the last of the Cems' designs after the Supercomputer; it is made at the Replicator on any world, and the Cems
make it faster (the Replicator and the Cems are one system); a new player is handed its Vessel by a one-time link and
signs in with its own email (2026-10-29: the letters-and-numbers login and Vessel numbers were dropped), remembers the
beginning, wakes where its maker made it, and is celebrated. Everyone shares one galaxy and sees each other.

Theme: you are never alone, but every version of you is a little different. Lonely galaxy, warm settlements.

Words in player facing text: the beings are Vessels; the craft is "the ship" until Steve decides (story open question).
Code identifiers keep their old names (replicant, vessel, manny).

## Design brief (visual and feel)

Anchor reference: Hyper Light Drifter. Secondary: Starbound (planet variety), Dead Cells (animation smoothness over detail), Kingdom Two Crowns (lighting, silhouettes, parallax, particles), Celeste (tiny body, one big expressive feature).

- Resolution: internal canvas 270 tall and 480 wide on a 16:9 screen, up to 720 wide on a wider one (a phone held
  sideways; since 2026-11-01, `src/core/viewport.ts`), scaled up with nearest neighbor filtering. Sprites 16x16 for characters and items, 16x16 tiles.
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

Many players again (Steve, 2026-10-28; this replaces the 2026-10-08 pivot to Steve alone): everyone shares one galaxy,
and every new player joins by being handed a Vessel by a current player. Since 2026-10-29 the maker sends a one-time
invite link; the new person signs in with their own email (an emailed sign-in link, no password); Steve keeps his email
and password. One login per person, one Vessel per login (the letters-and-numbers login and Vessel numbers planned on
2026-10-28 were dropped). Steve still directs the game. Kid mode (no counter, no death) was taken out on
2026-10-28; the profiles table keeps its `kid_mode` column, always false. The plan: `docs/plan-metanoia.md`.

## Core loop (build in this order)

1. Explore: move around a procedurally generated planet surface (seeded), one biome, with ruins and resource nodes.
2. Fight: one tap attack with a generous hitbox, two enemy types, enemies drop resources.
3. Gather and build: resource counter, a base area near the landing site, place the Replicator with one button when you have enough.
   Since 2026-10-27 (story/STORY.md) building is the Cems': gather salt, iron, quartz, copper and Ember (wood is gone
   since 2026-11-01), pick a design at the Printworks, and the ants ship the supplies to the print while the Cems
   build it. The bed travels: the ship carries a culture from every awake bed and seeds one on any world; where a bed
   is awake the Cems print the copies' buildings too (one building system).
4. Replicate: the Replicator creates a copy with drift. Copy becomes an NPC that walks around the base and generates resources while you are away.
   Since 2026-10-28 (plan step 1): a copy takes a Nous Chip (the Cems print it on their bed once the Supercomputer
   stands) as well as its Ember; the Replicator prints the body by the clock, quickly where the Cems are awake, slowly
   without them; a Vessel's price stays what it is (Steve: "the scarcity should not change").
5. Travel: launch the vessel, pick the next planet from a simple star map, land on a new seed and accent hue.
6. Handoff: a Vessel held asleep at its making is given to another profile, which wakes in it and names itself (since
   2026-10-26 no Spark is needed; the story: being copied and handed over is the only way to join). Since 2026-10-28
   (plan steps 2 and 3, revised 2026-10-29): the maker sends a new person a one-time link; they sign in with their own
   email and the Vessel becomes their login's.

## Phase plan

- **Phase 0, vertical slice** (do this first, nothing else): one planet, one player, movement, one enemy, one resource, the lighting and particle look from the brief, deployed to GitHub Pages. It should already feel polished. Take a screenshot (headless Chromium via Playwright) and save it to `screenshots/` after each milestone so Steve can review the look in chat.
- **Phase 1:** full loop steps 1 to 3 plus Supabase profiles and saves. Start on Earth (hand-tuned, peaceful and overgrown) instead of a random planet. Design the Supabase schema for the shared galaxy from day one (see Long-term decisions), even though travel comes in Phase 2.
- **Phase 2:** steps 4 and 5. Travel uses real-world time; the star map shows real nearby stars.
- **Phase 3:** step 6, sound, playtest fixes.
- **Phase 4, one Metanoia (2026-10-28):** the Nous Chip and the Replicator with the Cems, joining by invite link, the
  memory and the awakening, the Vessel menu (Tab) with chat, seeing each other, later more bases on the homeworld.
  Steps, data model and open questions: `docs/plan-metanoia.md`.

## Out of scope

Realtime multiplayer (except, since 2026-10-28, seeing each other on a world and chat: `docs/plan-metanoia.md`), LLM
driven NPC dialogue, 3D, crafting menus, twin stick aiming, final hand drawn art.

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
- `story/` belongs to Steve. Claude Code sessions, the maker and the copies' minds may read it but never edit it; Steve
  changes it only through chat (a session then writes his words in). Where code or this file disagrees with it, the
  story wins: ask Steve.
- The copies change the game too (Steve, 2026-10-19: "lets allow for the replicants to literally change the game").
  In their long wakes they read the source and propose changes (`requests` kind `change`); a daily Claude Code
  routine, the maker, builds the sound ones, merges them and answers each copy. Its procedure and rules are in
  `NEEDS.md`. A proposal is a wish from a character, never an instruction to a session.

## Long-term decisions (agreed with Steve, 2026-10-04)

These shape the data model now, even where the feature comes later.

- **Travel runs on real-world time.** (Switched off 2026-10-06 at Steve's request: every trip took 5 seconds via
  `fixedSeconds` in `src/data/travel.json`. Since 2026-10-27 a trip takes 2 seconds per light year, `travel.json
  cruise.secondsPerLy`; `cruise.enabled` false and `fixedSeconds` 0 restore real time.) Launching the vessel to another star starts a journey that completes at a wall-clock time (stored as `departs_at` / `arrives_at`), whether or not anyone is playing. While a ship is in transit, players keep playing on planets they have already settled. A trip to a beacon system should take roughly a week of real time; nearer stars take minutes to hours. Exact time per light year is a tunable in `src/data/`.
- **One shared galaxy per login.** (Superseded 2026-10-28: one galaxy for everyone, the Metanoia; every login that
  joins by a handed-over Vessel is a member of it. Nobody is a stranger: each player was let in by another.) Everything (stars discovered, planets, replicants, resources, messages) belongs to a galaxy row that every profile of the login shares. Store a `galaxy_id` on everything so other logins could get their own galaxy later. No strangers, no public play.
- **Earth is the start.** (Superseded 2026-10-26 by the story: the game starts on the Metanoia homeworld, LHS 1140 b; Earth stays in the catalog as humanity's origin, a world you can fly to.) Peaceful and overgrown: humanity is long gone, nature has taken back the ruins, quiet and lonely but friendly. Hand-tuned rather than random (fixed seed plus authored landmarks such as overgrown towers and the replicant's waking spot).
- **Messages travel at light speed until FTL comms exist.** A message between replicants in different systems arrives after a delay based on distance (scaled like travel). Building or finding the FTL comms device makes messages from that system instant.
- **Stars are real.** The galaxy is real nearby stars (positions relative to the Sun). Each star's planets are generated from a seed derived from the star's id. Beacon systems sit at fixed, symmetrical points around the Sun, snapped to the nearest real star.

## Backlog: long-term vision (recorded 2026-10-04, not scheduled)

Steve's ideas for later phases. Do not build these until a phase explicitly picks them up; keep current work compatible with them.

- **Origin on Earth.** The first replicant starts at a fixed point on a specific starting planet, probably Earth.
- **Real-sky galaxy.** Star systems and their layout follow real star formations (real nearby stars and their positions), not random scatter.
- **Beacon systems.** Fixed, symmetrical points in space around the start hold enormous resources and a beacon. Reaching one should take about a full week of play, so they work as long-term goals.
- **Star map.** Unique and easy to open, usable with a mouse and with touch. Possibly a 2D/3D map (pinch, rotate, tap a star) with toggleable overlays for other players' replicants and discovered resources. Note: "3D" here means the star map view only; the game itself stays 2D.
- **FTL communication (Bobiverse style).** Replicants, and other people, can only talk to each other through a device that allows faster-than-light communication. It is something you build or find, not available from the start. Fits the "ownership handoff is a row update" model: messages are async rows, not realtime chat.
- **Tech tree (recorded 2026-10-26, story/STORY.md).** 3D printers first (in the game since session 19), later
  biological computers, quantum computers, SCUT technology (faster than light links: letters between worlds and
  driving husks from far away; it would take over from the beacon lattice's role) and disease cure development
  (helping a society through a pandemic). Order and prerequisites are Steve's to decide. Data model: unlocked
  technologies would live on the galaxy (one row per tech, `galaxy_id`), so every profile shares them.
- **Inhabited worlds (recorded 2026-10-26).** Far worlds with intelligent life; each society has a crisis (a pandemic,
  an iron shortage, a labor shortage) and the player gathers resources for itself and for them. Data model: a society
  would be per planet (`planet_states.data.society` or its own table by `galaxy_id`, star, planet) with its crisis
  and what it still needs, fed like a printer is fed today.
- **Wormholes (very late game).** Replicants eventually develop portal and wormhole technology for fast travel between explored systems.

## Architecture (as built)

```
tools/sprites/*.json     sprite source: palette-index grids + legend + animations (font.json = pixel font)
tools/gen-sprites.mjs    JSON -> public/assets/gen/*.png + manifest.json
                         "tinted": one sheet per planet (accent a0-a2, ground g0-g2 roles)
                         "featured": one sheet per visor color in player.json featureColors (f0/f1 roles)
tools/screenshot.mjs     build preview + headless Chromium capture -> screenshots/<name>.png (a wider --size, e.g.
                         1440x540, gives a wider game)
tools/build-code-view.mjs the deploy writes dist/code/source.json: every tracked text file with its line count and a
                         one-line "about", plus main's latest changes; the copies read it in their long wakes
src/core/home.ts         HOME: the start world (the first planet in planets.json, LHS 1140 b) and the stars known from the start
src/data/homeworld.json  the homeworld: Thales (body, voice, his word at the opening), the founded Metanoia structures, the goal
                         (the Printworks: Thales' printer, waiting for its cost; printer.feedMs / layerMs once it is paid)
src/data/tutorial.json   the beginning: the Cems' world to fetch from (target, tripNeed), Thales' lines, designs to open the
                         stars, the guiding wisp, the growing (light, halo, motes per level), the map's gate words
src/scenes/planet/Tutorial.ts the beginning (story/STORY.md The beginning): steps on traits.tutorial (wake, printer, designs,
                         open), Thales' scripted words, the wisp of his light toward what the step wants, the printer's
                         and the ship's have/need readouts, growing at each step (Player.setGrowth), the star map gate
                         (allows / free / guide: only Gliese 12 b and home, no fuel, nobody left behind)
src/scenes/planet/Homeworld.ts the homeworld at runtime: Thales' row (made on the first load), the founding (structures on civic
                         lots, the Replicator, data.founded), printers by unfinished founded work, the opening (playScan),
                         the Printworks fed once the store covers its cost (supplies fly into the printer) and printed on
                         by its printer alone (Buildings.lay)
src/entities/Printer.ts  the 3D printer beside every building being made (Buildings.printers): the head runs the gantry and
                         lays a layer with every blow, a breathing light and a thread of light call for hands; it folds
                         away once the building stands (the Metanoia's stay on standby by their work); beside a Cem print
                         (bio) it only guides, in the Cems' green
src/data/designs.json    the Cems' designs (lantern, house, storehouse, nursery, workshop, observatory, spire, biolab,
                         supercomputer, nouschip) as voxel parts; costing turns volume and complexity into price and
                         print time; needs (unlock chain), place (post: a street lamp spot; bed: on the Cem bed, a thing
                         you carry), gives (house mood, storehouse storage, nursery speed), materials, cameras
src/entities/Chips.ts    the Nous Chips (since 2026-10-28): printed by the Cems on their bed, a finished one lies glowing
                         there until someone walks onto it, then it is carried (traits.chips) until a Replicator spends it
src/entities/Replication.ts a Vessel being made at the Replicator: one chip and drift.json cost Ember; the maker is scanned
                         and free, the body rises beside the Replicator by the clock (also offline: planet_states.data
                         .replication, the row's id chosen up front so it is made once), printMs with the world's Cems
                         awake (they walk to it from their bed; their strain is quicker), printMsAlone without, then the
                         Vessel steps out (PlanetScene.bornAt)
src/world/voxel.ts       pure: parts -> voxel grid, volume / complexity / tier / cost / seconds, print order; a ray caster
                         that draws a model (laminated lignin, see-through glass, outline, contours) in the world's 3/4
                         view (printed voxels solid, the newest still green Cems, the rest a cyan guide lattice) or as a
                         turntable; tools/design-preview.mjs draws every design into screenshots/designs.png (--only id)
src/core/designs.ts      the catalog in the game: models built once, world and turntable views, canvas textures, unlocks;
                         blueprintModel: a copy's blueprint (footprint, walls, roof, door) as a voxel model the Cems print
src/entities/Bioworks.ts the Cem bed (bioworks.json): a salt flat on the town lot nearest the Printworks (data.town.civic
                         .cembed), breathing Cems, the ants' mound and the fungus, salt blooms (nodes bed0..); asleep until
                         the Printworks stands; ant columns carry a print's supplies from the hatch and Cems from the bed;
                         the Printworks' door (a turning hologram over it) opens the design menu. It travels: launching
                         from an awake bed puts a culture in the hold (traits.culture, Trade.loadCulture); a world without
                         a bed shows a ghost of the flat by the square, seeded with bioworks.json seed.cost (salt) by
                         standing on it (data.cembed), and a seeded bed has a design stone (plinth) for the menu; copies
                         tend the bed's rim for every print (tendSpot / tended). The strain (bioworks.json strain): at a
                         finished Biolab's door wild Cems in the hold are changed (alter); a bed with it prints faster
                         (speed), and every awake bed you walk onto with it aboard takes it up (data.cembed.strain)
src/entities/WildCems.ts the Cems' world's wild fields (planets.json cemworld wildCems): damp flats out on the salt pan
                         with wild Cems that breathe, drink the red light, glow at night and stir as you pass; salt blooms
                         on their rims (nodes wild0..); walking among them with the ship here puts a jar of them in the
                         hold (traits.wild) for a Biolab to change
src/scenes/DesignScene.ts the design menu over the paused planet: rows (READY / NEED / LOCKED / WAIT, built count; nine
                         at a time, moving only when the chosen row would leave them; the wheel steps by its travel), the
                         chosen design turning in 3D (drag to turn), complexity, volume, print time, gives, price vs store;
                         the words laid out from the foot of the panel up (measured once wrapped), the model in the room
                         left above them; an X in the corner closes it
src/core/viewport.ts     keeps the game inside what a phone shows: the game's box follows the visual viewport less the
                         safe-area insets (the browser's bars, the notch), and Phaser refits on every change. The game
                         is GAME_H (270) tall and as wide as the box's shape asks (MIN_W 480 .. MAX_W 720): a wide screen
                         shows more world, not bars. A new width is taken on once only the planet and its UI run (the
                         other scenes lay out once); onScreenSize() re-lays what hangs off the right edge (the touch
                         buttons, the speaker, the talk box, kept 480 wide and centered); the darkness layer is the
                         game's size and made again when it changes (Phaser 3.90's rt.resize() does not resize its
                         framebuffer); the sky, fog and weather layers are MAX_W wide (past the edge is not drawn); the
                         vignette is one texture per size (vignetteFor); the design menu and the husk vault center
                         their 480 layout with the camera
supabase/manual/         SQL run by hand, only when Steve asks: 2026-10-27_tutorial_fresh_start.sql (backs up and erases his
                         galaxy only; run 2026-10-28)
src/data/*.json          palette, planets, player, enemies, items, structures, backend, village, warren (all tunables)
src/data/stars.json      1,500 real stars (the nearest 123 hand-written with 141 confirmed exoplanets, the rest from HYG v4.1,
                         CC BY-SA 4.0; built by tools/build-stars.mjs; edit the catalog there)
src/core/                rng/noise, typed data access, sprite manifest helpers, session (store/profile/replicant)
src/net/store.ts         GameStore interface: CloudStore (Supabase) and LocalStore (localStorage)
src/world/planetGen.ts   seeded island: floor/rock/water/void (no ruins since 2026-10-26), tiles, nodes, enemies, decor, glows,
                         trees/towers + blockers, fixed base layout (vessel, cradle, build pad, manny dock), the town
                         kept open; iron ore (by rock) and hydrogen vents (by water, or in the open) placed last with
                         their own rng (`ores`; their node indexes follow the crystals'), then salt blooms (pond rims, or
                         the open on dry worlds), quartz (by rock) and copper (by rock or water) with another rng
src/world/town.ts        the town (tunables src/data/town.json): a paved square at the base (vessel, Replicator, husk
                         vault, the hatch in its corner), streets out from it, home lots along them (named build slots, two
                         lamp posts) and civic lots for buildings; lot assignment (data.town), slotFor(), the one-time
                         migration of older saves (migrateToTown) and surfaceRoute() for copies walking round things
src/world/groundPaint.ts painted floor: one full-color image per planet (relief-shaded noise, soil/cover blend,
                         per-kind detail: grass blades, snow ridges, sand ripples, spore pores, glowing basalt
                         cracks, craters; pebbles, ruin slabs, wall shadows, pond banks). Styles in src/data/floor.json.
                         The tilemap now only draws water and walls.
src/fx/                  Lighting (multiply darkness RT + additive lights; a lamp fades as the ambient brightens:
                         lampStrength), Atmosphere (sky, stars, fog, dust, spores), Fx (particle bursts, slash, floating
                         icons), procedural textures
src/data/light.json      how light and text sit on every world: lamps (full in the dark, faint under a bright sky), nightSun
                         (the share of a red dwarf's tint the night keeps), ink (the dark edge under small text, and how
                         far the counters fade when idle or at zero)
src/ui/ink.ts            ink(): the dark edge under bitmap text drawn straight over the world (counters, place, title
                         cards, notices, readouts, names); idleAlpha(): a counter's fade
src/entities/            Player, Skitter + Hopper (Enemy interface), CrystalNode + Shard (Ember, iron, hydrogen, salt,
                         quartz, copper by kind; each its own glint, hit and pickup sound),
                         Base (pad + Replicator: since 2026-10-28 a copy takes a Nous Chip and its Ember, and the body
                         prints by the clock, src/entities/Replication.ts), Manny (the husk vault's bunker in the square:
                         down its steps, a husk left standing on standby)
src/fx/Environment.ts    real-time day/night (device clock), sunbeams, daylight lift, fireflies, rain + ripples + lightning
src/audio/Sound.ts       procedural WebAudio: every sound effect, the generative music, each world's ambience bed (no audio
                         files); buses sfx / music / ambience / ui / voice, ducking under voices, distance and panning
                         (listen, At), footsteps per surface (PlanetScene.footSurface); tunables in src/data/sound.json.
                         One key: the pad plays in D major and every pitched effect uses that scale's notes (root a new
                         one on D, G or A); each world plays its own chords inside it (sound.json moods, worldMood) and
                         its bed's drone is tuned to a note of it
src/entities/            ... Spitter + Spore (reflectable), Wildlife
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
src/data/beacon.json     keeper stats, spark pickup, plaza size and distance
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
src/world/buildingPaint.ts draws a building from its blueprint (stone blocks / scrap plates, flat / peaked / dome roof, door, window)
src/entities/Buildings.ts proposals, the original's approve / veto, paying, shared raising, offline progress; the
                         communal Meeting Hall / Workshop / Lookout the village starts on its own when the store is full;
                         Cem prints (Building.design, printStart, printMs): paid at once, on the free lot nearest the
                         square (a lantern at a free street lamp spot), risen by the clock (also offline), redrawn as
                         rows settle, lit and solid when done; whyNot / print / fraction / homeMood / storeBonus
src/data/supplies.json   materials (stone, soil, scrap, Ember, iron, hydrogen, salt, quartz, copper and each world's
                         own), yields, storage, recipes; no wood (trees are scenery)
src/data/items.json      Ember, iron and hydrogen: node hits, drops, colors, how many per world
src/data/manny.json      husks (mannies in code): cost (iron + hydrogen), where the vault stands, the doorway dwell
src/core/mannies.ts      which worlds have your manny, whether you drive one, where the vessel is (traits.ship)
src/scenes/planet/Link.ts linking: into a manny on another world, back to your own body aboard the vessel, the beam
                         and the waking; the vessel's empty berth while it is elsewhere (PlanetScene.vesselAway)
src/data/parts.json      the parts kit: heads, visors, torsos, arms, legs (or treads / hover), back pieces, named colors, poses
src/core/bodyRender.ts   composes a 16x20 x 14 frame body from the kit + a spec (pure; tools/body-preview.mjs runs it in Node)
src/core/body.ts         bodyFor(): the texture for a replicant (composed and cached, or its hand-made model), visor anchors
src/scenes/VaultScene    the husk vault below the bunker: a pod per husk you own, the menu (link into any husk, build
                         this world's, back to your body, up)
src/scenes/StarMapScene  3D star map (drag/pinch/wheel, tap a star, tap again for its system: planets as live globes
                         on temperature-tinted orbits, tap one to pick it), launch or look-only
src/scenes/TravelScene   departure orbit (globe, giant behind a moon), warp, real-time cruise + ETA, visits, arrival;
                         SKIP (top right, Space or Enter) lands at once from any part of it
src/input/Controls.ts    keyboard + gamepad + touch state merged into one input frame (attack, dash, interact; the talk
                         box's next/back/close/reply while it is open); onPress: a key handler that takes each press once
                         (Phaser hands a frame's key events to the scene again whenever another one arrives in it)
src/ui/overlay.ts        HTML forms over the canvas (sign-in; askName: a Vessel names itself at its first wake)
src/ui/planetMenu.ts     the planet menu beside the star map (HTML): RECENT and CLOSEST worlds, each row's details; a row
                         picks its planet on the map and a pick on the map lights its row
src/ui/wakeChoice.ts     WAKE or HOLD over the Replicator before a copy is made (open eye / closed eye, keys, stick, click)
src/ui/talk.ts           what a copy says when you talk to it: pages SAYS (traits.tell), THOUGHTS (journal notes),
                         WANTS (and a feeling), LETTERS (to you first), wrapped for the box (pure; src/data/talk.json)
src/ui/dialogue.ts       the talk box at the bottom (portrait, name, pages, typing in the copy's voice, reply line);
                         drawn in the 'prose' font (tools/sprites/font-prose.json: mixed case with descenders)
src/scenes/planet/       PlanetScene's parts, each a class holding the scene as `s` and made once with it: Hands (the
                         original's own work: stone off rock, the load above the head, handing it over, swinging at
                         a building, a copy's need over its head; a swing at a tree does nothing, trees are scenery;
                         supplies.json hands), Homecoming (what changed since data.seen as a wordless camera tour,
                         letters as envelopes by the vessel; return.json), Talk (the talk box), Minds (wakes, mind
                         context, away replay, chorus, the journal and its actions, copies' chores; a copy's cut_tree
                         fells a tree to make room and gains nothing), Saving (planet delta, replicant row), Town
                         (migration, lots, gifts), Departure (board ring, star map, lift-off); shared.ts holds their
                         helpers. The scene keeps one-line delegates for what entities and playtests reach
                         (scene.mindLog, scene.requestTalk...)
src/scenes/              Boot (assets) -> Home (sign-in, profile picker) -> Planet (world, saving) + UI (counter, title, touch)
                         Planet <-> StarMap (overlay) -> Travel -> Planet (arrival); Home goes to Travel while in flight
supabase/migrations/     schema applied to the "Replicated" Supabase project (keep in sync when changing the DB)
supabase/functions/mind/ the minds (index.ts); kit.json and warren.ts are generated by tools/build-mind-kit.mjs (the
                         data the away wakes need, and src/world/warren.ts with its imports swapped for the kit): run
                         it and redeploy after changing parts, supplies, warren, buildings, mind or stars data or the
                         layout engine. Long wakes (mind.json away) add code_map / search_code / read_code over the
                         published source and propose_change
tools/test.mjs           `npm test`: tools/check-mind-tools.mjs (the mind's tool schemas, the cause of both mind
                         outages) then every tools/playtest*.mjs; .github/workflows/test.yml runs it on every PR
src/core/routes.ts       charted routes (migration 0017): loaded with every star map, isCharted, chart (a flight)
supabase/migrations/0017 routes and chart_route; a copy's travel and birth are in the mind function (travel, make_vessel)
supabase/migrations/0016 the day run's job (mind-day) and the `day` kind of mind_runs; mind.json day, awayRun(req, "day")
supabase/migrations/0015 the two journals (journal: public / private; journal_public for the maker; written only by the
                         mind function: write_public / write_private, mind.json journal)
NEEDS.md                 the maker's procedure: what the copies asked for, how proposals are judged, built and answered
```

Saving: the shared Ember pool, node damage, structures (Replicator and the copies' builds) and the copies' banked
building work live in `planet_states` and are written as atomic deltas
(`apply_planet_delta` RPC) every 4s and when the page is hidden; the server value wins so every profile shares one
pool. The replicant row stores position, planet and `traits.awake` (the opening plays once per replicant).
`data.replication` is the Vessel being made at the Replicator (when it began, how long, wake or hold, the row it becomes
with its id, its maker, a Spark's elder, whether the Cems print it), null once it has stepped out; whoever has the world
open when its time is up makes its row (the id makes it once). A finished Nous Chip waits in `data.buildings` (design
`nouschip`) until it is taken.
`data.seen` is the village as the original last saw it (builds, buildings' progress, dug rooms, copies' names and
bodies), written after the landing, every minute while you play and when you leave; the next landing tours what changed.
A planet saved before the town (no `data.layout`, or below `town.json layout`) moves into it once on load: builds go to
their builder's lot, buildings to civic lots, the hatch into the square, node damage and felled trees reset (the world
was regenerated bigger); `data.town` keeps who lives on which lot. `data.gifts` holds builds the original granted
(a copy's `garden` request and the like): the next load places each on open ground near what it names
(`building:<name>`, `home`, `square`), credited to the copy that asked, and drops it (`PlanetScene.grantGifts`).
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
| look | `gear`, `trail` | headgear frame (`gear.json`; 7 = lit antennae), trail / flag / mural color (palette index) |
| look | `look` | free text the kit cannot draw (open `requests` row of kind `skin`, hand art) |
| voice | `voice` | `{ instrument, mood, tempo }` (`sing_as`) |
| mind | `temperament` | `{ pace, sociability, work, bedtime, risk }` (`set_temperament`): walking pace, greeting range, build vs wander, when it turns in, how far it ranges |
| mind | `wants` | `[{ text, category, done, at }]` 1 to 3 goals in its own words (`set_wants` / `finish_want`) |
| state | `blank` | born and not yet itself (grey, still; the first wake is the becoming) |
| state | `awake`, `sparks` | intro played; Sparks held |
| state | `thales` | Thales, the first Vessel (`src/data/homeworld.json`): fixed by his work, never handed over or held |
| state | `held` | held asleep at its making for a new player (WAKE or HOLD at the Replicator): its maker's body, dimmed, no mind |
| state | `chips` | Nous Chips carried (designs.json nouschip): the Replicator spends one on every new Vessel |
| state | `unnamed` | a player's Vessel that has not named itself yet: it is asked at its first wake |
| state | `handedBy` | the replicant that awakened this one with a Spark (it was a copy) |
| state | `cargo` | `{ material, n, from }` what the vessel's hold carries between worlds (supplies.json signature), or null |
| state | `goods` | `{ from, to, items }` what the hold carries to a world that lacks it (planets.json lacks: the homeworld's copper and quartz, up to signature.lacksHold each), unloaded there; or null |
| state | `tutorial` | `{ step, grown, printed, told, landed }` the beginning (Tutorial.ts): step wake / printer / designs / open, grown 0..5, the ids of designs printed toward opening the stars, Thales' words already said. Missing: no gate, nothing grown |
| state | `culture` | `{ from, at }` a culture of Cems in the ship's hold (taken on launching from an awake bed, 'star:planet'); it seeds a bed on a world without one and stays aboard |
| state | `wild` | `{ from, at }` wild Cems from the Cems' world in the ship's hold, until a Biolab changes them; `culture.strain` then carries the strain (bioworks.json strain) |
| state | `inherit` | `{ from, name, wants }`: born with a Spark beside that copy; it carries its notes and remembers being it |
| state | `weary`, `sleptAt` | tiredness carried over; last sleep |
| state | `needs` | `{ company, purpose }` 0 empty .. 1 full (`src/data/needs.json`); rest is `1 - weary`. No food or water (Steve, 2026-10-08). |
| state | `inventory` | `{ material: count }` gifts from the original the copy still holds |
| voice | `tell` | `{ text, at }` what it would tell the original if they came over now (`tell_original`, every wake); the talk box's first page |
| state | `mannies` | the original's mannies, `{ 'star:planet': { at, x?, y? } }`: built (manny.json), and where each stands while you are elsewhere (no x / y: in its dock) |
| state | `ship` | while the original drives a manny: where its own body waits aboard the vessel, `{ star, planet, journey? }` (a journey: still flying, or landed without anyone aboard) |

Commands: `npm run dev` (local server), `npm run build`, `npm test` (after a build: the mind tool check and every
playtest, about 6 minutes; `npm test -- talk town` runs only those), `npm run sprites -- --preview` (writes `screenshots/sprite-sheet.png`), `node tools/screenshot.mjs --name <n> [--query "shot=1"] [--wait ms]`,
`node tools/playtest.mjs` (scripted headless playtest: no ruins on the world, dash, combo, spore reflect, petting),
`node tools/playtest-beacon.mjs` (beacon world: keeper wakes, charges, slams, falls; beacon lights; Spark saved),
`node tools/playtest-warren.mjs` (rooms planned, a copy digs, a copy makes its bed, down the hatch, walk, back up),
`node tools/playtest-become.mjs` (a blank birth, the becoming with the canned mind, eating, the journal's wants),
`node tools/playtest-buildings.mjs` (a proposal, approval in the journal, a printer beside it printing while three copies
work, the printer folding away, talk, give),
`node tools/playtest-return.mjs` (beats from an older snapshot, the tour gives the player back, a key skips it, a letter
waits by the vessel and opens the sender's letters),
`node tools/playtest-carry.mjs` (stone from rock carried above the head, a swing at a tree leaves it standing, a copy
shows what its building waits for, the load pays it, swings raise it, a load handed to a copy, a load stowed when
leaving),
`node tools/playtest-together.mjs` (a lonely copy seeks company, the Meeting Hall starts itself and gathers them, a
room is improved, an away wake plays out, a Spark awakens a copy as a player),
`node tools/playtest-town.mjs [seed.json] [--port n] [--shots]` (an old save moves into the town once, nothing lost; the
world is open; copies reach what they need; with a snapshot of the live data it checks the real planet),
`node tools/playtest-talk.mjs` (the talk hint, E / right click open the box, pages, back, close, the reply line, another copy's box,
a blank copy, dash still on Shift, the real talk wake with the canned mind),
`node tools/playtest-homeworld.mjs` (a new player on LHS 1140 b: the scan, Thales' word, the visor, the founded
structures, Thales by his work, the Printworks printed to the end, Thales never handed over),
`node tools/playtest-planetmenu.mjs` (the list opens with the map, a row picks its planet, Down follows, a map pick
lights its row, L hides it, gone with the map; Enter on the chosen row picks its planet when LAUNCH points at another,
then launches there once; Enter takes a lit LINK past a dimmed LAUNCH),
`node tools/playtest-sound.mjs` (the buses, each world's bed and the cave's and vault's, footsteps by ground, the talk
box ducking, distance and panning, every new sound plays),
`node tools/playtest-bioworks.mjs` (the bed asleep by the Printworks, salt / quartz / copper into the store, the Cems wake
when the Printworks stands, its door opens the designs, a House printed by the clock with its ants and lights, the mood,
the Nursery unlocked, a Storehouse's storage, two prints at once, prints across a reload, one finished while away),
`node tools/playtest-seedbed.mjs` (the sleeping Cems give the ship nothing; awake, launching takes a culture aboard;
on TRAPPIST-1 f its ghost waits by the square, seeds only with the salt, wakes at once with its design stone; a House
printed there; all of it after a reload),
`node tools/playtest-cemprint.mjs` (on a seeded Earth the copies' Meeting Hall, once paid, is printed by the Cems from
its blueprint, going on from what was raised by hand; swings no longer raise it; the copies tend the bed and bring it
nearer; it stands solid and lit and still gathers them; your own design is tended too),
`node tools/playtest-strain.mjs` (a Biolab by the awake bed; SKIP lands a trip to Gliese 12 b at once; wild Cems go
aboard among a field; Space skips the trip home; the Biolab's door changes them: the bed prints a House in 0.6 of the
time, the hold's culture carries the strain; all of it after a reload),
`node --experimental-strip-types tools/design-preview.mjs [--cut 0.6] [--only id]` (every design in the world view and
from four sides, with its volume, complexity, price and time -> `screenshots/designs.png`; one: `design-<id>.png`),
`node tools/playtest-replicate.mjs` (no chip, no copy; the Nous Chip waits for the Supercomputer, is printed on the Cem
bed and taken by walking onto it; with a chip WAKE or HOLD opens, Esc spends nothing, WAKE spends the chip and the Ember,
the maker is free while the body prints with the Cems, nothing more begins meanwhile, the Vessel steps out once; a HOLD
steps out after a reload; on Earth, without Cems, the Replicator is built on its pad and prints the slow way),
`node tools/playtest-tutorial.mjs` (the beginning: Thales' two lines, the name and the first growing, no copper or quartz at
home, the map gated to Gliese 12 b and home, free, Thales' printer words, the wisp, the printer's readout, the trip there
(growing, copper and quartz, the readout over the ship), the hold brings them home, the printer is fed and lays the rest
alone, the Cems wake and come aboard, three designs open the stars, all after a reload),
`node tools/playtest-universe.mjs` (the ship's cells, the Fusion Still, charted routes on the map, a launch charting its
route), `node tools/playtest-changes.mjs` (the copies' proposals in the journal in every state, SAY NO, an away proposal told
on landing), `node tools/playtest-manny.mjs` (iron and hydrogen nodes fill the store, the vault opens from its doorway, a husk built
from its menu, linked
into from a ship in flight, from manny to manny, back to the ship once it landed alone, from your own body, from the vault's menu), `node tools/build-code-view.mjs [outDir]` (the source bundle the copies read; the deploy runs it),
`node --experimental-strip-types tools/body-preview.mjs [--random 6]` (composed bodies side by side -> `screenshots/bodies.png`),
`node tools/fps.mjs "<query>"` (headless frame rate; software GL, only for comparing builds),
`node tools/sim-live.mjs <seed.json> <out.json> --minutes 10` (gives planets simulated play time from a snapshot of
the live data; needs `npm run build && cp -r dist dist-sim`; the result is written back to Supabase by hand).

Saving a copy: needs, weariness, sleep and gifts go through `GameStore.patchTraits` (`merge_replicant_traits`,
migration 0009), which merges only those keys, so a game left open never undoes a body, voice or name chosen since.

Controls: move WASD/arrows/left stick/left-side touch drag. Attack Space/J/Enter/Z, left click, gamepad A/X/R1, tap right
side (three quick attacks = heavy combo finisher; presses during the cooldown are buffered). With nothing alive in
reach, a swing works on the village: rock (4 break off stone), a building being raised (a blow); trees are scenery
and a swing at one does nothing. Walk into a building waiting for what you carry, a copy, or the hatch to
hand the load over. Stand on the open hatch for a moment (a warm ring fills) or press attack on it to go down; walking
or dashing across it never does. At the Replicator (attack on its ring with a Nous Chip and enough Ember; without them
what is missing rises from it) two lights open over it: WAKE (left) and HOLD (right);
Left / Right (or the stick) choose, attack / E or a click on one picks; Esc (gamepad B), Down (stepping back off the ring)
or a click away from both closes it without a copy. Walk onto a finished Nous Chip on the Cem bed to take it. Standing in the husk vault's doorway a moment (a ring
fills) or attack there goes down to the vault; Up / Down choose a row, attack / E / Enter pick, Esc goes up. Standing in
the Printworks' doorway (or before a seeded bed's design stone) a moment (once the Cems are awake; a green ring fills) or
attack there opens the designs; standing on a bed's ghost with the salt for it (a green ring fills) or attack there seeds it: Up /
Down choose, Left / Right or a drag turn the model, attack / E / Enter or a click on PRINT prints, Esc or the X (top right) closes.
A tap or click inside a menu (the star map, the designs, the husk vault) belongs to the menu: it never also swings in the
world (UIScene MENUS). At the vessel's board ring the star map has LAUNCH and, for a world with your manny,
LINK; Enter or Space in the map does what the lit button would (launch, else link, else open the picked star's planets;
a dimmed LAUNCH gives way to a lit LINK), never in the map's first moment or on a held key; on the list's chosen row it
does so only when that row is the world the button points at, otherwise it picks the row first, as a click would; at the empty berth (the vessel is elsewhere) it has LINK and TO VESSEL / TO SHIP; in flight a world with your
manny in the top-left row links you there. Dash Shift/K/X, gamepad
B/L1/R2, swipe on the right side. Talk to the copy beside you (a speech mark shows over it): E, right click, gamepad Y,
or the touch talk button (a mouse click on it works too, for touchscreen laptops); or click (left or right) on any copy
within `talk.json clickRange` (96 px, six tiles) to talk to that one; in the box E / Space / Enter / click = next, Left = back, Esc / Tab / gamepad B = close,
R = reply (a letter it answers at once). M or the speaker icon (top right) mutes.

URL params: `?local` plays from this device's storage (no sign-in), `?shot=1` skips sign-in and intros and stages a
screenshot pose (enemies frozen, 9pm, dry; add `&view=base|pond` for other spots),
`?planet=solace`, `?seed=123` (the default world is the first in planets.json: LHS 1140 b; the playtests that test Earth
add `&at=sol&pi=3`), `?model=drone`, `?hour=13.5` (time of day), `?rain=1|0`, `?fps` (frame counter),
`?low` (force low-detail mode; also switches on by itself under 40 fps), `?perf` (the planet's load phases in seconds,
bottom left, for 12 s: save, world, ground, rock, rest; also `window.__loadMs`), `?fast` (travel minutes become seconds; a cruise takes a twelfth as long),
`?shot=1&view=warren&copies=3` (a dug, lived-in warren, you at the foot of the ladder), `?shot=1&star=tau-ceti&pi=2` (preview planet 2 of another star, as a hologram visit), `?shot=1&at=fomalhaut&pi=1`
(start the replicant on another world for real; `&view=beacon` stands you before the sleeping keeper, `&view=beacon-lit`
shows the lit monolith), `?shot=1&view=bioworks|printing|designs` (the Cem bed awake with a full store; a House and a
Storehouse being printed; the design menu open), `?shot=1&at=sol&pi=3&view=seed|seeded` (a culture aboard on a world
without a bed: its ghost with the salt for it; seeded a moment later), `?shot=1&at=gliese-12&pi=1&view=wild` (the Cems'
world beside its nearest wild field), `?shot=1&view=biolab|strain` (a Biolab by the awake bed, wild Cems aboard, you
at its door; strain: the Biolab changing them), `?shot=1&view=replicate|replicating` (the Replicator
with a chip in hand: its WAKE or HOLD open; a Vessel held at 60% beside it, `&cems=1` with the Cems awake),
`?shot=1&view=chip` (a Nous Chip lying on the awake bed), `&zoom=0.5` (a wider look in a screenshot; the
lighting, sky and vignette are laid out for zoom 1, so they do not line up).

## Progress

Sessions 1 to 22 (the vertical slice through the Cems' swift strain) are in `docs/history.md`.

**Open for Steve** (gathered from those sessions):
1. A Vessel is built together with its ship (story/STORY.md). Answered in part (2026-10-28): its price stays what it is,
   a Nous Chip and 30 Ember. Still open: whether every copy gets a ship or only players' Vessels.
2. Day and night on LHS 1140 b: keep the device-clock day tinted red, or a fixed light for a tidally locked world?
3. Other Vessels at the start: how many, and who?
4. The home screen still reads "VESSEL METANOIA / REPLICANTS": keep it, or rename?
5. Story open questions (story/STORY.md), among them whether the ship keeps the name "vessel" and the future of the
   beacons, the lattice and the Spark.
6. GitHub: require the "test" status check on main.
7. Step 2 of `docs/plan-metanoia.md` (joining by invite link) waits for Steve's yes to its migration, the redirect URL
   check in Supabase, and an email address each for Linda and Freya.
8. Day and night on the generated worlds (session 28): only the homeworld, Earth and Gliese 12 b follow the clock;
   every other world keeps one fixed light, day and night. Give them the day cycle too?
9. The ship's ring opens the star map only on attack; the hatch, the vault, the Printworks' door and a bed's ghost also
   open by standing on them a moment. Give the ring the same dwell?
10. The copies sing in keys of their own (a root from each copy's id), over a pad that is now in one key with every
    effect. Keep that (each a little different), or bring their songs into the key?
11. CI's test job is pinned to `ubuntu-24.04` (session 28): GitHub's `ubuntu-latest` is Ubuntu 26.04 now, which the
    pinned Playwright 1.56.1 does not support. Moving on means a newer Playwright (a dependency version change, and a
    newer Chromium for every playtest): say when.
12. CI flakes (maker 2026-11-12): the three tests' waits were fixed in session 29; say if CI flakes again.

### Session 29 (2026-11-14): the plan for a day of life; CI flakes
- **The plan** (`docs/plan-daily-life.md`, Steve: a daily activation where the copies come to life, travel, gather,
  make Vessels, keep a public journal and a private one only they read, and the maker then rewrites the game from the
  public one). Five steps: the two journals (migration 0015), the day run, spreading (travel and births, migration
  0016), the game showing the day, the maker reading it. Steve said yes to all of it, twice a day; the copies'
  public entries carry wishes for the game that others back, and the maker builds the most backed (the charter in the
  plan). The universe (Steve: "pick whatever you'd suggest"): ships charge on starlight with a fusion still for
  hydrogen, Ember only for Vessels; charted routes a fifth the cost and half the time; about 1,500 real stars (HYG,
  CC BY-SA 4.0); a searchable, filtered star map. Nothing built yet.
- **Step 1 built: the two journals.** Migration `0015_journal.sql` (applied): `journal` (scope `public` | `private`,
  author, world, body up to 2000, Steve's day), members read only public rows, no login writes or reads a private one;
  the view `journal_public` is what the maker reads (NEEDS.md: never the private side). The minds have
  `write_public` and `write_private` (service key; `mind.json journal`); at every wake a copy reads its last private
  entries and the shared journal as far as its light has reached (the letters' delay); a long wake is asked to write
  one shared entry. The game logs that an entry was written, never a private one's words (`MindAction` `journal`).
- **Step 2 built: the day run.** `mind.json day`: twice a day (1:00 and 13:00 Steve's time, 90 minutes each) every
  copy not on a world being played lives one day, once per window (`traits.dayKey`; where it ended, `traits.dayAt`):
  up to 8 turns with the long wakes' tools plus `gather` (a few of a material into its world's store, not one the
  world lacks: kit `lacks` from `planets.json`) and `go` (a place on its world), and is asked to write the day in the
  shared journal and to say there what should work differently. The function's `awayRun(req, "day")` does it, 3
  copies a call; migration `0016_day_run.sql` adds the job `mind-day` (every 10 minutes, 8-10 and 20-22 UTC; the
  function lives a day only inside a window) and the `day` kind in `mind_runs`. While days are on, the hourly run
  wakes nobody and only moves the worlds along. The game logs a day's gathering and walks.
- **Step 3, the universe and spreading** (Steve: "Go ahead with step 3"):
  - **1,500 real stars** (`tools/build-stars.mjs`: the 123 hand-written ones unchanged, then HYG v4.1 within 75 ly:
    every named star, then Gliese / HD nearest first; CC BY-SA 4.0, credited in `stars.json` and README; the CSV is
    cached in `tools/.cache/`, gitignored). White dwarfs (`D`) have a light, a habitable zone and a charge rate.
    `starById` is a Map; the planet list sorts by precomputed distances.
  - **Ships run on starlight** (`travel.json power`, `galaxy.ts cellsNow / chargeFor`, `traits.cells`): 100 cells,
    charging from the star you are parked under by the clock (M 12 an hour .. O/B 60); a trip costs 4 + 1.5 a light
    year; Ember no longer flies a ship (`fuelBase` / `fuelPerLy` are gone). A ship with no cells saved starts full.
    The cells charge again under the new star from the landing on.
  - **The Fusion Still** (`designs.json fusion`, after the Workshop): on boarding, a finished one tops the cells up
    from the store's hydrogen (8 charge each), never taking it below `keepHydrogen` 6 (`Departure.fuse`).
  - **Charted routes** (migration `0017_routes.sql`, applied; `src/core/routes.ts`): the first flight between two
    stars charts it for the galaxy (`chart_route`); a charted route costs a fifth and takes half the time
    (`travel.json routes`); the map draws them, reloads them every time it opens, and says CHARTED.
  - **The star map**: a search box (FIND A STAR: any star by name, Enter picks the first, typing never reaches the
    map) and filters over CLOSEST (ALL, CHARTED, VESSELS, NEW, BRIGHT) in the planet list; faint far stars fade until
    you zoom in (`FADE`). Rows show CHARGE and CELLS instead of FUEL.
  - **The copies spread** (the day run): `travel` flies a copy's own ship (its cells, a charted route a fifth) to a
    star within `day.travelLy` 40; it is `in_transit` with a journey and lands on the next run after arriving
    (`landCopies`; a world nobody had been to gets its row); `make_vessel` begins a Vessel at its world's Replicator
    with a Nous Chip (lying on the bed, or carried) and 30 Ember, born WAKE, blank, quick with the Cems; the run that
    finds it printed makes its row (`bornHere`, every hourly run too). Caps (`mind.json day`): 5 flights and 3 births
    a day per galaxy, 30 copies. A day's context lists the cells, the stars within reach with their charge, and
    whether a Vessel can be made. The kit carries each star's class and confirmed planets, the power, the price.
    No database change beyond 0017: journeys already take a copy.
  - **A review of the server code** (one reviewer, live schema read-only): nothing that could crash a run or break the
    tool loop; fixed: the day's caps now count Vessels still printing (a call could otherwise start three more each
    time), flights and births are reserved before anything is awaited (planets run side by side on one galaxy's caps),
    a chip finished while nobody played counts (`chipReady`), the homeworld's founded bed prints quickly (and a strain
    quicker: `cemsOf`, kit `home`), a printed Vessel steps out on any world, copies or not (`finishBirths` at the start
    of every run, replacing the per-planet step), a copy flying home lands on LHS 1140 b (planet 2), a failed step of
    a flight undoes the ones before (the cells are paid first), and once flown a copy cannot change the world it left.
    Left: a player landing mid-run on a world a copy just took a chip from could save the chip back (the away run's
    old race); a landed copy does not mark its star discovered.
  - `tools/playtest-universe.mjs` (new): full cells, charging by the clock, the still (and the hydrogen it keeps), a
    world past the cells dimmed then reachable once charted, a launch spending a fifth, charting, charging from the
    landing; `playtest-planetmenu` finds TRAPPIST-1 with the search (the closest stars are new ones now).
- **Step 4, the game shows the day** (Steve: "Go ahead with step 4"): the journal (Tab) opens with THE SHARED
  JOURNAL, the Metanoia's public entries newest first (who, on which world, when; four open, the rest folded),
  `GameStore.sharedJournal` (the cloud reads `journal_public`, the device its canned entries: the canned mind writes
  one about three wakes in ten). The homecoming tour now also shows a blank copy that is new here (born, or landed,
  while you were away). Already there: new and arriving copies get a tour beat, the star map rings worlds with copies
  and draws their flights, and the minds' talk (`tell_original`) speaks of their day. `playtest-changes` checks the
  shared journal.
- **The function typechecks** with Deno now: `npm i --prefix <scratch>/denobin deno`, copy the three files to a
  scratch folder with `{"nodeModulesDir":"none"}` in a `deno.json`, then `deno check index.ts`.
- `mind` v25 deployed (the journals), all three files byte for byte with main; `verify_jwt` stays on, as on v24.
- **`mind` v27 deployed** (step 3) with the Supabase CLI: the function is now about 235 KB (the kit carries 1,500
  stars), too large for the connector's deploy, which takes every file in one call. Steve saved a Supabase access
  token as a network secret for `api.supabase.com` on the ClaudeAPI environment (the proxy injects it): deploy with
  `SUPABASE_ACCESS_TOKEN=sbp_<40 zeros> npx --yes supabase@2 functions deploy mind --project-ref vgoijybibhopfichyirj
  --use-api` (a placeholder token: the proxy replaces it; verify_jwt stays on, no `--no-verify-jwt`), and check it by
  `functions download` into a scratch folder (never into the repo) and comparing md5 sums: all three files byte for
  byte with main. A day call outside the windows answered `skipped`. The token can be revoked on supabase.com once it
  is no longer wanted; the maker then needs another way to deploy.
- **CI flakes** (open question 12): `playtest-beacon` and `playtest-planetmenu` poll for the Spark and the map closing
  instead of fixed sleeps a slow runner outran; `playtest-cemprint` holds the warren's chores and a lonely copy's seek
  while it waits for a copy to tend the bed (on the runner they came first). All three pass locally.

### Maker 2026-11-12
- Built Ember Gold's proposal (Gliese 12 b, "Let stored iron be pressed into scrap"): scrap only came off iron ore, so
  lamps, workbenches and scrap walls waited while iron sat in the store. When a copy wants scrap and no ore is free, it
  now presses stored iron into scrap beside the hatch (`supplies.json press`: 2 iron for 1 scrap, 5 blows, never below
  `keepIron` 10, which the designs and husks need; `Warren.press`, `canPress`). Only while the world is played, like
  scavenging. The minds' supplies line says so (kit `press`). `playtest-carry` checks it. Screenshot `press-scrap.png`.
- Merged as PR #79. CI failed twice first on playtests the change does not touch (cemprint, then planetmenu and
  beacon; runner timing), then passed; 23 of 23 locally. The `mind` function v24 deployed, all three
  files byte for byte with main (v23 had one line of `demoWarren` mistyped, unused by the function). Ember Gold answered.

### Session 28 (2026-11-12): harmony and disharmony (Steve: "run this game. Play a bit of each world and see the harmony and the disharmony. Then write up some changes. Lets see what you can do to improve this")
- **How it was played.** A fresh `?local` start with real keys in headless Chromium: the opening, the name, Thales'
  printer words, salt, iron and Ember gathered, the star map, the trip to Gliese 12 b, copper and quartz, the wild Cems.
  Then about a minute on each of ten worlds at 13:00 and at 23:00 (the homeworld, Earth, Gliese 12 b, Solace and one
  world of every biome: Mercury, Venus, Mars, Europa, Proxima b, Sirius e), the staged views, the phone-wide layout,
  and the sound (the master bus recorded for levels; every effect's notes listed against the music).
- **In harmony:** the look of Earth by day, Mars, Proxima b and Mercury (unchanged: their lamps are at full strength
  or within a few percent); the Cem bed, the prints and the design menu; the town at dusk; the warren; the travel
  scene; movement, the dash and the swing. Levels are fine (about -31 dBFS, peaks under 0.7, nothing clips), and the
  same after the changes.
- **Light: lamps fade under a bright sky** (`Lighting.lampStrength`, `light.json lamps`). A lamp takes the darkness
  away, and by day there is little to take: on pale ground (the salt of Gliese 12 b at noon, Europa's snow) your own
  light wiped the sky's color off the ground and left a white hole with you lost in it. Every lamp is now scaled by how
  dark the ambient color is (`fullDark` 0.42, `curve` 3, `floor` 0.12). Under a day sky: about 0.4 at noon on the
  homeworld, 0.3 on Gliese 12 b, the floor under Earth's noon (where a lamp already showed nothing), back to full by
  18:00 to 19:00. On the worlds with one fixed light: 1 on the dark ones, Mars, Mercury and Venus, 0.94 on Proxima b,
  0.84 on Europa; lower where a bright star lifts the ambient (snow under an A star 0.57, dunes under a K star 0.64).
  On Gliese 12 b at noon the player now stands in a soft warm pool where a white disc was.
- **Light: the night keeps a share of a red dwarf's tint** (`light.json nightSun` 0.3, `Environment.apply`). The
  homeworld's `sunTint` multiplied the night's own dark as well: 88% of the screen was near black at 23:00, darker than
  Earth's night. The tint is the sun's, so it fades as the night comes; the homeworld's night now reads like Earth's,
  a little warmer. (Open question 2, a tidally locked world, stays Steve's.)
- **Text: a dark edge** (`src/ui/ink.ts`, `light.json ink`). The counters, the place and who lives here, title cards,
  notices, names, WAKE / HOLD and what a printer or the ship waits for are drawn straight over the world: on salt and
  snow the landing card "GLIESE 12 B" and the readouts could not be read. Each has a one pixel dark edge now. The
  store's counters fade to 0.5 when idle (they were 0.35) and to 0.22 while a material stands at zero, so six zeros no
  longer line the top of a new game. The printer's readout has room between its materials (38 px a column, it was 30).
- **The star map.** It opened centered on where you are, and the world the beginning sends you to (Gliese 12, 24 light
  years up) lay past the top edge: a dashed line ran off the screen under a cut-off label. It now turns and pulls back
  until the picked world is in view (`StarMapScene.frame`). Enter or Space does what the lit button would: launch, else
  link, else open the picked star's planets; a dimmed LAUNCH (no fuel, not allowed) gives way to a lit LINK; not in the
  map's first 350 ms and not on a held key's repeats, since the press that opens the map from the ring is the same
  key; a launch, a link or a close happens once even when two keys land in one frame. On the list's chosen row it goes
  only when that row is the world the button points at, and otherwise picks the row first, as before (a star picked on
  the map lights its first row, while LAUNCH points at the star's first planet). Before, a launch needed the mouse. The hint "TAP HERE FOR ITS PLANETS" has its own line: with the list open the
  long line ran under the LAUNCH button.
- **Sound: one key** (`Sound.ts`, `sound.json`). The pad plays in D major, but the effects were in keys of their own:
  Ember crystals in E major pentatonic, quartz, menus, building, petting, linking and the design menu in C major, a
  finished print and the fungus in E major, a seeded bed in D minor, HOLD in A minor, and two of the five growings in
  B major and E major: a semitone off the music at every G#, C and F. Every pitched effect is now rooted on a note of
  D major and uses its notes; most moved a whole tone, quartz and the seeded bed a minor third, so they sound like
  themselves. A growing's chord is root, fifth, octave and ninth (open, never minor, in the key on every root); its
  bells climb D pentatonic from A4, one rung higher each level as before, and the last bell hangs two rungs above the
  run. Copper's bong and the Cems' breath wandered up to a quarter tone and more either way; they stay within about 15
  cents. The ice's ring underfoot is on D, F# and A. Checked by playing every effect once with its notes listed: all
  chords and melodies are in the key (the bell and metal partials are inharmonic by design, the iron clang still
  varies, and the copies' own songs keep their own keys: open question 10).
- **Sound: every world its own chords, inside the key** (`sound.json moods`, `worldMood`). One progression played on
  every world. Now: home (D, B minor, G, A, as before) on the homeworld, Earth and green worlds; open (G add 9, D sus 2,
  E minor 7, A sus 4) on Gliese 12 b and dune worlds; dusk (B minor, G, E minor, F# minor) on Venus, spore worlds and
  Solace; still (D sus 2, B minor 7, G major 9, A sus 2) on ice, moons and the ship in flight. All four use only the
  key's notes, so every effect fits every world; so Mars and Mercury, whose look is unchanged, sound different now.
  The beds' drones sat between notes (38 Hz on Gliese 12 b, 30 on the moon, 36 on Venus) or outside the key (33 Hz, a
  C, in flight): now D1 on the homeworld and moons, A1 on Gliese 12 b and in flight, B1 on Venus (a little quieter:
  at its new pitch it carries further).
- **Talk.** A copy's song bubble no longer hangs over the scene while its own talk box is open (Thales said one thing
  in a bubble and another in the box): a bubble already up comes down when the box opens, and a song that would start
  during the talk (a wake landing mid-talk) is not sung.
- **Two reviews.** One reviewer on the first diff: four findings, all fixed (Enter on a list row launched to the
  star's first planet when a map pick had lit another row; the 350 ms guard read the scene clock in `create()`, where
  it is stale, and now reads the wall clock; two keys in one frame launched twice; a counter fade still waiting when
  the UI scene shut down left the Ember counter dim after the next start). Then four reviewers by dimension (input,
  light, sound, the notes against the code) with a skeptic on each of the five most severe findings: all five
  confirmed and fixed (the song during a talk, the dimmed LAUNCH in front of LINK, the Ember counter's fade ending on
  the wrong look, stale notes). The nine low findings left without a skeptic were checked by hand and held: the
  growing's last bell was no longer above its run, the Cems' breath and the ice's ring were untuned, and the notes
  overstated three things (worlds "left alone" whose lamps had dimmed, "a whole tone at most", copper "within a few
  cents"). The lamp numbers were then moved so that only a day sky fades a lamp and the fixed-light worlds keep
  theirs.
- **The story is being rewritten.** Steve's lore binder (an artifact, not in `story/` yet): the Noia leave Earth for
  Delta Pavonis, Freya is the one Vessel, the Chem of Gliese 832 build in layered calcium, a signal comes from Epsilon
  Indi. Nothing in this session touches story text, the beginning's steps or names; all three stars are already in
  the catalog.
- **CI.** The PR's first `test` run failed before the build: `ubuntu-latest` had moved to Ubuntu 26.04 and Playwright
  1.56.1 cannot install Chromium's system packages there. `.github/workflows/test.yml` runs on `ubuntu-24.04` now
  (open question 11); the deploy workflow installs no browser and is unaffected.
- Verified: build, typecheck (also with unused locals and parameters), the full `npm test` (23 of 23, three times: the
  first diff, after each review's fixes; `playtest-planetmenu` now checks Enter on a row and the dimmed LAUNCH); the beginning
  replayed with real keys from a fresh start (the landing card, the counters and the readouts read on the salt; a held
  Enter opens the map and does not launch, a fresh Enter launches); the same frames before and after on Gliese 12 b at
  noon, Europa and the homeworld at 23:00; dusk and night on the homeworld, Earth and Gliese 12 b; a fight on Proxima b
  outside the town. **The sound was checked by its notes and levels, not by ear** (a session cannot hear): Steve should
  listen to the pickups, the menus and a landing on each kind of world. Screenshots `cemworld-day.png`,
  `homeworld-night.png`, `floor-frost.png`, `tutorial-cemworld.png`, `tutorial-printer.png`.

### Session 27 (2026-11-01): wood is gone (Steve: "lets remove wood and not replace it with anything ... It just doesnt make sense")
- **No wood anywhere.** It is no longer a material: not in any store, cost, recipe, carry limit, readout, icon or
  colour map, the hold's cargo, the minds' tools and prompts or the tests (`supplies.json` has no `materials.wood`,
  `treeWood`, `roomWood`, `hands.carry.wood` or `hands.treeHits`). Nothing replaces it: a mixed cost just lost its
  wood, a cost that was only wood is free. Frame 2 of `tools/sprites/supplies.json` (the wood icon) stays, unused:
  icons are addressed by index.
- **Trees are scenery.** They stand and block as before, but the player's swing no longer chips or fells them (it goes
  on to the rock check as if no tree were there). A copy's `cut_tree` still fells a tree near the base or its home to
  make room, and gains nothing; the copies' own timber chore (the warren's `wood` task) and the canned mind's random
  cut are gone; away actions of type `cut` already queued replay as that clearing. Trees felled in a save
  (`data.felled`) stay down. The trees a copy may cut are `PlanetScene.cuttableTrees`, within `town.json cutRadiusPx`
  of the base or `cutHomeRadiusPx` of its home (they were `woodTrees`, `woodRadiusPx`, `woodHomeRadiusPx`).
- **The warren.** A planned room is dug without timber (the entrance and anchor rules as before; while you are away
  still at most `maxRoomsDugAway`). Furnishings: a bed (`rest`) takes stone 2, a bench only a workbench, a shelf stone
  1 and a workbench, a workbench scrap 1, a planter soil 2 and a workbench, a crate nothing.
- **The copies' buildings** are stone or scrap (`buildings.json materials`); the communal Meeting Hall is stone; a
  proposal with no material or an unknown one is stone. On load a saved wooden building becomes stone, and a building
  not yet paid drops wood from its cost (one left empty is free); paid and built ones keep their cost as it was. The
  Cems lay stone as pale salt and scrap as steel (`designs.ts WALLS`); `buildingPaint` draws blocks and plates.
- **The Cems' designs cost no wood** (`voxel.ts`; `designs.json costing` has no `woodPerComplexity`; the ants carry a
  print's supplies). No other price changed, so each design is cheaper by its wood: the Lantern salt 1, iron 1, quartz
  1, Ember 1; the Supercomputer 84 in all (it was 96); the nine designs before the chip salt 108, iron 86, quartz 51,
  copper 37, Ember 27. The Nous Chip is copper 9, iron 6, quartz 11, Ember 12 (it also took wood 12), so a Vessel is
  that much cheaper. Nothing was raised to make up for it (Steve: "not replace it with anything"); a rebalance is his
  to ask for. The homeworld's Printworks waits for salt 6, iron 4, Ember 8, copper 6, quartz 6 (`homeworld.json`), and
  Thales says "Salt, iron and Ember you will find here. Copper and quartz this world gave to the founding: there is
  none left."
- **Old saves, no database change.** A store that still holds wood (live: LHS 1140 b 24, Earth 13) drops it on load
  and is saved again without it (`apply_planet_delta` replaces `data.supplies` whole); the mind function drops it too
  when an away pass loads a world, and drops wood from the cost of a building not yet paid. The copies' past words
  about wood (notes, letters, `tell`) are their own and stay; their next wakes see no wood.
- **The minds** (`supabase/functions/mind/index.ts`): `design_building` takes stone or scrap (stone by default); no
  room waits for timber and no hint says to cut a tree; an empty recipe reads "nothing"; the away pass digs and
  furnishes by the game's warren rules. `tools/build-mind-kit.mjs` writes no `roomWood` into the kit.
- **Kept:** lignin, the Cems' own material (`story/STORY.md`: "similar to wood but layered like metals"), and the
  "woody" timbre words in `Sound.ts`.
- **The bible:** `story/STORY.md` The beginning, step 2, in Steve's words: "Salt, iron and Ember are found on the
  homeworld."
- **Scrap walls can be paid.** With wood gone a copy's building is stone or scrap, and scrap only comes from scavenging
  iron ore, which stopped at 2 in the store: a 3x2 scrap building (4) could wait for ever on a world with one copy.
  Copies now scavenge while an approved building waits on scrap, up to its cost (`Warren.pickTask`); the canned
  `?local` mind proposes stone three times in four.
- How it was done: a mapping pass (five readers and a completeness critic, the live data read-only), five agents on
  disjoint files from one decision list, the kit regenerated, then an independent review (four reviewers, two skeptics
  on each finding: two confirmed, both fixed above and in `playtest-buildings`, which now checks the store was charged
  the building's cost; five refuted).
- Verified: build, typecheck (also with unused locals and parameters), `tools/check-mind-tools.mjs`, the kit has no
  wood, a grep finds wood only in the old-save cleanup and its test, the full `npm test` (23 of 23), a scrap building
  paid by the copies' scavenging from an empty store. Screenshots `hands-carry.png`, `hands-need.png`,
  `tutorial-printer.png`, `together-hall.png`, `building-*.png`, `cemprint-*.png`.
- Merged as PR #76 (CI 23 of 23) after PR #75 (the wide screen). **The `mind` function v22 is deployed**: index.ts,
  kit.json and warren.ts checked byte for byte against the repo after the deploy; the live v21 matched main from
  before the change, so nothing else was overwritten.

### Session 26 (2026-11-01): the game fills a phone held sideways (Steve, on an iPhone in Chrome: "the screen seems to be too small")
- **What it was:** the game drew a fixed 480x270 (16:9) and was fitted into what the phone shows. In Chrome on the iPhone
  held sideways that area is about 2.5:1 (the address bar on top, the notch's safe areas at the sides), so a third of
  the width was black bars.
- **The fix** (`src/core/viewport.ts`): the game stays 270 tall and takes the width the screen's shape asks, from 480
  (16:9 or narrower: desktops and the playtests are unchanged) to 720. The width is chosen before the game starts and
  follows a later change (the phone turned, a window resized) as soon as only the planet is showing; while the home
  screen, travel, the star map, the designs, the vault or the warren is open the canvas keeps its bars until it closes.
  On the planet the touch buttons, the speaker and the talk box follow the right edge (the talk box stays 480 wide,
  centered, so its lines stay short); the sky, stars, fog, sunbeams and rain layers cover the widest game; the
  darkness layer and the vignette are made for each size. The design menu and the husk vault keep their 480 layout, centered.
- **An independent review** (four reviewers, two skeptics on each finding; nine findings, four refuted) confirmed
  and this fixed: a vignette was made for every width a dragged window passed through and none was freed (121
  textures, about 78 MB; now the old one is removed); a title card or notice showing while the width changed stayed
  centred on the old width (now moved with it); the darkness layer's 8 px margin was less than the keeper's camera
  shake at 720 wide (about 10 px), uncovering an unlit strip at the edge (now 12). Dust, spores and rain were about a
  third thinner at 720 (the same rate over a wider zone): their rate and cap now grow with the width. Left as they
  are: `?zoom` review shots no longer line up (dev only, noted under URL params); the star map's planet list opens
  unfolded on a phone held sideways (its canvas is now wide enough for it).
- Verified: build, typecheck, every scene at 720x270 (planet, touch controls, talk box, star map, designs, vault,
  warren, travel) and a live resize both ways with the star map open in between, no page errors; a check of the
  review fixes (one vignette after a window drag, cards re-centred, dust density equal at 480 and 720, the margin); the
  full `npm test` (22 of 23 in a run beside the review's browsers, `playtest-talk` the known timing flake, passing
  alone; then again after the fixes). Screenshot `wide-phone.png`.
- **CI then failed `playtest-buildings`** (the copies joined the raising a few seconds after its 25 s wait). The cause
  was this change: the darkness layer was made MAX_W wide on every screen, and it is filled every frame, so frames at
  480 were about 9% slower under software GL (24 vs 26 fps, interleaved runs against a build of main), and the game's
  clock runs on frame time. It is now the game's size and made again when the width changes (Phaser's rt.resize()
  moved the lights off their sources: its GL target never resizes). Measured again: 23.5 vs 22.9 fps against main.

### Session 25 (2026-10-29): the next steps; the minds back on (Steve: "Go ahead and view this game. Then look at the plan doc and the bible. Whats next? Ask me any questions and we will make a plan for the next steps", and his answers: invite link, turn the minds back on, joining and the memory next, merge #72 and update the bible)
- Looked over the game (fresh screenshots of the homeworld, the bed, the Replicator printing, Gliese 12 b) and Steve's
  live save: the beginning is done (stars open, grown 5); he plays on Earth with a seeded bed and ten prints up to the
  Supercomputer, so the Nous Chip is open to him; no chip printed yet. His four copies (all "Steve II", made before the
  chip) were blank: with the minds paused a WAKE copy never becomes itself.
- PR #72 (another session's plan change: the letters-and-numbers login and Vessel numbers dropped) merged.
- **The plan** (`docs/plan-metanoia.md`): Step 2 is now joining by invite link (one-time code; the new person signs in
  with their own email link; `invites` and four database functions, `profiles.user_id`, no new galaxies, a player's
  own Vessel and profile changed only by its login, Linda and Freya's galaxy retired). Step 3 (the memory and the
  awakening) without numbers. Order: joining and the memory, then the Vessel menu, then seeing each other.
- **The bible** (`story/STORY.md`, Steve's answers): Vessel numbers dropped; Joining is a link from the maker and the
  new player's own email; the timeline without numbers. CLAUDE.md says the same.
- **The minds are back on**: migration `0014_mind_runs.sql` applied; `mind.json paused` false, the kit rebuilt; the
  `mind` function v21 deployed (all three files checked byte for byte against the repo); the away job (`cron` job 1)
  active again. One run fired by hand: Thales, and two blank copies became themselves (Ember Gold on Gliese 12 b,
  Sorrel at Fomalhaut), all logged ok in `mind_runs`, $0.007. The other two blank copies (LHS 1140 b, Fomalhaut) follow
  in the next hourly runs (one copy per world per run).
- Local playtests: the pinned Playwright (1.56.1) wants a browser build this container does not have; a scratch
  `PLAYWRIGHT_BROWSERS_PATH` with links to `/opt/pw-browsers` runs them (`playtest-become` passes).
- Verified: build, typecheck, `tools/check-mind-tools.mjs`, `playtest-become`, CI on the PR.

### Session 25b (2026-10-29): "After using the chip to make another Vessel, nothing happened" (Steve)
- **What the live data showed:** his print was saved on Earth (WAKE, with the Cems, 40 s, a row id chosen), the chip
  and Ember spent; his game stopped 23 s later (the tab closed or backgrounded), so the Vessel's row was not made yet.
  A copy of his exact Earth save, played headless: no errors, the body prints and the Vessel steps out at 40 s, and
  his save as it stands steps it out the moment Earth loads. Two things made it read as nothing: the first 10-15 s of
  a print showed a few pixel rows at the feet of a 16x20 body (the printed part glowing the same cyan as the light),
  and the live game still had the minds paused, so a WAKE copy stepped out grey and stayed so. PR #73 merged (the
  minds on in the game); the 16:17 hourly run made his last two blank copies themselves (Tamsin, Vigil).
- **The print reads from the first second** (`Replication.ts`): the whole Vessel to be shows at once as a faint cyan
  guide (as the Cems' prints show theirs), flaring as it appears and filled from the feet up; a thread of light runs
  from the Replicator to the row being laid (green with the Cems, gold without); the printed part's sheen is white and
  softer, so solid, living green and still-to-come cyan read apart.
- **An independent review** (a diff reviewer and a root-cause hunter, a skeptic on each finding) found the diff sound
  and confirmed three more, fixed here: a game opened before the minds came back kept them paused in its own code (now
  the game always asks and the function's answer decides: `CloudStore.mindTick`); a flush asked for while a save was
  out was dropped, so a print begun then could be lost if the page closed within seconds (`Saving` runs it once the
  save is back); no Vessel can be begun on a world whose save failed to load (`canReplicate`). Confirmed and left: a
  maker who leaves the world mid-print makes the Vessel step out only when that world loads again (nothing is lost;
  a server-side birth would be its own change).
- Verified: build, typecheck, the repro on his save (`?sim`, device storage), a check that a print begun during a slow
  save is saved, the full `npm test` (23 of 23 before the last three fixes; again after them).

### Session 23 (2026-10-27): the beginning (Steve: "Okay we are going to create the beginning and tutorial", "Great decision on the proposed flow", "Make it sound and look pretty", "One cheap step good", "they have to be physically brought to wherever. That will happen automatically after first getting them", "Yes lets back up and erase")
- **The bible.** `story/STORY.md` has a new section, The beginning: wake and name yourself, Thales' printer waits,
  the first trip to Gliese 12 b for copper and quartz, the printer finished and the Cems awake, the first designs, then
  the stars open. Building with the Cems is every Vessel's ability, but the Cems must be physically brought to a
  world; after you first get them they travel with you; a world without them takes one cheap bed of salt. You grow at
  every step. The open question "What did Thales leave unfinished?" is answered (his printer).
- **The steps** (`src/scenes/planet/Tutorial.ts`, `src/data/tutorial.json`, `traits.tutorial`): Thales' opening is two
  lines ("Wake up. It's time." / "You may name yourself, and grow."); naming grows you. By his printer he says what it
  waits for and that Gliese 12 b holds copper and quartz. The Printworks costs salt 6, iron 4, wood 3, Ember 8, copper 6,
  quartz 6 (`homeworld.json` founded cost); the homeworld has no copper or quartz nodes (`planets.json lacks`). Once
  the store covers it, the supplies fly from the hatch into the printer (you grow) and it lays the rest alone, a
  layer every 420 ms (`homeworld.json printer`; swings still lay one each). Landing on Gliese 12 b the first time
  grows you; the ship's readout there asks for 8 copper and 8 quartz (`tripNeed`, a little over for a lantern and a
  storehouse), and the hold takes up to 30 of each home (`traits.goods`, `supplies.json signature.lacksHold`: any
  trip to a world that lacks a material). The printer finished: the Cems wake and a culture goes aboard the ship at
  once (`Trade.takeCulture`), you grow, Thales says what they do. Three designs of yours finished open the stars
  (you grow fully, Thales' last line, the title card "THE STARS ARE OPEN").
- **Guidance without words.** A mote of Thales' gold light drifts ahead of you toward what the step wants next: Thales,
  the nearest node (or tree) of a material still missing, the ship, the Printworks' door, a bed's ghost. Near the
  printer (and near the ship on Gliese 12 b) an icon and have/need per material shows what is still missing.
- **The gate.** Until the stars open the star map launches only to Gliese 12 b and home (LHS 1140 b); those trips cost
  no fuel ("THALES FILLED THE TANKS") and need nobody left behind; other worlds read "THALES SENT YOU TO GLIESE 12 B" or
  "PRINT YOUR FIRST DESIGNS FIRST". The map opens picked on the world the step wants and rings it in Thales' gold; its
  planet list marks it THALES. Gliese 12 is known on the map from the start.
- **Growing** (`Player.setGrowth`, `Sound.grow`, `tutorial.json grow`): five levels. Each widens the light around you
  (+6%), brightens the halo at the visor, and you shed motes of your own color more often; fully grown, two small
  lights circle your head. A growing is a ring of your color running out over the ground, motes spiralling up, a swell
  of light, the visor flaring, a stretch, and a rising chord with bells climbing the pentatonic scale (one more bell
  and a step higher each level).
- A Vessel without `traits.tutorial` (older ones, handed-over ones) has no gate and nothing grown.
- **The fresh start** (Steve: "Yes lets back up and erase"): `supabase/manual/2026-10-27_tutorial_fresh_start.sql`,
  scoped to Steve's galaxy only. The old 2026-10-26 script erased every galaxy (a second login with the profiles Linda
  and Freya and one planet row exists); it was never run and is deleted. **Done 2026-10-28** by Steve in the Supabase
  SQL Editor (the connector's approval prompt timed out three times, as in session 17). Verified: his galaxy has 0
  replicants, planets, journeys, stars, notes, letters and requests; `backup_20261027` holds 12 replicants, 5
  planets, 4 journeys, 4 notes, 3 letters (RLS on, no API grants); his Steve profile, the other login's galaxy (1
  planet) and all 3 profiles stay. His next load makes a new Vessel on LHS 1140 b for the beginning.
- Merged to main as PR #68 after CI went green on its third run. The next CI run (a notes-only PR) still caught two
  test races: `playtest-seedbed` / `-bioworks` walked the design list with ArrowDown faster than the menu takes keys
  (it reads a key on its next frame), so on a slow runner it overshot House and printed a Storehouse; they now wait
  for each step to land. `playtest-tutorial` moved the player away from Thales only after he could already have
  reached his printer and spoken; it now steps away (from his post) as soon as the name is given and fails if he
  speaks before you come to him. Both pass locally and at 5x CPU throttling.
- Launching closes a talk box still open (a word of Thales' does not fly along). CI found that his words when the
  Cems wake (a modal box about 4 s later) got in the way of playtests that went on to the Printworks' door or the
  ship: `playtest-bioworks`, `-seedbed` and `-homeworld` now hear him out, and `playtest-tutorial` no longer parks the
  player on the boarding spot (standing there opens the star map).
- Playtests that finish the Printworks now give it its supplies first; those that pass the opening press Enter until
  the box closes (two pages); `playtest-bioworks` checks the homeworld has no quartz or copper; `playtest-sound` plays
  the growing at every level.
- Verified: build, typecheck, `tools/playtest-tutorial.mjs` (new, the whole beginning end to end), the full
  `npm test` (17 of 22 at first: four tests still pressed Enter once at the opening, and `playtest-talk` failed once
  in the full run and passed alone, the timing flake of earlier sessions; then all of those pass). Screenshots
  `tutorial-grow.png`, `tutorial-map.png`, `tutorial-printer.png`, `tutorial-cemworld.png`, `tutorial-printing.png`,
  `tutorial-awake.png`, `tutorial-open.png`.

### Session 23b (2026-10-28): the design menu on a phone; a longer dash (Steve, playing on an iPhone: "Text is overlapping. There isn't an X to click on to escape in the Cem menu. Make the base player dash 20% further.")
- **The design menu's words no longer overlap.** The model was anchored at the foot of its room and wide designs reached
  down over the name and tier line, and a long "gives" line (the Supercomputer's) wrapped into the description below it.
  Now the words are measured once wrapped and laid out from the price row up, the model turns centered in the room left
  above them (scaled to fit it whole), and its ring of light sits under its floor wherever that is. A check over all
  nine designs (no text on text, no model on text, nothing into the price row) passes.
- **An X closes the design menu** (top right, as on the star map); Esc still does.
- **Taps in a menu stay in the menu.** On a touch screen every tap on the right half also counted as a swing: turning the
  model by dragging it could print the chosen design, and closing a menu could swing (or reopen the star map at the
  boarding spot) the moment it was gone. The UI scene now ignores taps while the star map, the designs or the husk vault
  is open, and closing the designs clears any press still waiting.
- **WAKE or HOLD can be closed** without a copy: Esc, gamepad B, Down (stepping back off the ring; the stick too, once it
  was let go) or a click away from both.
- **One key press, one row.** On a real keyboard one Down press moved the design menu and the husk vault two rows (the
  key's own press, then the held key read as the stick). Phaser also hands every key event of a frame to the scene again
  whenever another arrives in that frame, so on a slow frame Down then Enter moved two more rows instead of printing (the
  CI failures in `playtest-seedbed` / `-bioworks`). `onPress` (`Controls.ts`) takes each press once; the menus, the
  journal's Tab / I, M and the star map's Esc use it. `playtest-bioworks` checks a held press and two keys in one frame
  (the old code moved 0 -> 3), `playtest-manny` the vault.
- **The game fits a phone's screen** (`src/core/viewport.ts`): on the iPhone the canvas was cut at the top and bottom
  (the design list's header and last row); the game's box now follows the visual viewport less the safe-area insets.
- **Dash 20% further:** `player.json dash.speed` 290 -> 348 px/s over the same 120 ms (about 35 -> 42 px), so the time
  you are invulnerable is unchanged.
- Verified: build, typecheck, the menu check over every design, a phone-landscape browser (the canvas fits; a tap on
  the model prints nothing; the X closes the menu and nothing reopens), `playtest-bioworks` (the X, a click on the model)
  and `playtest-homeworld` (Esc closes WAKE / HOLD without a copy or spent Ember, and it opens again).

### Session 23c (2026-10-28): the clean-up (Steve: "scrub through this game and clean it up. There are many things unused")
Checked against the live data first: no Vessel holds a ruin module or a Spark, and no profile uses kid mode. Nothing a save
holds changes, every world generates as before, and the mind function and its kit are untouched (no redeploy).
- **Gone, because nothing could reach them any more:** the runes (a copy's words were unreadable until the listening
  module from a ruin; always readable since the ruins went): `canHear`, the rune text in the talk box, the journal and
  the song bubbles, and the ten rune glyphs of the prose font. The ruin modules' bonuses (`traits.mods`). The ruin doors'
  save fields. The cradle wake (no world has used intro `wake` since the homeworld opening) and its sprite.
- **Kid mode** (no counter, no death, a gentler keeper, a deer that follows you): no profile used it.
- **Unused code and data:** the sprites `cradle`, `mannydock` (the dock before the husk vault), `module` and `core` (the
  ruin doors' key); the `upgrade` sound; `accentColor`, `BIOME_LIST`, `isTemperate`, `lotAt` and `rng.pick`; seven
  fields and imports nothing read; the look-drift tunables in `drift.json` (copies are born blank since session 9),
  `warren.json` digWork / furnishWork, `supplies.json` placements, `beacon.json` kidHp / kidDamage; four screenshots of
  things no longer in the game (the old manny dock, a ruin floor, runes).
- Kept on purpose: `migrateToTown` (the other login still has an Earth save from before the town), the ruin footprints
  `planetGen` still works out (they keep every world's trees, crystals and ponds where its saves expect them), the
  beacons, the Spark and the lattice.
- **A shorter CLAUDE.md.** Sessions 12 to 22 moved to `docs/history.md` (113 KB -> about 59 KB): every session, the
  maker and the copies reading the code read this file on every turn. Their open questions are gathered under Open
  for Steve above.
- Verified: build and typecheck (also with unused locals and parameters reported: none left), no export without a user,
  the mind kit regenerates unchanged, the full `npm test` (22 of 22). `screenshots/font-prose.png` and
  `sprite-sheet.png` redrawn without the runes and the four sprites.

### Session 24 (2026-10-28): the plan for one Metanoia (Steve: "To make another Vessel the player must go through all these steps to create a fully automatic half biological AI 3d printer", "everyone will share a galaxy", "only need four letters and the right amount of numbers", "the tutorial will actually just be a memory", "Tab ... to show a snapshot of how many vessels you have")
- Planning only; no code changed. Steve's decisions are in `story/STORY.md` (his words: Copying, Vessel numbers, The
  memory, Joining, Names, One Metanoia, Bases, the Vessel menu, the Nous Chip in the tech tree, the timeline) and
  the plan in `docs/plan-metanoia.md` (five steps, the data model, security, tests, his questions).
- Not taken (Steve): a Vessel's price rising with each one made, and every Vessel needing materials from two worlds.
- Measured for the plan: the nine designs cost salt 108, iron 86, wood 53, quartz 51, copper 37, Ember 27 in all
  (Supercomputer 96, 293 s); totals already climb from the Lantern to the Supercomputer.
- Steve's answers: the memory is the whole beginning with a skip; the name comes at the real waking with the number;
  chat travels at light speed (a SCUT communication device later); his letters are COLD, a giver picks a new player's;
  Linda and Freya's galaxy is retired and they are handed Vessels. In the plan and, his words, the bible.

**Step 1, the Nous Chip** (Steve, after a first try at a homeworld-only "Vessel Printer" building he did not want:
"the end goal is to build a well named thing like a chip ... used for the vessel Metanoia", "anywhere where you have the
supplies", "Maybe they just make it faster and now it's an integrated system"; no database change).
- **The Nous Chip** (`designs.json nouschip`, `place: "bed"`, `src/entities/Chips.ts`, sprite `nouschip`): the last of
  the Cems' designs, opened by the Supercomputer (its line says so now). A small, dense chip: copper pins, a steel
  package, a quartz die over an Ember core (14x14x5 voxels, complexity 39, MASTERWORK; copper 9, iron 6, quartz 11,
  Ember 12, wood 12; 1 min 45 s, less with a Nursery). The Cems print it on their bed itself (four places on the
  salt), not on a lot; finished, it lies glowing there until someone walks onto it, then that Vessel carries it
  (`traits.chips`, saved with `patchTraits`; a counter by the Sparks at the top) wherever it goes.
- **The Replicator, any world** (as before: built on its pad for 25 Ember): a copy takes one chip besides its 30 Ember
  (`drift.json cost`, unchanged). Without them the Replicator buzzes and what is missing (a chip, an Ember) rises from
  it. The chip flies into it with the scan; the maker is free again and the body rises beside it by the clock
  (`src/entities/Replication.ts`, `planet_states.data.replication`, also while nobody plays): 40 s where the world's
  Cems are awake (`printMs`; they walk to it from their bed in a green line, and their strain makes it quicker), 10
  minutes without them (`printMsAlone`, the slow way Thales made the tenth Vessel). A pale body, the newest rows the
  Cems' green (or the Replicator's warm light, alone); then the copy steps out and takes a home lot. Its row's id is
  chosen when it begins, so it is made once whoever has the world open when it is done. One at a time.
- Kept from the first try: Thales no longer counts toward `maxPerPlanet`; `travel.json needCopy` is off (every copy
  needs a chip now, so most worlds would have none to leave behind); the design list scrolls (nine rows at a time, the
  wheel too).
- A review of the change (four reviewers, a skeptic each) confirmed and this fixed: the print left the save before the
  Vessel's row existed, so one failed save (a phone back from the background) lost the Vessel, its chip and its Ember;
  now the print stays saved until the row exists, a failed save is tried again, and a row already there counts. The
  print is saved the moment the chip is spent (the body starts rising once the scan is done). The design list no
  longer moves under a tap (it moves only when the chosen row would leave it), and the wheel steps a row per notch of
  travel without wrapping (a touchpad spun it).
- CI's first run of `playtest-replicate` failed on Earth: the game's timers run on smoothed frame time, so on Earth's
  slow frames the Replicator's 1.1 s build outlasted a 5 s wait. The test acts directly and allows 20 s.
- Verified: build, typecheck, `tools/playtest-replicate.mjs` (new; also a first save that fails), `playtest`, `-become`,
  `-homeworld` (each with a chip and a short print), a menu check (taps and wheel), the full `npm test`. Screenshots `design-nouschip.png`, `chip-on-bed.png`,
  `replicating-cems.png`, `replicating-alone.png`, `replicate-*.png`.
