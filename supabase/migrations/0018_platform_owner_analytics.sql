-- GUNX SMART BUSINESS: platform owner and privacy-preserving app analytics.
-- Platform administrators are provisioned only by trusted SQL; no client can self-promote.
create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  note text
);
alter table public.platform_admins enable row level security;
-- Intentionally no authenticated/anon policies. Membership is only checked by security-definer RPCs.

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid());
$$;
revoke all on function public.is_platform_admin() from public, anon;
grant execute on function public.is_platform_admin() to authenticated;

-- Each installation gets a random app-generated UUID stored locally. Raw rows are never
-- readable by clients; only aggregate metrics are returned to verified platform admins.
create table if not exists public.app_installations (
  installation_id uuid primary key,
  platform text not null check (platform in ('android','ios','web','other')),
  app_version text not null check (length(app_version) between 1 and 32),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists app_installations_first_seen_idx on public.app_installations(first_seen_at desc);
create index if not exists app_installations_last_seen_idx on public.app_installations(last_seen_at desc);
alter table public.app_installations enable row level security;
-- No table policies: all writes/reads go through the narrowly scoped RPCs below.

create or replace function public.register_app_installation(
  p_installation_id uuid,
  p_platform text,
  p_app_version text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_installation_id is null then raise exception 'Installation ID required'; end if;
  if p_platform not in ('android','ios','web','other') then raise exception 'Invalid platform'; end if;
  if p_app_version is null or length(p_app_version) not between 1 and 32 then raise exception 'Invalid app version'; end if;
  insert into public.app_installations(installation_id, platform, app_version)
  values (p_installation_id, p_platform, p_app_version)
  on conflict (installation_id) do update
    set last_seen_at = now(), platform = excluded.platform, app_version = excluded.app_version;
end;
$$;
revoke all on function public.register_app_installation(uuid,text,text) from public;
grant execute on function public.register_app_installation(uuid,text,text) to anon, authenticated;

create table if not exists public.app_user_activity (
  user_id uuid primary key references auth.users(id) on delete cascade,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists app_user_activity_last_seen_idx on public.app_user_activity(last_seen_at desc);
alter table public.app_user_activity enable row level security;

create or replace function public.record_app_user_activity()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  insert into public.app_user_activity(user_id)
  values (auth.uid())
  on conflict (user_id) do update set last_seen_at = now();
end;
$$;
revoke all on function public.record_app_user_activity() from public, anon;
grant execute on function public.record_app_user_activity() to authenticated;

create or replace function public.get_platform_metrics()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null or not public.is_platform_admin() then
    raise exception 'Platform administrator access required' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'total_installs', (select count(*) from public.app_installations),
    'installs_7d', (select count(*) from public.app_installations where first_seen_at >= now() - interval '7 days'),
    'installs_30d', (select count(*) from public.app_installations where first_seen_at >= now() - interval '30 days'),
    'registrations', (select count(*) from auth.users),
    'active_7d', (select count(*) from public.app_user_activity where last_seen_at >= now() - interval '7 days'),
    'active_30d', (select count(*) from public.app_user_activity where last_seen_at >= now() - interval '30 days'),
    'total_shops', (select count(*) from public.shops)
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.get_platform_metrics() from public, anon;
grant execute on function public.get_platform_metrics() to authenticated;

-- Platform owners receive an owner-managed lifetime Pro entitlement for shops they own.
-- This is provisioned by the trusted platform_admins table, never by a client flag.
create or replace function public.create_default_shop_subscription()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (select 1 from public.platform_admins where user_id = new.owner_id) then
    insert into public.shop_subscriptions(shop_id, plan_code, status, started_at, expires_at, provider, updated_at)
    values (new.id, 'pro', 'active', now(), '2099-12-31 23:59:59+00'::timestamptz, 'manual', now())
    on conflict (shop_id) do update set
      plan_code = 'pro', status = 'active',
      started_at = coalesce(public.shop_subscriptions.started_at, now()),
      expires_at = '2099-12-31 23:59:59+00'::timestamptz,
      provider = 'manual', updated_at = now();
  else
    insert into public.shop_subscriptions(shop_id, plan_code, status)
    values (new.id, 'free', 'free')
    on conflict (shop_id) do nothing;
  end if;
  return new;
end;
$$;

-- Upgrade any existing shops owned by a newly provisioned platform administrator.
update public.shop_subscriptions ss
set plan_code = 'pro', status = 'active',
    started_at = coalesce(ss.started_at, now()),
    expires_at = '2099-12-31 23:59:59+00'::timestamptz,
    provider = 'manual', updated_at = now()
from public.shops s
join public.platform_admins pa on pa.user_id = s.owner_id
where ss.shop_id = s.id;

comment on table public.platform_admins is
'Trusted platform-level administrators. Add users only through Supabase SQL Editor after verifying their auth.users UUID.';
comment on table public.app_installations is
'Unique app first-launch installations identified by a random app-generated UUID; not a count of APK file downloads.';
