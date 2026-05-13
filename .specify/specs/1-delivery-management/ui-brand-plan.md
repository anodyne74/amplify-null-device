# NullDevice UI Brand Alignment Plan

**Feature**: UI Brand System Migration  
**Status**: Planning  
**Scope**: Full front-end visual overhaul — no backend changes  
**Constitution alignment**: Removes inline styles (VI constraint), enforces component architecture (III), maintains TypeScript strict mode (II)

---

## 1. NullDevice Brand Design Token Proposal

### Philosophy

The NullDevice aesthetic is drawn from `/dev/null` — a void that quietly consumes everything. Visually this translates to: deep black backgrounds, sparse neon-on-dark contrast, monospace type, and a terminal/operator-console feeling. There is no decoration that does not serve function.

### Color Tokens

```css
/* app/globals.css — :root custom properties */

/* --- Backgrounds --- */
--nd-bg-void:        #0a0a0a;   /* Page canvas — true near-black */
--nd-bg-surface:     #111111;   /* Cards, panels, sidebar */
--nd-bg-elevated:    #1a1a1a;   /* Modals, dropdowns, hover states */
--nd-bg-overlay:     rgba(0, 0, 0, 0.72);  /* Mobile drawer overlay */

/* --- Borders / dividers --- */
--nd-border-default: #2a2a2a;   /* Subtle structural divider */
--nd-border-active:  #3a3a3a;   /* Focused / hovered border */

/* --- Accent — Neon Green (primary) --- */
--nd-accent:         #00ff88;   /* Primary CTA, active nav, key stats */
--nd-accent-dim:     #00cc6a;   /* Hover on accent */
--nd-accent-glow:    rgba(0, 255, 136, 0.15);  /* Glow / focus ring backdrop */

/* --- Portal differentiation (secondary accents) --- */
/* Customer portal: electric cyan — implies information, data flow */
--nd-accent-customer:       #00e5ff;
--nd-accent-customer-dim:   #00b8d9;
--nd-accent-customer-glow:  rgba(0, 229, 255, 0.12);

/* Operator portal: amber — implies control, authority, caution */
--nd-accent-operator:       #ffb300;
--nd-accent-operator-dim:   #e6a000;
--nd-accent-operator-glow:  rgba(255, 179, 0, 0.12);

/* --- Text --- */
--nd-text-primary:   #e8e8e8;   /* Body copy */
--nd-text-secondary: #888888;   /* Labels, captions, muted */
--nd-text-disabled:  #444444;   /* Disabled states */
--nd-text-inverse:   #0a0a0a;   /* Text on accent backgrounds */
--nd-text-danger:    #ff4d4d;   /* Errors, destructive actions */
--nd-text-success:   #00ff88;   /* Positive confirmations */
--nd-text-warning:   #ffb300;   /* Warnings */

/* --- Status badge colors --- */
--nd-status-active:    #ffb300;  /* In progress */
--nd-status-completed: #00ff88;  /* Done */
--nd-status-planned:   #00e5ff;  /* Scheduled */
--nd-status-archived:  #ff4d4d;  /* Closed / removed */
--nd-status-default:   #888888;  /* Unknown */
```

### Typography Tokens

```css
/* --- Type --- */
--nd-font-mono:   'JetBrains Mono', 'Fira Code', 'Cascadia Code', ui-monospace, monospace;
--nd-font-sans:   'Inter', system-ui, -apple-system, sans-serif;

/* Headings use monospace; body uses sans (or mono if full terminal feel preferred) */
--nd-font-heading: var(--nd-font-mono);
--nd-font-body:    var(--nd-font-sans);

/* --- Scale --- */
--nd-text-xs:   0.75rem;   /* 12px — labels, badges */
--nd-text-sm:   0.875rem;  /* 14px — secondary copy */
--nd-text-base: 1rem;      /* 16px — body */
--nd-text-lg:   1.125rem;  /* 18px — nav items */
--nd-text-xl:   1.25rem;   /* 20px — section titles */
--nd-text-2xl:  1.5rem;    /* 24px — page headings */
--nd-text-4xl:  2.25rem;   /* 36px — stat numbers */

/* --- Weight --- */
--nd-font-normal:   400;
--nd-font-medium:   500;
--nd-font-semibold: 600;
--nd-font-bold:     700;
```

