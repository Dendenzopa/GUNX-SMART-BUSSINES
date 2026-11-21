-- GUNX SMART BUSINESS: role-aware table permissions.
-- Roles are owner, manager, cashier and stockkeeper.

create or replace function public.has_shop_role(p_shop_id uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.shop_members sm
    where sm.shop_id = p_shop_id
      and sm.user_id = (select auth.uid())
      and sm.role = any(p_roles)
  );
$$;

revoke all on function public.has_shop_role(uuid, text[]) from public;
grant execute on function public.has_shop_role(uuid, text[]) to authenticated;

-- PRODUCTS: all members can read; owner/manager/stockkeeper maintain catalogue and stock counts.
drop policy if exists products_member_insert on public.products;
drop policy if exists products_member_update on public.products;
drop policy if exists products_member_delete on public.products;
create policy products_role_insert on public.products
for insert to authenticated
with check (public.has_shop_role(shop_id, array['owner','manager','stockkeeper']));
create policy products_role_update on public.products
for update to authenticated
using (public.has_shop_role(shop_id, array['owner','manager','stockkeeper']))
with check (public.has_shop_role(shop_id, array['owner','manager','stockkeeper']));
create policy products_role_delete on public.products
for delete to authenticated
using (public.has_shop_role(shop_id, array['owner','manager','stockkeeper']));

-- CUSTOMERS: cashiers can create/update customers; only management may delete.
drop policy if exists customers_member_insert on public.customers;
drop policy if exists customers_member_update on public.customers;
drop policy if exists customers_member_delete on public.customers;
create policy customers_role_insert on public.customers
for insert to authenticated
with check (public.has_shop_role(shop_id, array['owner','manager','cashier']));
create policy customers_role_update on public.customers
for update to authenticated
using (public.has_shop_role(shop_id, array['owner','manager','cashier']))
with check (public.has_shop_role(shop_id, array['owner','manager','cashier']));
create policy customers_role_delete on public.customers
for delete to authenticated
using (public.has_shop_role(shop_id, array['owner','manager']));

-- SALES: create-only from the app; changes are represented by compensating records.
drop policy if exists sales_member_insert on public.sales;
create policy sales_role_insert on public.sales
for insert to authenticated
with check (public.has_shop_role(shop_id, array['owner','manager','cashier']));

-- SALE ITEMS: item creation is permitted only if the parent sale belongs to the same shop
-- and the user is a permitted cashier/manager/owner.
drop policy if exists sale_items_member_insert on public.sale_items;
create policy sale_items_role_insert on public.sale_items
for insert to authenticated
with check (
  exists (
    select 1 from public.sales s
    where s.id = sale_id
      and public.has_shop_role(s.shop_id, array['owner','manager','cashier'])
  )
);

-- PAYMENTS: authenticated permitted staff can append payments; no client edits/deletes.
drop policy if exists payments_member_insert on public.payments;
create policy payments_role_insert on public.payments
for insert to authenticated
with check (public.has_shop_role(shop_id, array['owner','manager','cashier']));

-- EXPENSES: financial expense records are management-only.
drop policy if exists expenses_member_insert on public.expenses;
drop policy if exists expenses_member_update on public.expenses;
drop policy if exists expenses_member_delete on public.expenses;
create policy expenses_role_insert on public.expenses
for insert to authenticated
with check (public.has_shop_role(shop_id, array['owner','manager']));
create policy expenses_role_update on public.expenses
for update to authenticated
using (public.has_shop_role(shop_id, array['owner','manager']))
with check (public.has_shop_role(shop_id, array['owner','manager']));
create policy expenses_role_delete on public.expenses
for delete to authenticated
using (public.has_shop_role(shop_id, array['owner','manager']));

-- STOCK MOVEMENTS: stockkeeper and management may append; history stays immutable.
drop policy if exists stock_movements_member_insert on public.stock_movements;
create policy stock_movements_role_insert on public.stock_movements
for insert to authenticated
with check (public.has_shop_role(shop_id, array['owner','manager','stockkeeper']));

-- DEBT REPAYMENTS: cashier and management may append; history stays immutable.
drop policy if exists debt_repayments_member_insert on public.debt_repayments;
create policy debt_repayments_role_insert on public.debt_repayments
for insert to authenticated
with check (public.has_shop_role(shop_id, array['owner','manager','cashier']));
