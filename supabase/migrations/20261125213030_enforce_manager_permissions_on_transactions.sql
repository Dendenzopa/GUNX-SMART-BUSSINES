-- RECOVERED EXACTLY from Supabase migration ledger.
-- Source project: qejfhjpopsgaeuqygihr
-- Version: 20261125213030
-- Name: enforce_manager_permissions_on_transactions
-- This file records an already-applied migration; do not replay on the live project.

-- Manager permission grants also gate transactional RPCs, not just dashboard navigation.
DO $$
DECLARE v_def text;
BEGIN
  SELECT pg_get_functiondef('public.checkout_sale(uuid,uuid,jsonb,text,numeric,uuid,numeric)'::regprocedure) INTO v_def;
  v_def := replace(v_def,
    'if not public.has_shop_role(p_shop_id, array[''owner'',''manager'',''cashier'']) then',
    'if not (public.has_shop_role(p_shop_id, array[''owner'',''cashier'']) or public.has_shop_permission(p_shop_id,''pos.use'')) then');
  EXECUTE v_def;

  SELECT pg_get_functiondef('public.create_manual_debt(uuid,text,numeric,text)'::regprocedure) INTO v_def;
  v_def := replace(v_def,
    'if not public.has_shop_role(p_shop_id, array[''owner'',''manager'',''cashier'']) then',
    'if not (public.has_shop_role(p_shop_id, array[''owner'',''cashier'']) or public.has_shop_permission(p_shop_id,''debts.manage'')) then');
  EXECUTE v_def;

  SELECT pg_get_functiondef('public.record_debt_payment(uuid,numeric,text,text)'::regprocedure) INTO v_def;
  v_def := replace(v_def,
    'if not public.has_shop_role(v_debt.shop_id,array[''owner'',''manager'',''cashier'']) then',
    'if not (public.has_shop_role(v_debt.shop_id,array[''owner'',''cashier'']) or public.has_shop_permission(v_debt.shop_id,''debts.manage'')) then');
  EXECUTE v_def;

  SELECT pg_get_functiondef('public.receive_stock(uuid,uuid,numeric,text)'::regprocedure) INTO v_def;
  v_def := replace(v_def,
    'if not public.has_shop_role(p_shop_id,array[''owner'',''manager'',''stockkeeper'']) then',
    'if not (public.has_shop_role(p_shop_id,array[''owner'',''stockkeeper'']) or public.has_shop_permission(p_shop_id,''stock.manage'')) then');
  EXECUTE v_def;

  SELECT pg_get_functiondef('public.refund_sale(uuid,uuid,uuid,jsonb,text,text)'::regprocedure) INTO v_def;
  v_def := replace(v_def,
    'if not public.has_shop_role(p_shop_id,array[''owner'',''manager'']) then',
    'if not (public.has_shop_role(p_shop_id,array[''owner'']) or public.has_shop_permission(p_shop_id,''refunds.manage'')) then');
  EXECUTE v_def;
END $$;

DROP POLICY IF EXISTS sales_role_insert ON public.sales;
CREATE POLICY sales_role_insert ON public.sales FOR INSERT TO authenticated
WITH CHECK (public.has_shop_role(shop_id,ARRAY['owner','cashier']::text[]) OR public.has_shop_permission(shop_id,'pos.use'));
DROP POLICY IF EXISTS sale_items_role_insert ON public.sale_items;
CREATE POLICY sale_items_role_insert ON public.sale_items FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.sales s WHERE s.id=sale_items.sale_id
  AND (public.has_shop_role(s.shop_id,ARRAY['owner','cashier']::text[]) OR public.has_shop_permission(s.shop_id,'pos.use'))));
DROP POLICY IF EXISTS payments_role_insert ON public.payments;
CREATE POLICY payments_role_insert ON public.payments FOR INSERT TO authenticated
WITH CHECK (public.has_shop_role(shop_id,ARRAY['owner','cashier']::text[]) OR public.has_shop_permission(shop_id,'pos.use'));

-- Reports can read sales only when the owner explicitly grants report access.
CREATE OR REPLACE FUNCTION public.get_shop_sales(p_shop_id uuid,p_sale_id uuid DEFAULT NULL)
RETURNS SETOF jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE v_can_view_cost boolean;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.has_shop_role(p_shop_id,ARRAY['owner','cashier']::text[])
    OR public.has_shop_permission(p_shop_id,'sales.view')
    OR public.has_shop_permission(p_shop_id,'reports.view')
  ) THEN RAISE EXCEPTION 'Not authorized for this business'; END IF;
  v_can_view_cost := public.has_shop_role(p_shop_id,ARRAY['owner']::text[]) OR public.has_shop_permission(p_shop_id,'reports.profit');
  RETURN QUERY SELECT jsonb_build_object(
    'id',s.id,'shop_id',s.shop_id,'receipt_number',s.receipt_number,'customer_id',s.customer_id,
    'status',s.status,'subtotal',s.subtotal,'discount',s.discount,'total',s.total,'amount_paid',s.amount_paid,
    'created_by',s.created_by,'created_at',s.created_at,
    'sale_items',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id',si.id,'sale_id',si.sale_id,'product_id',si.product_id,'product_name_snapshot',si.product_name_snapshot,
      'quantity',si.quantity,'unit_price',si.unit_price,
      'unit_cost_snapshot',CASE WHEN v_can_view_cost THEN si.unit_cost_snapshot ELSE NULL END,
      'line_total',si.line_total) ORDER BY si.id) FROM public.sale_items si WHERE si.sale_id=s.id),'[]'::jsonb),
    'payments',COALESCE((SELECT jsonb_agg(jsonb_build_object('method',p.method) ORDER BY p.received_at)
      FROM public.payments p WHERE p.sale_id=s.id),'[]'::jsonb)
  ) FROM public.sales s WHERE s.shop_id=p_shop_id AND (p_sale_id IS NULL OR s.id=p_sale_id)
  ORDER BY s.created_at DESC;
END;
$$;
REVOKE ALL ON FUNCTION public.get_shop_sales(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_shop_sales(uuid,uuid) TO authenticated;
