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
3. Copy `.env.example` to `.env.local` and set the Supabase project URL and anon/publishable key.
4. Install dependencies with `npm install`, then run `npx expo start`.

## Security

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

## App integration status

When Supabase environment variables are configured and a signed-in user has a shop membership, the app is coded to:
- Load the shop's active product catalogue, sales, expenses, debt ledger and refund totals.
- Submit cash POS checkouts through `checkout_sale`.
- Save expenses, create manual debts and record cash debt repayments.
- Receive stock through `receive_stock`.
- Process full-receipt cash refunds for fully paid sales through `refund_sale`.
- Exclude fully refunded sales from sales and estimated gross-profit totals, and show refund totals separately.

## Current limitations — not production certification

- Returns UI currently refunds the entire receipt; partial-line returns are supported by the database design but not yet exposed in the UI.
- Refund UI currently pays cash only. Database RPC supports cash, mobile money and bank refund methods.
- POS UI currently offers cash checkout only.
- Offline cash checkout now has a device-local AsyncStorage outbox, cached product catalogue, and automatic retry when connectivity returns. A prior online catalogue download is required; cached stock is checked locally before queueing. Pending sales are clearly marked and excluded from confirmed sales/profit totals until the server accepts them; after sync, the app replaces the provisional receipt with server-confirmed sale details. This is an initial offline-sales workflow, not yet a complete offline-first system: expenses, debt, stock-in, refunds and report data are not queued offline; cross-device conflict handling and multi-device stock reservations are not implemented.\n- Full reports export (PDF/Excel), staff management, automatic mobile-money verification and subscription payment activation are not complete.
- No live Supabase project has been connected or tested by this repository workflow. Migrations must be applied and tested in your own staging project.
- Passing TypeScript CI does not prove database policies or payment flows are production-ready.
