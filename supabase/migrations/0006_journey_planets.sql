-- Journeys now say which planet the ship left and which it lands on (planet_index). Older rows landed on planet 1
-- (Earth is Sol's 3rd); the defaults keep them valid.
alter table public.journeys
  add column if not exists from_planet smallint not null default 1,
  add column if not exists to_planet smallint not null default 1;
