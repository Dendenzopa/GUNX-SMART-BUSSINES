# GUNX SMART BUSINESS — Branch rollout guide

This guide covers migrations `0024` through `0032` on top of the existing `0023_branch_schema_foundation.sql`.

## Before applying

1. Confirm migrations `0001` through `0023` have already been applied in this Supabase project.
2. Take a database backup and test the rollout on a staging project first.
3. Deploy the matching application update before allowing staff to use the new branch workflows. Migration `0027` revokes client execution of the old shop-wide checkout, receiving, refund, and debt RPCs.
4. Do not apply these migrations to production until the SQL has been reviewed and exercised against a staging copy.

## Migration order

Apply exactly in this order:

1. `0024_branch_inventory_foundation.sql` — creates branch stock balances and backfills existing shop stock into the primary branch.
2. `0025_branch_ledger_attribution_and_transfers.sql` — adds branch attribution to financial/stock ledgers and audited stock transfers.
3. `0026_branch_aware_checkout_and_receiving.sql` — adds branch-aware checkout and stock receiving.
4. `0027_branch_scoped_financial_workflows.sql` — adds branch-scoped debt/refund workflows and branch-aware RLS.
5. `0028_initialize_branches_for_new_businesses.sql` — creates primary branches for new shops, seeds stock rows and assigns members to the primary branch by default.
6. `0029_branch_opening_and_daily_closing.sql` — adds branch cash sessions and daily close reports.
7. `0030_require_open_branch_session_for_sales.sql` — requires an open branch session for new POS sales.\n8. `0031_branch_stock_counts_and_adjustments.sql` — adds auditable branch stock counts, damage/loss write-offs and signed corrections with idempotent RPC writes.\n9. `0032_mobile_money_provider_ledger.sql` — records M-Pesa, Airtel Money, Tigo Pesa and HaloPesa separately for POS payments, debt collections, refunds and expenses.

## Applying with Supabase CLI

From the repository root, after checking the target project link:

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

Use the project's normal migration workflow. Do not manually re-run SQL files that the migration history already records as applied.

## Applying through the SQL Editor

If this project is not using the CLI migration history, open each migration file and run its complete contents in the order above. Confirm each migration finishes successfully before running the next one. Do not skip or reorder files.

## Expected data behavior

- Existing shop-wide stock is initially attributed to the primary branch (`Makao Makuu`).
- New branches start with zero stock for existing products. Use the audited stock receiving or transfer workflow to add stock.
- Existing and newly invited shop members are assigned to the primary branch by default. Owners can adjust assignments in Staff Management.
- Old offline sales tickets without a branch identifier are recovered into the primary branch.
- New POS sales require the selected branch to have an open cash session.
- The old unscoped RPC entry points are revoked from authenticated clients. The updated app must use the new branch-aware RPCs.\n- Stock counts set the branch balance to the physically counted quantity. Damage/loss remove the supplied quantity; corrections accept a signed delta. Every change records the before/after quantity, actor, reason, timestamp and matching stock movement. The global compatibility stock total is adjusted by the same delta.

## Staging verification queries

Run these after all migrations succeed:

```sql
-- Every shop should have exactly one active primary branch.
select shop_id, count(*) as primary_branches
from public.branches
where is_primary and active
group by shop_id
having count(*) <> 1;

-- Every product should have a stock row for every active branch in its shop.
select p.shop_id, p.id as product_id, b.id as branch_id
from public.products p
join public.branches b on b.shop_id = p.shop_id and b.active
left join public.branch_stock bs
  on bs.shop_id = p.shop_id and bs.branch_id = b.id and bs.product_id = p.id
where bs.product_id is null;

-- Existing ledger rows should have branch attribution.
select 'sales' as ledger, count(*) as missing_branch from public.sales where branch_id is null
union all select 'payments', count(*) from public.payments where branch_id is null
union all select 'expenses', count(*) from public.expenses where branch_id is null
union all select 'debts', count(*) from public.debts where branch_id is null
union all select 'debt_payments', count(*) from public.debt_payments where branch_id is null
union all select 'stock_movements', count(*) from public.stock_movements where branch_id is null
union all select 'sale_refunds', count(*) from public.sale_refunds where branch_id is null;

-- Branch balances should reconcile to the legacy shop-wide stock total.
select p.shop_id, p.id as product_id, p.stock_quantity as legacy_total,
       coalesce(sum(bs.quantity), 0) as branch_total
from public.products p
left join public.branch_stock bs on bs.shop_id = p.shop_id and bs.product_id = p.id
group by p.shop_id, p.id, p.stock_quantity
having p.stock_quantity <> coalesce(sum(bs.quantity), 0);
```

Each query should return no rows. If a query returns rows, stop and investigate before enabling branch operations.

## Important limits

- These migrations have not yet been executed against the user's live Supabase database.
- The repository CI validates TypeScript and Expo web export; it does not execute PostgreSQL migrations or prove RLS behavior.
- Android device tests, concurrent POS/closing tests, and staging RLS tests are still required.
- Consolidated multi-company/group reporting is not included in this branch rollout.
\n\n## Stock count and adjustment verification\n\nAfter applying `0031`, test each operation in staging with a dedicated stockkeeper account and verify that unauthorized users cannot call the RPC or read another branch's adjustment history. Confirm that the following audit query returns one row per successful adjustment and that `quantity_after - quantity_before = quantity_change`:\n\n```sql\nselect id, shop_id, branch_id, product_id, adjustment_type,\n       quantity_before, quantity_after, quantity_change, reason, created_by, created_at\nfrom public.branch_stock_adjustments\norder by created_at desc\nlimit 50;\n```\n\nAlso test duplicate idempotency keys (same payload returns the original adjustment; changed payload is rejected), insufficient stock for damage/loss, decimal quantities to three places, and reconciliation of `products.stock_quantity` against the sum of branch balances.\n\n\n## Mobile-money provider verification\n\nAfter applying `0032`, make a staging sale, debt repayment, refund and expense using each provider. Confirm the generic method remains `mobile_money` and the provider field contains the exact selection. Cash and bank transactions must keep provider fields null. Test idempotent POS retries with the same provider and verify a retry with a different provider is rejected when the original provider was recorded.\n\n```sql\nselect method, provider, count(*) from public.payments group by method, provider order by method, provider;\nselect method, provider, count(*) from public.debt_payments group by method, provider order by method, provider;\nselect refund_method, refund_provider, count(*) from public.sale_refunds group by refund_method, refund_provider order by refund_method, refund_provider;\nselect payment_method, payment_provider, count(*) from public.expenses group by payment_method, payment_provider order by payment_method, payment_provider;\n```\n