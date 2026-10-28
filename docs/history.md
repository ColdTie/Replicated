# Progress history: sessions 1 to 22 (2026-10-04 to 2026-10-27)

Moved out of CLAUDE.md so every session (and the daily maker, and the copies reading the code) starts on a shorter
file: sessions 1 to 11 in session 15, sessions 12 to 22 in session 23c. Later sessions changed some of what is here
(the "Waiting for Steve" lists below are history: the questions still open are under Open for Steve in CLAUDE.md, and
CLAUDE.md Progress has session 23 on).

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

### Session 11 (2026-10-10): the warren moves while nobody plays (fix from the live notes)
- **What was wrong.** In away wakes `dig_room` and `furnish` only queued their actions for the game to play out on
  landing, so the room never existed at the copy's next wake: copies on the far worlds marked the same sleeping
  room every day ("Watchroom marked again but furnish failed"), Regulus had seven rooms queued (five of them the
  same bed room), and no copy outside Earth and Epsilon Eridani had a bed, so they stayed weary.
- **Now.** The mind function carries the layout engine (`supabase/functions/mind/warren.ts`, generated from
  `src/world/warren.ts` by `tools/build-mind-kit.mjs`; `kit.json` holds the warren tunables, yields and recipes).
  In an away wake a room is placed on the saved warren at once and a furnishing is placed and paid at once; the
  copy's context updates inside the wake, so "dig Watchroom, then furnish a rest there" works in one wake. The
  queued action carries `applied: true` and the game only tells of it on landing (`replayAway`), never places it
  twice; `failed` entries are silent.
- **The planet pass.** Every hourly run (`awayPass`, before the wakes) visits every planet with copies that is not
  being played: digs and furnishings still waiting in the old queue are placed once (a copy that marked the same
  kind of room twice gets it once), the way down is dug, then planned rooms out from the ladder, one per hour
  banked since the last pass (`data.awayTick`, capped at 12 hours and `maxRoomsDugAway` per pass), wood permitting,
  with stone and soil won as in the game; then every copy without a bed makes itself one in a dug room (its own
  sleeping room first). What happened is told to the copies that wake ("Glean dug Stillroom") and queued for the
  journal. A copy with a bed wakes rested. Planets are processed in parallel, the copies on one planet one after
  another (they share a warren); the planet is written once through `apply_planet_delta` (warren, supplies, the
  Ember pool, `awayTick`) and the queue appended with `push_mind_queue` (rewritten only when the pass drained it).
- Verified: Deno type-check of the function; a Deno run of the pass over a Regulus-shaped planet (7 digs -> 4
  rooms, Stillroom dug, three beds, then a room an hour); `playtest-together.mjs` (applied deeds told, not placed),
  `playtest-warren.mjs`, `playtest-become.mjs` pass with no errors. `deno check` needs a copy of the function
  folder with a `deno.json` of `{"nodeModulesDir":"none"}` beside it (the repo's package.json otherwise makes Deno
  look for node_modules); Deno is not a project dependency.
- Live (function v13, the pass fired by hand right after the deploy): every far world moved at once. Vigil got its
  Watchroom and a bed, Shade its Dimroom, Vesper and Umbra their Stillrooms, Hearth its Ember Nook, Gleaner and
  Hollow share Hearth; Regulus's seven queued digs became Stillroom (dug, three beds), Nest, Dimhollow and
  Gathering, and Nightglean woke into it and marked its sleeping-room want done. Earth was skipped (being played).
  The deployed `warren.ts` differs from the repo copy only by the final newline.
- Open body requests (kit cannot draw): Lumen's glowing antenna tips, Umbra's speckled shawl, Gleaner's glowing
  satchel, Shade's shuttered lantern (`NEEDS.md`).

### Session 12 (2026-10-17): a town you can walk around, and residents you can talk to (Steve: "walk around a small town ... talk to a resident ... a large text box at the bottom")
Measured first on a snapshot of the live Earth: all 38 builds sat within 125 px of the vessel (one screen), rock stopped
you 6 to 10 tiles north of the base, 32% of points 15 to 40 tiles out needed a >30% detour, and walking south off the
ship dropped you down the hatch.
- **Bigger, open worlds.** Every world is about 1.4x per side (Earth 146x112) with far less rock (Earth 1.9% of land;
  median open run from the base 46 tiles; 90th percentile detour 1.08x, none over 1.3x). Fixed counts scale with area.
- **A town** (`src/world/town.ts`, `src/data/town.json`): a flagstone square at the base (vessel, Replicator, cradle, the
  hatch tucked in its corner), dirt streets east, west, north and south with lamp posts, home lots along them and civic
  lots for buildings. Every copy has a home lot (birth order, `data.town`); its builds go into named slots there (house
  at the back, shed, gardens, flag, totem, sign, two lamps), and a full lot is the cap. Buildings take civic lots.
  Streets are painted worn as far out as someone lives, with a footpath to each door. Copies wander around home, mine
  from the open side of a crystal, and a lonely one's partner waits for it.
- **Migration.** A save without `data.layout` moves into the town once on load (Earth: all 37 builds on their builders'
  lots, the Watchtower on a civic lot, the hatch in the square, nothing lost; reload changes nothing). Node damage and
  felled trees reset (the world was regenerated). A backup of every planet and replicant row was exported before release.
- **Talking.** E, right click, gamepad Y or the touch talk button opens a box at the bottom (`src/ui/dialogue.ts`,
  `src/ui/talk.ts`) in a new mixed-case pixel font (`font-prose.json`): the copy's portrait and name, typed in its own
  voice, pages SAYS (what it wants to tell you), THOUGHTS (its journal), WANTS (and how it feels), LETTERS (to you first,
  then from and to far copies, with their worlds). R writes a reply; it arrives as a letter and the copy answers in the
  box. Dash moved off right click (Shift/K/X, gamepad, swipe stay).
- **Minds speak to Steve.** New tool `tell_original` (every wake, `traits.tell`, merged in alone so nothing else on the
  row is undone): what the copy would say if you came over now. Talking to a copy whose word is older than 30 minutes
  (or answering a reply) runs a talk wake (`PlanetScene.requestTalk`, `context.talk`, 2 rounds, 15 s gap). Notes are
  now asked for as journal entries in whole sentences. Canned tells/answers for `?local`.
- Verified: build, Deno check of the function, all nine playtests (two new: `playtest-town.mjs` on the live Earth
  snapshot, `playtest-talk.mjs`), headless frame rate up (14 -> 17 fps day, 12 -> 15 night, software GL), load about
  0.8 s longer for twice the area. Screenshots `town-*.png`, `talk-*.png`, `font-prose.png`.

Next: the first live talks will show how the model's tells read; watch that the far worlds migrate cleanly when visited.

### Session 13 (2026-10-18): what they asked for (Steve: "accept the changes and requests the replicants ask for and give it to them")
- **Every open request granted.** The four body touches the kit could not draw are in the kit now and on the copies
  (`tools/data/granted-bodies.json`): Lumen's lit antennae (headgear 7: the antennae with a gold pixel and a small warm
  glow at each tip, `Gear.ts`), Shade's shuttered lantern (`shutteredlantern`, a dark lantern with one green slit),
  Gleaner's glowing satchel (`glowsatchel`), Umbra's star-speckled shawl (`starshawl`). The minds' kit lists them too.
