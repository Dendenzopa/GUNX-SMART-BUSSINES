# Supabase database and release notes

## Current application integration

The app creates its Supabase client from build-time environment variables:

- EXPO_PUBLIC_SUPABASE_URL
- EXPO_PUBLIC_SUPABASE_ANON_KEY

Only the publishable/anon key belongs in the client. Never put a service-role key in Expo environment variables, mobile bundles, web bundles, or source control.

The current app includes:
- Supabase Auth session persistence and owner shop onboarding.
- Phone-based employee invitations, phone OTP authentication and invitation acceptance.
- Shop membership roles and manager permission RPCs.
- Server-side checkout and stock/refund RPCs.
- Shop-scoped reads, offline sales outbox/cache and owner/manager reporting.
- Platform-level dashboards and subscription administration.

These capabilities still require end-to-end verification against configured Auth providers, real devices, and the current database. Demo mode is used when the two Supabase environment variables are absent; demo records are temporary and must never be mistaken for production business data.

## Database model and security boundaries

The current deployed model is shop/tenant scoped. It includes shops, shop_members, products, customers, sales, sale_items, payments, expenses, stock movements, debts, debt payments, sale refunds/refund items, shop subscriptions, phone invitations and manager permissions.

- RLS is enabled and policies/RPCs constrain tenant and role access.
- Financial and stock ledger writes must go through audited atomic RPCs.
- Cashiers have restricted sales/debt visibility; refunds and sensitive financial reporting are management-only.
- Platform admin functions are for platform aggregates, subscription revenue, platform settings and support metadata. Do not add routine platform-admin reads of individual shop sales, profit, customer PII or transaction ledgers.
- Branch-level access is not implemented. Existing authorization boundaries are shop-level.
- Business Groups, Branches, branch membership, branch-level stock and verified employee profile records are not implemented yet.

## Migration history warning — resolve before new DDL

The checked-in directory contains legacy numeric-prefix migrations and timestamped migrations. It also contains duplicate legacy prefixes (0010 and 0011). The live Supabase project currently reports a separate timestamp-versioned migration history with 24 entries, and several live migration versions/names do not have matching timestamped source files in this branch. The live checkout RPC also has a newer signature than the older base migration in this repository.

Therefore:
1. Do not assume that replaying the repository migration directory reproduces the deployed database.
2. Do not apply new migrations to the live project until every live migration has been mapped to trusted source SQL and the repository history has been reconciled.
3. Do not rename/rewrite already-applied migration versions to hide drift.
4. Restore missing migration source from trusted Git history or the original deployment artifact; do not reconstruct security-sensitive SQL from memory.
5. Validate the complete migration sequence in an isolated Supabase development branch or disposable staging project before any production migration.

See docs/audits/production-readiness-2026-11-27.md for the read-only database and Advisor audit.

## Existing migration files

The numeric-prefix files describe the historical foundation and app evolution, including:
- 0001_initial_schema.sql: initial shop, product, customer, sales, payments, expense, stock and debt tables.
- 0002_membership_rls.sql: initial membership-scoped RLS and shop creation.
- 0003_protect_financial_ledgers.sql: append-only financial/stock ledgers.
- 0004_role_permissions.sql: initial role-aware access.
- 0005_atomic_checkout.sql: atomic server-side checkout.
- 0006_debt_ledger.sql and 0007_stock_receiving.sql: debt and stock workflows.
- 0008_sale_returns_refunds.sql: item-level sale returns/refunds.
- 0010_* and 0011_*: onboarding, staff administration, branding and subscriptions. These legacy prefixes are duplicated and are not a safe standalone migration sequence.
- 0015_* through 0023_*: ledger hardening, role-scoped reads, platform analytics and owner dashboard branding.

Timestamped platform admin migrations are also checked in. Treat this list as repository history, not as proof of what has been applied to the live project.

## Local development

Install dependencies and run:
- npm ci
- npm run typecheck
- npm run build:web

For local database work, use the Supabase CLI and a disposable local/staging database. Before release, test at least two unrelated shops and each staff role. Include tests for cross-tenant ID substitution, manager permission revocation, phone-bound invitation acceptance, checkout idempotency, stock locking, partial/full refunds, report period boundaries and platform-admin privacy.

## Branch and Group rollout

Do not add a branch selector until the database layer is complete. The required rollout includes:
1. Group/business/branch schema and membership.
2. Tenant-safe composite foreign keys and indexes.
3. RLS policies and narrowly scoped SECURITY DEFINER helpers.
4. Branch-aware checkout, stock receive/transfer, refund, expense and debt RPCs.
5. Backfill every existing shop to a default branch and reconcile stock totals.
6. Branch-aware dashboard/report filters and group aggregate-only reporting.
7. Regression tests and staged rollout behind a feature flag.

The approved design is documented in docs/architecture/branch-and-group-rollout.md.

## Production readiness

A successful TypeScript check or Expo export does not prove that Auth, database migrations, SMS delivery, storage policies, payment verification, offline sync, backups or production monitoring are ready. Run the full release checklist in the production-readiness audit before enabling production traffic.
