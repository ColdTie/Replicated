-- A copy may describe the body it wants (kind 'skin'); Claude Code then draws it and switches its model.
alter table public.requests drop constraint requests_kind_check;
alter table public.requests add constraint requests_kind_check
  check (kind in ('lamp', 'garden', 'hut', 'flag', 'totem', 'sign', 'name', 'skin', 'other'));