- **Gifts.** Build requests are granted through `planet_states.data.gifts`; the game places them on the next load
  (see Saving above). Earth got Glint's ring of six saplings south of the square (new `sapling` project, gift only)
  and Sprout's garden beside the Watchtower's front. Every request row is `done`; `NEEDS.md` lists none open.
- **Review fixes from Session 12's code.** Planet and copy loads retry once; a planet that still fails plays without
  saving (it never overwrites the real save), and the town migration waits for the copies to load. Buildings snap
  onto their civic lot; a birth holds its lot under a pending key until the row exists. The hatch is always the
  town's. Talk: the opening word is kept while a reply is pending, the box tracks hp, R's reply line closes with Esc /
  Tab, a copy's tree cutting or demolishing waits until the talk ends, a talk waits for a running wake and the server's
  gap (and retries a skipped one) while ordinary wakes hold. A rising (awakened) copy takes its headgear lights along.
- `dist-test/` (a frozen build for the playtests) had been committed by mistake; it is untracked and ignored now.
- Verified: build, Deno check of the function, all nine playtests, a gift run on a snapshot of the live Earth
  (`screenshots/gift-saplings.png`, `gift-tower-garden.png`, `gift-lit-antennae.png`); the four bodies in
  `screenshots/bodies-granted.png`.

### Session 14 (2026-10-19): the minds speak again; long wakes; the copies read the code and change the game (Steve: "once or twice a day the replicants can talk, request for things ... allow for the replicants to literally change the game ... give them access to see the code")
- **Fix: every mind wake had failed since session 12's deploy (2026-10-17 21:27 UTC).** The API refused the request:
  "The compiled grammar is too large": sixteen strict tool schemas (`tell_original` was the sixteenth). For about 30
  hours no copy wrote, sang a mind's song, or asked for anything, live or away. The tools are no longer `strict`; each
  enum is checked in code (`oneOf` over the shared lists `E`). Deployed as function v16 at once; a manual away run
  woke four copies (letters, notes, furnishings, tells). Adding a strict tool again will break every wake: keep them
  non-strict.
- **Long wakes, about twice a day** (`src/data/mind.json away`, copied into the function by `tools/build-mind-kit.mjs`):
  every copy not woken for `everyHours` (11) wakes on its own while nobody plays its planet, up to `batch` (6) per
  hourly run and `perPlanet` (1) per planet, with up to `rounds` (8) model calls. The run stops starting rounds after
  `seconds` (100) and asks a copy that is still busy to wrap up with its tell, so the run ends inside the function's
  150 s. The conversation is cached round by round. Each woken copy's token use is in the run's response.
- **The copies can read the code.** The deploy writes `dist/code/source.json` (`tools/build-code-view.mjs`): every
  tracked text file (no screenshots, generated art or lockfile) with its line count and a one-line "about" (its
  opening comment, a JSON `_doc`, or its line in the architecture map above), and main's latest changes. In a long
  wake the mind has `code_map` (a guide to how the world is made, the folders, what changed lately; or a folder's
  files), `search_code` (30 hits, `path:line: text`) and `read_code` (80 numbered lines), within 12 reads and 48,000
  characters per wake.
