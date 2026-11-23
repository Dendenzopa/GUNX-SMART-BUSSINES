-- GUNX SMART BUSINESS: branch and member-assignment foundation.
-- This migration is intentionally additive. It creates branch identity and access
-- assignments without changing existing shop-wide sales, stock, or financial workflows.
-- Branch-scoped transaction and inventory enforcement is introduced in a later migration.

create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  name text not null,
  code text not null,
  address text,
  is_primary boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint branches_name_length check (length(trim(name)) between 2 and 120),
  constraint branches_code_length check (length(trim(code)) between 2 and 32),
  constraint branches_shop_id_id_unique unique (shop_id, id),
  constraint branches_shop_code_unique unique (shop_id, code)
);

create unique index if not exists branches_one_primary_per_shop
  on public.branches(shop_id) where is_primary;

insert into public.branches(shop_id, name, code, is_primary)
select s.id, 'Makao Makuu', 'MAIN', true
from public.shops s
where not exists (
  select 1 from public.branches b where b.shop_id = s.id and b.is_primary
);

create table if not exists public.shop_member_branches (
  shop_id uuid not null,
  branch_id uuid not null,
  user_id uuid not null,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references auth.users(id),
  primary key (shop_id, branch_id, user_id),
  constraint shop_member_branches_branch_fk
    foreign key (shop_id, branch_id)
    references public.branches(shop_id, id) on delete cascade,
  constraint shop_member_branches_member_fk
    foreign key (shop_id, user_id)
    references public.shop_members(shop_id, user_id) on delete cascade
);

create index if not exists shop_member_branches_user_idx
  on public.shop_member_branches(user_id, shop_id);

insert into public.shop_member_branches(shop_id, branch_id, user_id, assigned_by)
select sm.shop_id, b.id, sm.user_id, sm.user_id
from public.shop_members sm
join public.branches b on b.shop_id = sm.shop_id and b.is_primary
where sm.role = 'owner'
on conflict (shop_id, branch_id, user_id) do nothing;

create or replace function public.has_branch_access(p_shop_id uuid, p_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.shop_members sm
    join public.branches b
      on b.shop_id = sm.shop_id
     and b.id = p_branch_id
     and b.active
    where sm.shop_id = p_shop_id
      and sm.user_id = (select auth.uid())
      and (
        sm.role = 'owner'
        or exists (
          select 1
          from public.shop_member_branches smb
          where smb.shop_id = p_shop_id
            and smb.branch_id = p_branch_id
            and smb.user_id = sm.user_id
        )
      )
  );
$$;

revoke all on function public.has_branch_access(uuid, uuid) from public;
grant execute on function public.has_branch_access(uuid, uuid) to authenticated;

alter table public.branches enable row level security;
alter table public.shop_member_branches enable row level security;

drop policy if exists branches_member_select on public.branches;
create policy branches_member_select on public.branches
for select to authenticated
using (public.is_shop_member(shop_id));

drop policy if exists branches_owner_insert on public.branches;
create policy branches_owner_insert on public.branches
for insert to authenticated
with check (public.has_shop_role(shop_id, array['owner']));

drop policy if exists branches_owner_update on public.branches;
create policy branches_owner_update on public.branches
for update to authenticated
using (public.has_shop_role(shop_id, array['owner']))
with check (public.has_shop_role(shop_id, array['owner']));

drop policy if exists branches_owner_delete on public.branches;
create policy branches_owner_delete on public.branches
for delete to authenticated
using (public.has_shop_role(shop_id, array['owner']) and not is_primary);

drop policy if exists shop_member_branches_select on public.shop_member_branches;
create policy shop_member_branches_select on public.shop_member_branches
for select to authenticated
using (
  user_id = (select auth.uid())
  or public.has_shop_role(shop_id, array['owner','manager'])
);

drop policy if exists shop_member_branches_owner_insert on public.shop_member_branches;
create policy shop_member_branches_owner_insert on public.shop_member_branches
for insert to authenticated
with check (
  public.has_shop_role(shop_id, array['owner'])
  and exists (
    select 1 from public.branches b
    where b.id = public.shop_member_branches.branch_id and b.shop_id = public.shop_member_branches.shop_id and b.active
  )
);

drop policy if exists shop_member_branches_owner_delete on public.shop_member_branches;
create policy shop_member_branches_owner_delete on public.shop_member_branches
for delete to authenticated
using (public.has_shop_role(shop_id, array['owner']));

grant select, insert, update, delete on public.branches to authenticated;
grant select, insert, delete on public.shop_member_branches to authenticated;

comment on table public.branches is
  'Business locations. This migration establishes branch identity; operational data remains shop-scoped until branch-aware workflows are deployed.';
comment on table public.shop_member_branches is
  'Explicit staff-to-branch assignments. Owners retain access to every active branch.';
comment on function public.has_branch_access(uuid, uuid) is
  'Returns true for the shop owner or a staff member explicitly assigned to the active branch.';
