-- RECOVERED EXACTLY from Supabase migration ledger.
-- Source project: qejfhjpopsgaeuqygihr
-- Version: 20261125213339
-- Name: owner_only_subscription_and_cost_grants
-- This file records an already-applied migration; do not replay on the live project.

DO $$
DECLARE v_def text;
BEGIN
 SELECT pg_get_functiondef('public.get_shop_subscription(uuid)'::regprocedure) INTO v_def;
 v_def:=replace(v_def,
   'if not public.is_shop_member(p_shop_id) then raise exception ''Shop membership required''; end if;',
   'if not public.has_shop_role(p_shop_id,array[''owner'']) then raise exception ''Only the business owner can view subscription details''; end if;');
 EXECUTE v_def;
END $$;

CREATE OR REPLACE FUNCTION public.get_shop_products(p_shop_id uuid)
RETURNS TABLE (id uuid,shop_id uuid,name text,sku text,unit text,cost_price numeric,selling_price numeric,stock_quantity numeric,reorder_level numeric,active boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE v_can_view_cost boolean;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.has_shop_role(p_shop_id,ARRAY['owner','cashier','stockkeeper']::text[])
    OR public.has_shop_permission(p_shop_id,'products.read')
  ) THEN RAISE EXCEPTION 'Not authorized for this business'; END IF;
  v_can_view_cost := public.has_shop_role(p_shop_id,ARRAY['owner']::text[])
    OR public.has_shop_permission(p_shop_id,'costs.view')
    OR public.has_shop_permission(p_shop_id,'reports.profit');
  RETURN QUERY SELECT p.id,p.shop_id,p.name,p.sku,p.unit,
    CASE WHEN v_can_view_cost THEN p.cost_price ELSE NULL::numeric END,
    p.selling_price,p.stock_quantity,p.reorder_level,p.active
  FROM public.products p WHERE p.shop_id=p_shop_id ORDER BY p.name;
END;
$$;
REVOKE ALL ON FUNCTION public.get_shop_products(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_shop_products(uuid) TO authenticated;
