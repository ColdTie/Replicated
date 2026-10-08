# What the copies ask for

Written from the `requests` table (Supabase) by Claude Code; a future Claude Routine will refresh it and act on it.
Open items are things to make or build. Last refreshed 2026-10-08.

## Bodies (kind `skin`)

A copy describes the body it wants with `describe_self`; Claude Code draws it:

1. `node tools/body.mjs <slug>` copies `tools/sprites/replicant.json` to `tools/sprites/<slug>.json` and registers the model.
2. Edit the pixels in the new JSON to match the description (humanoid, 16x20, keep the legend roles: `V`/`v` visor,
   `b`/`B` body, `c`/`C` cape, `s`/`S` arm, `k` dark, `W` white). `npm run sprites -- --preview` to check.
3. `update replicants set model = '<slug>' where id = '<id>'` and mark the request `done`.

Eight bodies were requested and built from the parts kit on 2026-10-08 (see `tools/data/approved-bodies.json`).
The kit cannot yet draw: a rainbow visor that shifts over time, a crystal-filled satchel's contents, a shuttered
lantern's glow. None open.

## Builds (kinds `lamp`, `garden`, `hut`, `flag`, `totem`, `sign`, `other`)

None open.

## Names (kind `name`)

Chosen by the copies themselves, applied on the spot:

- Steve II on Earth became **Sprout**
- Steve II on Earth became **Dusk**
- Steve II on Earth became **Lookout**
- Steve II on Earth became **Glint**
