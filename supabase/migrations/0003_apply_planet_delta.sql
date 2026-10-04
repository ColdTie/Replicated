-- Atomic planet update used by the game: add to the shared ember pool (never below zero), merge
-- per-node states, and replace the structure list when one is sent. Runs as the caller, so RLS
-- still limits it to the caller's galaxy.
create or replace function public.apply_planet_delta(
  p_galaxy uuid, p_star text, p_index smallint, p_embers int, p_data jsonb
)
returns setof public.planet_states
language sql
security invoker
set search_path = ''
as $$
  update public.planet_states s
  set embers = greatest(0, s.embers + p_embers),
      data = jsonb_set(
        case when p_data ? 'structures' then jsonb_set(s.data, '{structures}', p_data->'structures') else s.data end,
        '{nodes}',
        coalesce(s.data->'nodes', '{}'::jsonb) || coalesce(p_data->'nodes', '{}'::jsonb)
      ),
      updated_at = now()
  where s.galaxy_id = p_galaxy and s.star_id = p_star and s.planet_index = p_index
  returning s.*;
$$;

revoke execute on function public.apply_planet_delta(uuid, text, smallint, int, jsonb) from public, anon;
grant execute on function public.apply_planet_delta(uuid, text, smallint, int, jsonb) to authenticated;
