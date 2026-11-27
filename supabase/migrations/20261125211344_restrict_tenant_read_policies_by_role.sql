-- RECOVERED EXACTLY from Supabase migration ledger.
-- Source project: qejfhjpopsgaeuqygihr
-- Version: 20261125211344
-- Name: restrict_tenant_read_policies_by_role
-- This file records an already-applied migration; do not replay on the live project.

-- Replace tenant-wide SELECT access with explicit role allowlists.
DROP POLICY IF EXISTS customers_member_select ON public.customers;
CREATE POLICY customers_role_select ON public.customers
  FOR SELECT TO authenticated
  USING (public.has_shop_role(shop_id, ARRAY['owner','manager','cashier']));

DROP POLICY IF EXISTS debt_payments_member_select ON public.debt_payments;
CREATE POLICY debt_payments_role_select ON public.debt_payments
  FOR SELECT TO authenticated
  USING (public.has_shop_role(shop_id, ARRAY['owner','manager','cashier']));

DROP POLICY IF EXISTS debt_repayments_member_select ON public.debt_repayments;
CREATE POLICY debt_repayments_role_select ON public.debt_repayments
  FOR SELECT TO authenticated
  USING (public.has_shop_role(shop_id, ARRAY['owner','manager','cashier']));

DROP POLICY IF EXISTS debts_member_select ON public.debts;
CREATE POLICY debts_role_select ON public.debts
  FOR SELECT TO authenticated
  USING (public.has_shop_role(shop_id, ARRAY['owner','manager','cashier']));

DROP POLICY IF EXISTS expenses_member_select ON public.expenses;
CREATE POLICY expenses_role_select ON public.expenses
  FOR SELECT TO authenticated
  USING (public.has_shop_role(shop_id, ARRAY['owner','manager']));

DROP POLICY IF EXISTS payments_member_select ON public.payments;
CREATE POLICY payments_role_select ON public.payments
  FOR SELECT TO authenticated
  USING (public.has_shop_role(shop_id, ARRAY['owner','manager','cashier']));

DROP POLICY IF EXISTS products_member_select ON public.products;
CREATE POLICY products_role_select ON public.products
  FOR SELECT TO authenticated
  USING (public.has_shop_role(shop_id, ARRAY['owner','manager','cashier','stockkeeper']));

DROP POLICY IF EXISTS sale_items_member_select ON public.sale_items;
CREATE POLICY sale_items_role_select ON public.sale_items
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sales s
    WHERE s.id = sale_items.sale_id
      AND public.has_shop_role(s.shop_id, ARRAY['owner','manager','cashier'])
  ));

DROP POLICY IF EXISTS sale_refunds_member_select ON public.sale_refunds;
CREATE POLICY sale_refunds_role_select ON public.sale_refunds
  FOR SELECT TO authenticated
  USING (public.has_shop_role(shop_id, ARRAY['owner','manager']));

DROP POLICY IF EXISTS sale_refund_items_member_select ON public.sale_refund_items;
CREATE POLICY sale_refund_items_role_select ON public.sale_refund_items
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sale_refunds r
    WHERE r.id = sale_refund_items.refund_id
      AND public.has_shop_role(r.shop_id, ARRAY['owner','manager'])
  ));

DROP POLICY IF EXISTS sales_member_select ON public.sales;
CREATE POLICY sales_role_select ON public.sales
  FOR SELECT TO authenticated
  USING (public.has_shop_role(shop_id, ARRAY['owner','manager','cashier']));

DROP POLICY IF EXISTS stock_movements_member_select ON public.stock_movements;
CREATE POLICY stock_movements_role_select ON public.stock_movements
  FOR SELECT TO authenticated
  USING (public.has_shop_role(shop_id, ARRAY['owner','manager','stockkeeper']));
