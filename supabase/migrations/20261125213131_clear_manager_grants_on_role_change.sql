-- RECOVERED EXACTLY from Supabase migration ledger.
-- Source project: qejfhjpopsgaeuqygihr
-- Version: 20261125213131
-- Name: clear_manager_grants_on_role_change
-- This file records an already-applied migration; do not replay on the live project.

DO $$
DECLARE v_def text;
BEGIN
 SELECT pg_get_functiondef('public.update_shop_member_role(uuid,uuid,text)'::regprocedure) INTO v_def;
 v_def:=replace(v_def,
   'if not found then raise exception ''Staff member not found or cannot be changed''; end if;',
   'if not found then raise exception ''Staff member not found or cannot be changed''; end if;
    delete from public.shop_member_permissions where shop_id=p_shop_id and user_id=p_user_id;');
 EXECUTE v_def;
END $$;
