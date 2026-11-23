-- GUNX SMART BUSINESS: branch-scoped ledgers, refunds and debt workflows.
-- This migration closes the old shop-wide read paths and prevents clients from
-- invoking legacy stock RPCs that do not accept a branch identifier.

-- Keep every newly recorded debt payment attached to the debt's originating branch.
create or replace function public.assign_debt_payment_branch()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_branch_id uuid;
begin
  select d.branch_id into v_branch_id from public.debts d
  where d.id = new.debt_id and d.shop_id = new.shop_id;
  if v_branch_id is null then raise exception 'Debt has no valid branch attribution'; end if;
  new.branch_id := v_branch_id;
  return new;
end;
$$;
drop trigger if exists debt_payment_branch_attribution on public.debt_payments;
create trigger debt_payment_branch_attribution
before insert on public.debt_payments
for each row execute function public.assign_debt_payment_branch();

create or replace function public.create_manual_debt_in_branch(
  p_shop_id uuid,
  p_branch_id uuid,
  p_customer_name text,
  p_amount numeric,
  p_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_debt_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.has_branch_access(p_shop_id, p_branch_id) then
    raise exception 'Not permitted to create debt in this branch';
  end if;
  v_debt_id := public.create_manual_debt(p_shop_id, p_customer_name, p_amount, p_description);
  update public.debts set branch_id = p_branch_id where id = v_debt_id and shop_id = p_shop_id;
  return v_debt_id;
end;
$$;
revoke all on function public.create_manual_debt_in_branch(uuid,uuid,text,numeric,text) from public, anon;
grant execute on function public.create_manual_debt_in_branch(uuid,uuid,text,numeric,text) to authenticated;

create or replace function public.record_debt_payment_in_branch(
  p_branch_id uuid,
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
declare v_shop_id uuid; v_debt_branch uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select d.shop_id, d.branch_id into v_shop_id, v_debt_branch
  from public.debts d where d.id = p_debt_id;
  if not found then raise exception 'Debt not found'; end if;
  if v_debt_branch is distinct from p_branch_id
     or not public.has_branch_access(v_shop_id, p_branch_id) then
    raise exception 'Debt does not belong to the selected branch or access is denied';
  end if;
  return public.record_debt_payment(p_debt_id, p_amount, p_method, p_note);
end;
$$;
revoke all on function public.record_debt_payment_in_branch(uuid,uuid,numeric,text,text) from public, anon;
grant execute on function public.record_debt_payment_in_branch(uuid,uuid,numeric,text,text) to authenticated;

create or replace function public.refund_sale_in_branch(
  p_shop_id uuid,
  p_branch_id uuid,
  p_sale_id uuid,
  p_idempotency_key uuid,
  p_items jsonb,
  p_reason text,
  p_refund_method text default 'cash'
)
returns table(refund_id uuid, refund_total numeric)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sale_branch uuid;
  v_refund_id uuid;
  v_refund_total numeric;
  v_existing_branch uuid;
  v_item record;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select s.branch_id into v_sale_branch
  from public.sales s where s.id = p_sale_id and s.shop_id = p_shop_id;
  if not found then raise exception 'Sale not found'; end if;
  if v_sale_branch is distinct from p_branch_id
     or not public.has_branch_access(p_shop_id, p_branch_id) then
    raise exception 'Sale does not belong to the selected branch or access is denied';
  end if;

  select r.id, r.refund_total, r.branch_id into v_refund_id, v_refund_total, v_existing_branch
  from public.sale_refunds r
  where r.shop_id = p_shop_id and r.idempotency_key = p_idempotency_key;
  if v_refund_id is null then
    select x.refund_id, x.refund_total into v_refund_id, v_refund_total
    from public.refund_sale(p_shop_id, p_sale_id, p_idempotency_key, p_items, p_reason, p_refund_method) x;
    select r.branch_id into v_existing_branch from public.sale_refunds r where r.id = v_refund_id for update;
  end if;

  if v_existing_branch is not null then
    if v_existing_branch is distinct from p_branch_id then
      raise exception 'Refund idempotency key belongs to another branch';
    end if;
    return query select v_refund_id, v_refund_total;
    return;
  end if;

  -- Restore the per-branch quantity exactly once. The legacy refund RPC has
  -- already restored the compatibility shop-wide quantity and written ledger rows.
  for v_item in
    select ri.sale_item_id, si.product_id, ri.quantity
    from public.sale_refund_items ri
    join public.sale_items si on si.id = ri.sale_item_id
    where ri.refund_id = v_refund_id and si.product_id is not null
    order by si.product_id
  loop
    update public.branch_stock
    set quantity = quantity + v_item.quantity, updated_at = now()
    where shop_id = p_shop_id and branch_id = p_branch_id and product_id = v_item.product_id;
    if not found then raise exception 'Branch stock record missing for returned product %', v_item.product_id; end if;
  end loop;

  update public.sale_refunds set branch_id = p_branch_id where id = v_refund_id and shop_id = p_shop_id;
  update public.stock_movements set branch_id = p_branch_id
  where shop_id = p_shop_id and reference_id = v_refund_id and movement_type = 'return';

  return query select v_refund_id, v_refund_total;
end;
$$;
revoke all on function public.refund_sale_in_branch(uuid,uuid,uuid,uuid,jsonb,text,text) from public, anon;
grant execute on function public.refund_sale_in_branch(uuid,uuid,uuid,uuid,jsonb,text,text) to authenticated;

-- Branch assignment is now part of the authorization predicate for all ledger reads.
drop policy if exists sales_role_select on public.sales;
create policy sales_branch_role_select on public.sales
for select to authenticated
using (
  public.has_branch_access(shop_id, branch_id)
  and (
    public.has_shop_role(shop_id, array['owner','manager'])
    or (public.has_shop_role(shop_id, array['cashier']) and created_by = (select auth.uid()))
  )
);

drop policy if exists expenses_management_select on public.expenses;
create policy expenses_branch_management_select on public.expenses
for select to authenticated
using (
  public.has_branch_access(shop_id, branch_id)
  and public.has_shop_role(shop_id, array['owner','manager'])
);

drop policy if exists debts_role_select on public.debts;
create policy debts_branch_role_select on public.debts
for select to authenticated
using (
  public.has_branch_access(shop_id, branch_id)
  and (
    public.has_shop_role(shop_id, array['owner','manager'])
    or (public.has_shop_role(shop_id, array['cashier']) and created_by = (select auth.uid()))
  )
);

drop policy if exists debt_payments_role_select on public.debt_payments;
create policy debt_payments_branch_role_select on public.debt_payments
for select to authenticated
using (
  public.has_branch_access(shop_id, branch_id)
  and (
    public.has_shop_role(shop_id, array['owner','manager'])
    or (public.has_shop_role(shop_id, array['cashier']) and received_by = (select auth.uid()))
  )
);

drop policy if exists payments_role_select on public.payments;
create policy payments_branch_role_select on public.payments
for select to authenticated
using (
  public.has_branch_access(shop_id, branch_id)
  and (
    public.has_shop_role(shop_id, array['owner','manager'])
    or (
      public.has_shop_role(shop_id, array['cashier'])
      and exists (
        select 1 from public.sales s
        where s.id = sale_id and s.shop_id = payments.shop_id
          and s.branch_id = payments.branch_id
          and s.created_by = (select auth.uid())
      )
    )
  )
);

drop policy if exists stock_movements_role_select on public.stock_movements;
create policy stock_movements_branch_role_select on public.stock_movements
for select to authenticated
using (
  public.has_branch_access(shop_id, branch_id)
  and public.has_shop_role(shop_id, array['owner','manager','stockkeeper'])
);

drop policy if exists sale_refunds_management_select on public.sale_refunds;
create policy sale_refunds_branch_management_select on public.sale_refunds
for select to authenticated
using (
  public.has_branch_access(shop_id, branch_id)
  and public.has_shop_role(shop_id, array['owner','manager'])
);

-- Prevent old clients from bypassing branch stock allocation. SECURITY DEFINER
-- wrappers above call the legacy functions as their owner inside one transaction.
revoke all on function public.checkout_sale(uuid,uuid,jsonb,text,numeric,uuid,numeric) from public, authenticated;
revoke all on function public.receive_stock(uuid,uuid,numeric,text) from public, authenticated;
revoke all on function public.refund_sale(uuid,uuid,uuid,jsonb,text,text) from public, authenticated;

comment on function public.refund_sale_in_branch(uuid,uuid,uuid,uuid,jsonb,text,text) is
'Branch-authorized refund wrapper that restores branch inventory once and retains legacy financial/refund validation.';

-- Child rows inherit the branch boundary of their parent transaction.
drop policy if exists sale_items_role_select on public.sale_items;
create policy sale_items_branch_role_select on public.sale_items
for select to authenticated
using (
  exists (
    select 1 from public.sales s
    where s.id = sale_id
      and public.has_branch_access(s.shop_id, s.branch_id)
      and (
        public.has_shop_role(s.shop_id, array['owner','manager'])
        or (public.has_shop_role(s.shop_id, array['cashier']) and s.created_by = (select auth.uid()))
      )
  )
);

drop policy if exists sale_refund_items_management_select on public.sale_refund_items;
create policy sale_refund_items_branch_management_select on public.sale_refund_items
for select to authenticated
using (
  exists (
    select 1 from public.sale_refunds r
    where r.id = refund_id
      and public.has_branch_access(r.shop_id, r.branch_id)
      and public.has_shop_role(r.shop_id, array['owner','manager'])
  )
);

-- Expense writes are restricted to authorized management in the selected branch.
drop policy if exists expenses_member_insert on public.expenses;
create policy expenses_branch_insert on public.expenses
for insert to authenticated
with check (
  public.has_branch_access(shop_id, branch_id)
  and public.has_shop_role(shop_id, array['owner','manager'])
);
drop policy if exists expenses_member_update on public.expenses;
create policy expenses_branch_update on public.expenses
for update to authenticated
using (public.has_branch_access(shop_id, branch_id) and public.has_shop_role(shop_id, array['owner','manager']))
with check (public.has_branch_access(shop_id, branch_id) and public.has_shop_role(shop_id, array['owner','manager']));
drop policy if exists expenses_member_delete on public.expenses;
create policy expenses_branch_delete on public.expenses
for delete to authenticated
using (public.has_branch_access(shop_id, branch_id) and public.has_shop_role(shop_id, array['owner','manager']));

-- Debt RPCs without branch arguments must not remain callable by clients.
-- The branch-aware wrappers above invoke them as the function owner.
revoke all on function public.create_manual_debt(uuid,text,numeric,text) from public, authenticated;
revoke all on function public.record_debt_payment(uuid,numeric,text,text) from public, authenticated;
