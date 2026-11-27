-- PR #45 follow-up: enforce cashier own-sale reads and align manager refund navigation.
-- Replaces permissive legacy policies; PostgreSQL combines permissive policies with OR.
BEGIN;

DROP POLICY IF EXISTS sales_role_select ON public.sales;
CREATE POLICY sales_role_select ON public.sales
FOR SELECT TO authenticated
USING (
  public.has_shop_role(shop_id, ARRAY['owner']::text[])
  OR (public.has_shop_role(shop_id, ARRAY['cashier']::text[]) AND created_by = auth.uid())
  OR public.has_shop_permission(shop_id, 'sales.view')
  OR public.has_shop_permission(shop_id, 'reports.view')
);

DROP POLICY IF EXISTS sale_items_role_select ON public.sale_items;
CREATE POLICY sale_items_role_select ON public.sale_items
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.sales s
    WHERE s.id = sale_items.sale_id
      AND (
        public.has_shop_role(s.shop_id, ARRAY['owner']::text[])
        OR (public.has_shop_role(s.shop_id, ARRAY['cashier']::text[]) AND s.created_by = auth.uid())
        OR public.has_shop_permission(s.shop_id, 'sales.view')
        OR public.has_shop_permission(s.shop_id, 'reports.view')
      )
  )
);

DROP POLICY IF EXISTS payments_role_select ON public.payments;
CREATE POLICY payments_role_select ON public.payments
FOR SELECT TO authenticated
USING (
  public.has_shop_role(shop_id, ARRAY['owner']::text[])
  OR (
    public.has_shop_role(shop_id, ARRAY['cashier']::text[])
    AND EXISTS (
      SELECT 1 FROM public.sales s
      WHERE s.id = payments.sale_id AND s.shop_id = payments.shop_id AND s.created_by = auth.uid()
    )
  )
  OR public.has_shop_permission(shop_id, 'payments.view')
);

-- Remove the older broad manager policies too: permissive policies are OR-combined.
DROP POLICY IF EXISTS sale_refunds_management_select ON public.sale_refunds;
DROP POLICY IF EXISTS sale_refund_items_management_select ON public.sale_refund_items;

CREATE OR REPLACE FUNCTION public.get_shop_sales(p_shop_id uuid, p_sale_id uuid DEFAULT NULL)
RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_can_view_cost boolean;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.has_shop_role(p_shop_id, ARRAY['owner','cashier']::text[])
    OR public.has_shop_permission(p_shop_id, 'sales.view')
    OR public.has_shop_permission(p_shop_id, 'reports.view')
  ) THEN
    RAISE EXCEPTION 'Not authorized for this business';
  END IF;

  v_can_view_cost :=
    public.has_shop_role(p_shop_id, ARRAY['owner']::text[])
    OR public.has_shop_permission(p_shop_id, 'reports.profit');

  RETURN QUERY
  SELECT jsonb_build_object(
    'id', s.id,
    'shop_id', s.shop_id,
    'receipt_number', s.receipt_number,
    'customer_id', s.customer_id,
    'status', s.status,
    'subtotal', s.subtotal,
    'discount', s.discount,
    'total', s.total,
    'amount_paid', s.amount_paid,
    'created_by', s.created_by,
    'created_at', s.created_at,
    'sale_items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', si.id,
        'sale_id', si.sale_id,
        'product_id', si.product_id,
        'product_name_snapshot', si.product_name_snapshot,
        'quantity', si.quantity,
        'unit_price', si.unit_price,
        'unit_cost_snapshot', CASE WHEN v_can_view_cost THEN si.unit_cost_snapshot ELSE NULL END,
        'line_total', si.line_total
      ) ORDER BY si.id)
      FROM public.sale_items si WHERE si.sale_id = s.id
    ), '[]'::jsonb),
    'payments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('method', p.method) ORDER BY p.received_at)
      FROM public.payments p WHERE p.sale_id = s.id
    ), '[]'::jsonb)
  )
  FROM public.sales s
  WHERE s.shop_id = p_shop_id
    AND (p_sale_id IS NULL OR s.id = p_sale_id)
    AND (
      public.has_shop_role(p_shop_id, ARRAY['owner']::text[])
      OR (public.has_shop_role(p_shop_id, ARRAY['cashier']::text[]) AND s.created_by = auth.uid())
      OR public.has_shop_permission(p_shop_id, 'sales.view')
      OR public.has_shop_permission(p_shop_id, 'reports.view')
    )
  ORDER BY s.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_shop_sales(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_shop_sales(uuid,uuid) TO authenticated;

COMMIT;
