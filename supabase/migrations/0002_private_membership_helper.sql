-- Keep the RLS membership helper out of the exposed API schema (policies follow the function).
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
alter function public.is_galaxy_member(uuid) set schema private;
