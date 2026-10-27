-- A fresh start for the beginning (story/STORY.md The beginning; session 23, 2026-10-27; Steve: "Yes lets back up and
-- erase"). NOT a migration: run once, by hand or by a session Steve asked to. Nothing in the schema changes.
-- Only Steve's galaxy (the one whose profile is Steve) is touched: the other login's galaxy and its rows stay.
-- The galaxy, its login, Steve's profile and the minds' spend ledger stay; every replicant, planet, journey,
-- discovered star, note, letter and request of the galaxy is copied into backup_20261027, then erased. The next time
-- Steve plays, a new Vessel wakes on LHS 1140 b (Thales, his structures and the waiting printer are made by the game
-- on that first load), names itself and goes through the beginning.
-- (Replaces 2026-10-26_homeworld_fresh_start.sql, which was never run and erased every galaxy.)

begin;

create schema if not exists backup_20261027;
create table backup_20261027.replicants as select * from public.replicants where galaxy_id = 'cdfa9dce-658f-4d57-81f7-b5155f259ccd';
create table backup_20261027.planet_states as select * from public.planet_states where galaxy_id = 'cdfa9dce-658f-4d57-81f7-b5155f259ccd';
create table backup_20261027.journeys as select * from public.journeys where galaxy_id = 'cdfa9dce-658f-4d57-81f7-b5155f259ccd';
create table backup_20261027.discovered_stars as select * from public.discovered_stars where galaxy_id = 'cdfa9dce-658f-4d57-81f7-b5155f259ccd';
create table backup_20261027.notes as select * from public.notes where galaxy_id = 'cdfa9dce-658f-4d57-81f7-b5155f259ccd';
create table backup_20261027.messages as select * from public.messages where galaxy_id = 'cdfa9dce-658f-4d57-81f7-b5155f259ccd';
create table backup_20261027.requests as select * from public.requests where galaxy_id = 'cdfa9dce-658f-4d57-81f7-b5155f259ccd';
-- the backup is for Steve and Claude Code only: no API role can read it
alter table backup_20261027.replicants enable row level security;
alter table backup_20261027.planet_states enable row level security;
alter table backup_20261027.journeys enable row level security;
alter table backup_20261027.discovered_stars enable row level security;
alter table backup_20261027.notes enable row level security;
alter table backup_20261027.messages enable row level security;
alter table backup_20261027.requests enable row level security;
revoke all on schema backup_20261027 from anon, authenticated;

-- erase (children first), this galaxy only
delete from public.requests where galaxy_id = 'cdfa9dce-658f-4d57-81f7-b5155f259ccd';
delete from public.notes where galaxy_id = 'cdfa9dce-658f-4d57-81f7-b5155f259ccd';
delete from public.messages where galaxy_id = 'cdfa9dce-658f-4d57-81f7-b5155f259ccd';
delete from public.journeys where galaxy_id = 'cdfa9dce-658f-4d57-81f7-b5155f259ccd';
delete from public.discovered_stars where galaxy_id = 'cdfa9dce-658f-4d57-81f7-b5155f259ccd';
delete from public.planet_states where galaxy_id = 'cdfa9dce-658f-4d57-81f7-b5155f259ccd';
delete from public.replicants where galaxy_id = 'cdfa9dce-658f-4d57-81f7-b5155f259ccd';

commit;

-- check: this galaxy's counts are 0, the backup holds what there was, the other galaxy is untouched
select 'replicants' as t, count(*) from public.replicants where galaxy_id = 'cdfa9dce-658f-4d57-81f7-b5155f259ccd'
union all select 'planet_states', count(*) from public.planet_states where galaxy_id = 'cdfa9dce-658f-4d57-81f7-b5155f259ccd'
union all select 'backup replicants', count(*) from backup_20261027.replicants
union all select 'backup planet_states', count(*) from backup_20261027.planet_states
union all select 'other galaxies planet_states (kept)', count(*) from public.planet_states where galaxy_id <> 'cdfa9dce-658f-4d57-81f7-b5155f259ccd'
union all select 'profiles (kept)', count(*) from public.profiles;
