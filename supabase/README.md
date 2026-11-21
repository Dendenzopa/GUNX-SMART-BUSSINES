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
1. Add tested RLS policies so every row is scoped to a shop the signed-in user belongs to.
2. Implement server-side transactional checkout: validate prices and stock, create sale/items/payment, and write stock movements atomically.
3. Implement idempotency keys for offline sync and payment callbacks.
4. Add refund/return transactions and debt balance views based on recorded payments.
5. Add local SQLite persistence and a retryable sync outbox.
6. Add automated tests, backup/restore procedures and deployment secrets configuration.

Never calculate authoritative profit from client-provided totals. Use sale item cost snapshots, valid returns and approved expenses.


## Added security migrations

Apply migrations in numeric order:

- `0001_initial_schema.sql`: base shop, product, customer, sales, payment, expense, stock and debt tables.
- `0002_membership_rls.sql`: authenticated shop membership policies and the `create_shop(p_name)` RPC. A user creates a shop through this function; the function creates the owner membership atomically.
- `0003_protect_financial_ledgers.sql`: prevents authenticated clients from updating or deleting sales, sale items, payments, stock movement history and debt repayment records. Corrections must be represented by compensating records.

The policies currently enforce shop membership, not fine-grained staff roles. Before production, add and test role-aware permissions (owner/manager/cashier/stockkeeper), validate cross-table shop consistency with database constraints/triggers, and implement checkout/refund RPCs. Do not treat these migrations as a completed security audit. Apply them to a staging Supabase project and test with at least two unrelated users and multiple staff roles before production.

## Current app status

The React Native screens still use in-memory sample data. No Supabase URL/key, authentication flow, offline SQLite store, sync queue, production checkout RPC, automated payment verification, or backup service is configured. Demo records reset when the app process restarts. Manual payment phone numbers in the app are instructions only and do not activate subscriptions automatically.
