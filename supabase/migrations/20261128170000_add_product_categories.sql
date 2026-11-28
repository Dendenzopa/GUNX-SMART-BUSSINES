-- Add tenant-scoped product categories for the Staff POS catalogue.
-- This migration is intentionally staged in the feature branch; do not apply to production
-- until the approved backup/restore gate has been completed.

BEGIN;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS category text;

GRANT UPDATE (category) ON TABLE public.products TO authenticated;

DROP FUNCTION IF EXISTS public.get_shop_products(uuid);

CREATE FUNCTION public.get_shop_products(p_shop_id uuid)
RETURNS TABLE(
  id uuid, shop_id uuid, name text, sku text, image_url text, category text,
  unit text, cost_price numeric, selling_price numeric, stock_quantity numeric,
  reorder_level numeric, active boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_can_view_cost boolean;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.has_shop_role(p_shop_id, ARRAY['owner','cashier','stockkeeper']::text[])
    OR public.has_shop_permission(p_shop_id, 'products.read')
  ) THEN
    RAISE EXCEPTION 'Not authorized for this business';
  END IF;

  v_can_view_cost :=
    public.has_shop_role(p_shop_id, ARRAY['owner']::text[])
    OR public.has_shop_permission(p_shop_id, 'costs.view')
    OR public.has_shop_permission(p_shop_id, 'reports.profit');

  RETURN QUERY
  SELECT p.id, p.shop_id, p.name, p.sku, p.image_url, p.category, p.unit,
    CASE WHEN v_can_view_cost THEN p.cost_price ELSE NULL::numeric END,
    p.selling_price, p.stock_quantity, p.reorder_level, p.active
  FROM public.products p
  WHERE p.shop_id = p_shop_id
  ORDER BY p.name;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_shop_products(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_shop_products(uuid) TO authenticated;

COMMIT;
