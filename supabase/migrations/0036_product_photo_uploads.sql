-- Product photo storage: public read URLs, shop-owner/manager uploads and deletion.
alter table public.products add column if not exists image_url text;

-- Migration 0015 revoked broad product UPDATE and granted only named catalogue columns.
-- Explicitly grant image_url so the authenticated owner/manager upload flow can persist the URL.
grant update (image_url) on table public.products to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images','product-images',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Product images are publicly readable" on storage.objects;
create policy "Product images are publicly readable"
on storage.objects for select
using (bucket_id = 'product-images');

drop policy if exists "Shop managers upload product images" on storage.objects;
create policy "Shop managers upload product images"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'product-images'
  and array_length(storage.foldername(name),1) >= 2
  and public.has_shop_role((storage.foldername(name))[1]::uuid,array['owner','manager'])
);

drop policy if exists "Shop managers update product images" on storage.objects;
create policy "Shop managers update product images"
on storage.objects for update to authenticated
using (
  bucket_id = 'product-images'
  and public.has_shop_role((storage.foldername(name))[1]::uuid,array['owner','manager'])
)
with check (
  bucket_id = 'product-images'
  and public.has_shop_role((storage.foldername(name))[1]::uuid,array['owner','manager'])
);

drop policy if exists "Shop managers delete product images" on storage.objects;
create policy "Shop managers delete product images"
on storage.objects for delete to authenticated
using (
  bucket_id = 'product-images'
  and public.has_shop_role((storage.foldername(name))[1]::uuid,array['owner','manager'])
);

-- Product rows are updateable by stockkeepers for catalogue-adjacent workflows in
-- earlier policies. Keep image URL changes strictly management-only as well.
create or replace function public.guard_product_image_url_updates()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null
     and new.image_url is distinct from old.image_url
     and not public.has_shop_role(old.shop_id, array['owner','manager']) then
    raise exception 'PRODUCT_IMAGE_PERMISSION_DENIED: Only the shop owner or manager can change product photos.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists products_guard_image_url_updates on public.products;
create trigger products_guard_image_url_updates
before update of image_url on public.products
for each row execute function public.guard_product_image_url_updates();

revoke all on function public.guard_product_image_url_updates() from public, anon, authenticated;
