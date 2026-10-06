-- HISTORY ONLY. Applied to the live project on 2026-10-04 (as "planet_delta_merge_keys") by a parallel branch that
-- was later dropped; 0004_planet_delta_doors and 0005_planet_delta_generic replaced this function afterwards, so it
-- has no effect today. Kept so this folder matches the database's migration history. Do not re-apply.
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
        s.data || (p_data - 'nodes'),
        '{nodes}',
        coalesce(s.data->'nodes', '{}'::jsonb) || coalesce(p_data->'nodes', '{}'::jsonb)
      ),
      updated_at = now()
  where s.galaxy_id = p_galaxy and s.star_id = p_star and s.planet_index = p_index
  returning s.*;
$$;
