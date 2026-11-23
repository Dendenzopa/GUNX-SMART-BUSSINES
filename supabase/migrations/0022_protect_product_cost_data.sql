-- Protect confidential product and historical unit-cost fields from employee clients.
-- Operational clients read safe catalogue columns directly; cost values are returned
-- only by narrowly scoped SECURITY DEFINER functions after checking the shop role.

revoke select on table public.products from authenticated;
grant select (id, shop_id, name, sku, unit, selling_price, stock_quantity, reorder_level, active, created_at)
  on table public.products to authenticated;

revoke select on table public.sale_items from authenticated;
grant select (id, sale_id, product_id, product_name_snapshot, quantity, unit_price, line_total)
  on table public.sale_items to authenticated;

create or replace function public.get_shop_products(p_shop_id uuid)
returns table (
  id uuid,
  shop_id uuid,
  name text,
  sku text,
  unit text,
  cost_price numeric,
  selling_price numeric,
  stock_quantity numeric,
  reorder_level numeric,
  active boolean,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.has_shop_role(
    p_shop_id, array['owner','manager','cashier','stockkeeper']
  ) then
    raise exception 'Not permitted to read this product catalogue';
  end if;

  return query
  select p.id, p.shop_id, p.name, p.sku, p.unit,
    case when public.has_shop_role(p.shop_id, array['owner','manager'])
      then p.cost_price else null::numeric end,
    p.selling_price, p.stock_quantity, p.reorder_level, p.active, p.created_at
  from public.products p
  where p.shop_id = p_shop_id
  order by p.name;
end;
$$;

revoke all on function public.get_shop_products(uuid) from public, anon;
grant execute on function public.get_shop_products(uuid) to authenticated;

create or replace function public.get_sale_item_costs(
  p_shop_id uuid,
  p_sale_id uuid default null
)
returns table (
  sale_id uuid,
  sale_item_id uuid,
  unit_cost_snapshot numeric
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.has_shop_role(p_shop_id, array['owner','manager']) then
    raise exception 'Only owners and managers may read historical product costs';
  end if;

  return query
  select s.id, si.id, si.unit_cost_snapshot
  from public.sales s
  join public.sale_items si on si.sale_id = s.id
  where s.shop_id = p_shop_id
    and (p_sale_id is null or s.id = p_sale_id);
end;
$$;

revoke all on function public.get_sale_item_costs(uuid,uuid) from public, anon;
grant execute on function public.get_sale_item_costs(uuid,uuid) to authenticated;

comment on function public.get_shop_products(uuid) is
'Returns shop catalogue to members; cost_price is populated only for owners and managers.';
comment on function public.get_sale_item_costs(uuid,uuid) is
'Returns historical sale-item costs only to owners and managers; employee clients have no column-level SELECT grant for unit_cost_snapshot.';
