-- Minds for the copies (pivot 2026-10-08): each copy keeps notes, writes letters to other replicants
-- (messages, light-speed delay via arrives_at) and may ask the player for things. Ticks are run by the
-- "mind" Edge Function with the player's own JWT, so RLS scopes everything to the galaxy as usual.

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  galaxy_id uuid not null references public.galaxies(id) on delete cascade,
  replicant_id uuid not null references public.replicants(id) on delete cascade,
  body text not null check (char_length(body) <= 400),
  created_at timestamptz not null default now()
);
create index notes_replicant_idx on public.notes(replicant_id, created_at desc);
create index notes_galaxy_idx on public.notes(galaxy_id);

create table public.requests (
  id uuid primary key default gen_random_uuid(),
  galaxy_id uuid not null references public.galaxies(id) on delete cascade,
  replicant_id uuid not null references public.replicants(id) on delete cascade,
  star_id text not null,
  planet_index smallint not null,
  kind text not null check (kind in ('lamp', 'garden', 'hut', 'flag', 'totem', 'sign', 'name', 'other')),
  detail text not null default '' check (char_length(detail) <= 300),
  status text not null default 'open' check (status in ('open', 'done', 'dropped')),
  created_at timestamptz not null default now(),
  done_at timestamptz
);
create index requests_replicant_idx on public.requests(replicant_id, status);
create index requests_galaxy_idx on public.requests(galaxy_id);

alter table public.messages add column read_at timestamptz;
alter table public.replicants add column last_tick_at timestamptz;

alter table public.notes enable row level security;
alter table public.requests enable row level security;

do $$
declare t text;
begin
  foreach t in array array['notes', 'requests'] loop
    execute format('create policy "members select" on public.%I for select to authenticated using (private.is_galaxy_member(galaxy_id))', t);
    execute format('create policy "members insert" on public.%I for insert to authenticated with check (private.is_galaxy_member(galaxy_id))', t);
    execute format('create policy "members update" on public.%I for update to authenticated using (private.is_galaxy_member(galaxy_id)) with check (private.is_galaxy_member(galaxy_id))', t);
    execute format('create policy "members delete" on public.%I for delete to authenticated using (private.is_galaxy_member(galaxy_id))', t);
  end loop;
end $$;
