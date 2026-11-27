-- RECOVERED EXACTLY from Supabase migration ledger.
-- Source project: qejfhjpopsgaeuqygihr
-- Version: 20261125212933
-- Name: add_owner_managed_manager_permissions
-- This file records an already-applied migration; do not replay on the live project.

CREATE TABLE IF NOT EXISTS public.shop_member_permissions (
  shop_id uuid NOT NULL,
  user_id uuid NOT NULL,
  permission text NOT NULL,
  granted_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (shop_id,user_id,permission),
  FOREIGN KEY (shop_id,user_id) REFERENCES public.shop_members(shop_id,user_id) ON DELETE CASCADE
);
ALTER TABLE public.shop_member_permissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.shop_member_permissions FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.has_shop_permission(p_shop_id uuid,p_permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.shop_member_permissions p
    WHERE p.shop_id=p_shop_id AND p.user_id=auth.uid() AND p.permission=p_permission
  ) AND public.has_shop_role(p_shop_id,ARRAY['manager']::text[]);
$$;
REVOKE ALL ON FUNCTION public.has_shop_permission(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.has_shop_permission(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_shop_permissions(p_shop_id uuid)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_shop_role(p_shop_id,ARRAY['manager']::text[]) THEN
    RETURN ARRAY[]::text[];
  END IF;
  RETURN COALESCE((SELECT array_agg(permission ORDER BY permission)
    FROM public.shop_member_permissions
    WHERE shop_id=p_shop_id AND user_id=auth.uid()),ARRAY[]::text[]);
END;
$$;
REVOKE ALL ON FUNCTION public.get_my_shop_permissions(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_my_shop_permissions(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_shop_member_permissions(p_shop_id uuid,p_user_id uuid)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_shop_role(p_shop_id,ARRAY['owner']::text[]) THEN
    RAISE EXCEPTION 'Only the business owner can view staff permissions';
  END IF;
  IF NOT public.has_shop_role(p_shop_id,ARRAY['manager']::text[]) OR NOT EXISTS (
    SELECT 1 FROM public.shop_members WHERE shop_id=p_shop_id AND user_id=p_user_id AND role='manager'
  ) THEN
    RAISE EXCEPTION 'Manager account not found';
  END IF;
  RETURN COALESCE((SELECT array_agg(permission ORDER BY permission)
    FROM public.shop_member_permissions WHERE shop_id=p_shop_id AND user_id=p_user_id),ARRAY[]::text[]);
END;
$$;
REVOKE ALL ON FUNCTION public.get_shop_member_permissions(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_shop_member_permissions(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_manager_permissions(p_shop_id uuid,p_user_id uuid,p_permissions text[])
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_permission text;
DECLARE v_allowed constant text[] := ARRAY[
  'products.read','products.manage','pos.use','sales.view','payments.view',
  'customers.read','debts.manage','stock.manage','expenses.manage',
  'refunds.manage','reports.view','reports.profit','sync.manage'
];
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_shop_role(p_shop_id,ARRAY['owner']::text[]) THEN
    RAISE EXCEPTION 'Only the business owner can assign manager permissions';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.shop_members WHERE shop_id=p_shop_id AND user_id=p_user_id AND role='manager') THEN
    RAISE EXCEPTION 'Selected user is not a manager in this business';
  END IF;
  IF p_permissions IS NULL OR cardinality(p_permissions)>cardinality(v_allowed) THEN
    RAISE EXCEPTION 'Invalid permissions list';
  END IF;
  FOREACH v_permission IN ARRAY p_permissions LOOP
    IF NOT (v_permission=ANY(v_allowed)) THEN
      RAISE EXCEPTION 'Unsupported permission: %',v_permission;
    END IF;
  END LOOP;
  DELETE FROM public.shop_member_permissions WHERE shop_id=p_shop_id AND user_id=p_user_id;
  INSERT INTO public.shop_member_permissions(shop_id,user_id,permission,granted_by)
  SELECT p_shop_id,p_user_id,permission,auth.uid()
  FROM (SELECT DISTINCT unnest(coalesce(p_permissions,ARRAY[]::text[])) permission) q;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.set_manager_permissions(uuid,uuid,text[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_manager_permissions(uuid,uuid,text[]) TO authenticated;

-- Manager access is now explicitly granted by the Owner.
DROP POLICY IF EXISTS customers_role_select ON public.customers;
CREATE POLICY customers_role_select ON public.customers FOR SELECT TO authenticated
USING (public.has_shop_role(shop_id,ARRAY['owner','cashier']::text[]) OR public.has_shop_permission(shop_id,'customers.read'));
DROP POLICY IF EXISTS customers_role_insert ON public.customers;
CREATE POLICY customers_role_insert ON public.customers FOR INSERT TO authenticated
WITH CHECK (public.has_shop_role(shop_id,ARRAY['owner','cashier']::text[]) OR public.has_shop_permission(shop_id,'customers.read'));
DROP POLICY IF EXISTS customers_role_update ON public.customers;
CREATE POLICY customers_role_update ON public.customers FOR UPDATE TO authenticated
USING (public.has_shop_role(shop_id,ARRAY['owner','cashier']::text[]) OR public.has_shop_permission(shop_id,'customers.read'))
WITH CHECK (public.has_shop_role(shop_id,ARRAY['owner','cashier']::text[]) OR public.has_shop_permission(shop_id,'customers.read'));
DROP POLICY IF EXISTS customers_role_delete ON public.customers;
CREATE POLICY customers_role_delete ON public.customers FOR DELETE TO authenticated
USING (public.has_shop_role(shop_id,ARRAY['owner']::text[]));

DROP POLICY IF EXISTS sales_role_select ON public.sales;
CREATE POLICY sales_role_select ON public.sales FOR SELECT TO authenticated
USING (public.has_shop_role(shop_id,ARRAY['owner','cashier']::text[]) OR public.has_shop_permission(shop_id,'sales.view'));
DROP POLICY IF EXISTS sale_items_role_select ON public.sale_items;
CREATE POLICY sale_items_role_select ON public.sale_items FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.sales s WHERE s.id=sale_items.sale_id
  AND (public.has_shop_role(s.shop_id,ARRAY['owner','cashier']::text[]) OR public.has_shop_permission(s.shop_id,'sales.view'))));
DROP POLICY IF EXISTS payments_role_select ON public.payments;
CREATE POLICY payments_role_select ON public.payments FOR SELECT TO authenticated
USING (public.has_shop_role(shop_id,ARRAY['owner','cashier']::text[]) OR public.has_shop_permission(shop_id,'payments.view'));

DROP POLICY IF EXISTS debts_role_select ON public.debts;
CREATE POLICY debts_role_select ON public.debts FOR SELECT TO authenticated
USING (public.has_shop_role(shop_id,ARRAY['owner','cashier']::text[]) OR public.has_shop_permission(shop_id,'debts.manage'));
DROP POLICY IF EXISTS debt_payments_role_select ON public.debt_payments;
CREATE POLICY debt_payments_role_select ON public.debt_payments FOR SELECT TO authenticated
USING (public.has_shop_role(shop_id,ARRAY['owner','cashier']::text[]) OR public.has_shop_permission(shop_id,'debts.manage'));
DROP POLICY IF EXISTS debt_repayments_role_select ON public.debt_repayments;
CREATE POLICY debt_repayments_role_select ON public.debt_repayments FOR SELECT TO authenticated
USING (public.has_shop_role(shop_id,ARRAY['owner','cashier']::text[]) OR public.has_shop_permission(shop_id,'debts.manage'));
DROP POLICY IF EXISTS debt_repayments_role_insert ON public.debt_repayments;
CREATE POLICY debt_repayments_role_insert ON public.debt_repayments FOR INSERT TO authenticated
WITH CHECK (public.has_shop_role(shop_id,ARRAY['owner','cashier']::text[]) OR public.has_shop_permission(shop_id,'debts.manage'));

DROP POLICY IF EXISTS expenses_role_select ON public.expenses;
CREATE POLICY expenses_role_select ON public.expenses FOR SELECT TO authenticated
USING (public.has_shop_role(shop_id,ARRAY['owner']::text[]) OR public.has_shop_permission(shop_id,'expenses.manage'));
DROP POLICY IF EXISTS expenses_role_insert ON public.expenses;
CREATE POLICY expenses_role_insert ON public.expenses FOR INSERT TO authenticated
WITH CHECK (public.has_shop_role(shop_id,ARRAY['owner']::text[]) OR public.has_shop_permission(shop_id,'expenses.manage'));
DROP POLICY IF EXISTS expenses_role_update ON public.expenses;
CREATE POLICY expenses_role_update ON public.expenses FOR UPDATE TO authenticated
USING (public.has_shop_role(shop_id,ARRAY['owner']::text[]) OR public.has_shop_permission(shop_id,'expenses.manage'))
WITH CHECK (public.has_shop_role(shop_id,ARRAY['owner']::text[]) OR public.has_shop_permission(shop_id,'expenses.manage'));
DROP POLICY IF EXISTS expenses_role_delete ON public.expenses;
CREATE POLICY expenses_role_delete ON public.expenses FOR DELETE TO authenticated
USING (public.has_shop_role(shop_id,ARRAY['owner']::text[]));

DROP POLICY IF EXISTS products_role_select ON public.products;
CREATE POLICY products_role_select ON public.products FOR SELECT TO authenticated
USING (public.has_shop_role(shop_id,ARRAY['owner','cashier','stockkeeper']::text[]) OR public.has_shop_permission(shop_id,'products.read'));
DROP POLICY IF EXISTS products_management_insert ON public.products;
CREATE POLICY products_management_insert ON public.products FOR INSERT TO authenticated
WITH CHECK (public.has_shop_role(shop_id,ARRAY['owner']::text[]) OR public.has_shop_permission(shop_id,'products.manage'));
DROP POLICY IF EXISTS products_management_update ON public.products;
CREATE POLICY products_management_update ON public.products FOR UPDATE TO authenticated
USING (public.has_shop_role(shop_id,ARRAY['owner']::text[]) OR public.has_shop_permission(shop_id,'products.manage'))
WITH CHECK (public.has_shop_role(shop_id,ARRAY['owner']::text[]) OR public.has_shop_permission(shop_id,'products.manage'));
DROP POLICY IF EXISTS products_management_delete ON public.products;
CREATE POLICY products_management_delete ON public.products FOR DELETE TO authenticated
USING (public.has_shop_role(shop_id,ARRAY['owner']::text[]) OR public.has_shop_permission(shop_id,'products.manage'));

DROP POLICY IF EXISTS stock_movements_role_select ON public.stock_movements;
CREATE POLICY stock_movements_role_select ON public.stock_movements FOR SELECT TO authenticated
USING (public.has_shop_role(shop_id,ARRAY['owner','stockkeeper']::text[]) OR public.has_shop_permission(shop_id,'stock.manage'));
DROP POLICY IF EXISTS stock_movements_role_insert ON public.stock_movements;
CREATE POLICY stock_movements_role_insert ON public.stock_movements FOR INSERT TO authenticated
WITH CHECK (public.has_shop_role(shop_id,ARRAY['owner','stockkeeper']::text[]) OR public.has_shop_permission(shop_id,'stock.manage'));

DROP POLICY IF EXISTS sale_refunds_role_select ON public.sale_refunds;
CREATE POLICY sale_refunds_role_select ON public.sale_refunds FOR SELECT TO authenticated
USING (public.has_shop_role(shop_id,ARRAY['owner']::text[]) OR public.has_shop_permission(shop_id,'refunds.manage'));
DROP POLICY IF EXISTS sale_refund_items_role_select ON public.sale_refund_items;
CREATE POLICY sale_refund_items_role_select ON public.sale_refund_items FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.sale_refunds r WHERE r.id=sale_refund_items.refund_id
 AND (public.has_shop_role(r.shop_id,ARRAY['owner']::text[]) OR public.has_shop_permission(r.shop_id,'refunds.manage'))));

DROP POLICY IF EXISTS shop_members_self_or_management_select ON public.shop_members;
CREATE POLICY shop_members_self_or_owner_select ON public.shop_members FOR SELECT TO authenticated
USING (user_id=(SELECT auth.uid()) OR public.has_shop_role(shop_id,ARRAY['owner']::text[]));

-- Manager role checks inside role-aware RPCs.
CREATE OR REPLACE FUNCTION public.get_shop_products(p_shop_id uuid)
RETURNS TABLE (id uuid,shop_id uuid,name text,sku text,unit text,cost_price numeric,selling_price numeric,stock_quantity numeric,reorder_level numeric,active boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE v_can_manage boolean;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.has_shop_role(p_shop_id,ARRAY['owner','cashier','stockkeeper']::text[])
    OR public.has_shop_permission(p_shop_id,'products.read')
  ) THEN RAISE EXCEPTION 'Not authorized for this business'; END IF;
  v_can_manage := public.has_shop_role(p_shop_id,ARRAY['owner']::text[]) OR public.has_shop_permission(p_shop_id,'costs.view');
  RETURN QUERY SELECT p.id,p.shop_id,p.name,p.sku,p.unit,
    CASE WHEN v_can_manage THEN p.cost_price ELSE NULL::numeric END,
    p.selling_price,p.stock_quantity,p.reorder_level,p.active
  FROM public.products p WHERE p.shop_id=p_shop_id ORDER BY p.name;
END;
$$;
REVOKE ALL ON FUNCTION public.get_shop_products(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_shop_products(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_shop_sales(p_shop_id uuid,p_sale_id uuid DEFAULT NULL)
RETURNS SETOF jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE v_can_view_cost boolean;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.has_shop_role(p_shop_id,ARRAY['owner','cashier']::text[])
    OR public.has_shop_permission(p_shop_id,'sales.view')
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
