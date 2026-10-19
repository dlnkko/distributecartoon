alter table public.saved_products
  add column if not exists photos jsonb not null default '[]'::jsonb,
  add column if not exists videos jsonb not null default '[]'::jsonb;

update public.saved_products
set photos = jsonb_build_array(jsonb_build_object('path', image_path, 'note', coalesce(image_note, '')))
where image_path <> ''
  and photos = '[]'::jsonb;

update public.saved_products
set videos = jsonb_build_array(jsonb_build_object('path', use_video_path, 'note', coalesce(use_video_note, '')))
where use_video_path <> ''
  and videos = '[]'::jsonb;
