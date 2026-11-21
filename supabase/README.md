# Database implementation notes

This repository now contains an initial PostgreSQL schema at `supabase/migrations/0001_initial_schema.sql`.

## What it models
- Shops and staff membership with roles.
- Products, customer records and stock movement history.
- Sales and immutable product name/cost snapshots on sale lines.
- Payment records, expense records and debt repayments.
- Tanzania shillings (TZS) and Africa/Dar_es_Salaam timezone defaults.

## Important: not production-ready yet
The migration enables Row Level Security (RLS) but intentionally creates no permissive client policies. Do not connect a public client to these tables until membership-based policies and role checks are implemented and tested. Do not use the Supabase service-role key in a mobile app.

The current app still uses in-memory demo data. This schema is a foundation only; it is not connected to the app and does not migrate demo records.

## Required next engineering tasks
1. Apply and test migrations 0001–0005 in a staging Supabase project.
2. Wire the POS to active shop context, cloud products and the typed checkout service.
3. Implement refund/return transactions and debt balance views based on recorded payments.
4. Add local SQLite persistence and a retryable sync outbox.
5. Add automated tests, backup/restore procedures and deployment secrets configuration.

Never calculate authoritative profit from client-provided totals. Use sale item cost snapshots, valid returns and approved expenses.


## Added security migrations

Apply migrations in numeric order:

- `0001_initial_schema.sql`: base shop, product, customer, sales, payment, expense, stock and debt tables.
- `0002_membership_rls.sql`: authenticated shop membership policies and the `create_shop(p_name)` RPC. A user creates a shop through this function; the function creates the owner membership atomically.
- `0003_protect_financial_ledgers.sql`: prevents authenticated clients from updating or deleting sales, sale items, payments, stock movement history and debt repayment records. Corrections must be represented by compensating records.
- `0004_role_permissions.sql`: initial role-based write policies for owners, managers, cashiers and stockkeepers.
- `0005_atomic_checkout.sql`: atomic server-side checkout with database pricing, stock row locks and idempotent retries.
- `0010_staff_membership_admin.sql`: owner-only RPCs to add an existing Auth user by UUID, change non-owner staff roles, and remove non-owner staff.

The policies include an initial role boundary, but require review and testing. Validate cross-table shop consistency with database constraints/triggers and implement refund/return RPCs. Do not treat these migrations as a completed security audit. Apply them to a staging Supabase project and test with at least two unrelated users and multiple staff roles before production.

## Current app status

The React Native screens still use in-memory sample data. The app now includes a Supabase client, an email/password auth gate, initial shop creation, and a typed checkout RPC wrapper. However, no Supabase project URL/key is configured in this repository, the auth and checkout flows have not been tested against a live project, the POS still uses in-memory demo products and sales, and offline SQLite storage, sync queue, automated payment verification and backup service are not configured. Demo records reset when the app process restarts. Manual payment phone numbers in the app are instructions only and do not activate subscriptions automatically.


Role permissions in migration 0004 are an initial role boundary. Migration 0010 adds owner-only membership RPCs; it does not send email invitations. The target employee must already have a Supabase Auth account, and the owner must obtain that account's user UUID through a trusted onboarding flow. Do not expose arbitrary user UUID lookup to untrusted clients. Review and test all table access, especially membership administration, refunds, cross-table tenant consistency and RPCs, before production.