### Spacing Tokens

```css
/* --- Spacing (4px base grid) --- */
--nd-space-1:  0.25rem;   /* 4px */
--nd-space-2:  0.5rem;    /* 8px */
--nd-space-3:  0.75rem;   /* 12px */
--nd-space-4:  1rem;      /* 16px */
--nd-space-5:  1.25rem;   /* 20px */
--nd-space-6:  1.5rem;    /* 24px */
--nd-space-8:  2rem;      /* 32px */
--nd-space-10: 2.5rem;    /* 40px */
--nd-space-12: 3rem;      /* 48px */
```

### Shape & Motion Tokens

```css
/* --- Radii --- */
--nd-radius-sm:  2px;   /* Inline badges, tight elements */
--nd-radius-md:  4px;   /* Buttons, inputs, cards (sharp; intentional) */
--nd-radius-lg:  8px;   /* Modal containers */
--nd-radius-full: 9999px;  /* Pills */

/* --- Shadows (glow-style rather than drop-shadow) --- */
--nd-shadow-sm:  0 1px 3px rgba(0, 0, 0, 0.6);
--nd-shadow-md:  0 4px 12px rgba(0, 0, 0, 0.5);
--nd-shadow-glow-accent: 0 0 8px var(--nd-accent-glow);

/* --- Transitions --- */
--nd-transition-fast:   150ms ease;
--nd-transition-normal: 250ms ease;

/* --- Sidebar width --- */
--nd-sidebar-width: 240px;
```

### Amplify Authenticator Theme Overrides

The Amplify `<Authenticator>` component uses CSS custom properties that can be overridden to match the brand:

```css
[data-amplify-authenticator] {
  --amplify-colors-background-primary:   var(--nd-bg-void);
  --amplify-colors-background-secondary: var(--nd-bg-surface);
  --amplify-colors-brand-primary-10:     var(--nd-accent-glow);
  --amplify-colors-brand-primary-80:     var(--nd-accent-dim);
  --amplify-colors-brand-primary-90:     var(--nd-accent);
  --amplify-colors-brand-primary-100:    var(--nd-accent);
  --amplify-colors-font-primary:         var(--nd-text-primary);
  --amplify-colors-font-secondary:       var(--nd-text-secondary);
  --amplify-colors-border-primary:       var(--nd-border-active);
  --amplify-components-button-border-radius: var(--nd-radius-md);
  --amplify-components-fieldcontrol-border-radius: var(--nd-radius-md);
}
```

---

## 2. Tailwind CSS vs CSS Modules Decision

### Current state
- **Tailwind**: Not installed. No `tailwind.config.*`, no `postcss.config.*`, no `tailwind` in `package.json`.
- **CSS modules**: Supported natively by Next.js (zero config). Not currently used — all styles are inline.
- **Constitution**: "CSS modules and Tailwind CSS (if used)" — framed as either/or; neither currently active.

### Recommendation: **CSS Modules**

| Factor | CSS Modules | Tailwind |
|---|---|---|
| New dependency | ❌ None | ✅ `tailwindcss`, `postcss`, `autoprefixer` |
| Config overhead | None | Requires `tailwind.config.ts`, `postcss.config.js`, purge setup |
| Works with design tokens | ✅ References `var(--nd-*)` naturally | ⚠️ Requires `theme.extend` mapping to CSS vars |
| Co-location | ✅ `Component.module.css` beside component | Utility classes inline in JSX |
| Test compatibility | ✅ `identity-obj-proxy` already configured in jest | Same |
| Hover/focus states with dynamic values | ✅ Pure CSS | ✅ Good |
| Sidebar transform (dynamic, JS-computed) | ✅ Via `style` prop for the one dynamic value | Same |
| Constitution `avoid inline styles` | ✅ Satisfies | ✅ Satisfies |

