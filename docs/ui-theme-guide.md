# NullDevice UI and Theme Guide

This guide is the authoritative product UI reference for the application. It supersedes informal brand notes for app behavior, role shells, theme semantics, and permission-specific presentation.

## Product Roles

### Operator Field Mode

Operators use the app on a phone while driving and should default to dark mode. Active routes must prioritize field operation over administration:

- Show the map, current vehicle location, highlighted next stop, current phase, primary stop action, and the next two upcoming stops.
- Hide route setup, planning, edit, route summary, and route start controls while a route is in progress.
- Use large touch targets, high contrast text, and short labels.
- Treat notes and photos as route-level finalisation inputs, not per-stop driving tasks.
- One route has two execution phases: `placement` followed by `pickup`.
- Do not allow the active phase to end until required stops for that phase have been actioned.

### Administrator Console

Administrators work from desktop and need dense, scannable control surfaces:

- Keep frequent actions visible: create route, create invoice, view route, email invoice, mark paid.
- Move lower-frequency actions into row or page menus: delete route, delete invoice line, delete invoice, archive route, regenerate invoice.
- Destructive and replacement actions require confirmation.
- Tables should support fast scanning with stable columns, status badges, row menus, empty states, and feedback banners.

### Customer Owner Portal

Customer owners work primarily on desktop. They can view routes, invoices, existing invoice documents, financial metrics, and non-financial metrics.

- Present metrics calmly with clear hierarchy.
- Avoid neon color mixing across multiple equal-priority cards.
- Existing invoice documents should be viewable and downloadable.
- Customer-facing invoice templates must align with the customer portal theme.

### Customer View-Only Route Tracker

View-only customer users may use desktop or phone. They only see route information:

- Show routes, stops, map, route status, and non-financial metrics.
- Do not show invoices, invoice labels, revenue, balances, financial averages, or restricted financial placeholders.
- Prefer a simplified route tracker over the full owner dashboard.

## Theme Rules

- Dark mode is the default operator experience.
- All roles must support light and dark modes through the shared resolved theme mode.
- MUI, Amplify UI, and CSS-module surfaces must read from the same resolved mode.
- Do not hard-code a role shell to dark or light when shared theme context is available.
- Global typography and button rules must not override MUI or Amplify component states.

## Role Tokens

Use role-level semantic variables when styling shared components:

- `--nd-role-accent`
- `--nd-role-accent-dim`
- `--nd-role-surface`
- `--nd-role-focus-ring`
- `--nd-role-nav-active-bg`
- `--nd-role-nav-active-fg`

Role containers should set `data-role="operator"`, `data-role="admin"`, or `data-role="customer"` where practical.

## Map Behavior

Operator active routes use the existing Leaflet stack:

- Show current vehicle location when available.
- Highlight the active next stop marker.
- Distinguish the next two upcoming stops.
- Fit the viewport around current position, next stop, and upcoming stops where possible.
- Preserve heading-up orientation based on device movement.
- Use dark-friendly map defaults for operator field use.

## Component Primitives

Prefer reusable primitives and semantic classes for:

- KPI cards
- Period selectors
- Panels
- Primary and secondary action buttons
- Status badges
- Tables
- Field groups
- Empty states
- Feedback banners
- Row context menus

Use cards only for repeated items, modals, or genuinely framed tools. Avoid nested cards and marketing-style hero composition in operational workflows.

## Customer Portal Invoice Template

Invoice PDFs are customer-facing UI artifacts even when generated from administrator workflows.

- Align invoice documents to the customer portal theme: calm surfaces, restrained cyan/blue accenting, clear hierarchy, and minimal neon.
- Use NullDevice brand assets consistently, but keep billing details more prominent than decorative branding.
- Prioritize invoice number, status, total amount due, billing period, line items, payment details, route stop details, and route map.
- Preserve A4 print/PDF legibility with high contrast text, generous table spacing, and clear section separation.
- Use the same status semantics as the portal; reserve red for overdue, failed, or destructive states.
- Do not expose invoice documents or financial content to customer view-only users.

## Accessibility

- Active navigation must expose `aria-current="page"`.
- Important work areas should use landmarks or labelled regions.
- Phone field controls should meet at least 44px touch target height; active operator actions should be larger.
- Text must not clip or overlap at common mobile widths: 390x844, 393x852, 412x915, and 430x932.
- Use visible focus rings derived from role tokens.

## QA Checklist

Operator:

- Map visible in active field mode.
- Current location visible when GPS is available.
- Next marker highlighted.
- Next two stops visible.
- Primary action reachable.
- Dark mode legible at night.
- No route setup controls in active field mode.

Admin:

- Frequent actions visible.
- Low-frequency actions in menus.
- Destructive or replacement actions confirmed.
- Tables scan cleanly on desktop.

Customer:

- Owner sees financial documents and metrics.
- View-only users never see invoices or financial metrics.
- View-only route tracker works on desktop and mobile.
