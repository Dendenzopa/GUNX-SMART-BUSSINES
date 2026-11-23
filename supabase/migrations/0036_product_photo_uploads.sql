-- Product photo storage: public read URLs, shop-owner/manager uploads and deletion.
alter table public.products add column if not exists image_url text;

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
