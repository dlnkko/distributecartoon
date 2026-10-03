-- Service role grants purchased credits once per Whop payment.

create table if not exists public.credit_grants (
  payment_id text primary key,
  user_id uuid not null,
  credits integer not null check (credits > 0),
  created_at timestamptz not null default now()
);

alter table public.credit_grants enable row level security;

create or replace function public.grant_credits(target uuid, amount integer, payment text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_balance integer;
begin
  if amount < 1 or amount > 20000 or payment is null or length(payment) < 4 then
    raise exception 'Invalid credit grant';
  end if;
  insert into public.credit_grants (payment_id, user_id, credits)
  values (payment, target, amount);
  update public.profiles
  set credits = credits + amount
  where id = target
  returning credits into next_balance;
  if next_balance is null then
    raise exception 'Profile missing';
  end if;
  return next_balance;
exception
  when unique_violation then
    select credits into next_balance from public.profiles where id = target;
    return coalesce(next_balance, 0);
end;
$$;

revoke all on function public.grant_credits(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.grant_credits(uuid, integer, text) to service_role;
