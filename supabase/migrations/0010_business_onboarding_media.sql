-- GUNX SMART BUSINESS: owner onboarding business media
alter table public.shops
  add column if not exists hero_media_type text
    check (hero_media_type is null or hero_media_type in ('owner_photo','business_logo')),
  add column if not exists hero_media_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('business-assets', 'business-assets', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists business_assets_member_upload on storage.objects;
create policy business_assets_member_upload
on storage.objects for insert to authenticated
with check (
  bucket_id = 'business-assets'
  and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  and public.is_shop_member(((storage.foldername(name))[1])::uuid)
  and (storage.foldername(name))[2] = (select auth.uid())::text
);

drop policy if exists business_assets_owner_update on storage.objects;
create policy business_assets_owner_update
on storage.objects for update to authenticated
using (
  bucket_id = 'business-assets'
  and public.is_shop_member(((storage.foldername(name))[1])::uuid)
  and (storage.foldername(name))[2] = (select auth.uid())::text
)
with check (
  bucket_id = 'business-assets'
  and public.is_shop_member(((storage.foldername(name))[1])::uuid)
  and (storage.foldername(name))[2] = (select auth.uid())::text
);

drop policy if exists business_assets_owner_delete on storage.objects;
create policy business_assets_owner_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'business-assets'
  and public.is_shop_member(((storage.foldername(name))[1])::uuid)
  and (storage.foldername(name))[2] = (select auth.uid())::text
);
