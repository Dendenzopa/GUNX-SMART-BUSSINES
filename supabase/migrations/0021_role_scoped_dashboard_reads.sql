-- GUNX SMART BUSINESS: enforce role-scoped reads used by the role-specific dashboards.
-- Branch-level scoping is intentionally deferred until branch membership and branch_id
-- are introduced; this migration enforces the current shop-level boundary only.

-- Managers and owners can review all sales. Cashiers can review only sales they created.
drop policy if exists sales_member_select on public.sales;
create policy sales_role_select on public.sales
for select to authenticated
using (
  public.has_shop_role(shop_id, array['owner','manager'])
  or (public.has_shop_role(shop_id, array['cashier']) and created_by = (select auth.uid()))
);

-- Only management can read expenses and full debt ledgers. Cashiers can see debts they created
-- and collections they personally received, which supports their own counter workflow.
drop policy if exists expenses_member_select on public.expenses;
create policy expenses_management_select on public.expenses
for select to authenticated
using (public.has_shop_role(shop_id, array['owner','manager']));

drop policy if exists debts_member_select on public.debts;
create policy debts_role_select on public.debts
for select to authenticated
using (
  public.has_shop_role(shop_id, array['owner','manager'])
  or (public.has_shop_role(shop_id, array['cashier']) and created_by = (select auth.uid()))
);

drop policy if exists debt_payments_member_select on public.debt_payments;
create policy debt_payments_role_select on public.debt_payments
for select to authenticated
using (
  public.has_shop_role(shop_id, array['owner','manager'])
  or (public.has_shop_role(shop_id, array['cashier']) and received_by = (select auth.uid()))
);

-- A cashier can read payments attached to their own sales; management can read shop payments.
drop policy if exists payments_member_select on public.payments;
create policy payments_role_select on public.payments
for select to authenticated
using (
  public.has_shop_role(shop_id, array['owner','manager'])
  or (
    public.has_shop_role(shop_id, array['cashier'])
    and exists (
      select 1 from public.sales s
      where s.id = sale_id and s.shop_id = payments.shop_id
        and s.created_by = (select auth.uid())
    )
  )
);

-- Sale line items must follow the parent sale's visibility, not broad shop membership.
drop policy if exists sale_items_member_select on public.sale_items;
create policy sale_items_role_select on public.sale_items
for select to authenticated
using (
  exists (
    select 1 from public.sales s
    where s.id = sale_id
      and (
        public.has_shop_role(s.shop_id, array['owner','manager'])
        or (public.has_shop_role(s.shop_id, array['cashier']) and s.created_by = (select auth.uid()))
      )
  )
);

-- Refund history is sensitive financial information and is restricted to management.
drop policy if exists sale_refunds_member_select on public.sale_refunds;
create policy sale_refunds_management_select on public.sale_refunds
for select to authenticated
using (public.has_shop_role(shop_id, array['owner','manager']));

drop policy if exists sale_refund_items_member_select on public.sale_refund_items;
create policy sale_refund_items_management_select on public.sale_refund_items
for select to authenticated
using (
  exists (
    select 1 from public.sale_refunds r
    where r.id = refund_id
      and public.has_shop_role(r.shop_id, array['owner','manager'])
  )
);

-- Stock movement history is available to stockkeepers and management, not cashiers.
drop policy if exists stock_movements_member_select on public.stock_movements;
create policy stock_movements_role_select on public.stock_movements
for select to authenticated
using (public.has_shop_role(shop_id, array['owner','manager','stockkeeper']));
