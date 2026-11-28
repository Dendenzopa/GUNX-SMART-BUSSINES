-- Trigger-only functions should not be callable as direct PostgREST RPC endpoints.
-- Their attached triggers continue to execute normally.
revoke all on function public.apply_platform_owner_entitlement() from public, anon, authenticated;
revoke all on function public.create_default_shop_subscription() from public, anon, authenticated;
revoke all on function public.enforce_product_plan_limit() from public, anon, authenticated;