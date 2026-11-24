-- GUNX SMART BUSINESS: harden installation analytics against anonymous spoofing.
-- A counted installation must be linked to a Supabase-authenticated account.
-- One account contributes at most one verified installation at a time.
alter table public.app_installations
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

create unique index if not exists app_installations_one_per_user_idx
  on public.app_installations(user_id)
  where user_id is not null;

-- Discard all old anonymous/unverified installation claims.
delete from public.app_installations where user_id is null;

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
declare
  v_user_id uuid := auth.uid();
  v_existing_user uuid;
begin
  if v_user_id is null then
    raise exception 'Sign in is required to register a verified installation'
      using errcode = '28000';
  end if;
  if p_installation_id is null then raise exception 'Installation ID required'; end if;
  if p_platform not in ('android','ios','web','other') then raise exception 'Invalid platform'; end if;
  if p_app_version is null or length(p_app_version) not between 1 and 32 then
    raise exception 'Invalid app version';
  end if;

  -- Serialize concurrent requests for the same account.
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  select user_id into v_existing_user
  from public.app_installations
  where installation_id = p_installation_id;

  if found and v_existing_user is not null and v_existing_user <> v_user_id then
    raise exception 'Installation ID is already linked to another account'
      using errcode = '23505';
  end if;

  -- A user can contribute only one counted installation, even after clearing app data
  -- or generating a different local installation ID.
  delete from public.app_installations
  where user_id = v_user_id
    and installation_id <> p_installation_id;

  insert into public.app_installations(
    installation_id, user_id, platform, app_version, first_seen_at, last_seen_at
  )
  values (p_installation_id, v_user_id, p_platform, p_app_version, now(), now())
  on conflict (installation_id) do update
    set user_id = excluded.user_id,
        last_seen_at = now()
    where public.app_installations.user_id is null
       or public.app_installations.user_id = v_user_id;
end;
$$;

revoke all on function public.register_app_installation(uuid,text,text) from public, anon;
grant execute on function public.register_app_installation(uuid,text,text) to authenticated;

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
    'total_installs', (select count(*) from public.app_installations where user_id is not null),
    'installs_7d', (select count(*) from public.app_installations where user_id is not null and first_seen_at >= now() - interval '7 days'),
    'installs_30d', (select count(*) from public.app_installations where user_id is not null and first_seen_at >= now() - interval '30 days'),
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

comment on column public.app_installations.user_id is
'Authenticated account linked to this verified installation. Metrics count at most one installation per account; this is not proof of a physical device or APK download.';
