-- Super Admin-only directory for all tenant businesses.
-- SECURITY DEFINER is required to cross tenant RLS, but the function verifies
-- the authenticated caller against the trusted platform_admins table first.

create or replace function public.get_platform_businesses(
  p_search text default null,
  p_limit integer default 100,
  p_offset integer default 0
)
returns table (
  shop_id uuid,
  business_name text,
  owner_id uuid,
  owner_email text,
  created_at timestamptz,
  member_count bigint,
  plan_code text,
  subscription_status text,
  expires_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $function$
begin
  if auth.uid() is null or not public.is_platform_admin() then
    raise exception 'Platform administrator access required' using errcode = '42501';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'Page size must be between 1 and 100' using errcode = '22023';
  end if;
  if p_offset is null or p_offset < 0 then
    raise exception 'Offset cannot be negative' using errcode = '22023';
  end if;

  return query
  with directory as (
    select
      sh.id as shop_id,
      sh.name as business_name,
      sh.owner_id,
      u.email::text as owner_email,
      sh.created_at,
      count(distinct sm.user_id)::bigint as member_count,
      coalesce(ss.plan_code, 'free')::text as plan_code,
      coalesce(ss.status, 'free')::text as subscription_status,
      ss.expires_at
    from public.shops sh
    left join auth.users u on u.id = sh.owner_id
    left join public.shop_members sm on sm.shop_id = sh.id
    left join public.shop_subscriptions ss on ss.shop_id = sh.id
    where p_search is null
      or length(trim(p_search)) = 0
      or sh.name ilike '%' || trim(p_search) || '%'
      or coalesce(u.email, '') ilike '%' || trim(p_search) || '%'
    group by sh.id, sh.name, sh.owner_id, u.email, sh.created_at,
      ss.plan_code, ss.status, ss.expires_at
  )
  select d.*, count(*) over()::bigint
  from directory d
  order by d.created_at desc, d.business_name asc
  limit p_limit offset p_offset;
end;
$function$;

revoke all on function public.get_platform_businesses(text, integer, integer) from public;
grant execute on function public.get_platform_businesses(text, integer, integer) to authenticated;
