-- The two journals (docs/plan-daily-life.md step 1, Steve's yes 2026-11-14).
-- public: the Metanoia's shared journal; every member of the galaxy, every Vessel's mind and the maker read it.
-- private: one copy's own journal; only that copy's mind reads it (the mind function, with the service key).
-- Nobody writes from the game: only the mind function does, with the service key. No login may read a private row.
-- The maker reads the public journal through journal_public and never selects private rows (NEEDS.md).

create table public.journal (
  id uuid primary key default gen_random_uuid(),
  galaxy_id uuid not null references public.galaxies(id) on delete cascade,
  replicant_id uuid references public.replicants(id) on delete cascade,  -- null: the maker's entries
  author text not null default '',
  scope text not null check (scope in ('public', 'private')),
  star_id text,
  planet_index smallint,
  body text not null check (char_length(body) between 1 and 2000),
  day date not null default ((now() at time zone 'America/Los_Angeles')::date),
  created_at timestamptz not null default now(),
  check (replicant_id is not null or scope = 'public')
);
create index journal_public_idx on public.journal(galaxy_id, created_at desc) where scope = 'public';
create index journal_own_idx on public.journal(replicant_id, scope, created_at desc);

alter table public.journal enable row level security;
revoke all on public.journal from anon;
revoke insert, update, delete on public.journal from authenticated;
grant select on public.journal to authenticated;
create policy "members read the public journal" on public.journal for select to authenticated
  using (scope = 'public' and private.is_galaxy_member(galaxy_id));

create view public.journal_public with (security_invoker = true) as
  select id, galaxy_id, replicant_id, author, star_id, planet_index, body, day, created_at
  from public.journal where scope = 'public';
revoke all on public.journal_public from anon;
grant select on public.journal_public to authenticated;
