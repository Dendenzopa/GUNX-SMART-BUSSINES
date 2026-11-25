# GUNX SMART BUSINESS — Dashboard Design Contract

Status: Mandatory / approved by the product owner  
Reference image: `Rashfurnstore Smart Business Dashboards.png` (uploaded in the project conversation on 2026-11-25)

This document is the implementation contract for Dashboard No. 1. Do not replace the approved composition with a generic admin template or a text-only dashboard.

## Shared visual language

- Use the official GUNX SMART BUSINESS logo already stored in `assets/`; do not recreate or substitute the logo.
- Brand palette: deep navy blue for the app/header/navigation, emerald green for sales and success states, metallic gold for important highlights, and white/light surfaces for content.
- Use a polished mobile-first layout with rounded cards, clear hierarchy, readable typography, subtle borders/shadows, and colorful functional icons.
- Keep the business identity (business logo, business name, branch/location and signed-in user) visible in the top identity area.
- All amounts use Tanzanian shillings (TZS) and all business-specific values must come from the active tenant and current user permissions.
- Sample business name, product names, prices, stock levels, sales figures, dates and people in the reference image are examples only. Never hard-code them as production data.
- Preserve tenant and branch isolation. A user must not see another business's or unauthorized branch's data.

## Owner / Boss dashboard — match the LEFT screen

Required composition and order:

1. Navy top bar with menu control, official GUNX branding, notification indicator and owner profile.
2. Business identity hero: business logo, business name, category/status, location, welcome text and owner name; use a suitable business cover image where configured.
3. Three prominent KPI cards:
   - Today's sales (TZS), including trend/percentage when supported by data.
   - Current stock value or stock quantity, with a clear unit/label.
   - Active employee count.
4. Main content row:
   - Sales summary chart with a selectable reporting period and readable time axis.
   - Quick actions for adding products, managing employees, viewing reports and stock/debit actions according to permissions.
5. Four large shortcut tiles for POS sales, stock, employees and reports.
6. Branded bottom banner/identity footer, adapted to available screen height.

The owner dashboard must emphasize business performance, oversight and quick management actions. It may show only the tenant(s), branches and metrics the authenticated owner is authorized to access.

## Employee dashboard — match the RIGHT screen

Required composition and order:

1. Navy top bar with menu control, official GUNX branding, notification indicator and employee profile.
2. Business identity hero with business logo/name, branch/location, verification/status indicator and a personalized greeting.
3. Three KPI cards:
   - Today's sales (TZS), scoped to the employee's permitted activity.
   - Products added or relevant operational count, only where the role can access it.
   - Stock visibility/status, respecting stock permissions.
4. Inventory section header with product search.
5. Product cards with image, product name, selling price and available stock; show only products the employee is allowed to view or sell.
6. Fast-sale panel with cart lines, quantities, total and a prominent checkout action. Checkout must use the existing safe sale flow and must not bypass stock, price, payment or idempotency checks.
7. Important information panel showing current date/time, branch and business identity when available.
8. Bottom navigation for Home, Sales, Stock, Reports and More, filtered by the employee's role permissions.

The employee dashboard must prioritize daily operations and must not expose owner-only profit, staff administration, subscription, cross-branch or financial controls.

## Role and data rules

- Keep the Super Admin dashboard separate. It is the platform-level workspace and must not be visually or functionally conflated with the business owner or employee dashboards.
- Resolve the authenticated user's role and permitted shop/branch scope from trusted server/database records. Do not use a client-side role toggle as authorization.
- Owner and employee dashboards share brand components but have distinct information architecture and permission-filtered navigation.
- Demo data may be used only in an explicitly labelled demo state. Production dashboard figures must be loaded from the active business data source.
- Loading, empty, offline, error and restricted-permission states must be designed rather than silently showing fabricated values.
- Preserve existing POS checkout, stock movement, offline queue, reporting and tenant security behavior when changing presentation.

## Responsive behavior and acceptance criteria

- On phones, preserve the visual order and card hierarchy of the reference; use vertical scrolling where needed and keep primary actions reachable.
- On tablets/desktops, reflow the same components into balanced columns without changing their priority or hiding required information.
- Icons and labels must remain legible; no clipped KPI values, overlapping cards or horizontal overflow in the normal mobile layout.
- A dashboard is accepted only when the correct role sees the matching composition, tenant/branch data is scoped correctly, and all visible actions obey server-enforced permissions.
