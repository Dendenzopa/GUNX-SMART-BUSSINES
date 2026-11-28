# GUNX SMART BUSINESS — Production Migration Runbook

**Scope:** pending migrations, in this exact order:

1. `20261127120000_fix_employee_invitation_reissue.sql`
2. `20261127153000_secure_refunds_and_platform_admin_privacy.sql`
3. `20261128110000_scope_cashier_sales_and_manager_refunds.sql`
4. `20261128143000_product_images_and_storage_access.sql`

**Safety rule:** this runbook is a plan only. Do not apply any migration to Supabase Production until the business owner gives separate, explicit approval for the Production migration window. CI and this document do not constitute that approval.

## 1. Release gates

Do not start the Production change until all of the following are true:

- The full four-migration disposable PostgreSQL 17 integration workflow is green on the exact commit intended for release.
- The separate invitation lifecycle tests are green.
- Refund allocation, retry/idempotency, quantity mismatch, stock restoration, cashier isolation, manager permission, and cross-tenant denial tests are green.
- Storage SELECT/INSERT/UPDATE tests are green for owner/authorized manager and denied for cashier without `products.manage` and for cross-tenant paths.
- The live `business-assets` bucket is confirmed to exist. Confirm whether it is public; public URL display depends on the bucket's public setting. The migration does not create or change bucket configuration.
- A fresh Production backup/restore point exists and its restore procedure is understood.
- Current schema/migration history, policies, grants, function definitions, bucket settings, and row counts are captured for comparison.
- A maintenance window and an operator who can stop the release are available.
- The Production application release can be held until the database verification is complete.

## 2. Preflight snapshot

Capture, timestamp, and retain securely:

- Supabase project reference and applied migration versions.
- `shop_invitations` counts grouped by accepted/expired/revoked state; duplicate active `(shop_id, phone_e164)` candidates.
- `sales`, `sale_items`, `sale_refunds`, `sale_refund_items`, and `stock_movements` counts.
- Existing definitions and grants for `create_shop_invitation`, `accept_shop_invitation`, `revoke_shop_invitation`, `refund_sale`, `get_platform_admin_users`, `get_platform_businesses`, `get_platform_payment_requests`, `get_shop_sales`, and `get_shop_products`.
- All policies on `sales`, `sale_items`, `payments`, `sale_refunds`, `sale_refund_items`, `products`, and `storage.objects`.
- Column-level and table-level grants on `products`.
- Storage bucket metadata and existing object policy inventory.

Do not export private customer or transaction content into ordinary logs. Store backups and schema snapshots with restricted access.

## 3. Ordered application and verification

Apply one migration at a time. After each migration, run its verification queries/tests and stop on any unexpected result.

### Migration 1 — Invitation lifecycle

- Verify `revoked_at` exists and the partial unique index covers only unaccepted, unrevoked invitations.
- Confirm expired pending invitations have been marked revoked.
- Verify the three RPC signatures and authenticated-only EXECUTE grants.
- In a controlled test account, verify owner invitation, reissue, old-token rejection, revoke, expiry rejection, verified-phone requirement, phone match, one-business membership, and non-owner denial.
- Do not expose invitation tokens or phone numbers in logs.

### Migration 2 — Refund accounting and platform privacy

- Confirm the refund RPC's exact signature and authenticated EXECUTE grant.
- Confirm platform user RPC does not return email; business RPC does not return owner ID/email; payment RPC does not return payer phone, submitter identity, transaction reference, or free-text admin notes.
- Validate refund math and historical reconciliation before enabling the UI.
- Existing historical refund totals that exceed the corrected discounted allocation intentionally fail closed and require manual reconciliation. Do not automatically rewrite refund history, sale totals, or stock.
- Confirm aggregate platform reporting and subscription operations remain available without routine access to tenant sales, profits, customers, or transaction records.

### Migration 3 — Cashier and manager access

