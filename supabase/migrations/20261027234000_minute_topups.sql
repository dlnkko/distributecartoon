alter table public.memberships add column if not exists bonus_seconds integer not null default 0;

create table if not exists public.minute_topups (
  payment_id text primary key,
  user_id uuid not null,
  seconds integer not null,
  created_at timestamptz not null default now()
);

alter table public.minute_topups enable row level security;

revoke all on table public.minute_topups from public, anon, authenticated;
