-- Turning a project on for rendering is a user write. Require a charge row
-- from spend_credits_for_generation. The worker saves with no user id and
-- keeps going on a generation that already started.

create or replace function public.guard_project_generation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  was_on boolean;
  now_on boolean;
  cost integer;
  charge_id uuid;
  paid integer;
begin
  if auth.uid() is null then
    return new;
  end if;

  now_on := coalesce(new.payload->>'keepGenerating', '') = 'true';
  was_on := tg_op = 'UPDATE' and coalesce(old.payload->>'keepGenerating', '') = 'true';

  cost := round(coalesce(
    nullif(new.payload->'song'->>'durationSeconds', '')::numeric,
    nullif(new.payload->>'targetDurationSeconds', '')::numeric,
    15
  ))::integer;
  if cost is null or cost < 1 then
    cost := 15;
  end if;
  if cost > 20000 then
    raise exception 'Invalid credit amount';
  end if;

  if now_on and not was_on then
    select id into charge_id
    from public.generation_charges
    where project_id = new.id
      and user_id = auth.uid()
      and consumed_at is null
      and credits >= cost
    order by created_at desc
    limit 1
    for update;
    if charge_id is null then
      raise exception 'Not enough credits';
    end if;
    update public.generation_charges
    set consumed_at = now()
    where id = charge_id;
  elsif now_on and was_on then
    select credits into paid
    from public.generation_charges
    where project_id = new.id
      and user_id = auth.uid()
      and consumed_at is not null
    order by consumed_at desc
    limit 1;
    if paid is not null and cost > paid then
      raise exception 'Not enough credits';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists projects_generation_must_be_paid on public.projects;
create trigger projects_generation_must_be_paid
  before insert or update of payload on public.projects
  for each row execute function public.guard_project_generation();
