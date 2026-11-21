-- GUNX SMART BUSINESS: close direct-write paths around audited financial and stock workflows.
-- Authenticated clients must use the SECURITY DEFINER RPCs for ledger writes.
-- This prevents fabricated sales/payments and stock changes that bypass checkout/stock history.

-- Product catalogue fields remain editable through the existing role-aware RLS policy.
-- Stock quantity is deliberately excluded: it changes only through checkout_sale,
-- receive_stock and refund_sale, which also append stock_movements atomically.
revoke update on table public.products from authenticated;
grant update (name, sku, unit, cost_price, selling_price, reorder_level, active)
  on table public.products to authenticated;

create or replace function public.guard_product_sensitive_updates()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null and current_user not in ('postgres','service_role') then
    if new.stock_quantity is distinct from old.stock_quantity then
      raise exception 'STOCK_RPC_REQUIRED: Change stock through receive_stock, checkout_sale or refund_sale.'
        using errcode = '42501';
    end if;

    if (
      new.cost_price is distinct from old.cost_price
      or new.selling_price is distinct from old.selling_price
    ) and not public.has_shop_role(old.shop_id, array['owner','manager']) then
      raise exception 'PRICE_PERMISSION_DENIED: Only the owner or manager can change product cost or selling price.'
        using errcode = '42501';
    end if;

    if new.shop_id is distinct from old.shop_id or new.id is distinct from old.id then
      raise exception 'PRODUCT_IDENTITY_IMMUTABLE: Product shop and ID cannot be changed.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists products_guard_sensitive_updates on public.products;
create trigger products_guard_sensitive_updates
before update on public.products
for each row execute function public.guard_product_sensitive_updates();

-- These tables are written only inside trusted atomic RPCs. RLS policies alone
-- are not sufficient protection if a broad table INSERT grant is present.
revoke insert on table
  public.sales,
  public.sale_items,
  public.payments,
  public.stock_movements,
  public.debts,
  public.debt_payments,
  public.debt_repayments,
  public.sale_refunds,
  public.sale_refund_items
from authenticated;

revoke all on function public.guard_product_sensitive_updates() from public, anon, authenticated;

comment on function public.guard_product_sensitive_updates() is
'Blocks direct authenticated stock edits and restricts product cost/selling-price edits to owners and managers.';
