-- A fresh start on the Metanoia homeworld, LHS 1140 b (story/STORY.md; session 19, 2026-10-26).
-- NOT a migration: Steve runs this by hand in the Supabase SQL Editor (project "Replicated") when he agrees.
-- Nothing in the schema changes. The galaxy, its login, Steve's profile and the minds' spend ledger stay.
--
-- What it does: copies every replicant, planet, journey, discovered star, note, letter and request into a new
-- backup schema, then erases them, so the next time Steve plays a new original wakes on LHS 1140 b (Thales, his
-- structures and the half printed Printworks are made by the game on that first load).
-- The previous backup (backup_20261025) is left alone.
--
-- The other way (keeps the current original and everything it did): skip this file and run only
--   update replicants set star_id = 'lhs-1140', planet_index = 2, pos_x = null, pos_y = null,
--     traits = traits - 'awake' - 'ship' where profile_id is not null;
-- which moves the original to the homeworld to see the opening; its copies and Earth stay where they are.

begin;

create schema if not exists backup_20261026;
create table backup_20261026.replicants as select * from public.replicants;
create table backup_20261026.planet_states as select * from public.planet_states;
create table backup_20261026.journeys as select * from public.journeys;
create table backup_20261026.discovered_stars as select * from public.discovered_stars;
create table backup_20261026.notes as select * from public.notes;
create table backup_20261026.messages as select * from public.messages;
create table backup_20261026.requests as select * from public.requests;
-- the backup is for Steve and Claude Code only: no API role can read it
alter table backup_20261026.replicants enable row level security;
alter table backup_20261026.planet_states enable row level security;
alter table backup_20261026.journeys enable row level security;
alter table backup_20261026.discovered_stars enable row level security;
alter table backup_20261026.notes enable row level security;
alter table backup_20261026.messages enable row level security;
alter table backup_20261026.requests enable row level security;
revoke all on schema backup_20261026 from anon, authenticated;

-- erase (children first)
delete from public.requests;
delete from public.notes;
delete from public.messages;
delete from public.journeys;
delete from public.discovered_stars;
delete from public.planet_states;
delete from public.replicants;

commit;

-- check: every count is 0, and the backup holds what there was
select 'replicants' as t, count(*) from public.replicants
union all select 'planet_states', count(*) from public.planet_states
union all select 'backup replicants', count(*) from backup_20261026.replicants
union all select 'backup planet_states', count(*) from backup_20261026.planet_states
union all select 'profiles (kept)', count(*) from public.profiles;
