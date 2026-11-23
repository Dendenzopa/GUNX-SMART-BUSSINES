-- GUNX SMART BUSINESS: enterprise group debt, stock valuation and branch performance.
-- This is a read-only aggregate RPC. Group roles do not grant shop-table access.
-- Date-scoped sales/expense performance is separated from current debt/stock snapshots.

create index if not exists debts_shop_branch_balance_idx
  on public.debts(shop_id, branch_id, balance) where balance > 0;
create index if not exists branch_stock_shop_branch_product_idx
  on public.branch_stock(shop_id, branch_id, product_id);

create or replace function public.get_company_group_enterprise_overview(
  p_group_id uuid,
  p_from date default current_date - 29,
  p_to date default current_date
)
returns table(
  shop_id uuid,
  shop_name text,
  branch_id uuid,
  branch_name text,
  sales_count bigint,
  sales_total numeric,
  expenses_total numeric,
  net_after_expenses numeric,
  debt_outstanding numeric,
  stock_units numeric,
  stock_value numeric,
  low_stock_products bigint
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
  if not public.has_company_group_role(p_group_id) then
    raise exception 'Not permitted to view this company group';
  end if;
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from > 366 then
    raise exception 'Report date range must be valid and no longer than 367 days';
  end if;

  return query
  select
    sh.id,
    sh.name::text,
    br.id,
    br.name::text,
    coalesce(sr.sales_count, 0)::bigint,
    coalesce(sr.sales_total, 0)::numeric,
    coalesce(er.expenses_total, 0)::numeric,
    (coalesce(sr.sales_total, 0) - coalesce(er.expenses_total, 0))::numeric,
    coalesce(dr.debt_outstanding, 0)::numeric,
    coalesce(st.stock_units, 0)::numeric,
    coalesce(st.stock_value, 0)::numeric,
    coalesce(st.low_stock_products, 0)::bigint
  from public.shops sh
  join public.branches br on br.shop_id = sh.id and br.active
  left join (
    select s.shop_id, s.branch_id,
           count(*) as sales_count,
           sum(s.total) as sales_total
    from public.sales s
    where s.created_at >= p_from::timestamptz
      and s.created_at < (p_to + 1)::timestamptz
      and s.status in ('completed','partially_paid')
    group by s.shop_id, s.branch_id
  ) sr on sr.shop_id = sh.id and sr.branch_id = br.id
  left join (
    select e.shop_id, e.branch_id, sum(e.amount) as expenses_total
    from public.expenses e
    where e.expense_date between p_from and p_to
    group by e.shop_id, e.branch_id
  ) er on er.shop_id = sh.id and er.branch_id = br.id
  left join (
    select d.shop_id, d.branch_id, sum(d.balance) as debt_outstanding
    from public.debts d
    where d.balance > 0
    group by d.shop_id, d.branch_id
  ) dr on dr.shop_id = sh.id and dr.branch_id = br.id
  left join (
    select bs.shop_id, bs.branch_id,
           sum(bs.quantity) as stock_units,
           sum(bs.quantity * p.cost_price) as stock_value,
           count(*) filter (where bs.quantity <= bs.reorder_level) as low_stock_products
    from public.branch_stock bs
    join public.products p on p.id = bs.product_id and p.shop_id = bs.shop_id
    group by bs.shop_id, bs.branch_id
  ) st on st.shop_id = sh.id and st.branch_id = br.id
  where sh.company_group_id = p_group_id
  order by sh.name, br.name, br.id;
end;
$$;

revoke all on function public.get_company_group_enterprise_overview(uuid,date,date) from public, anon;
grant execute on function public.get_company_group_enterprise_overview(uuid,date,date) to authenticated;

comment on function public.get_company_group_enterprise_overview(uuid,date,date) is
  'Returns group-authorized branch aggregates: date-scoped sales/expenses and current outstanding debt and cost-based stock valuation. net_after_expenses is not accounting profit.';
