-- GUNX SMART BUSINESS: preserve the exact mobile-money provider in financial ledgers.
-- Keep the established method='mobile_money' value for backward compatibility;
-- provider columns distinguish M-Pesa, Airtel Money, Tigo Pesa and HaloPesa.

alter table public.payments
  add column if not exists provider text
  check (provider is null or provider in ('mpesa','airtel_money','tigo_pesa','halopesa'));
alter table public.debt_payments
  add column if not exists provider text
  check (provider is null or provider in ('mpesa','airtel_money','tigo_pesa','halopesa'));
alter table public.sale_refunds
  add column if not exists refund_provider text
  check (refund_provider is null or refund_provider in ('mpesa','airtel_money','tigo_pesa','halopesa'));
alter table public.expenses
  add column if not exists payment_provider text
  check (payment_provider is null or payment_provider in ('mpesa','airtel_money','tigo_pesa','halopesa'));

-- A provider is meaningful only when the generic payment method is mobile_money.
alter table public.payments drop constraint if exists payments_provider_method_check;
alter table public.payments add constraint payments_provider_method_check
  check (provider is null or method = 'mobile_money');
alter table public.debt_payments drop constraint if exists debt_payments_provider_method_check;
alter table public.debt_payments add constraint debt_payments_provider_method_check
  check (provider is null or method = 'mobile_money');
alter table public.sale_refunds drop constraint if exists sale_refunds_provider_method_check;
alter table public.sale_refunds add constraint sale_refunds_provider_method_check
  check (refund_provider is null or refund_method = 'mobile_money');
alter table public.expenses drop constraint if exists expenses_provider_method_check;
alter table public.expenses add constraint expenses_provider_method_check
  check (payment_provider is null or payment_method = 'mobile_money');

create or replace function public.checkout_sale_in_branch_with_provider(
  p_shop_id uuid,
  p_branch_id uuid,
  p_idempotency_key uuid,
  p_items jsonb,
  p_payment_method text default 'cash',
  p_amount_paid numeric default null,
  p_customer_id uuid default null,
  p_expected_total numeric default null,
  p_payment_provider text default null
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
  v_existing_provider text;
begin
  if p_payment_method = 'mobile_money' then
    if p_payment_provider is null or p_payment_provider not in ('mpesa','airtel_money','tigo_pesa','halopesa') then
      raise exception 'Choose a supported mobile-money provider';
    end if;
  elsif p_payment_provider is not null then
    raise exception 'Provider can only be set for mobile-money payments';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_shop_id::text || ':provider-checkout:' || p_idempotency_key::text, 0
  ));

  select s.id, s.receipt_number, s.total, pay.provider
    into v_sale_id, v_receipt, v_total, v_existing_provider
  from public.checkout_requests cr
  join public.sales s on s.id = cr.sale_id
  left join public.payments pay on pay.sale_id = s.id and pay.method = 'mobile_money'
  where cr.shop_id = p_shop_id and cr.idempotency_key = p_idempotency_key;

  if v_sale_id is not null then
    if v_existing_provider is not null and v_existing_provider is distinct from p_payment_provider then
      raise exception 'PAYMENT_PROVIDER_IDEMPOTENCY_MISMATCH: Retry must use the original provider';
    end if;
    return query select v_sale_id, v_receipt, v_total;
    return;
  end if;

  select result.sale_id, result.receipt_number, result.sale_total
    into v_sale_id, v_receipt, v_total
  from public.checkout_sale_in_branch(
    p_shop_id,p_branch_id,p_idempotency_key,p_items,p_payment_method,
    p_amount_paid,p_customer_id,p_expected_total
  ) result;

  if v_sale_id is null then raise exception 'Branch checkout did not return a sale'; end if;
  if p_payment_method = 'mobile_money' then
    update public.payments set provider = p_payment_provider
    where sale_id = v_sale_id and shop_id = p_shop_id and method = 'mobile_money';
  end if;
  return query select v_sale_id, v_receipt, v_total;
end;
$$;
revoke all on function public.checkout_sale_in_branch_with_provider(uuid,uuid,uuid,jsonb,text,numeric,uuid,numeric,text) from public, anon;
grant execute on function public.checkout_sale_in_branch_with_provider(uuid,uuid,uuid,jsonb,text,numeric,uuid,numeric,text) to authenticated;

