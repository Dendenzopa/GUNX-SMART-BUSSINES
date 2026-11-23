-- GUNX SMART BUSINESS: platform controls, safe public configuration and shop suspension.
-- Suspension is enforced centrally through is_shop_member(), which is used by shop RLS policies.

create table if not exists public.platform_app_settings (
  setting_key text primary key,
  setting_value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);
alter table public.platform_app_settings enable row level security;
revoke all on public.platform_app_settings from anon, authenticated;

insert into public.platform_app_settings(setting_key, setting_value) values
 ('maintenance_mode', 'false'::jsonb),
 ('maintenance_message', '"Mfumo unafanyiwa maboresho. Tafadhali jaribu tena baadaye."'::jsonb),
 ('announcement_message', '""'::jsonb),
 ('support_phone', '""'::jsonb),
 ('support_email', '""'::jsonb)
on conflict (setting_key) do nothing;

create table if not exists public.platform_shop_controls (
  shop_id uuid primary key references public.shops(id) on delete cascade,
  is_suspended boolean not null default false,
  reason text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  check (reason is null or length(reason) <= 500)
);
alter table public.platform_shop_controls enable row level security;
revoke all on public.platform_shop_controls from anon, authenticated;

-- Replace the central membership predicate so existing shop-scoped RLS checks
-- automatically deny access when the platform suspends a shop.
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
  )
  and not exists (
    select 1 from public.platform_shop_controls c
    where c.shop_id = p_shop_id and c.is_suspended
  );
$$;
revoke all on function public.is_shop_member(uuid) from public;
grant execute on function public.is_shop_member(uuid) to authenticated;

create or replace function public.get_platform_control_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare v_result jsonb;
begin
  if auth.uid() is null or not public.is_platform_admin() then
    raise exception 'Platform administrator access required' using errcode = '42501';
  end if;
  select coalesce(jsonb_object_agg(setting_key, setting_value), '{}'::jsonb)
  into v_result from public.platform_app_settings;
  return v_result;
end;
$$;
revoke all on function public.get_platform_control_settings() from public, anon;
grant execute on function public.get_platform_control_settings() to authenticated;

