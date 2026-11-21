# GUNX SMART BUSINESS — Supabase setup

1. Create a Supabase project.
2. In the SQL Editor, run the files in this order:
   - `supabase/migrations/0001_initial_schema.sql`
   - `supabase/migrations/0002_membership_rls.sql`
   - `supabase/migrations/0003_protect_financial_ledgers.sql`
   - `supabase/migrations/0004_role_permissions.sql`
   - `supabase/migrations/0005_atomic_checkout.sql`
3. Copy `.env.example` to `.env.local` and set the project URL and anon/publishable key.
4. Install dependencies with `npm install`, then run `npx expo start`.

Security:
- Only use the Supabase anon/publishable key in the mobile/web app.
- Never embed the service_role key in an app bundle or commit it to Git.
- Configure email confirmation and password reset in Supabase Auth before production.
- RLS migrations are an initial membership boundary, not a completed role authorization review.
- Do not enter real business data until role-aware policies, transactional checkout, tenant consistency constraints, and staging tests are complete.

Current limitation:
The app's sales, stock, debt and expense screens still use temporary in-memory demo data. This setup adds the Supabase client and is the foundation for auth wiring; it does not yet make those modules cloud-backed.


## Checkout RPC

The `checkout_sale` function is a database-side transaction. It accepts a shop UUID, client-generated idempotency UUID, JSON array of `{ "product_id": "...", "quantity": 1 }`, payment method, amount paid, and optional customer UUID. The server loads current product prices and costs and locks stock rows. It rejects unavailable stock, inactive/foreign-shop products, duplicate lines, and invalid quantities. A retry with the same shop and idempotency key returns the original sale rather than charging stock twice.

Before production, test concurrent checkouts for the same product, retries after network timeouts, partial payments/credit semantics, customer ownership, and rollback after forced failures. This RPC has not yet been deployed to a Supabase project or exercised against live data. The React Native POS still uses local demo state and does not call this RPC yet.

## React Native checkout service

A typed RPC wrapper is available at `src/services/checkout.ts`. It calls `checkout_sale`, validates basic client input, and returns the server-generated receipt details. The POS screen has not yet been switched to this service because the app still needs an active shop context and cloud-loaded product catalogue. Do not treat the demo checkout button as a real transaction.

## Current live app integration status

When Supabase environment variables are present and a user is signed in with a shop membership, the app now:
- Loads that shop's active product catalogue from `products`.
- Loads that shop's sales with sale lines and payment method, plus expenses, for the dashboard/report summary.
- Submits cash POS checkouts through `checkout_sale` and refreshes stock after success.
- Saves new expense entries to `expenses`.

The following screens still use in-memory demo state and are not cloud-persisted yet: debt creation/repayments, manual stock adjustments/stock-in, returns/refunds, and customer management. POS currently exposes cash checkout only. The app still requires a real Supabase project, applied migrations 0001–0005, configured Auth email settings and staging tests. Do not treat the code as production-ready until those are completed.


### Migration 0006 — customer debt ledger

Apply `supabase/migrations/0006_debt_ledger.sql` after migration 0005. It creates:
- `debts` with the original amount and server-maintained outstanding balance.
- `debt_payments` as an append-only repayment history.
- `create_manual_debt` to create a customer and debt atomically.
- `record_debt_payment` to lock the debt row, reject overpayment and update the balance in one transaction.

The app's Debts screen reads the shop-scoped debt ledger and uses these RPCs when Supabase is configured. The repayment UI currently records cash repayments; mobile money and bank methods are supported by the database RPC but are not yet selectable in the UI. Apply all migrations 0001–0006 before testing the live debt screen.


### Migration 0007 — stock receiving

Apply `supabase/migrations/0007_stock_receiving.sql` after 0006. The Stock screen's stock-in action calls `receive_stock`, which checks the user's owner/manager/stockkeeper role, locks the product row, updates stock and appends an immutable `stock_movements` record in one transaction. The UI's shared quantity field is used for the selected product. Apply migrations 0001–0007 before live testing.
