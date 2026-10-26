-- Each member's KIE key stays on the server. The browser never reads it.
-- A membership plus a key authorizes a generation without spending our credits,
-- because the video is billed on that member's KIE account.

create table if not exists public.user_kie_keys (
  user_id uuid primary key references auth.users (id) on delete cascade,
  api_key text not null,
  updated_at timestamptz not null default now()
);

alter table public.user_kie_keys enable row level security;

revoke all on table public.user_kie_keys from public, anon, authenticated;

create or replace function public.authorize_member_generation(amount integer, project_id text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing uuid;
begin
  if authorize_member_generation.amount is null
     or authorize_member_generation.amount < 1
     or authorize_member_generation.amount > 20000
     or authorize_member_generation.project_id is null
     or length(authorize_member_generation.project_id) < 4 then
    raise exception 'Invalid credit amount';
  end if;
  if not exists (
    select 1 from public.projects
    where id = authorize_member_generation.project_id
      and owner_id = auth.uid()
  ) then
    raise exception 'Not allowed';
  end if;
  if not exists (
    select 1 from public.memberships
    where user_id = auth.uid()
      and status in ('active', 'trialing', 'past_due', 'canceling')
  ) then
    raise exception 'Membership required';
  end if;
  if not exists (
    select 1 from public.user_kie_keys
    where user_id = auth.uid()
      and length(trim(api_key)) >= 12
  ) then
    raise exception 'KIE API key required';
  end if;

  select charges.id into existing
  from public.generation_charges as charges
  where charges.project_id = authorize_member_generation.project_id
    and charges.user_id = auth.uid()
    and charges.consumed_at is null
    and charges.credits >= authorize_member_generation.amount
  order by charges.created_at desc
  limit 1;
  if existing is not null then
    return 0;
  end if;

  insert into public.generation_charges (user_id, project_id, credits)
  values (auth.uid(), authorize_member_generation.project_id, authorize_member_generation.amount);

  return 0;
end;
$$;

revoke all on function public.authorize_member_generation(integer, text) from public, anon;
grant execute on function public.authorize_member_generation(integer, text) to authenticated;
