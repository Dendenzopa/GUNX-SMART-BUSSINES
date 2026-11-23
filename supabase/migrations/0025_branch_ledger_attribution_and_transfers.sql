-- GUNX SMART BUSINESS: branch attribution for existing operational ledgers
-- and audited stock transfers between authorized branches.
-- Existing records are attributed to the shop's primary branch. The legacy
-- checkout/receiving/refund RPCs remain enabled until their branch-aware
-- replacements are deployed; do not enable branch-filtered RLS before that rollout.

alter table public.sales add column if not exists branch_id uuid;
alter table public.payments add column if not exists branch_id uuid;
alter table public.expenses add column if not exists branch_id uuid;
alter table public.stock_movements add column if not exists branch_id uuid;
alter table public.debts add column if not exists branch_id uuid;
alter table public.debt_payments add column if not exists branch_id uuid;
alter table public.sale_refunds add column if not exists branch_id uuid;

-- Attribute historic rows to the primary branch without changing financial values.
update public.sales s set branch_id = b.id
from public.branches b where b.shop_id = s.shop_id and b.is_primary and s.branch_id is null;

update public.payments p set branch_id = s.branch_id
from public.sales s where s.id = p.sale_id and p.branch_id is null;

update public.payments p set branch_id = b.id
from public.branches b where b.shop_id = p.shop_id and b.is_primary and p.branch_id is null;

update public.expenses e set branch_id = b.id
from public.branches b where b.shop_id = e.shop_id and b.is_primary and e.branch_id is null;

update public.stock_movements m set branch_id = b.id
from public.branches b where b.shop_id = m.shop_id and b.is_primary and m.branch_id is null;

update public.debts d set branch_id = b.id
from public.branches b where b.shop_id = d.shop_id and b.is_primary and d.branch_id is null;

update public.debt_payments dp set branch_id = d.branch_id
from public.debts d where d.id = dp.debt_id and dp.branch_id is null;

update public.sale_refunds r set branch_id = s.branch_id
from public.sales s where s.id = r.sale_id and r.branch_id is null;

