# Free-work checkpoint — refund preparation

Date: 2026-11-27
Branch: `feat/business-owner-dashboard-design`

## Work completed without a paid database branch

- Added `src/domain/refundAllocation.ts` as a pure TypeScript reference implementation for discount allocation in cents.
- The allocator uses the largest-remainder method and stable sale-item-ID tie-breaking so allocated line totals add exactly to the sale's net total.
- Added cumulative partial-refund calculation in thousandths of a unit, with cent rounding and a fail-closed check when historical refunds already exceed the corrected allocation.
- Added `scripts/test-refund-allocation.mjs` with regression groups for no discount, discounted multi-line sales, odd-cent allocation, deterministic tie-breaking, very small cent amounts, partial returns, invalid input, and legacy over-refunds.
- Added the test command to the package scripts and GitHub Actions CI workflow.

## Safety boundary

This is a tested-reference implementation for the future database RPC correction. It is not yet wired into checkout or used to calculate authoritative refunds. The live `refund_sale` RPC remains the authority until a database migration is implemented and verified.

No Supabase development branch was created. No paid resource was provisioned. No Production RPC, schema, table, policy, grant, or business data was changed.

## Remaining work when free CI completes

1. Verify GitHub Actions typecheck, refund tests, and web export.
2. If the free CI passes, retain the implementation and use its cases as regression acceptance criteria.
3. Prepare the SQL migration offline from the exact live RPC definition, preserving owner/`refunds.manage` authorization, authenticated-only execution, idempotency locks, row locks, quantity validation, stock restoration, stock movements, and audit behavior.
4. Do not apply the SQL migration to Production until a staging environment or equivalent isolated database test is available.
5. Separately review Supabase Auth leaked-password protection. This setting is not changed by repository code and must be configured through Auth settings when the user is ready.

## Known deployment limitation

The Vercel check for this branch may fail with a Hobby build-rate-limit / upgrade-to-Pro response. This is a plan quota issue, not evidence that the application source failed to compile. GitHub Actions CI is the free validation path for these changes.
