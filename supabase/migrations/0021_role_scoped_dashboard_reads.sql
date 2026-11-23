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

-- All stock, sale and payment writes must pass through audited SECURITY DEFINER RPCs.
-- This prevents clients from spoofing created_by or writing ledger rows directly.
drop policy if exists sales_role_insert on public.sales;
drop policy if exists sale_items_role_insert on public.sale_items;
drop policy if exists payments_role_insert on public.payments;
drop policy if exists stock_movements_role_insert on public.stock_movements;

-- Catalogue creation/archive belongs to management; stockkeepers use receive_stock().
drop policy if exists products_role_insert on public.products;
create policy products_management_insert on public.products
for insert to authenticated
with check (public.has_shop_role(shop_id, array['owner','manager']));
drop policy if exists products_role_delete on public.products;
create policy products_management_delete on public.products
for delete to authenticated
using (public.has_shop_role(shop_id, array['owner','manager']));

-- Cashier payment rows are created only by checkout_sale(); the RPC validates the sale
-- and records the authenticated user as created_by on the parent sale.
-- Restrict debt collection RPC so cashiers can only collect debts they created.
create or replace function public.record_debt_payment(
  p_debt_id uuid,
  p_amount numeric,
  p_method text default 'cash',
  p_note text default null
)
returns numeric
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_debt public.debts%rowtype;
  v_balance numeric(14,2);
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Payment amount must be positive'; end if;
  if p_method not in ('cash','mobile_money','bank') then raise exception 'Unsupported payment method'; end if;

  select * into v_debt from public.debts where id = p_debt_id for update;
  if not found then raise exception 'Debt not found'; end if;
  if not public.has_shop_role(v_debt.shop_id, array['owner','manager','cashier']) then
    raise exception 'Not permitted';
  end if;
  if public.has_shop_role(v_debt.shop_id, array['cashier'])
     and v_debt.created_by is distinct from auth.uid() then
    raise exception 'Cashiers can only collect debts they created';
  end if;
  if round(p_amount,2) > v_debt.balance then raise exception 'Payment exceeds outstanding balance'; end if;

  v_balance := v_debt.balance - round(p_amount,2);
  insert into public.debt_payments(shop_id,debt_id,amount,method,note,received_by)
  values(v_debt.shop_id,v_debt.id,round(p_amount,2),p_method,nullif(trim(coalesce(p_note,'')),''),auth.uid());
  update public.debts set balance = v_balance where id = v_debt.id;
  return v_balance;
end;
$$;
revoke all on function public.record_debt_payment(uuid,numeric,text,text) from public;
grant execute on function public.record_debt_payment(uuid,numeric,text,text) to authenticated;
