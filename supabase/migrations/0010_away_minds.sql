-- Away wakes: while nobody plays, the mind Edge Function wakes the copies on its own (hourly schedule below, a few
-- copies per run, each about once a day). What a copy decides about itself, its notes, letters and requests are
-- written as usual; what needs the game to happen (a room planned, a furnishing, a building, a tree cut, its song)
-- is queued on its planet in data.awayQueue, and the game takes the queue when the original next lands there.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Called by the function with the service role only.
create or replace function public.push_mind_queue(p_galaxy uuid, p_star text, p_index smallint, p_items jsonb)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.planet_states s
  set data = jsonb_set(s.data, '{awayQueue}', coalesce(s.data->'awayQueue', '[]'::jsonb) || coalesce(p_items, '[]'::jsonb)),
      updated_at = now()
  where s.galaxy_id = p_galaxy and s.star_id = p_star and s.planet_index = p_index;
$$;
revoke execute on function public.push_mind_queue(uuid, text, smallint, jsonb) from public, anon, authenticated;
grant execute on function public.push_mind_queue(uuid, text, smallint, jsonb) to service_role;

-- The game takes (returns and clears) the queue in one step, inside its own galaxy (row level security applies).
create or replace function public.take_mind_queue(p_galaxy uuid, p_star text, p_index smallint)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare q jsonb;
begin
  select s.data->'awayQueue' into q from public.planet_states s
  where s.galaxy_id = p_galaxy and s.star_id = p_star and s.planet_index = p_index
  for update;
  if q is not null then
    update public.planet_states s set data = s.data - 'awayQueue'
    where s.galaxy_id = p_galaxy and s.star_id = p_star and s.planet_index = p_index;
  end if;
  return coalesce(q, '[]'::jsonb);
end;
$$;
revoke execute on function public.take_mind_queue(uuid, text, smallint) from public, anon;
grant execute on function public.take_mind_queue(uuid, text, smallint) to authenticated;

-- The hourly run. Two Vault secrets (created by hand, never in this file): mind_away_key (the function checks it
-- with check_away_key, migration 0011) and mind_anon_key (the project's public anon key, for the functions gateway).
select cron.schedule(
  'mind-away-wakes',
  '17 * * * *',
  $$
  select net.http_post(
    url := 'https://vgoijybibhopfichyirj.supabase.co/functions/v1/mind',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'mind_anon_key'),
      'x-away-key', (select decrypted_secret from vault.decrypted_secrets where name = 'mind_away_key')
    ),
    body := '{"away": true}'::jsonb,
    timeout_milliseconds := 140000
  );
  $$
);
