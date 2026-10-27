-- Caps script, clone, and story writes that spend Claude or Gemini
-- before a video is generated. The table is only reachable through the
-- service-role function.

create table if not exists public.workflow_preps (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  kind text not null,
  created_at timestamptz not null default now(),
  constraint workflow_preps_kind check (kind in ('plan', 'clone', 'story', 'brief'))
);

create index if not exists workflow_preps_user_kind_created
  on public.workflow_preps (user_id, kind, created_at desc);

alter table public.workflow_preps enable row level security;

revoke all on table public.workflow_preps from public, anon, authenticated;

create or replace function public.take_workflow_prep(
  member uuid,
  prep_kind text,
  hour_cap integer,
  month_cap integer
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  hour_count integer;
  month_count integer;
  heavy boolean;
begin
  if member is null or prep_kind not in ('plan', 'clone', 'story', 'brief') then
    return 'membership';
  end if;
  if hour_cap is null or month_cap is null or hour_cap < 1 or hour_cap > 100 or month_cap < 1 or month_cap > 2000 then
    return 'month';
  end if;
  if not exists (
    select 1 from public.memberships
    where user_id = member
      and status in ('active', 'trialing', 'past_due', 'canceling', 'completed')
  ) then
    return 'membership';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(member::text, 0));

  delete from public.workflow_preps
  where user_id = member
    and created_at < pg_catalog.now() - interval '40 days';

  heavy := prep_kind in ('plan', 'clone', 'story');

  if heavy then
    select count(*) into hour_count
    from public.workflow_preps
    where user_id = member
      and kind in ('plan', 'clone', 'story')
      and created_at > pg_catalog.now() - interval '1 hour';
    select count(*) into month_count
    from public.workflow_preps
    where user_id = member
      and kind in ('plan', 'clone', 'story')
      and created_at > pg_catalog.now() - interval '30 days';
  else
    select count(*) into hour_count
    from public.workflow_preps
    where user_id = member
      and kind = 'brief'
      and created_at > pg_catalog.now() - interval '1 hour';
    select count(*) into month_count
    from public.workflow_preps
    where user_id = member
      and kind = 'brief'
      and created_at > pg_catalog.now() - interval '30 days';
  end if;

  if hour_count >= hour_cap then
    return 'hour';
  end if;
  if month_count >= month_cap then
    return 'month';
  end if;

  insert into public.workflow_preps (user_id, kind)
  values (member, prep_kind);
  return 'ok';
end;
$$;

revoke all on function public.take_workflow_prep(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.take_workflow_prep(uuid, text, integer, integer) to service_role;
