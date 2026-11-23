# GUNX SMART BUSINESS — Branch rollout guide

This guide covers migrations `0024` through `0033` on top of the existing `0023_branch_schema_foundation.sql`.

## Before applying

1. Confirm migrations `0001` through `0023` have already been applied in this Supabase project.
2. Take a database backup and test the rollout on a staging project first.
3. Deploy the matching application update before allowing staff to use the new branch workflows. Migration `0027` revokes client execution of the old shop-wide checkout, receiving, refund, and debt RPCs; migration `0032` also requires provider-aware branch RPCs for checkout, debt collections and refunds.
4. Do not apply these migrations to production until the SQL has been reviewed and exercised against a staging copy.

## Migration order

Apply exactly in this order:

1. `0024_branch_inventory_foundation.sql` — creates branch stock balances and backfills existing shop stock into the primary branch.
2. `0025_branch_ledger_attribution_and_transfers.sql` — adds branch attribution to financial/stock ledgers and audited stock transfers.
3. `0026_branch_aware_checkout_and_receiving.sql` — adds branch-aware checkout and stock receiving.
4. `0027_branch_scoped_financial_workflows.sql` — adds branch-scoped debt/refund workflows and branch-aware RLS.
5. `0028_initialize_branches_for_new_businesses.sql` — creates primary branches for new shops, seeds stock rows and assigns members to the primary branch by default.
6. `0029_branch_opening_and_daily_closing.sql` — adds branch cash sessions and daily close reports.
7. `0030_require_open_branch_session_for_sales.sql` — requires an open branch session for new POS sales.
8. `0031_branch_stock_counts_and_adjustments.sql` — adds auditable branch stock counts, damage/loss write-offs and signed corrections with idempotent RPC writes.
9. `0032_mobile_money_provider_ledger.sql` — records M-Pesa, Airtel Money, Tigo Pesa and HaloPesa separately for POS payments, debt collections, refunds and expenses.
10. `0033_enterprise_company_groups.sql` — adds company groups, group-level roles, owner-authorized shop linking/unlinking and secure consolidated shop-level sales/expense reporting.
11. `0034_enterprise_group_debt_stock_branch_reports.sql` — adds group-authorized, branch-level sales/expense performance, outstanding debt balances and cost-based stock valuation.
12. `0035_guard_company_group_shop_link_consent.sql` — enforces shop-owner and group-owner/admin consent for company-group link/unlink changes, including direct table updates.

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
- The old unscoped RPC entry points are revoked from authenticated clients. The updated app must use the new branch-aware RPCs.
- Stock counts set the branch balance to the physically counted quantity. Damage/loss remove the supplied quantity; corrections accept a signed delta. Every change records the before/after quantity, actor, reason, timestamp and matching stock movement. The global compatibility stock total is adjusted by the same delta.

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
- Enterprise group reporting is introduced by migration `0033`. The current app supports selecting among multiple shop memberships, a group dashboard, group-only accounts restricted to the Group screen, and group owner/admin member-management controls. These client flows still require staging and Android testing; the database RPCs and RLS remain authoritative.


## Stock count and adjustment verification

After applying `0031`, test each operation in staging with a dedicated stockkeeper account and verify that unauthorized users cannot call the RPC or read another branch's adjustment history. Confirm that the following audit query returns one row per successful adjustment and that `quantity_after - quantity_before = quantity_change`:

```sql
select id, shop_id, branch_id, product_id, adjustment_type,
       quantity_before, quantity_after, quantity_change, reason, created_by, created_at
from public.branch_stock_adjustments
order by created_at desc
limit 50;
```

Also test duplicate idempotency keys (same payload returns the original adjustment; changed payload is rejected), insufficient stock for damage/loss, decimal quantities to three places, and reconciliation of `products.stock_quantity` against the sum of branch balances.


## Mobile-money provider verification

After applying `0032`, make a staging sale, debt repayment, refund and expense using each provider. Confirm the generic method remains `mobile_money` and the provider field contains the exact selection. Cash and bank transactions must keep provider fields null. Test idempotent POS retries with the same provider and verify a retry with a different provider is rejected when the original provider was recorded.

```sql
select method, provider, count(*) from public.payments group by method, provider order by method, provider;
select method, provider, count(*) from public.debt_payments group by method, provider order by method, provider;
select refund_method, refund_provider, count(*) from public.sale_refunds group by refund_method, refund_provider order by refund_method, refund_provider;
select payment_method, payment_provider, count(*) from public.expenses group by payment_method, payment_provider order by payment_method, payment_provider;
```


## Enterprise company-group rollout

Migration `0033_enterprise_company_groups.sql` adds a separate group-membership layer without replacing existing shop membership or branch access:

- A user creates a company group and becomes its group owner.
- Group roles are `group_owner`, `group_admin` and `group_viewer`; these roles do not grant POS, stock or employee access inside member shops.
- A shop can be linked only when the caller is both a group owner/admin and the owner of that shop. This is an explicit shop-owner consent boundary.
- The reporting RPC returns per-shop sales totals/counts and expense totals only for the authorized group and a date range of at most 367 days.
- Group members do not receive direct access to shop tables through this migration.

Before production rollout, test group isolation with two groups, a user who belongs to both groups, a group viewer, a shop owner who is not a group member, and a non-member. Confirm group viewers can read aggregates but cannot mutate group membership or link shops. Confirm unlinking a shop removes it from subsequent reports.

The mobile app now includes a multi-shop selector, consolidated group reporting, group-only sign-in routing, and group owner/admin member-management UI. The UI is not a substitute for server authorization: test all RPCs and RLS policies with owner, admin, viewer, shop owner and non-member accounts. Migration 0033 has not been executed against a live PostgreSQL/Supabase database, and the app flows have not yet been tested on Android devices.


## Enterprise debt, stock and branch performance reporting

Migration `0034_enterprise_group_debt_stock_branch_reports.sql` adds the read-only `get_company_group_enterprise_overview` RPC. It returns one row per active branch in shops linked to a group and verifies group membership before reading any shop data.

- Sales count and sales total include completed and partially paid sales in the selected date range; voided and refunded sales are excluded.
- Expenses are summed by branch and `expense_date` in the selected date range.
- Outstanding debt is the current sum of positive `debts.balance` values, not a historical balance as of the report end date.
- Stock units and stock value are current snapshots from `branch_stock`; stock value uses each product's `cost_price`, not selling price.
- Low-stock count counts branch product rows where quantity is at or below the branch reorder level.
- `net_after_expenses` is sales total less expenses only. It is not gross profit or net profit because it does not subtract cost of goods, taxes, payroll or other accounting adjustments.

The RPC allows group viewers to see only these aggregates. It does not grant direct access to debts, products, stock rows, sales or expenses. Test two isolated groups, a viewer, an admin, a group owner, a linked shop owner and a non-member. Verify a group member cannot pass another group's ID to obtain results. Also verify inactive branches are omitted, date limits are enforced, and stock valuation reconciles to branch quantity multiplied by product cost price. Migration `0034` has not been executed against PostgreSQL; these checks remain staging requirements. Migration `0035` adds a database trigger because the existing shop-owner update policy would otherwise permit direct updates to `shops.company_group_id` outside the group-link RPC. Test direct linking/unlinking as a shop owner who is not a group admin (must fail), as a group admin who is not the shop owner (must fail), and as a user who is both (must succeed); direct cross-group moves must fail until unlink and relink are performed separately.
