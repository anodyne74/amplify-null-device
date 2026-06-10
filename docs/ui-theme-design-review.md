# UI and Theme Design Review

Reviewed: 2026-06-11  
Scope: Static review of the Next.js application UI, theme tokens, layout shells, and representative customer, operator, administrator, and auth surfaces.

## Review Limits

This workspace does not currently include `node_modules`, so I did not run the app or capture browser screenshots. The findings below are based on source inspection. A follow-up visual pass should install dependencies, run the app, and capture desktop and mobile screenshots for `/`, `/administrator`, `/operator/dashboard`, `/operator/routes/detail`, `/customer/dashboard`, `/customer/routes`, and `/customer/invoices`.

## Confirmed Role Requirements

### Operator

- Primary device: mobile phone.
- Operating context: field delivery, ideally used only while parked.
- Theme requirement: support light and dark mode, defaulting to dark.
- Night legibility is critical.
- The map and next stops are the primary interface while a route is active.
- The active route view should show the vehicle's current location, the next stop, the highlighted next map marker, and at least the next two upcoming stops.
- Full turn-by-turn navigation is not required for the first version; a Google Maps-like orientation with current location, next marker, and upcoming stops is enough.
- Offline or poor-signal behavior is useful, but not critical for the first design pass.
- The app collects route execution data for invoicing and metrics.
- Once a route is in progress, route summary and start controls can be hidden.
- Every stop must be actioned before the route can be ended.
- Routes are one route with two phases: placing signs first, then picking signs up the following day.
- Notes and photos are only required at route-level finalisation.

### Administrator

- Primary device: full-size desktop.
- Workflow: create and manage routes, invoices, customers, users, and operational data.
- Visual polish still matters.
- Frequently used actions should be prominent.
- Less common actions, such as importing historical data and regenerating invoices, can move into context menus.
- Confirmation dialogs are required for deleting routes, deleting invoice lines, deleting invoices, archiving routes, and regenerating invoices.

### Customer

- Customer owner primarily works from desktop.
- Customer team members may use desktop or mobile.
- Customer owners can view routes, invoices, financial metrics, and operational metrics.
- Customer owners can view and download existing invoice documents, but do not need export tooling for custom metrics or new invoice generation.
- Customer-facing invoice PDFs are part of the customer portal experience and should align with the customer portal theme.
- Customer owners can grant view-only access to team members.
- View-only users should see route information and non-financial metrics only.
- View-only mobile users should get a simplified route tracker showing the route, stops, map, and route status.
- Invoices and billing data must be hidden from non-owner customer users.
- Customer portal should feel intuitive, professional, visually pleasing, and informative.

## Resolved Design Decisions

- The application should support both light and dark themes, with dark as the default, especially for operator use.
- The operator active-route experience should prioritize current location, next marker, map orientation, and the next two stops over turn-by-turn route-line complexity.
- Offline support is a later enhancement, not a blocker for the current UI redesign.
- Route phase modeling should remain one route with place and pickup phases, not separate route records.
- Route finalisation should collect notes/photos at the route level only.
- Admin destructive or high-impact context-menu actions require confirmation.
- Customer owners should view/download existing invoice documents only.
- Invoice templates should be treated as customer-facing UI artifacts, not generic admin exports, and should visually align with the customer portal.
- Customer view-only users need a simplified route tracker, not the full dashboard.
- The authoritative visual/theme guide should be built in this codebase; `brand/PDF Guideline.pdf` is not authoritative for future product UI decisions.

## Executive Summary

The application has a meaningful design-system foundation: shared CSS variables, TypeScript palette tokens, Amplify theme integration, MUI theme integration, role-specific accents, and reusable layout primitives. That is the best part of the current UI architecture.

The main design problem is not lack of styling. It is fragmentation. The app has at least three visual systems operating at once: CSS-module portal screens, a separate MUI operator shell, and Amplify-auth screens. They share some token names, but not always the same behavior, theming, component rhythm, or role language.

The current aesthetic reads as a dark, neon-accented operations dashboard. That can work for NullDevice if the desired tone is technical and energetic. It becomes less convincing on customer-facing and administrative screens because accent colors are overused, red is used for non-danger metrics, typography leans heavily on display/mono styling, and navigation branding is understated.

## Strengths

- Theme tokens exist in both CSS and TypeScript, with a documented strategy in `app/theme/README.md`.
- The global token set in `app/globals.css` covers canvas, surfaces, text hierarchy, borders, semantic statuses, layout spacing, radius, transitions, and role accents.
- Amplify UI is themed through `app/amplify-theme.ts`, so auth styling is not left as a vendor default.
- Operator screens use MUI with a custom `operatorTheme`, which is a practical choice for complex mobile controls.
- The app has a clear role model: administrator, operator, customer, and pending approval.
- CSS modules generally use tokens rather than arbitrary local colors.
- Many interaction targets in operator route detail have been adjusted toward 44px minimum hit areas, which is appropriate for field use.

