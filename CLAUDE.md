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
an underground vault.

Theme: you are never alone, but every version of you is a little different. Lonely galaxy, warm settlements.

Words in player facing text: the beings are Vessels; the craft is "the ship" until Steve decides (story open question).
Code identifiers keep their old names (replicant, vessel, manny).

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
other devices. Kid mode, no counter and no death, was taken out on 2026-10-28; the profiles table keeps its `kid_mode`
column, always false.)

## Core loop (build in this order)

1. Explore: move around a procedurally generated planet surface (seeded), one biome, with ruins and resource nodes.
2. Fight: one tap attack with a generous hitbox, two enemy types, enemies drop resources.
3. Gather and build: resource counter, a base area near the landing site, place the Replicator with one button when you have enough.
   Since 2026-10-27 (story/STORY.md) building is the Cems': gather salt, iron, quartz, copper, wood and Ember, pick a
   design at the Printworks, and the ants ship the supplies to the print while the Cems build it. The bed travels: the
   ship carries a culture from every awake bed and seeds one on any world; where a bed is awake the Cems print the
   copies' buildings too (one building system).
4. Replicate: the Replicator creates a copy with drift. Copy becomes an NPC that walks around the base and generates resources while you are away.
5. Travel: launch the vessel, pick the next planet from a simple star map, land on a new seed and accent hue.
6. Handoff: a Vessel held asleep at its making is given to another profile, which wakes in it and names itself (since
   2026-10-26 no Spark is needed; the story: being copied and handed over is the only way to join).

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
- **One shared galaxy per login.** Everything (stars discovered, planets, replicants, resources, messages) belongs to a galaxy row that every profile of the login shares. Store a `galaxy_id` on everything so other logins could get their own galaxy later. No strangers, no public play.
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
tools/screenshot.mjs     build preview + headless Chromium capture -> screenshots/<name>.png
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
                         supercomputer) as voxel parts; costing turns volume and complexity into price and print time;
                         needs (unlock chain), gives (house mood, storehouse storage, nursery speed), materials, cameras
src/world/voxel.ts       pure: parts -> voxel grid, volume / complexity / tier / cost / seconds, print order; a ray caster
                         that draws a model (laminated lignin, see-through glass, outline, contours) in the world's 3/4
                         view (printed voxels solid, the newest still green Cems, the rest a cyan guide lattice) or as a
                         turntable; tools/design-preview.mjs draws every design into screenshots/designs.png
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
src/scenes/DesignScene.ts the design menu over the paused planet: rows (READY / NEED / LOCKED / WAIT, built count), the
                         chosen design turning in 3D (drag to turn), complexity, volume, print time, gives, price vs store;
                         the words laid out from the foot of the panel up (measured once wrapped), the model in the room
                         left above them; an X in the corner closes it
