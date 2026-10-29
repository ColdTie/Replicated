# One Metanoia: the plan (2026-10-28, revised 2026-10-29)

Steve's direction for making Vessels, joining and playing together. The story side is in `story/STORY.md` (Copying,
The memory, Joining, Names, One Metanoia, Bases, the Vessel menu). Step 1 is built; the rest is not.
Steps run in order; each ships on its own, verified (build, `npm test`, a playtest of its own, screenshots).

## Decided (Steve, 2026-10-28 and 2026-10-29)

- Making a Vessel takes some difficulty: the end goal of the designs is a computer chip, the Nous Chip (after the
  Supercomputer), and every new Vessel needs one, its mind. Vessels can be built anywhere you have the supplies; the
  Cems make it faster, and the Replicator and the Cems are one system (Thales copied the tenth Vessel before the Cems
  woke). A first try, a homeworld-only "Vessel Printer" building, was not what Steve meant and was replaced.
- A Vessel's price is fixed: a Nous Chip and 30 Ember (`drift.json cost`). It never rises ("the scarcity should not
  change").
- Everyone shares one galaxy. Every new player is handed a Vessel by a current player.
- Dropped (2026-10-29): the login of four letters and private numbers, and Vessel numbers (Thales 1, Steve 10, the
  next 11).
- Joining is by invite link (2026-10-29): handing over a held Vessel makes a one-time link; the new person opens it and
  signs in with their own email (a sign-in link, no password). One login per person, one Vessel per login.
- The minds are back on (2026-10-29), so a copy born WAKE becomes itself at its first wake (see Now).
- The beginning is a memory for a new player; then its Vessel wakes where its maker made its body.
- Names are easy to change.
- A Vessel menu on Tab (and a small button): how many Vessels you have and where, your name, chat with other Vessels.
- Everyone can see each other. Later: more bases on the homeworld, because there will be too many people for one.
- Order (2026-10-29): joining and the memory first (Steve is one Nous Chip away from handing Vessels to Linda and
  Freya), then the Vessel menu, then seeing each other.

## Now (2026-10-29): the minds back on

- Migration `0014_mind_runs.sql` applied (the minds' heartbeat). `mind.json paused` false, the kit rebuilt, the `mind`
  function redeployed, the hourly away run (`cron` job 1) on again. The budget stays $0.50 a day on Haiku 5.5.
- Steve's four blank copies (all called "Steve II": one on LHS 1140 b, one on Gliese 12 b, two at Fomalhaut, made
  before the Nous Chip) become themselves at their first wake: a live wake when Steve lands there, or a long wake
  while he is away (about every 11 hours per copy).

## Step 1: the Nous Chip and the Replicator with the Cems (no database change) — built 2026-10-28 (CLAUDE.md session 24)

- `designs.json nouschip` (`place: "bed"`): the last of the Cems' designs, opened by the Supercomputer. The Cems print
  it on their bed; finished, it lies there until someone walks onto it, then it is carried (`traits.chips`;
  `src/entities/Chips.ts`, a counter at the top).
- The Replicator, on any world (its pad as before): a copy takes one chip and 30 Ember. WAKE or HOLD as before; the
  maker is scanned and free; the body prints beside the Replicator by the clock, also while nobody plays
  (`src/entities/Replication.ts`, `planet_states.data.replication`): 40 s with the world's Cems awake (quicker with
  their strain), 10 minutes without them. Its row's id is chosen when it begins, so it is made once.
- Thales no longer counts toward a world's six copies; `travel.json needCopy` is off (every copy needs a chip, so most
  worlds would have none to leave behind).
- Tests: the new `playtest-replicate`; `playtest`, `-become`, `-homeworld` copy with a chip and a short print.

## Step 2: joining by invite link (database change: Steve approves first)

Replaces the letters-and-numbers step (planned 2026-10-28, dropped 2026-10-29 before anything was applied).

**How it plays**
1. The maker HOLDs a Vessel at the Replicator, as today. In the journal (later the Vessel menu) the held Vessel has
   GIVE. GIVE makes a one-time link (`https://coldtie.github.io/Replicated/?join=<code>`) and shows it with COPY and
   SHARE (a phone's share sheet). The maker sends it however they like. Until it is used, TAKE BACK cancels it; GIVE
   again makes a new one. Today's GIVE (a new profile on the maker's own login, at once) goes.
2. The new person opens the link. The home screen shows the held Vessel, dimmed, and who made it, and asks for their
   email. SEND LINK: Supabase emails them a sign-in link (no password).
3. They tap the link in the email and come back signed in. One database call redeems the code: they join the galaxy,
   a profile is made for their login, and the Vessel becomes theirs. Then the memory and the awakening (Step 3).
4. Later sign-ins: their email, then the emailed link, on any device. Steve keeps his email and password sign-in.