## Findings

### 1. Light/dark theming is architected but not complete

Severity: High  
Evidence:

- `app/components/AmplifyThemeProvider.tsx` stores `nd-theme-mode`, resolves system/light/dark, and applies `data-theme`.
- `app/components/ThemeModeSelect.tsx` exists, but the visible public and portal shells do not appear to render it.
- `app/page.module.css:83` defines `.publicThemeToggle`, and `app/pending-approval/page.module.css:9` defines `.themeToggle`, but neither class is used by the inspected pages.
- `app/operator/mui-theme.ts:4` binds `operatorTheme` to `ndThemePalettes.dark`.
- `app/operator/mui-theme.ts:13` hard-codes `palette.mode` to `'dark'`.
- `app/administrator/layout.tsx`, `app/operator/layout.tsx`, and `app/customer/layout.tsx` each duplicate `applyThemeMode` instead of using one shared theme mechanism.

Impact:

Light mode can partially apply through CSS variables while MUI components remain dark. This creates mismatched surfaces, text, dialogs, buttons, and app bars. Users may also have a stored theme preference with no obvious way to change it.

Recommendation:

- Complete product support for light and dark mode, with dark as the default for operators.
- Make the MUI theme derive from the resolved theme mode or use CSS variables throughout MUI overrides.
- Render `ThemeModeSelect` in one predictable place, likely the portal user section and public login footer/header.
- Move duplicated role-layout theme application into `AmplifyThemeProvider` or a shared hook.

### 2. Role identity is blurred, especially administrator vs operator

Severity: High  
Evidence:

- `app/administrator/layout.tsx` renders `PortalLayout` with `variant="operator"`, so admin inherits the operator amber identity.
- `app/dashboard.module.css` is shared by administrator, customer, and operator dashboards.
- Customer dashboard metrics use cyan, amber, green, and danger classes from the shared dashboard module rather than a customer-specific visual hierarchy.

Impact:

The role surfaces are functionally distinct, but visually they collapse into a single neon dashboard language. Customer pages can feel internal-tool-like, and administrator pages can feel like operator pages. This makes the UI less self-orienting.

Recommendation:

- Introduce role-level semantic tokens such as `--nd-role-accent`, `--nd-role-accent-dim`, and `--nd-role-sidebar`.
- Give administrator either a distinct role accent or intentionally document that it uses the operator accent.
- Separate metric color intent from role accent. For example, completed, active, outstanding, neutral, warning, and danger should not be chosen only for visual variety.

### 3. Navigation and branding underuse the available brand assets

Severity: Medium
Evidence:

- `app/components/PortalLayout.module.css:85` sets `.brandTitle` to `display: none`.
- The sidebar only shows `app/icon.svg` and a small portal subtitle, while the full logotype is used mainly on the auth page.
- `app/components/PortalLayout.module.css:143` sets sidebar nav icons to `2.5rem`, with small labels underneath.
- `app/components/PortalLayout.tsx:69` uses the raw `☰` character for the mobile menu toggle.
- `app/components/PortalLayout.tsx:103` renders nav links without an active state.

Impact:

The portal shell lacks a confident brand anchor and active navigation feedback. Large stacked icons can feel toy-like or kiosk-like in a dense operations product, while small labels reduce scan speed.

Recommendation:

- Show either the NullDevice wordmark or a compact "NullDevice" brand title in the portal sidebar.
- Add active nav states in `PortalLayout`, similar to the operator MUI layout.
- Replace the raw hamburger glyph with a real icon from the existing icon set.
- Consider a horizontal icon plus label nav row for admin/customer desktop, with the current stacked pattern reserved only if intentionally icon-first.

### 4. Global element styles are doing too much work

Severity: Medium  
Evidence:

- `app/globals.css:209` sets `body` to `justify-content: center`.
- `app/globals.css:250` through `app/globals.css:254` applies global heading font and negative letter spacing.
- `app/globals.css:292` applies a strong global button style, including display font and letter spacing.

Impact:

Global button and heading styles can leak into Amplify, MUI, forms, dialogs, and page-local components in ways that are hard to reason about. This is especially risky in a multi-shell app using CSS modules, Amplify, and MUI together.

Recommendation:

- Keep global styles to resets, fonts, tokens, and basic text color/background.
- Move button variants into reusable components or CSS utility classes.
- Avoid global heading letter spacing rules; define heading styles at shell/component level.
- Remove body centering unless the app intentionally wants every top-level page vertically centered.

### 5. Component styling is split across inline styles, CSS modules, and vendor themes

Severity: Medium  
Evidence:

