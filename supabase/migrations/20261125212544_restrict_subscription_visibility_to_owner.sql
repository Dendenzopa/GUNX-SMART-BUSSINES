-- RECOVERED EXACTLY from Supabase migration ledger.
-- Source project: qejfhjpopsgaeuqygihr
-- Version: 20261125212544
-- Name: restrict_subscription_visibility_to_owner
-- This file records an already-applied migration; do not replay on the live project.

DROP POLICY IF EXISTS shop_subscriptions_member_read ON public.shop_subscriptions;
CREATE POLICY shop_subscriptions_owner_read
ON public.shop_subscriptions
FOR SELECT TO authenticated
USING (public.has_shop_role(shop_id, ARRAY['owner']::text[]));
