-- RECOVERED EXACTLY from Supabase migration ledger.
-- Source project: qejfhjpopsgaeuqygihr
-- Version: 20261125211016
-- Name: restrict_anonymous_installation_registration
-- This file records an already-applied migration; do not replay on the live project.

REVOKE EXECUTE ON FUNCTION public.register_app_installation(uuid, text, text) FROM anon;
