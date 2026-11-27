# Branch and Business Group Architecture

**Status:** Design specification; not an applied database migration  
**Scope:** Tenant-safe Groups → Businesses (shops) → Branches, branch membership, and branch-level inventory.

## Goals and non-negotiable constraints

- Preserve the current single-shop onboarding path. A newly created shop receives one default branch automatically; the user does not have to understand groups or branches.
- A business group can consolidate multiple shops, while each shop remains an independent tenant and billing/subscription unit unless a later product decision explicitly changes that.
- A branch is always owned by exactly one shop. A user must have an explicit, active branch membership to access branch-scoped operational records.
- Existing users, sales, stock, expenses, debts, customers, refunds, and subscriptions must remain intact during rollout.
- Platform Super Admin must not gain routine access to shop-level sales, profit, customer details, or transaction ledgers. Only platform aggregates and subscription revenue remain available under the existing platform policy. No group/branch feature may create a cross-tenant Super Admin bypass.
- Ledger and stock mutations continue through audited atomic RPCs. No direct client inserts/updates for sales, payments, refunds, or stock balances.

## Target hierarchy

business_groups (optional umbrella) → shops (existing business tenant) → branches (operational location).

A shop may have zero or one group during the first rollout. A group can own many shops. A shop may have many branches. Do not model a group as a replacement for shops: existing RLS, subscriptions, and shop-level records already use shop_id.

## Proposed relational model

### business_groups
- id uuid primary key
- name text not null, optional logo/branding fields later
- created_by uuid references auth.users
- created_at, updated_at
- Group membership is stored separately; never infer authorization from a client-supplied group id.

### business_group_members
- group_id uuid, user_id uuid, role text (group_owner, group_admin, group_viewer), status, timestamps
- Unique (group_id,user_id) and indexes by (user_id,status) and (group_id,status).
- Only group owners/admins can manage group membership or attach/detach shops. Group viewers receive consolidated read-only metrics only.
- Group membership alone must not grant access to raw shop-level customer, transaction, or staff PII.

### Existing shops
- Add nullable group_id uuid references business_groups(id) only after group membership functions and constraints exist.
- Existing shops remain ungrouped and function exactly as before.
- Group attachment is an owner-authorized RPC, checks the actor's shop-owner authority and group admin authority, and writes an audit event.

### branches
- id uuid primary key, shop_id uuid not null, name text not null, optional code, address, is_default boolean, active boolean, timestamps.
- Unique (shop_id,id) to support composite tenant-safe foreign keys; unique active branch code per shop where code is present; at most one default branch per shop via a partial unique index.
- Branch IDs are never accepted as authority on their own; every operation verifies the branch belongs to the supplied shop.

### branch_members
- shop_id uuid not null, branch_id uuid not null, user_id uuid not null, status text, timestamps.
- Composite FK (shop_id,branch_id) → branches(shop_id,id) and FK (shop_id,user_id) → shop_members(shop_id,user_id).
- Unique (branch_id,user_id).
- Effective permissions are the intersection of shop role permissions and active branch membership. Branch membership cannot elevate a cashier to manager.
- Owner access to all branches is explicit and derived from current shop owner membership; managers may be granted selected branches. Staff are not automatically added to every branch.

### Branch inventory
- Introduce branch_inventory with (shop_id,branch_id,product_id) unique key, on-hand quantity, reorder level override (nullable), timestamps.
- Composite constraints ensure product and branch belong to the same shop.
- Product catalogue remains shop-wide. Cost and selling price remain catalogue-level initially; per-branch pricing is a separate future feature requiring an explicit price-list model.
- Do not immediately drop or reinterpret products.stock_quantity. Backfill it into each shop's default branch, compare totals, and keep a compatibility/read strategy until every stock RPC and client read uses branch inventory.
- Stock movements gain branch_id and use composite constraints. Transfers are represented by one atomic transfer RPC and paired immutable movement rows with a shared transfer reference.

## Branch attribution for operational records

Add nullable branch_id to shop-scoped operational tables where a location is meaningful: sales, expenses, debts, payments, stock_movements, and sale_refunds. For rows without a branch concept or where the branch is derived from a parent, do not duplicate it unnecessarily (for example sale_items and sale_refund_items inherit via their parent).

Rollout sequence:
1. Create one default branch for every existing shop and backfill all existing operational records to it.
2. Add composite (shop_id,branch_id) foreign keys after backfill validation.
3. Make branch_id non-null only after all supported write paths supply it.
4. Update all RPCs (checkout, receive stock, refunds, debt collection, expenses, transfers) to validate active branch membership and persist branch attribution.
5. Update dashboard/report queries to filter by active authorized branches; consolidated HQ metrics aggregate only branches/shops the caller is authorized to view.
6. Retire products.stock_quantity only in a separately reviewed migration after parity checks and app rollout.

## RLS and RPC security model

- Enable RLS on every new public table and explicitly grant only the required Data API privileges. Supabase's Data API exposure defaults changed in 2026; a public-schema table is not automatically a usable API table merely because it exists.
- Add narrowly scoped helpers such as is_group_member, has_group_role, is_branch_member, and has_branch_role. Helpers must derive identity from auth.uid() and verify active membership; never trust JWT user_metadata or client role claims.
- If a helper needs SECURITY DEFINER to avoid RLS recursion, revoke execute from PUBLIC/anon, grant only to authenticated, set a fixed search_path, and include the auth.uid() guard. Do not expose privileged generic group/branch lookup RPCs.
- Operational table SELECT policies require both shop role and branch membership. A cashier's sales visibility remains limited to their own sales and authorized branch. Refund history remains owner/manager only. Expenses and full debt ledgers remain management-only.
- Every security-definer write RPC validates actor, shop, branch, role, active status, record ownership, and cross-table tenant consistency before changing data. Revoke direct table writes as in the existing ledger hardening.
- Group consolidated dashboards should return aggregate values only (counts and summed metrics), with no customer names, phone numbers, receipt lines, or individual transaction identifiers. Group viewers are read-only.
- No platform-admin policy may be added to operational tables. Platform support access, if ever required, must be a separate time-bound, reason-coded, approved and audited workflow, not a standing role.

## Migration and verification plan

1. Confirm actual deployed migration history and project schema before writing DDL; the repository contains multiple timestamped migrations, so filenames must be generated through the Supabase CLI migration workflow rather than guessed.
2. Apply DDL to a disposable/local database first. Never apply this design directly to production as a single unverified migration.
3. Add regression tests for existing single-shop users, two shops in one group, users in only one branch, cashier own-sales visibility, manager multi-branch access, group viewer aggregate-only access, cross-shop ID substitution, inactive membership, and unauthorized RPC calls.
4. Run migration checks, SQL tests, Supabase Security Advisors, TypeScript checks, and Expo web export.
5. Compare per-shop stock totals and financial aggregates before/after backfill. Require exact equality before switching reads.
6. Roll out behind a feature flag. Enable group/branch creation only after schema, RPC, RLS, backfill, and app support are all deployed and verified.

## Open implementation boundary

This document does not create tables, alter production data, or enable branch UI. The implementation must be delivered as a reviewed migration plus coordinated RPC, RLS, domain type, and UI changes; a selector alone is not a secure branch system.
