# Rashfurnstore multi-branch setup

This change adds the database foundation for the requested three-branch workspace.

## Branches
- Bohari — managed by business owner Rashid Athumani Rashidi.
- Buswelu — assigned to Michael Robert.
- Nyegezi — assigned to Ramadhani William Mryakado.

## Roles
- Platform administrator: stored in `platform_admins`; this is separate from shop membership.
- Business owner: existing `shop_members.role = 'owner'`; can access every branch in that shop.
- Staff: existing shop membership with a non-owner role and a `branch_id`; can access only that branch.

## Deployment steps
1. Back up the Supabase database.
2. Apply `supabase/migrations/0002_multi_branch_rbac.sql` after the initial schema.
3. Create/authenticate the four users in Supabase Auth.
4. Explicitly grant the Super Admin row in `platform_admins` to Elias's verified auth user ID.
5. Ensure Rashfurnstore's shop owner is Rashid's verified auth user ID.
6. Assign Michael's membership to the Buswelu branch and Ramadhani's membership to the Nyegezi branch. Do not guess users by display name; use verified Auth user IDs.
7. Update the checkout RPC and every client query to require the active `branch_id` before enabling production writes.

## Important implementation boundary
This migration is a database foundation, not a finished production release. The current checkout RPC and some app queries still use shop-level scope. Do not deploy this migration to a live shop or claim branch-isolated POS is complete until checkout, inventory transfers, purchases, reports, staff invitations, and RLS policies have been tested together. The initial migration intentionally leaves some tables without client policies; review the complete schema policy set before production.
