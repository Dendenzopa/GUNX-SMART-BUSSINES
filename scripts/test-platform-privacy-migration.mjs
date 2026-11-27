import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../supabase/migrations/20261127153000_secure_refunds_and_platform_admin_privacy.sql", import.meta.url), "utf8");
const dashboard = readFileSync(new URL("../src/components/PlatformOwnerDashboard.tsx", import.meta.url), "utf8");

function returnColumns(functionName) {
  const start = migration.indexOf(`CREATE FUNCTION public.${functionName}`);
  assert.notEqual(start, -1, `Missing migration function: ${functionName}`);
  const match = migration.slice(start).match(/RETURNS TABLE\(([\s\S]*?)\)\s*LANGUAGE/i);
  assert.ok(match, `Missing RETURNS TABLE for ${functionName}`);
  return match[1].toLowerCase();
}

// Platform user directory avoids email exposure and only searches opaque IDs.
const userColumns = returnColumns("get_platform_admin_users");
assert.ok(!userColumns.includes("email"), "Platform user directory leaks email");
for (const required of ["user_id", "created_at", "shop_count", "roles"]) {
  assert.ok(userColumns.includes(required), `Platform user directory missing ${required}`);
}
assert.ok(!dashboard.includes("{user.email"), "Dashboard renders platform user email");

// Platform directory exposes tenant-level platform metadata, never owner identity.
const businessColumns = returnColumns("get_platform_businesses");
for (const forbidden of ["owner_id", "owner_email", "email"]) {
  assert.ok(!businessColumns.includes(forbidden), `Business directory leaks ${forbidden}`);
}
for (const required of ["shop_id", "business_name", "member_count", "plan_code", "subscription_status"]) {
  assert.ok(businessColumns.includes(required), `Business directory missing ${required}`);
}

// Payment review exposes only the minimum fields needed for subscription operations.
const paymentColumns = returnColumns("get_platform_payment_requests");
for (const forbidden of ["owner_email", "submitted_by", "transaction_reference", "payer_phone", "admin_note"]) {
  assert.ok(!paymentColumns.includes(forbidden), `Payment RPC leaks ${forbidden}`);
}
for (const required of ["request_id", "shop_id", "business_name", "provider", "amount_tzs", "status", "submitted_at"]) {
  assert.ok(paymentColumns.includes(required), `Payment RPC missing ${required}`);
}

for (const forbidden of ["business.owner_email", "payment.owner_email", "payment.transaction_reference", "payment.payer_phone", "payment.admin_note"]) {
  assert.ok(!dashboard.includes(forbidden), `Dashboard renders restricted field: ${forbidden}`);
}

// Refund RPC must retain its authorization, concurrency, idempotency, stock and audit controls.
const refundStart = migration.indexOf("CREATE FUNCTION public.refund_sale");
const businessStart = migration.indexOf("DROP FUNCTION IF EXISTS public.get_platform_businesses");
const refundSql = migration.slice(refundStart, businessStart);
for (const required of [
  "auth.uid() IS NULL",
  "has_shop_role",
  "has_shop_permission",
  "pg_advisory_xact_lock",
  "idempotency_key",
  "FOR UPDATE",
  "sale_refund_items",
  "stock_movements",
  "stock_quantity = stock_quantity +",
  "SECURITY DEFINER",
  "SET search_path = public, pg_temp",
  "remainder DESC, id ASC",
  "Historical refunds exceed corrected discounted allocation",
  "Sale totals cannot be reconciled"
]) {
  assert.ok(refundSql.includes(required), `Refund RPC missing security/accounting control: ${required}`);
}
assert.ok(refundSql.includes("REVOKE ALL ON FUNCTION public.refund_sale"));
assert.ok(refundSql.includes("GRANT EXECUTE ON FUNCTION public.refund_sale(uuid, uuid, uuid, jsonb, text, text) TO authenticated"));
assert.ok(migration.includes("BEGIN;") && migration.trimEnd().endsWith("COMMIT;"));

console.log("Platform privacy and refund migration checks passed.");
