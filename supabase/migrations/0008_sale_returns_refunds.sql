-- GUNX SMART BUSINESS: auditable sale returns and cash refunds.
create table if not exists public.sale_refunds (
 id uuid primary key default gen_random_uuid(),
 shop_id uuid not null references public.shops(id) on delete cascade,
 sale_id uuid not null references public.sales(id) on delete restrict,
 idempotency_key uuid not null,
 reason text not null,
 refund_method text not null check(refund_method in ('cash','mobile_money','bank')),
 refund_total numeric(14,2) not null check(refund_total > 0),
 created_by uuid references auth.users(id),
 created_at timestamptz not null default now(),
 unique(shop_id,idempotency_key)
);
create table if not exists public.sale_refund_items (
 id uuid primary key default gen_random_uuid(),
 refund_id uuid not null references public.sale_refunds(id) on delete restrict,
 sale_item_id uuid not null references public.sale_items(id) on delete restrict,
 quantity numeric(14,3) not null check(quantity > 0),
 unit_price numeric(14,2) not null check(unit_price >= 0),
 refund_amount numeric(14,2) not null check(refund_amount >= 0),
 unique(refund_id,sale_item_id)
);
create index if not exists sale_refunds_shop_date_idx on public.sale_refunds(shop_id,created_at desc);
create index if not exists sale_refund_items_sale_item_idx on public.sale_refund_items(sale_item_id);
alter table public.sale_refunds enable row level security;
alter table public.sale_refund_items enable row level security;
drop policy if exists sale_refunds_member_select on public.sale_refunds;
create policy sale_refunds_member_select on public.sale_refunds for select to authenticated using(public.is_shop_member(shop_id));
drop policy if exists sale_refund_items_member_select on public.sale_refund_items;
create policy sale_refund_items_member_select on public.sale_refund_items for select to authenticated using(exists(select 1 from public.sale_refunds r where r.id=refund_id and public.is_shop_member(r.shop_id)));

create or replace function public.refund_sale(
 p_shop_id uuid,
 p_sale_id uuid,
 p_idempotency_key uuid,
 p_items jsonb,
 p_reason text,
 p_refund_method text default 'cash'
)
returns table(refund_id uuid, refund_total numeric)
language plpgsql security definer set search_path=public,pg_temp as $$
declare
 v_sale public.sales%rowtype;
 v_existing public.sale_refunds%rowtype;
 v_item record;
 v_sale_item public.sale_items%rowtype;
 v_product public.products%rowtype;
 v_returned numeric(14,3);
 v_amount numeric(14,2);
 v_total numeric(14,2):=0;
 v_refund_id uuid;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if not public.has_shop_role(p_shop_id,array['owner','manager']) then raise exception 'Only owner or manager can refund sales'; end if;
 if p_idempotency_key is null then raise exception 'Idempotency key required'; end if;
 if p_reason is null or length(trim(p_reason))<3 or length(trim(p_reason))>300 then raise exception 'Refund reason must be 3-300 characters'; end if;
 if p_refund_method not in ('cash','mobile_money','bank') then raise exception 'Unsupported refund method'; end if;
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'At least one return item is required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_shop_id::text||p_idempotency_key::text,0));
 select * into v_existing from public.sale_refunds where shop_id=p_shop_id and idempotency_key=p_idempotency_key;
 if found then return query select v_existing.id,v_existing.refund_total; return; end if;
 select * into v_sale from public.sales where id=p_sale_id and shop_id=p_shop_id for update;
 if not found then raise exception 'Sale not found'; end if;
 if v_sale.status not in ('completed','refunded') or v_sale.amount_paid<v_sale.total then raise exception 'Only fully paid completed sales can be refunded'; end if;
 if exists(select 1 from jsonb_to_recordset(p_items) as x(sale_item_id uuid,quantity numeric) group by x.sale_item_id having count(*)>1) then raise exception 'Duplicate return lines are not allowed'; end if;
 for v_item in select x.sale_item_id,x.quantity from jsonb_to_recordset(p_items) as x(sale_item_id uuid,quantity numeric) order by x.sale_item_id loop
  if v_item.sale_item_id is null or v_item.quantity is null or v_item.quantity<=0 then raise exception 'Invalid return item or quantity'; end if;
  select * into v_sale_item from public.sale_items where id=v_item.sale_item_id and sale_id=p_sale_id for update;
  if not found then raise exception 'Sale item does not belong to this sale'; end if;
  select coalesce(sum(ri.quantity),0) into v_returned from public.sale_refund_items ri where ri.sale_item_id=v_sale_item.id;
  if v_returned+v_item.quantity>v_sale_item.quantity then raise exception 'Return quantity exceeds sold quantity for %',v_sale_item.product_name_snapshot; end if;
  v_amount:=round(v_sale_item.unit_price*v_item.quantity,2);
  v_total:=v_total+v_amount;
 end loop;
 if v_total<=0 then raise exception 'Refund amount must be positive'; end if;
 insert into public.sale_refunds(shop_id,sale_id,idempotency_key,reason,refund_method,refund_total,created_by)
 values(p_shop_id,p_sale_id,p_idempotency_key,trim(p_reason),p_refund_method,v_total,auth.uid()) returning id into v_refund_id;
 for v_item in select x.sale_item_id,x.quantity from jsonb_to_recordset(p_items) as x(sale_item_id uuid,quantity numeric) order by x.sale_item_id loop
  select * into v_sale_item from public.sale_items where id=v_item.sale_item_id and sale_id=p_sale_id for update;
  v_amount:=round(v_sale_item.unit_price*v_item.quantity,2);
  insert into public.sale_refund_items(refund_id,sale_item_id,quantity,unit_price,refund_amount)
  values(v_refund_id,v_sale_item.id,v_item.quantity,v_sale_item.unit_price,v_amount);
  if v_sale_item.product_id is not null then
   select * into v_product from public.products where id=v_sale_item.product_id and shop_id=p_shop_id for update;
   if found then
    update public.products set stock_quantity=stock_quantity+v_item.quantity where id=v_product.id;
    insert into public.stock_movements(shop_id,product_id,movement_type,quantity_change,reference_id,note,created_by)
    values(p_shop_id,v_product.id,'return',v_item.quantity,v_refund_id,'Customer return: '||trim(p_reason),auth.uid());
   end if;
  end if;
 end loop;
 if not exists(
  select 1 from public.sale_items si
  where si.sale_id=p_sale_id and si.quantity>coalesce((select sum(ri.quantity) from public.sale_refund_items ri where ri.sale_item_id=si.id),0)
 ) then update public.sales set status='refunded' where id=p_sale_id; end if;
 return query select v_refund_id,v_total;
end; $$;
revoke all on function public.refund_sale(uuid,uuid,uuid,jsonb,text,text) from public;
grant execute on function public.refund_sale(uuid,uuid,uuid,jsonb,text,text) to authenticated;
