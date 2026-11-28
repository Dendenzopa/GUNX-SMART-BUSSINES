# GUNX Account and Device Recovery

Status: design baseline for implementation; not enabled in production.

## Product guarantee

A lost, stolen, replaced, or damaged phone must not cause loss of a GUNX account or tenant data. The business remains attached to the existing Supabase Auth user and existing `shop_members` membership. Recovery must never call `create_shop`, recreate products, or copy sales into a new tenant.

Cloud data is authoritative. Local-only, unsynchronized offline sales are not guaranteed to survive loss of the device; the app must show pending-sync status and warn users before they uninstall or lose access to a device.

## Account identity and recovery paths

### Boss / business owner
- Primary identity remains the existing owner account (currently email/password and/or Google OAuth, according to the provider configured for that account).
- On a replacement phone, sign in to that same identity. Resolve the existing owner membership from `shop_members`; do not route an existing owner to business creation.
- If the owner also has a verified phone identity, offer SMS OTP as an additional recovery/sign-in method only after the phone identity has been securely linked to the same Auth user.
- If the owner cannot access the original email/Google account or verified phone, open a support recovery case. Do not create a replacement owner account automatically.

### Employee
- Preserve the employee's existing Auth user, verified phone number, `shop_members` row, role, and manager permissions.
- Preferred route: replace the SIM with the mobile operator and sign in using the existing verified phone identity.
- Offer passwordless SMS OTP as an alternate sign-in route only for an existing account (`shouldCreateUser: false`); never let the recovery screen create a new employee account or accept a new invitation.
- If the employee cannot recover the original number, the Boss may initiate a support case but must not impersonate the employee or change their role. A verified support process must establish identity and approve a phone-number change.

### Optional Recovery Code
- Recovery Code is optional, generated only on explicit user request, displayed once, and stored only as a salted hash server-side.
- It is an additional proof factor, not a replacement for verified identity checks. No user is blocked from recovery for not having one.

## Lost-device protection

- Initial recovery control: an authenticated user can request **global session revocation** from a trusted replacement device. A narrowly scoped Edge Function validates the caller's JWT, writes a security audit event, and uses the Supabase Auth Admin API to revoke all sessions for that same user. The user must then sign in again on the trusted device.
- This first version deliberately revokes all sessions for that account, not just one selected phone. It must not be labelled as per-device revocation.
- Supabase invalidates refresh tokens, but already-issued access-token JWTs can remain valid until their expiry. Therefore this is not instantaneous termination of every in-flight request; keep JWT lifetime appropriately short and assess server-side `getUser()` checks for highly sensitive actions.
- The Edge Function derives the user from the verified JWT; it never accepts a user ID from the client as proof of authority. The service-role key stays server-side.
- A future per-device registry can be added only with a reliable server-side session-to-installation mapping and enforcement on sensitive operations. Do not claim that simply marking a device row revoked invalidates its Supabase refresh token.
- The Boss may initiate an employee access-revocation action only through the existing owner/manager authorization model and an explicit confirmation. This must not grant the Boss access to the employee's password, OTP, or personal account.
- Keep a tamper-resistant audit trail for device registration, recovery request, verification decision, phone change, and revocation. Do not log OTPs, recovery codes, access tokens, refresh tokens, invitation tokens, or full identity documents.

## Support recovery when the old number/account is unavailable

1. User submits a recovery request with minimal identifying information and a contact route they currently control.
2. Support verifies the claimant using a documented evidence checklist and a second independent check. A Boss claim must establish control/ownership of the existing business account; an employee claim must be confirmed independently and may be referred to the Boss without revealing private sales/customer data.
3. A second authorized reviewer approves high-risk identity or phone changes.
4. A server-side, time-limited recovery action links the verified new identity/phone to the existing Auth user. It must not create a new tenant or change role/membership.
5. Revoke old sessions, notify the old and new contact channels where possible, and write the decision and actor IDs to the audit log.
6. Provide an appeal path for false rejection. Support agents must not browse private business ledgers as part of ordinary recovery.

## Privacy and tenant isolation

- Boss retains access only to their existing tenant; employees retain only their existing role and permissions.
- Super Admin may see aggregate recovery counts/status and subscription/platform metrics, but not routine business sales, profits, customers, or transaction details.
- Support access to identity evidence is limited, justified, time-bound, and audited. Recovery support is not a backdoor into tenant business data.
- All device/recovery tables use RLS. SECURITY DEFINER functions, if required, must use fixed search_path, derive caller identity from `auth.uid()`, revoke PUBLIC/anon execute, and be reviewed before deployment.

## Implementation sequence

1. Audit the current AuthGate and provider configuration. Boss currently uses email/Google; employee currently uses phone/password with SMS verification.
2. Add the account recovery UI: existing-account SMS OTP for employees, existing-provider sign-in for Boss, and a support-request path when identity channels are unavailable.
3. Add the private account security audit table with owner-only read access; service-role writes are restricted to the Edge Function.
4. Add the authenticated global session-revocation Edge Function. Never put a service-role key in the Expo client.
5. Add a user-facing confirmation control in account/security settings and security notifications.
6. Add tests for Boss, manager, cashier, stockkeeper, wrong phone, unknown phone, cross-tenant IDs, global session revocation, missing Recovery Code, offline pending sales, and support approval/rejection.
7. Verify on physical Android devices and Preview before any Production release.

## Acceptance criteria

- Returning Boss signs in on a new phone and sees the exact existing business without seeing business-creation onboarding.
- Returning employee signs in on a new phone and retains the exact existing shop role and permissions.
- An unknown phone cannot create an account through the recovery flow.
- Global session revocation invalidates all sessions for the account; the trusted device can sign in again.
- The UI clearly warns that global revocation signs out all devices, not only the lost phone.
- Recovery does not alter sales, products, stock, debts, customers, subscriptions, or tenant membership.
- Recovery Code can be skipped.
- A user without their old number can use the verified support path without support agents accessing private tenant ledgers.
- Every recovery and revocation decision is auditable.
- No production migration or deployment is performed until isolated tests pass and the owner approves release.
