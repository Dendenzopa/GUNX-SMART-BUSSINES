-- RECOVERED EXACTLY from Supabase migration ledger.
-- Source project: qejfhjpopsgaeuqygihr
-- Version: 20261125212210
-- Name: secure_product_cost_and_member_visibility
-- This file records an already-applied migration; do not replay on the live project.

-- Safe product projection: only trusted management roles receive acquisition cost.
CREATE OR REPLACE FUNCTION public.get_shop_products(p_shop_id uuid)
RETURNS TABLE (
  id uuid,
  shop_id uuid,
  name text,
  sku text,
  unit text,
  cost_price numeric,
  selling_price numeric,
  stock_quantity numeric,
  reorder_level numeric,
  active boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_can_manage boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT public.has_shop_role(p_shop_id, ARRAY['owner','manager','cashier','stockkeeper']::text[]) THEN
    RAISE EXCEPTION 'Not authorized for this business';
  END IF;

  v_can_manage := public.has_shop_role(p_shop_id, ARRAY['owner','manager']::text[]);

  RETURN QUERY
  SELECT p.id, p.shop_id, p.name, p.sku, p.unit,
         CASE WHEN v_can_manage THEN p.cost_price ELSE NULL::numeric END,
         p.selling_price, p.stock_quantity, p.reorder_level, p.active
  FROM public.products p
  WHERE p.shop_id = p_shop_id
  ORDER BY p.name;
END;
$$;

REVOKE ALL ON FUNCTION public.get_shop_products(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_shop_products(uuid) TO authenticated;

-- Never allow stockkeepers to edit product catalog or acquisition costs directly.
DROP POLICY IF EXISTS products_role_update ON public.products;
CREATE POLICY products_management_update
ON public.products
FOR UPDATE TO authenticated
USING (public.has_shop_role(shop_id, ARRAY['owner','manager']::text[]))
WITH CHECK (public.has_shop_role(shop_id, ARRAY['owner','manager']::text[]));

-- Grant only non-sensitive product columns for direct reads; cost_price is available
-- only through the role-checking RPC above.
GRANT SELECT (id, shop_id, name, sku, unit, selling_price, stock_quantity, reorder_level, active)
ON public.products TO authenticated;

-- Product creation remains restricted by products_management_insert RLS policy.
GRANT INSERT (shop_id, name, sku, unit, cost_price, selling_price, stock_quantity, reorder_level, active)
ON public.products TO authenticated;

-- Restrict peer visibility of membership records to management roles.
DROP POLICY IF EXISTS shop_members_self_or_peer_select ON public.shop_members;
CREATE POLICY shop_members_self_or_management_select
ON public.shop_members
FOR SELECT TO authenticated
USING (
  user_id = (SELECT auth.uid())
  OR public.has_shop_role(shop_id, ARRAY['owner','manager']::text[])
);
