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
  select new.shop_id, new.id, p.id, case when new.is_primary then p.stock_quantity else 0 end, p.reorder_level
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
select p.shop_id, b.id, p.id, case when b.is_primary then p.stock_quantity else 0 end, p.reorder_level
from public.products p
join public.branches b on b.shop_id = p.shop_id
on conflict (branch_id, product_id) do nothing;

comment on function public.create_primary_branch_for_new_shop() is
'Creates a primary Makao Makuu branch whenever a new GUNX shop is registered.';
comment on function public.seed_branch_stock_for_new_branch() is
'Creates zero-balance inventory rows for all existing products when a new branch is created.';

-- Preserve access for existing employees by assigning them to the primary branch.
-- New members also start on the primary branch; owners may add/remove assignments.
insert into public.shop_member_branches(shop_id,branch_id,user_id,assigned_by)
select sm.shop_id,b.id,sm.user_id,sm.user_id
from public.shop_members sm
join public.branches b on b.shop_id=sm.shop_id and b.is_primary and b.active
on conflict (shop_id,branch_id,user_id) do nothing;

create or replace function public.assign_new_shop_member_to_primary_branch()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.shop_member_branches(shop_id,branch_id,user_id,assigned_by)
  select new.shop_id,b.id,new.user_id,new.user_id
  from public.branches b
  where b.shop_id=new.shop_id and b.is_primary and b.active
  on conflict (shop_id,branch_id,user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists shop_members_assign_primary_branch on public.shop_members;
create trigger shop_members_assign_primary_branch
after insert on public.shop_members
for each row execute function public.assign_new_shop_member_to_primary_branch();

comment on function public.assign_new_shop_member_to_primary_branch() is
'Assigns each newly added shop member to the primary branch by default; owners can adjust access in Staff Management.';
