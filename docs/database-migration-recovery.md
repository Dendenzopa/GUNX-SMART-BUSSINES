# Supabase migration recovery checkpoint

Date: 2026-11-27
Project: `qejfhjpopsgaeuqygihr`
Repository branch: `feat/business-owner-dashboard-design`

## Result

The live Supabase migration ledger contains 24 applied timestamped migrations. The repository now contains all 24 matching timestamped SQL files under `supabase/migrations/`.

- 20 missing timestamped files were restored from the live project's `supabase_migrations.schema_migrations.statements` records.
- 4 timestamped files were already present; 3 of those were aligned to the exact SQL recorded in the live ledger after comparison found source drift.
- Every timestamped file was then checked against its corresponding ledger SQL. All 24 files contain the exact recorded SQL statements (with provenance headers where recovered/aligned), not SQL regenerated from current schema guesses.
- The recovered files include a header identifying their provenance and warning that they represent migrations already applied to the live project.

## Verification

The live ledger and branch directory were compared by migration version:

- Live versions: 24
- Repository timestamped versions: 24
- Missing versions: 0
- Extra timestamped versions: 0
- Exact SQL content comparisons passed: 24/24

## Important safety rules

1. Do not replay these recovered migrations against the live project. They document changes that are already applied.
2. Do not delete or rewrite existing migration history.
3. The older numbered migration files remain historical project artifacts. Their duplicate prefixes (including `0010` and `0011`) mean they must not be treated as a clean, ordered replacement for the live timestamped ledger.
4. Any new schema change must be authored as a new migration after reviewing the recovered history, tested against an isolated/staging database, and reviewed before production application.
5. This checkpoint does not certify the application schema as fully reconciled; it certifies that the SQL source for all 24 entries in the current live migration ledger is now represented in the branch.

## Next database task

Review the live `refund_sale` definition and prepare a new, separately tested migration that preserves its current authorization rule (`owner` OR `refunds.manage`), idempotency, row/advisory locks, stock restoration, and audit records while correcting any refund allocation defect. No production database change is authorized by this checkpoint.
