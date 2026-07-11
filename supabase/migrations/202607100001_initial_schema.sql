create extension if not exists pgcrypto;

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create table public.matches (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'complete')),
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.battle_turns (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  match_id uuid not null references public.matches(id) on delete cascade,
  turn_number integer not null check (turn_number > 0),
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  synced_at timestamptz not null default now(),
  unique (match_id, turn_number)
);

create table public.battle_history (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index matches_user_status_updated_idx on public.matches(user_id, status, updated_at desc);
create index battle_turns_user_match_turn_idx on public.battle_turns(user_id, match_id, turn_number desc);
create index battle_history_user_created_idx on public.battle_history(user_id, created_at desc);

alter table public.teams enable row level security;
alter table public.matches enable row level security;
alter table public.battle_turns enable row level security;
alter table public.battle_history enable row level security;

grant select, insert, update, delete on public.teams, public.matches, public.battle_turns, public.battle_history to authenticated;

create policy "owners manage teams" on public.teams for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "owners manage matches" on public.matches for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "owners manage turns" on public.battle_turns for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "owners manage history" on public.battle_history for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
