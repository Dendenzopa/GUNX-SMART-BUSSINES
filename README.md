# GUNX SMART BUSINESS

Cross-platform business management for small businesses in Tanzania.

## Product requirements
- Android, iOS and Web from a shared TypeScript codebase.
- Deep Navy, Emerald Green and Gold visual identity.
- TZS currency and Africa/Dar_es_Salaam timezone.
- Sales should work offline and sync safely when connectivity returns.
- POS payment methods: cash, mobile money, bank and customer credit.
- PDF/WhatsApp receipts, returns and refunds.
- Product cost and selling price, units, reorder levels, stock-in and movement history.
- Expenses, net-profit reporting, customer debt ledger and reminders.
- Free tier and Pro subscription planned at TZS 5,000/month.
- Pro expiry must not delete customer business data.

## Planned modules
Dashboard, POS, Products, Inventory, Customers/Debts, Expenses, Reports, Staff, Subscription and Settings.

## Architecture direction
Expo + React Native + TypeScript. Planned backend: authenticated API and relational database with strict business/tenant scoping. Offline sales will use local persistence and an idempotent sync outbox. Inventory and financial history should be recorded as immutable movements/transactions and updated atomically.

## Current status
Initial application scaffold. This is not yet production-ready. Authentication, backend/database, offline synchronization, payment provider integrations, authorization, automated tests, backups and deployment still need implementation and verification. Do not use demo dashboard figures as real business data.

## Development
Install Node.js, then:
- `npm install`
- `npm run start`
- `npm run android`
- `npm run ios`
- `npm run web`


## Official privacy promise

**Your Business, Your Data, Your Privacy.**

GUNX must protect each business tenant's private sales, profit/loss, expenses, customers, customer contact details and transaction history from routine Super Admin access. Super Admin is limited to privacy-preserving platform metrics and GUNX subscription/billing information. Exceptional support or investigation access must be purpose-limited, explicitly authorized, time-bound, disclosed to the business owner when possible, and fully audited. Tenant isolation must be enforced by database Row Level Security, not just by hiding UI controls.

See [docs/SUPER_ADMIN_PRIVACY_SPEC.md](docs/SUPER_ADMIN_PRIVACY_SPEC.md) for the approved Super Admin modules, security requirements and acceptance criteria.


## Super Admin implementation status

The privacy-first Super Admin interface is being added in a separate reviewed branch. It reads platform-level metrics, tenant directory metadata, platform user metadata, GUNX subscription payment requests, audit logs, health checks and settings through administrator-guarded RPCs. It does not query tenant sales, profit/loss, expenses, customer records or tenant transaction ledgers.

Before a clean-environment or production release, reconcile the platform tables/RPCs already present in the connected Supabase project with the checked-in migration history. See [docs/PLATFORM_SCHEMA_RECONCILIATION.md](docs/PLATFORM_SCHEMA_RECONCILIATION.md). Do not tighten employee read policies until the employee UI and role permissions are updated and tested together.
