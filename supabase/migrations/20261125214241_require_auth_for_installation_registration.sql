-- RECOVERED EXACTLY from Supabase migration ledger.
-- Source project: qejfhjpopsgaeuqygihr
-- Version: 20261125214241
-- Name: require_auth_for_installation_registration
-- This file records an already-applied migration; do not replay on the live project.

DO $$
DECLARE v_def text;
BEGIN
 SELECT pg_get_functiondef('public.register_app_installation(uuid,text,text)'::regprocedure) INTO v_def;
 v_def:=replace(v_def,
   'if p_installation_id is null then',
   'if auth.uid() is null then raise exception ''Authentication required''; end if;
    if p_installation_id is null then');
 EXECUTE v_def;
END $$;
