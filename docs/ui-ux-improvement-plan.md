# UI/UX Improvement Plan

_Compiled 2026-06-12 from a four-track review of the operator, customer, and administrator
portals plus the shared UI foundation (~130 findings). Base: `4-Operator-Enhancements`._

## Cross-cutting themes

1. **Fragmented UI foundation** — the operator portal uses a MUI layout
   (`app/operator/mui-layout.tsx`) while admin/customer use `PortalLayout` + CSS modules;
   theme tokens are duplicated between `app/globals.css` and `app/theme/themeTokens.ts`;
   theme-mode application logic is copy-pasted into all three portal layouts; the admin
   portal reuses the *operator* accent token.
2. **No shared feedback primitives** — destructive actions use native `window.confirm()`
   (route archive, PDF regenerate) or no confirmation at all (mark invoice paid, remove
   customer user); mutations succeed silently (stop completion, route creation); errors log
   to console with nothing user-facing (customer PDF download); success panels auto-close
   in 500ms.
3. **Inconsistent loading/error/empty states** — four loading patterns coexist
   (LoadingSpinner, plain "Loading…" text, "…" ellipsis in stat cards, nothing at all);
   no error state offers a retry; empty states give no next action.
4. **Weak mobile support, worst in the customer portal** — fixed-flex invoice columns with
   no breakpoints, hardcoded grid columns (`1fr 120px 120px 100px` in RouteListItem),
   32px timeline touch targets, a single 820px breakpoint on route detail. Admin invoice
   table forces 920px min-width; operator route grid hardcodes 6 columns.
5. **Accessibility gaps** — `AdminRowMenu` has no keyboard support (no Escape, no focus
   trap); map markers can't be focused; `CustomerCreateForm` inputs lack labels;
   focus-outline colors vary per page; no `prefers-reduced-motion` handling; borderline
   muted-text contrast in light mode.
6. **Confusing role-gated UX** — customer `read_only` users get silently redirected off
   invoice pages with no explanation; the multi-role landing picker doesn't explain roles.

## Phase 1 — Shared primitives

Build once in `app/components/`, then adopt portal-by-portal:

| Primitive | Replaces |
|---|---|
| `ConfirmDialog` | All `window.confirm()` calls and unconfirmed destructive actions (user removal, mark-paid, status changes) |
| `Toast` / notification provider | Silent mutation successes, console-only errors, 500ms auto-closing panels |
| `AsyncState` (loading / error-with-retry / empty-with-CTA) | The four competing loading patterns; gives every fetch error a Retry button and every empty state an action |
| `--nd-focus-outline` token + `prefers-reduced-motion` block in `globals.css` | Per-page accent-colored focus rings; un-suppressible animations |
| `useApplyThemeMode()` hook + single token source | Triplicated theme logic in the three layouts; `themeTokens.ts` / `globals.css` duplication |

## Phase 2 — High-severity portal fixes

**Customer (mobile-first pass):**
- Responsive invoice list (stack/hide columns under 768px)
- Fix `RouteListItem` and route-detail grids for small phones
- 44px timeline touch targets
- Surface PDF download errors to the user
- Replace silent `read_only` redirects with an inline "Invoices are available to account
  owners" message
- Fix the mislabeled "Route Status" stat and the duplicate stats panels on the dashboard

**Operator:**
- Fix route-detail GPS watch / wake-lock cleanup (can keep tracking after unmount —
  battery and privacy issue)
- Toasts for stop complete/skip
- Error boundary around the dynamically-imported Leaflet map (currently fails to a
  permanent loading message)
- Real-time field validation in `StopForm`
- Make the route list grid genuinely responsive

**Admin:**
- Confirmations for all destructive/irreversible actions
- Add the missing customer delete flow
- Retry buttons on fetch errors
- Keyboard support + focus trap in `AdminRowMenu`
- Stop the edit panel auto-closing before its success message is readable
- Labels on `CustomerCreateForm` inputs

## Phase 3 — Consolidation

- Migrate the operator portal off the parallel MUI layout onto `PortalLayout`
- Refactor the admin routes page onto the `AdminDataTable` / `AdminSectionHeader` /
  `AdminFeedbackBanner` suite
- Centralize post-login redirect logic (currently spread across `page.tsx`,
  `ProtectedRoute`, `OperatorRoute`)
- Delete the orphaned `AuthApp.tsx`
- Extract duplicated `formatCurrency` / `formatDuration` / status-class helpers into `lib/`

## Phase 4 — Enhancements

- Admin table sorting + pagination (lists currently fetch and render all rows)
- Search/date filters on routes
- Breadcrumbs on detail pages
- Role descriptions on the multi-role landing picker
- Bulk actions on admin lists

**Order:** Phase 1 → customer mobile pass → operator GPS/feedback fixes → admin
confirmations → Phase 3 → Phase 4. Phase 2 items are independent and parallelizable.
