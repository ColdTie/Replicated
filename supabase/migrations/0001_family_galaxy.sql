-- Family galaxy schema. One auth user (the family login) belongs to one galaxy; every game row
-- carries galaxy_id so more families can get their own galaxy later. Row level security limits
-- every table to members of that galaxy.

create table public.galaxies (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Family Galaxy',
  created_at timestamptz not null default now()
);

create table public.galaxy_members (
  galaxy_id uuid not null references public.galaxies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (galaxy_id, user_id)
);
create index galaxy_members_user_idx on public.galaxy_members(user_id);

-- Family members picked on the "tap your face" screen
create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  galaxy_id uuid not null references public.galaxies(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 24),
  kid_mode boolean not null default false,
  feature_color smallint not null default 10,  -- Endesga 32 palette index for the visor
  sort smallint not null default 0,
  created_at timestamptz not null default now()
);
create index profiles_galaxy_idx on public.profiles(galaxy_id);

-- Every replicant: player-controlled (profile_id set) or NPC running a planet (profile_id null)
create table public.replicants (
  id uuid primary key default gen_random_uuid(),
  galaxy_id uuid not null references public.galaxies(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  parent_id uuid references public.replicants(id) on delete set null,
  generation int not null default 0,
  name text not null,
  model text not null default 'replicant',
  traits jsonb not null default '{}',        -- feature color, drift mutations
  stats jsonb not null default '{}',
  star_id text not null default 'sol',
  planet_index smallint not null default 3,  -- Earth is Sol's 3rd planet
  pos_x real,
  pos_y real,
  status text not null default 'active' check (status in ('active', 'npc', 'in_transit')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index replicants_galaxy_idx on public.replicants(galaxy_id);
create index replicants_profile_idx on public.replicants(profile_id);
create index replicants_parent_idx on public.replicants(parent_id);

-- Per-planet saved state: shared base resources, structures, depleted nodes
create table public.planet_states (
  galaxy_id uuid not null references public.galaxies(id) on delete cascade,
  star_id text not null,
  planet_index smallint not null,
  seed int not null,
  embers int not null default 0 check (embers >= 0),
  data jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (galaxy_id, star_id, planet_index)
);

-- Phase 2+: real-time journeys between stars
create table public.journeys (
  id uuid primary key default gen_random_uuid(),
  galaxy_id uuid not null references public.galaxies(id) on delete cascade,
  replicant_id uuid not null references public.replicants(id) on delete cascade,
  from_star text not null,
  to_star text not null,
  departs_at timestamptz not null default now(),
  arrives_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index journeys_galaxy_idx on public.journeys(galaxy_id);
create index journeys_replicant_idx on public.journeys(replicant_id);

-- Later: stars the family has found
create table public.discovered_stars (
  galaxy_id uuid not null references public.galaxies(id) on delete cascade,
  star_id text not null,
  discovered_by uuid references public.replicants(id) on delete set null,
  discovered_at timestamptz not null default now(),
  primary key (galaxy_id, star_id)
);
create index discovered_stars_by_idx on public.discovered_stars(discovered_by);

-- Later: messages that travel at light speed until FTL comms exist
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  galaxy_id uuid not null references public.galaxies(id) on delete cascade,
  from_replicant uuid references public.replicants(id) on delete set null,
  to_replicant uuid references public.replicants(id) on delete set null,
  body text not null check (char_length(body) <= 500),
  sent_at timestamptz not null default now(),
  arrives_at timestamptz not null default now()
);
create index messages_galaxy_idx on public.messages(galaxy_id);
create index messages_from_idx on public.messages(from_replicant);
create index messages_to_idx on public.messages(to_replicant);

-- Membership check used by every policy (security definer avoids recursive RLS on galaxy_members)
create or replace function public.is_galaxy_member(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.galaxy_members m
    where m.galaxy_id = gid and m.user_id = (select auth.uid())
  );
$$;

-- First sign-in: make a galaxy for this family login (idempotent) and return its id
create or replace function public.ensure_family_galaxy()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  gid uuid;
begin
  if uid is null then
    raise exception 'not signed in';
  end if;
  select m.galaxy_id into gid from public.galaxy_members m where m.user_id = uid limit 1;
  if gid is null then
    insert into public.galaxies default values returning id into gid;
    insert into public.galaxy_members (galaxy_id, user_id) values (gid, uid);
    insert into public.planet_states (galaxy_id, star_id, planet_index, seed) values (gid, 'sol', 3, 1969);
  end if;
  return gid;
end;
$$;

revoke execute on function public.ensure_family_galaxy() from public, anon;
grant execute on function public.ensure_family_galaxy() to authenticated;
revoke execute on function public.is_galaxy_member(uuid) from public, anon;
grant execute on function public.is_galaxy_member(uuid) to authenticated;

alter table public.galaxies enable row level security;
alter table public.galaxy_members enable row level security;
alter table public.profiles enable row level security;
alter table public.replicants enable row level security;
alter table public.planet_states enable row level security;
alter table public.journeys enable row level security;
alter table public.discovered_stars enable row level security;
alter table public.messages enable row level security;

create policy "members read galaxy" on public.galaxies
  for select to authenticated using (public.is_galaxy_member(id));
create policy "members update galaxy" on public.galaxies
  for update to authenticated using (public.is_galaxy_member(id)) with check (public.is_galaxy_member(id));

create policy "read own memberships" on public.galaxy_members
  for select to authenticated using (user_id = (select auth.uid()));

-- Same full-access-for-members policy on every game table
do $$
declare t text;
begin
  foreach t in array array['profiles', 'replicants', 'planet_states', 'journeys', 'discovered_stars', 'messages'] loop
    execute format('create policy "members select" on public.%I for select to authenticated using (public.is_galaxy_member(galaxy_id))', t);
    execute format('create policy "members insert" on public.%I for insert to authenticated with check (public.is_galaxy_member(galaxy_id))', t);
    execute format('create policy "members update" on public.%I for update to authenticated using (public.is_galaxy_member(galaxy_id)) with check (public.is_galaxy_member(galaxy_id))', t);
    execute format('create policy "members delete" on public.%I for delete to authenticated using (public.is_galaxy_member(galaxy_id))', t);
  end loop;
end $$;
