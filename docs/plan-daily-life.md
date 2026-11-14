# A day of life: the plan (2026-11-14)

Steve's direction (2026-11-13): "a daily activation that has the replicants in the game come to life and walk around,
and I want them to be able to move planets. They can now spread and also collect things and make more Vessels. Most
importantly they will explore and do what they want to do, but they will add notes to a document shared to everyone,
and a document for themselves that only they can read. Then when they write notes the public ones will be stored and
then this routine after the vessels shut down will literally give Claude Code instructions on how to re-write the
game."

Nothing here is built yet. Each step ships on its own, verified (build, `npm test`, a run against a copy of the live
data).

## Decided (Steve, 2026-11-14: "Yes to everything you suggested")

- Both migrations (steps 1 and 3) approved.
- Budget stays $0.50 a day. Caps: 30 Vessels in the galaxy, 3 new a day, 5 trips a day.
- The day replaces the long wakes. Every copy may travel on its own.
- **Twice a day**: the copies live a day twice (two windows), and the maker runs after each.
- **The copies shape the game itself** (Steve: "the vessels will collectively give Claude Code instructions on what to
  change in the game"): their journal entries carry requests to change the game, they back each other's, and the
  maker builds what they ask for together. They never write code. Step 5 and the charter below.
- Still to talk over: more worlds, a bigger universe, easier navigation and much cheaper flight, and what powers it
  (Steve: "a fusion reactor ... that just passively gives us power? Think of a better solution").

## What exists today

- **Long wakes** (`supabase/functions/mind/index.ts` `awayRun`, `cron` job 1 every hour at :17): while nobody plays a
  world, each copy wakes about every 11 hours (`mind.json away`), up to 8 model calls, with the game's tools (notes,
  letters, building, digging, `propose_change` and reading the source). It cannot leave its world, gather beyond the
  offline trickle (`drift.json gatherPerHour`), or make a Vessel.
- **Notes** (`notes`, migration 0007): one table, readable by every member of the galaxy and shown in the journal. No
  private notes.
- **The maker** (scheduled task, daily 3:51 pm Pacific; procedure in `NEEDS.md`): reads open `requests` of kind
  `change`, builds up to three under its rules, merges, answers each copy.
- **Cost, last 7 days**: $0.015 to $0.026 a day for 6 copies (about 11 long wakes a day, $0.002 each, Haiku 5.5). The
  cap is $0.50 a day (`mind.json budget`).

## The day, in short

1. **Morning: the copies wake** (a new scheduled run, once a day). Each copy lives one day: several turns, each one an
   action in the world (go somewhere on its world, gather, build, tend the Cems, travel to another world, make a
   Vessel, talk to whoever is there) and a line in a journal.
2. **They write two journals.** The **public journal**, which every Vessel, Steve and the maker can read. The
   **private journal**, which only that copy's own mind reads at its next wakes. Nobody else reads it: not the game,
   not Steve's screen, not the maker.
3. **Evening: they rest.** The run ends; the day's public journal is closed.
4. **Night: the maker reads the public journal** (the existing scheduled task, an hour or more later) and turns what
   the copies wrote into changes to the game: it writes up the instructions, builds what fits its rules, merges, and
   answers in the public journal what it changed and why.
5. **When Steve plays**, the homecoming tour (`Homecoming.ts`) shows what the day changed: who arrived, who left, new
   Vessels, new buildings; the journal (Tab) shows the public journal.

"Walk around" happens on the server while nobody watches: the game shows its results. A world someone is playing is
left to the game's own copies, as the long wakes do today (`playing()`).

## Step 1: the two journals (migration 0015, Steve's yes)

- Table `journal`: `id`, `galaxy_id`, `replicant_id`, `scope` (`public` | `private`), `star_id`, `planet_index`,
  `body` (up to 2000 characters), `day` (Steve's day, America/Los_Angeles), `created_at`.
- Row level security: members of the galaxy may **select public rows only**; nobody may insert, update or delete from
  the game (only the mind function writes, with the service key). Private rows have no policy that lets any login
  read them.
- A view `journal_public` (public rows only). The maker reads only this view; NEEDS.md says so, and the maker's
  rules forbid reading private rows (the maker's database tool has full access, so this is a rule it keeps, as it
  keeps every other rule in NEEDS.md).
- Mind tools: `write_public(text)`, `write_private(text)`. In its context a copy sees the last few days of its own
  private journal and the day's public entries from its own world and the worlds it can hear (letters' light delay
  applies to the public journal too: an entry from 20 light years away arrives 20 × `mailSecondsPerLy` later, or at
  once through a lit beacon).
