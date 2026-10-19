create table if not exists public.saved_products (
  id text primary key,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null default 'Product',
  page_url text not null default '',
  page_context text not null default '',
  use_notes text not null default '',
  image_path text not null default '',
  image_note text not null default '',
  use_video_path text not null default '',
  use_video_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.saved_products enable row level security;

drop policy if exists saved_products_select_own on public.saved_products;
create policy saved_products_select_own
  on public.saved_products
  for select
  to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists saved_products_insert_own on public.saved_products;
create policy saved_products_insert_own
  on public.saved_products
  for insert
  to authenticated
  with check (owner_id = (select auth.uid()));

drop policy if exists saved_products_update_own on public.saved_products;
create policy saved_products_update_own
  on public.saved_products
  for update
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists saved_products_delete_own on public.saved_products;
create policy saved_products_delete_own
  on public.saved_products
  for delete
  to authenticated
  using (owner_id = (select auth.uid()));

grant select, insert, update, delete on public.saved_products to authenticated;

drop trigger if exists saved_products_set_updated_at on public.saved_products;
create trigger saved_products_set_updated_at
  before update on public.saved_products
  for each row execute function private.set_updated_at();
