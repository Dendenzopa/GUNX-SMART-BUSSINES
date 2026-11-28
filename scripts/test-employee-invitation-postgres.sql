\\set ON_ERROR_STOP on

-- Disposable PostgreSQL 17 integration test for the exact invitation lifecycle migration.
-- No Supabase Production credentials or endpoints are used by this fixture.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
CREATE TABLE auth.users (
  id uuid PRIMARY KEY,
  phone text UNIQUE,
  phone_confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid LANGUAGE sql STABLE
AS $authuid$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $authuid$;

CREATE TABLE public.shops (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.shop_members (
  shop_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text NOT NULL,
  PRIMARY KEY (shop_id,user_id)
);
CREATE TABLE public.shop_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  phone_e164 text NOT NULL,
  role text NOT NULL CHECK (role IN ('manager','cashier','stockkeeper')),
  invited_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now()+interval '7 days'),
  accepted_at timestamptz,
  accepted_user_id uuid REFERENCES auth.users(id),
  CHECK (phone_e164 ~ '^\\+[1-9][0-9]{7,14}$')
);
CREATE UNIQUE INDEX shop_invitations_one_pending_phone
ON public.shop_invitations(shop_id,phone_e164) WHERE accepted_at IS NULL;

CREATE OR REPLACE FUNCTION public.has_shop_role(p_shop_id uuid, p_roles text[])
RETURNS boolean LANGUAGE sql STABLE
AS $role$
  SELECT EXISTS (
    SELECT 1 FROM public.shop_members sm
    WHERE sm.shop_id=p_shop_id AND sm.user_id=auth.uid() AND sm.role=ANY(p_roles)
  )
$role$;

-- Apply the exact migration as committed in the repository.
\\ir ../supabase/migrations/20261127120000_fix_employee_invitation_reissue.sql

INSERT INTO auth.users(id,phone,phone_confirmed_at) VALUES
('10000000-0000-0000-0000-000000000001','+255700000001',now()),
('10000000-0000-0000-0000-000000000002','+255700000002',now()),
('10000000-0000-0000-0000-000000000003','+255700000003',NULL),
('10000000-0000-0000-0000-000000000004','+255700000004',now());
INSERT INTO public.shops(id,owner_id,name) VALUES
('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Invitation Test Shop'),
('00000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000004','Second Test Shop');
INSERT INTO public.shop_members(shop_id,user_id,role) VALUES
('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','owner'),
('00000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000004','owner');

DO $invitation_lifecycle_test$
DECLARE
  v_old_token uuid;
  v_new_token uuid;
  v_revoked_id uuid;
  v_expired_token uuid;
  v_mismatch_token uuid;
  v_unverified_token uuid;
  v_other_business_token uuid;
  v_accepted jsonb;
  v_rejected boolean;
BEGIN
  -- Owner may issue an invitation, then reissue it for the same phone.
  PERFORM set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',false);
  v_old_token := public.create_shop_invitation(
    '00000000-0000-0000-0000-000000000001','+255700000002','cashier'
  );
  SELECT id INTO v_revoked_id FROM public.shop_invitations WHERE token=v_old_token;
  v_new_token := public.create_shop_invitation(
    '00000000-0000-0000-0000-000000000001','+255700000002','manager'
  );
  IF v_old_token=v_new_token THEN RAISE EXCEPTION 'Reissue reused the old invitation token'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.shop_invitations WHERE token=v_old_token AND revoked_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Reissue did not revoke the previous invitation';
  END IF;

  -- Revoked token cannot be accepted.
  PERFORM set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',false);
  v_rejected := false;
  BEGIN
    PERFORM public.accept_shop_invitation(v_old_token);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'Invitation was revoked%' THEN v_rejected:=true; ELSE RAISE; END IF;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Revoked invitation was accepted'; END IF;

  -- Verified employee accepts the newest link and is assigned the invited role.
  v_accepted := public.accept_shop_invitation(v_new_token);
  IF v_accepted->>'accepted' <> 'true' OR v_accepted->>'role' <> 'manager' THEN
    RAISE EXCEPTION 'Verified employee invitation acceptance returned unexpected payload: %',v_accepted;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.shop_members
    WHERE shop_id='00000000-0000-0000-0000-000000000001'
      AND user_id='10000000-0000-0000-0000-000000000002' AND role='manager'
  ) THEN RAISE EXCEPTION 'Accepted employee membership was not created'; END IF;

  -- A used link cannot be replayed.
  v_rejected:=false;
  BEGIN
    PERFORM public.accept_shop_invitation(v_new_token);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='Invitation has already been used' THEN v_rejected:=true; ELSE RAISE; END IF;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Accepted invitation was replayed'; END IF;

  -- Expired token is rejected.
  PERFORM set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',false);
  v_expired_token:=public.create_shop_invitation(
    '00000000-0000-0000-0000-000000000001','+255700000003','cashier'
  );
  UPDATE public.shop_invitations SET expires_at=now()-interval '1 minute' WHERE token=v_expired_token;
  PERFORM set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',false);
  v_rejected:=false;
  BEGIN
    PERFORM public.accept_shop_invitation(v_expired_token);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'Invitation has expired%' THEN v_rejected:=true; ELSE RAISE; END IF;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Expired invitation was accepted'; END IF;

  -- Unverified phone cannot accept even a valid invitation.
  PERFORM set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',false);
  v_unverified_token:=public.create_shop_invitation(
    '00000000-0000-0000-0000-000000000001','+255700000004','cashier'
  );
  PERFORM set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',false);
  v_rejected:=false;
  BEGIN
    PERFORM public.accept_shop_invitation(v_unverified_token);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'Verify this phone number by SMS%' THEN v_rejected:=true; ELSE RAISE; END IF;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Unverified phone accepted an invitation'; END IF;

  -- A verified but mismatched phone cannot accept another employee's link.
  PERFORM set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',false);
  v_mismatch_token:=public.create_shop_invitation(
    '00000000-0000-0000-0000-000000000001','+255700000003','cashier'
  );
  PERFORM set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000004',false);
  v_rejected:=false;
  BEGIN
    PERFORM public.accept_shop_invitation(v_mismatch_token);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'The signed-in phone number does not match%' THEN v_rejected:=true; ELSE RAISE; END IF;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Phone mismatch accepted'; END IF;

  -- Existing membership in a different business is denied.
  PERFORM set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',false);
  v_other_business_token:=public.create_shop_invitation(
    '00000000-0000-0000-0000-000000000001','+255700000004','cashier'
  );
  PERFORM set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000004',false);
  v_rejected:=false;
  BEGIN
    PERFORM public.accept_shop_invitation(v_other_business_token);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'This account already belongs to another business%' THEN v_rejected:=true; ELSE RAISE; END IF;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Cross-business membership was accepted'; END IF;

  -- Non-owner cannot create or revoke invitations.
  PERFORM set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',false);
  v_rejected:=false;
  BEGIN
    PERFORM public.create_shop_invitation(
      '00000000-0000-0000-0000-000000000001','+255700000005','cashier'
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='Only the business owner can invite employees' THEN v_rejected:=true; ELSE RAISE; END IF;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Non-owner created an invitation'; END IF;

  PERFORM set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',false);
  IF NOT public.revoke_shop_invitation(
    '00000000-0000-0000-0000-000000000001',
    (SELECT id FROM public.shop_invitations WHERE token=v_mismatch_token)
  ) THEN RAISE EXCEPTION 'Owner could not revoke an active invitation'; END IF;
END;
$invitation_lifecycle_test$;

SELECT 'Employee invitation lifecycle integration tests passed.' AS result;
