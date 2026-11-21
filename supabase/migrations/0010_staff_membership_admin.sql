-- GUNX SMART BUSINESS: owner-controlled staff membership administration.
-- This manages already-registered Supabase Auth users. Email invitations require a
-- trusted server/Edge Function and are intentionally not implemented in this migration.

create or replace function public.add_shop_member(
  p_shop_id uuid,
  p_user_id uuid,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.has_shop_role(p_shop_id, array['owner']) then
    raise exception 'Only the shop owner can add staff';
  end if;
  if p_user_id is null or p_user_id = auth.uid() then
    raise exception 'Choose another registered user';
  end if;
  if p_role not in ('manager','cashier','stockkeeper') then
    raise exception 'Unsupported staff role';
  end if;
  if not exists (select 1 from auth.users u where u.id = p_user_id) then
    raise exception 'User account not found';
  end if;

  insert into public.shop_members(shop_id, user_id, role)
  values (p_shop_id, p_user_id, p_role)
  on conflict (shop_id, user_id) do nothing;

  if not found then raise exception 'This user is already a member of the shop'; end if;
end;
$$;

create or replace function public.update_shop_member_role(
  p_shop_id uuid,
  p_user_id uuid,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.has_shop_role(p_shop_id, array['owner']) then
    raise exception 'Only the shop owner can change staff roles';
  end if;
  if p_user_id is null or p_user_id = auth.uid() then
    raise exception 'The owner role cannot be changed here';
  end if;
  if p_role not in ('manager','cashier','stockkeeper') then
    raise exception 'Unsupported staff role';
  end if;

  update public.shop_members
  set role = p_role
  where shop_id = p_shop_id
    and user_id = p_user_id
    and role <> 'owner';

  if not found then raise exception 'Staff member not found or cannot be changed'; end if;
end;
$$;

create or replace function public.remove_shop_member(
  p_shop_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.has_shop_role(p_shop_id, array['owner']) then
    raise exception 'Only the shop owner can remove staff';
  end if;
  if p_user_id is null or p_user_id = auth.uid() then
    raise exception 'The owner cannot remove themselves';
  end if;

  delete from public.shop_members
  where shop_id = p_shop_id
    and user_id = p_user_id
    and role <> 'owner';

  if not found then raise exception 'Staff member not found or cannot be removed'; end if;
end;
$$;

revoke all on function public.add_shop_member(uuid, uuid, text) from public;
revoke all on function public.update_shop_member_role(uuid, uuid, text) from public;
revoke all on function public.remove_shop_member(uuid, uuid) from public;
grant execute on function public.add_shop_member(uuid, uuid, text) to authenticated;
grant execute on function public.update_shop_member_role(uuid, uuid, text) to authenticated;
grant execute on function public.remove_shop_member(uuid, uuid) to authenticated;
