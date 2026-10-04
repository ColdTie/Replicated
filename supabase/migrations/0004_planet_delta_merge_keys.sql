-- apply_planet_delta v2: besides merging per-node states, any other top-level keys in p_data
-- (structures, cache, tick, ...) replace the stored values. Still security invoker (RLS applies).
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
