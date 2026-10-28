# One Metanoia: the plan (2026-10-28)

Steve's direction for making Vessels, joining and playing together. The story side is in `story/STORY.md` (Copying,
Vessel numbers, The memory, Joining, Names, One Metanoia, Bases, the Vessel menu). Step 1 is built; the rest is not.
Steps run in order; each ships on its own, verified (build, `npm test`, a playtest of its own, screenshots).

## Decided (Steve, 2026-10-28)

- Making a Vessel takes some difficulty: the end goal of the designs is a computer chip, the Nous Chip (after the
  Supercomputer), and every new Vessel needs one, its mind. Vessels can be built anywhere you have the supplies; the
  Cems make it faster, and the Replicator and the Cems are one system (Thales copied the tenth Vessel before the Cems
  woke). A first try, a homeworld-only "Vessel Printer" building, was not what Steve meant and was replaced.
- A Vessel's price is fixed: a Nous Chip and 30 Ember (`drift.json cost`). It never rises ("the scarcity should not
  change").
- Everyone shares one galaxy. Every new player is handed a Vessel by a current player.
- A login is four letters (public) and private numbers (8 digits), in place of email and password.
- Vessel numbers: Thales is 1, Steve 10, the next 11 and so on. A Vessel can be made long before it wakes; its number
  is given the moment it is awakened as a new Vessel of the Metanoia, and it is celebrated. Woken copies take numbers
  too.
- The beginning is a memory for a new player; then its Vessel wakes where its maker made its body.
- Names are easy to change.
- A Vessel menu on Tab (and a small button): how many Vessels you have and where, your name, chat with other Vessels.
- Everyone can see each other. Later: more bases on the homeworld, because there will be too many people for one.

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

## Step 2: letters, numbers and one galaxy (database change: Steve approves first)

- Migration: `profiles.user_id` (one login owns one Vessel), `replicants.number` (empty until awakened; unique),
  `replicants.callsign` (four letters A to Z; unique), the galaxy's next number (11). Numbers 1 to 9 stay with Thales
  and the eight before you. Steve's Vessel gets 10.
- An edge function, `vessels`, run with the service key:
  - `give`: the maker gives a held Vessel. Four letters the giver picks (the game offers a random set) and 8 random
    digits; it makes the login
    (the letters as a hidden internal address, the digits as its password), adds it to the galaxy and makes the
    profile that owns the Vessel. The digits are shown to the maker once.
  - `rekey`: a player changes their digits; a maker can issue new ones for a Vessel that has not woken yet.
- The sign-in screen asks for LETTERS and NUMBERS (large, easy on a phone); a small link keeps Steve's email sign-in.
  The profile picker goes away (one login, one Vessel).
- Security: digits are stored only by Supabase's auth, hashed. Wrong guesses are slowed by Supabase's sign-in rate
  limit. New sign-ups are closed in the Supabase settings, so a login only comes from a handover. Row rules tighten:
  today any member can change any row; after this a player changes only their own Vessel and profile, and shared
  things (planets, buildings) only through the existing database functions.
- The second login's galaxy (profiles Linda and Freya) is backed up and retired; they join by being handed Vessels.
- Steve's part: approve the migration, switch off new sign-ups (one setting). His letters: COLD.

## Step 3: the memory and the awakening

- A new player's first login plays the memory: the beginning (`Tutorial.ts`, as it is) on a private copy of the
  homeworld at its founding and on Gliese 12 b, saved only on that device (the `?local` store), so nothing in the
  shared galaxy moves. It can be skipped. It looks and sounds remembered: a soft gold wash, softer edges, quieter sound.
- When the stars open in the memory, it fades, and the Vessel wakes for real where its maker made its body, beside
  its maker if they are there, grown, with the stars open.
- The awakening: the next number is taken in one database call. A title card ("VESSEL 11"), the town lights up, the
  copies gather, a chord; then the new player names itself ("WHO ARE YOU?"); every other player is told ("VESSEL 11
  HAS WOKEN") in the menu's chat.
- A woken copy is awakened too: it takes the next number at its birth, with a smaller celebration in its town.
- Tests: a new `playtest-memory` (the memory writes nothing to the galaxy, the waking where the maker is, the number,
  the celebration, a reload).

## Step 4: the Vessel menu (Tab, or a small button by the speaker)

- Tab opens it in place of the journal; the journal becomes one of its pages (I still opens it). Opening it pauses
  your play: your Vessel stands still and is safe while the shared world goes on.
- VESSELS: how many you have (the Vessels you made: woken, held, and those awakened by a player) and where each is;
  then every Vessel of the Metanoia by number, with its name, letters and world, and who is playing now.
- NAME: change your name at any time (`GameStore.renameSelf`); your number and letters stay.
- CHAT: write to any Vessel. A message travels at light speed on the travel scale (2 s per light year; instant on the
  same world); talking faster than light comes later with a SCUT communication device. Built on the `messages` table
  (since migration 0001: `sent_at`, `arrives_at`), with new
  messages shown live through a Supabase live channel (part of supabase-js: no new dependency). Players only for now:
  the copies have their talk box and letters, and their minds are paused.
- JOURNAL: what the copies here remember, as today.
- Keyboard, mouse, touch and gamepad. Tests: a new `playtest-menu`.

## Step 5: seeing each other

- One live channel per world: each player sends where they are, which way they face and what they are doing about
  eight times a second; the others draw them (body, name, number), smoothed. They walk, dash and swing; nobody can
  hurt anyone.
- The copies: today each player's game runs its town's copies by itself, so two players in one town would see them in
  different places and double their work. The first player on a world runs its copies and sends them; the others see
  them; when that player leaves, the next one takes over.
- The store and the buildings already sync through the database (every 4 s); live print progress comes through the
  channel.
- Tests: two headless browsers on one world.

## Later: more bases on the homeworld

A landing picks a base; a new base opens when one fills. Planned when the player count calls for it.

## Steve's answers (2026-10-28)

1. The memory is the whole beginning (the printer, the trip to Gliese 12 b, the Cems, three designs), with a skip.
2. The name is chosen at the real waking, with the number (not in the memory).
3. Chat travels at light speed on the travel scale (instant on the same world). Talking faster than light comes later:
   a SCUT communication device.
4. Steve's letters are COLD. A new player's letters are picked by the giver, with the game offering a random set.
5. Linda and Freya's galaxy is backed up and retired; Steve hands them Vessels once his printer stands.
