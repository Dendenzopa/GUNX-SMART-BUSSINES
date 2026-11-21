-- GUNX SMART BUSINESS: membership-scoped RLS policies
-- Apply after 0001_initial_schema.sql. Never expose the service-role key to clients.

create or replace function public.is_shop_member(p_shop_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.shop_members sm
    where sm.shop_id = p_shop_id
      and sm.user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_shop_member(uuid) from public;
grant execute on function public.is_shop_member(uuid) to authenticated;

-- Shop creation is atomic: clients cannot self-assign membership to an existing shop.
create or replace function public.create_shop(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_shop_id uuid;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if p_name is null or length(trim(p_name)) < 2 or length(trim(p_name)) > 120 then
    raise exception 'Shop name must be between 2 and 120 characters';
  end if;

  insert into public.shops(owner_id, name)
  values (v_user_id, trim(p_name))
  returning id into v_shop_id;

  insert into public.shop_members(shop_id, user_id, role)
  values (v_shop_id, v_user_id, 'owner');

  return v_shop_id;
end;
$$;

revoke all on function public.create_shop(text) from public;
grant execute on function public.create_shop(text) to authenticated;

-- Shops: members may read their shop; only the owner may change shop settings.
drop policy if exists shops_member_select on public.shops;
create policy shops_member_select on public.shops
for select to authenticated
using (public.is_shop_member(id));

drop policy if exists shops_owner_update on public.shops;
create policy shops_owner_update on public.shops
for update to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

-- Membership visibility only. Membership mutations are performed by trusted server/admin flows.
drop policy if exists shop_members_self_or_peer_select on public.shop_members;
create policy shop_members_self_or_peer_select on public.shop_members
for select to authenticated
using (user_id = (select auth.uid()) or public.is_shop_member(shop_id));

-- Shop-scoped operational tables.
do $$
declare
  t text;
begin
  foreach t in array array[
    'products','customers','sales','payments',
    'expenses','stock_movements','debt_repayments'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_member_select', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_shop_member(shop_id))',
      t || '_member_select', t
    );

    execute format('drop policy if exists %I on public.%I', t || '_member_insert', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.is_shop_member(shop_id))',
      t || '_member_insert', t
    );

    execute format('drop policy if exists %I on public.%I', t || '_member_update', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.is_shop_member(shop_id)) with check (public.is_shop_member(shop_id))',
      t || '_member_update', t
    );

    execute format('drop policy if exists %I on public.%I', t || '_member_delete', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.is_shop_member(shop_id))',
      t || '_member_delete', t
    );
  end loop;
end $$;

-- Sale items inherit shop access from their parent sale; sale_items has no shop_id column.
drop policy if exists sale_items_member_select on public.sale_items;
create policy sale_items_member_select on public.sale_items
for select to authenticated
using (
  exists (
    select 1 from public.sales s
    where s.id = sale_id and public.is_shop_member(s.shop_id)
  )
);

drop policy if exists sale_items_member_insert on public.sale_items;
create policy sale_items_member_insert on public.sale_items
for insert to authenticated
with check (
  exists (
    select 1 from public.sales s
    where s.id = sale_id and public.is_shop_member(s.shop_id)
  )
);

drop policy if exists sale_items_member_update on public.sale_items;
create policy sale_items_member_update on public.sale_items
for update to authenticated
using (
  exists (
    select 1 from public.sales s
    where s.id = sale_id and public.is_shop_member(s.shop_id)
  )
)
with check (
  exists (
    select 1 from public.sales s
    where s.id = sale_id and public.is_shop_member(s.shop_id)
  )
);

drop policy if exists sale_items_member_delete on public.sale_items;
create policy sale_items_member_delete on public.sale_items
for delete to authenticated
using (
  exists (
    select 1 from public.sales s
    where s.id = sale_id and public.is_shop_member(s.shop_id)
  )
);
