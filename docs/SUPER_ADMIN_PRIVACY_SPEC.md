# GUNX SMART BUSINESS — Super Admin & Privacy Specification

## Official privacy promise

**Your Business, Your Data, Your Privacy.**

This exact English wording is the approved GUNX SMART BUSINESS privacy slogan. Preserve capitalization, punctuation, and wording in product UI, onboarding, privacy/security settings, and appropriate footer/about surfaces.

## Non-negotiable privacy policy

1. Super Admin must not routinely view an individual tenant's sales, profit, loss, expenses, customers, customer contact details, line items, payment history, or other private operational records.
2. Boss/Business Owner can access only their own tenant's records, subject to authentication and owner permissions.
3. Employees can access only the tenant(s) they belong to and only the capabilities granted by the Boss.
4. Super Admin may see platform-level operational metrics that do not expose individual tenant business records: tenant counts, aggregate active-user counts, platform health, subscription status, and GUNX subscription revenue.
5. GUNX subscription revenue must remain separate from tenant sales/revenue.
6. No hidden or routine Super Admin bypass of tenant Row Level Security is permitted. Platform-admin status must not imply membership in a tenant.
7. Any exceptional support/investigation access must be purpose-limited, explicitly authorized, time-bound, scoped to the minimum necessary records, disclosed to the tenant owner when legally and operationally possible, and fully audited. Access must expire/revoke automatically.
8. Emergency access must not be implemented as an undocumented service-role key or unrestricted client-side query.

## Super Admin modules

- Overview: aggregate platform KPIs, platform health, recent platform events.
- Businesses: tenant directory and non-sensitive account/subscription metadata only.
- Users: platform account status and tenant membership metadata only; no tenant customer data.
- Plans & Subscriptions: plan catalogue, status, renewal/expiry and billing configuration.
- GUNX Payments & Revenue: platform subscription transactions only.
- Platform Analytics: aggregate, privacy-preserving trends.
- Support Center: tickets and owner-submitted diagnostics; no default access to private sales data.
- Notifications: platform-wide or tenant-targeted announcements.
- Security Center: authentication/security events and alerts.
- Audit Logs: append-only records of privileged platform actions.
- System Monitoring: API/database/storage/backup health and uptime.
- Admin Roles & Permissions: least-privilege platform staff roles.
- Feature Management: platform feature flags and tenant-level enablement metadata.
- Backup & Recovery: backup status and controlled recovery procedures.
- Global Settings: locale, timezone, currency, registration and platform configuration.

## Required security implementation

- Enable and verify RLS on every tenant-owned table.
- Tenant membership checks must be enforced in PostgreSQL policies, not only in the UI.
- Platform-admin authorization must use a server/database-verified allowlist or role table; never trust client-supplied role claims.
- Platform-admin APIs/RPCs must return aggregate or explicitly permitted platform metadata only.
- Do not expose the Supabase service-role key to client applications.
- Audit privileged actions with actor, action, target, purpose, timestamp, approval, expiry, and outcome.
- Test cross-tenant access denial for Boss and Employee accounts and ensure Super Admin cannot query tenant private tables.
- Avoid storing customer PII in platform analytics, logs, error traces, or support diagnostics.

## Acceptance criteria

A feature is complete only when its UI, backend/API, database permissions, error/loading/empty states, mobile responsiveness, and automated/manual security tests are verified. Demo values must never be presented as live platform data.

## Brand placement

Use the exact slogan **Your Business, Your Data, Your Privacy.** in the Super Admin privacy promise area and the business-facing privacy/onboarding surfaces. Keep GUNX navy, emerald and gold branding and the approved official logo.
