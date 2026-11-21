# Data layer
The current dataset is demo-only and must never be treated as a real business account balance.

Production work still required:
- Authenticated API and strict business/tenant ownership checks.
- Durable local database (SQLite) and retryable, idempotent sync outbox.
- Server-side atomic transactions for sales, returns, payments and stock movements.
- Backups, audit events, migrations and automated tests.

Do not store payment secrets in the app or trust client-supplied prices/totals as authoritative.
