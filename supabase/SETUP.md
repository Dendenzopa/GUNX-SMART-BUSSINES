# GUNX SMART BUSINESS — Supabase setup

## Deployment order

1. Create a Supabase project.
2. In Supabase SQL Editor, run these migrations in order:
   - `supabase/migrations/0001_initial_schema.sql`
   - `supabase/migrations/0002_membership_rls.sql`
   - `supabase/migrations/0003_protect_financial_ledgers.sql`
   - `supabase/migrations/0004_role_permissions.sql`
   - `supabase/migrations/0005_atomic_checkout.sql`
   - `supabase/migrations/0006_debt_ledger.sql`
   - `supabase/migrations/0007_stock_receiving.sql`
   - `supabase/migrations/0008_sale_returns_refunds.sql`
   - `supabase/migrations/0009_offline_price_guard.sql`
   - `supabase/migrations/0010_staff_membership_admin.sql`
   - `supabase/migrations/0011_shop_subscriptions.sql`
   - `supabase/migrations/0012_enforce_free_plan_limits.sql`
   - `supabase/migrations/0013_pro_payment_verification.sql`
   - `supabase/migrations/0014_pro_payment_submission_hardening.sql`
   - `supabase/migrations/0015_restrict_direct_ledger_writes.sql`
   - `supabase/migrations/0016_require_audited_opening_stock.sql`