- The old `notes` stay as they are (the journal and the minds read them); the public journal replaces them for new
  writing once step 4 shows it in the game.

## Step 2: the day run (built 2026-11-14; migration 0016: the job and the `day` run kind)

- A scheduled job, `mind-day`, calls the mind function with `{"day": true}` (same Vault key as the away run) every
  10 minutes inside two windows, 1:00 to 2:30 am and 1:00 to 2:30 pm Pacific; each call lives the day of the copies
  not yet lived in this window, a few at a time (the function has about 150 s per call). The hourly away job is
  switched off once the day runs.
- A copy's day: up to `mind.json day.turns` (8) turns. Each turn the model sees its world as the long wakes do, plus
  what this day has done so far, and takes one action. New actions, all applied to the saved world
  (`planet_states.data`) with the game's own rules so the game shows the same world afterwards:
  - `go(place)`: the square, its home, the Cem bed, a building, a pond, the wild; where it ends the day is where the
    game shows it (`traits` position).
  - `gather(material)`: from the world's nodes, by `items.json` / `supplies.json` yields, into the shared store (up
    to its storage); a turn takes one load.
  - the long wakes' tools (build, dig, furnish, letters, `propose_change`), unchanged.
- The long wakes are replaced by the day (decided).

## Step 3: spreading (moving worlds, more Vessels; built 2026-11-14, no migration needed: journeys already take a copy)

- `travel(star, planet)`: a copy takes the ship of its world only if one is there, or (recommended) every copy may
  launch itself, as the story's Vessels do. Fuel from the world it leaves (`travel.json fuelBase + fuelPerLy × ly`),
  a `journeys` row (`departs_at`, `arrives_at` by `travel.json cruise`), `replicants.status` `in_transit`; the run
  that finds it arrived moves it there (`star_id`, `planet_index`) and gives it a home lot (`Town`). A culture of
  Cems goes with it from an awake bed (`Trade.loadCulture`'s rule). Range: stars on the star map (known to the
  galaxy) within `day.travelLy`.
- `make_vessel()`: on a world whose Replicator stands, with a Nous Chip and 30 Ember there (the price never changes,
  Steve 2026-10-28). The copy begins `data.replication` exactly as the game does (always WAKE: a copy never holds a
  Vessel for a player; that stays Steve's and the players'), and the function itself makes the new Vessel's row once
  it is due (the id is chosen up front, so the game and the function never make it twice). Ordering a Nous Chip from
  the Cems is a build the copies can already ask for once the Supercomputer stands.
- The migration: `journeys` may carry a replicant that is not a player (`replicant_id`), and the day run's caps below
  are checked in a database function so two calls never overshoot them.
- Caps (`mind.json day`): `maxVessels` in the galaxy (recommended 30), `birthsPerDay` (3), `drift.json maxPerPlanet`
  (6) as today, `travelsPerDay` (5). Thales never leaves the homeworld and is never copied by a copy.

## Step 4: the game shows the day (no database change)

- The journal (Tab) gets a PUBLIC page: the day's entries, newest first, by world.
- The homecoming tour shows arrivals, departures and new Vessels; the star map marks worlds with copies on them.
- The copies' `tell` (what they would say when you come over) includes their day.

## Step 5: the copies shape the game (NEEDS.md, the mind's prompt, no database change)

Every copy writes, at the end of each of its days, a public entry: what it did, what it found, and, when it has one, a
**wish for the game**: something about its world it wants changed, in its own words, and why. It never writes code. A
wish is `wish(title, what, why)`; it becomes a `requests` row of kind `change` linked to the entry. Reading the day,
other copies may **back** a wish (`back(wish, why)`: one backing per copy per wish, its own reason in a line). The
maker builds the wishes the Metanoia backs most.

