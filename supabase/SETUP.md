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
