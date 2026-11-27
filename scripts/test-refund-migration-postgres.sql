\set ON_ERROR_STOP on

-- Disposable PostgreSQL 17 integration fixture for PR #45.
-- This runs only in an isolated GitHub Actions service container.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
CREATE TABLE auth.users (
  id uuid PRIMARY KEY,
  email text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid LANGUAGE sql STABLE
AS $authuid$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $authuid$;

CREATE TABLE public.shops (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  owner_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.shop_members (
  shop_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text NOT NULL,
  PRIMARY KEY (shop_id, user_id, role)
);
CREATE TABLE public.shop_subscriptions (
  shop_id uuid NOT NULL,
  plan_code text,
  status text,
  expires_at timestamptz
);
CREATE TABLE public.pro_payment_requests (
  id uuid PRIMARY KEY,
  shop_id uuid NOT NULL,
  submitted_by uuid,
  provider text NOT NULL,
  amount_tzs integer NOT NULL,
  transaction_reference text NOT NULL,
  payer_phone text,
  status text NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz,
  admin_note text
);
CREATE TABLE public.sales (
  id uuid PRIMARY KEY,
  shop_id uuid NOT NULL,
  receipt_number text NOT NULL,
  customer_id uuid,
  status text NOT NULL,
  subtotal numeric NOT NULL,
  discount numeric NOT NULL,
  total numeric NOT NULL,
  amount_paid numeric NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.products (
  id uuid PRIMARY KEY,
  shop_id uuid NOT NULL,
  name text NOT NULL DEFAULT '',
  sku text,
  unit text NOT NULL DEFAULT 'piece',
  cost_price numeric NOT NULL DEFAULT 0,
  selling_price numeric NOT NULL DEFAULT 0,
  stock_quantity numeric NOT NULL,
  reorder_level numeric NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true
);

-- Minimal Storage schema for testing the exact Storage RLS migration locally.
CREATE SCHEMA storage;
CREATE TABLE storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text NOT NULL,
  name text NOT NULL
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION storage.foldername(p_name text)
RETURNS text[] LANGUAGE sql IMMUTABLE
AS $foldername$
  SELECT CASE
    WHEN cardinality(parts) > 1 THEN parts[1:cardinality(parts)-1]
    ELSE ARRAY[]::text[]
  END
  FROM (SELECT string_to_array(p_name, '/') AS parts) AS source
$foldername$;
CREATE TABLE public.sale_items (
  id uuid PRIMARY KEY,
  sale_id uuid NOT NULL,
  product_id uuid,
  product_name_snapshot text NOT NULL,
  quantity numeric NOT NULL,
  unit_price numeric NOT NULL,
  unit_cost_snapshot numeric NOT NULL,
  line_total numeric NOT NULL
);
CREATE TABLE public.payments (
  id uuid PRIMARY KEY,
  shop_id uuid NOT NULL,
  sale_id uuid NOT NULL,
  method text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.sale_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL,
  sale_id uuid NOT NULL,
  idempotency_key uuid NOT NULL,
  reason text NOT NULL,
  refund_method text NOT NULL,
  refund_total numeric NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shop_id, idempotency_key)
);
CREATE TABLE public.sale_refund_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  refund_id uuid NOT NULL,
  sale_item_id uuid NOT NULL,
  quantity numeric NOT NULL,
  unit_price numeric NOT NULL,
  refund_amount numeric NOT NULL
);
CREATE TABLE public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL,
  product_id uuid NOT NULL,
  movement_type text NOT NULL,
  quantity_change numeric NOT NULL,
  reference_id uuid,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.has_shop_role(p_shop_id uuid, p_roles text[])
RETURNS boolean LANGUAGE sql STABLE
AS $role$
  SELECT EXISTS (
    SELECT 1 FROM public.shop_members sm
    WHERE sm.shop_id = p_shop_id AND sm.user_id = auth.uid() AND sm.role = ANY(p_roles)
  )
$role$;
CREATE OR REPLACE FUNCTION public.has_shop_permission(p_shop_id uuid, p_permission text)
RETURNS boolean LANGUAGE sql STABLE
AS $permission$
  SELECT EXISTS (
    SELECT 1 FROM public.shop_members sm
    WHERE sm.shop_id = p_shop_id AND sm.user_id = auth.uid()
      AND sm.role IN ('owner','manager')
  ) AND coalesce(current_setting('gunx.test.permission', true) = p_permission, false)
$permission$;
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean LANGUAGE sql STABLE
AS $platform_admin$ SELECT current_setting('gunx.test.platform_admin', true) = 'true' $platform_admin$;

-- Apply the exact migration from the PR, not a copied approximation.
\ir ../supabase/migrations/20261127153000_secure_refunds_and_platform_admin_privacy.sql
\ir ../supabase/migrations/20261128110000_scope_cashier_sales_and_manager_refunds.sql
\ir ../supabase/migrations/20261128143000_product_images_and_storage_access.sql

INSERT INTO auth.users(id, email) VALUES
('10000000-0000-0000-0000-000000000001', 'owner@example.test'),
('10000000-0000-0000-0000-000000000002', 'employee@example.test');
INSERT INTO public.shops(id, name, owner_id) VALUES
('00000000-0000-0000-0000-000000000001', 'GUNX Test Shop', '10000000-0000-0000-0000-000000000001');
INSERT INTO public.shop_members(shop_id, user_id, role) VALUES
('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'owner'),
('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'cashier');
INSERT INTO public.shop_subscriptions(shop_id, plan_code, status, expires_at) VALUES
('00000000-0000-0000-0000-000000000001', 'pro', 'active', now() + interval '30 days');
INSERT INTO public.pro_payment_requests(
  id, shop_id, submitted_by, provider, amount_tzs, transaction_reference,
  payer_phone, status, admin_note
) VALUES (
  '60000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'mpesa', 50000, 'PRIVATE-REFERENCE-123', '+255700000001',
  'pending', 'Private internal note'
);

INSERT INTO public.products(
  id, shop_id, name, sku, unit, cost_price, selling_price, stock_quantity, reorder_level, active, image_url
) VALUES
('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Item A', 'SKU-A', 'piece', 5, 12.34, 10, 2, true, 'https://example.test/item-a.jpg'),
('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Item B', 'SKU-B', 'piece', 10, 28.39, 10, 2, true, null),
('20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Item C', 'SKU-C', 'piece', 12, 30.88, 10, 2, true, null);

DO $
DECLARE
  v_product record;
  v_policy_count integer;
  v_result_type text;
BEGIN
  SELECT * INTO v_product
  FROM public.get_shop_products('00000000-0000-0000-0000-000000000001')
  WHERE id = '20000000-0000-0000-0000-000000000001';
  IF v_product.image_url <> 'https://example.test/item-a.jpg' THEN
    RAISE EXCEPTION 'Owner product RPC did not return product image URL';
  END IF;
  IF v_product.cost_price <> 5 THEN
    RAISE EXCEPTION 'Owner product RPC should retain authorized cost visibility';
  END IF;

  PERFORM set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',false);
  SELECT * INTO v_product
  FROM public.get_shop_products('00000000-0000-0000-0000-000000000001')
  WHERE id = '20000000-0000-0000-0000-000000000001';
  IF v_product.image_url <> 'https://example.test/item-a.jpg' THEN
    RAISE EXCEPTION 'Cashier product RPC did not return product image URL';
  END IF;
  IF v_product.cost_price IS NOT NULL THEN
    RAISE EXCEPTION 'Product image RPC exposed protected cost to cashier';
  END IF;
  PERFORM set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',false);

  SELECT count(*) INTO v_policy_count
  FROM pg_policies
  WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname IN (
      'business_assets_product_images_select',
      'business_assets_product_images_insert',
      'business_assets_product_images_update'
    );
  IF v_policy_count <> 3 THEN
    RAISE EXCEPTION 'Expected 3 scoped product image Storage policies, got %', v_policy_count;
  END IF;

  SELECT pg_get_function_result('public.get_shop_products(uuid)'::regprocedure)
  INTO v_result_type;
  IF position('image_url' in lower(v_result_type)) = 0 THEN
    RAISE EXCEPTION 'get_shop_products return type does not include image_url: %', v_result_type;
  END IF;
END;
$;

-- Three lines sum to TZS 100.00; discount TZS 12.35; net total TZS 87.65.
INSERT INTO public.sales(
  id, shop_id, receipt_number, status, subtotal, discount, total, amount_paid, created_by
) VALUES (
  '30000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'TEST-001', 'completed', 100.00, 12.35, 87.65, 87.65, '10000000-0000-0000-0000-000000000001'
);
INSERT INTO public.sale_items(
  id, sale_id, product_id, product_name_snapshot, quantity, unit_price, unit_cost_snapshot, line_total
) VALUES
('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Item A',1,12.34,5,12.34),
('40000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002','Item B',2,28.39,10,56.78),
('40000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000003','Item C',1,30.88,12,30.88);

SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',false);
SELECT set_config('gunx.test.role','owner',false);
SELECT set_config('gunx.test.platform_admin','true',false);

DO $$
DECLARE
  v_result record;
  v_first_refund uuid;
  v_repeat_refund uuid;
  v_total numeric;
  v_count integer;
  v_definition text;
  v_rejected boolean := false;
BEGIN
  -- Platform user directory no longer searches/returns email.
  SELECT count(*) INTO v_count FROM public.get_platform_admin_users('owner@example.test',100,0);
  IF v_count <> 0 THEN RAISE EXCEPTION 'Platform user directory still searches email'; END IF;
  SELECT count(*) INTO v_count FROM public.get_platform_admin_users('10000000-0000-0000-0000-000000000001',100,0);
  IF v_count <> 1 THEN RAISE EXCEPTION 'Platform user ID search failed'; END IF;

  SELECT count(*) INTO v_count FROM public.get_platform_businesses('owner@example.test',100,0);
  IF v_count <> 0 THEN RAISE EXCEPTION 'Business directory still searches owner email'; END IF;
  SELECT count(*) INTO v_count FROM public.get_platform_businesses('GUNX Test Shop',100,0);
  IF v_count <> 1 THEN RAISE EXCEPTION 'Business name search failed'; END IF;

  SELECT pg_get_function_result('public.get_platform_admin_users(text,integer,integer)'::regprocedure)
    INTO v_definition;
  IF position('email' in lower(v_definition)) > 0 THEN
    RAISE EXCEPTION 'Platform user RPC return type leaks email: %', v_definition;
  END IF;
  SELECT pg_get_function_result('public.get_platform_businesses(text,integer,integer)'::regprocedure)
    INTO v_definition;
  IF position('owner_email' in lower(v_definition)) > 0 OR position('owner_id' in lower(v_definition)) > 0 THEN
    RAISE EXCEPTION 'Business RPC return type leaks owner identity: %', v_definition;
  END IF;
  SELECT pg_get_function_result('public.get_platform_payment_requests(text,integer,integer)'::regprocedure)
    INTO v_definition;
  IF position('email' in lower(v_definition)) > 0 OR position('phone' in lower(v_definition)) > 0
     OR position('transaction_reference' in lower(v_definition)) > 0
     OR position('submitted_by' in lower(v_definition)) > 0
     OR position('admin_note' in lower(v_definition)) > 0 THEN
    RAISE EXCEPTION 'Payment RPC return type leaks private fields: %', v_definition;
  END IF;

  -- Largest-remainder allocation: A=10.81, B=49.77, C=27.07.
  -- B is returned in two steps: 24.89 + 24.88.
  SELECT * INTO v_result FROM public.refund_sale(
    '00000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000001',
    '[{"sale_item_id":"40000000-0000-0000-0000-000000000002","quantity":1}]'::jsonb,
    'First partial return','cash'
  );
  IF v_result.refund_total <> 24.89 THEN
    RAISE EXCEPTION 'First discounted partial refund expected 24.89, got %', v_result.refund_total;
  END IF;
  v_first_refund := v_result.refund_id;

  SELECT * INTO v_result FROM public.refund_sale(
    '00000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000001',
    '[{"sale_item_id":"40000000-0000-0000-0000-000000000002","quantity":1}]'::jsonb,
    'First partial return','cash'
  );
  v_repeat_refund := v_result.refund_id;
  IF v_repeat_refund <> v_first_refund OR v_result.refund_total <> 24.89 THEN
    RAISE EXCEPTION 'Idempotent retry did not return original refund';
  END IF;

  -- Reusing the same key with a different quantity must fail closed.
  BEGIN
    SELECT * INTO v_result FROM public.refund_sale(
      '00000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000001',
      '50000000-0000-0000-0000-000000000001',
      '[{"sale_item_id":"40000000-0000-0000-0000-000000000002","quantity":0.5}]'::jsonb,
      'First partial return','cash'
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Idempotency key was already used with different return items or quantities' THEN
      v_rejected := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'Idempotency key accepted a different return payload';
  END IF;

  SELECT * INTO v_result FROM public.refund_sale(
    '00000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000002',
    '[{"sale_item_id":"40000000-0000-0000-0000-000000000002","quantity":1}]'::jsonb,
    'Second partial return','cash'
  );
  IF v_result.refund_total <> 24.88 THEN
    RAISE EXCEPTION 'Second discounted partial refund expected 24.88, got %', v_result.refund_total;
  END IF;

  SELECT * INTO v_result FROM public.refund_sale(
    '00000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000003',
    '[{"sale_item_id":"40000000-0000-0000-0000-000000000001","quantity":1}]'::jsonb,
    'Return item A','cash'
  );
  IF v_result.refund_total <> 10.81 THEN
    RAISE EXCEPTION 'Discounted item A refund expected 10.81, got %', v_result.refund_total;
  END IF;

  SELECT * INTO v_result FROM public.refund_sale(
    '00000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000004',
    '[{"sale_item_id":"40000000-0000-0000-0000-000000000003","quantity":1}]'::jsonb,
    'Return item C','cash'
  );
  IF v_result.refund_total <> 27.07 THEN
    RAISE EXCEPTION 'Discounted item C refund expected 27.07, got %', v_result.refund_total;
  END IF;

  SELECT sum(refund_total) INTO v_total FROM public.sale_refunds
  WHERE sale_id='30000000-0000-0000-0000-000000000001';
  IF v_total <> 87.65 THEN RAISE EXCEPTION 'Total refund expected 87.65, got %', v_total; END IF;
  IF (SELECT status FROM public.sales WHERE id='30000000-0000-0000-0000-000000000001') <> 'refunded' THEN
    RAISE EXCEPTION 'Sale was not marked refunded after all quantities returned';
  END IF;
  IF (SELECT stock_quantity FROM public.products WHERE id='20000000-0000-0000-0000-000000000001') <> 11
     OR (SELECT stock_quantity FROM public.products WHERE id='20000000-0000-0000-0000-000000000002') <> 12
     OR (SELECT stock_quantity FROM public.products WHERE id='20000000-0000-0000-0000-000000000003') <> 11 THEN
    RAISE EXCEPTION 'Returned stock quantities are incorrect';
  END IF;
  SELECT count(*) INTO v_count FROM public.stock_movements WHERE reference_id IN (
    SELECT id FROM public.sale_refunds WHERE sale_id='30000000-0000-0000-0000-000000000001'
  );
  IF v_count <> 4 THEN RAISE EXCEPTION 'Expected 4 stock audit rows, got %', v_count; END IF;

  -- An unauthorized cashier cannot refund.
  INSERT INTO public.sales(id,shop_id,receipt_number,status,subtotal,discount,total,amount_paid,created_by)
  VALUES ('30000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','TEST-002','completed',10,0,10,10,'10000000-0000-0000-0000-000000000002');
  INSERT INTO public.sale_items(id,sale_id,product_name_snapshot,quantity,unit_price,unit_cost_snapshot,line_total)
  VALUES ('40000000-0000-0000-0000-000000000004','30000000-0000-0000-0000-000000000002','Denied',1,10,4,10);
  PERFORM set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',false);
  SELECT count(*) INTO v_count FROM public.get_shop_sales('00000000-0000-0000-0000-000000000001');
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Cashier should read only their own sale; got % rows', v_count;
  END IF;
  BEGIN
    PERFORM * FROM public.refund_sale(
      '00000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000002',
      '50000000-0000-0000-0000-000000000005',
      '[{"sale_item_id":"40000000-0000-0000-0000-000000000004","quantity":1}]'::jsonb,
      'Should be denied','cash'
    );
    RAISE EXCEPTION 'Unauthorized cashier refund unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'Only owner or manager can refund sales' THEN RAISE; END IF;
  END;
  -- A cashier cannot refund another tenant's sale, even when the caller supplies that tenant ID.
  PERFORM set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',false);
  BEGIN
    PERFORM * FROM public.refund_sale(
      '00000000-0000-0000-0000-000000000099',
      '30000000-0000-0000-0000-000000000002',
      '50000000-0000-0000-0000-000000000009',
      '[{"sale_item_id":"40000000-0000-0000-0000-000000000004","quantity":1}]'::jsonb,
      'Cross tenant attempt','cash'
    );
    RAISE EXCEPTION 'Cross-tenant refund unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'Only owner or manager can refund sales' THEN RAISE; END IF;
  END;

  -- A previous gross-price refund above the corrected discounted allocation fails closed.
  INSERT INTO public.sales(id,shop_id,receipt_number,status,subtotal,discount,total,amount_paid)
  VALUES ('30000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','TEST-003','completed',100,50,50,50);
  INSERT INTO public.sale_items(id,sale_id,product_name_snapshot,quantity,unit_price,unit_cost_snapshot,line_total)
  VALUES ('40000000-0000-0000-0000-000000000005','30000000-0000-0000-0000-000000000003','Legacy',2,50,20,100);
  INSERT INTO public.sale_refunds(id,shop_id,sale_id,idempotency_key,reason,refund_method,refund_total)
  VALUES ('70000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000003','50000000-0000-0000-0000-000000000006','Historic','cash',60);
  INSERT INTO public.sale_refund_items(refund_id,sale_item_id,quantity,unit_price,refund_amount)
  VALUES ('70000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000005',1,50,60);
  BEGIN
    PERFORM * FROM public.refund_sale(
      '00000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000003',
      '50000000-0000-0000-0000-000000000007',
      '[{"sale_item_id":"40000000-0000-0000-0000-000000000005","quantity":1}]'::jsonb,
      'Must fail closed','cash'
    );
    RAISE EXCEPTION 'Legacy over-allocation unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF position('Historical refunds exceed corrected discounted allocation' in SQLERRM) = 0 THEN RAISE; END IF;
  END;

  -- A sale whose subtotal, discount and total do not reconcile is rejected.
  INSERT INTO public.sales(id,shop_id,receipt_number,status,subtotal,discount,total,amount_paid)
  VALUES ('30000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000001','TEST-004','completed',100,10,80,80);
  INSERT INTO public.sale_items(id,sale_id,product_name_snapshot,quantity,unit_price,unit_cost_snapshot,line_total)
  VALUES ('40000000-0000-0000-0000-000000000006','30000000-0000-0000-0000-000000000004','Mismatch',1,100,20,100);
  BEGIN
    PERFORM * FROM public.refund_sale(
      '00000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000004',
      '50000000-0000-0000-0000-000000000008',
      '[{"sale_item_id":"40000000-0000-0000-0000-000000000006","quantity":1}]'::jsonb,
      'Must fail totals check','cash'
    );
    RAISE EXCEPTION 'Mismatched sale totals unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF position('Sale totals cannot be reconciled' in SQLERRM) = 0 THEN RAISE; END IF;
  END;
END;
$$;

SELECT 'PostgreSQL refund and platform privacy integration tests passed.' AS result;
