# GUNX SMART BUSINESS — Supabase setup

1. Create a Supabase project.
2. In the SQL Editor, run the files in this order:
   - `supabase/migrations/0001_initial_schema.sql`
   - `supabase/migrations/0002_membership_rls.sql`
   - `supabase/migrations/0003_protect_financial_ledgers.sql`
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
