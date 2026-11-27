# GUNX SMART BUSINESS

Cross-platform business and POS management application for Tanzania, built with Expo, React Native and TypeScript.

## Product identity

- Official GUNX SMART BUSINESS logo is maintained in the app branding assets; do not substitute or redesign it.
- Visual identity: deep navy, emerald green and restrained metallic gold.
- Currency: TZS. Default timezone: Africa/Dar_es_Salaam.
- Owner and employee experiences are role-separated. Employees join through phone-number invitations and authenticate with their own verified phone identity.

## Implemented application areas

The current branch includes:
- Supabase Auth integration, persistent sessions, owner shop onboarding and business media.
- Employee invitations bound to a Tanzania phone number, SMS OTP authentication and invitation acceptance.
- Owner, manager, cashier, stockkeeper and platform-admin access flows with database-backed role/permission checks.
- POS checkout through a server-side RPC that recalculates prices and locks stock.
- Offline sale outbox/cache and retry synchronization with idempotency protection.
- Product catalogue, stock receiving and movement history.
- Customer debts and debt collections.
- Item-level partial/full sale returns with server-side stock restoration.
- Owner/manager dashboards, reports and PDF/CSV export.
- Shop subscriptions and platform-level administrative dashboards.

Implementation does not imply every workflow has passed end-to-end device, provider, database-security or production-readiness tests. Demo mode remains available when Supabase environment variables are absent; demo data is temporary and is not real business data.

## Architecture

- Client: Expo + React Native + TypeScript.
- Backend: Supabase Auth and PostgreSQL with RLS and SECURITY DEFINER RPCs.
- Client environment: EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY. Never expose a service-role key in the app.
- Financial/stock mutations should be atomic server-side operations. Client-provided totals are not authoritative.
- Tenant boundary currently implemented at shop level.
- Business Groups, branches, branch memberships, branch-level inventory, and verified employee profile records are not implemented yet.
- Platform Super Admin is restricted to platform-level aggregates, subscriptions, settings and authorized platform operations; do not add routine access to private business sales, profit, customer records or transaction ledgers.

The owner dashboard must retain the approved GUNX visual reference and brand system. Business identity media is loaded from the active tenant rather than hard-coded sample business details.

## Development commands

Install the locked dependencies and run:

- npm ci
- npm run start
- npm run android
- npm run ios
- npm run web
- npm run typecheck
- npm run build:web

GitHub Actions CI runs TypeScript checks and Expo web export. A successful web export does not prove production database migrations, SMS delivery, storage policies, payment verification, backups or operational monitoring are ready.

## Database migration safety

The repository currently contains legacy numeric-prefix migrations (including duplicate 0010 and 0011 prefixes) alongside timestamped migrations. The live Supabase project reports a separate timestamped migration history and a newer checkout RPC signature than the old base migration. Reconcile the live history with trusted source SQL before applying any new DDL. Do not replay or rename migrations blindly.

Read:
- docs/architecture/branch-and-group-rollout.md
- docs/audits/production-readiness-2026-11-27.md
- supabase/README.md

## Release policy

Do not merge the current Draft pull request or deploy Production until:
1. Migration history is reconciled and validated in an isolated database.
2. RLS/RPC tests cover unrelated tenants and every role.
3. Financial calculations reconcile for partial/full refunds and report date boundaries.
4. Auth phone/SMS, storage, subscription/payment, offline sync and backup workflows are tested.
5. TypeScript, Expo web, Android and Preview builds pass for the exact release commit.
6. The product owner explicitly approves release.
