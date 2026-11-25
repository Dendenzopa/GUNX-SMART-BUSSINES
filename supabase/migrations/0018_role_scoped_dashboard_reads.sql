-- GUNX SMART BUSINESS: protect management-only dashboard data at the database layer.
-- UI navigation is not an authorization boundary; restrict reads with RLS as well.

-- Membership roster: users can read their own membership; only owners can read the full roster.
drop policy if exists shop_members_self_or_peer_select on public.shop_members;
create policy shop_members_owner_or_self_select on public.shop_members
for select to authenticated
using (
  user_id = (select auth.uid())
  or public.has_shop_role(shop_id, array['owner'])
);

-- Expenses contain sensitive business financial information; managers and owners only.
drop policy if exists expenses_member_select on public.expenses;
create policy expenses_management_select on public.expenses
for select to authenticated
using (public.has_shop_role(shop_id, array['owner','manager']));

-- Refund ledgers and refund lines are management-only.
drop policy if exists sale_refunds_member_select on public.sale_refunds;
create policy sale_refunds_management_select on public.sale_refunds
for select to authenticated
using (public.has_shop_role(shop_id, array['owner','manager']));

drop policy if exists sale_refund_items_member_select on public.sale_refund_items;
create policy sale_refund_items_management_select on public.sale_refund_items
for select to authenticated
using (
  exists (
    select 1 from public.sale_refunds r
    where r.id = refund_id
      and public.has_shop_role(r.shop_id, array['owner','manager'])
  )
);

-- Subscription state is visible only to the shop owner.
drop policy if exists shop_subscriptions_member_read on public.shop_subscriptions;
create policy shop_subscriptions_owner_read on public.shop_subscriptions
for select to authenticated
using (public.has_shop_role(shop_id, array['owner']));


-- The SECURITY DEFINER subscription helper must enforce the same owner-only boundary.
create or replace function public.get_shop_subscription(p_shop_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $
declare
  v_sub public.shop_subscriptions%rowtype;
  v_plan text;
  v_status text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.has_shop_role(p_shop_id, array['owner']) then
    raise exception 'Only the shop owner can view subscription details';
  end if;

  select * into v_sub from public.shop_subscriptions where shop_id = p_shop_id;
  if not found then
    return jsonb_build_object(
      'plan_code', 'free', 'status', 'free', 'price_tzs', 0,
      'product_limit', 50, 'monthly_sales_limit', 100, 'debtor_limit', 10,
      'expires_at', null, 'is_pro_active', false
    );
  end if;

  if v_sub.plan_code = 'pro' and v_sub.status = 'active' and v_sub.expires_at <= now() then
    v_plan := 'free'; v_status := 'expired';
  elsif v_sub.plan_code = 'pro' and v_sub.status = 'active' then
    v_plan := 'pro'; v_status := 'active';
  elsif v_sub.plan_code = 'pro' and v_sub.status = 'pending' then
    v_plan := 'free'; v_status := 'pending';
  elsif v_sub.plan_code = 'pro' and v_sub.status = 'cancelled' then
    v_plan := 'free'; v_status := 'cancelled';
  else
    v_plan := 'free'; v_status := 'free';
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
$;

revoke all on function public.get_shop_subscription(uuid) from public;
grant execute on function public.get_shop_subscription(uuid) to authenticated;

-- Employees may read payment rows attached to their own sales; management can read all shop payments.
drop policy if exists payments_member_select on public.payments;
create policy payments_management_or_own_sale_select on public.payments
for select to authenticated
using (
  public.has_shop_role(shop_id, array['owner','manager'])
  or exists (
    select 1 from public.sales s
    where s.id = sale_id
      and s.shop_id = payments.shop_id
      and s.created_by = (select auth.uid())
  )
);