create or replace function public.get_public_platform_settings()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $
  select jsonb_build_object(
    'maintenance_mode', coalesce((select (setting_value #>> '{}')::boolean from public.platform_app_settings where setting_key = 'maintenance_mode'), false),
    'maintenance_message', coalesce((select setting_value #>> '{}' from public.platform_app_settings where setting_key = 'maintenance_message'), ''),
    'announcement_message', coalesce((select setting_value #>> '{}' from public.platform_app_settings where setting_key = 'announcement_message'), ''),
    'support_phone', coalesce((select setting_value #>> '{}' from public.platform_app_settings where setting_key = 'support_phone'), ''),
    'support_email', coalesce((select setting_value #>> '{}' from public.platform_app_settings where setting_key = 'support_email'), '')
  );
$;
revoke all on function public.get_public_platform_settings() from public;
grant execute on function public.get_public_platform_settings() to anon, authenticated;


create or replace function public.update_platform_control_settings(
  p_maintenance_mode boolean,
  p_maintenance_message text,
  p_announcement_message text,
  p_support_phone text,
  p_support_email text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_message text := trim(coalesce(p_maintenance_message, ''));
  v_announcement text := trim(coalesce(p_announcement_message, ''));
  v_phone text := trim(coalesce(p_support_phone, ''));
  v_email text := trim(coalesce(p_support_email, ''));
begin
  if auth.uid() is null or not public.is_platform_admin() then
    raise exception 'Platform administrator access required' using errcode = '42501';
  end if;
  if p_maintenance_mode is null then raise exception 'Maintenance mode value is required'; end if;
  if length(v_message) > 500 or length(v_announcement) > 500
     or length(v_phone) > 40 or length(v_email) > 254 then
    raise exception 'One or more settings exceed the allowed length';
  end if;
  if v_email <> '' and v_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+[.][A-Z]{2,}$' then
    raise exception 'Invalid support email address';
  end if;

  insert into public.platform_app_settings(setting_key, setting_value, updated_at, updated_by)
  values
    ('maintenance_mode', to_jsonb(p_maintenance_mode), now(), auth.uid()),
    ('maintenance_message', to_jsonb(coalesce(nullif(v_message,''), 'Mfumo unafanyiwa maboresho. Tafadhali jaribu tena baadaye.')), now(), auth.uid()),
    ('announcement_message', to_jsonb(v_announcement), now(), auth.uid()),
    ('support_phone', to_jsonb(v_phone), now(), auth.uid()),
    ('support_email', to_jsonb(v_email), now(), auth.uid())
  on conflict (setting_key) do update
    set setting_value = excluded.setting_value, updated_at = now(), updated_by = auth.uid();

  return public.get_platform_control_settings();
end;
$$;
revoke all on function public.update_platform_control_settings(boolean,text,text,text,text) from public, anon;
grant execute on function public.update_platform_control_settings(boolean,text,text,text,text) to authenticated;

create or replace function public.set_platform_shop_suspension(
  p_shop_id uuid,
  p_suspend boolean,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_shop_name text; v_reason text := nullif(trim(coalesce(p_reason,'')), '');
begin
  if auth.uid() is null or not public.is_platform_admin() then
    raise exception 'Platform administrator access required' using errcode = '42501';
  end if;
  if p_shop_id is null or p_suspend is null then raise exception 'Shop and suspension decision are required'; end if;
  if v_reason is not null and length(v_reason) > 500 then raise exception 'Reason must not exceed 500 characters'; end if;
  select name into v_shop_name from public.shops where id = p_shop_id;
  if not found then raise exception 'Shop not found'; end if;

  insert into public.platform_shop_controls(shop_id, is_suspended, reason, updated_at, updated_by)
  values (p_shop_id, p_suspend, v_reason, now(), auth.uid())
  on conflict (shop_id) do update
    set is_suspended = excluded.is_suspended,
        reason = excluded.reason,
        updated_at = now(),
        updated_by = auth.uid();

  return jsonb_build_object('shop_id', p_shop_id, 'shop_name', v_shop_name,
    'is_suspended', p_suspend, 'reason', v_reason);
end;
$$;
revoke all on function public.set_platform_shop_suspension(uuid,boolean,text) from public, anon;
grant execute on function public.set_platform_shop_suspension(uuid,boolean,text) to authenticated;

drop function if exists public.get_platform_shop_directory(text, integer);

create function public.get_platform_shop_directory(
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
  pending_payment_count bigint,
  is_suspended boolean,
  suspension_reason text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare v_search text := nullif(trim(coalesce(p_search,'')), '');
begin
  if auth.uid() is null or not public.is_platform_admin() then
    raise exception 'Platform administrator access required' using errcode = '42501';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 200 then raise exception 'Limit must be between 1 and 200'; end if;
  if v_search is not null and length(v_search) > 120 then raise exception 'Search text is too long'; end if;

  return query
  select s.id, s.name, s.owner_id, s.created_at,
    coalesce(ss.plan_code, 'free'),
    case when ss.plan_code = 'pro' and ss.status = 'active' and ss.expires_at <= now()
      then 'expired' else coalesce(ss.status, 'free') end,
    ss.expires_at,
    (select count(*) from public.pro_payment_requests pr where pr.shop_id = s.id and pr.status = 'pending'),
    coalesce(c.is_suspended, false), c.reason
  from public.shops s
  left join public.shop_subscriptions ss on ss.shop_id = s.id
  left join public.platform_shop_controls c on c.shop_id = s.id
  where v_search is null or s.name ilike '%' || v_search || '%'
     or s.owner_id::text ilike '%' || v_search || '%'
     or s.id::text ilike '%' || v_search || '%'
  order by s.created_at desc limit p_limit;
end;
$$;
revoke all on function public.get_platform_shop_directory(text, integer) from public, anon;
grant execute on function public.get_platform_shop_directory(text, integer) to authenticated;

comment on table public.platform_app_settings is 'Allowlisted platform configuration, readable and writable only through platform-admin RPCs.';
comment on table public.platform_shop_controls is 'Platform-enforced shop suspension state. Membership access is denied centrally while suspended.';


-- Role-checking SECURITY DEFINER RPCs must honor platform suspension too.
create or replace function public.has_shop_role(p_shop_id uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_shop_member(p_shop_id) and exists (
    select 1 from public.shop_members sm
    where sm.shop_id = p_shop_id
      and sm.user_id = (select auth.uid())
      and sm.role = any(p_roles)
  );
$$;
revoke all on function public.has_shop_role(uuid, text[]) from public;
grant execute on function public.has_shop_role(uuid, text[]) to authenticated;
