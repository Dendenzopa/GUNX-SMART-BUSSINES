-- GUNX SMART BUSINESS: product catalogue administration is management-only.
-- Stockkeepers may receive and count stock through audited stock RPCs, but cannot
-- create/delete catalogue records or set initial cost/selling prices.
drop policy if exists products_role_insert on public.products;
create policy products_management_insert on public.products
for insert to authenticated
with check (public.has_shop_role(shop_id, array['owner','manager']));

drop policy if exists products_role_delete on public.products;
create policy products_management_delete on public.products
for delete to authenticated
using (public.has_shop_role(shop_id, array['owner','manager']));
