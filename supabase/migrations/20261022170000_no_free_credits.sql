-- New accounts were getting 120 credits and plan "free" from column defaults.
-- Signup does not buy a plan. Credits start at 0 and the plan label stays empty.

alter table public.profiles alter column credits set default 0;
alter table public.profiles alter column plan drop default;
alter table public.profiles alter column plan drop not null;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url, credits, plan)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      new.raw_user_meta_data ->> 'display_name',
      split_part(coalesce(new.email, 'account'), '@', 1)
    ),
    coalesce(
      new.raw_user_meta_data ->> 'avatar_url',
      new.raw_user_meta_data ->> 'picture'
    ),
    0,
    null
  )
  on conflict (id) do update
    set email = excluded.email,
        display_name = coalesce(public.profiles.display_name, excluded.display_name),
        avatar_url = coalesce(public.profiles.avatar_url, excluded.avatar_url),
        updated_at = now();
  return new;
end;
$$;

-- A generation can start only after this row exists. The signed-in user cannot insert it.
create table if not exists public.generation_charges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  project_id text not null,
  credits integer not null check (credits >= 1 and credits <= 20000),
  created_at timestamptz not null default now(),
  consumed_at timestamptz
);

alter table public.generation_charges enable row level security;
revoke all on table public.generation_charges from public, anon, authenticated;

create index if not exists generation_charges_open_idx
  on public.generation_charges (project_id, user_id, created_at desc)
  where consumed_at is null;

create or replace function public.spend_credits_for_generation(amount integer, project_id text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_balance integer;
  existing uuid;
begin
  if amount is null or amount < 1 or amount > 20000 or project_id is null or length(project_id) < 4 then
    raise exception 'Invalid credit amount';
  end if;
  if not exists (
    select 1 from public.projects
    where id = project_id and owner_id = auth.uid()
  ) then
    raise exception 'Not allowed';
  end if;

  select id into existing
  from public.generation_charges
  where project_id = spend_credits_for_generation.project_id
    and user_id = auth.uid()
    and consumed_at is null
    and credits >= amount
  order by created_at desc
  limit 1;
  if existing is not null then
    select credits into next_balance from public.profiles where id = auth.uid();
    return next_balance;
  end if;

  update public.profiles
  set credits = credits - amount
  where id = auth.uid()
    and credits >= amount
  returning credits into next_balance;

  if next_balance is null then
    raise exception 'Not enough credits';
  end if;

  insert into public.generation_charges (user_id, project_id, credits)
  values (auth.uid(), project_id, amount);

  return next_balance;
end;
$$;

revoke all on function public.spend_credits_for_generation(integer, text) from public, anon;
grant execute on function public.spend_credits_for_generation(integer, text) to authenticated;

-- The signup gift. These accounts never bought credits and have no membership.
update public.profiles
set credits = 0
where email in (
  'trantrongduc722004@gmail.com',
  'bossforlife007@gmail.com',
  'luckeys.pickle@gmail.com'
)
and not exists (select 1 from public.credit_grants g where g.user_id = profiles.id)
and not exists (
  select 1 from public.memberships m
  where m.user_id = profiles.id
    and m.status in ('active', 'canceling', 'completed')
);

update public.profiles p
set plan = m.plan
from public.memberships m
where m.user_id = p.id
  and m.status in ('active', 'canceling', 'completed')
  and p.plan = 'free';

update public.profiles p
set plan = null
where p.plan = 'free'
and not exists (
  select 1 from public.memberships m
  where m.user_id = p.id
    and m.status in ('active', 'canceling', 'completed')
);
