# GUNX SMART BUSINESS — Production Readiness Audit

**Audit date:** 2026-11-27  
**Repository branch:** feat/business-owner-dashboard-design  
**Pull request:** #45 (open, Draft)  
**Supabase project:** GUNX-SMART-BUSINESS (read-only inspection)  
**Important:** This report records observed facts. It does not certify production readiness.

## Executive finding

The application has meaningful implemented functionality (Supabase authentication, shop onboarding, phone-based employee invitations, role-gated screens, atomic checkout, refunds, offline outbox, reporting and platform administration). It is not yet safe to label the complete product production-ready. The largest release blocker discovered in this audit is **migration-history drift between the Git branch and the live Supabase project**. Do not apply new DDL or deploy branch/group schema until that drift is reconciled and a disposable Supabase development database is available.

## Verified live database state

A read-only inspection on 2026-11-27 confirmed:
- Supabase project status: ACTIVE_HEALTHY; PostgreSQL 17.12.
- No Supabase development branches currently exist.
- Live migration history contains 24 timestamp-versioned migrations, from 20261124224157 through 20261125214713.
- Repository branch contains 29 migration SQL files: 25 legacy numeric-prefix files (including duplicate 0010 and 0011 prefixes) plus four timestamp-versioned files.
- Several live migration names/versions are not represented as matching timestamp-versioned files in this branch. The numeric-prefix files cannot safely be assumed to be an exact replay of the live migration history.
- Live schema currently has shop-level tenants and inventory (shops, shop_members, products.stock_quantity, sales, refunds, stock movements, invitations and manager permissions). No business_groups, branches, branch_members, or branch inventory tables were found in the inspected schema.
- Current live checkout RPC signature includes p_expected_total; the repository's older base migration 0005_atomic_checkout.sql does not. This is another sign that the live database evolved beyond the checked-in migration snapshot.

## Security Advisor findings observed

### Security
- 6 RLS-enabled tables have no policies: app_installations, app_user_activity, checkout_requests, platform_admins, shop_invitations, and shop_member_permissions. These may be intentionally deny-by-default tables whose writes/reads are restricted to trusted RPCs; validate grants and intended access before adding policies. Do not add broad policies just to silence the linter.
- 37 SECURITY DEFINER functions are flagged as executable by authenticated users. A read-only inventory found fixed search_path clauses across the inspected SECURITY DEFINER functions; trigger-only functions are not executable by authenticated users, and admin_activate_pro is service_role-only. Authenticated RPCs are intentionally exposed entry points in this architecture, but still require per-function review of auth.uid() checks, role checks, tenant ownership, input validation, and least-privilege grants. The Advisor warning alone does not prove an exploitable vulnerability.
- Supabase Auth leaked-password protection is disabled. Enable it in Auth password security settings after checking the user impact and rollout policy.

