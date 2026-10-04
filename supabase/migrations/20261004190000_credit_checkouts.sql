-- Checkout ids we create, so a paid membership can be matched to a user
-- even when Whop's membership list omits the metadata.

create table if not exists public.credit_checkouts (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  plan text not null,
  created_at timestamptz not null default now()
);

alter table public.credit_checkouts enable row level security;

create index if not exists credit_checkouts_user_created
  on public.credit_checkouts (user_id, created_at desc);
