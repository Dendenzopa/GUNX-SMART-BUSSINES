-- GUNX SMART BUSINESS: business identity and owner slogans
-- Apply after 0017_product_catalogue_management_only.sql.
alter table public.shops
  add column if not exists slogan_one text,
  add column if not exists slogan_two text;

alter table public.shops
  drop constraint if exists shops_slogan_one_length,
  add constraint shops_slogan_one_length
    check (slogan_one is null or char_length(slogan_one) between 1 and 120),
  drop constraint if exists shops_slogan_two_length,
  add constraint shops_slogan_two_length
    check (slogan_two is null or char_length(slogan_two) between 1 and 120);

-- New three-argument registration RPC; the original one-argument RPC remains
-- available for backwards compatibility with older app versions.
create or replace function public.create_shop(p_name text, p_slogan_one text, p_slogan_two text)
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
  if p_slogan_one is null or length(trim(p_slogan_one)) < 1 or length(trim(p_slogan_one)) > 120 then
    raise exception 'First slogan must be between 1 and 120 characters';
  end if;
  if p_slogan_two is null or length(trim(p_slogan_two)) < 1 or length(trim(p_slogan_two)) > 120 then
    raise exception 'Second slogan must be between 1 and 120 characters';
  end if;

  insert into public.shops(owner_id, name, slogan_one, slogan_two)
  values (v_user_id, trim(p_name), trim(p_slogan_one), trim(p_slogan_two))
  returning id into v_shop_id;

  insert into public.shop_members(shop_id, user_id, role)
  values (v_shop_id, v_user_id, 'owner');

  return v_shop_id;
end;
$$;

revoke all on function public.create_shop(text, text, text) from public;
grant execute on function public.create_shop(text, text, text) to authenticated;
