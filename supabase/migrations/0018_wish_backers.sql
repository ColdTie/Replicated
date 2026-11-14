-- The copies shape the game (docs/plan-daily-life.md step 5, Steve's yes 2026-11-14): a wish for the game is a
-- `requests` row of kind 'change' (propose_change); other copies may back it, one backing each, with a reason in a
-- line. The maker builds the wishes the Metanoia backs most (NEEDS.md). backers: [{ by, name, why, at }].
alter table public.requests add column backers jsonb not null default '[]'::jsonb;

-- Backs an open wish: never one's own, never twice, only within the wish's galaxy. Only the mind function calls it
-- (service key). Returns the number of backers after, or null when it could not back it.
create or replace function public.back_wish(p_request uuid, p_by uuid, p_name text, p_why text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare r public.requests; b public.replicants; n integer;
begin
  select * into r from public.requests where id = p_request and kind = 'change' and status = 'open' for update;
  select * into b from public.replicants where id = p_by;
  if r.id is null or b.id is null or b.galaxy_id <> r.galaxy_id or r.replicant_id = p_by then return null; end if;
  if exists (select 1 from jsonb_array_elements(r.backers) e where e->>'by' = p_by::text) then return null; end if;
  update public.requests set backers = backers || jsonb_build_array(jsonb_build_object(
    'by', p_by, 'name', left(coalesce(p_name, ''), 40), 'why', left(coalesce(p_why, ''), 200), 'at', now()))
  where id = p_request returning jsonb_array_length(backers) into n;
  return n;
end;
$$;
revoke execute on function public.back_wish(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.back_wish(uuid, uuid, text, text) to service_role;
