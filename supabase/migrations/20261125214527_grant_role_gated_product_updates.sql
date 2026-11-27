-- RECOVERED EXACTLY from Supabase migration ledger.
-- Source project: qejfhjpopsgaeuqygihr
-- Version: 20261125214527
-- Name: grant_role_gated_product_updates
-- This file records an already-applied migration; do not replay on the live project.

GRANT UPDATE (name, sku, unit, cost_price, selling_price, reorder_level, active) ON public.products TO authenticated;
