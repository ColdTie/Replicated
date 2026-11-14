-- A day of life (docs/plan-daily-life.md step 2, Steve's yes 2026-11-14: twice a day).
-- The mind function lives each copy's day inside two windows in Steve's time (mind.json day: 1:00 and 13:00
-- America/Los_Angeles, 90 minutes each). This job calls it every 10 minutes through the UTC hours that hold those
-- windows in winter and in summer (8-10 and 20-22 UTC); outside a window the function does nothing. The hourly job
-- (mind-away-wakes) stays: while days are on it wakes nobody and only moves the worlds along (awayPass).
alter table public.mind_runs drop constraint mind_runs_kind_check;
alter table public.mind_runs add constraint mind_runs_kind_check check (kind in ('live', 'talk', 'away', 'day'));

select cron.schedule(
  'mind-day',
  '*/10 8-10,20-22 * * *',
  $$
  select net.http_post(
    url := 'https://vgoijybibhopfichyirj.supabase.co/functions/v1/mind',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'mind_anon_key'),
      'x-away-key', (select decrypted_secret from vault.decrypted_secrets where name = 'mind_away_key')
    ),
    body := '{"day": true}'::jsonb,
    timeout_milliseconds := 140000
  );
  $$
);
