-- Writes go through authenticated server actions with office scoping and CAS.
create table public.survival_game_workspaces (
  practice_id uuid primary key references public.practices(id) on delete cascade,
  state jsonb not null,
  version bigint not null default 1 check (version > 0),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(state) = 'object')
);
alter table public.survival_game_workspaces enable row level security;
revoke all on public.survival_game_workspaces from public, anon, authenticated;
grant select, insert, update on public.survival_game_workspaces to service_role;
