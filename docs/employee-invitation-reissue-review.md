# Employee invitation lifecycle fix

## Finding
The original `shop_invitations_one_pending_phone` unique index includes every row where
`accepted_at IS NULL`. Setting `expires_at = now()` in the revoke/reissue flow does
not remove that row from the partial index. As a result, an expired or revoked
invitation can block a replacement invitation for the same shop and phone.

## Prepared migration
`20261127120000_fix_employee_invitation_reissue.sql` adds `revoked_at`, marks
already-expired unused invitations as revoked, and changes the uniqueness condition
to active unused invitations only. Reissuing an invitation revokes its predecessor.
Acceptance explicitly rejects revoked invitations. Revocation records a timestamp
instead of pretending an invitation was accepted.

The migration preserves:
- owner-only create/revoke authorization;
- verified phone-number matching on acceptance, including a non-null SMS `phone_confirmed_at` timestamp;
- one-business-per-employee guard;
- role allowlist (manager, cashier, stockkeeper);
- SECURITY DEFINER fixed search path;
- authenticated-only execute grants (no PUBLIC/anon).

## Required tests in a disposable/staging database before applying anywhere
1. Create an invitation; revoke it; create another for the same shop/phone — succeeds.
2. Create an invitation; let it expire; create another for the same shop/phone — succeeds.
3. Reissue an unused invitation — old token fails, new token succeeds only for the invited verified phone.
4. Accept without SMS phone verification — fails.
5. Accept an invitation twice — second attempt fails.
6. Accept with a different verified phone — fails.
7. Attempt create/revoke as manager or cashier — fails.
8. Concurrent reissue attempts — unique index permits only one active invitation.
9. Confirm execute ACL remains authenticated-only and RLS/direct table grants remain unchanged.

## Safety
Prepared in source only. Not applied to Supabase Production. No business/customer/sales
records were queried or changed. Do not replay recovered historical migrations.
