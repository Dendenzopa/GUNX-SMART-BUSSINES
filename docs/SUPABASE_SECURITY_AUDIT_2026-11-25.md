# GUNX SMART BUSINESS — Supabase Security Review (2026-11-25)

This is a snapshot of the connected Supabase project's Security and Performance Advisors during the Super Admin privacy work. It is a remediation checklist, not a production security certification.

## Security findings

### 1. RLS-enabled tables with no direct policies

The advisor reports four tables with RLS enabled and no policies:

- `app_installations`
- `app_user_activity`
- `checkout_requests`
- `platform_admins`

For `platform_admins`, no direct client policy is intentional: the trusted allowlist should not be readable or writable from ordinary client sessions. `checkout_requests` is an internal idempotency ledger and should remain inaccessible directly. The app metrics tables should be accessed only through narrowly validated functions. Confirm each intended access path before adding any policy; do not add blanket authenticated policies.

### 2. Public execution of an installation-registration SECURITY DEFINER RPC

`register_app_installation(uuid,text,text)` is callable by `anon` and writes a client-supplied installation UUID, platform and app version into the aggregate installation table. Its input checks are present, but anonymous callers can still submit fabricated installation identifiers and distort adoption metrics.

Decide whether anonymous first-launch tracking is required. If it is, keep the function's input validation, add appropriate abuse controls/monitoring and clearly treat install counts as approximate telemetry. If it is not required, revoke `EXECUTE` from `anon` and use an authenticated-only flow.

### 3. SECURITY DEFINER RPC review

The advisor reports 28 SECURITY DEFINER functions callable by authenticated users. This is not automatically a vulnerability: several workflows intentionally need a controlled privileged transaction. Each function must verify `auth.uid()`, tenant membership/role or platform-admin status internally, use a fixed safe `search_path`, and expose only the minimum operation.

The reviewed platform RPCs (`get_platform_businesses`, `get_platform_admin_users`, `get_platform_metrics`, `get_platform_subscription_metrics`, `get_platform_payment_requests`, `get_platform_audit_logs`, `get_platform_health_checks`, `get_platform_notifications`, and `get_platform_settings`) include an `is_platform_admin()` authorization check. Continue auditing the remaining tenant RPCs and never rely on the UI to enforce their authorization.

### 4. Leaked-password protection disabled

Supabase Auth's leaked-password protection is currently disabled. Enable it in the Auth password/security settings before production onboarding, then test sign-up and password changes.

## Performance findings

The Performance Advisor reports 24 foreign-key constraints without covering indexes. Review them against query patterns and add indexes where useful, prioritizing high-volume ledgers and joins. Do not add indexes blindly without considering write overhead.

## Dependency findings

The Vercel preview install reported **14 npm audit findings (12 moderate, 2 high)**. Run `npm audit` to identify exact packages and dependency paths, then update within compatible version ranges and rerun typecheck/build. Do not use `npm audit fix --force` without reviewing breaking changes.

## Tenant privacy finding

The connected project currently has member-wide SELECT policies on multiple operational tables. This means all members of a shop can read some sales, customer, expense, payment, debt, refund and stock-movement records, even though write permissions are more role-specific.

This is broader than the intended Boss/Employee permission model. Tighten read policies only alongside a role-aware Employee UI and tests, so employees do not receive screens that silently fall back to demo data when RLS denies access.

## Release gate

- [ ] Decide and document the anonymous installation telemetry policy.
- [ ] Enable leaked-password protection.
- [ ] Audit every SECURITY DEFINER function's authorization and grants.
- [ ] Reconcile live Supabase migrations with the repository.
- [ ] Implement and test role-specific SELECT policies.
- [ ] Review the 14 npm audit findings and update dependencies safely.
- [ ] Add the useful covering indexes after reviewing query patterns.
- [ ] Run security/performance advisors again and document accepted exceptions.
