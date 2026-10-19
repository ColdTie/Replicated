-- What the minds cost, per galaxy and day (Steve's day: America/Los_Angeles), so the mind function can hold them to a
-- daily budget (src/data/mind.json budget, session 14b). The function adds each wake's cost from the API's token
-- counts and checks the total before it wakes anyone. Written and read only through the two functions below.
create table public.mind_spend (
  galaxy_id uuid not null references public.galaxies(id) on delete cascade,
  day date not null,
  usd numeric(10, 5) not null default 0,
  wakes integer not null default 0,
  primary key (galaxy_id, day)
);
alter table public.mind_spend enable row level security;
create policy "members select" on public.mind_spend for select to authenticated using (private.is_galaxy_member(galaxy_id));

-- Adds one wake's cost to today's total and returns the new total. The player's own client (live wakes) may add to
-- its galaxy only; the scheduled run uses the service role.
create or replace function public.add_mind_spend(p_galaxy uuid, p_usd numeric)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare total numeric;
begin
  if coalesce(auth.role(), '') <> 'service_role' and not private.is_galaxy_member(p_galaxy) then
    raise exception 'not a member of this galaxy';
  end if;
  insert into public.mind_spend as s (galaxy_id, day, usd, wakes)
  values (p_galaxy, (now() at time zone 'America/Los_Angeles')::date, greatest(coalesce(p_usd, 0), 0), 1)
  on conflict (galaxy_id, day) do update set usd = s.usd + excluded.usd, wakes = s.wakes + 1
  returning s.usd into total;
  return total;
end;
$$;

-- Today's total (0 when nothing was spent yet).
create or replace function public.mind_spend_today(p_galaxy uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select s.usd from public.mind_spend s
    where s.galaxy_id = p_galaxy and s.day = (now() at time zone 'America/Los_Angeles')::date
      and (coalesce(auth.role(), '') = 'service_role' or private.is_galaxy_member(p_galaxy))), 0);
$$;

revoke execute on function public.add_mind_spend(uuid, numeric) from public, anon;
revoke execute on function public.mind_spend_today(uuid) from public, anon;
grant execute on function public.add_mind_spend(uuid, numeric) to authenticated, service_role;
grant execute on function public.mind_spend_today(uuid) to authenticated, service_role;