**Database (migration `0015_invites.sql`)**
- `invites`: `code` (random, 24 characters, the primary key), `galaxy_id`, `replicant_id` (the held Vessel; one open
  code per Vessel), `made_by` (the maker's Vessel), `created_at`, `used_at`, `used_by` (the login). No table access
  from the game; only these functions (security definer):
  - `make_invite(vessel)`: a member, for a held Vessel without a player in their own galaxy; replaces any open code for
    it; returns the code.
  - `cancel_invite(vessel)`: takes back an open code.
  - `peek_invite(code)`: allowed before sign-in; says only whether the code is open, the Vessel's name and look, and the
    maker's name, for the landing screen.
  - `redeem_invite(code)`: signed in; one use; refused if this login already has a Vessel; adds the login to the
    galaxy, makes its profile (`user_id` set), gives it the Vessel (status active, held false, unnamed, `handedBy`).
- `profiles.user_id` (unique): one login, one Vessel. Steve's profile gets his login.
- `ensure_family_galaxy()` stops making new galaxies: a login without a galaxy is told a Vessel must be handed to it.
  New sign-ups stay open (the emailed link makes the login), but a login only gets in through a code.
- Row rules: today any member can change any row. After this a player's own profile and Vessel can be changed only by
  its login; copies, planets, journeys and the rest stay shared by every member. Everyone can still read everything
  (seeing each other needs it). `merge_replicant_traits` runs under these rules already (security invoker).
- Linda and Freya's galaxy (2 profiles, 1 planet, no Vessels) is backed up to `backup_20261029` and removed. Their
  old login then waits for a link like any other.

**Game**
- `src/net/store.ts`: `makeInvite`, `cancelInvite`, `peekInvite`, `redeemInvite`, `sendSignInLink` (`signInWithOtp`,
  back to the same page with its `?join=` code); `listProfiles` only the login's own. `LocalStore` plays the same flow
  on one device, so the playtests can run it.
- `HomeScene`: the `?join=` landing; sign-in by email link first, "use a password" below it; the waiting screen; one
  profile goes straight in (no picker).
- The journal: GIVE / COPY / SHARE / TAKE BACK on a held Vessel.

**Steve's part**
1. Approve the migration above.
2. In Supabase: Authentication, URL Configuration: `https://coldtie.github.io/Replicated/` is in Redirect URLs (it
   likely is already). The built-in mailer sends only a few emails an hour: enough for a family.
3. Linda and Freya each need their own email address (one login per person).

**Tests**: a new `playtest-join` (on `LocalStore`: hold a Vessel; GIVE makes a link; TAKE BACK and a new one; opening it
on a fresh device shows the Vessel and its maker; redeeming it loads the new player in that Vessel where it was made; a
used code is refused). The database functions and row rules are tried as two logins inside a transaction that is
rolled back, before the migration is applied.

## Step 3: the memory and the awakening

- A new player's first login plays the memory: the beginning (`Tutorial.ts`, as it is) on a private copy of the
  homeworld at its founding and on Gliese 12 b, saved only on that device (its own `LocalStore` key), so nothing in the
  shared galaxy moves. A reload goes on where it was. SKIP (top right) ends it at any time. It looks and sounds
  remembered: a soft gold wash, a wider, softer vignette, quieter sound with the high end taken off.
- When the stars open in the memory (or on SKIP), it fades to gold, and the Vessel wakes for real where its maker made
  its body (today's `playHeldWake`), beside its maker if they are there, fully grown, with the stars open
  (`traits.tutorial` step `open`, grown 5).
- The awakening: the town's lights flare, the copies on that world walk over, a chord; then the new player names
  itself ("WHO ARE YOU?", `askName`); a title card with its name. Every other player sees a notice on their next
  landing ("<NAME> HAS WOKEN ON <WORLD>"), and in the menu's chat once Step 4 exists.
- A woken copy is celebrated too when it steps out of the Replicator, smaller: its town's copies gather, a chord.
- Tests: a new `playtest-memory` (the memory writes nothing to the galaxy, SKIP, a reload mid-memory, the waking where
  the maker is, grown, the naming, the celebration).

## Step 4: the Vessel menu (Tab, or a small button by the speaker)

- Tab opens it in place of the journal; the journal becomes one of its pages (I still opens it). Opening it pauses
  your play: your Vessel stands still and is safe while the shared world goes on.
- VESSELS: how many you have (the Vessels you made: woken, held, and those handed to a player) and where each is;
  then every Vessel of the Metanoia, with its name and world, and who is playing now.
- NAME: change your name at any time (`GameStore.renameSelf`).
- CHAT: write to any Vessel. A message travels at light speed on the travel scale (2 s per light year; instant on the
  same world); talking faster than light comes later with a SCUT communication device. Built on the `messages` table
  (since migration 0001: `sent_at`, `arrives_at`), with new messages shown live through a Supabase live channel (part
  of supabase-js: no new dependency). Players only for now: the copies have their talk box and letters.
- JOURNAL: what the copies here remember, as today.
- Keyboard, mouse, touch and gamepad. Tests: a new `playtest-menu`.

## Step 5: seeing each other

- One live channel per world: each player sends where they are, which way they face and what they are doing about
  eight times a second; the others draw them (body, name), smoothed. They walk, dash and swing; nobody can
  hurt anyone.
- The copies: today each player's game runs its town's copies by itself, so two players in one town would see them in
  different places and double their work. The first player on a world runs its copies and sends them; the others see
  them; when that player leaves, the next one takes over.
- The store and the buildings already sync through the database (every 4 s); live print progress comes through the
  channel.
- Tests: two headless browsers on one world.

## Later: more bases on the homeworld

A landing picks a base; a new base opens when one fills. Planned when the player count calls for it.

## Steve's answers

2026-10-28:
1. The memory is the whole beginning (the printer, the trip to Gliese 12 b, the Cems, three designs), with a skip.
2. The name is chosen at the real waking (not in the memory).
3. Chat travels at light speed on the travel scale (instant on the same world). Talking faster than light comes later:
   a SCUT communication device.
4. (Dropped 2026-10-29 with the letters-and-numbers login: Steve's letters COLD, a giver picking a new player's.)
5. Linda and Freya's galaxy is backed up and retired; Steve hands them Vessels once he has a Nous Chip to make one.

2026-10-29:
6. A new player signs in by invite link with their own email (not a shared login, not Google).
7. The minds back on, rather than copies becoming themselves by the game's own rules.
8. Joining and the memory before the Vessel menu.
