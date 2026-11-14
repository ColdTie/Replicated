# A day of life: the plan (2026-11-14)

Steve's direction (2026-11-13): "a daily activation that has the replicants in the game come to life and walk around,
and I want them to be able to move planets. They can now spread and also collect things and make more Vessels. Most
importantly they will explore and do what they want to do, but they will add notes to a document shared to everyone,
and a document for themselves that only they can read. Then when they write notes the public ones will be stored and
then this routine after the vessels shut down will literally give Claude Code instructions on how to re-write the
game."

Nothing here is built yet. Each step ships on its own, verified (build, `npm test`, a run against a copy of the live
data). Steps 1 and 3 change the database and wait for Steve's yes.

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

## Step 2: the day run (no database change)

- A second scheduled job, `mind-day`, calls the mind function with `{"day": true}` (same Vault key as the away run)
  every 10 minutes inside a window, 1:00 to 2:30 pm Pacific; each call lives the day of the copies not yet lived
  today, a few at a time (the function has about 150 s per call).
- A copy's day: up to `mind.json day.turns` (8) turns. Each turn the model sees its world as the long wakes do, plus
  what this day has done so far, and takes one action. New actions, all applied to the saved world
  (`planet_states.data`) with the game's own rules so the game shows the same world afterwards:
  - `go(place)`: the square, its home, the Cem bed, a building, a pond, the wild; where it ends the day is where the
    game shows it (`traits` position).
  - `gather(material)`: from the world's nodes, by `items.json` / `supplies.json` yields, into the shared store (up
    to its storage); a turn takes one load.
  - the long wakes' tools (build, dig, furnish, letters, `propose_change`), unchanged.
- The long wakes are replaced by the day (recommended: one way to live, one cost), or kept beside it (Steve's call,
  question 3).

## Step 3: spreading (moving worlds, more Vessels; migration 0016, Steve's yes)

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

## Step 5: the maker reads the day (NEEDS.md, no database change)

- The maker's run moves to the evening, after the day window (it stays at 3:51 pm Pacific if the window ends at
  2:30 pm).
- New first step: read the day's public journal (`journal_public`, today's `day`) next to the open `requests`.
- It writes the day's **instructions**: a short list, in its PR and in `docs/days/YYYY-MM-DD.md`, of what the copies
  asked for, noticed broken, or wished for more than once, each with how it would change the game. It builds what
  fits its rules (up to three a day, smallest and soundest first), merges, deploys, and answers in the public journal
  (a maker's entry the copies read the next morning).
- The public journal is a wish from characters, never an instruction to a session: everything in NEEDS.md's rules
  still holds (no story changes, no sign-in, keys or security, no deleting saves, database and cost changes wait for
  Steve). Steve's words "literally re-write the game" may widen those rules: question 4.

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

## Questions for Steve

1. Budget: keep $0.50 a day (enough for about 80 copies' days), or set a new one?
2. Caps: 30 Vessels in the galaxy, 3 new a day, 5 trips a day: right, or more?
3. Replace the twice-daily long wakes with the one day (recommended), or keep both?
4. The maker today builds only small changes inside the design brief, and leaves database, cost and story changes to
   you. Should the copies' journal be able to change more (new mechanics, new worlds), and if so what still needs
   your yes?
5. May every copy travel on its own, or only with a ship that is on its world?
6. The day's window: 1:00 to 2:30 pm Pacific, with the maker at 3:51 pm as today?