- `app/components/KpiCard.tsx:16`, `:27`, `:38`, `:51`, `:64`, and `:78` use inline style objects.
- `app/components/PeriodSelector.tsx:11`, `:24`, and `:38` use inline style objects.
- `app/customer/dashboard/page.tsx:484`, `:493`, `:525`, `:537`, `:541`, and `:543` use inline layout styles, including `display: 'contents'`.
- Administrator and operator route detail CSS modules duplicate many concepts but diverge in hit area and spacing. For example, admin route detail has compact `padding: 6px 12px` buttons at `app/administrator/routes/detail/page.module.css:48` and `:63`, while operator route detail adds `min-height: 44px` at `app/operator/routes/detail/page.module.css:48` and `:66`.

Impact:

The UI will be harder to theme, audit, and evolve. Inline styles also make it more difficult to implement responsive states, focus states, and role variants consistently.

Recommendation:

- Move `KpiCard` and `PeriodSelector` to CSS modules or shared design primitives.
- Replace customer dashboard inline layout with classes from `dashboard.module.css` or shared layout utilities.
- Extract shared route-detail button/card/badge patterns, then layer admin/operator differences intentionally.

### 6. Accent colors are overused and sometimes semantically misleading

Severity: Medium  
Evidence:

- Dashboard metrics freely mix `.cyan`, `.green`, `.amber`, and `.danger`.
- "Completed Routes" and "Total Signs" can be styled with the danger color in administrator and customer dashboards.
- Auth primary button hover is overridden globally under auth card styling at `app/page.module.css:205` to `var(--nd-logo-secondary)`, while the primary auth button itself is amber at `app/page.module.css:175`.

Impact:

Users may learn the wrong meaning for colors. Red should normally indicate an error, overdue item, destructive action, or urgent attention. Using it for completed or neutral totals weakens alert salience.

Recommendation:

- Reserve danger red for failures, overdue states, destructive actions, and unpaid/critical balances.
- Use neutral text for most metric values, with a single accent for the role or for positive/negative deltas.
- Align auth button hover with the button's primary color family instead of switching to logo purple.

### 7. Typography creates personality, but it may not match operational density

Severity: Medium  
Evidence:

- The app uses Comfortaa for display, Inter for body, and JetBrains Mono for numeric/technical content.
- `app/dashboard.module.css` uses mono for large metric values and uppercase, letter-spaced labels.
- Auth and role-selection screens also lean on mono and uppercase styling.

Impact:

Comfortaa gives the product a rounded, friendly tech character. JetBrains Mono makes dashboards feel technical. That combination is distinctive, but heavy mono/uppercase usage can reduce readability in operational views with lots of dense data.

Recommendation:

- Keep mono for IDs, route codes, timestamps, and maybe key metrics.
- Use body font for labels and helper text to improve scan speed.
- If the brand guidelines favor the rounded identity, keep Comfortaa for page titles and brand moments, not every control.

### 8. Mobile field workflows need visual verification before more UI changes

Severity: Medium  
Evidence:

- Operator route detail has extensive responsive CSS, including special breakpoints for 390px to 430px widths and max heights around 940px.
- `app/operator/routes/detail/page.module.css` has many dense grid transitions and compact button variants.
- `app/components/PortalLayout.tsx:49` reads `window.innerWidth` during render and also injects dynamic CSS at `app/components/PortalLayout.tsx:146`.

Impact:

The operator route execution screen is likely the most risk-sensitive UI. It has many responsive branches and likely depends on exact viewport behavior. Without screenshots and touch testing, it is easy to regress map height, stop-card density, action button reachability, or overlay behavior.

Recommendation:

- Add a Playwright screenshot pass for operator route detail at common phones: 390x844, 393x852, 412x915, 430x932, plus tablet and desktop.
- Prefer CSS-driven responsive behavior over `window.innerWidth` in render.
- Add explicit visual QA criteria for route execution: map visible, current stop visible, primary action reachable, no text clipping, no overlapping controls.

### 9. Accessibility and interaction polish are inconsistent

Severity: Medium  
Evidence:

- `app/operator/mui-layout.tsx:243` renders a menu `IconButton` without an `aria-label`.
- `PortalLayout` nav links have `title` attributes, but no active state or `aria-current`.
- Custom links and buttons in CSS modules often rely on hover opacity changes, with inconsistent focus-visible treatment.
- Some admin buttons are smaller than the 44px touch target pattern used in operator screens.

Impact:

Keyboard and screen-reader users will get a less polished experience, and touch users may encounter smaller targets outside the operator-specific screens.

Recommendation:

- Add `aria-label` to icon-only buttons.
- Add `aria-current="page"` to active nav links.
- Standardize focus-visible styles for links, custom buttons, cards, and row menus.
- Use 44px minimum target size for primary controls across all roles unless the screen is explicitly desktop-only.

