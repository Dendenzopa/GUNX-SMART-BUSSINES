-- GUNX SMART BUSINESS: secure multi-company group foundation.
-- Group membership is separate from shop membership. Group users receive only
-- consolidated read-only metrics through the SECURITY DEFINER reporting RPC.

create table if not exists public.company_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 120),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.company_group_members (
  group_id uuid not null references public.company_groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('group_owner','group_admin','group_viewer')),
  created_at timestamptz not null default now(),
  primary key (group_id,user_id)
);

alter table public.shops
  add column if not exists company_group_id uuid
  references public.company_groups(id) on delete set null;

create index if not exists shops_company_group_idx
  on public.shops(company_group_id) where company_group_id is not null;
create index if not exists company_group_members_user_idx
  on public.company_group_members(user_id,group_id);

create or replace function public.has_company_group_role(
  p_group_id uuid,
  p_roles text[] default array['group_owner','group_admin','group_viewer']
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.company_group_members gm
    where gm.group_id = p_group_id
      and gm.user_id = (select auth.uid())
      and gm.role = any(p_roles)
  );
$$;

revoke all on function public.has_company_group_role(uuid,text[]) from public, anon;
grant execute on function public.has_company_group_role(uuid,text[]) to authenticated;

alter table public.company_groups enable row level security;
alter table public.company_group_members enable row level security;

drop policy if exists company_groups_member_select on public.company_groups;
create policy company_groups_member_select on public.company_groups
for select to authenticated
using (public.has_company_group_role(id));

drop policy if exists company_group_members_member_select on public.company_group_members;
create policy company_group_members_member_select on public.company_group_members
for select to authenticated
using (
  user_id = (select auth.uid())
  or public.has_company_group_role(group_id,array['group_owner','group_admin'])
);

grant select on public.company_groups, public.company_group_members to authenticated;
revoke insert, update, delete on public.company_groups, public.company_group_members from anon, authenticated;

