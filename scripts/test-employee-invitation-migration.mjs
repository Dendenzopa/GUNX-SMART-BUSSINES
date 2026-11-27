import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  "supabase/migrations/20261127120000_fix_employee_invitation_reissue.sql",
  "utf8"
);

function requirePattern(pattern, description) {
  assert.match(migration, pattern, `Missing invitation migration safeguard: ${description}`);
}

requirePattern(/ADD COLUMN IF NOT EXISTS revoked_at timestamptz/i, "revocation timestamp");
requirePattern(/DROP INDEX IF EXISTS public\.shop_invitations_one_pending_phone/i, "remove stale pending-only index");
requirePattern(/WHERE accepted_at IS NULL AND revoked_at IS NULL/i, "unique index only covers active invitations");
requirePattern(/has_shop_role\(p_shop_id, ARRAY\['owner'\]::text\[\]\)/i, "owner-only invitation creation and revocation");
requirePattern(/p_phone_e164 !~ '\\\\?\+\[1-9\]\[0-9\]\{7,14\}\$'/, "E.164 phone validation");
requirePattern(/p_role NOT IN \('manager', 'cashier', 'stockkeeper'\)/i, "employee role allowlist");
requirePattern(/phone_confirmed_at IS NULL/i, "SMS-verified phone required");
requirePattern(/FOR UPDATE;/i, "row locking for invitation acceptance");
requirePattern(/v_inv\.revoked_at IS NOT NULL/i, "revoked token rejection");
requirePattern(/v_inv\.expires_at <= now\(\)/i, "expired token rejection");
requirePattern(/v_inv\.phone_e164 <> v_phone/i, "invited phone identity binding");
requirePattern(/ON CONFLICT\(shop_id, user_id\) DO NOTHING/i, "duplicate membership protection");
requirePattern(/SET revoked_at = now\(\)/i, "reissue supersedes prior invitation");
requirePattern(/REVOKE ALL ON FUNCTION public\.create_shop_invitation\(uuid, text, text\) FROM PUBLIC, anon/i, "no public/anonymous create execution");
requirePattern(/GRANT EXECUTE ON FUNCTION public\.create_shop_invitation\(uuid, text, text\) TO authenticated/i, "authenticated create execution");
requirePattern(/REVOKE ALL ON FUNCTION public\.accept_shop_invitation\(uuid\) FROM PUBLIC, anon/i, "no public/anonymous accept execution");
requirePattern(/GRANT EXECUTE ON FUNCTION public\.accept_shop_invitation\(uuid\) TO authenticated/i, "authenticated accept execution");
requirePattern(/REVOKE ALL ON FUNCTION public\.revoke_shop_invitation\(uuid, uuid\) FROM PUBLIC, anon/i, "no public/anonymous revoke execution");
requirePattern(/GRANT EXECUTE ON FUNCTION public\.revoke_shop_invitation\(uuid, uuid\) TO authenticated/i, "authenticated revoke execution");

console.log("Employee invitation migration static security checks passed.");