**Verdict**: CSS modules satisfy the constitution with zero new dependencies, integrate cleanly with the CSS custom property token system, and are already supported by the test infrastructure (`identity-obj-proxy` is configured). Tailwind can be considered a future enhancement if the team prefers utility-class authoring.

**Exception**: The sidebar `transform` value is computed from React state (`sidebarOpen ? 'translateX(0)' : 'translateX(-100%)'`). This single computed value should remain as a `style` prop, with all other styles in CSS modules. This is a justified, minimal inline style.

---

## 3. Ordered Migration Plan

### Phase A — Foundation (do first, everything else depends on this)

#### A1. `app/globals.css` — Replace Vite boilerplate with NullDevice tokens
**Why first**: All other files reference these custom properties. This is the single source of truth.  
**Changes**:
- Remove Vite-era React/logo-spin styles (`.logo`, `.read-the-docs`, `@keyframes logo-spin`, `#root` max-width centering)
- Remove `@media (prefers-color-scheme: light)` override — NullDevice is always dark
- Replace `:root` defaults with full `--nd-*` token set
- Set `body { background-color: var(--nd-bg-void); color: var(--nd-text-primary); font-family: var(--nd-font-body); }`
- Add `@import url(...)` for JetBrains Mono / Inter from Google Fonts (or use `next/font` in layout)
- Add Amplify Authenticator theme overrides (`[data-amplify-authenticator]` block)
- Add global utility classes: `.sr-only`, `.nd-page` (full-height flex layout)
- **Risk**: Amplify Authenticator gets its own stylesheet (`@aws-amplify/ui-react/styles.css`) imported in `app/layout.tsx`. The token overrides must come *after* that import, which they will since `globals.css` is also imported in layout.

#### A2. `app/layout.tsx` — Font loading and meta
**Why here**: Root layout is the single place to load fonts and set `<html>` attributes.  
**Changes**:
- Add `next/font/google` for `JetBrains Mono` and `Inter`, apply as CSS variables on `<html>`
- Add `className` to `<html>` and `<body>` to apply font variables
- No structural changes needed

---

### Phase B — Shared Infrastructure Components (no feature logic)

#### B1. `app/components/LoadingSpinner.tsx` + `LoadingSpinner.module.css`
**Why second**: Used on `app/page.tsx` (login redirect) and everywhere a loading state appears — resolving it early validates the CSS module pattern.  
**Current issues**: Inline `border: 4px solid #e0e0e0`, `borderTop: 4px solid #1976d2`, `color: '#666'` — all must use tokens.  
**Changes**:
- Extract to `LoadingSpinner.module.css`
- Spinner ring uses `var(--nd-border-default)` track, `var(--nd-accent)` arc
- Message text uses `var(--nd-text-secondary)`
- Move `@keyframes spin` from inline `<style>` tag into the CSS module

#### B2. `app/components/ErrorBoundary.tsx` + module
**Audit first** — likely contains inline styles for the error fallback UI. Migrate to CSS module + tokens.

#### B3. `app/components/ProtectedRoute.tsx` + `app/components/OperatorRoute.tsx`
**Audit first** — likely minimal or pass-through UI. If they render any styled output (e.g. "Unauthorized" screens), migrate to CSS module.

---

### Phase C — Shared Layout Component (new)

#### C1. Create `app/components/PortalLayout/` (new shared component)
**Rationale**: `app/customer/layout.tsx` and `app/operator/layout.tsx` are nearly identical — same sidebar structure, same nav pattern, same mobile toggle logic. The only differences are:
1. The sidebar accent color
2. The nav items
3. The portal label ("Customer Portal" / "Operator Portal")

