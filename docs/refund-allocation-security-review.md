# Refund allocation and security review

Date: 2026-11-27
Project: `qejfhjpopsgaeuqygihr`

## Verified live behavior

- `checkout_sale` writes `sales.subtotal = v_total`, `sales.discount = 0`, and `sales.total = v_total` in the current live function.
- Each checkout line stores `sale_items.line_total = round(unit_price * quantity, 2)`.
- The current `refund_sale` computes each return as `round(sale_items.unit_price * returned_quantity, 2)`; it does not allocate any sale-level discount across lines.
- Current refund authorization is: authenticated user required AND (`has_shop_role(shop, ['owner'])` OR `has_shop_permission(shop, 'refunds.manage')`).
- The function is `SECURITY DEFINER`, uses fixed `search_path = public, pg_temp`, and its execute ACL is limited to `authenticated` (not `PUBLIC` or `anon`).
- The function also uses a per-shop/idempotency advisory lock, locks the sale and sale-item rows, rejects duplicate lines and excess quantities, records the refund and item rows, restores stock and records stock movements, and marks the sale refunded when all quantities are returned.

## Proposed correction (not applied)

Use `sales.total` as the authoritative net sale amount. First require that:
- `sales.subtotal > 0`;
- `sales.total <= sales.subtotal`;
- `round(sales.subtotal - sales.discount, 2) = round(sales.total, 2)`;
- the sum of `sale_items.line_total` equals `sales.subtotal`.

Allocate the sale's net total to lines proportionally to their gross `line_total`. To ensure cents sum exactly, truncate each proportional share to cents, then distribute the remaining cents by descending fractional remainder, with `sale_item.id` as a deterministic tie-breaker. This is the largest-remainder method.

For a partial return, calculate the cumulative target refund for the line:
`round(allocated_net_line_amount * cumulative_returned_quantity / original_quantity, 2)`.
The current refund amount is that target less the amount already refunded for the line. This ensures that the final return of a line reaches exactly its allocated net amount and repeated partial returns cannot exceed it. If historical refunds already exceed the newly calculated allocation, stop and require manual reconciliation rather than silently accepting more refunds.

Preserve the current owner/`refunds.manage` authorization, `auth.uid()` requirement, fixed search path, advisory lock, row locks, idempotency behavior, duplicate-line validation, quantity caps, stock restoration, stock movement audit, and final sale status behavior.

## Arithmetic test performed

A read-only SQL calculation test used synthetic line data (no customer or business records) for:
- tiny cent values;
- odd-cent remainder allocation;
- discounted multi-line sale;
- no-discount sale.

All four scenarios allocated exactly the expected sale total, with no negative line allocation. This validates the allocation arithmetic only; it is not an integration test of the live RPC.

## Security review notes

Supabase Security Advisor currently reports:
- 6 RLS-enabled tables with no policies. Direct table grants for `anon` and `authenticated` were checked and are absent for all six, so they are not directly readable/writable by those roles. Trusted SECURITY DEFINER RPC paths still require individual authorization review.
- A general warning for authenticated execution of SECURITY DEFINER functions. For `refund_sale`, the explicit user and tenant permission checks and authenticated-only execute ACL were verified.
- Leaked-password protection is disabled in Supabase Auth and should be reviewed separately in Auth settings.

## Not yet done

No refund function or schema change has been applied to Production. No staging branch exists. A Supabase development branch is needed for full integration/regression tests; the current estimated branch compute cost is USD $0.01344 per hour while running. Obtain explicit user approval before creating that billable branch.
