-- GUNX SMART BUSINESS: auditable branch stock counts and adjustments.
-- All inventory changes remain server-side and are recorded in both the
-- adjustment audit ledger and the existing stock_movements ledger.

create table if not exists public.branch_stock_adjustments (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  branch_id uuid not null,
  product_id uuid not null,
  adjustment_type text not null check (adjustment_type in ('count','damage','loss','correction')),
  quantity_before numeric(14,3) not null check (quantity_before >= 0),
  quantity_after numeric(14,3) not null check (quantity_after >= 0),
  quantity_change numeric(14,3) not null,
  reason text not null,
  idempotency_key uuid not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  constraint branch_stock_adjustments_branch_fk
    foreign key (shop_id, branch_id) references public.branches(shop_id, id),
  constraint branch_stock_adjustments_product_fk
    foreign key (shop_id, product_id) references public.products(shop_id, id),
  constraint branch_stock_adjustments_idempotency_unique
    unique (shop_id, idempotency_key),
  constraint branch_stock_adjustments_reason_length
    check (length(trim(reason)) between 3 and 500)
);

create index if not exists branch_stock_adjustments_branch_date_idx
  on public.branch_stock_adjustments(shop_id, branch_id, created_at desc);
create index if not exists branch_stock_adjustments_product_date_idx
  on public.branch_stock_adjustments(shop_id, product_id, created_at desc);

alter table public.branch_stock_adjustments enable row level security;
drop policy if exists branch_stock_adjustments_select on public.branch_stock_adjustments;
create policy branch_stock_adjustments_select on public.branch_stock_adjustments
for select to authenticated
using (
  public.has_branch_access(shop_id, branch_id)
  and public.has_shop_role(shop_id, array['owner','manager','stockkeeper'])
);
revoke all on public.branch_stock_adjustments from anon, authenticated;
grant select on public.branch_stock_adjustments to authenticated;

create or replace function public.adjust_branch_stock(
  p_shop_id uuid,
  p_branch_id uuid,
  p_product_id uuid,
  p_adjustment_type text,
  p_quantity numeric,
  p_reason text,
  p_idempotency_key uuid
)
returns table (
  adjustment_id uuid,
  quantity_before numeric,
  quantity_after numeric,
  quantity_change numeric
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_product public.products%rowtype;
  v_before numeric(14,3);
  v_after numeric(14,3);
  v_delta numeric(14,3);
  v_adjustment_id uuid;
  v_existing public.branch_stock_adjustments%rowtype;
  v_reason text := trim(coalesce(p_reason, ''));
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_idempotency_key is null then raise exception 'Adjustment idempotency key required'; end if;
  if p_adjustment_type is null or p_adjustment_type not in ('count','damage','loss','correction') then
    raise exception 'Invalid stock adjustment type';
  end if;
  if p_quantity is null or abs(p_quantity) > 100000000 then
    raise exception 'Invalid stock quantity';
  end if;
  if length(v_reason) < 3 or length(v_reason) > 500 then
    raise exception 'Provide a reason between 3 and 500 characters';
  end if;
  if not public.has_shop_role(p_shop_id, array['owner','manager','stockkeeper'])
     or not public.has_branch_access(p_shop_id, p_branch_id) then
    raise exception 'Not permitted to adjust stock in this branch';
  end if;
  if p_adjustment_type in ('damage','loss') and p_quantity <= 0 then
    raise exception 'Damage/loss quantity must be greater than zero';
  end if;
  if p_adjustment_type = 'count' and p_quantity < 0 then
    raise exception 'Counted stock cannot be negative';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_shop_id::text || ':branch-stock-adjustment:' || p_idempotency_key::text, 0
  ));

  select * into v_existing
  from public.branch_stock_adjustments
  where shop_id = p_shop_id and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.branch_id is distinct from p_branch_id
       or v_existing.product_id is distinct from p_product_id
       or v_existing.adjustment_type is distinct from p_adjustment_type
       or (p_adjustment_type <> 'count' and v_existing.quantity_change is distinct from
            case when p_adjustment_type in ('damage','loss') then -round(p_quantity, 3) else round(p_quantity, 3) end)
       or (p_adjustment_type = 'count' and v_existing.quantity_after is distinct from round(p_quantity, 3))
       or v_existing.reason is distinct from v_reason then
      raise exception 'STOCK_ADJUSTMENT_IDEMPOTENCY_MISMATCH: Key belongs to a different adjustment';
    end if;
    return query select v_existing.id, v_existing.quantity_before,
      v_existing.quantity_after, v_existing.quantity_change;
    return;
  end if;

  -- Lock the product first, then the branch balance, so global compatibility
  -- stock and branch stock cannot be concurrently changed out of sequence.
  select * into v_product
  from public.products
  where id = p_product_id and shop_id = p_shop_id
  for update;
  if not found then raise exception 'Product not found in this business'; end if;

  select quantity into v_before
  from public.branch_stock
  where shop_id = p_shop_id and branch_id = p_branch_id and product_id = p_product_id
  for update;
  if not found then raise exception 'Branch stock record not found'; end if;

  if p_adjustment_type = 'count' then
    v_after := round(p_quantity, 3);
  elsif p_adjustment_type in ('damage','loss') then
    v_after := v_before - round(p_quantity, 3);
  else
    v_after := v_before + round(p_quantity, 3);
  end if;
  if v_after < 0 then raise exception 'Adjustment would make branch stock negative'; end if;

  v_delta := v_after - v_before;
  if v_product.stock_quantity + v_delta < 0 then
    raise exception 'Adjustment would make compatibility stock negative';
  end if;

  update public.branch_stock
  set quantity = v_after, updated_at = now()
  where shop_id = p_shop_id and branch_id = p_branch_id and product_id = p_product_id;

  update public.products
  set stock_quantity = stock_quantity + v_delta
  where id = p_product_id and shop_id = p_shop_id;

  insert into public.branch_stock_adjustments(
    shop_id, branch_id, product_id, adjustment_type, quantity_before,
    quantity_after, quantity_change, reason, idempotency_key, created_by
  ) values (
    p_shop_id, p_branch_id, p_product_id, p_adjustment_type, v_before,
    v_after, v_delta, v_reason, p_idempotency_key, auth.uid()
  ) returning id into v_adjustment_id;

  insert into public.stock_movements(
    shop_id, branch_id, product_id, movement_type, quantity_change,
    reference_id, note, created_by
  ) values (
    p_shop_id, p_branch_id, p_product_id, 'adjustment', v_delta,
    v_adjustment_id, p_adjustment_type || ': ' || v_reason, auth.uid()
  );

  return query select v_adjustment_id, v_before, v_after, v_delta;
end;
$$;

revoke all on function public.adjust_branch_stock(uuid,uuid,uuid,text,numeric,text,uuid)
  from public, anon;
grant execute on function public.adjust_branch_stock(uuid,uuid,uuid,text,numeric,text,uuid)
  to authenticated;

comment on table public.branch_stock_adjustments is
  'Append-only audit ledger for branch stock counts, damage, loss and corrections.';
comment on function public.adjust_branch_stock(uuid,uuid,uuid,text,numeric,text,uuid) is
  'Atomically applies a branch stock count or adjustment, updates the compatibility total, and records an idempotent audit movement.';