- Inventory every permissive policy on affected tables; PostgreSQL permissive policies are OR-combined.
- Confirm cashier SELECT is restricted to sales they created, including associated items and payments.
- Confirm managers can read sales/reports only with the corresponding permission.
- Confirm refunds are visible only to owner/authorized manager and refund RPC denies anyone without `refunds.manage`.
- Confirm profit/cost snapshots remain hidden unless the caller has the explicit cost/profit permission.

### Migration 4 — Product images and Storage

- Confirm `products.image_url` exists and only the intended column-level update grant is added.
- Confirm `get_shop_products(uuid)` returns `image_url` while preserving cost visibility rules.
- Confirm the bucket `business-assets` exists and inspect its public/private setting before rollout.
- Test upload, select, replacement/upsert and cross-tenant denial with real authenticated test identities.
- Confirm object paths follow `<shop_uuid>/<auth_user_uuid>/products/<filename>`.
- Public URL reads are served by a public bucket configuration; the authenticated Storage SELECT policy is not a substitute for confirming that bucket setting.
- Do not enable a broader bucket policy or service-role upload path as a workaround.

## 4. Stop conditions

Stop immediately and do not continue to the next migration if:

- A migration errors or its transaction outcome is uncertain.
- Any RPC exposes private tenant identifiers or private payment details beyond its approved contract.
- A cashier can read another employee's sale/payment or can refund.
- A cross-tenant invitation, refund, product image upload, or object update succeeds.
- A manager can refund without `refunds.manage`.
- Product cost/profit data is exposed without explicit permission.
- The Storage bucket/path structure differs from the migration's assumptions.
- Any post-migration row count, stock balance, refund total, or grant differs unexpectedly.

Keep the app release paused until the issue is understood and corrected.

## 5. Rollback and forward-recovery

Prefer forward recovery over destructive down migrations. These migrations alter security contracts and can create legitimate records after release.

### Before application

- If preflight fails, do nothing to Production.
- If backup/restore verification fails, do not start.

### Migration 1 failure

The invitation migration is not wrapped in an explicit transaction block. If execution is interrupted, inspect each completed DDL/function/grant operation before retrying. Do not assume the migration was atomic. Reconcile `revoked_at`, the old/new partial indexes, and all three function definitions against the migration file. Restore the preflight schema snapshot only if no new legitimate invitations or memberships have been created and the owner approves a restore.

### Migration 2 or 3 failure

These migrations are wrapped in transactions. If PostgreSQL reports a failed transaction and rollback, verify the prior function/policy definitions and migration ledger before retrying. Do not manually mark a migration as applied. If it committed but behavior is wrong, create a reviewed forward-fix migration that restores the intended function/policy contract.

### Migration 4 failure

The migration is wrapped in a transaction. If it rolls back, verify that `image_url`, grants, RPC and Storage policies returned to the pre-migration state. If it committed but upload/read behavior is wrong, use a narrowly scoped forward-fix to Storage policies or bucket configuration. Preserve uploaded objects and image URLs.

### Data recovery rules

- Never delete `sale_refunds`, `sale_refund_items`, or stock movement audit rows as rollback.
- Never silently reverse returned stock or rewrite a completed sale to conceal a migration issue.
- Never un-revoke invitations or reactivate old tokens without explicit owner intent.
- Never restore broad cashier access or unrestricted cross-tenant access to recover a UI issue.
- If data corruption is suspected, stop writes, preserve logs/snapshots, reconcile sales/refunds/stock, and restore only under an approved recovery plan.

## 6. Post-release verification

- Compare migration history to the four expected versions in order.
- Re-run the privacy, RLS, refund, invitation, and Storage checks against Production using controlled test identities and safe test records.
- Verify tenant data boundaries, platform aggregate metrics, and subscription billing visibility.
- Confirm no unauthorized cross-tenant read/write is possible.
- Monitor database logs and app errors through the agreed observation window.
- Record operator, approval, timestamps, migration versions, verification results, and any recovery action in the release audit record.

**Current known Production state at the time this runbook was prepared:** these four migrations are pending. The Production sales/refund tables were previously observed empty, so synthetic CI refund scenarios do not establish historical Production refund compatibility. Re-check the live state during preflight; do not rely on this historical snapshot.
