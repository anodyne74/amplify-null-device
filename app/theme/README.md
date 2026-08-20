# NullDevice Theme Guide

This folder defines the token architecture used by CSS modules and Amplify UI. (MUI was
removed from this repo — the operator portal now uses the shared `PortalLayout`; ignore
any lingering references to `mui-theme.ts` elsewhere, that file no longer exists.)

Palette values follow the "Null Device Design System" Claude Design project (navy ink,
indigo as the single action colour, unified per-portal accents) — see the comments in
`app/globals.css` for the mapping.

## Token Tiers

1. Core palette tokens (TypeScript): `themeTokens.ts`
- Source of truth for light/dark color values used in JS/TS themes.
- Shared by `app/amplify-theme.ts`.

2. Global CSS semantic tokens: `app/globals.css`
- `--nd-color-*` aliases for component-level styling.
- `--nd-status-*-dim` surface tokens for badges/alerts.
- `--nd-interactive-*` action tokens for primary controls.

3. Ported design-system tokens: `app/components/ui/tokens.css`
- A separate namespace (`--surface-*`, `--action-*`, `--space-*`, `--radius-*`, etc.)
  consumed only by the primitive component library in `app/components/ui/**`.
- Not yet wired into any page — see `app/components/ui/tokens.css`'s header comment.

4. Component tokens in CSS modules
- Prefer semantic tokens such as:
  - `--nd-color-bg-surface`
  - `--nd-color-text-primary`
  - `--nd-status-danger-dim`
  - `--nd-interactive-primary-bg`
- Avoid hard-coded hex/rgba except when introducing a new semantic token.

5. Non-module styles and inline style objects
- Use CSS variables (`var(--nd-...)`) instead of literals.
- Prefer semantic intent tokens over direct palette tokens when available.

## Layout Primitives

Shared layout helpers are defined in `app/globals.css`:
- `.nd-page-shell`
- `.nd-stack`
- `.nd-surface-panel`
- `.nd-table-scroll`

Use these first before creating page-local layout wrappers.

## Extending Theme Safely

1. Add new palette value to `themeTokens.ts`.
2. Expose semantic CSS variable in `app/globals.css`.
3. Update Amplify/MUI theme consumers if relevant.
4. Replace local literals in CSS modules with the new semantic variable.

## Contrast Intent

- `--nd-color-text-on-accent`: text/icons on the brand indigo fill.
- `--nd-color-text-on-danger`: text/icons on danger fills.
- `--nd-text-primary|secondary|muted`: default foreground hierarchy on neutral surfaces.
- Status surfaces (`--nd-status-*-dim`) are for badges/alerts, not body backgrounds.

When introducing a new filled component state, define a semantic "text-on-*" token if contrast differs from existing states.