3. Copy `.env.example` to `.env.local` and set the Supabase project URL and anon/publishable key.
4. Deploy the staff invitation Edge Function: `supabase functions deploy invite-staff` (keep JWT verification enabled).
5. Deploy the trusted Pro activation Edge Function: `supabase functions deploy activate-pro --no-verify-jwt`. This endpoint uses its own `x-gunx-admin-token` check; generate a long random secret and set it with `supabase secrets set GUNX_PRO_ADMIN_TOKEN=...`.
6. Ensure Edge Function secrets include `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Never put either the service-role key or `GUNX_PRO_ADMIN_TOKEN` in the mobile app, website bundle or repository.
7. Ensure the staff invitation Edge Function environment has the platform-provided `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`.
8. Install dependencies with `npm install`, then run `npx expo start`.

## Security

- Apply migrations `0015_restrict_direct_ledger_writes.sql` and `0016_require_audited_opening_stock.sql` after `0014`. Authenticated clients can no longer insert sales, sale items, payments, stock movements, debts, debt repayments or refunds directly; use the atomic RPC workflows. Direct stock-quantity edits and non-zero opening stock on direct product inserts are blocked; opening stock must be recorded through `receive_stock`. Product cost/selling-price edits are restricted to owners/managers, and stockkeepers cannot change prices.

- Only use the Supabase anon/publishable key in the app.
- Never embed or commit the Supabase `service_role` key.
- Configure email confirmation and password reset before production.
- Apply all RLS and role-aware migrations before entering real business data.
- Test tenant isolation, role permissions, concurrent checkouts, retries and rollback behavior in a staging project.

## Implemented database workflows

- `create_shop`: creates a shop and owner membership atomically.
- `checkout_sale`: reads product prices from the database, locks stock rows, records sale items/payments and reduces stock in one transaction. Retries with the same idempotency key return the original sale.
- `create_manual_debt` / `record_debt_payment`: create customer debt and append repayments while preventing overpayment.
- `receive_stock`: checks owner/manager/stockkeeper role, updates product stock and appends a stock movement.
- `refund_sale`: checks owner/manager role, validates quantities and the paid sale, records refund lines, restores stock and appends return stock movements in one transaction. Retries with the same idempotency key return the existing refund.
- `add_shop_member`, `update_shop_member_role`, `remove_shop_member`: owner-only membership administration; the owner cannot be removed or demoted through these functions.
- `shop_subscriptions` and `get_shop_subscription`: create a Free subscription for each shop, expose Free/Pro status to shop members, and resolve expired Pro plans to Free without deleting business data. Paid plan changes are intentionally server-controlled; the app cannot activate Pro from a client-side payment claim.
- `pro_payment_requests` and `submit_pro_payment`: let a shop owner submit a TZS 5,000 payment reference. Submission is only a pending claim and does not activate Pro.
- `admin_activate_pro` plus the `activate-pro` Edge Function: activate/extend Pro for 30 days only after a trusted operator has independently checked the incoming payment. The function requires the private `GUNX_PRO_ADMIN_TOKEN` secret and uses the service-role key server-side. This is manual verification, not a live M-Pesa/HaloPesa provider API integration.
- `0012_enforce_free_plan_limits.sql`: enforce the Free plan's 50-product, 100-monthly-sale and 10-outstanding-debtor limits in PostgreSQL. Product creation and POS checkout are checked server-side; offline sales are checked when they sync. Existing data is retained if Pro expires.
- `invite-staff` Edge Function: validates the signed-in caller and owner membership server-side, sends an email invitation with Supabase Auth Admin, then adds the invited account to the selected shop. Deploy this function before using email invitations.

## App integration status

When Supabase environment variables are configured and a signed-in user has a shop membership, the app is coded to:
- Load the shop's active product catalogue, sales, expenses, debt ledger and refund totals.
- Submit cash POS checkouts through `checkout_sale`.
- Save expenses, create manual debts and record cash debt repayments.
- Receive stock through `receive_stock`.
- Process full-receipt cash refunds for fully paid sales through `refund_sale`.
- Exclude fully refunded sales from sales and estimated gross-profit totals, and show refund totals separately.

## Android test build

A manual GitHub Actions workflow is available at **Actions → GUNX Android test APK → Run workflow**. It generates the Expo Android native project, builds a signed-by-debug-keystore installable debug APK, and uploads it as the artifact `gunx-smart-business-android-debug` for 14 days. This APK is for device testing only, not Google Play release.

For managed EAS builds, `eas.json` includes:
- `preview`: internal Android APK distribution.
- `production`: Android App Bundle (AAB) profile for a release build.

An EAS build still requires an Expo account/project setup and the appropriate build credentials. No release signing credentials are stored in this repository.

## Current limitations — not production certification

- Returns UI currently refunds the entire receipt; partial-line returns are supported by the database design but not yet exposed in the UI.
- Refund UI currently pays cash only. Database RPC supports cash, mobile money and bank refund methods.
- POS UI currently offers cash checkout only.
- Offline cash checkout now has a device-local AsyncStorage outbox, cached product catalogue, and automatic retry when connectivity returns. A prior online catalogue download is required; cached stock is checked locally before queueing. Pending sales are clearly marked and excluded from confirmed sales/profit totals until the server accepts them; after sync, the app replaces the provisional receipt with server-confirmed sale details. The app also keeps a shop-scoped last-synced snapshot of sales, expenses, debts and refund totals for read-only offline viewing. The offline sync sends the locally displayed total as an expected-total guard; the database rejects the sale if current server prices differ, leaving it pending for owner review rather than silently charging a different amount. Offline expense creation, debt creation/repayment, stock-in and refunds are deliberately blocked while connected mode is configured, rather than being shown as saved without a durable idempotent queue. This remains an initial offline workflow: no multi-device stock reservation, conflict-resolution protocol, background sync guarantee or encrypted local business-data database is implemented. Cached records may be stale and are stored in device AsyncStorage; protect access to the device.
- PDF and Excel-compatible CSV report exports are implemented. Staff management UI supports email invitations, role changes and removal, but email invitations require the `invite-staff` Edge Function to be deployed and the database migration `0010` to be applied. Invitations are not live until that setup is complete.
- Free/Pro subscription status foundation, plan screen and server-side quota enforcement are implemented in migrations `0011` and `0012`; payment-reference submission and trusted manual activation are added in `0013`. Product creation is limited to 50 on Free; checkout is limited to 100 sales per calendar month and 10 customers with outstanding debt. Quotas apply when offline sales sync. These database changes are not active until the migrations are applied to the Supabase project. Automatic mobile-money provider callbacks are not implemented. An operator must verify each payment against the provider/bank record, then call the protected `activate-pro` Edge Function. The payment reference alone never activates Pro; never expose the service-role key or admin token to the app.
- No live Supabase project has been connected or tested by this repository workflow. Migrations must be applied and tested in your own staging project.
- Passing TypeScript CI does not prove database policies or payment flows are production-ready.
