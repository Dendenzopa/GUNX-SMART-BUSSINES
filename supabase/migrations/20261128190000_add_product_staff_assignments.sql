-- GUNX SMART BUSINESS: tenant-safe product-to-staff assignments.
-- Staged on the feature branch only. Do not apply to production before backup/restore approval.

BEGIN;

-- Composite key lets PostgreSQL enforce that an assignment's product belongs to its shop.
ALTER TABLE public.products
  ADD CONSTRAINT products_shop_id_id_assignment_key UNIQUE (shop_id, id);

CREATE TABLE public.product_staff_assignments (
  shop_id uuid NOT NULL,
  product_id uuid NOT NULL,
  staff_user_id uuid NOT NULL,
  assigned_by uuid NOT NULL DEFAULT auth.uid(),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (shop_id, product_id, staff_user_id),
  CONSTRAINT product_staff_assignments_product_fk
    FOREIGN KEY (shop_id, product_id)
    REFERENCES public.products(shop_id, id) ON DELETE CASCADE,
  CONSTRAINT product_staff_assignments_member_fk
    FOREIGN KEY (shop_id, staff_user_id)
    REFERENCES public.shop_members(shop_id, user_id) ON DELETE CASCADE,
  CONSTRAINT product_staff_assignments_assigner_fk
    FOREIGN KEY (assigned_by) REFERENCES auth.users(id) ON DELETE RESTRICT
);

CREATE INDEX product_staff_assignments_staff_idx
  ON public.product_staff_assignments(shop_id, staff_user_id, product_id);

ALTER TABLE public.product_staff_assignments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.product_staff_assignments FROM PUBLIC, anon, authenticated;

CREATE POLICY product_staff_assignments_read
ON public.product_staff_assignments
FOR SELECT TO authenticated
USING (
  staff_user_id = (SELECT auth.uid())
  OR public.has_shop_role(shop_id, ARRAY['owner']::text[])
  OR public.has_shop_permission(shop_id, 'products.manage')
);

CREATE POLICY product_staff_assignments_manage_insert
ON public.product_staff_assignments
FOR INSERT TO authenticated
WITH CHECK (
  assigned_by = (SELECT auth.uid())
  AND (
    public.has_shop_role(shop_id, ARRAY['owner']::text[])
    OR public.has_shop_permission(shop_id, 'products.manage')
  )
);

CREATE POLICY product_staff_assignments_manage_delete
ON public.product_staff_assignments
FOR DELETE TO authenticated
USING (
  public.has_shop_role(shop_id, ARRAY['owner']::text[])
  OR public.has_shop_permission(shop_id, 'products.manage')
);

-- One atomic operation replaces the assignment set for a product.
-- Managers can do this only when the Owner has granted products.manage.
CREATE OR REPLACE FUNCTION public.set_product_staff_assignments(
  p_shop_id uuid,
  p_product_id uuid,
  p_staff_user_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT (
    public.has_shop_role(p_shop_id, ARRAY['owner']::text[])
    OR public.has_shop_permission(p_shop_id, 'products.manage')
  ) THEN
    RAISE EXCEPTION 'Not authorized to assign products';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = p_product_id AND p.shop_id = p_shop_id
  ) THEN
    RAISE EXCEPTION 'Product not found in this business';
  END IF;

  IF p_staff_user_ids IS NULL OR cardinality(p_staff_user_ids) > 200 THEN
    RAISE EXCEPTION 'Invalid staff assignment list';
  END IF;

  FOREACH v_user_id IN ARRAY p_staff_user_ids LOOP
    IF v_user_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.shop_members sm
      WHERE sm.shop_id = p_shop_id
        AND sm.user_id = v_user_id
        AND sm.role IN ('manager', 'cashier', 'stockkeeper')
    ) THEN
      RAISE EXCEPTION 'Every selected employee must belong to this business';
    END IF;
  END LOOP;

  DELETE FROM public.product_staff_assignments
  WHERE shop_id = p_shop_id AND product_id = p_product_id;

  INSERT INTO public.product_staff_assignments(shop_id, product_id, staff_user_id, assigned_by)
  SELECT p_shop_id, p_product_id, selected.user_id, auth.uid()
  FROM (
    SELECT DISTINCT unnest(p_staff_user_ids) AS user_id
  ) selected;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_product_staff_assignments(uuid, uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_product_staff_assignments(uuid, uuid, uuid[]) TO authenticated;

-- Return assignment IDs with the catalogue. Staff only receive their own assigned IDs.
DROP FUNCTION IF EXISTS public.get_shop_products(uuid);

CREATE FUNCTION public.get_shop_products(p_shop_id uuid)
RETURNS TABLE(
  id uuid, shop_id uuid, name text, sku text, image_url text, category text,
  unit text, cost_price numeric, selling_price numeric, stock_quantity numeric,
  reorder_level numeric, active boolean, assigned_staff_ids uuid[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_can_view_cost boolean;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.has_shop_role(p_shop_id, ARRAY['owner','manager','cashier','stockkeeper']::text[])
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
    p.selling_price, p.stock_quantity, p.reorder_level, p.active,
    COALESCE((
      SELECT array_agg(a.staff_user_id ORDER BY a.staff_user_id)
      FROM public.product_staff_assignments a
      WHERE a.shop_id = p.shop_id
        AND a.product_id = p.id
        AND (
          public.has_shop_role(p_shop_id, ARRAY['owner']::text[])
          OR public.has_shop_permission(p_shop_id, 'products.manage')
          OR a.staff_user_id = auth.uid()
        )
    ), ARRAY[]::uuid[])
  FROM public.products p
  WHERE p.shop_id = p_shop_id
  ORDER BY p.name;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_shop_products(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_shop_products(uuid) TO authenticated;

COMMIT;
