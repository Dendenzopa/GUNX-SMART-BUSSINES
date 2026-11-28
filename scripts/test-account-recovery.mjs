import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/20261128160000_add_account_security_events.sql", "utf8");
const fn = readFileSync("supabase/functions/revoke-all-sessions/index.ts", "utf8");
const docs = readFileSync("docs/security/account-device-recovery.md", "utf8");

assert.match(migration, /enable row level security/i);
assert.match(migration, /user_id = \(select auth\.uid\(\)\)/i);
assert.match(migration, /revoke insert, update, delete on public\.account_security_events from authenticated/i);
assert.match(fn, /auth\.admin\.signOut\(token, "global"\)/);
assert.match(fn, /auth\.getUser\(token\)/);
assert.match(fn, /SUPABASE_SERVICE_ROLE_KEY/);
assert.doesNotMatch(fn, /console\.(log|error)\([^)]*token/i);
assert.match(docs, /global session revocation/i);
console.log("Account recovery static safety checks passed.");
