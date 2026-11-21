-- GUNX SMART BUSINESS: atomic stock receiving transaction.
create or replace function public.receive_stock(p_shop_id uuid,p_product_id uuid,p_quantity numeric,p_note text default null)
returns numeric language plpgsql security definer set search_path=public,pg_temp as $$
declare v_product public.products%rowtype; v_new_stock numeric(14,3);
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if not public.has_shop_role(p_shop_id,array['owner','manager','stockkeeper']) then raise exception 'Not permitted to receive stock'; end if;
 if p_quantity is null or p_quantity<=0 or p_quantity>100000000 then raise exception 'Invalid stock quantity'; end if;
 select * into v_product from public.products where id=p_product_id and shop_id=p_shop_id and active for update;
 if not found then raise exception 'Product not found or inactive'; end if;
 v_new_stock:=v_product.stock_quantity+p_quantity;
 if v_new_stock>999999999 then raise exception 'Stock quantity limit exceeded'; end if;
 update public.products set stock_quantity=v_new_stock where id=v_product.id;
 insert into public.stock_movements(shop_id,product_id,movement_type,quantity_change,note,created_by)
 values(p_shop_id,p_product_id,'stock_in',p_quantity,nullif(trim(coalesce(p_note,'')),''),auth.uid());
 return v_new_stock;
end; $$;
revoke all on function public.receive_stock(uuid,uuid,numeric,text) from public;
grant execute on function public.receive_stock(uuid,uuid,numeric,text) to authenticated;
