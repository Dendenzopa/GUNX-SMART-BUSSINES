-- GUNX SMART BUSINESS: require an open branch session before new POS sales.
drop policy if exists branch_cash_sessions_select on public.branch_cash_sessions;
create policy branch_cash_sessions_select on public.branch_cash_sessions
for select to authenticated
using (public.has_branch_access(shop_id,branch_id));

create or replace function public.checkout_sale_in_branch(
  p_shop_id uuid,
  p_branch_id uuid,
  p_idempotency_key uuid,
  p_items jsonb,
  p_payment_method text default 'cash',
  p_amount_paid numeric default null,
  p_customer_id uuid default null,
  p_expected_total numeric default null
)
returns table(sale_id uuid, receipt_number text, sale_total numeric)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sale_id uuid;
  v_receipt text;
  v_total numeric;
  v_existing_branch uuid;
  v_item record;
  v_stock numeric(14,3);
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.has_branch_access(p_shop_id, p_branch_id) then
    raise exception 'Not permitted to sell from this branch';
  end if;

  -- Serialize this idempotency key at the wrapper level as well as in the
  -- underlying checkout. The nested function remains the source of truth.
  perform pg_advisory_xact_lock(hashtextextended(p_shop_id::text || ':branch:' || p_branch_id::text || ':' || p_idempotency_key::text, 0));

  select s.id, s.receipt_number, s.total, s.branch_id
  into v_sale_id, v_receipt, v_total, v_existing_branch
  from public.sales s
  join public.checkout_requests cr on cr.sale_id = s.id
  where cr.shop_id = p_shop_id and cr.idempotency_key = p_idempotency_key;

  if v_sale_id is not null then
    if v_existing_branch is distinct from p_branch_id then
      raise exception 'IDEMPOTENCY_BRANCH_MISMATCH: This checkout key belongs to another branch';
    end if;
    return query select v_sale_id, v_receipt, v_total;
    return;
  end if;

  select c.sale_id, s.receipt_number, s.total, s.branch_id
  into v_sale_id, v_receipt, v_total, v_existing_branch
  from public.checkout_sale(
    p_shop_id, p_idempotency_key, p_items, p_payment_method,
    p_amount_paid, p_customer_id, p_expected_total
  ) c
  join public.sales s on s.id = c.sale_id;

  if v_sale_id is null then raise exception 'Checkout did not return a sale'; end if;
  -- A concurrent retry may have completed through another branch wrapper while
  -- this request waited on the underlying shop-wide idempotency lock.
  if v_existing_branch is not null then
    if v_existing_branch is distinct from p_branch_id then
      raise exception 'IDEMPOTENCY_BRANCH_MISMATCH: This checkout key belongs to another branch';
    end if;
    return query select v_sale_id, v_receipt, v_total;
    return;
  end if;

  -- A branch must be opened before new sales can be accepted. Existing idempotent
  -- retries return above, so syncing a previously accepted sale is safe.
  if not exists (
    select 1 from public.branch_cash_sessions cs
    where cs.shop_id = p_shop_id and cs.branch_id = p_branch_id and cs.status = 'open'
  ) then
    raise exception 'BRANCH_SESSION_CLOSED: Open this branch before starting sales';
  end if;

  -- The legacy checkout has already reduced the shop-wide compatibility balance.
  -- Allocate the same quantity from this branch. Any shortfall aborts/rolls back
  -- the sale, payment and global stock update together.
  for v_item in
    select si.product_id, si.quantity
    from public.sale_items si
    where si.sale_id = v_sale_id and si.product_id is not null
    order by si.product_id
  loop
    select bs.quantity into v_stock
    from public.branch_stock bs
    where bs.shop_id = p_shop_id
      and bs.branch_id = p_branch_id
      and bs.product_id = v_item.product_id
    for update;
    if not found then
      raise exception 'Branch stock record missing for product %', v_item.product_id;
    end if;
    if v_stock < v_item.quantity then
      raise exception 'Insufficient stock in selected branch for product %', v_item.product_id;
    end if;
    update public.branch_stock
    set quantity = quantity - v_item.quantity, updated_at = now()
    where shop_id = p_shop_id and branch_id = p_branch_id and product_id = v_item.product_id;
  end loop;

  update public.sales set branch_id = p_branch_id where id = v_sale_id and shop_id = p_shop_id;
  update public.stock_movements
  set branch_id = p_branch_id
  where shop_id = p_shop_id and reference_id = v_sale_id and movement_type = 'sale';
  update public.payments set branch_id = p_branch_id
  where shop_id = p_shop_id and sale_id = v_sale_id;

  return query select v_sale_id, v_receipt, v_total;
end;
$$;

revoke all on function public.checkout_sale_in_branch(uuid,uuid,uuid,jsonb,text,numeric,uuid,numeric) from public, anon;
grant execute on function public.checkout_sale_in_branch(uuid,uuid,uuid,jsonb,text,numeric,uuid,numeric) to authenticated;

comment on function public.checkout_sale_in_branch(uuid,uuid,uuid,jsonb,text,numeric,uuid,numeric) is
'Atomic branch checkout with idempotent retries and mandatory open cash session for new sales.';
