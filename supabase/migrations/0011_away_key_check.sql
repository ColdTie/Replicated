-- The away run's key lives only in Vault (mind_away_key): the mind function, holding the service role, asks the
-- database whether the key a scheduled call carries is the right one. Nobody else may call this.
create or replace function public.check_away_key(p_key text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (select 1 from vault.decrypted_secrets where name = 'mind_away_key' and decrypted_secret = p_key);
$$;
revoke execute on function public.check_away_key(text) from public, anon, authenticated;
grant execute on function public.check_away_key(text) to service_role;
