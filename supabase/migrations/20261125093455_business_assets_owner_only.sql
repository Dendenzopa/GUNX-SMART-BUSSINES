-- RECOVERED EXACTLY from Supabase migration ledger.
-- Source project: qejfhjpopsgaeuqygihr
-- Version: 20261125093455
-- Name: business_assets_owner_only
-- This file records an already-applied migration; do not replay on the live project.

drop policy if exists business_assets_member_upload on storage.objects;
create policy business_assets_owner_upload
on storage.objects for insert to authenticated
with check (
  bucket_id = 'business-assets'
  and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and exists (
    select 1 from public.shop_members sm
    where sm.shop_id = ((storage.foldername(name))[1])::uuid
      and sm.user_id = (select auth.uid())
      and sm.role = 'owner'
  )
  and (storage.foldername(name))[2] = (select auth.uid())::text
);

drop policy if exists business_assets_owner_update on storage.objects;
drop policy if exists business_assets_owner_delete on storage.objects;
