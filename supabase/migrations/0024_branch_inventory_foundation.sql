-- GUNX SMART BUSINESS: branch-level inventory foundation.
-- Required by the composite tenant-safe product foreign key below.
create unique index if not exists products_shop_id_id_unique on public.products(shop_id, id);
-- This migration is additive: existing checkout/receiving RPCs remain unchanged until
-- the app is upgraded to pass an explicitly authorized branch_id.
-- Do not treat branch_stock as live operational stock until the follow-up RPC migration.

create table if not exists public.branch_stock (
  shop_id uuid not null,
  branch_id uuid not null,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity numeric(14,3) not null default 0 check (quantity >= 0),
  reorder_level numeric(14,3) not null default 0 check (reorder_level >= 0),
  updated_at timestamptz not null default now(),
  primary key (branch_id, product_id),
  constraint branch_stock_branch_fk
    foreign key (shop_id, branch_id)
    references public.branches(shop_id, id) on delete cascade,
  constraint branch_stock_shop_product_fk
    foreign key (shop_id, product_id)
    references public.products(shop_id, id) on delete cascade
);

create index if not exists branch_stock_shop_branch_idx
  on public.branch_stock(shop_id, branch_id);
create index if not exists branch_stock_low_idx
  on public.branch_stock(shop_id, branch_id, quantity)
  where quantity <= reorder_level;

-- Preserve all existing inventory by moving the current shop-wide balance into
-- that shop's primary branch exactly once. Do not zero products.stock_quantity here:
-- older app versions still depend on it until the branch-aware checkout rollout.
insert into public.branch_stock(shop_id, branch_id, product_id, quantity, reorder_level)
select p.shop_id, b.id, p.id, p.stock_quantity, p.reorder_level
from public.products p
join public.branches b on b.shop_id = p.shop_id and b.is_primary
on conflict (branch_id, product_id) do nothing;

alter table public.branch_stock enable row level security;

drop policy if exists branch_stock_member_select on public.branch_stock;
create policy branch_stock_member_select on public.branch_stock
for select to authenticated
using (public.has_branch_access(shop_id, branch_id));

-- Writes are intentionally RPC-only. Never grant direct stock quantity writes
-- to authenticated clients; every movement must be audited by a server function.
revoke all on table public.branch_stock from anon, authenticated;
grant select on table public.branch_stock to authenticated;

create or replace function public.get_branch_stock(p_shop_id uuid, p_branch_id uuid)
returns table (
  product_id uuid,
  branch_id uuid,
  quantity numeric,
  reorder_level numeric,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if not public.has_branch_access(p_shop_id, p_branch_id) then
    raise exception 'Not permitted to view stock for this branch';
  end if;

  return query
  select bs.product_id, bs.branch_id, bs.quantity, bs.reorder_level, bs.updated_at
  from public.branch_stock bs
  where bs.shop_id = p_shop_id
    and bs.branch_id = p_branch_id
  order by bs.product_id;
end;
$$;

revoke all on function public.get_branch_stock(uuid, uuid) from public;
grant execute on function public.get_branch_stock(uuid, uuid) to authenticated;

comment on table public.branch_stock is
  'Branch-specific inventory balances. Initially backfilled from legacy shop-wide stock into the primary branch; activate only with branch-aware transactional RPCs.';
comment on function public.get_branch_stock(uuid, uuid) is
  'Returns branch inventory only to members authorized for that active branch.';
