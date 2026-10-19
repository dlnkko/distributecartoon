alter table public.saved_products
  add column if not exists when_notes text not null default '',
  add column if not exists extra_context text not null default '';
