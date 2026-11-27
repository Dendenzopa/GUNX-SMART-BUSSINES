-- PR #45: align authoritative refund calculations with discounted sale totals
-- and remove unnecessary owner/payer identifiers from Super Admin RPC responses.
-- This migration is intentionally NOT applied to the connected Production project.

BEGIN;

-- Recreate functions because PostgreSQL cannot change OUT/RETURNS TABLE columns
-- with CREATE OR REPLACE. Drop/recreate preserves the public RPC names and args.
DROP FUNCTION IF EXISTS public.refund_sale(uuid, uuid, uuid, jsonb, text, text);

CREATE FUNCTION public.refund_sale(
  p_shop_id uuid,
  p_sale_id uuid,
  p_idempotency_key uuid,
  p_items jsonb,
  p_reason text,
  p_refund_method text DEFAULT 'cash'
)
RETURNS TABLE(refund_id uuid, refund_total numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sale public.sales%rowtype;
  v_existing public.sale_refunds%rowtype;
  v_item record;
  v_sale_item public.sale_items%rowtype;
  v_product public.products%rowtype;
  v_returned numeric(14,3);
  v_previous_refund_cents bigint;
  v_allocated_cents bigint;
  v_target_cents bigint;
  v_amount_cents bigint;
  v_total_cents bigint := 0;
  v_refund_id uuid;
  v_refund_lines jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT (
    public.has_shop_role(p_shop_id, ARRAY['owner']::text[])
    OR public.has_shop_permission(p_shop_id, 'refunds.manage')
  ) THEN
    RAISE EXCEPTION 'Only owner or manager can refund sales';
  END IF;

  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'Idempotency key required';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 OR length(trim(p_reason)) > 300 THEN
    RAISE EXCEPTION 'Refund reason must be 3-300 characters';
  END IF;
  IF p_refund_method IS NULL OR p_refund_method NOT IN ('cash','mobile_money','bank') THEN
    RAISE EXCEPTION 'Unsupported refund method';
  END IF;
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Return items must be a JSON array';
  END IF;
  IF jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'At least one return item is required';
  END IF;

  -- Serialize retries for the same shop/idempotency key.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_shop_id::text || p_idempotency_key::text, 0));

  SELECT * INTO v_existing
  FROM public.sale_refunds
  WHERE shop_id = p_shop_id AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN QUERY SELECT v_existing.id, v_existing.refund_total;
    RETURN;
  END IF;

  SELECT * INTO v_sale
  FROM public.sales
  WHERE id = p_sale_id AND shop_id = p_shop_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sale not found';
  END IF;
  IF v_sale.status NOT IN ('completed','refunded') OR v_sale.amount_paid < v_sale.total THEN
    RAISE EXCEPTION 'Only fully paid completed sales can be refunded';
  END IF;

  -- Fail closed for inconsistent historical sale totals or line snapshots.
  IF v_sale.subtotal IS NULL OR v_sale.subtotal <= 0
     OR v_sale.total IS NULL OR v_sale.total <= 0
     OR v_sale.total > v_sale.subtotal
     OR round((v_sale.subtotal - coalesce(v_sale.discount, 0)) * 100) <> round(v_sale.total * 100)
     OR round(coalesce((SELECT sum(si.line_total) FROM public.sale_items si WHERE si.sale_id = p_sale_id), 0) * 100)
        <> round(v_sale.subtotal * 100) THEN
    RAISE EXCEPTION 'Sale totals cannot be reconciled; manual review required';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_items) AS x(sale_item_id uuid, quantity numeric)
    GROUP BY x.sale_item_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate return lines are not allowed';
  END IF;

  FOR v_item IN
    SELECT x.sale_item_id, x.quantity
    FROM jsonb_to_recordset(p_items) AS x(sale_item_id uuid, quantity numeric)
    ORDER BY x.sale_item_id
  LOOP
    IF v_item.sale_item_id IS NULL OR v_item.quantity IS NULL OR v_item.quantity <= 0 THEN
      RAISE EXCEPTION 'Invalid return item or quantity';
    END IF;

    SELECT * INTO v_sale_item
    FROM public.sale_items
    WHERE id = v_item.sale_item_id AND sale_id = p_sale_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Sale item does not belong to this sale';
    END IF;

    SELECT coalesce(sum(ri.quantity), 0)
    INTO v_returned
    FROM public.sale_refund_items ri
    WHERE ri.sale_item_id = v_sale_item.id;

    IF v_returned + v_item.quantity > v_sale_item.quantity THEN
      RAISE EXCEPTION 'Return quantity exceeds sold quantity for %', v_sale_item.product_name_snapshot;
    END IF;

    -- Allocate the net sale value to every line using largest remainder.
    -- All arithmetic is in integer cents; sale_item.id breaks ties deterministically.
    WITH line_values AS (
      SELECT
        si.id,
        round(si.line_total * 100)::bigint AS gross_cents,
        round(v_sale.total * 100)::bigint AS net_cents,
        round(v_sale.subtotal * 100)::bigint AS subtotal_cents
      FROM public.sale_items si
      WHERE si.sale_id = p_sale_id
    ),
    base_shares AS (
      SELECT
        id,
        floor(net_cents::numeric * gross_cents::numeric / subtotal_cents::numeric)::bigint AS base_cents,
        mod(net_cents::numeric * gross_cents::numeric, subtotal_cents::numeric) AS remainder,
        net_cents
      FROM line_values
    ),
    ranked_shares AS (
      SELECT
        id,
        base_cents,
        (net_cents - sum(base_cents) OVER ())::bigint AS extra_cents,
        row_number() OVER (ORDER BY remainder DESC, id ASC) AS remainder_rank
      FROM base_shares
    )
    SELECT base_cents + CASE WHEN remainder_rank <= extra_cents THEN 1 ELSE 0 END
    INTO v_allocated_cents
    FROM ranked_shares
    WHERE id = v_sale_item.id;

    IF v_allocated_cents IS NULL OR v_allocated_cents < 0 THEN
      RAISE EXCEPTION 'Sale line allocation failed; manual review required';
    END IF;

    SELECT round(coalesce(sum(ri.refund_amount), 0) * 100)::bigint
    INTO v_previous_refund_cents
    FROM public.sale_refund_items ri
    WHERE ri.sale_item_id = v_sale_item.id;

    v_target_cents := round(
      v_allocated_cents::numeric * (v_returned + v_item.quantity) / v_sale_item.quantity,
      0
    )::bigint;

    IF v_previous_refund_cents > v_target_cents THEN
      RAISE EXCEPTION 'Historical refunds exceed corrected discounted allocation for item %; manual reconciliation required',
        v_sale_item.id;
    END IF;

    v_amount_cents := v_target_cents - v_previous_refund_cents;
    v_total_cents := v_total_cents + v_amount_cents;
    v_refund_lines := v_refund_lines || jsonb_build_array(jsonb_build_object(
      'sale_item_id', v_sale_item.id,
      'quantity', v_item.quantity,
      'unit_price', v_sale_item.unit_price,
      'amount_cents', v_amount_cents
    ));
  END LOOP;

  IF v_total_cents <= 0 THEN
    RAISE EXCEPTION 'Refund amount must be positive';
  END IF;

  INSERT INTO public.sale_refunds(
    shop_id, sale_id, idempotency_key, reason, refund_method, refund_total, created_by
  )
  VALUES (
    p_shop_id, p_sale_id, p_idempotency_key, trim(p_reason), p_refund_method,
    v_total_cents::numeric / 100, auth.uid()
  )
  RETURNING id INTO v_refund_id;

  FOR v_item IN
    SELECT x.sale_item_id, x.quantity, x.unit_price, x.amount_cents
    FROM jsonb_to_recordset(v_refund_lines)
      AS x(sale_item_id uuid, quantity numeric, unit_price numeric, amount_cents bigint)
    ORDER BY x.sale_item_id
  LOOP
    INSERT INTO public.sale_refund_items(
      refund_id, sale_item_id, quantity, unit_price, refund_amount
    )
    VALUES (
      v_refund_id, v_item.sale_item_id, v_item.quantity, v_item.unit_price,
      v_item.amount_cents::numeric / 100
    );

    SELECT * INTO v_sale_item
    FROM public.sale_items
    WHERE id = v_item.sale_item_id AND sale_id = p_sale_id
    FOR UPDATE;

    IF v_sale_item.product_id IS NOT NULL THEN
      SELECT * INTO v_product
      FROM public.products
      WHERE id = v_sale_item.product_id AND shop_id = p_shop_id
      FOR UPDATE;

      IF FOUND THEN
        UPDATE public.products
        SET stock_quantity = stock_quantity + v_item.quantity
        WHERE id = v_product.id;

        INSERT INTO public.stock_movements(
          shop_id, product_id, movement_type, quantity_change,
          reference_id, note, created_by
        )
        VALUES (
          p_shop_id, v_product.id, 'return', v_item.quantity, v_refund_id,
          'Customer return: ' || trim(p_reason), auth.uid()
        );
      END IF;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1
    FROM public.sale_items si
    WHERE si.sale_id = p_sale_id
      AND si.quantity > coalesce((
        SELECT sum(ri.quantity)
        FROM public.sale_refund_items ri
        WHERE ri.sale_item_id = si.id
      ), 0)
  ) THEN
    UPDATE public.sales SET status = 'refunded' WHERE id = p_sale_id;
  END IF;

  RETURN QUERY SELECT v_refund_id, v_total_cents::numeric / 100;
