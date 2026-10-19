-- The minds' heartbeat (session 15): one row per wake, ok or not, so a broken deploy shows up within the hour instead
-- of 30 hours later (it happened twice: sessions 9 and 12). The mind function logs every live, talk and away wake; the
-- journal says "the minds have been quiet since ..." when the latest wakes all failed, and the maker reads it first.
-- Rows older than 14 days are dropped as new ones come in. Written and read only through the two functions below.
create table public.mind_runs (
  id bigint generated always as identity primary key,
  galaxy_id uuid not null references public.galaxies(id) on delete cascade,
  replicant_id uuid references public.replicants(id) on delete set null,
  at timestamptz not null default now(),
  kind text not null check (kind in ('live', 'talk', 'away')),
  ok boolean not null,
  error text
);
create index mind_runs_galaxy_at on public.mind_runs (galaxy_id, at desc);
alter table public.mind_runs enable row level security;
create policy "members select" on public.mind_runs for select to authenticated using (private.is_galaxy_member(galaxy_id));

-- Logs one wake. The player's own client (live wakes) may log for its galaxy only; the scheduled run uses the service role.
create or replace function public.log_mind_run(p_galaxy uuid, p_replicant uuid, p_kind text, p_ok boolean, p_error text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and not private.is_galaxy_member(p_galaxy) then
    raise exception 'not a member of this galaxy';
  end if;
  insert into public.mind_runs (galaxy_id, replicant_id, kind, ok, error)
  values (p_galaxy, p_replicant, p_kind, p_ok, left(p_error, 500));
  delete from public.mind_runs where galaxy_id = p_galaxy and at < now() - interval '14 days';
end;
$$;

-- How the minds are doing: the last good wake, the last failure and how many wakes in a row have failed since.
create or replace function public.mind_health(p_galaxy uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    select r.at, r.ok, r.error from public.mind_runs r
    where r.galaxy_id = p_galaxy and (coalesce(auth.role(), '') = 'service_role' or private.is_galaxy_member(p_galaxy))
  ), last_ok as (select max(at) as at from mine where ok)
  select jsonb_build_object(
    'last_ok_at', (select at from last_ok),
    'failures_since_ok', (select count(*) from mine where not ok and at > coalesce((select at from last_ok), '-infinity')),
    'last_error', (select error from mine where not ok order by at desc limit 1),
    'last_error_at', (select max(at) from mine where not ok),
    'first_failure_at', (select min(at) from mine where not ok and at > coalesce((select at from last_ok), '-infinity'))
  );
$$;

revoke execute on function public.log_mind_run(uuid, uuid, text, boolean, text) from public, anon;
revoke execute on function public.mind_health(uuid) from public, anon;
grant execute on function public.log_mind_run(uuid, uuid, text, boolean, text) to authenticated, service_role;
grant execute on function public.mind_health(uuid) to authenticated, service_role;
