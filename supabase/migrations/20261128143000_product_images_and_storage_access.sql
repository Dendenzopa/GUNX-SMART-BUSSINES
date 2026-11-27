-- Product photos use the existing public business-assets bucket.
-- Uploads and replacements are restricted to the authenticated shop owner or
-- a manager with products.manage, and each uploader can only manage their own folder.

BEGIN;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS image_url text;

-- Keep the existing column-level update boundary while explicitly allowing
-- product managers to persist the uploaded image URL. Stock and price columns
-- remain governed by the existing grants and trigger.
GRANT UPDATE (image_url) ON TABLE public.products TO authenticated;

DROP FUNCTION IF EXISTS public.get_shop_products(uuid);

CREATE FUNCTION public.get_shop_products(p_shop_id uuid)
RETURNS TABLE(
  id uuid,
  shop_id uuid,
  name text,
  sku text,
  image_url text,
  unit text,
  cost_price numeric,
  selling_price numeric,
  stock_quantity numeric,
  reorder_level numeric,
  active boolean
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
  SELECT
    p.id,
    p.shop_id,
    p.name,
    p.sku,
    p.image_url,
    p.unit,
    CASE WHEN v_can_view_cost THEN p.cost_price ELSE NULL::numeric END,
    p.selling_price,
    p.stock_quantity,
    p.reorder_level,
    p.active
  FROM public.products p
  WHERE p.shop_id = p_shop_id
  ORDER BY p.name;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_shop_products(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_shop_products(uuid) TO authenticated;

-- The bucket is public for product-image display, but listing and mutations
-- through the Storage API are limited to the uploader and product managers.
DROP POLICY IF EXISTS business_assets_product_images_select ON storage.objects;
CREATE POLICY business_assets_product_images_select
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'business-assets'
  AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND (storage.foldername(name))[2] = (SELECT auth.uid())::text
  AND (storage.foldername(name))[3] = 'products'
  AND (
    public.has_shop_role(((storage.foldername(name))[1])::uuid, ARRAY['owner']::text[])
    OR public.has_shop_permission(((storage.foldername(name))[1])::uuid, 'products.manage')
  )
);

DROP POLICY IF EXISTS business_assets_product_images_insert ON storage.objects;
CREATE POLICY business_assets_product_images_insert
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'business-assets'
  AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND (storage.foldername(name))[2] = (SELECT auth.uid())::text
  AND (storage.foldername(name))[3] = 'products'
  AND (
    public.has_shop_role(((storage.foldername(name))[1])::uuid, ARRAY['owner']::text[])
    OR public.has_shop_permission(((storage.foldername(name))[1]::uuid, 'products.manage')
  )
);

DROP POLICY IF EXISTS business_assets_product_images_update ON storage.objects;
CREATE POLICY business_assets_product_images_update
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'business-assets'
  AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND (storage.foldername(name))[2] = (SELECT auth.uid())::text
  AND (storage.foldername(name))[3] = 'products'
  AND (
    public.has_shop_role(((storage.foldername(name))[1])::uuid, ARRAY['owner']::text[])
    OR public.has_shop_permission(((storage.foldername(name))[1])::uuid, 'products.manage')
  )
)
WITH CHECK (
  bucket_id = 'business-assets'
  AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND (storage.foldername(name))[2] = (SELECT auth.uid())::text
  AND (storage.foldername(name))[3] = 'products'
  AND (
    public.has_shop_role(((storage.foldername(name))[1])::uuid, ARRAY['owner']::text[])
    OR public.has_shop_permission(((storage.foldername(name))[1])::uuid, 'products.manage')
  )
);

COMMIT;