END;
$$;

REVOKE ALL ON FUNCTION public.refund_sale(uuid, uuid, uuid, jsonb, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refund_sale(uuid, uuid, uuid, jsonb, text, text) TO authenticated;

-- Platform user directory also avoids exposing email addresses. Search by exact
-- opaque user ID only; the UI does not print that identifier.
DROP FUNCTION IF EXISTS public.get_platform_admin_users(text, integer, integer);

CREATE FUNCTION public.get_platform_admin_users(
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  user_id uuid,
  created_at timestamptz,
  shop_count bigint,
  roles text[],
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $platform_user$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Platform administrator access required' USING errcode = '42501';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100
     OR p_offset IS NULL OR p_offset < 0 THEN
    RAISE EXCEPTION 'Invalid pagination' USING errcode = '22023';
  END IF;

  RETURN QUERY
  WITH user_rows AS (
    SELECT
      u.id,
      u.created_at,
      count(DISTINCT sm.shop_id)::bigint AS shops,
      coalesce(
        array_agg(DISTINCT sm.role) FILTER (WHERE sm.role IS NOT NULL),
        ARRAY[]::text[]
      ) AS user_roles
    FROM auth.users u
    LEFT JOIN public.shop_members sm ON sm.user_id = u.id
    WHERE p_search IS NULL
       OR trim(p_search) = ''
       OR u.id::text = trim(p_search)
    GROUP BY u.id, u.created_at
  )
  SELECT
    id,
    user_rows.created_at,
    shops,
    user_roles,
    count(*) OVER()::bigint
  FROM user_rows
  ORDER BY user_rows.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$platform_user$;

REVOKE ALL ON FUNCTION public.get_platform_admin_users(text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_platform_admin_users(text, integer, integer) TO authenticated;

-- The directory is platform metadata only. Do not return owner identifiers or email,
-- and do not allow searching platform-wide by private owner email.
DROP FUNCTION IF EXISTS public.get_platform_businesses(text, integer, integer);

CREATE FUNCTION public.get_platform_businesses(
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  shop_id uuid,
  business_name text,
  created_at timestamptz,
  member_count bigint,
  plan_code text,
  subscription_status text,
  expires_at timestamptz,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Platform administrator access required' USING errcode = '42501';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'Page size must be between 1 and 100' USING errcode = '22023';
  END IF;
  IF p_offset IS NULL OR p_offset < 0 THEN
    RAISE EXCEPTION 'Offset cannot be negative' USING errcode = '22023';
  END IF;

  RETURN QUERY
  WITH directory AS (
    SELECT
      sh.id AS shop_id,
      sh.name AS business_name,
      sh.created_at,
      count(DISTINCT sm.user_id)::bigint AS member_count,
      coalesce(ss.plan_code, 'free')::text AS plan_code,
      coalesce(ss.status, 'free')::text AS subscription_status,
      ss.expires_at
    FROM public.shops sh
    LEFT JOIN public.shop_members sm ON sm.shop_id = sh.id
    LEFT JOIN public.shop_subscriptions ss ON ss.shop_id = sh.id
    WHERE p_search IS NULL
       OR length(trim(p_search)) = 0
       OR sh.name ILIKE '%' || trim(p_search) || '%'
    GROUP BY sh.id, sh.name, sh.created_at, ss.plan_code, ss.status, ss.expires_at
  )
  SELECT d.*, count(*) OVER()::bigint
  FROM directory d
  ORDER BY d.created_at DESC, d.business_name ASC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.get_platform_businesses(text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_platform_businesses(text, integer, integer) TO authenticated;

-- Payment review returns only the minimum platform subscription metadata.
-- Owner email, submitted_by, payer phone, full transaction reference and free-text
-- admin notes are intentionally excluded from the client-facing contract.
DROP FUNCTION IF EXISTS public.get_platform_payment_requests(text, integer, integer);

CREATE FUNCTION public.get_platform_payment_requests(
  p_status text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  request_id uuid,
  shop_id uuid,
  business_name text,
  provider text,
  amount_tzs integer,
  status text,
  submitted_at timestamptz,
  verified_at timestamptz,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Platform administrator access required' USING errcode = '42501';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100
     OR p_offset IS NULL OR p_offset < 0 THEN
    RAISE EXCEPTION 'Invalid pagination' USING errcode = '22023';
  END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('pending','verified','rejected') THEN
    RAISE EXCEPTION 'Invalid payment status' USING errcode = '22023';
  END IF;

  RETURN QUERY
  SELECT
    pr.id,
    pr.shop_id,
    sh.name,
    pr.provider,
    pr.amount_tzs,
    pr.status,
    pr.submitted_at,
    pr.verified_at,
    count(*) OVER()::bigint
  FROM public.pro_payment_requests pr
  JOIN public.shops sh ON sh.id = pr.shop_id
  WHERE p_status IS NULL OR pr.status = p_status
  ORDER BY pr.submitted_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.get_platform_payment_requests(text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_platform_payment_requests(text, integer, integer) TO authenticated;

COMMIT;
