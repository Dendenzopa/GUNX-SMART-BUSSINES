-- GUNX SMART BUSINESS: subscription foundation (TZS).
-- Pro activation is server-controlled only. No client-side payment proof can activate a plan.

create table if not exists public.shop_subscriptions (
  shop_id uuid primary key references public.shops(id) on delete cascade,
  plan_code text not null default 'free' check (plan_code in ('free','pro')),
  status text not null default 'free' check (status in ('free','pending','active','cancelled')),
  started_at timestamptz,
  expires_at timestamptz,
  provider text check (provider is null or provider in ('manual','mpesa','halopesa','mixx','airtel_money','bank')),
  provider_reference text,
  updated_at timestamptz not null default now(),
  constraint subscription_dates_valid check (
    (plan_code = 'free' and status = 'free' and started_at is null and expires_at is null)
    or
    (plan_code = 'pro' and status in ('pending','active','cancelled'))
  ),
  constraint active_pro_has_expiry check (
    status <> 'active' or (plan_code = 'pro' and started_at is not null and expires_at is not null and expires_at > started_at)
  )
);

create or replace function public.create_default_shop_subscription()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.shop_subscriptions(shop_id, plan_code, status)
  values (new.id, 'free', 'free')
  on conflict (shop_id) do nothing;
  return new;
end;
$$;

drop trigger if exists shops_create_default_subscription on public.shops;
create trigger shops_create_default_subscription
after insert on public.shops
for each row execute function public.create_default_shop_subscription();

insert into public.shop_subscriptions(shop_id, plan_code, status)
select id, 'free', 'free' from public.shops
on conflict (shop_id) do nothing;

alter table public.shop_subscriptions enable row level security;
drop policy if exists shop_subscriptions_member_read on public.shop_subscriptions;
create policy shop_subscriptions_member_read on public.shop_subscriptions
for select to authenticated
using (public.is_shop_member(shop_id));
-- Deliberately no authenticated INSERT/UPDATE/DELETE policy. Only trusted server/service-role
-- operations may activate, extend, cancel or change a paid subscription.

create or replace function public.get_shop_subscription(p_shop_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_sub public.shop_subscriptions%rowtype;
  v_plan text;
  v_status text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.is_shop_member(p_shop_id) then raise exception 'Shop membership required'; end if;

  select * into v_sub
  from public.shop_subscriptions
  where shop_id = p_shop_id;

  if not found then
    v_plan := 'free';
    v_status := 'free';
    return jsonb_build_object(
      'plan_code', v_plan, 'status', v_status, 'price_tzs', 0,
      'product_limit', 50, 'monthly_sales_limit', 100, 'debtor_limit', 10,
      'expires_at', null, 'is_pro_active', false
    );
  end if;

  if v_sub.plan_code = 'pro' and v_sub.status = 'active' and v_sub.expires_at <= now() then
    v_plan := 'free';
    v_status := 'expired';
  elsif v_sub.plan_code = 'pro' and v_sub.status = 'active' then
    v_plan := 'pro';
    v_status := 'active';
  elsif v_sub.plan_code = 'pro' and v_sub.status = 'pending' then
    v_plan := 'free';
    v_status := 'pending';
  elsif v_sub.plan_code = 'pro' and v_sub.status = 'cancelled' then
    v_plan := 'free';
    v_status := 'cancelled';
  else
    v_plan := 'free';
    v_status := 'free';
  end if;

  return jsonb_build_object(
    'plan_code', v_plan,
    'status', v_status,
    'price_tzs', case when v_plan = 'pro' then 5000 else 0 end,
    'product_limit', case when v_plan = 'pro' then null else 50 end,
    'monthly_sales_limit', case when v_plan = 'pro' then null else 100 end,
    'debtor_limit', case when v_plan = 'pro' then null else 10 end,
    'expires_at', v_sub.expires_at,
    'is_pro_active', (v_plan = 'pro' and v_sub.expires_at > now())
  );
end;
$$;

revoke all on function public.get_shop_subscription(uuid) from public;
grant execute on function public.get_shop_subscription(uuid) to authenticated;

comment on table public.shop_subscriptions is
'Server-managed subscription state. Pro is effective only while status=active and expires_at is in the future; expired subscriptions resolve to Free without deleting business data.';
