-- One membership row per user. The webhook writes with the service role.
-- Each user can read their own row.

create table if not exists public.memberships (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan text not null,
  status text not null default 'active',
  whop_payment_id text,
  updated_at timestamptz not null default now()
);

alter table public.memberships enable row level security;

drop policy if exists "read own membership" on public.memberships;
create policy "read own membership"
  on public.memberships
  for select
  to authenticated
  using (auth.uid() = user_id);
