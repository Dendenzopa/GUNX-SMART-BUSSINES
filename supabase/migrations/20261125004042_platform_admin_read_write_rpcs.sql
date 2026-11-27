-- RECOVERED EXACTLY from Supabase migration ledger.
-- Source project: qejfhjpopsgaeuqygihr
-- Version: 20261125004042
-- Name: platform_admin_read_write_rpcs
-- This file records an already-applied migration; do not replay on the live project.

create or replace function public.get_platform_settings()
returns table(key text, value jsonb, description text, updated_at timestamptz, updated_by uuid)
language plpgsql stable security definer
set search_path=public,pg_temp
as $$
begin
  if auth.uid() is null or not public.is_platform_admin() then
    raise exception 'Platform administrator access required' using errcode='42501';
  end if;
  return query select s.key,s.value,s.description,s.updated_at,s.updated_by from public.platform_settings s order by s.key;
end;
$$;
revoke all on function public.get_platform_settings() from public,anon;
grant execute on function public.get_platform_settings() to authenticated;

create or replace function public.save_platform_setting(p_key text,p_value jsonb,p_description text default null)
returns jsonb
language plpgsql security definer
set search_path=public,pg_temp
as $$
declare v_actor uuid;
begin
  v_actor:=auth.uid();
  if v_actor is null or not public.is_platform_admin() then
    raise exception 'Platform administrator access required' using errcode='42501';
  end if;
  if p_key is null or length(trim(p_key))<2 or length(trim(p_key))>100 or p_value is null then
    raise exception 'Invalid setting key or value' using errcode='22023';
  end if;
  insert into public.platform_settings(key,value,description,updated_by,updated_at)
  values(trim(p_key),p_value,nullif(left(coalesce(p_description,''),500),''),v_actor,now())
  on conflict(key) do update set value=excluded.value,
    description=coalesce(excluded.description,public.platform_settings.description),
    updated_by=v_actor,updated_at=now();
  return jsonb_build_object('saved',true,'key',trim(p_key));
end;
$$;
revoke all on function public.save_platform_setting(text,jsonb,text) from public,anon;
grant execute on function public.save_platform_setting(text,jsonb,text) to authenticated;

create or replace function public.get_platform_audit_logs(p_limit integer default 50)
returns table(id uuid,actor_id uuid,action text,target_type text,target_id text,metadata jsonb,created_at timestamptz)
language plpgsql stable security definer
set search_path=public,pg_temp
as $$
begin
  if auth.uid() is null or not public.is_platform_admin() then
    raise exception 'Platform administrator access required' using errcode='42501';
  end if;
  if p_limit is null or p_limit<1 or p_limit>100 then raise exception 'Invalid limit' using errcode='22023'; end if;
  return query select a.id,a.actor_id,a.action,a.target_type,a.target_id,a.metadata,a.created_at
    from public.platform_audit_logs a order by a.created_at desc limit p_limit;
end;
$$;
revoke all on function public.get_platform_audit_logs(integer) from public,anon;
grant execute on function public.get_platform_audit_logs(integer) to authenticated;

create or replace function public.get_platform_notifications(p_limit integer default 50)
returns table(id uuid,title text,message text,severity text,source text,read_at timestamptz,created_at timestamptz)
language plpgsql stable security definer
set search_path=public,pg_temp
as $$
begin
  if auth.uid() is null or not public.is_platform_admin() then
    raise exception 'Platform administrator access required' using errcode='42501';
  end if;
  if p_limit is null or p_limit<1 or p_limit>100 then raise exception 'Invalid limit' using errcode='22023'; end if;
  return query select n.id,n.title,n.message,n.severity,n.source,n.read_at,n.created_at
    from public.platform_notifications n order by n.created_at desc limit p_limit;
end;
$$;
revoke all on function public.get_platform_notifications(integer) from public,anon;
grant execute on function public.get_platform_notifications(integer) to authenticated;

create or replace function public.mark_platform_notification_read(p_notification_id uuid)
returns jsonb
language plpgsql security definer
set search_path=public,pg_temp
as $$
begin
  if auth.uid() is null or not public.is_platform_admin() then
    raise exception 'Platform administrator access required' using errcode='42501';
  end if;
  update public.platform_notifications set read_at=coalesce(read_at,now()) where id=p_notification_id;
  if not found then raise exception 'Notification not found' using errcode='P0002'; end if;
  return jsonb_build_object('updated',true);
end;
$$;
revoke all on function public.mark_platform_notification_read(uuid) from public,anon;
grant execute on function public.mark_platform_notification_read(uuid) to authenticated;

create or replace function public.get_platform_health_checks(p_limit integer default 50)
returns table(id uuid,service text,status text,response_time_ms integer,details jsonb,checked_at timestamptz)
language plpgsql stable security definer
set search_path=public,pg_temp
as $$
begin
  if auth.uid() is null or not public.is_platform_admin() then
    raise exception 'Platform administrator access required' using errcode='42501';
  end if;
  if p_limit is null or p_limit<1 or p_limit>100 then raise exception 'Invalid limit' using errcode='22023'; end if;
  return query select h.id,h.service,h.status,h.response_time_ms,h.details,h.checked_at
    from public.platform_health_checks h order by h.checked_at desc limit p_limit;
end;
$$;
revoke all on function public.get_platform_health_checks(integer) from public,anon;
grant execute on function public.get_platform_health_checks(integer) to authenticated;
