-- A copy's needs, weariness, sleep and gifts are written by whichever game is open; writing the whole traits object
-- from a game that loaded before a body, voice or name changed would undo it. This merges only the given keys
-- (and the position, when given) into the row. security invoker: row level security keeps it inside the galaxy.
create or replace function public.merge_replicant_traits(p_id uuid, p_traits jsonb, p_pos_x int default null, p_pos_y int default null)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.replicants r
  set traits = coalesce(r.traits, '{}'::jsonb) || coalesce(p_traits, '{}'::jsonb),
      pos_x = coalesce(p_pos_x, r.pos_x),
      pos_y = coalesce(p_pos_y, r.pos_y),
      updated_at = now()
  where r.id = p_id;
$$;

grant execute on function public.merge_replicant_traits(uuid, jsonb, int, int) to authenticated;
