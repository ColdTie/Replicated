-- Planet deltas: nodes and doors merge per key; every other top-level key in p_data (structures, npcTick, ...)
-- replaces the stored value. Keeps adding planet state from needing a new migration each time.
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
      data = (s.data || (p_data - 'nodes' - 'doors')) || jsonb_build_object(
        'nodes', coalesce(s.data->'nodes', '{}'::jsonb) || coalesce(p_data->'nodes', '{}'::jsonb),
        'doors', coalesce(s.data->'doors', '{}'::jsonb) || coalesce(p_data->'doors', '{}'::jsonb)
      ),
      updated_at = now()
  where s.galaxy_id = p_galaxy and s.star_id = p_star and s.planet_index = p_index
  returning s.*;
$$;

revoke execute on function public.apply_planet_delta(uuid, text, smallint, int, jsonb) from public, anon;
grant execute on function public.apply_planet_delta(uuid, text, smallint, int, jsonb) to authenticated;