Remediation references:
- [RLS linter guidance](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
- [SECURITY DEFINER linter guidance](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
- [Leaked password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)

### Health\n- Supabase Health Advisor returned no lints at the time of this read-only audit. This is not a substitute for backups, restore drills, uptime monitoring or application-level health checks.\n\n### Performance
- 26 foreign keys were reported without covering indexes.
- 8 indexes were reported as unused at the time of the Advisor snapshot. Do not drop these automatically: low-traffic paths may not have exercised them yet.
- Prioritize indexes after examining query plans and workload; create indexes in a separate migration and measure before/after.

Remediation references:
- [Unindexed foreign keys](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys)
- [Unused indexes](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index)

## Application implementation checks

- Employee onboarding UI creates phone-number invitations and requires the invited employee to authenticate with the invited phone identity. Verify end-to-end SMS delivery and phone provider configuration in a real device test.
- Live `accept_shop_invitation` checks for an authenticated user, an SMS-confirmed phone, exact phone match, expiry, one-time use and an existing membership in another shop. Live `create_shop_invitation` is owner-only and expires a previous pending invitation for the same shop/phone. This is a sound baseline, but must be covered by automated negative-path tests.
- The live project currently has no deployed Edge Functions. The repository contained an unused legacy `invite-staff` email-based function that was not called by the app; it has been removed so the obsolete email flow cannot be mistaken for the current phone-bound invitation system.
- Existing dashboard and reports are currently shop-scoped. The database migration explicitly deferred branch-level scoping.
- shop_members contains role and user ID only; there is no first-class employee profile table for verified display name/phone in the inspected schema. Do not display invented names or query auth.users from the client.
- Owner dashboard chart reads sales and subtracts refund values by refund timestamp. Reports also use refund history and returned cost snapshots. Add regression tests for partial/full returns, duplicate idempotency keys, historical sales refunded in the selected period, and multiple refunds on one sale.
- Refund eligibility currently requires fully paid sales. This is an intentional business rule in the RPC and should be reflected consistently in UI copy.
- Branch-level stock cannot be safely introduced by adding a branch selector alone. It requires stock ledger migration, branch-aware checkout/receive/refund/debt/expense RPCs, composite tenant constraints, RLS, backfill parity checks, and role-aware dashboard filters.
- Group dashboards must return aggregates only; membership in a group must not grant raw customer, receipt, staff, or transaction access.
- Super Admin must retain platform-level aggregate/subscription access only. No standing cross-tenant operational read policy is permitted.

## Release blockers and next engineering sequence

1. **Reconcile migrations:** map each live timestamp migration to its source SQL, restore missing migration files from trusted history, and make the repository migration directory replayable. Resolve duplicate legacy version prefixes without rewriting deployed history.
2. **Create an isolated database branch or disposable staging project:** the current project has no development branches. A development branch may incur usage charges; obtain cost approval before creating one.
3. **Automated database tests:** test RLS with at least two unrelated shops and each role; test invitation phone binding, checkout idempotency, stock locks, refunds, cross-tenant ID substitution, manager permission revocation, and platform admin boundaries.
4. **Financial regression tests:** prove gross revenue, refunds, returned COGS, expenses and net profit reconcile for daily/weekly/monthly/all-time periods, including a sale made in an earlier period and refunded later.
5. **Branch and group rollout:** implement schema/RPC/RLS/backfill in staging; prove stock totals and tenant isolation before app UI rollout.
6. **Employee profiles:** add verified profile lifecycle tied to owner and employee onboarding, with minimal PII exposure and role-scoped access.
7. **UI/UX audit:** review all owner, manager, cashier, stockkeeper, platform admin, auth, onboarding, modal and report screens in light/dark mode on mobile and web.
8. **Operational readiness:** confirm backups/PITR, monitoring, Auth SMS provider and redirect URLs, storage policies, secrets, payment provider verification, privacy notice, and incident/recovery runbooks.
9. **Build and preview:** run the currently compatible npm install workflow, TypeScript, Expo web export, Android build, database tests and a current Vercel Preview. A trial switch to npm ci failed at dependency installation and was reverted; investigate the lockfile/CI error before adopting npm ci. Vercel deployment quota has previously blocked Preview builds.
10. **Release:** merge and Production deployment only after review and explicit owner approval.

## Guardrails

- Never apply an unverified migration to the live project.
- Never claim CI or Preview passed for a commit unless the exact commit has a successful run/deployment.
- Never expose the Supabase service-role key in the mobile/web bundle.
- Never grant Super Admin routine access to business-level private sales, profits, customer details or transaction records.
- Do not remove existing sales, customers, stock movements, refunds or subscriptions as part of migration cleanup.
- Preserve the official GUNX logo, navy/emerald/gold identity, approved dashboard reference, Boss onboarding, and phone-based employee invitation flow.


## Follow-up verification — 2026-11-27

- Commit `e28dce00048e06e629f358cf08599336c16e8f4c` passed both Vercel Preview status checks. This verifies the exact branch commit's deployment checks, not full functional correctness or Production readiness.
- Client-side Super Admin isolation was rechecked: the app bypasses shop membership/manager-permission loading for platform admins, does not load tenant offline snapshots/outbox for them, and renders the platform dashboard. The live `get_shop_sales` and `get_shop_products` SECURITY DEFINER RPCs still require shop role/permission checks; platform-admin status alone does not satisfy those checks. The platform directory/metrics RPCs are separately gated by `is_platform_admin()` and expose platform directory/aggregate data, not sale line items.
- **Confirmed financial defect — discounted-sale refunds:** the live `refund_sale` RPC currently calculates each refund as `unit_price * returned_quantity` and stores that full-price amount. It does not allocate the original sale-level discount across returned items. Therefore, on a discounted receipt, a partial or full refund can exceed the discounted amount attributable to the returned items and make net sales/profit inaccurate. The app currently previews the same undiscounted amount, so a client-only display change would not fix the database ledger.
- Do not patch the live RPC directly. First reconcile migration history and recover the authoritative migration source; then implement a versioned migration in an isolated staging database. Define a deterministic discount-allocation and rounding rule that guarantees cumulative refunds never exceed the sale's net paid total, including repeated partial returns, and add regression tests for multiple items, fractional quantities where allowed, multiple partial refunds, full return, and idempotent retries.
- No schema change was applied during this follow-up. PR #45 remains open/draft; no merge or Production deployment was performed.


## Migration reconciliation checkpoint — 2026-11-27

- Preview deployment for audit commit `c958b9a877a45763497da9f1e24e99dac7368712` reached Vercel state `READY` at `gunx-smart-bussines-8nnodb3zp-dendenzopa.vercel.app`. This is a Preview deployment only.
- Live Supabase migration history currently lists 23 timestamped migrations from `20261124224157` through `20261125214713`. The repository `supabase/migrations` directory contains 29 files (25 legacy numbered files, including duplicate 0010 and 0011 prefixes, plus only four timestamped files ending at `20261125004226`). The later live migration sources are absent from this branch, including the onboarding media, tenant read-policy, cost/member visibility, manager permissions, employee invitations, and verified-phone hardening migrations. The source for live version `20261124224157_platform_business_directory` is also not present under that exact timestamp.
- The live `refund_sale(uuid,uuid,uuid,jsonb,text,text)` definition differs from legacy `0008_sale_returns_refunds.sql`: the live authorization requires owner role or `refunds.manage` permission, while the legacy file allows owner/manager role. Replaying or copying the legacy function as a new migration would silently weaken the current permission model and is prohibited.
- Live table metadata confirms sale-level `subtotal`, `discount`, and `total`; sale-item `quantity`, `unit_price`, and `line_total`; refund-item `quantity`, `unit_price`, and `refund_amount`. The current live refund function still computes `round(unit_price * returned_quantity, 2)`, so it does not allocate the sale discount. This is a verified accounting defect, but a safe fix must preserve the live role/permission guard and all current stock/idempotency/locking behavior.
- **No database migration was applied.** Before authoring a deployable refund migration, recover and archive the missing live migration sources (or a verified schema/function snapshot with provenance), then build regression tests in an isolated database. Never use the legacy 0008 function as the replacement baseline.