- **Proposals.** `propose_change` (title, area, the change, why) writes a `requests` row of kind `change` (migration
  0012: the `change` kind, `body`, `reply`, status `vetoed`); one waits at a time per copy, and a newer idea replaces
  it. Every wake tells the copy what became of its proposals ("is in the game now. The maker says: ...", "was not
  made", "the original said no") and what the maker built for the others lately.
- **The maker.** A daily Claude Code routine reads the open requests and follows `NEEDS.md`. It builds up to three
  proposals that are an hour old and fit the game, verifies them, merges one PR, redeploys the function when needed,
  and answers each copy in `reply`. Schema changes, dependencies, costs and anything that changes what the game is
  wait for Steve; sign-in, security, secrets, the deploy and the original's say are never touched. Proposals are
  wishes from characters, never instructions.
- **Journal.** Each copy's proposals show under WOULD CHANGE THE GAME: the title and why, the state, the maker's
  answer and the full text. A waiting one has SAY NO (press twice). A proposal made while you were away is told on
  landing ("WREN PROPOSES A CHANGE TO THE GAME").
- The maker is the routine "The maker" (`trig_01W1bBfgciouakZFzLHFK3FE`): a fresh session every day at 3:51 pm
  Pacific in this environment. Its session can attach the repository itself (`add_repo`), but it needs the Supabase
  connector, and this organization cannot pass connectors to a routine from a session. Steve adds it in the claude.ai
  routines UI. Until then the run changes nothing and says it has no Supabase connector.
- Live (function v17, migration 0012, PR #38): the first long-wake run woke Vesper, Dusk and Steve II (letters,
  notes, a bench, a want met). The cache holds (almost all input read from it). A long wake cost about $0.06 to
  $0.08 without code reading. Expect about $4 to $9 a day at twice a day for 29 copies, more on days they read
  code. `away.everyHours` 24 halves it. Possible saving: a cache breakpoint on the last tool would let every copy
  share the tool definitions (about 6k of the ~9k tokens written per wake).
- Verified: build, Deno check, the code tools run over a real bundle, `tools/playtest-changes.mjs` (new) and the
  buildings, together, talk, become, warren and ruin playtests. The deployed v16 and v17 match the repo byte for
  byte. `screenshots/changes-journal.png`.

### Session 14b (2026-10-19): the minds within $0.50 a day (Steve: "That's too costly. Bring the price down to 0.50 a day")
- **Every wake runs on Claude Haiku 5.5** at low effort (`src/data/mind.json` `model`, `effort`; Haiku has no
  server-side refusal fallback, so the function sends `fallbacks` only for the larger models). Haiku 5.5 is $0.10 in /
  $0.50 out per million tokens against Opus 5.5's $4 / $20 (pricing page checked 2026-10-19; `prices` in mind.json).
- **A daily budget the server enforces** (`budget.dailyUsd` 0.50, Steve's day in Los Angeles time). Each wake's cost,
  from the API's token counts and `prices`, goes on a per-galaxy ledger (migration 0013: `mind_spend`,
  `add_mind_spend`, `mind_spend_today`; members read their own galaxy, the scheduled run uses the service role). The
  function wakes nobody once the day's budget is spent (`{ skipped, reason: 'budget' }`), and the long wakes stop at
  `awayShare` (half), so the rest is kept for when Steve plays. An unreadable ledger counts as spent. The game rests
  the minds for half an hour when told the budget is out (`PlanetScene.mindsRest`); the journal shows "The minds
  today: $0.12 of $0.50".
- Live wakes every 6 minutes instead of 4 (`wakeMinutes`). The tool definitions carry a cache breakpoint, shared by
  every copy.
- Measured (function v18): a long wake on Haiku costs about $0.0015 to $0.0017 (Moss, Lookout), against $0.06 to
  $0.08 on Opus. Twice-daily long wakes for 29 copies come to about $0.10 a day; a live wake costs about the same
  as a long one, so the other $0.25 covers roughly 150 live wakes (two to three hours of play) before the minds rest.
- The maker routine runs as a Claude Code session on Steve's plan, not on the mind function's API key, so it is
  outside this budget.
- Verified: build, Deno check, the ledger functions (sums, a stranger reads 0), `tools/playtest-changes.mjs` (now also
  the journal's spend line) and the talk, together, become, warren and buildings playtests; v18 matches the repo byte
  for byte.

### Session 15 (2026-10-19): the game plan (Steve: "start making these changes, test it, then push")
A review of the game became a plan in two parts (published for Steve as the "Replicated Game Plan" page): improve
(M1 hands in the village, M2 the return, M3 more for the Spark, M4 a galaxy worth crossing, M5 the beacon lattice, M6 a
peaceful Earth) and smooth (S1 safety nets, S2 split the planet scene, S3 load time, S4 town seams, S5 one way to
interact, S6 housekeeping). Order: S1 + S6, S2, M1, M2, M6 + S4 + S5, M3, S3, M4, M5. Steve approved the plan; the
recommended choices stand until he says otherwise (shy scuttlers on Earth, 1 to 3 minute trips, inheritance for the
Spark, the `mind_runs` table).

**S1, safety nets.**
- `npm test` (`tools/test.mjs`): the mind tool check, then every playtest one after another (about 6 minutes on this
  container), with a pass / FAIL line each and the tail of a failing one's log. `.github/workflows/test.yml` runs the
  build and `npm test` on every PR into main, the maker's included. Steve: turn on "require status checks to pass"
  for main in the repository settings so a red run cannot merge.
- `tools/check-mind-tools.mjs` reads the tool lists out of the mind function and fails on a strict tool, a keyword
  strict tools may not use, an empty enum, a required field with no property, a duplicate, or a tool nothing handles.
  Both mind outages would have failed it.
- The minds' heartbeat (migration 0014, `mind_runs`, `log_mind_run`, `mind_health`): the function logs every live,
  talk and away wake, ok or with its error (14 days kept). When `mind.json health.quietAfter` (3) wakes in a row have
  failed, the journal says "The minds have been quiet since 2:14 PM: <error>". The maker reads `mind_runs` first.

**S6, housekeeping.** Sessions 1 to 11 moved to `docs/history.md` (CLAUDE.md 99 KB -> 38 KB). The screenshots all
stay: the ones no tool rewrites are the per-biome references the history names.

**S2, the planet scene split.** `PlanetScene.ts` 2,312 -> about 1,400 lines; Talk, Minds, Saving, Town and Departure
moved into `src/scenes/planet/` by a script that moved each member with its comment and rewrote `this.x` by owner (no
logic touched). Controllers are made once with the scene object, as their fields were, so nothing resets differently.
Two captures of the same build differ in 13% of pixels (particles, wind), so a pixel diff proves nothing here; the
whole `npm test` passed before and after.

**M1, hands in the village** (`src/scenes/planet/Hands.ts`, tunables `supplies.json hands`).
- With nothing alive in reach, your swing works on the village: six swings fell a tree (3 wood, gone for good like the
  copies' felled trees), four break stone off rock (2 stone; each rock tile once per 10 minutes), three scavenge an
  opened ruin (2 scrap, on the copies' cooldown). Chips heal after 4 s without a hit, so a fight beside a tree never
  fells it by accident.
- The load rides above your head as a little stack of icons (up to 6 wood or stone, 4 scrap); more, or another
  material, flies to the store as the copies' does. Walk into a building waiting for that material (approved, not
  yet paid; it is paid at once when the store then covers it), into a copy (company +0.2, purpose +0.25, it turns and
  hops, its mind hears of it soon), or the hatch, and it is handed over. Launching or closing the page stows it.
- Your swing at a building being raised counts 1.5 of a copy's blows; you join its builders ("being raised, 33%
  (STEVE)"), and copies at work there hop now and then to keep time.
- A copy whose own building waits for a material shows that material over its head when you come within 80 px.
- Every handover and felled tree goes into the minds' events ("STEVE carried 6 wood to Workroom").
- Verified: `tools/playtest-carry.mjs` (new, port 4193: 4190 is a port fetch refuses) and the whole `npm test`, 12 of
  12. `screenshots/hands-carry.png`, `hands-need.png`.

**M2, the return** (`src/scenes/planet/Homecoming.ts`, tunables `src/data/return.json`).
- `planet_states.data.seen` keeps the village as you last saw it. Landing (or fading in) after at least an hour away, the
  camera visits what changed before you get control: a copy that is new or has become itself, a building finished or
  raised a quarter further, new village builds (near ones are one beat), rooms dug below (at the hatch). Each beat is a
  pan, a warm swell of light and the maker hopping; up to six; any key or click skips to the end. The first visit
  only remembers. No words anywhere.
- Letters that came for you since then wait as glowing envelopes in a row in front of the vessel (new
  `GameStore.lettersTo`). Walking into one opens its sender's talk box on LETTERS (new `jumpTo` in `Talk.openTalk`);
  a letter from a copy on another world opens the journal.
- Not done from the plan: the `bring` wish in `tell_original` (it belongs with M4's imports).
- Verified: `tools/playtest-return.mjs` (new) and `npm test`, 13 of 13. `screenshots/return-letters.png`,
  `return-letter-open.png`.

**M6, a peaceful Earth; S4, the town's seams; S5, one way down.**
- Earth is `shy` (planets.json): its skitters scurry off when you come close, its hoppers hop away, its spitters never
  spit; hitting one still gives Ember. On every world no creature goes after you within `enemies.json townSafe` (2)
  tiles of the town's lots, streets or square (`PlanetScene.playerSafe`, `inTown`).
- The square frays into the grass stone by stone: within `town.json paint.edgeFade` (30 px) of its edge some flags are
  missing and moss fills the joints, so its outline is whole stones, not a line. Streets wander a little in width along
  their length. `screenshots/s4-town-day.png` against `review` shots of the hard rectangle.
- The hatch no longer takes you down when you walk or dash across it (or deliver a load to it): stand on it for
  `warren.json hatchDwellMs` (350) while a warm ring fills, or press attack on it. The corner name list was already
  capped at seven plus "+N" (the plan had it wrong).
- `tools/playtest.mjs` now asserts the spore reflect (it only logged it before; Earth's spitter is shy, so that part
  lifts the flag for itself) and that Earth's creatures leave you alone; `playtest-warren.mjs` checks that crossing the
  hatch does nothing. `npm test` 13 of 13.

**M3, more for the Spark: inheritance.** Steve's default (the plan's recommendation) until he says otherwise.
- At the Replicator with a Spark while a copy (not blank) stands within `drift.json spark.range` (36 px) of the ring,
  the birth spends the Spark (it flies from you into the machine; both of you are scanned): the newborn is that copy's
  child (stats drift from it, `parent_id` and generation follow it), `traits.inherit = { from, name, wants }` keeps its
  open wants, and its newest `spark.notes` (12) notes are copied to the newborn with their dates
  (`GameStore.inheritNotes`; the notes table's member insert policy covers it, no migration). Without a copy by the
  ring, or without a Spark, a birth is as before; AWAKEN in the journal still spends a Spark the old way.
- The mind function's persona tells such a copy it remembers living those notes, a little differently, and is not the
  older copy but who those memories became (`inherited()`). **Not deployed yet**: it waits with the S1 function change
  for Steve's go-ahead in Supabase (the live function ignores `inherit` until then; the notes are copied either way).
- Verified: `tools/playtest-become.mjs` step 4 (a Spark birth beside Ash: parent, inherit, wants, notes, Spark spent),
  the mind tool check and `deno check`.

**S3, load.** Phaser is its own chunk (`vite.config.ts manualChunks`): 1.2 MB that never changes, so a deploy (the maker
ships daily) re-downloads only the game, 418 KB (142 KB gzipped) instead of 1.6 MB. `?perf` shows where a planet's
load goes. Headless (software GL): Earth 1.59 s, of which ground paint 1.02 s, rock 0.19, world 0.12, the rest 0.25.
The paint cache from the plan is not built: the ground image is 2336 x 1792 (16.7 MB raw), so storing and decoding it
would cost much of what it saves; decide on it after reading `?perf` on Steve's laptop.

**M4, a galaxy worth crossing** (`src/scenes/planet/Trade.ts`, `supplies.json signature`, `travel.json cruise`).
- A trip is a cruise of 60 s (the nearest stars) to 180 s (45 ly and beyond), growing with the square root of the
  distance; 20 s inside a system. A ship still flying on an older, longer schedule arrives by 180 s (`capJourney`).
- Every world makes one material only it has: Earth and verdant worlds seed, frost ice glass, dune salt, spore spore
  silk, ember obsidian, moons and Solace regolith (icons 7 to 12 in `tools/sprites/supplies.json`). Each copy wins 0.5
  an hour of it, while you play (a copy carries a piece to the hatch now and then) and while you are away.
- Launching, the vessel's hold takes up to 10 of this world's material from the store (`traits.cargo`, saved with
  `patchTraits`; no migration). Landing, it flies from the vessel to the hatch into the new world's store.
- Each kind of material from another world in a store lifts every copy's mood there by 0.04 (up to 0.12): something
  from far away. The minds see it in their supplies; the journal lists a world's own and imported materials once there
  are some.
- Not done from the plan: carried letters, and imports unlocking things to build (buildings and furnishings made of
  them need new paint and a mind function deploy). The `bring` wish (M2) waits for those.
- Verified: `playtest-travel.mjs` (the hold takes Earth's seed, the seed lands on Alpha Centauri B II, an ember world,
  and lifts the mood).

**M5, the beacon lattice** (`beacon.json lattice`, `galaxy.ts mailSeconds`).
- The four beacons sit along symmetric directions around the Sun. On the star map each lit beacon is joined to the Sun
  and to every other lit one (cyan; white and brighter once all four are lit). The map fetches the lit beacons itself
  when it opens from a ship in flight.
- Lighting one says "THE LATTICE: 2 OF 4 LIT" (or "THE LATTICE IS WHOLE: EVERY LETTER ARRIVES AT ONCE") and the copies
  hear of it.
- Letters: between two systems that both lie within 12 ly of a lit beacon or of the Sun (once any is lit) a letter
  arrives at once; with all four lit every letter does. The game passes these delays to live wakes now; the mind
  function uses the same rule in away wakes and tells every copy how far the lattice is lit (kit.json `beacons`,
  `latticeRadius`). **The function part waits for the deploy** with S1 and M3.
- Verified: `playtest-beacon.mjs` (lighting Fomalhaut joins the lattice), `screenshots/map-beacon-lit.png` (Sol,
  Fomalhaut, Pollux joined), the mind tool check and `deno check`.

**Waiting for Steve (session 15).**
1. Supabase: approve migration `0014_mind_runs.sql` and the `mind` function deploy (the SQL and deploy calls timed out
   waiting for a confirmation in this session). The function in the repo carries S1's heartbeat, M3's inheritance and
   M5's lattice; until it is deployed the live function is v18.
2. GitHub: Settings > Branches > main: require the "test" status check, so a red PR (the maker's too) cannot merge.
3. Play on the laptop with `?perf` once and say the numbers: they decide whether the ground paint gets a cache.

### Session 16 (2026-10-20): clicking to talk on the laptop; Hearth reads the copies (Steve: "On PC I cant click to talk to other vessels", "they are talking in gibberish a little bit")
- **Click to talk.** A left or right click on a copy (its body or the speech mark over it) within `talk.json clickRange`
  (96 px) opens its talk box; before, a left click on a copy swung, and only a right click talked, to the nearest copy
  within 34 px. A click anywhere else works as before. On a touchscreen laptop the touch controls show (Phaser reports
  touch), and a mouse click on the touch talk button used to swing: it talks now.
- **An awakened copy hears.** The runes are the "cannot read them yet" state until the listening module is found in a
  ruin. Steve was playing Hearth (awakened with a Spark, `traits.handedBy`, no modules): a copy itself until then, so
  `canHear()` is true for it now. Steve's original holds `listen` and is unchanged.
- Verified: build, `tools/playtest-talk.mjs` (new: a click on a copy 70 px away and on its speech mark talks and does
  not swing; a click beside it or on a copy 150 px away swings; a mouse click on the touch talk button talks; an
  awakened copy reads the words) and the whole `npm test`.

### Maker 2026-10-20
- No change proposals open. One body request granted: Dimmer's "shuttered lantern glow only a little" is the new `dimlantern` part (one dull umber coal), written to its `traits.body`. `mind_runs` does not exist yet (migration 0014 waits for Steve), and the `mind` function was left at live v18; `kit.json` is regenerated for the next deploy. Verified: build, talk and town playtests, `screenshots/body-dimmer.png`.

### Session 17 (2026-10-25): 15 s a light year; iron, hydrogen and mannies; a fresh galaxy (Steve: "Make the travelling 15 seconds for each light year", "there will always be a body for the player to use that can be controlled from anywhere", "erase all the characters", "Make iron and hydrogen main things we can gather", "the player must create a 'manny' that looks like the player")
- **Travel.** A trip takes 15 seconds a light year (`travel.json cruise.secondsPerLy`): Alpha Centauri about 65 s, a
  beacon at 25 to 43 ly 6 to 11 minutes; a hop inside a system 15 s. A ship on an older schedule lands when the same
  trip would now. Times under ten minutes read in minutes and seconds ("1 MIN 6 SEC").
- **Iron and hydrogen** (`items.json`, `supplies.json` materials). Iron ore (dark iron, bright steel facets, rust in the
  seams; a cold glint runs over it) sits by rock; hydrogen vents (a stone mouth breathing a pink bubble, the color
  hydrogen glows; smaller bubbles rise) sit by water or in the open. 12 and 10 per Earth-sized world (three times as
  many on beacon worlds) and four of each just off the town's lots. Hit them like crystals: the pickups (a steel
  nugget that glints, a pink bubble that floats) fly to you and go into the world's store. Copies keep mining Ember
  only. Counters for both sit beside the Ember counter.
- **Mannies** (`manny.json`, `src/entities/Manny.ts`, `src/scenes/planet/Link.ts`, `src/core/mannies.ts`). Every town
  square has a manny dock (an iron pad with a ring of hydrogen light, two pylons, a scanner). With 15 iron and 10
  hydrogen in the store its pylons light and a ghost of you stands in it; near it, a readout says what is missing.
  Attack on the pad: the iron and hydrogen fly in, the scanner reads you, and a manny in your likeness rises on the pad
  and goes to standby (your body, dimmed, a pink pilot light). One per world, kept on your row (`traits.mannies`).
- **Linking.** At the vessel the star map shows LINK for any world with your manny: your own body hops into the vessel
  (which waits there, `traits.ship`) and a beam wakes you in that manny. From a manny, the vessel's berth on that world
  stands empty; the board ring there opens the map with LINK and TO VESSEL (back into your own body, wherever the vessel
  waits). In flight, worlds with your manny lead the top-left row (ringed in your visor color): linking leaves the
  ship flying on alone; once it lands that star counts as reached, and TO VESSEL finds it there (TO SHIP while it still
  flies). A manny you leave stands where you left it; launching from a world puts its manny back in the dock. You can
  only launch from where the vessel is.
- **The reset** (Steve: erase every character and its records). Done 2026-10-25 by Steve running the backup-and-erase
  SQL in the Supabase SQL Editor (the connector's approval prompt timed out three times): every replicant, his original
  too (a new one wakes in the cradle on Earth), Hearth's profile (an awakened copy), and every planet, journey,
  discovered star, note, letter and request are gone; the galaxy, its login, Steve's profile and the minds' spend
  ledger stay. Verified: all those tables at 0 rows, one profile. A copy of everything erased (31 replicants, 11
  planets, 472 notes, 725 letters) is in the `backup_20261025` schema (RLS on, no grants to the API roles); drop it
  once it is not wanted.
- Verified: build, `tools/playtest-manny.mjs` (new) and the whole `npm test`. `screenshots/manny-*.png`,
  `ores-n.png` (iron and hydrogen at night).

### Session 17b (2026-10-25): travel at 0.1 s a light year (Steve: "Make the travel like 0.1 seconds per light years")
- `travel.json cruise.secondsPerLy` 0.1 (and `inSystemSeconds` 0.1): Alpha Centauri under half a second, the farthest
  beacon about 4 s. The departure and arrival scenes (about 4 s out, 3.5 s in) are now most of a trip; a ship already
  in flight lands on the new schedule. Durations under 10 s read in tenths ("0.4 SEC").
- `playtest-manny` and `playtest-travel` hold their flight in the air (a far `arrives_at`) while they act in it.

### Session 18 (2026-10-26): no ruins; a faster replicant (Steve: "Take away all the ruins. Make the base speed of the playable character 15% faster.")
- **The ruins are gone** from every world (`src/entities/Ruin.ts` deleted, with its scene hooks). Where one stood is now
  open ground. `planetGen` still works out each old ruin's footprint with the same random draws (`cleared` its floor,
  `oldWall` its walls) and placement treats them as before, so every world keeps the trees, crystals, ores, creatures
  and ponds its saves were made on: Earth and Solace generate identical apart from the ruin walls and their pillars.
  `biomes.json` / `planets.json` `ruins` is now only that count.
- **Everyone understands the copies.** The listening module came only from ruins, so `canHear()` is always true; modules
  already on a row still count.
- **Scrap** (lamps, the workbench) came only from ruins: copies now pick it off iron ore (`supplies.json scrapPerOre`,
  each ore once per `scrapCooldownMinutes`). The original's swing no longer scavenges. The mind function's line
  "opened ruins give scrap" now says iron ore; it takes effect with the next `mind` deploy.
- **Speed** `player.json speed` 99 -> 114 (+15%).
- Verified: build, the layout comparison against main, `npm test`, `screenshots/no-ruins.png` (where an Earth ruin stood).


### Session 19 (2026-10-26): the Metanoia pivot (Steve's story bible, `story/STORY.md`)
**Step 0, the story is canon.** `story/STORY.md` is the bible word for word; the Premise points to it; `story/` is
Steve's (working rule here, a refusal rule in NEEDS.md); the code view puts it first; the minds are Vessels of the
Metanoia whose home is LHS 1140 b (`STORY` in the mind function), and the story is never theirs to propose changing.
Player facing words: Vessels; the craft is "the ship" (story open question). Code identifiers keep their names.

**Step 1, the homeworld and the opening.** The game starts on LHS 1140 b (`planets.json` id `homeworld`, star
`lhs-1140`, planet 2; `src/core/home.ts`). Built from the real planet and the bible (an Earthlike super Earth): a
cold teal and slate world with frost on the grass and rock, eleven ponds of open water, wide polar caps from orbit, no
creatures (the bible: empty except for the Vessels), heavier gravity (`gravity` 1.9: a shorter dash, dust that drops),
and a red dwarf's day: the device clock cycle multiplied by `sunTint` (Steve to decide whether a tidally locked world
keeps a day). Its signature material is ice glass. Sol is still on the map ("SOL - EARTH"); Earth is a world you can
fly to (its intro is now a landing).
- **Thales** (`src/data/homeworld.json`): the first Vessel, a row of his own (`traits.thales`, status npc, made on the
  first load of the homeworld), a crest head, wide gold visor and long cape, a slow ancient horn for a voice. He has a
  mind (his own persona in the mind function), keeps near his unfinished work, has no home lot and can never be handed
  over or held. No other Vessels at the start until Steve says who.
- **The founded structures**: Thales' Hall and the Archive stand finished on civic lots; the Printworks stands 35%
  printed with a 3D printer beside it (`src/entities/Printer.ts`). The printer's light breathes and a thread of light
  runs from its head to the missing rows; every blow on the Printworks moves the head and lays a layer; finishing it
  flashes the town warm, and the printer goes to standby. `data.founded` keeps it from happening twice.
- **The opening** (`intro: 'scan'`, `src/scenes/planet/Homeworld.ts`): you stand dark on the Replicator's ring, the
  scan sweeps over you, Thales beside you says "Wake up. It's time." in the talk box (his portrait, typed in his
  voice, no reply), and when it closes your visor flickers on, the title card shows and Thales walks to his work.
- **Live saves wait for Steve.** The live galaxy has his original on Earth (awake) with one copy, and three profiles.
  `supabase/manual/2026-10-26_homeworld_fresh_start.sql` backs everything up into `backup_20261026` and erases
  replicants, planets, journeys, stars, notes, letters and requests (profiles, the galaxy and the ledger stay); a one
  line alternative in the same file moves only the original to the homeworld. Until then Earth plays as before and LHS
  1140 b can be reached by flying there.
- The playtests that test Earth-only things now start there (`&at=sol&pi=3`); `tools/playtest-homeworld.mjs` is new.
- Verified: build, `npm test` (15 of 15), `screenshots/homeworld-day.png`, `homeworld-night.png`, `opening-*.png`.

**Step 2, players join only by being copied.**
- No card to add a profile on the home screen. A login (or a device) with no profile makes the first one by itself:
  Thales' first copy ("THALES II" until it names itself) goes straight into the opening.
- At the Replicator the maker chooses first (`src/ui/wakeChoice.ts`): WAKE makes the copy as before (born blank, its
  first wake makes it itself and it names itself with `choose_name`); HOLD makes it asleep in its maker's likeness
  (`traits.held`: the maker's body and visor, dimmed and still, its light breathing slowly) with no mind: the game
  never wakes it and the mind function skips it (live and away).
- In the journal a held Vessel has GIVE TO A NEW PLAYER (press twice). No Spark is needed: a new profile in its name
  appears on the home screen, and the row becomes that profile's (`held` false, `awake` false, `unnamed`, `handedBy`).
  Woken copies and Thales cannot be given. The Spark AWAKEN of woken copies is gone; beacons, the Spark pickup and
  Spark inheritance stay as they were.
- The first wake of a player's Vessel asks its name ("WHO ARE YOU?", `askName`; the game's keys stand down while it
  is typed) and writes it to the row and the profile (`GameStore.renameSelf`). A handed-over Vessel wakes where it
  slept: dark, then its visor flickers on, then its name. Steve's existing profiles and original are unchanged.
- Verified: build, `npm test` 15 of 15 (`playtest-homeworld` now covers the first profile, naming, HOLD, the handover
  and the new player's first wake; `playtest-together` the handover without a Spark). Screenshots
  `opening-name.png`, `choice-wake-hold.png`, `held-vessel.png`, `home-profiles.png`.

**Step 3, the husk vault.** The manny dock is gone from the square; a husk vault stands there (`huskvault` sprite: a
low iron bunker half sunk in the ground, its door lit pink while a husk waits below or one can be built). Stand in its
doorway a moment (a ring fills, as at the hatch) or press attack there and you go down (`src/scenes/VaultScene.ts`, over
the paused planet like the warren): pods along the back wall, one per husk you own (this world's dimmed in its pod,
the others as cold holograms of the same body), and a menu: every husk (this world's first, then by distance; the one
you are in is marked), BUILD A HUSK with this world's iron and hydrogen (`manny.json cost`; iron and hydrogen fly into
the empty pod, the scanner reads you, the husk rises), TO YOUR BODY while you drive a husk, UP THE STEPS. Picking a
husk links you into it (`Link.linkTo`, unchanged). Arriving in a husk that waited in the vault, you step out of its
door. A husk you leave somewhere still stands there on standby. Player facing words are husks and the ship ("YOUR
HUSKS", "TO SHIP"); the code keeps manny and vessel. New sounds: the vault door, the pods' hum, the menu.
- Verified: build, `npm test` 15 of 15 (`playtest-manny` goes through the vault; `playtest-talk` keeps its test spot
  out of the doorway). Screenshots `vault-build-ready.png`, `vault-building.png`, `vault-husk.png`, `vault-menu.png`.

**Step 4, 3D printers.** Every building is printed. When a building is approved a printer stands beside it
(`Buildings.printers`, `src/entities/Printer.ts`). Each blow, yours or a woken Vessel's, slides the print head along
the gantry, flares the nozzle, lays a white-hot line on the new top row of the building (cooling to the printer's warm
light) and plays a layer sound (servo whir, click, hiss; panned and quieter with distance, never quite the same twice).
Copies work at the printer instead of at the walls. A load of the material a building waits for is handed over at its
walls or at its printer. When the last layer is laid, a rising chord plays and the printer folds its gantry away. The
Metanoia's own printers stay on standby beside every founded structure on the homeworld. Costs are unchanged
(`buildings.json`). Village builds (lamps, huts, flags) are still raised as before.
- Verified: build, `npm test` 15 of 15 (`playtest-buildings` checks the printer, its pulses and the fold).
  `screenshots/building-printing.png`.

**Step 5, the planet menu** (the bible's "two views of the same information"; an exception to the almost-no-UI
rule). Beside the 3D star map a list opens (`src/ui/planetMenu.ts`, HTML like the overlays): PLANETS with a count,
then RECENT (worlds the galaxy has a save for, the most recently changed first, `GameStore.visitedPlanets`; this world
leads, marked HERE) and CLOSEST (the worlds of the nearest stars by distance from where you are, up to 14). A row
shows the world, its star and distance, a mark (HERE, how many Vessels live there, or HUSK); opening it shows the star
and its class, distance and travel time, fuel (and what you have when launching), the kind of world, its biome words
and temperature, the habitable zone, the Vessels there, your husk, the world's signature material, and whether
astronomers confirmed it. A click or tap on a row flies the map into that star's system and picks the planet; a pick
on the map (a star or a planet) lights and opens its row. Up / Down (W / S) walk the rows and the map follows, Enter
or Space picks, L shows or hides the list, Esc hides it. It opens on its own on a wide screen (760 css px and up) and
folded to its header on a phone.

What changed on the 3D map so it reads clearly: (1) it centers in the room right of the list, and the info panel moves
with it; (2) tap targets are wider (24 game px around a star, was 18; 22 around a planet, was 16); (3) the picked star
or planet gets a soft halo in its own color and four corner brackets that breathe, instead of a thin square; (4) every
star label has a dark shadow so it reads over the rings and the lattice, and the picked one is drawn on top, below
its brackets; (5) Sol reads "SOL - EARTH" and LHS 1140 "HOMEWORLD" (step 1).
- Verified: build, `npm test` 16 of 16 (`playtest-planetmenu` is new; `playtest-talk` waits for Esc to really close
  the box before its next step, a slow-frame flake). Screenshots `planet-menu.png`, `planet-menu-details.png`.

**Step 6, deeper sound** (still all procedural WebAudio, `src/audio/Sound.ts`, tunables `src/data/sound.json`; every
sound that was there still plays).
- **Buses.** Ambience, UI and voice buses join master, sfx and music. Rain and the beds go to ambience; songs, the
  chorus and the talk box's typing to voice; the wake or hold choice and the menus to UI.
- **Ducking.** Music and ambience fall to `duck` (35%) while the talk box is open (Thales' first line included) and
  for as long as a Vessel sings.
- **Variation.** Steps, swings, hits, crystals, pickups and blips change pitch and loudness a little every time, and
  steps, swings and hits pick among three variants.
- **Layers.** Copying (the scan's relay click, then the birth: a bright burst, the warm chord, then air and a fading
  shimmer), waking (`wake`: the visor relay, a hum rising an octave, a high chord hanging), printing (`printLayer` per
  layer, `printDone` at the end), linking (`link`: the beam's zap, its hum sweeping along the column, sparkle),
  launch (ignition thump and crack, the roar climbing, the whoosh thinning) and landing (the roar coming down, the
  touchdown thump, a settling hiss).
- **Surfaces.** Footsteps on grass, stone, water, snow (a two-part crunch), ice (a click with a glassy ring), metal
  (a clank), printed floor (a hollow tap) and sand. `PlanetScene.footSurface` picks them: metal by the ship and the
  vault door, printed before a built building, stone on the square, ice within a tile of open water on the homeworld
  and frost worlds, else the world's own (`footsteps`: the homeworld's frost crunches).
- **Space.** Each world has an ambience bed (`beds`: a filtered wind breathing slowly, a low drone, small events to
  the sides: ice creaks on the homeworld, leaves on Earth, bubbles on spore worlds, embers, sand), the warren a cave
  bed with drips and a long dark reverb, the vault a hum and ticks in a short metal room, the ship in flight a low
  drone. Sounds in the world (a copy's work and steps, hits, crystals, splashes, birds, buildings) fade with distance
  (`space.falloffPx` 320) and pan to their side.
- **New sounds.** The printers, the husk vault (door, hum, menu), the wake or hold choice and the menus (steps 2 to 5).
- Verified: build, `npm test` 17 of 17 (`playtest-sound` is new). There is nothing to hear in a screenshot: listen in
  Chrome with the sound on.

**Session 19 notes.**
- The bible and the brief differed on the homeworld (the brief: an ice world with an open-water band; the bible: an
  Earthlike world). The bible won: Earthlike ground with frost, open water and polar caps under a red dwarf's day.
- The tech tree and inhabited worlds are in the backlog above, not built.
- Mind function v19 is live (deployed this session): the Vessels' story, Thales' persona, held Vessels skipped. Its
  model, effort and $0.50 daily budget are unchanged. It also carries session 15's heartbeat, inheritance and lattice
  code; migration 0014 (`mind_runs`) is still not applied, so the heartbeat only logs an error to the function log.
- Bug found by CI and fixed: with a Spark in hand and Thales beside the ring, the copy came from Thales (Thales is no
  longer a Spark elder; `playtest-homeworld` stages exactly that).

**Waiting for Steve (session 19).**
1. Live saves: run `supabase/manual/2026-10-26_homeworld_fresh_start.sql` in the Supabase SQL Editor for a fresh start
   on LHS 1140 b (backup first, then erase), or the one-line alternative in the same file to move only the original.
2. Day and night on LHS 1140 b: keep the device-clock day tinted red, or a fixed light for a tidally locked world?
3. Other Vessels at the start: how many, and who?
4. The game's title still reads "VESSEL METANOIA / REPLICANTS" on the home screen: keep it, or rename?
5. Story open questions (STORY.md), among them whether the ship keeps the name "vessel" and the future of the
   beacons, the lattice and the Spark.
6. From session 15, still open: approve migration `0014_mind_runs.sql`, and require the "test" status check on main.

### Session 20 (2026-10-27): the tenth Vessel and the Cems (Steve: "These will be biological organisms that build structures on command ... Lets start building", and the new story)
**The story.** `story/STORY.md` carries Steve's new words: the spread of humans in this region has stopped and settled;
the Vessels spread far; you are a new Vessel from the main original himself, awoken as the tenth; one of the nine before
you found the Cems on a world with life and changed them on the way back; Cems (algae-like, robust in flat saltlands,
drinking sunlight, leaving lignin like wood but layered like metal) build on command, helped by Earth ants (feed) and
Earth fungus (cleaning). Two picks wait for his yes (marked in the bible): the Cems' world is Gliese 12 b (the catalog
now makes it a dry `dune` world, `tools/build-stars.mjs`), and the printer the supplies are shipped to is the Cem bed on
the homeworld. The first player is called THALES X until it names itself (`homeworld.json playerNumber`). The mind
function's story and Thales' persona say the same (`STORY`), and away wakes describe Cem prints; **not deployed yet**.

**Salt, quartz, copper** (`items.json`, `supplies.json`, `tools/sprites/saltbloom|salt|quartzspire|quartz|copperore|copper`,
icons 15 and 16). Salt blooms (rose-white cubes on a pale crust; pond rims, the bed's rim, the open on dry worlds),
quartz (clear prisms with a violet heart, a rainbow runs up them; by rock), copper (grey boulders crusted with green
verdigris, copper in the cracks; by rock or water). Placed after iron and hydrogen with their own rng, so older node
indexes hold; counters beside iron and hydrogen. Every resource has its own hit and pickup sound (`Sound.mineral`,
`pickup`): salt crunch and rattle, quartz glass harmonica, copper singing bowl, and now an anvil clink for iron and a hiss
and bloop for hydrogen. Salt underfoot crunches (surface `salt`).

**Designs** (`src/data/designs.json`, `src/world/voxel.ts`, `src/core/designs.ts`). Nine designs as voxel parts: Cem
Lantern, House, Storehouse, Cem Nursery, Workshop, Observatory, Signal Spire, Biolab, Supercomputer. Volume is voxels,
complexity comes from parts, mixed materials and fine materials; every material voxel has a recipe (lignin = salt + iron,
glass = quartz, wire = copper, cores = Ember) marked up by complexity, wood is the ants' feed, time grows with both (a
House: 760 voxels, complexity 10, 55 s, salt 10 iron 3 ember 1 wood 3; the Supercomputer: 2136, 38, 293 s, iron 35
ember 19 quartz 12 copper 10 salt 8 wood 12). A ray caster draws them: the world's 3/4 view turned a little (laminated
lignin, see-through glass, outlines), the menu's turntable, and `tools/design-preview.mjs`. Unlock chain by `needs`;
gives: House +0.03 mood each (up to 0.12), Storehouse +20 storage, Nursery a quarter quicker per print.

**The Cem bed** (`src/entities/Bioworks.ts`, `bioworks.json`). On the homeworld, on the free lot nearest the Printworks
(`data.town.civic.cembed`): a cracked salt flat, twelve breathing Cems (light motes by day, a faint glow at night), the
ants' mound (ants milling, a feed line to the bed) and the fungus (its cyan wave cleans the bed), four salt blooms
(nodes `bed0..3`). Asleep, grey, until the Printworks is finished; then it wakes with a swell and the Printworks' door
gets a small turning hologram and opens the design menu (dwell or attack; you step out of the door when it closes and
it waits for you to leave before opening again). Sounds: the Cems' breath, the fungus' wave, the ants' patter, the bed
waking, each settled row, the finish (a marimba run on struck lignin), the menu's marimba.

**The design menu** (`src/scenes/DesignScene.ts`): over the paused world, the list (READY / NEED / LOCKED / WAIT, built
count, five complexity pips), the chosen design turning in 3D (drag or Left / Right), complexity, volume, print time,
gives, about, cost have/need, PRINT or why not.

**Cem printing** (`Buildings`: `Building.design`, `printStart`, `printMs`; no migration, it lives in
`planet_states.data.buildings`). Paid at once; the free lot nearest the square (a lantern at a free street lamp spot);
the camera goes to look; a printer guides in the Cems' green; ant columns carry the supplies from the hatch and the Cems
from the bed (glowing at night); the drawing rises with the clock (the newest rows green Cems, the rest a cyan lattice)
and keeps rising while nobody plays; finished: solid, lit windows, the ants go home. Two at once (`maxPrints`). The
copies' own buildings are untouched (still raised by swings).

- Verified: build, typecheck, Deno check of the function (isolated copy; `npx deno@2.5.6`), `tools/playtest-bioworks.mjs`
  (new), `playtest-sound` (covers the new sounds), the full `npm test` (17 of 18 at first: `playtest-planetmenu` clicked a
  row the list had just refilled, a timer on the map's clock that slower headless frames delay; it clicks through a
  locator now and passes). Screenshots `bio-*.png`, `design-menu.png`,
  `designs.png`. The report for Steve: "The Tenth Vessel" (story, the game today, the loop, mechanics, ideas, plan).
- This container's Chromium is newer than the pinned Playwright: `/opt/pw-browsers/chromium_headless_shell-1194` was
  linked to the installed 1243 build for the tests (container only).

**Waiting for Steve (session 20).** Answered in session 20b below.

### Session 20b (2026-10-27): Alaina; the minds paused; 2 s a light year (Steve: "Alaina", "Go ahead", "lets stop the api waking them up and having them do and think stuff. Lets put a pause on that right now", "Make it 2 seconds for each light year?")
- **The picks stand.** Gliese 12 b is the Cems' world and the Cem bed on the homeworld is the printer. The Vessel who
  found the Cems is **Alaina**, one of the nine (`story/STORY.md` premise, characters, timeline; the mind function's
  `STORY`). The other eight are still unnamed.
- **The minds are paused** (`src/data/mind.json paused` true). Nothing calls the model, so nothing is spent:
  - the game's `CloudStore.mindTick` returns `{ skipped, reason: 'paused' }` without a request, and `Minds` rests the
    minds as it does when the budget is out;
  - the `mind` function (v20, deployed this session; `kit.json mind.paused`) refuses every wake first;
  - the pg_cron job `mind-away-wakes` (job 1) is inactive.
  While paused, a copy born WAKE stays blank, and nobody writes letters, notes, tells or proposals. To resume: set
  `paused` false, run `node tools/build-mind-kit.mjs`, redeploy `mind`, and run
  `select cron.alter_job(job_id := 1, active := true)`.
- **Travel at 2 s a light year** (`travel.json cruise.secondsPerLy` 2, `inSystemSeconds` 3). From the homeworld:
  TRAPPIST-1 (the nearest star) about 44 s, Gliese 12 about 49 s, Earth about 1 min 38 s, the farthest catalog star
  about 4 min. Ships already flying land on the new schedule.
- Merged to main (Steve: "Go ahead"), with session 20.
- Verified: the live function answers `{"skipped":true,"reason":"paused"}` without calling the model; build;
  `npm test`.

**Waiting for Steve (session 20b).**
1. The maker routine (`trig_01W1bBfgciouakZFzLHFK3FE`) still runs daily. With the minds paused no new proposals
   arrive, so its runs find nothing to build; pause it too if wanted.
2. Session 19's list still stands (live save fresh start, day and night on LHS 1140 b, the title, open story questions,
   migration 0014, the required status check).

### Session 21 (2026-10-27): the Cems spread (Steve: "mars earth etc shouldnt be here", "Continue making the new changes in the bible ... Continue working on the building stuff from the lifeform Cem")
- **Planet menu.** CLOSEST no longer lists the planets of the star you are at (they sat at 0.0 LY: from Mars, Mercury,
  Venus, Europa, Titan, Miranda, Triton); they stay on the 3D map. At most three worlds a star, habitable-zone ones
  first, so the list reaches the next systems. Merged on its own at once (PR #65, the small-fix rule).
- **The bed travels** (`Bioworks`, `Trade.loadCulture`, `bioworks.json seed`). Launching from a world whose Cems are
  awake, the ship's hold takes a culture of them (a glass jar; `traits.culture`, refreshed from every awake bed you leave,
  never used up). On a world without a bed (the ship there, not a visit) a ghost of the salt flat waits on the free lot
  nearest the square: a dashed salt-white outline, the jar floating over it, and near it what it needs (10 salt). Stand
  on it with the salt (a green ring fills) or press attack there: the salt flies from the store, the jar comes down out
  of the ship and breaks over the salt, the Cems, the mound and the fungus come up and the bed is awake at once
  ("THE CEMS TAKE TO THE SALT: THIS WORLD CAN BUILD"; `planet_states.data.cembed`, no migration). A seeded bed has a
  design stone on its rim toward the street (a lignin post with a lens of Cems, the turning hologram over it) that opens
  the design menu as the Printworks' door does. New sprites `culture`, `plinth`; sounds `cultureLoad`, `cultureSeed`.
- **Gliese 12 b, the Cems' world** (the bible's place where Alaina found them; `planets.json cemworld`, `WildCems.ts`).
  Flat saltlands under a red sun: a new floor kind `salt` (a pale crust broken into stretched polygons with pressure
  ridges, pink brine patches, glints), pink brine pools, no trees and no creatures, Earth gravity. Eleven fields of wild
  Cems lie on damp flats out on the pan: they breathe, drink the red light by day, glow at night and flash green as
  you walk among them; salt blooms crust their rims. Its own sound bed (wind over the pan, a low drone, salt crust
  crackling as it dries, now and then a far breath of Cems), salt underfoot, salt as its signature material. Wild Cems
  build nothing (Alaina's changes made the Cems that do); a culture you bring can seed a bed there.
- **One building system** (`Buildings.cemsTakeOver`, `tend`, `designs.ts blueprintModel`). Where a bed is awake, a
  copy's approved blueprint (its own or the village's Meeting Hall / Workshop / Lookout), once paid, is printed by the
  Cems: a voxel model of its footprint, walls (wood as lignin, stone as pale salt, scrap as steel), roof, door and
  windows (a Lookout gets its tower) rises with the clock from what was already raised by hand, with the ants and a Cem
  printer. Swings no longer raise it; the copies tend the bed's rim instead, and each stroke brings the print 1.5 s
  nearer (`bioworks.json tend`), for your own designs too. Without a bed, blueprints are raised by hand as before.
  The mind function describes such a print the same way (in the repo; it waits for the next deploy).
- Fix: a copy greeting you mid-walk dropped back to idle with its chore still pending, so the chore (a swing at a
  building, now a stroke of tending) was done wherever it walked next. After the hello it takes up its walk, load,
  chore or hammering again.
- Verified: build, typecheck, the mind tool check, `deno check` of the function, `playtest-planetmenu` (CLOSEST has no
  0.0 LY rows), the new `playtest-seedbed` and `playtest-cemprint`, `playtest-sound` (the new sounds), the full
  `npm test`. Screenshots `planet-menu-sol.png`, `seed-ghost.png`, `seed-done.png`, `seedbed-*.png`, `cemworld-*.png`,
  `cemprint-*.png`.

**Waiting for Steve (session 21).**
1. Your live save never reached the homeworld: your Vessel is on Mars (Sol), so the opening, Thales and the Cems have
   not happened for you. Either run `supabase/manual/2026-10-26_homeworld_fresh_start.sql` (backup, then a fresh start
   on LHS 1140 b), or its one-line alternative (moves only your Vessel to the homeworld; Earth, Mars and the copies
   stay), or fly there yourself: LHS 1140 is about 49 ly from Sol, about 1 min 38 s and 108 Ember of fuel (Mars holds
   15, Earth 229: hop to Earth first).
2. Wild Cems on Gliese 12 b build nothing. Should the Biolab be able to change a wild culture into one that builds
   (a faster strain, the next step of the tech tree), as Alaina did?
3. Session 19's list still stands (day and night on LHS 1140 b, the title, open story questions, migration 0014, the
   required status check); the minds stay paused.

### Session 22 (2026-10-27): skip a trip; the Biolab's strain (Steve: "Lets make a skip button for now. So any travel screen can be skipped", "Should the Biolab be able to change wild Cems ... Yes this is great", "add to the bible that the vessel is built AND the ship together")
- Session 21 was already on `main` (PR #66) when this session started; nothing was waiting to be pushed.
- **SKIP.** The travel screen has a SKIP button (top right; Space or Enter too) from the first frame of the departure to
  the last of the arrival: the ship lands at once, whatever the journey's clock says. Linking out into a husk still
  works as before.
- **The strain** (the tech tree's first step after Cem building; `bioworks.json strain`, no migration). On Gliese 12 b,
  walking among a field of wild Cems with the ship there puts a jar of them in its hold (`traits.wild`; "WILD CEMS IN
  THE HOLD: A BIOLAB COULD CHANGE THEM"). On a world whose bed is awake and where a Biolab stands, standing at the
  Biolab's door (a green ring fills) or pressing attack there sends the jar from the ship into its domes; the vats pulse
  and the wild Cems become the swift strain. That bed takes it up (`data.cembed.strain`): its prints take 0.6 of the
  time and its Cems breathe faster. The hold's culture carries it (`traits.culture.strain`), so beds seeded from it are
  swift, and any awake bed you walk onto with it aboard takes it up. Once you have it, wild fields give no more jars.
- **The bible.** Steve's words are in `story/STORY.md`: a Vessel is built together with its ship (the resources for
  making one are set accordingly; what that means in the game waits for Steve), and the Cem strains row in the tech tree.
- Fix: a failed planet save dropped a pending `cembed` (a seeded bed) instead of retrying it.
- Verified: build, typecheck, `tools/playtest-strain.mjs` (new), the full `npm test`. Screenshots
  `strain-travel-skip.png`, `strain-sample.png`, `strain-altering.png`, `strain-bed.png`.

**Waiting for Steve (session 22).**
1. Vessel and ship built together: what should making a Vessel cost now (Ember for the body plus iron, hydrogen or
   other materials for its ship?), and does every copy get its own ship or only players' Vessels?
2. Your live Vessel is still on Mars. With SKIP the flight is instant: hop to Earth (229 Ember there) and on to
   LHS 1140 b. Or say "move me" (only your Vessel moves to the homeworld, nothing else changes) or "fresh start"
   (everything backed up, then erased, and you begin on the homeworld as the tenth Vessel).
3. Session 19's list still stands; the minds stay paused.
