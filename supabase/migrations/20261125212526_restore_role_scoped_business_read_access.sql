-- RECOVERED EXACTLY from Supabase migration ledger.
-- Source project: qejfhjpopsgaeuqygihr
-- Version: 20261125212526
-- Name: restore_role_scoped_business_read_access
-- This file records an already-applied migration; do not replay on the live project.

-- Re-enable only the tenant data reads used by the app. RLS remains the row boundary.
GRANT SELECT (id, shop_id, receipt_number, customer_id, status, subtotal, discount, total, amount_paid, created_by, created_at)
ON public.sales TO authenticated;
GRANT SELECT (id, sale_id, product_id, product_name_snapshot, quantity, unit_price, line_total)
ON public.sale_items TO authenticated;
GRANT SELECT (id, shop_id, sale_id, customer_id, method, amount, provider_reference, received_at)
ON public.payments TO authenticated;
GRANT SELECT (id, shop_id, name, phone, notes, created_at)
ON public.customers TO authenticated;
GRANT SELECT (id, shop_id, customer_id, description, original_amount, balance, created_by, created_at)
ON public.debts TO authenticated;
GRANT SELECT (id, shop_id, debt_id, amount, method, note, received_by, received_at)
ON public.debt_payments TO authenticated;
GRANT SELECT (id, shop_id, sale_id, customer_id, amount, method, received_at, note)
ON public.debt_repayments TO authenticated;
GRANT SELECT (id, shop_id, description, category, amount, expense_date, note, created_by, created_at)
ON public.expenses TO authenticated;
GRANT INSERT (shop_id, description, category, amount, expense_date, note, created_by)
ON public.expenses TO authenticated;
GRANT SELECT (id, shop_id, product_id, movement_type, quantity_change, reference_id, note, created_by, created_at)
ON public.stock_movements TO authenticated;
GRANT SELECT (id, owner_id, name, currency, timezone, created_at, hero_media_type, hero_media_url, slogan_one, slogan_two)
ON public.shops TO authenticated;
GRANT UPDATE (hero_media_type, hero_media_url)
ON public.shops TO authenticated;
GRANT SELECT (shop_id, plan_code, status, started_at, expires_at, provider, provider_reference, updated_at)
ON public.shop_subscriptions TO authenticated;
GRANT SELECT (id, shop_id, sale_id, idempotency_key, reason, refund_method, refund_total, created_by, created_at)
ON public.sale_refunds TO authenticated;
GRANT SELECT (id, refund_id, sale_item_id, quantity, unit_price, refund_amount)
ON public.sale_refund_items TO authenticated;

-- Keep cost snapshots available only through a role-aware server function.
CREATE OR REPLACE FUNCTION public.get_shop_sales(p_shop_id uuid, p_sale_id uuid DEFAULT NULL)
RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_can_view_cost boolean;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_shop_role(p_shop_id, ARRAY['owner','manager','cashier']::text[]) THEN
    RAISE EXCEPTION 'Not authorized for this business';
  END IF;
  v_can_view_cost := public.has_shop_role(p_shop_id, ARRAY['owner','manager']::text[]);

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
  WHERE s.shop_id = p_shop_id AND (p_sale_id IS NULL OR s.id = p_sale_id)
  ORDER BY s.created_at DESC;
END;
$$;
REVOKE ALL ON FUNCTION public.get_shop_sales(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_shop_sales(uuid,uuid) TO authenticated;
