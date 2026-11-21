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
