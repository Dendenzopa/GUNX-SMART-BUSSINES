-- Owner-managed dashboard branding settings and tenant-scoped image storage.
alter table public.shops
  add column if not exists hero_media_type text
    check (hero_media_type is null or hero_media_type in ('owner_photo', 'business_logo')),
  add column if not exists hero_media_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('shop-branding', 'shop-branding', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists shop_branding_owner_upload on storage.objects;
create policy shop_branding_owner_upload on storage.objects
for insert to authenticated
with check (
  bucket_id = 'shop-branding'
  and exists (
    select 1 from public.shops s
    where s.id::text = (storage.foldername(name))[1]
      and s.owner_id = (select auth.uid())
  )
);

drop policy if exists shop_branding_owner_update on storage.objects;
create policy shop_branding_owner_update on storage.objects
for update to authenticated
using (
  bucket_id = 'shop-branding'
  and exists (
    select 1 from public.shops s
    where s.id::text = (storage.foldername(name))[1]
      and s.owner_id = (select auth.uid())
  )
)
with check (
  bucket_id = 'shop-branding'
  and exists (
    select 1 from public.shops s
    where s.id::text = (storage.foldername(name))[1]
      and s.owner_id = (select auth.uid())
  )
);

drop policy if exists shop_branding_owner_delete on storage.objects;
create policy shop_branding_owner_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'shop-branding'
  and exists (
    select 1 from public.shops s
    where s.id::text = (storage.foldername(name))[1]
      and s.owner_id = (select auth.uid())
  )
);

-- Ensure the owner chart receives committed sales events through Supabase Realtime.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'sales'
     ) then
    alter publication supabase_realtime add table public.sales;
  end if;
end $$;
