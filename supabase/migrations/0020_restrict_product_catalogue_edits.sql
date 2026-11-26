-- GUNX SMART BUSINESS: restrict catalogue edits/archiving to management.
-- Stockkeepers receive/count stock only through audited security-definer RPCs.
drop policy if exists products_role_update on public.products;
drop policy if exists products_member_update on public.products;
create policy products_management_update on public.products
for update to authenticated
using (public.has_shop_role(shop_id, array['owner','manager']))
with check (public.has_shop_role(shop_id, array['owner','manager']));
