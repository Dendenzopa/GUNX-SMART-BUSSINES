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
