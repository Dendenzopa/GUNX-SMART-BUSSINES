-- GUNX SMART BUSINESS: branch-aware checkout and receiving.
-- Uses the existing audited checkout transaction for pricing, quotas, payment,
-- idempotency and ledger writes, then atomically allocates the stock movement
-- to the selected authorized branch. Any failure rolls back the entire call.

create or replace function public.ensure_product_branch_stock()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.branch_stock(shop_id, branch_id, product_id, quantity, reorder_level)
  select new.shop_id, b.id, new.id, 0, new.reorder_level
  from public.branches b
  where b.shop_id = new.shop_id and b.active
  on conflict (branch_id, product_id) do nothing;
  return new;
end;
$$;

drop trigger if exists products_create_branch_stock on public.products;
create trigger products_create_branch_stock
after insert on public.products
for each row execute function public.ensure_product_branch_stock();

-- Ensure products created between migration 0024 and this migration also get rows.
insert into public.branch_stock(shop_id, branch_id, product_id, quantity, reorder_level)
select p.shop_id, b.id, p.id, 0, p.reorder_level
from public.products p
join public.branches b on b.shop_id = p.shop_id and b.active
on conflict (branch_id, product_id) do nothing;

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

create or replace function public.receive_stock_in_branch(
  p_shop_id uuid,
  p_branch_id uuid,
  p_product_id uuid,
  p_quantity numeric,
  p_note text default null
)
returns numeric
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_product public.products%rowtype;
  v_new_branch_stock numeric(14,3);
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.has_shop_role(p_shop_id, array['owner','manager','stockkeeper'])
     or not public.has_branch_access(p_shop_id, p_branch_id) then
    raise exception 'Not permitted to receive stock in this branch';
  end if;
  if p_quantity is null or p_quantity <= 0 or p_quantity > 100000000 then
    raise exception 'Invalid stock quantity';
  end if;

  select * into v_product
  from public.products
  where id = p_product_id and shop_id = p_shop_id and active
  for update;
  if not found then raise exception 'Product not found or inactive'; end if;

  update public.branch_stock
  set quantity = quantity + p_quantity, updated_at = now()
  where shop_id = p_shop_id and branch_id = p_branch_id and product_id = p_product_id
  returning quantity into v_new_branch_stock;
  if not found then raise exception 'Branch stock record missing for product'; end if;

  update public.products
  set stock_quantity = stock_quantity + p_quantity
  where id = p_product_id and shop_id = p_shop_id;

  insert into public.stock_movements(shop_id, branch_id, product_id, movement_type, quantity_change, note, created_by)
  values(p_shop_id, p_branch_id, p_product_id, 'stock_in', p_quantity,
    nullif(trim(coalesce(p_note,'')),''), auth.uid());

  return v_new_branch_stock;
end;
$$;

revoke all on function public.receive_stock_in_branch(uuid,uuid,uuid,numeric,text) from public, anon;
grant execute on function public.receive_stock_in_branch(uuid,uuid,uuid,numeric,text) to authenticated;

comment on function public.checkout_sale_in_branch(uuid,uuid,uuid,jsonb,text,numeric,uuid,numeric) is
'Atomic branch-aware checkout. Delegates price, quota, payment and idempotency validation to checkout_sale and allocates stock to one authorized branch in the same transaction.';
comment on function public.receive_stock_in_branch(uuid,uuid,uuid,numeric,text) is
'Adds stock to one authorized branch and the legacy shop-wide compatibility total, recording an audited branch movement.';
