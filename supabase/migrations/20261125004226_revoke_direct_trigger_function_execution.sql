-- RECOVERED EXACTLY from Supabase migration ledger.
-- Source project: qejfhjpopsgaeuqygihr
-- Version: 20261125004226
-- Name: revoke_direct_trigger_function_execution
-- This file records an already-applied migration; do not replay on the live project.

revoke all on function public.apply_platform_owner_entitlement() from public, anon, authenticated;
revoke all on function public.create_default_shop_subscription() from public, anon, authenticated;
revoke all on function public.enforce_product_plan_limit() from public, anon, authenticated;
