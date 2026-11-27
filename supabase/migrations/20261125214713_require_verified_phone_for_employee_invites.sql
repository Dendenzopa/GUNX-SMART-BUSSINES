-- RECOVERED EXACTLY from Supabase migration ledger.
-- Source project: qejfhjpopsgaeuqygihr
-- Version: 20261125214713
-- Name: require_verified_phone_for_employee_invites
-- This file records an already-applied migration; do not replay on the live project.

CREATE OR REPLACE FUNCTION public.accept_shop_invitation(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE v_inv public.shop_invitations%rowtype;
DECLARE v_phone text;
DECLARE v_phone_confirmed_at timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in with your employee phone number first'; END IF;
  SELECT phone,phone_confirmed_at INTO v_phone,v_phone_confirmed_at FROM auth.users WHERE id=auth.uid();
  IF v_phone IS NULL OR v_phone_confirmed_at IS NULL THEN
    RAISE EXCEPTION 'Verify this phone number by SMS before accepting the invitation';
  END IF;

  SELECT * INTO v_inv FROM public.shop_invitations WHERE token=p_token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invitation link is invalid'; END IF;
  IF v_inv.accepted_at IS NOT NULL THEN RAISE EXCEPTION 'Invitation has already been used'; END IF;
  IF v_inv.expires_at<=now() THEN RAISE EXCEPTION 'Invitation has expired; ask the owner for a new link'; END IF;
  IF v_inv.phone_e164<>v_phone THEN RAISE EXCEPTION 'The signed-in phone number does not match this invitation'; END IF;
  IF EXISTS(SELECT 1 FROM public.shop_members WHERE user_id=auth.uid() AND shop_id<>v_inv.shop_id) THEN
    RAISE EXCEPTION 'This account already belongs to another business';
  END IF;

  INSERT INTO public.shop_members(shop_id,user_id,role)
  VALUES(v_inv.shop_id,auth.uid(),v_inv.role)
  ON CONFLICT(shop_id,user_id) DO NOTHING;
  IF NOT FOUND THEN RAISE EXCEPTION 'This account is already linked to this business'; END IF;

  UPDATE public.shop_invitations SET accepted_at=now(),accepted_user_id=auth.uid() WHERE id=v_inv.id;
  RETURN jsonb_build_object('shop_id',v_inv.shop_id,'role',v_inv.role,'accepted',true);
END;
$$;
REVOKE ALL ON FUNCTION public.accept_shop_invitation(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.accept_shop_invitation(uuid) TO authenticated;
