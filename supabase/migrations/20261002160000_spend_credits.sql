-- Authenticated users can only spend their own credits, never raise them.

create or replace function public.spend_credits(amount integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_balance integer;
begin
  if amount is null or amount < 1 or amount > 300 then
    raise exception 'Invalid credit amount';
  end if;

  update public.profiles
  set credits = credits - amount
  where id = auth.uid()
    and credits >= amount
  returning credits into next_balance;

  if next_balance is null then
    raise exception 'Not enough credits';
  end if;

  return next_balance;
end;
$$;

revoke all on function public.spend_credits(integer) from public, anon;
grant execute on function public.spend_credits(integer) to authenticated;
