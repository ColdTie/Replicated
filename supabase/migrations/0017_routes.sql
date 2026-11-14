-- Charted routes (docs/plan-daily-life.md, the universe; Steve's yes 2026-11-14): the first flight between two stars
-- charts the route for the whole Metanoia; later flights count. A charted route costs a fifth of a ship's charge and
-- takes half the time (src/data/travel.json routes). One row per pair of stars, a < b. Members read their galaxy's
-- routes; only chart_route writes (a member of the galaxy, or the mind function with the service key for the copies).
create table public.routes (
  galaxy_id uuid not null references public.galaxies(id) on delete cascade,
  a text not null,
  b text not null,
  charted_by uuid references public.replicants(id) on delete set null,
  charted_at timestamptz not null default now(),
  flights integer not null default 1,
  primary key (galaxy_id, a, b),
  check (a < b)
);
alter table public.routes enable row level security;
revoke all on public.routes from anon;
revoke insert, update, delete on public.routes from authenticated;
grant select on public.routes to authenticated;
create policy "members read routes" on public.routes for select to authenticated using (private.is_galaxy_member(galaxy_id));

create or replace function public.chart_route(p_galaxy uuid, p_a text, p_b text, p_by uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare lo text := least(p_a, p_b); hi text := greatest(p_a, p_b);
begin
  if coalesce(auth.role(), '') <> 'service_role' and not private.is_galaxy_member(p_galaxy) then
    raise exception 'not a member of this galaxy';
  end if;
  if lo = hi or length(lo) > 64 or length(hi) > 64 then return; end if;
  insert into public.routes (galaxy_id, a, b, charted_by) values (p_galaxy, lo, hi, p_by)
  on conflict (galaxy_id, a, b) do update set flights = public.routes.flights + 1;
end;
$$;
revoke execute on function public.chart_route(uuid, text, text, uuid) from public, anon;
grant execute on function public.chart_route(uuid, text, text, uuid) to authenticated, service_role;
