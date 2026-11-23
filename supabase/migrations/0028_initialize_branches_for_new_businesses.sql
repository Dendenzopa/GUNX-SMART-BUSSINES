-- GUNX SMART BUSINESS: initialize branch infrastructure for new businesses
-- and ensure newly created branches have a zero-balance record for every product.

create or replace function public.create_primary_branch_for_new_shop()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.branches(shop_id, name, code, is_primary, active)
  values (new.id, 'Makao Makuu', 'MAIN', true, true)
  on conflict (shop_id, code) do nothing;
  return new;
end;
$$;

drop trigger if exists shops_create_primary_branch on public.shops;
create trigger shops_create_primary_branch
after insert on public.shops
for each row execute function public.create_primary_branch_for_new_shop();

create or replace function public.seed_branch_stock_for_new_branch()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.branch_stock(shop_id, branch_id, product_id, quantity, reorder_level)
  select new.shop_id, new.id, p.id, 0, p.reorder_level
  from public.products p
  where p.shop_id = new.shop_id
  on conflict (branch_id, product_id) do nothing;
  return new;
end;
$$;

drop trigger if exists branches_seed_product_stock on public.branches;
create trigger branches_seed_product_stock
after insert on public.branches
for each row execute function public.seed_branch_stock_for_new_branch();

-- Repair any shops/branches/products created between earlier migration stages.
insert into public.branches(shop_id, name, code, is_primary, active)
select s.id, 'Makao Makuu', 'MAIN', true, true
from public.shops s
where not exists (select 1 from public.branches b where b.shop_id = s.id and b.is_primary)
on conflict (shop_id, code) do nothing;

insert into public.branch_stock(shop_id, branch_id, product_id, quantity, reorder_level)
select p.shop_id, b.id, p.id, 0, p.reorder_level
from public.products p
join public.branches b on b.shop_id = p.shop_id
on conflict (branch_id, product_id) do nothing;

comment on function public.create_primary_branch_for_new_shop() is
'Creates a primary Makao Makuu branch whenever a new GUNX shop is registered.';
comment on function public.seed_branch_stock_for_new_branch() is
'Creates zero-balance inventory rows for all existing products when a new branch is created.';
