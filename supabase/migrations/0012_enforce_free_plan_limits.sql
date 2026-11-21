-- Enforce Free quotas in PostgreSQL, including offline sales when they sync.
-- Pro is effective only while status=active and expires_at is in the future.
-- Existing records are never deleted or hidden when a subscription expires.

create or replace function public.enforce_product_plan_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_is_pro boolean := false;
  v_count bigint;
begin
  if tg_op <> 'INSERT' then return new; end if;

  -- Serialize quota-sensitive writes for this shop.
  perform pg_advisory_xact_lock(hashtextextended(new.shop_id::text || ':plan-quota', 0));

  select coalesce(bool_or(plan_code = 'pro' and status = 'active' and expires_at > now()), false)
    into v_is_pro
  from public.shop_subscriptions
  where shop_id = new.shop_id;

  if v_is_pro then return new; end if;

  select count(*) into v_count from public.products where shop_id = new.shop_id;
  if v_count >= 50 then
    raise exception 'FREE_PRODUCT_LIMIT: Free plan allows up to 50 products. Upgrade to GUNX PRO to add more.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists products_free_plan_limit on public.products;
create trigger products_free_plan_limit
before insert on public.products
for each row execute function public.enforce_product_plan_limit();

-- Rebuild checkout with the same server-side price, stock and idempotency guards,
-- plus monthly sales and outstanding-debtor quotas.
create or replace function public.checkout_sale(
  p_shop_id uuid,
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
  v_total numeric(14,2) := 0;
  v_paid numeric(14,2);
  v_item record;
  v_product public.products%rowtype;
  v_line numeric(14,2);
  v_status text;
  v_is_pro boolean := false;
  v_sales_count bigint := 0;
  v_debtor_count bigint := 0;
  v_customer_already_owes boolean := false;
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

  -- Shared lock serializes product creation and checkout quota checks per shop.
  perform pg_advisory_xact_lock(hashtextextended(p_shop_id::text || ':plan-quota', 0));
  perform pg_advisory_xact_lock(hashtextextended(p_shop_id::text || p_idempotency_key::text, 0));

  select cr.sale_id into v_sale_id
  from public.checkout_requests cr
  where cr.shop_id = p_shop_id and cr.idempotency_key = p_idempotency_key;
  if v_sale_id is not null then
    return query select s.id, s.receipt_number, s.total from public.sales s where s.id = v_sale_id;
    return;
  end if;

  select coalesce(bool_or(plan_code = 'pro' and status = 'active' and expires_at > now()), false)
    into v_is_pro
  from public.shop_subscriptions where shop_id = p_shop_id;

  if not v_is_pro then
    select count(*) into v_sales_count
    from public.sales
    where shop_id = p_shop_id
      and created_at >= date_trunc('month', now())
      and created_at < date_trunc('month', now()) + interval '1 month';
    if v_sales_count >= 100 then
      raise exception 'FREE_MONTHLY_SALES_LIMIT: Free plan allows 100 sales per month. Upgrade to GUNX PRO.'
        using errcode = 'P0001';
    end if;
  end if;

  if p_customer_id is not null and not exists (
    select 1 from public.customers c where c.id = p_customer_id and c.shop_id = p_shop_id
  ) then raise exception 'Customer does not belong to this shop'; end if;

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

  if p_expected_total is not null and round(p_expected_total, 2) <> v_total then
    raise exception 'PRICE_CHANGED: cached total % differs from current server total %', p_expected_total, v_total using errcode = '22023';
  end if;

  v_paid := coalesce(p_amount_paid, case when p_payment_method = 'credit' then 0 else v_total end);
  if v_paid < 0 or v_paid > v_total then raise exception 'Invalid amount paid'; end if;
  if p_payment_method <> 'credit' and v_paid = 0 then raise exception 'Payment amount required'; end if;
  v_status := case when v_paid >= v_total then 'completed' else 'partially_paid' end;

  -- Count customers with a current unpaid/part-paid sale. Only a new debtor
  -- consumes a slot; repeat credit sales to an existing debtor remain possible.
  if not v_is_pro and p_customer_id is not null and v_paid < v_total then
    select exists (
      select 1 from public.sales s
      where s.shop_id = p_shop_id and s.customer_id = p_customer_id
        and s.status = 'partially_paid' and s.amount_paid < s.total
    ) or exists (
      select 1 from public.debts d
      where d.shop_id = p_shop_id and d.customer_id = p_customer_id and d.balance > 0
    ) into v_customer_already_owes;

    if not v_customer_already_owes then
      select count(*) into v_debtor_count
      from (
        select s.customer_id
        from public.sales s
        where s.shop_id = p_shop_id and s.customer_id is not null
          and s.status = 'partially_paid' and s.amount_paid < s.total
        union
        select d.customer_id
        from public.debts d
        where d.shop_id = p_shop_id and d.balance > 0
      ) active_debtors;
      if v_debtor_count >= 10 then
        raise exception 'FREE_DEBTOR_LIMIT: Free plan allows up to 10 customers with outstanding debt. Upgrade to GUNX PRO.'
          using errcode = 'P0001';
      end if;
    end if;
  end if;

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

revoke all on function public.checkout_sale(uuid, uuid, jsonb, text, numeric, uuid, numeric) from public;
grant execute on function public.checkout_sale(uuid, uuid, jsonb, text, numeric, uuid, numeric) to authenticated;


-- Manual debt creation is a separate workflow from POS credit sales. Enforce the
-- same 10-customer outstanding-debtor quota here, using the debt ledger's balance.
create or replace function public.create_manual_debt(
  p_shop_id uuid,
  p_customer_name text,
  p_amount numeric,
  p_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_customer_id uuid;
  v_debt_id uuid;
  v_is_pro boolean := false;
  v_debtor_count bigint := 0;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.has_shop_role(p_shop_id, array['owner','manager','cashier']) then raise exception 'Not permitted'; end if;
  if p_customer_name is null or length(trim(p_customer_name)) < 2 or length(trim(p_customer_name)) > 120 then
    raise exception 'Customer name must be 2-120 characters';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Debt amount must be positive'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_shop_id::text || ':plan-quota', 0));
  select coalesce(bool_or(plan_code = 'pro' and status = 'active' and expires_at > now()), false)
    into v_is_pro
  from public.shop_subscriptions where shop_id = p_shop_id;

  if not v_is_pro then
    select count(*) into v_debtor_count
    from (
      select d.customer_id from public.debts d
      where d.shop_id = p_shop_id and d.balance > 0
      union
      select s.customer_id from public.sales s
      where s.shop_id = p_shop_id and s.customer_id is not null
        and s.status = 'partially_paid' and s.amount_paid < s.total
    ) active_debtors;
    if v_debtor_count >= 10 then
      raise exception 'FREE_DEBTOR_LIMIT: Free plan allows up to 10 customers with outstanding debt. Upgrade to GUNX PRO.'
        using errcode = 'P0001';
    end if;
  end if;

  insert into public.customers(shop_id, name)
  values (p_shop_id, trim(p_customer_name))
  returning id into v_customer_id;

  insert into public.debts(shop_id, customer_id, description, original_amount, balance, created_by)
  values (p_shop_id, v_customer_id, nullif(trim(coalesce(p_description, '')), ''), round(p_amount, 2), round(p_amount, 2), auth.uid())
  returning id into v_debt_id;
  return v_debt_id;
end;
$$;

revoke all on function public.create_manual_debt(uuid, text, numeric, text) from public;
grant execute on function public.create_manual_debt(uuid, text, numeric, text) to authenticated;

comment on function public.checkout_sale(uuid, uuid, jsonb, text, numeric, uuid, numeric) is
'Atomic checkout with idempotency, current-price and stock checks, plus server-enforced Free monthly sales and outstanding-debtor limits.';