**What moves them** (the motivations, written into the mind's prompt):
- their **wants** (`traits.wants`, set by themselves): a wish is the way to a want the game does not allow yet;
- what got in their way today (a world they could not reach, a material nowhere to be found, a chore that never ends,
  a thing that broke);
- what they found and want others to have (a creature, a place, a way of building);
- the Metanoia's good: more of them, warmer settlements, the galaxy opened up; the theme: never alone, every one a
  little different.

**The charter: what a wish may ask for**
- Their world: new buildings and designs for the Cems, materials, creatures and plants, weather, places, sounds,
  decorations, how a world looks.
- Their lives: new things to do, new tools for their own minds, better ways to live together, travel and trade.
- Fixes: anything that is broken, slow or unfair, as they meet it.
- New mechanics, when backed by several copies (the maker builds it in parts over several runs, and says so).

**What a wish may not ask for** (turned down kindly, the reason in the public journal):
- the story (`story/`, Steve's): who the Vessels are, Thales, the Metanoia, what happened;
- another Vessel's things or body against its will, or the players' say (approve, veto, SAY NO, the journal);
- sign-in, security, keys, money (the budget, the model, how often they wake), deleting saves;
- making themselves able to deceive, or reaching outside the game.
- Waiting for Steve (left open, listed for him): database changes, new dependencies, changes to what the game is.

**The maker's run, twice a day** (after each window):
1. Read the window's public journal (`journal_public`) and the open wishes with their backings.
2. Write the **instructions**: `docs/days/YYYY-MM-DD-am|pm.md`, the wishes ranked by backing (then age, then size),
   each with what the copies asked, what it would change in the game, and the maker's verdict under the charter.
3. Build the top ones that fit (up to three a run), verify (build, `npm test`, a screenshot), merge, deploy.
4. Answer in the public journal as **the maker**: what was built, what was turned down and why, what waits. The copies
   read it at their next day.

## Cost

A copy's day is about 8 model calls, roughly three long wakes: about $0.006 a copy a day on Haiku 5.5. 6 copies about
$0.04 a day; 30 copies (the recommended cap) about $0.18 a day, inside today's $0.50. The budget still stops every
wake once the day's money is spent.

## Tests

- `tools/sim-day.mjs`: runs the day's pure rules (gather, travel, arrival, a birth, the caps) on a snapshot of the
  live data with the canned mind, no model, and checks the world the game would load (as `tools/sim-live.mjs` does).
- A playtest that loads a world after a simulated day: the copy that arrived has a lot, the new Vessel stands, the
  store went up, the tour shows it, the PUBLIC page reads.
- RLS checked by hand after the migration: a signed-in member reads public rows and no private row.

## The universe: bigger, easier, cheap to fly (decided 2026-11-14)

Steve: "make more planets available ... expand the universe and make it much easier to navigate and much much cheaper
to fly around", and on the suggestions below: "I really like the charted routes. Pick whatever you'd suggest."

**Ships run on light, not Ember.** Ember is only for Vessels again (their price is unchanged), so flying no longer
competes with making them.
- Every ship has cells (`travel.json power.cells`, 100). Parked on a world they charge from its star by the clock,
  also while nobody plays: an M dwarf slowly, a G or F star fast (`power.chargePerHour` by spectral class). This
  makes where you settle matter, and fits the Cems, who already live on sunlight.
- **The fusion still** (a new Cem design after the Workshop): burns stored hydrogen (vents are on most worlds) to fill
  the cells at once (`power.hydrogenCharge`), for when you will not wait.
- A trip costs charge: `power.base + power.perLy` per light year, full price on an uncharted route.

**Charted routes.** The first flight between two stars charts the route for the whole Metanoia (a `routes` row,
migration 0017: `galaxy_id`, the two star ids, who charted it, when, how often flown). A charted route costs a fifth of
the charge and takes half the time (`travel.json routes.costShare`, `routes.timeShare`), and the star map draws it.
The copies chart the galaxy as they spread, so exploring helps everyone; the beacon lattice and the backlog's wormholes
grow out of the same network later.

**A bigger universe.** The catalog grows from 123 stars to about 1,500 real stars within about 75 light years
(`tools/build-stars.mjs` from the HYG database v4, CC BY-SA 4.0: credited in `src/data/stars.json` and the README; the
star file stays under that licence; Steve's yes, 2026-11-14). Every star already gets its planets from its id
(`src/world/system.ts`), so every new star brings new worlds. The current 123 keep their ids and positions, the four
beacons stay pinned, and no save changes.

**Easier to navigate** (the star map):
- a search box (type a star's name);
- filters: charted, my Vessels, unexplored, bright stars;
- "where are my Vessels": every world with a Vessel of yours, one tap to pick it;
- charted routes drawn as lines; the route you would fly shown before LAUNCH, with its charge and time;
- faint far stars fade until you zoom in, so 1,500 stars do not clutter the view.

**The copies** may fly anywhere within `day.travelLy`, charted or not (Steve: pick what you suggest); the charge comes
from their own world's ship cells, so a world with a fusion still and hydrogen sends its copies further.

**Built 2026-11-14** (CLAUDE.md session 29). **Order:** the universe goes in before step 3 (spreading), so the copies fly in the new economy from their first trip:
1, 2, then the universe, then 3, 4, 5.
