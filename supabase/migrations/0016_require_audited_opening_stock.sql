-- GUNX SMART BUSINESS: require all opening stock to enter through audited stock receiving.
-- Direct product inserts must start at zero; receive_stock records the stock movement.

create or replace function public.guard_product_initial_stock()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null
     and current_user not in ('postgres','service_role')
     and new.stock_quantity <> 0 then
    raise exception 'STOCK_RECEIVING_REQUIRED: Create the product with zero stock, then use receive_stock to record opening inventory.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists products_guard_initial_stock on public.products;
create trigger products_guard_initial_stock
before insert on public.products
for each row execute function public.guard_product_initial_stock();

revoke all on function public.guard_product_initial_stock() from public, anon, authenticated;

comment on function public.guard_product_initial_stock() is
'Prevents direct authenticated product inserts from bypassing the stock movement ledger; opening stock must use receive_stock.';
