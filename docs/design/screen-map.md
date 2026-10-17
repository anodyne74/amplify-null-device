# Design screen map

Which design screen each page was built from, and where the two part ways. The designs are explorations in Claude Design; this repo is the source of truth for behaviour and wording (`CONTEXT.md`, `docs/ui-theme-guide.md`). The design system supplies the visual language only. Read a row as "last checked", not "kept in step automatically".

**Last checked:** 2026-10-17, against `development` at `2127032`. **Method:** source files and navigation only. Nothing was rendered or screenshotted, so layout, spacing and visual finish are not recorded here.

## Where the designs live

| Design file | Claude Design project | Covers |
|---|---|---|
| Null Device Design System | `f4bdc4ad-fe29-40b5-bae3-e58175b08007` (design system) | Tokens, 21 components, kits for auth, customer portal, operator mobile, email, plus an invoice template |
| `Login Landing.dc.html` | `8f77c0f5-cf03-4c40-b5ab-f946a9f8ddbf` | Sign-in and its states |
| `Sign Delivery Portal.dc.html`, `Screen Board.dc.html` | `52e22269-0283-4249-8a1e-133ad373dbe4` | Portal screens for three personas; service calendar frames |
| `Driver Sign Run.dc.html` | `1a2d68a0-3504-4a90-bb8c-ac4591859c96` | The six operator Sign Run screens |

The design system was built from the brand guideline, not from product screens; its own readme calls everything beyond the brand core "a reasoned construction, not a recreation". Its last recorded sync with this repo was 2026-08-16.

## Status

- **Built**: the page exists and follows the design's content and structure, as far as source shows.
- **Renamed**: built, under a different name.
- **Diverges**: built differently on purpose; the reason is in the Notes column.
- **Not built**: designed, no page.
- **Not designed**: a page the app has and the design doesn't.

## Login (`Login Landing.dc.html`)

| Design | Page | Status | Notes |
|---|---|---|---|
| 1a Split hero | `app/page.tsx` | Built | Same fields, "Keep me signed in", "Forgot password?", support line, gradient hero panel, form pinned to the light theme. |
| 1d Wrong password | `app/page.tsx` | Diverges | Design says "Two tries left before we lock the account"; Cognito gives no tries-left count, so the page says "That email or password doesn't match. Try again, or reset your password." (also doesn't confirm which of the two was wrong). |
| 1e Sign-in link sent | none | Not built | "Email me a sign-in link instead" needs a passwordless Cognito setup; not scoped. |
| 1f Pending approval | `app/pending-approval/page.tsx` | Built | Wording close; the design's three-step status list was not compared. |
| 1g Mobile | `app/page.tsx` (`@media (max-width: 900px)`) | Built | Hero drops to a header band. |
| Hero copy | `app/page.tsx` (`HERO_FEATURES`) | Diverges | Design names operators and staff ("Coordinate operators in the field", "customers · operators · null device staff"). Customer-facing copy never mentions operators or staff (`CONTEXT.md`, Customer User), so the page speaks of properties, routes and invoices. The design should change. |

## Portal (`Sign Delivery Portal.dc.html`)

Design personas map to the customer portal's two roles: customer admin is an Account Owner, customer user is the read-only role.

| Design screen | Page | Status | Notes |
|---|---|---|---|
| admin-overview | `app/administrator/page.tsx`, `dashboard/` | Built | Not compared in detail. |
| admin-customers | `app/administrator/customers` | Built | |
| admin-users ("Customer Users") | `app/administrator/users` | Built | Account Owner rules in `lib/customerUserMembership.ts`. |
| admin-routes, admin-route | `app/administrator/routes`, `routes/detail` | Built | Plus `new`, `edit` and `sheet` (Route Sheet), which the design doesn't show. |
| admin-drivers, admin-driver | `app/administrator/drivers` | Renamed | "Operators" in the nav; one page, no separate detail route. |
| admin-calendar ("Service calendar") | `app/administrator/calendar` | Built | |
| admin-invoices, admin-invoice | `app/administrator/invoices`, `invoices/generate` | Built | Detail view not compared. |
| admin-payments | `app/administrator/payment-details` | Renamed | "Payment Details". |
| admin-invite, ca-invite | `app/administrator/users`, `app/customer/users` | Built | Invite flows live on the users pages. |
| ca-dash, cu-dash | `app/customer/dashboard` | Built | One page for both roles; the read-only role sees no cost. |
| ca-billing ("Billing history") | `app/customer/invoices`, `invoices/[id]` | Renamed | "Invoices". Account Owners only. |
| ca-users | `app/customer/users` | Built | |
| ca-orders, cu-orders ("Standing orders") | `app/customer/route-defaults` | Renamed | "Route Defaults" (`CONTEXT.md`); Standing Pickup Day is part of it. |
| ca-calendar ("Closure calendar"), cu-calendar | `app/customer/calendar` | Renamed | "Calendar". |
| ca-details ("Billing details") | `app/customer/billing-details` | Built | |
| cu-routes, cu-route | `app/customer/routes`, `routes/[id]` | Built | Customer instructions are on the Route detail page. |
| cu-mobile ("On the road") | none | Not built | No phone-specific screen for adding an instruction; Route detail is the only place. |
| (none) | `app/administrator/route-requests`, `locations`, `property-history`, `payouts`, `feature-flags`, `settings` | Not designed | Built after the design. |
| (none) | `app/customer/property-history`, `help`, `settings` | Not designed | |

## Driver Sign Run (`Driver Sign Run.dc.html`)

| Design | Page | Status | Notes |
|---|---|---|---|
| 1a Today | `app/operator/dashboard`, `routes` | Built | Not compared in detail. |
| 3a Phase 1 Load | `app/operator/routes/load` | Built | |
| 2a Phase 2 Placement | `app/operator/routes/placement` | Built | Per-agent badges present. |
| 4a Phase 3 Pickup | `app/operator/routes/pickup` | Built | One-tap missing sign, capped at the Stop's sign count. |
| 3b Phase 4 Unload | `app/operator/routes/unload` | Built | |
| 3c Finalise | `app/operator/routes/finalise` | Built | |
| (none) | `app/operator/routes/detail`, `calendar`, `payouts`, `settings` | Not designed | |

## Keeping this current

- When a change touches a page in this table, update its row and the **Last checked** line in the same change.
- A divergence someone might "fix" later belongs in an ADR as well; link it from the Notes column.
- Re-run the comparison after a large feature, and after the design project changes. The design system's tokens can be checked against `app/components/ui/tokens.css` with the drift check (planned).
