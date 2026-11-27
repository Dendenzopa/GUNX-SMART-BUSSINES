-- RECOVERED EXACTLY from Supabase migration ledger.
-- Source project: qejfhjpopsgaeuqygihr
-- Version: 20261125213103
-- Name: allow_explicit_manager_cost_visibility
-- This file records an already-applied migration; do not replay on the live project.

DO $$
DECLARE v_def text;
BEGIN
 SELECT pg_get_functiondef('public.set_manager_permissions(uuid,uuid,text[])'::regprocedure) INTO v_def;
 v_def:=replace(v_def,'''reports.view'',''reports.profit'',''sync.manage''','''reports.view'',''reports.profit'',''costs.view'',''sync.manage''');
 EXECUTE v_def;
END $$;
