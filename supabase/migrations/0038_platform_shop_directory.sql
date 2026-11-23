-- GUNX SMART BUSINESS: platform-owner shop and subscription directory.
-- This is a read-only, bounded directory; it does not expose customer auth records
-- or grant platform administrators direct table access.

create or replace function public.get_platform_shop_directory(
  p_search text default null,
  p_limit integer default 100
)
returns table (
  shop_id uuid,
  shop_name text,
  owner_user_id uuid,
  shop_created_at timestamptz,
  plan_code text,
  subscription_status text,
  expires_at timestamptz,
  pending_payment_count bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_search text := nullif(trim(coalesce(p_search,'')), '');
begin
  if auth.uid() is null or not public.is_platform_admin() then
    raise exception 'Platform administrator access required' using errcode = '42501';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 200 then
    raise exception 'Limit must be between 1 and 200';
  end if;
  if v_search is not null and length(v_search) > 120 then
    raise exception 'Search text is too long';
  end if;

  return query
  select s.id, s.name, s.owner_id, s.created_at,
    coalesce(ss.plan_code, 'free'),
    case
      when ss.plan_code = 'pro' and ss.status = 'active' and ss.expires_at <= now() then 'expired'
      else coalesce(ss.status, 'free')
    end,
    ss.expires_at,
    (select count(*) from public.pro_payment_requests pr
      where pr.shop_id = s.id and pr.status = 'pending')
  from public.shops s
  left join public.shop_subscriptions ss on ss.shop_id = s.id
  where v_search is null
     or s.name ilike '%' || v_search || '%'
     or s.owner_id::text ilike '%' || v_search || '%'
     or s.id::text ilike '%' || v_search || '%'
  order by s.created_at desc
  limit p_limit;
end;
$$;

revoke all on function public.get_platform_shop_directory(text, integer) from public, anon;
grant execute on function public.get_platform_shop_directory(text, integer) to authenticated;

comment on function public.get_platform_shop_directory(text, integer) is
'Bounded platform-admin-only shop and subscription directory. Search supports shop name, owner UUID or shop UUID.';
