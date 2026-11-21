# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Administrators**: work on desktop. Turn Customer emails and Schedules into Routes, assign and notify Operators, manage Customers, users and invoices. Need dense, scannable control surfaces.
- **Operators**: work on a phone, in the van, usually in dark mode. Run a Route through Load, Placement, Pickup and Unload, placing and collecting signs at Stops.
- **Customers** (real-estate agencies): desktop or phone. Check Routes and Stops; `account_owner` users also see invoices and financial metrics, `read_only` users see routes and stops only.

## Product Purpose

Role-based delivery management for sign-run operations: signs are placed on Customer properties, then picked up and returned. Three portals (administrator, operator, customer) share one vocabulary, defined in `CONTEXT.md`. Success is a Route that goes from Customer request to billed Pickup with little re-keying.

## Positioning

Built for sign runs, not generic delivery. Customer emails become Routes through Route Requests and reviewable Schedule Diffs (proposed, never applied unreviewed), and Operators work through a phase-based Sign Run flow in the field.

## Operating Context

- Customers email a Route Request, usually with a Schedule (spreadsheet saved as PDF).
- Administrators print Route Sheets for Operators and use Notify Operator (email plus text).
- Operators work outdoors on a phone while driving, so field screens need large touch targets, high contrast and short labels.
- Hosted on AWS Amplify (Next.js, Cognito, AppSync).

## Capabilities and Constraints

- Authorization is enforced per role at AppSync and in React; UI must never expose restricted data (e.g. no invoice or financial labels or placeholders for `read_only` Customers).
- Domain terms are governed by `CONTEXT.md`; its _Avoid_ lists apply to customer-facing text. Customer copy never mentions operators, staff or other Customers.
- All roles support light and dark modes via the shared resolved theme mode; Operators default to dark.
- Shared shell is `PortalShell` (staff chrome vs customer chrome).

## Brand Commitments

- Product name NullDevice. Logo and assets live in `brand/`.
- `docs/ui-theme-guide.md` is the authoritative product UI reference (role shells, theme semantics, role tokens, permission-specific presentation).

## Evidence on Hand

- `CONTEXT.md` glossary, `docs/adr/`, `docs/ui-theme-guide.md`, `docs/design/screen-map.md`, `brand/`.
- No testimonials or customer proof on hand; do not fabricate.

## Product Principles

1. Each role gets a surface fitted to its situation: dense for administrators, glanceable for Operators, calm for Customers.
2. Use the glossary's words; never rename domain concepts in the UI.
3. Proposals need human review: automation suggests, an administrator accepts.
4. Never show a role what it may not see, including placeholders.
5. Field screens prioritise the current Stop and phase over administration.

## Accessibility & Inclusion

Follow `docs/ui-theme-guide.md`: large touch targets and high contrast in Operator field mode, light and dark support for every role. No formal WCAG level has been stated.
