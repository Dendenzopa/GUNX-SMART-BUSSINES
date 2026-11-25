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
