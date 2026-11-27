-- Fix employee invitation lifecycle without changing live data until this migration
-- is reviewed and applied in a dedicated test environment.
-- A revoked/expired invitation must not block a replacement invitation.

ALTER TABLE public.shop_invitations
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz;

UPDATE public.shop_invitations
SET revoked_at = expires_at
WHERE accepted_at IS NULL
  AND revoked_at IS NULL
  AND expires_at <= now();

DROP INDEX IF EXISTS public.shop_invitations_one_pending_phone;
CREATE UNIQUE INDEX shop_invitations_one_active_phone
ON public.shop_invitations(shop_id, phone_e164)
WHERE accepted_at IS NULL AND revoked_at IS NULL;

CREATE OR REPLACE FUNCTION public.create_shop_invitation(
  p_shop_id uuid,
  p_phone_e164 text,
  p_role text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_token uuid;
  v_existing_user uuid;
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.has_shop_role(p_shop_id, ARRAY['owner']::text[]) THEN
    RAISE EXCEPTION 'Only the business owner can invite employees';
  END IF;

  IF p_phone_e164 IS NULL
     OR p_phone_e164 !~ '^\+[1-9][0-9]{7,14}$' THEN
    RAISE EXCEPTION 'Phone number must use international format, for example +2557XXXXXXXX';
  END IF;

  IF p_role IS NULL OR p_role NOT IN ('manager', 'cashier', 'stockkeeper') THEN
    RAISE EXCEPTION 'Unsupported employee role';
  END IF;

  SELECT id INTO v_existing_user
  FROM auth.users
  WHERE phone = p_phone_e164
  LIMIT 1;

  IF v_existing_user IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.shop_members
      WHERE shop_id = p_shop_id AND user_id = v_existing_user
    ) THEN
      RAISE EXCEPTION 'This phone number is already a member of this business';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.shop_members
      WHERE user_id = v_existing_user
    ) THEN
      RAISE EXCEPTION 'This account already belongs to another business';
    END IF;
  END IF;

  -- Supersede any previous unused invitation for this phone.
  UPDATE public.shop_invitations
  SET revoked_at = now()
  WHERE shop_id = p_shop_id
    AND phone_e164 = p_phone_e164
    AND accepted_at IS NULL
    AND revoked_at IS NULL;

  INSERT INTO public.shop_invitations(shop_id, phone_e164, role, invited_by)
  VALUES (p_shop_id, p_phone_e164, p_role, auth.uid())
  RETURNING token INTO v_token;

  RETURN v_token;
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_shop_invitation(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_inv public.shop_invitations%rowtype;
  v_phone text;
  v_phone_confirmed_at timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in with your employee phone number first';
  END IF;

  -- Serialize invitation acceptance for this account to enforce one-business membership.
  SELECT phone, phone_confirmed_at INTO v_phone, v_phone_confirmed_at
  FROM auth.users
  WHERE id = auth.uid()
  FOR UPDATE;

  IF v_phone IS NULL OR v_phone_confirmed_at IS NULL THEN
    RAISE EXCEPTION 'Verify this phone number by SMS before accepting the invitation';
  END IF;

  SELECT * INTO v_inv
  FROM public.shop_invitations
  WHERE token = p_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation link is invalid';
  END IF;
  IF v_inv.accepted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Invitation has already been used';
  END IF;
  IF v_inv.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'Invitation was revoked; ask the owner for a new link';
  END IF;
  IF v_inv.expires_at <= now() THEN
    RAISE EXCEPTION 'Invitation has expired; ask the owner for a new link';
  END IF;
  IF v_inv.phone_e164 <> v_phone THEN
    RAISE EXCEPTION 'The signed-in phone number does not match this invitation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.shop_members
    WHERE user_id = auth.uid() AND shop_id <> v_inv.shop_id
  ) THEN
    RAISE EXCEPTION 'This account already belongs to another business';
  END IF;

  INSERT INTO public.shop_members(shop_id, user_id, role)
  VALUES (v_inv.shop_id, auth.uid(), v_inv.role)
  ON CONFLICT(shop_id, user_id) DO NOTHING;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'This account is already linked to this business';
  END IF;

  UPDATE public.shop_invitations
  SET accepted_at = now(), accepted_user_id = auth.uid()
  WHERE id = v_inv.id;

  RETURN jsonb_build_object(
    'shop_id', v_inv.shop_id,
    'role', v_inv.role,
    'accepted', true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_shop_invitation(
  p_shop_id uuid,
  p_invitation_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.has_shop_role(p_shop_id, ARRAY['owner']::text[]) THEN
    RAISE EXCEPTION 'Only the business owner can revoke invitations';
  END IF;

  UPDATE public.shop_invitations
  SET revoked_at = now()
  WHERE id = p_invitation_id
    AND shop_id = p_shop_id
    AND accepted_at IS NULL
    AND revoked_at IS NULL;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.create_shop_invitation(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_shop_invitation(uuid, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.accept_shop_invitation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_shop_invitation(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.revoke_shop_invitation(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_shop_invitation(uuid, uuid) TO authenticated;