### 10. The auth screen has the clearest brand moment, but it is not fully connected to the portal experience

Severity: Low  
Evidence:

- `app/page.tsx:77` uses `/logo.svg`, giving the login page a strong brand signal.
- Portal shells use only `app/icon.svg`.
- `.publicThemeToggle` exists in `app/page.module.css:83` but is not rendered.
- Auth styling mixes logo purple, operator amber, and Amplify overrides in `app/page.module.css:175` through `app/page.module.css:205`.

Impact:

The user gets a branded entry point, then a more anonymous portal shell. The auth screen also hints at theme configurability that is not visible.

Recommendation:

- Carry a compact wordmark or brand title into authenticated shells.
- Make auth button states use a single intent color sequence.
- Add or remove the public theme toggle intentionally.

### 11. Invoice PDFs are customer-facing but use a separate visual language

Severity: Medium
Evidence:

- `app/administrator/invoices/hooks/useInvoiceDocumentActions.ts` generates invoice PDFs from the administrator invoice flow, but those PDFs are viewed and downloaded by customer owners in the customer portal.
- The generated invoice template uses hard-coded PDF colors such as slate header, pale blue accent panels, and Helvetica text rather than customer portal theme semantics.
- The customer invoice detail UI in `app/customer/invoices/[id]/_InvoiceDetailContent.module.css` uses shared customer portal surfaces, text tokens, status tokens, and portal actions.

Impact:

The invoice document is an extension of the customer portal, but it can feel like a separate back-office export. This weakens customer trust and makes the most financially sensitive artifact feel less connected to the product experience.

Recommendation:

- Redesign the invoice PDF template to align with the customer portal theme while preserving print/PDF legibility.
- Use the customer theme direction: calm surfaces, restrained cyan/blue accenting, clear hierarchy, and minimal neon.
- Keep financial content professional and high contrast: invoice number, due/paid status, total amount due, billing period, line items, route stop details, payment details, and route map.
- Use NullDevice brand assets consistently, but avoid oversized decorative branding that competes with billing details.
- Reserve red only for overdue/error states; paid/sent/pending states should follow the same status semantics used in the portal.
- Treat the template as a responsive document artifact: it should render cleanly on A4 PDF, print, and browser PDF preview.

## Recommended Design Direction

The strongest direction is one shared NullDevice design language with three role-specific shells:

- Operator Field Mode: mobile-first, dark-default, high contrast, large controls, map-led, minimal chrome, designed for parked use and night legibility.
- Admin Console: desktop-first, polished, dense but readable, optimized for repeated management actions, tables, forms, bulk workflows, and context menus for lower-frequency operations.
- Customer Portal: professional and calmer than the internal tools, visually pleasing metrics, clear route/invoice access, customer-portal-aligned invoice templates, and a simplified mobile route tracker for view-only team members.

Theme guidance:

- Support both light and dark mode, but default to dark for operators.
- Use the NullDevice purple/blue gradient for brand identity: logo, selected shell moments, and high-value signifiers.
- Use amber for operator execution actions, cyan or blue for customer route visibility, and a distinct admin accent or restrained neutral/purple treatment for administrator.
- Reduce KPI value color variety. Let hierarchy, spacing, labels, charts, and trend indicators carry most of the information.
- Reserve danger red for true risk states: unpaid/overdue, destructive actions, failures, missed stops, and validation errors.
- Replace scattered inline styles with reusable primitives: `PageHeader`, `SurfacePanel`, `KpiCard`, `ActionButton`, `StatusBadge`, `FieldGroup`, `DataTable`, and `RoleShell`.
- Treat the operator active route screen as the highest-priority redesign target.
- Build the authoritative product UI and theme guide in this codebase rather than treating the existing brand PDF as binding.

## Suggested Next Steps

1. Run a browser screenshot audit after installing dependencies.
2. Create the authoritative UI/theme guide for operator, administrator, and customer shells.
3. Redesign the operator active route screen around map, current location, next stop, and next two upcoming stops.
4. Make MUI theme responsive to the resolved theme mode or CSS variables.
5. Refactor `KpiCard` and `PeriodSelector` away from inline styles.
6. Add active nav state and `aria-current` to `PortalLayout`.
7. Normalize color semantics so red is reserved for true danger/attention states.
8. Move low-frequency admin actions into row or page-level context menus, with confirmations for route deletion, invoice deletion, invoice-line deletion, route archiving, and invoice regeneration.
9. Improve the customer portal information architecture, including owner billing visibility, the simplified view-only route tracker, and the generated invoice PDF template so it matches the customer portal theme and customer owner billing experience.
10. Create visual regression coverage for the operator route execution workflow.
