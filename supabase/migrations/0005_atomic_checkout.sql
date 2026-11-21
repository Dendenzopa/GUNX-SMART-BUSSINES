-- Atomic server-side checkout. Prices and stock are read from the database, never trusted from the device.
create table if not exists public.checkout_requests (
  shop_id uuid not null references public.shops(id) on delete cascade,
  idempotency_key uuid not null,
  sale_id uuid references public.sales(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (shop_id, idempotency_key)
);
alter table public.checkout_requests enable row level security;

create or replace function public.checkout_sale(
  p_shop_id uuid,
  p_idempotency_key uuid,
  p_items jsonb,
  p_payment_method text default 'cash',
  p_amount_paid numeric default null,
  p_customer_id uuid default null
)
returns table(sale_id uuid, receipt_number text, sale_total numeric)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sale_id uuid;
  v_receipt text;
  v_total numeric(14,2) := 0;
  v_paid numeric(14,2);
  v_item record;
  v_product public.products%rowtype;
  v_line numeric(14,2);
  v_status text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.has_shop_role(p_shop_id, array['owner','manager','cashier']) then
    raise exception 'Not permitted to make sales for this shop';
  end if;
  if p_idempotency_key is null then raise exception 'Idempotency key required'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one item is required';
  end if;
  if p_payment_method not in ('cash','mobile_money','bank','credit') then
    raise exception 'Unsupported payment method';
  end if;

  -- Serialize requests with the same key; repeated retries return the original sale.
  perform pg_advisory_xact_lock(hashtextextended(p_shop_id::text || p_idempotency_key::text, 0));
  select cr.sale_id into v_sale_id
  from public.checkout_requests cr
  where cr.shop_id = p_shop_id and cr.idempotency_key = p_idempotency_key;
  if v_sale_id is not null then
    return query select s.id, s.receipt_number, s.total from public.sales s where s.id = v_sale_id;
    return;
  end if;

  if p_customer_id is not null and not exists (
    select 1 from public.customers c where c.id = p_customer_id and c.shop_id = p_shop_id
  ) then raise exception 'Customer does not belong to this shop'; end if;

  -- Reject duplicate product lines to keep locking and stock accounting deterministic.
  if exists (
    select 1 from jsonb_to_recordset(p_items) as x(product_id uuid, quantity numeric)
    group by x.product_id having count(*) > 1
  ) then raise exception 'Duplicate product lines are not allowed'; end if;

  for v_item in
    select x.product_id, x.quantity
    from jsonb_to_recordset(p_items) as x(product_id uuid, quantity numeric)
    order by x.product_id
  loop
    if v_item.product_id is null or v_item.quantity is null or v_item.quantity <= 0 then
      raise exception 'Invalid product or quantity';
    end if;
    select * into v_product
    from public.products p
    where p.id = v_item.product_id and p.shop_id = p_shop_id and p.active
    for update;
    if not found then raise exception 'Product not found or inactive'; end if;
    if v_product.stock_quantity < v_item.quantity then
      raise exception 'Insufficient stock for %', v_product.name;
    end if;
    v_line := round(v_product.selling_price * v_item.quantity, 2);
    v_total := v_total + v_line;
  end loop;

  v_paid := coalesce(p_amount_paid, case when p_payment_method = 'credit' then 0 else v_total end);
  if v_paid < 0 or v_paid > v_total then raise exception 'Invalid amount paid'; end if;
  if p_payment_method <> 'credit' and v_paid = 0 then raise exception 'Payment amount required'; end if;
  v_status := case when v_paid >= v_total then 'completed' else 'partially_paid' end;

  v_receipt := 'GX-' || to_char(clock_timestamp() at time zone 'Africa/Dar_es_Salaam', 'YYYYMMDD-HH24MISS') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
  insert into public.sales(shop_id, receipt_number, customer_id, status, subtotal, discount, total, amount_paid, created_by)
  values(p_shop_id, v_receipt, p_customer_id, v_status, v_total, 0, v_total, v_paid, auth.uid())
  returning id into v_sale_id;

  for v_item in
    select x.product_id, x.quantity
    from jsonb_to_recordset(p_items) as x(product_id uuid, quantity numeric)
    order by x.product_id
  loop
    select * into v_product from public.products p
    where p.id = v_item.product_id and p.shop_id = p_shop_id for update;
    v_line := round(v_product.selling_price * v_item.quantity, 2);
    insert into public.sale_items(sale_id, product_id, product_name_snapshot, quantity, unit_price, unit_cost_snapshot, line_total)
    values(v_sale_id, v_product.id, v_product.name, v_item.quantity, v_product.selling_price, v_product.cost_price, v_line);
    update public.products set stock_quantity = stock_quantity - v_item.quantity where id = v_product.id;
    insert into public.stock_movements(shop_id, product_id, movement_type, quantity_change, reference_id, created_by)
    values(p_shop_id, v_product.id, 'sale', -v_item.quantity, v_sale_id, auth.uid());
  end loop;

  if v_paid > 0 then
    insert into public.payments(shop_id, sale_id, customer_id, method, amount)
    values(p_shop_id, v_sale_id, p_customer_id, p_payment_method, v_paid);
  end if;
  insert into public.checkout_requests(shop_id, idempotency_key, sale_id)
  values(p_shop_id, p_idempotency_key, v_sale_id);

  return query select v_sale_id, v_receipt, v_total;
end;
$$;

revoke all on function public.checkout_sale(uuid, uuid, jsonb, text, numeric, uuid) from public;
grant execute on function public.checkout_sale(uuid, uuid, jsonb, text, numeric, uuid) to authenticated;
