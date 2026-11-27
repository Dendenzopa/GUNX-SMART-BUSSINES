# PR #45 database privacy and refund migration review

Date: 2026-11-27
Branch: `feat/business-owner-dashboard-design`
Migration: `20261127153000_secure_refunds_and_platform_admin_privacy.sql`

## Scope

This migration is prepared for review only. It has **not** been applied to the connected Production Supabase project. No paid Supabase staging branch was created.

## Refund calculation correction

- Uses `sales.total` as the authoritative net amount and verifies subtotal, discount, and line snapshots reconcile before allowing a refund.
- Allocates net sale cents to all sale lines proportionally using largest remainder, with `sale_items.id` as a deterministic tie-breaker.
- Calculates each partial return cumulatively so the final return of a line reaches exactly its allocated net amount.
- Stops when historical refunds exceed the corrected discounted allocation; it does not silently rewrite historical records or allow additional refunds.
- Retains authentication, owner/`refunds.manage` authorization, advisory idempotency lock, sale and line row locks, duplicate-line and quantity validation, stock restoration, stock movement audit, and final sale status behavior.

## Super Admin privacy correction

- `get_platform_admin_users` no longer returns or searches by email; the dashboard shows no user email or raw user ID.
- `get_platform_businesses` no longer returns `owner_id` or `owner_email`, and its search is limited to business name.
- `get_platform_payment_requests` no longer returns owner email, submitter ID, payer phone, full transaction reference, or free-text admin note.
- The dashboard no longer renders these fields. Platform-level aggregate metrics and verified GUNX subscription revenue remain available.

## Compatibility and rollout risks

- The RPC result contracts change. The PR dashboard types/rendering are updated together with the migration.
- Existing clients outside this branch that expect removed columns must be updated before this migration is applied.
- PostgreSQL function return columns require drop/recreate; the migration does this transactionally and restores authenticated-only EXECUTE grants.
- Historical discounted refunds may be blocked if previous gross refunds exceed the new net allocation. Manual reconciliation is required; no historical refund rows are modified.
- A Production deployment requires a separately approved migration window and post-deploy smoke checks.

## Verification available without paid staging

- Existing TypeScript refund allocation unit tests.
- Static migration security checks for RPC return contracts and refund controls.
- Free GitHub Actions CI typecheck and Expo web export.
- Read-only Production inspection and synthetic arithmetic queries only; no write or DDL queries.

Static checks do not replace a full SQL integration test against a disposable PostgreSQL/Supabase database. Do not mark this migration Production-ready until that test is available and historical refund reconciliation has been reviewed.
