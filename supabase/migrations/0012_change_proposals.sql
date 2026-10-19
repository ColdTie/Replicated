-- Proposals to change the game (session 14). In their long wakes the copies can read the game's own code (the mind
-- function's code_map / search_code / read_code) and propose a change to it (kind 'change': detail is the title and
-- why, body the change itself). The maker, a daily Claude Code routine (NEEDS.md), builds the sound ones and answers
-- in reply; the copy reads that reply at its next wake. The original can say no from the journal ('vetoed').
alter table public.requests drop constraint requests_kind_check;
alter table public.requests add constraint requests_kind_check
  check (kind in ('lamp', 'garden', 'hut', 'flag', 'totem', 'sign', 'name', 'skin', 'change', 'other'));
alter table public.requests drop constraint requests_status_check;
alter table public.requests add constraint requests_status_check
  check (status in ('open', 'done', 'dropped', 'vetoed'));
alter table public.requests add column body text not null default '' check (char_length(body) <= 4000);
alter table public.requests add column reply text check (char_length(reply) <= 1000);
create index requests_open_kind_idx on public.requests(kind, status) where status = 'open';
