-- GUNX SMART BUSINESS: multi-branch tenancy and role-based access
-- Apply after 0001_initial_schema.sql. Review in a staging Supabase project first.
begin;

create table if not exists public.business_branches (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  name text not null,
  code text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (shop_id, code),
  unique (id, shop_id)
);

alter table public.shop_members
  add column if not exists branch_id uuid;

alter table public.products add column if not exists branch_id uuid;
alter table public.customers add column if not exists branch_id uuid;
alter table public.sales add column if not exists branch_id uuid;
alter table public.payments add column if not exists branch_id uuid;
alter table public.expenses add column if not exists branch_id uuid;
alter table public.stock_movements add column if not exists branch_id uuid;
alter table public.debt_repayments add column if not exists branch_id uuid;

-- Seed the three requested branches for Rashfurnstore only.
insert into public.business_branches (shop_id, name, code)
select s.id, v.name, v.code
from public.shops s
cross join (values
  ('Bohari', 'BOHARI'),
  ('Buswelu', 'BUSWELU'),
  ('Nyegezi', 'NYEGEZI')
) as v(name, code)
where lower(trim(s.name)) = lower('Rashfurnstore')
on conflict (shop_id, code) do nothing;

-- Existing records are preserved and assigned to Bohari as the legacy/default branch.
update public.products p set branch_id = b.id
from public.business_branches b
where p.branch_id is null and b.shop_id = p.shop_id and b.code = 'BOHARI';
update public.customers c set branch_id = b.id
from public.business_branches b
where c.branch_id is null and b.shop_id = c.shop_id and b.code = 'BOHARI';
update public.sales s set branch_id = b.id
from public.business_branches b
where s.branch_id is null and b.shop_id = s.shop_id and b.code = 'BOHARI';
update public.payments p set branch_id = s.branch_id
from public.sales s
where p.branch_id is null and p.sale_id = s.id;
update public.expenses e set branch_id = b.id
from public.business_branches b
where e.branch_id is null and b.shop_id = e.shop_id and b.code = 'BOHARI';
update public.stock_movements m set branch_id = b.id
from public.business_branches b
where m.branch_id is null and b.shop_id = m.shop_id and b.code = 'BOHARI';
update public.debt_repayments d set branch_id = s.branch_id
from public.sales s
where d.branch_id is null and d.sale_id = s.id;

-- Existing shop owners remain owners and can be assigned to Bohari by default.
update public.shop_members sm set branch_id = b.id
from public.business_branches b
where sm.branch_id is null and b.shop_id = sm.shop_id and b.code = 'BOHARI';

alter table public.shop_members
  add constraint shop_members_branch_fk
  foreign key (branch_id, shop_id)
  references public.business_branches(id, shop_id)
  on delete restrict;

alter table public.products
  add constraint products_branch_fk foreign key (branch_id, shop_id)
  references public.business_branches(id, shop_id) on delete restrict;
alter table public.customers
  add constraint customers_branch_fk foreign key (branch_id, shop_id)
  references public.business_branches(id, shop_id) on delete restrict;
alter table public.sales
  add constraint sales_branch_fk foreign key (branch_id, shop_id)
  references public.business_branches(id, shop_id) on delete restrict;
alter table public.payments
  add constraint payments_branch_fk foreign key (branch_id, shop_id)
  references public.business_branches(id, shop_id) on delete restrict;
alter table public.expenses
  add constraint expenses_branch_fk foreign key (branch_id, shop_id)
  references public.business_branches(id, shop_id) on delete restrict;
alter table public.stock_movements
  add constraint stock_movements_branch_fk foreign key (branch_id, shop_id)
  references public.business_branches(id, shop_id) on delete restrict;
alter table public.debt_repayments
  add constraint debt_repayments_branch_fk foreign key (branch_id, shop_id)
  references public.business_branches(id, shop_id) on delete restrict;

create index if not exists products_shop_branch_idx on public.products(shop_id, branch_id);
create index if not exists sales_shop_branch_date_idx on public.sales(shop_id, branch_id, created_at desc);
create index if not exists expenses_shop_branch_date_idx on public.expenses(shop_id, branch_id, expense_date desc);
create index if not exists stock_movements_shop_branch_date_idx on public.stock_movements(shop_id, branch_id, created_at desc);

-- Explicit allow-list for platform administrators; never infer this role from client input.
create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('super_admin')),
  created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;
alter table public.business_branches enable row level security;

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer
set search_path = public, auth
as $$
  select exists(select 1 from public.platform_admins a where a.user_id = auth.uid());
$$;

create or replace function public.is_shop_owner(p_shop_id uuid)
returns boolean language sql stable security definer
set search_path = public, auth
as $$
  select exists(
    select 1 from public.shop_members m
    where m.shop_id = p_shop_id and m.user_id = auth.uid() and m.role = 'owner'
  );
$$;

create or replace function public.can_access_branch(p_shop_id uuid, p_branch_id uuid)
returns boolean language sql stable security definer
set search_path = public, auth
as $$
  select public.is_platform_admin() or exists(
    select 1 from public.shop_members m
    where m.shop_id = p_shop_id and m.user_id = auth.uid()
      and (m.role = 'owner' or m.branch_id = p_branch_id)
  );
$$;

drop policy if exists platform_admins_read_self on public.platform_admins;
create policy platform_admins_read_self on public.platform_admins
  for select to authenticated using (user_id = auth.uid());

drop policy if exists branches_read_authorized on public.business_branches;
create policy branches_read_authorized on public.business_branches
  for select to authenticated
  using (public.is_platform_admin() or public.is_shop_owner(shop_id) or public.can_access_branch(shop_id, id));

drop policy if exists shops_select_member_or_platform_admin on public.shops;
create policy shops_select_member_or_platform_admin on public.shops
  for select to authenticated
  using (public.is_platform_admin() or exists(
    select 1 from public.shop_members m where m.shop_id = shops.id and m.user_id = auth.uid()
  ));

-- Branch-aware policies. Owner can see all branches; staff only their assigned branch.
do $$
declare t text;
begin
  foreach t in array array['products','customers','sales','payments','expenses','stock_movements','debt_repayments'] loop
    execute format('drop policy if exists branch_select on public.%I', t);
    execute format('create policy branch_select on public.%I for select to authenticated using (public.can_access_branch(shop_id, branch_id))', t);
    execute format('drop policy if exists branch_insert on public.%I', t);
    execute format('create policy branch_insert on public.%I for insert to authenticated with check (public.can_access_branch(shop_id, branch_id))', t);
    execute format('drop policy if exists branch_update on public.%I', t);
    execute format('create policy branch_update on public.%I for update to authenticated using (public.can_access_branch(shop_id, branch_id)) with check (public.can_access_branch(shop_id, branch_id))', t);
  end loop;
end $$;

-- Sale line visibility follows the parent sale's branch.
drop policy if exists sale_items_branch_select on public.sale_items;
create policy sale_items_branch_select on public.sale_items
  for select to authenticated using (
    exists(select 1 from public.sales s where s.id = sale_items.sale_id
      and public.can_access_branch(s.shop_id, s.branch_id))
  );

commit;
