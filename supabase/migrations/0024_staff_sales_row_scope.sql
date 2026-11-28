-- Restrict cashier reads to their own sales unless they hold a management role.
-- Sale item visibility follows the parent sale so direct REST queries cannot bypass the boundary.
drop policy if exists sales_role_select on public.sales;
create policy sales_role_select on public.sales
for select to authenticated
using (
  public.has_shop_role(shop_id, array['owner','manager'])
  or (
    public.has_shop_role(shop_id, array['cashier'])
    and created_by = (select auth.uid())
  )
);

drop policy if exists sale_items_role_select on public.sale_items;
create policy sale_items_role_select on public.sale_items
for select to authenticated
using (
  exists (
    select 1
    from public.sales s
    where s.id = sale_items.sale_id
      and (
        public.has_shop_role(s.shop_id, array['owner','manager'])
        or (
          public.has_shop_role(s.shop_id, array['cashier'])
          and s.created_by = (select auth.uid())
        )
      )
  )
);

-- These SECURITY DEFINER RPCs and policy helpers are intended for signed-in app users only.
revoke all on function public.checkout_sale(uuid,uuid,jsonb,text,numeric,uuid,numeric) from public, anon;
grant execute on function public.checkout_sale(uuid,uuid,jsonb,text,numeric,uuid,numeric) to authenticated;

revoke all on function public.receive_stock(uuid,uuid,numeric,text) from public, anon;
grant execute on function public.receive_stock(uuid,uuid,numeric,text) to authenticated;

revoke all on function public.has_shop_role(uuid,text[]) from public, anon;
grant execute on function public.has_shop_role(uuid,text[]) to authenticated;

revoke all on function public.has_shop_permission(uuid,text) from public, anon;
grant execute on function public.has_shop_permission(uuid,text) to authenticated;
