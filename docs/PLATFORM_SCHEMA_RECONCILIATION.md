# Live Supabase / GitHub schema reconciliation

## Why this note exists

The connected Supabase project `qejfhjpopsgaeuqygihr` has platform-administration tables and RPCs that are not present in the repository's checked-in `supabase/migrations/0001...0017` sequence. The project migration history currently includes these additional entries:

- `platform_business_directory`
- `platform_admin_management_foundation`
- `platform_admin_read_write_rpcs`
- `seed_platform_default_settings`
- `revoke_direct_trigger_function_execution`
- `business_onboarding_media`
- `business_assets_owner_only`
- `grant_shop_members_select_to_authenticated`
- `business_identity_slogans`

This means a fresh Supabase environment built only from the repository migration directory will not have the same schema as the connected project.

## Verified platform objects in the connected project

The connected project contains the following platform-level tables:

- `platform_admins` — trusted platform-admin allowlist; RLS enabled and no direct table policies.
- `platform_audit_logs` — platform administrator audit history.
- `platform_settings` — platform-wide settings.
- `platform_notifications` — admin notifications.
- `platform_health_checks` — recorded health-check results.
- `app_installations` and `app_user_activity` — aggregate app adoption/activity metrics.

The connected project also contains guarded platform RPCs including:

- `is_platform_admin()`
- `get_platform_metrics()`
- `get_platform_subscription_metrics()`
- `get_platform_businesses(...)`
- `get_platform_admin_users(...)`
- `get_platform_payment_requests(...)`
- `get_platform_audit_logs(...)`
- `get_platform_health_checks(...)`
- `get_platform_notifications(...)`
- `get_platform_settings()`

The platform list and metrics RPCs verify `auth.uid()` and `is_platform_admin()`. The platform overview returns aggregate install, registration, activity and tenant counts. Subscription metrics return GUNX subscription/payment totals; they do not calculate or expose tenant sales.

## Privacy boundary

The Super Admin app must use only the platform RPCs above. It must not query `sales`, `sale_items`, `customers`, `expenses`, tenant `payments`, debt ledgers, stock movements, or refund tables. The business directory may display business identity and subscription metadata, but not operational ledgers. GUNX subscription requests are distinct from a tenant's customer payments or sales.

Do not add a broad platform-admin RLS bypass to tenant tables. Do not expose the service-role key in the app.

## Remaining security work

The current connected project has member-wide SELECT policies on some tenant operational tables. In particular, all shop members can currently read sales, customers, expenses, payments, debt ledgers, refunds and stock movement records through the shared membership predicate. The app also currently loads the same business dashboard for every shop role.

Do not tighten those read policies until the Boss and Employee UI is role-aware and the intended access matrix has been tested. The intended baseline is:

- Owner: full access to their own tenant.
- Manager: access according to owner-granted management permissions.
- Cashier: POS, customers and sales/payment information required for cashier duties; no expense/profit reporting by default.
- Stockkeeper: product catalogue and stock workflows; no customer, sales, payment, expense or profit records by default.
- Super Admin: platform-level aggregate metrics and GUNX subscription operations only; no routine tenant operational records.

## Release gate

Before merging a clean-environment or production release:

1. Reconcile and check in the missing platform migrations (or create a clean, ordered baseline migration set).
2. Recreate the connected project's platform RPCs and policies in a disposable/staging Supabase project.
3. Run RLS and cross-tenant tests for owner, manager, cashier, stockkeeper and platform-admin sessions.
4. Confirm non-admin users cannot execute privileged platform RPCs successfully even though the functions are callable by the authenticated database role.
5. Confirm Super Admin UI requests contain no tenant sales/customer ledger queries.
6. Run TypeScript/build checks and test the preview before production promotion.

This document records verified schema differences; it is not a claim that the migration history has already been reconciled.