src/core/viewport.ts     keeps the game inside what a phone shows: the game's box follows the visual viewport less the
                         safe-area insets (the browser's bars, the notch), and Phaser refits on every change
supabase/manual/         SQL run by hand, only when Steve asks: 2026-10-27_tutorial_fresh_start.sql (backs up and erases his
                         galaxy only; run 2026-10-28)
src/data/*.json          palette, planets, player, enemies, items, structures, backend, village, warren (all tunables)
src/data/stars.json      123 real stars + 141 confirmed exoplanets (built by tools/build-stars.mjs; edit the catalog there)
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
src/fx/                  Lighting (multiply darkness RT + additive lights), Atmosphere (sky, stars, fog,
                         dust, spores), Fx (particle bursts, slash, floating icons), procedural textures
src/entities/            Player, Skitter + Hopper (Enemy interface), CrystalNode + Shard (Ember, iron, hydrogen, salt,
                         quartz, copper by kind; each its own glint, hit and pickup sound),
                         Base (pad + Replicator), Manny (the husk vault's bunker in the square: down its steps, a husk
                         left standing on standby)
src/fx/Environment.ts    real-time day/night (device clock), sunbeams, daylight lift, fireflies, rain + ripples + lightning
src/audio/Sound.ts       procedural WebAudio: every sound effect, the generative music, each world's ambience bed (no audio
                         files); buses sfx / music / ambience / ui / voice, ducking under voices, distance and panning
                         (listen, At), footsteps per surface (PlanetScene.footSurface); tunables in src/data/sound.json
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
src/world/buildingPaint.ts draws a building from its blueprint (planks / blocks / plates, flat / peaked / dome roof, door, window)
src/entities/Buildings.ts proposals, the original's approve / veto, paying, shared raising, offline progress; the
                         communal Meeting Hall / Workshop / Lookout the village starts on its own when the store is full;
                         Cem prints (Building.design, printStart, printMs): paid at once, on the free lot nearest the
                         square (a lantern at a free street lamp spot), risen by the clock (also offline), redrawn as
                         rows settle, lit and solid when done; whyNot / print / fraction / homeMood / storeBonus
src/data/supplies.json   materials (stone, soil, wood, scrap, Ember, iron, hydrogen), yields, storage, recipes
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
                         original's own work: felling, stone, scrap, the load above the head, handing it over,
                         swinging at a building, a copy's need over its head; supplies.json hands), Homecoming (what
                         changed since data.seen as a wordless camera tour, letters as envelopes by the vessel;
                         return.json), Talk (the
                         talk box), Minds (wakes, mind context, away replay, chorus, the journal and its actions,
                         copies' chores), Saving (planet delta, replicant row), Town (migration, lots, gifts),
                         Departure (board ring, star map, lift-off); shared.ts holds their helpers. The scene keeps
                         one-line delegates for what entities and playtests reach (scene.mindLog, scene.requestTalk...)
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
NEEDS.md                 the maker's procedure: what the copies asked for, how proposals are judged, built and answered
```

Saving: the shared Ember pool, node damage, structures (Replicator and the copies' builds) and the copies' banked
building work live in `planet_states` and are written as atomic deltas
(`apply_planet_delta` RPC) every 4s and when the page is hidden; the server value wins so every profile shares one
pool. The replicant row stores position, planet and `traits.awake` (the opening plays once per replicant).
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
`node tools/playtest-carry.mjs` (fell trees and carry the wood, a copy shows what its building waits for, the load pays
it, swings raise it, a load handed to a copy, stone from rock, a load stowed when leaving),
`node tools/playtest-together.mjs` (a lonely copy seeks company, the Meeting Hall starts itself and gathers them, a
room is improved, an away wake plays out, a Spark awakens a copy as a player),
`node tools/playtest-town.mjs [seed.json] [--port n] [--shots]` (an old save moves into the town once, nothing lost; the
world is open; copies reach what they need; with a snapshot of the live data it checks the real planet),
`node tools/playtest-talk.mjs` (the talk hint, E / right click open the box, pages, back, close, the reply line, another copy's box,
a blank copy, dash still on Shift, the real talk wake with the canned mind),
`node tools/playtest-homeworld.mjs` (a new player on LHS 1140 b: the scan, Thales' word, the visor, the founded
structures, Thales by his work, the Printworks printed to the end, Thales never handed over),
`node tools/playtest-planetmenu.mjs` (the list opens with the map, a row picks its planet, Down follows, a map pick
lights its row, L hides it, gone with the map),
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
`node --experimental-strip-types tools/design-preview.mjs [--cut 0.6]` (every design in the world view and from four
sides, with its volume, complexity, price and time -> `screenshots/designs.png`),
`node tools/playtest-tutorial.mjs` (the beginning: Thales' two lines, the name and the first growing, no copper or quartz at
home, the map gated to Gliese 12 b and home, free, Thales' printer words, the wisp, the printer's readout, the trip there
(growing, copper and quartz, the readout over the ship), the hold brings them home, the printer is fed and lays the rest
alone, the Cems wake and come aboard, three designs open the stars, all after a reload),
`node tools/playtest-changes.mjs` (the copies' proposals in the journal in every state, SAY NO, an away proposal told
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
reach, a swing works on the village: a tree (6 swings fell it), rock (4 break off stone), a building being
raised (a blow). Walk into a building waiting for what you carry, a copy, or the hatch to
hand the load over. Stand on the open hatch for a moment (a warm ring fills) or press attack on it to go down; walking
or dashing across it never does. At the Replicator (attack on its ring with enough Ember) two lights open over it: WAKE (left) and HOLD (right);
Left / Right (or the stick) choose, attack / E or a click on one picks; Esc (gamepad B), Down (stepping back off the ring)
or a click away from both closes it without a copy. Standing in the husk vault's doorway a moment (a ring
fills) or attack there goes down to the vault; Up / Down choose a row, attack / E / Enter pick, Esc goes up. Standing in
the Printworks' doorway (or before a seeded bed's design stone) a moment (once the Cems are awake; a green ring fills) or
attack there opens the designs; standing on a bed's ghost with the salt for it (a green ring fills) or attack there seeds it: Up /
Down choose, Left / Right or a drag turn the model, attack / E / Enter or a click on PRINT prints, Esc or the X (top right) closes.
A tap or click inside a menu (the star map, the designs, the husk vault) belongs to the menu: it never also swings in the
world (UIScene MENUS). At the vessel's board ring the star map has LAUNCH and, for a world with your manny,
LINK; at the empty berth (the vessel is elsewhere) it has LINK and TO VESSEL / TO SHIP; in flight a world with your
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
at its door; strain: the Biolab changing them), `&zoom=0.5` (a wider look in a screenshot; the lighting covers only the
middle).

## Progress

Sessions 1 to 22 (the vertical slice through the Cems' swift strain) are in `docs/history.md`.

**Open for Steve** (gathered from those sessions):
1. A Vessel is built together with its ship (story/STORY.md): what making one costs now (Ember for the body plus iron,
   hydrogen or other materials for its ship?), and whether every copy gets a ship or only players' Vessels.
2. Day and night on LHS 1140 b: keep the device-clock day tinted red, or a fixed light for a tidally locked world?
3. Other Vessels at the start: how many, and who?
4. The home screen still reads "VESSEL METANOIA / REPLICANTS": keep it, or rename?
5. Story open questions (story/STORY.md), among them whether the ship keeps the name "vessel" and the future of the
   beacons, the lattice and the Spark.
6. Supabase: migration `0014_mind_runs.sql` is not applied (the minds' heartbeat only logs an error). GitHub: require
   the "test" status check on main.
7. The minds are paused (`src/data/mind.json paused`). To resume: set it false, run `node tools/build-mind-kit.mjs`,
   redeploy `mind`, and run `select cron.alter_job(job_id := 1, active := true)`. The maker routine
   (`trig_01W1bBfgciouakZFzLHFK3FE`) still runs daily and finds nothing while they are; pause it too if wanted.

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