-- Composite foreign keys prevent cross-shop branch attribution.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sales_shop_branch_fk') then
    alter table public.sales add constraint sales_shop_branch_fk
      foreign key (shop_id, branch_id) references public.branches(shop_id, id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'payments_shop_branch_fk') then
    alter table public.payments add constraint payments_shop_branch_fk
      foreign key (shop_id, branch_id) references public.branches(shop_id, id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'expenses_shop_branch_fk') then
    alter table public.expenses add constraint expenses_shop_branch_fk
      foreign key (shop_id, branch_id) references public.branches(shop_id, id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'stock_movements_shop_branch_fk') then
    alter table public.stock_movements add constraint stock_movements_shop_branch_fk
      foreign key (shop_id, branch_id) references public.branches(shop_id, id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'debts_shop_branch_fk') then
    alter table public.debts add constraint debts_shop_branch_fk
      foreign key (shop_id, branch_id) references public.branches(shop_id, id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'debt_payments_shop_branch_fk') then
    alter table public.debt_payments add constraint debt_payments_shop_branch_fk
      foreign key (shop_id, branch_id) references public.branches(shop_id, id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sale_refunds_shop_branch_fk') then
    alter table public.sale_refunds add constraint sale_refunds_shop_branch_fk
      foreign key (shop_id, branch_id) references public.branches(shop_id, id);
  end if;
end $$;

create index if not exists sales_shop_branch_date_idx on public.sales(shop_id, branch_id, created_at desc);
create index if not exists expenses_shop_branch_date_idx on public.expenses(shop_id, branch_id, expense_date desc);
create index if not exists stock_movements_shop_branch_date_idx on public.stock_movements(shop_id, branch_id, created_at desc);
create index if not exists debts_shop_branch_balance_idx on public.debts(shop_id, branch_id, balance) where balance > 0;
create index if not exists payments_shop_branch_date_idx on public.payments(shop_id, branch_id, received_at desc);

-- Transfers are first-class audited records; no client may write balances directly.
create table if not exists public.branch_stock_transfers (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  from_branch_id uuid not null,
  to_branch_id uuid not null,
  product_id uuid not null,
  idempotency_key uuid not null,
  quantity numeric(14,3) not null check (quantity > 0),
  note text,
  status text not null default 'completed' check (status = 'completed'),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  constraint branch_stock_transfer_distinct_branches check (from_branch_id <> to_branch_id),
  constraint branch_stock_transfers_idempotency_unique unique (shop_id,idempotency_key),
  constraint branch_stock_transfer_from_fk foreign key (shop_id, from_branch_id)
    references public.branches(shop_id, id),
  constraint branch_stock_transfer_to_fk foreign key (shop_id, to_branch_id)
    references public.branches(shop_id, id),
  constraint branch_stock_transfer_product_fk foreign key (shop_id, product_id)
    references public.products(shop_id, id)
);

create index if not exists branch_stock_transfers_shop_date_idx
  on public.branch_stock_transfers(shop_id, created_at desc);
alter table public.branch_stock_transfers enable row level security;
drop policy if exists branch_stock_transfers_select on public.branch_stock_transfers;
create policy branch_stock_transfers_select on public.branch_stock_transfers
for select to authenticated
using (
  public.has_branch_access(shop_id, from_branch_id)
  and public.has_branch_access(shop_id, to_branch_id)
);
revoke all on public.branch_stock_transfers from anon, authenticated;
grant select on public.branch_stock_transfers to authenticated;

-- Add transfer movement types while retaining the existing movement vocabulary.
alter table public.stock_movements
  drop constraint if exists stock_movements_movement_type_check;
alter table public.stock_movements
  add constraint stock_movements_movement_type_check
  check (movement_type in ('stock_in','sale','return','adjustment','transfer_out','transfer_in'));

create or replace function public.transfer_branch_stock(
  p_shop_id uuid,
  p_idempotency_key uuid,
  p_from_branch_id uuid,
  p_to_branch_id uuid,
  p_product_id uuid,
  p_quantity numeric,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_transfer_id uuid;
  v_source_qty numeric(14,3);
  v_existing public.branch_stock_transfers%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_idempotency_key is null then raise exception 'Transfer idempotency key required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_shop_id::text || ':branch-transfer:' || p_idempotency_key::text, 0));
  select * into v_existing from public.branch_stock_transfers
  where shop_id=p_shop_id and idempotency_key=p_idempotency_key;
  if found then
    if v_existing.from_branch_id is distinct from p_from_branch_id
       or v_existing.to_branch_id is distinct from p_to_branch_id
       or v_existing.product_id is distinct from p_product_id
       or v_existing.quantity is distinct from p_quantity then
      raise exception 'TRANSFER_IDEMPOTENCY_MISMATCH: Key already belongs to a different transfer';
    end if;
    return v_existing.id;
  end if;
  if p_from_branch_id is null or p_to_branch_id is null or p_from_branch_id = p_to_branch_id then
    raise exception 'Choose two different branches';
  end if;
  if p_quantity is null or p_quantity <= 0 or p_quantity > 100000000 then
    raise exception 'Invalid transfer quantity';
  end if;
  if not public.has_shop_role(p_shop_id, array['owner','manager','stockkeeper'])
     or not public.has_branch_access(p_shop_id, p_from_branch_id)
     or not public.has_branch_access(p_shop_id, p_to_branch_id) then
    raise exception 'Not permitted to transfer stock between these branches';
  end if;

  -- Lock in a deterministic order to avoid deadlocks during concurrent transfers.
  perform 1 from public.branch_stock
  where shop_id = p_shop_id and product_id = p_product_id
    and branch_id in (p_from_branch_id, p_to_branch_id)
  order by branch_id
  for update;

  select quantity into v_source_qty
  from public.branch_stock
  where shop_id = p_shop_id and branch_id = p_from_branch_id and product_id = p_product_id;
  if not found then raise exception 'Product has no stock record in the source branch'; end if;
  if v_source_qty < p_quantity then raise exception 'Insufficient stock in source branch'; end if;

  update public.branch_stock
  set quantity = quantity - p_quantity, updated_at = now()
  where shop_id = p_shop_id and branch_id = p_from_branch_id and product_id = p_product_id;

  insert into public.branch_stock(shop_id, branch_id, product_id, quantity, reorder_level)
  values (p_shop_id, p_to_branch_id, p_product_id, p_quantity, 0)
  on conflict (branch_id, product_id)
  do update set quantity = public.branch_stock.quantity + excluded.quantity, updated_at = now();

  insert into public.branch_stock_transfers(shop_id, idempotency_key, from_branch_id, to_branch_id, product_id, quantity, note, created_by)
  values (p_shop_id, p_idempotency_key, p_from_branch_id, p_to_branch_id, p_product_id, p_quantity,
    nullif(trim(coalesce(p_note,'')),''), auth.uid())
  returning id into v_transfer_id;

  insert into public.stock_movements(shop_id, branch_id, product_id, movement_type, quantity_change, reference_id, note, created_by)
  values
    (p_shop_id, p_from_branch_id, p_product_id, 'transfer_out', -p_quantity, v_transfer_id,
      nullif(trim(coalesce(p_note,'')),''), auth.uid()),
    (p_shop_id, p_to_branch_id, p_product_id, 'transfer_in', p_quantity, v_transfer_id,
      nullif(trim(coalesce(p_note,'')),''), auth.uid());

  return v_transfer_id;
end;
$$;

revoke all on function public.transfer_branch_stock(uuid,uuid,uuid,uuid,uuid,numeric,text) from public, anon;
grant execute on function public.transfer_branch_stock(uuid,uuid,uuid,uuid,numeric,text) to authenticated;

comment on function public.transfer_branch_stock(uuid,uuid,uuid,uuid,numeric,text) is
'Atomically transfers inventory between two branches the caller is assigned to, recording both stock movements and an audit transfer.';