create or replace function public.record_debt_payment_in_branch_with_provider(
  p_branch_id uuid,
  p_debt_id uuid,
  p_amount numeric,
  p_method text default 'cash',
  p_note text default null,
  p_provider text default null
)
returns numeric
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_shop_id uuid;
  v_balance numeric;
  v_payment_id uuid;
begin
  if p_method = 'mobile_money' then
    if p_provider is null or p_provider not in ('mpesa','airtel_money','tigo_pesa','halopesa') then
      raise exception 'Choose a supported mobile-money provider';
    end if;
  elsif p_provider is not null then
    raise exception 'Provider can only be set for mobile-money payments';
  end if;

  select d.shop_id into v_shop_id
  from public.debts d
  where d.id = p_debt_id and d.branch_id = p_branch_id
  for update;
  if not found then raise exception 'Debt not found in selected branch'; end if;

  v_balance := public.record_debt_payment_in_branch(
    p_branch_id,p_debt_id,p_amount,p_method,p_note
  );

  select dp.id into v_payment_id
  from public.debt_payments dp
  where dp.debt_id = p_debt_id and dp.shop_id = v_shop_id
    and dp.received_by = auth.uid()
  order by dp.received_at desc, dp.id desc
  limit 1
  for update;

  if v_payment_id is null then raise exception 'Debt payment ledger row was not created'; end if;
  update public.debt_payments set provider = p_provider where id = v_payment_id;
  return v_balance;
end;
$$;
revoke all on function public.record_debt_payment_in_branch_with_provider(uuid,uuid,numeric,text,text,text) from public, anon;
grant execute on function public.record_debt_payment_in_branch_with_provider(uuid,uuid,numeric,text,text,text) to authenticated;

create or replace function public.refund_sale_in_branch_with_provider(
  p_shop_id uuid,
  p_branch_id uuid,
  p_sale_id uuid,
  p_idempotency_key uuid,
  p_items jsonb,
  p_reason text,
  p_refund_method text default 'cash',
  p_refund_provider text default null
)
returns table(refund_id uuid, refund_total numeric)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_refund_id uuid;
  v_total numeric;
  v_existing_provider text;
begin
  if p_refund_method = 'mobile_money' then
    if p_refund_provider is null or p_refund_provider not in ('mpesa','airtel_money','tigo_pesa','halopesa') then
      raise exception 'Choose a supported mobile-money refund provider';
    end if;
  elsif p_refund_provider is not null then
    raise exception 'Provider can only be set for mobile-money refunds';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_shop_id::text || ':provider-refund:' || p_idempotency_key::text, 0
  ));
  select r.id,r.refund_total,r.refund_provider
    into v_refund_id,v_total,v_existing_provider
  from public.sale_refunds r
  where r.shop_id=p_shop_id and r.idempotency_key=p_idempotency_key;
  if v_refund_id is not null then
    if v_existing_provider is not null and v_existing_provider is distinct from p_refund_provider then
      raise exception 'REFUND_PROVIDER_IDEMPOTENCY_MISMATCH: Retry must use the original provider';
    end if;
    return query select v_refund_id,v_total;
    return;
  end if;

  select result.refund_id,result.refund_total
    into v_refund_id,v_total
  from public.refund_sale_in_branch(
    p_shop_id,p_branch_id,p_sale_id,p_idempotency_key,p_items,p_reason,p_refund_method
  ) result;

  if p_refund_method='mobile_money' then
    update public.sale_refunds set refund_provider=p_refund_provider
    where id=v_refund_id and shop_id=p_shop_id;
  end if;
  return query select v_refund_id,v_total;
end;
$$;
revoke all on function public.refund_sale_in_branch_with_provider(uuid,uuid,uuid,uuid,jsonb,text,text,text) from public, anon;
grant execute on function public.refund_sale_in_branch_with_provider(uuid,uuid,uuid,uuid,jsonb,text,text,text) to authenticated;

comment on column public.payments.provider is 'Exact mobile-money provider when method is mobile_money.';
comment on column public.debt_payments.provider is 'Exact mobile-money provider when method is mobile_money.';
comment on column public.sale_refunds.refund_provider is 'Exact mobile-money provider used for the refund.';
comment on column public.expenses.payment_provider is 'Exact mobile-money provider used to pay the expense.';