A shared `PortalLayout` component accepts these as props and eliminates ~400 lines of duplicated inline-styled JSX.

**Files**:
```
app/components/PortalLayout/
  PortalLayout.tsx          — shared layout component
  PortalLayout.module.css   — CSS module with var(--nd-sidebar-accent) hook
  index.ts                  — re-export
```

**CSS module strategy for portal accents**:
```css
/* PortalLayout.module.css */
.sidebar {
  background-color: var(--nd-sidebar-accent, var(--nd-bg-surface));
}
```
Each portal sets `--nd-sidebar-accent` as an inline CSS variable on the root element (this is a CSS custom property assignment, not a style value — it's the accepted pattern for dynamic theming):
```tsx
<div style={{ '--nd-sidebar-accent': 'var(--nd-accent-customer)' } as React.CSSProperties}>
```

**Interface**:
```tsx
interface PortalLayoutProps {
  children: React.ReactNode;
  portalLabel: string;         // "Customer Portal" | "Operator Portal"
  accentVar: string;           // CSS var name e.g. '--nd-accent-customer'
  navItems: NavItem[];         // { href, label, icon }[]
  userEmail: string;
  onLogout: () => void;
  requireOperator?: boolean;
}
```

---

### Phase D — Portal Layouts (remove inline styles, use PortalLayout)

#### D1. `app/customer/layout.tsx`
**Replace** the entire inline-styled JSX body with `<PortalLayout>`. Keep only:
- Auth hook calls (`useAuthenticator`, `getUserEmail`)
- Session timeout hook (`useSessionTimeout`, `useLogout`)
- `showLogoutConfirm` state for the confirm dialog

#### D2. `app/operator/layout.tsx`
Same pattern as D1. Pass `requireOperator={true}`.

---

### Phase E — Page-Level Components

#### E1. `app/page.tsx` — Login / redirect page
**Current issues**: `backgroundColor: '#f5f5f5'` (light), `color: '#666'`, all inline.  
**Changes**:
- Extract `app/page.module.css` — login wrapper, card, heading styles
- Background becomes `var(--nd-bg-void)`, heading `var(--nd-text-primary)`, sub-text `var(--nd-text-secondary)`
- The Amplify Authenticator component appearance is handled by A1 token overrides — no additional work needed here

#### E2. `app/customer/dashboard/page.tsx`
**Current issues**: Stat cards use `#f5f5f5`, `#e0e0e0` borders, `#1976d2` for numbers, `#d32f2f` for warnings.  
**Changes**:
- Create `app/customer/dashboard/dashboard.module.css`
- Stat card: `background: var(--nd-bg-surface); border: 1px solid var(--nd-border-default)`
- Positive stats: `color: var(--nd-accent-customer)` (or `var(--nd-text-success)`)
- Negative stats: `color: var(--nd-text-danger)`

#### E3. `app/operator/dashboard/page.tsx`
**Audit and migrate** — same stat-card pattern, use `var(--nd-accent-operator)` for operator-specific metrics.

#### E4. `app/operator/routes/page.tsx`, `detail/`, `new/`
**Audit and migrate** — route list and detail pages likely use `#1976d2` accents and light card backgrounds.

---

### Phase F — Feature Components

#### F1. `app/customer/components/RouteCard.tsx`
**Current issues**: Hard-coded `#4caf50`, `#ff9800`, `#f44336`, `#1976d2` status colors; `#fff` card bg; `#e0e0e0` border.  
**Changes**:
- Create `RouteCard.module.css`
- Status colors map to `--nd-status-*` tokens
- Card background: `var(--nd-bg-surface)`, border: `var(--nd-border-default)`
- Hover: `var(--nd-bg-elevated)` background, `var(--nd-border-active)` border (replaces JS `onMouseEnter/onMouseLeave` style mutation — **remove these event handlers**)

#### F2. `app/customer/components/RouteListItem.tsx`
**Migrate** — likely same status-color pattern as RouteCard.

#### F3. `app/customer/components/RouteTimeline.tsx`
**Migrate** — timeline lines and dots likely use status colors directly.

#### F4. `app/customer/components/InvoiceListItem.tsx`
**Migrate** — invoice status colors.

#### F5. `app/customer/components/InvoiceLineItems.tsx`
**Migrate** — table/list styles.

#### F6. `app/customer/components/StopListItem.tsx`
**Migrate** — stop status/icon colors.

#### F7. `app/operator/components/RouteForm.tsx`
**Current issues**: Inline `inputStyle` object reused for all form inputs; light `#ccc` borders; light label colors.  
**Changes**:
- Create `RouteForm.module.css` — style `.input`, `.label`, `.select`, `.submitBtn`, `.cancelBtn`
- Inputs: `background: var(--nd-bg-surface); border: 1px solid var(--nd-border-active); color: var(--nd-text-primary)`
- Focus ring: `outline: 2px solid var(--nd-accent); outline-offset: 2px`
- Remove the shared `inputStyle` object

#### F8. `app/operator/components/StopForm.tsx`
**Migrate** — same form input pattern as RouteForm.

---

### Phase G — Validation

#### G1. Run existing tests
```bash
npm run test
```
Tests use `identity-obj-proxy` for CSS modules (already configured in `jest.config.cjs`). CSS class names become their string keys, which is correct — no test changes expected unless tests assert on specific inline style values.

**Audit**: Check `app/customer/components/__tests__/RouteListItem.test.tsx` etc. for any `style` attribute assertions that may break.

#### G2. Run type-check
```bash
npm run typecheck
```
Ensure no TypeScript errors from the `style` prop removal or the new `PortalLayout` props interface.

#### G3. Run lint
```bash
npm run lint
```
ESLint should flag any remaining inline styles (consider adding `eslint-plugin-no-inline-styles` as a future enforcement mechanism).

#### G4. Visual smoke test
- Login page renders on dark background with neon accent
- Customer portal sidebar is cyan-themed
- Operator portal sidebar is amber-themed
- Stat cards, route cards, forms all render legibly
- Mobile sidebar drawer works (the one legitimate dynamic `transform` inline style)

---

## 4. Risk Areas

### Risk 1: Amplify Authenticator CSS coupling (HIGH)
`@aws-amplify/ui-react/styles.css` ships its own CSS custom properties. The brand overrides in `globals.css` must have sufficient specificity/ordering to override them. Strategy: place Amplify token overrides in `[data-amplify-authenticator]` scoped block *after* the Amplify stylesheet import. If specificity wars arise, use `!important` only on the container-level variables, not on individual component rules.

### Risk 2: JS `onMouseEnter`/`onMouseLeave` style mutations (MEDIUM)
Several components (customer layout nav links, RouteCard, operator layout nav links) use React event handlers that mutate `element.style.*` directly. These will be **removed** and replaced with `:hover` pseudo-classes in CSS modules. This is functionally equivalent but must be verified — particularly for touch devices where hover state may stick.

### Risk 3: Inline `<style>` block with dynamic `transform` (MEDIUM)
Both portal layouts embed a `<style>` JSX block containing the sidebar `transform` rule computed from `sidebarOpen` state. This cannot be a pure CSS module because the value is dynamic. **Preferred resolution**: keep a single `style` prop on the sidebar element (`style={{ transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)' }}`), and move all other sidebar styles to the CSS module. Remove the `<style>` injection entirely.

### Risk 4: Test assertions on inline styles (LOW)
Existing Jest tests may assert `expect(element).toHaveStyle('color: #1976d2')` or similar. These will break when inline styles are removed. Scan all `__tests__` files before migration:
```bash
grep -r "toHaveStyle\|style=" app/**/\_\_tests\_\_/
```
Update affected assertions to check for class names (`toHaveClass`) or rendered text instead.

### Risk 5: Google Fonts in CI/CD (LOW)
Loading JetBrains Mono via `next/font/google` requires network access at build time. Amplify CI has internet access, but confirm firewall rules if builds are restricted. Alternatively, self-host fonts in `public/fonts/` and use `next/font/local`.

### Risk 6: CSS module class name collisions (LOW)
CSS modules are locally scoped by default — no collision risk between `RouteCard.module.css` and `RouteForm.module.css`. Safe to use generic class names like `.card`, `.input` within each module.

---

## 5. File Migration Checklist (ordered)

```
Phase A — Foundation
  [ ] app/globals.css                              (replace Vite boilerplate, add ND tokens)
  [ ] app/layout.tsx                               (add next/font, apply font CSS vars)

Phase B — Shared Components
  [ ] app/components/LoadingSpinner.tsx            (CSS module)
  [ ] app/components/ErrorBoundary.tsx             (CSS module)
  [ ] app/components/ProtectedRoute.tsx            (CSS module, if styled)
  [ ] app/components/OperatorRoute.tsx             (CSS module, if styled)

Phase C — New Shared Layout
  [ ] app/components/PortalLayout/PortalLayout.tsx (NEW)
  [ ] app/components/PortalLayout/PortalLayout.module.css (NEW)
  [ ] app/components/PortalLayout/index.ts        (NEW)

Phase D — Portal Layouts
  [ ] app/customer/layout.tsx                      (use PortalLayout)
  [ ] app/operator/layout.tsx                      (use PortalLayout)

Phase E — Pages
  [ ] app/page.tsx                                 (CSS module, dark bg)
  [ ] app/customer/dashboard/page.tsx              (CSS module, stat cards)
  [ ] app/operator/dashboard/page.tsx              (CSS module, stat cards)
  [ ] app/operator/routes/page.tsx                 (CSS module)
  [ ] app/operator/routes/detail/page.tsx          (CSS module)
  [ ] app/operator/routes/new/page.tsx             (CSS module)

Phase F — Feature Components
  [ ] app/customer/components/RouteCard.tsx        (CSS module, status tokens)
  [ ] app/customer/components/RouteListItem.tsx    (CSS module)
  [ ] app/customer/components/RouteTimeline.tsx    (CSS module)
  [ ] app/customer/components/InvoiceListItem.tsx  (CSS module)
  [ ] app/customer/components/InvoiceLineItems.tsx (CSS module)
  [ ] app/customer/components/StopListItem.tsx     (CSS module)
  [ ] app/operator/components/RouteForm.tsx        (CSS module, form styles)
  [ ] app/operator/components/StopForm.tsx         (CSS module, form styles)

Phase G — Validation
  [ ] npm run test                                 (all tests pass)
  [ ] npm run typecheck                            (no TS errors)
  [ ] npm run lint                                 (no lint errors)
  [ ] Visual smoke test (login, customer, operator portals)
```

---

## 6. Non-Goals (out of scope for this plan)

- **No backend or data model changes** — purely visual
- **No Tailwind installation** — deferred; use CSS modules per this plan
- **No new pages** — existing pages only
- **No accessibility audit** — recommended as follow-on work (WCAG AA contrast check against neon-on-dark tokens)
- **No animation system** — transition tokens defined but no new motion added beyond current `transition: background-color 0.2s`

---

## 7. Future Enhancements (post-migration)

1. **WCAG AA contrast audit** — neon green `#00ff88` on `#0a0a0a` is ~14.5:1 (passes AAA). Verify all text/background pairings with a contrast checker.
2. **`eslint-plugin-no-inline-styles`** — enforce no regressions after migration
3. **Storybook** — document brand tokens and component variants in isolation
4. **Tailwind migration** — if team prefers utility-class authoring, CSS modules provide a clean base to migrate from
5. **Dark/light toggle** — NullDevice is dark-only by design, but `prefers-color-scheme` media query support could be added in globals.css if required

---

*Plan authored by: GitHub Copilot*  
*Last updated: 2026-04-27*