create or replace function public.create_company_group(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_group_id uuid;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_name is null or length(trim(p_name)) not between 2 and 120 then
    raise exception 'Group name must be between 2 and 120 characters';
  end if;

  insert into public.company_groups(name,created_by)
  values (trim(p_name),v_user_id)
  returning id into v_group_id;

  insert into public.company_group_members(group_id,user_id,role)
  values (v_group_id,v_user_id,'group_owner');
  return v_group_id;
end;
$$;
revoke all on function public.create_company_group(text) from public, anon;
grant execute on function public.create_company_group(text) to authenticated;

-- A shop can be linked only by its own shop owner and a group administrator.
-- This provides explicit consent; group membership alone cannot seize a shop.
create or replace function public.add_shop_to_company_group(
  p_group_id uuid,
  p_shop_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_group_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.has_company_group_role(p_group_id,array['group_owner','group_admin']) then
    raise exception 'Not permitted to manage this company group';
  end if;
  if not public.has_shop_role(p_shop_id,array['owner']) then
    raise exception 'Only the shop owner may link this business to a group';
  end if;

  update public.shops
  set company_group_id = p_group_id
  where id = p_shop_id
    and (company_group_id is null or company_group_id = p_group_id)
  returning company_group_id into v_group_id;

  if v_group_id is null then
    raise exception 'Shop not found or already belongs to another company group';
  end if;
end;
$$;
revoke all on function public.add_shop_to_company_group(uuid,uuid) from public, anon;
grant execute on function public.add_shop_to_company_group(uuid,uuid) to authenticated;

create or replace function public.remove_shop_from_company_group(
  p_group_id uuid,
  p_shop_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.has_company_group_role(p_group_id,array['group_owner','group_admin']) then
    raise exception 'Not permitted to manage this company group';
  end if;
  if not public.has_shop_role(p_shop_id,array['owner']) then
    raise exception 'Only the shop owner may unlink this business from a group';
  end if;

  update public.shops set company_group_id = null
  where id = p_shop_id and company_group_id = p_group_id;
  if not found then raise exception 'Shop is not linked to this company group'; end if;
end;
$$;
revoke all on function public.remove_shop_from_company_group(uuid,uuid) from public, anon;
grant execute on function public.remove_shop_from_company_group(uuid,uuid) to authenticated;

create or replace function public.add_company_group_member(
  p_group_id uuid,
  p_user_id uuid,
  p_role text default 'group_viewer'
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.has_company_group_role(p_group_id,array['group_owner','group_admin']) then
    raise exception 'Not permitted to manage group members';
  end if;
  if p_user_id is null or p_role is null or p_role not in ('group_admin','group_viewer') then
    raise exception 'Invalid group member or role';
  end if;
  if p_role = 'group_admin'
     and not public.has_company_group_role(p_group_id,array['group_owner']) then
    raise exception 'Only the group owner may appoint group administrators';
  end if;

  -- Never allow an administrator to demote or overwrite the group owner.
  -- Administrators may add viewers, but only the owner may appoint/change admins.
  if exists (
    select 1 from public.company_group_members
    where group_id = p_group_id and user_id = p_user_id and role = 'group_owner'
  ) then
    raise exception 'The group owner role cannot be changed';
  end if;
  if p_role = 'group_viewer'
     and not public.has_company_group_role(p_group_id,array['group_owner']) then
    if exists (
      select 1 from public.company_group_members
      where group_id = p_group_id and user_id = p_user_id and role = 'group_admin'
    ) then
      raise exception 'Only the group owner may change a group administrator';
    end if;
  end if;

  insert into public.company_group_members(group_id,user_id,role)
  values (p_group_id,p_user_id,p_role)
  on conflict (group_id,user_id) do update set role = excluded.role
  where public.company_group_members.role <> 'group_owner';
end;
$$;
revoke all on function public.add_company_group_member(uuid,uuid,text) from public, anon;
grant execute on function public.add_company_group_member(uuid,uuid,text) to authenticated;

create or replace function public.remove_company_group_member(
  p_group_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.has_company_group_role(p_group_id,array['group_owner','group_admin']) then
    raise exception 'Not permitted to manage group members';
  end if;
  if exists (
    select 1 from public.company_group_members
    where group_id = p_group_id and user_id = p_user_id and role = 'group_owner'
  ) then
    raise exception 'The group owner cannot be removed';
  end if;
  if not public.has_company_group_role(p_group_id,array['group_owner'])
     and exists (
       select 1 from public.company_group_members
       where group_id = p_group_id and user_id = p_user_id and role = 'group_admin'
     ) then
    raise exception 'Only the group owner may remove a group administrator';
  end if;
  delete from public.company_group_members
  where group_id = p_group_id and user_id = p_user_id;
end;
$$;
revoke all on function public.remove_company_group_member(uuid,uuid) from public, anon;
grant execute on function public.remove_company_group_member(uuid,uuid) to authenticated;

-- Read-only, group-scoped consolidated reporting. No shop-level records are
-- returned, and a group viewer cannot use this RPC to access another group.
create or replace function public.get_company_group_overview(
  p_group_id uuid,
  p_from date default current_date - 29,
  p_to date default current_date
)
returns table(
  shop_id uuid,
  shop_name text,
  sales_count bigint,
  sales_total numeric,
  expenses_total numeric
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.has_company_group_role(p_group_id) then
    raise exception 'Not permitted to view this company group';
  end if;
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from > 366 then
    raise exception 'Report date range must be valid and no longer than 367 days';
  end if;

  return query
  select sh.id,
         sh.name::text,
         coalesce(sr.sales_count,0)::bigint,
         coalesce(sr.sales_total,0)::numeric,
         coalesce(er.expenses_total,0)::numeric
  from public.shops sh
  left join (
    select s.shop_id,count(*) as sales_count,sum(s.total) as sales_total
    from public.sales s
    where s.created_at >= (p_from::timestamp at time zone 'Africa/Dar_es_Salaam')
      and s.created_at < ((p_to + 1)::timestamp at time zone 'Africa/Dar_es_Salaam')
      and s.status in ('completed','partially_paid')
    group by s.shop_id
  ) sr on sr.shop_id = sh.id
  left join (
    select e.shop_id,sum(e.amount) as expenses_total
    from public.expenses e
    where e.expense_date between p_from and p_to
    group by e.shop_id
  ) er on er.shop_id = sh.id
  where sh.company_group_id = p_group_id
  order by sh.name,sh.id;
end;
$$;
revoke all on function public.get_company_group_overview(uuid,date,date) from public, anon;
grant execute on function public.get_company_group_overview(uuid,date,date) to authenticated;

comment on table public.company_groups is
  'Enterprise group identity; group membership is separate from shop membership.';
comment on table public.company_group_members is
  'Group-level roles for consolidated read-only reporting and group administration.';
comment on column public.shops.company_group_id is
  'Optional enterprise group association; set only through the owner-authorized group RPC.';
comment on function public.get_company_group_overview(uuid,date,date) is
  'Returns per-shop sales and expense aggregates for an authorized company group only.';
