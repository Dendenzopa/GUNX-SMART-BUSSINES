-- Applied to Supabase project qejfhjpopsgaeuqygihr as platform_admin_management_foundation.
create table if not exists public.platform_settings (
  key text primary key check (length(trim(key)) between 2 and 100),
  value jsonb not null default '{}'::jsonb,
  description text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
alter table public.platform_settings enable row level security;
revoke all on public.platform_settings from anon;
grant select, insert, update on public.platform_settings to authenticated;
create policy platform_settings_admin_read on public.platform_settings for select to authenticated using (public.is_platform_admin());
create policy platform_settings_admin_insert on public.platform_settings for insert to authenticated with check (public.is_platform_admin() and updated_by = (select auth.uid()));
create policy platform_settings_admin_update on public.platform_settings for update to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin() and updated_by = (select auth.uid()));

create table if not exists public.platform_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null, target_type text not null, target_id text,
  metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index if not exists platform_audit_logs_created_at_idx on public.platform_audit_logs(created_at desc);
create index if not exists platform_audit_logs_actor_idx on public.platform_audit_logs(actor_id, created_at desc);
alter table public.platform_audit_logs enable row level security;
revoke all on public.platform_audit_logs from anon, authenticated;
grant select on public.platform_audit_logs to authenticated;
create policy platform_audit_logs_admin_read on public.platform_audit_logs for select to authenticated using (public.is_platform_admin());

create table if not exists public.platform_notifications (
  id uuid primary key default gen_random_uuid(), title text not null, message text not null,
  severity text not null default 'info' check (severity in ('info','warning','critical','success')),
  source text not null default 'system', read_at timestamptz, created_at timestamptz not null default now()
);
create index if not exists platform_notifications_created_at_idx on public.platform_notifications(created_at desc);
alter table public.platform_notifications enable row level security;
revoke all on public.platform_notifications from anon, authenticated;
grant select, update on public.platform_notifications to authenticated;
create policy platform_notifications_admin_read on public.platform_notifications for select to authenticated using (public.is_platform_admin());
create policy platform_notifications_admin_update on public.platform_notifications for update to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());

create table if not exists public.platform_health_checks (
  id uuid primary key default gen_random_uuid(), service text not null,
  status text not null check (status in ('operational','degraded','outage','unknown')),
  response_time_ms integer check (response_time_ms is null or response_time_ms >= 0),
  details jsonb not null default '{}'::jsonb, checked_at timestamptz not null default now()
);
create index if not exists platform_health_checks_service_checked_idx on public.platform_health_checks(service, checked_at desc);
alter table public.platform_health_checks enable row level security;
revoke all on public.platform_health_checks from anon, authenticated;
grant select on public.platform_health_checks to authenticated;
create policy platform_health_checks_admin_read on public.platform_health_checks for select to authenticated using (public.is_platform_admin());

create or replace function public.log_platform_setting_change()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  insert into public.platform_audit_logs(actor_id,action,target_type,target_id,metadata)
  values(auth.uid(),case when tg_op='INSERT' then 'platform_setting_created' else 'platform_setting_updated' end,
    'platform_setting',coalesce(new.key,old.key),jsonb_build_object('key',coalesce(new.key,old.key)));
  return new;
end; $$;
revoke all on function public.log_platform_setting_change() from public,anon,authenticated;
drop trigger if exists platform_settings_audit_trigger on public.platform_settings;
create trigger platform_settings_audit_trigger after insert or update on public.platform_settings
for each row execute function public.log_platform_setting_change();

create or replace function public.get_platform_admin_users(p_search text default null,p_limit integer default 50,p_offset integer default 0)
returns table(user_id uuid,email text,created_at timestamptz,shop_count bigint,roles text[],total_count bigint)
language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
begin
  if auth.uid() is null or not public.is_platform_admin() then raise exception 'Platform administrator access required' using errcode='42501'; end if;
  if p_limit is null or p_limit<1 or p_limit>100 or p_offset is null or p_offset<0 then raise exception 'Invalid pagination' using errcode='22023'; end if;
  return query with user_rows as (
    select u.id,u.email::text,u.created_at,count(distinct sm.shop_id)::bigint as shops,
      coalesce(array_agg(distinct sm.role) filter(where sm.role is not null),array[]::text[]) as user_roles
    from auth.users u left join public.shop_members sm on sm.user_id=u.id
    where p_search is null or trim(p_search)='' or coalesce(u.email,'') ilike '%'||trim(p_search)||'%' or u.id::text=trim(p_search)
    group by u.id,u.email,u.created_at
  ) select id,user_rows.email,user_rows.created_at,shops,user_roles,count(*) over()::bigint
    from user_rows order by user_rows.created_at desc limit p_limit offset p_offset;
end; $$;
revoke all on function public.get_platform_admin_users(text,integer,integer) from public,anon;
grant execute on function public.get_platform_admin_users(text,integer,integer) to authenticated;

create or replace function public.get_platform_payment_requests(p_status text default null,p_limit integer default 50,p_offset integer default 0)
returns table(request_id uuid,shop_id uuid,business_name text,owner_email text,submitted_by uuid,provider text,amount_tzs integer,transaction_reference text,payer_phone text,status text,submitted_at timestamptz,verified_at timestamptz,admin_note text,total_count bigint)
language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
begin
  if auth.uid() is null or not public.is_platform_admin() then raise exception 'Platform administrator access required' using errcode='42501'; end if;
  if p_limit is null or p_limit<1 or p_limit>100 or p_offset is null or p_offset<0 then raise exception 'Invalid pagination' using errcode='22023'; end if;
  if p_status is not null and p_status not in ('pending','verified','rejected') then raise exception 'Invalid payment status' using errcode='22023'; end if;
  return query select pr.id,pr.shop_id,sh.name,u.email::text,pr.submitted_by,pr.provider,pr.amount_tzs,
    pr.transaction_reference,pr.payer_phone,pr.status,pr.submitted_at,pr.verified_at,pr.admin_note,count(*) over()::bigint
    from public.pro_payment_requests pr join public.shops sh on sh.id=pr.shop_id
    left join auth.users u on u.id=sh.owner_id where p_status is null or pr.status=p_status
    order by pr.submitted_at desc limit p_limit offset p_offset;
end; $$;
revoke all on function public.get_platform_payment_requests(text,integer,integer) from public,anon;
grant execute on function public.get_platform_payment_requests(text,integer,integer) to authenticated;

create or replace function public.get_platform_subscription_metrics()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_result jsonb;
begin
  if auth.uid() is null or not public.is_platform_admin() then raise exception 'Platform administrator access required' using errcode='42501'; end if;
  select jsonb_build_object(
    'total_subscriptions',(select count(*) from public.shop_subscriptions),
    'active_pro',(select count(*) from public.shop_subscriptions where plan_code='pro' and status='active' and expires_at>now()),
    'pending_payments',(select count(*) from public.pro_payment_requests where status='pending'),
    'verified_payments',(select count(*) from public.pro_payment_requests where status='verified'),
    'rejected_payments',(select count(*) from public.pro_payment_requests where status='rejected'),
    'verified_revenue_tzs',(select coalesce(sum(amount_tzs),0) from public.pro_payment_requests where status='verified')
  ) into v_result;
  return v_result;
end; $$;
revoke all on function public.get_platform_subscription_metrics() from public,anon;
grant execute on function public.get_platform_subscription_metrics() to authenticated;
