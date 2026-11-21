---
name: NullDevice
description: Calm indigo-on-navy operational UI for a sign-run delivery system, shared by administrators, Operators and Customers.
colors:
  indigo-brand: "#5d65e6"
  indigo-deep: "#4a51cc"
  indigo-ink: "#3a40a6"
  indigo-mist: "#eef0fe"
  violet-accent: "#b181e8"
  navy-ink: "#141b38"
  navy-surface: "#1c244a"
  night-void: "#0e1329"
  paper: "#f6f7fb"
  white: "#ffffff"
  cloud: "#edeff6"
  hairline: "#dfe2ee"
  slate-line: "#c7cbdd"
  slate-muted: "#5a6180"
  amber-planned: "#bf8412"
  amber-wash: "#fff6e0"
  red-danger: "#c62b31"
  red-action: "#e5484d"
  red-wash: "#fdecee"
typography:
  display:
    fontFamily: "Comfortaa, 'Trebuchet MS', system-ui, sans-serif"
    fontSize: "2.8rem"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Comfortaa, 'Trebuchet MS', system-ui, sans-serif"
    fontSize: "26px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Comfortaa, 'Trebuchet MS', system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Manrope, 'Segoe UI', system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "0em"
  label:
    fontFamily: "Manrope, 'Segoe UI', system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "0.08em"
  mono:
    fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.55
rounded:
  xs: "6px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  page-gutter: "32px"
components:
  button-primary:
    backgroundColor: "{colors.indigo-brand}"
    textColor: "{colors.white}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    height: "40px"
    padding: "0 20px"
  button-primary-hover:
    backgroundColor: "{colors.indigo-deep}"
  button-secondary:
    backgroundColor: "{colors.white}"
    textColor: "{colors.navy-ink}"
    rounded: "{rounded.pill}"
    height: "40px"
    padding: "0 20px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.indigo-deep}"
    rounded: "{rounded.pill}"
    height: "40px"
    padding: "0 20px"
  button-danger:
    backgroundColor: "{colors.red-action}"
    textColor: "{colors.white}"
    rounded: "{rounded.pill}"
    height: "40px"
    padding: "0 20px"
  input:
    backgroundColor: "{colors.white}"
    textColor: "{colors.navy-ink}"
    rounded: "{rounded.md}"
    height: "40px"
    padding: "0 16px"
  card:
    backgroundColor: "{colors.white}"
    textColor: "{colors.navy-ink}"
    rounded: "{rounded.lg}"
    padding: "24px"
  badge-success:
    backgroundColor: "{colors.indigo-mist}"
    textColor: "{colors.indigo-ink}"
    rounded: "{rounded.pill}"
    padding: "5px 10px"
  badge-warning:
    backgroundColor: "{colors.amber-wash}"
    textColor: "{colors.amber-planned}"
    rounded: "{rounded.pill}"
    padding: "5px 10px"
  nav-link-active:
    backgroundColor: "{colors.indigo-mist}"
    textColor: "{colors.indigo-deep}"
    rounded: "{rounded.md}"
    padding: "11px 12px"
---

# Design System: NullDevice

## Overview

**Creative North Star: "The Dispatch Desk"**

One desk, three seats. An administrator at a desktop, an Operator with a phone in a van after dark, a Customer checking a Route: all work from the same indigo-on-navy system, tuned for each. It is calm, rounded and tonal. Surfaces are layered by tint and hairline border rather than by shadow, and the single indigo accent marks what can be acted on or what is current.

Density follows the role. Administrator screens are dense and scannable (tables, row menus, status badges). Operator field screens are large-target, high-contrast and dark by default. Customer screens are quieter, with metrics presented calmly. This is an Operate surface throughout: familiar patterns win over expression, and brand lives in precise details such as the pill buttons, the Comfortaa headings and the indigo focus ring.

The system is mid-migration between two token sets. The older `--nd-*` variables in `app/globals.css` are still read by many pages; the newer unprefixed tokens in `app/components/ui/tokens.css` (ported from the Null Device Design System) back the `nd-*` primitives in `app/components/ui/`. The values agree (same indigo, navy and neutral ramps). New work uses the newer tokens and primitives.

**Key Characteristics:**
- One accent (indigo) plus a rare violet; amber and red are reserved for planned/warning and danger.
- Pill-shaped actions, 12-16px rounded containers, hairline borders.
- Comfortaa for headings, Manrope for everything read, JetBrains Mono for identifiers.
- Light and dark for every role; Operators default to dark; staff sidebar is always navy.
- Role accent, focus ring and active-nav tints come from role tokens, so each portal can retint without restyling components.

## Colors

A restrained palette of navy neutrals and one indigo, with status colors used only for status.

### Primary
- **Signal Indigo** (#5d65e6): the brand and action color. Primary buttons, active status, focus ring, active nav, links (as #4a51cc / #a0a8f4 text tints for contrast).
- **Deep Indigo** (#4a51cc): hover/pressed primary, link text on light backgrounds.
- **Ink Indigo** (#3a40a6): completed status and success text on light tints.
- **Indigo Mist** (#eef0fe): selected/active tint, light customer sidebar.

### Secondary
- **Logo Violet** (#b181e8): paired with indigo in the logo gradient and sparing accents; never a second action color.

### Neutral
- **Navy Ink** (#141b38): heading text on light; the staff sidebar and card surface in dark.
- **Dusk Navy** (#1c244a): elevated surfaces in dark and the Operator/Customer sidebar.
- **Night Void** (#0e1329): the dark page background.
- **Paper** (#f6f7fb): the light page background; **White** (#ffffff) for cards and inputs; **Cloud** (#edeff6) for hover and sunken areas.
- **Hairline** (#dfe2ee) and **Slate Line** (#c7cbdd): subtle and default borders in light. Dark uses white at 9% / 16% / 30%.
- **Slate Muted** (#5a6180): muted text on light. Dark text steps are 86% / 62% / 46% of #f3f5fc.

### Status
- **Planned Amber** (#bf8412) on **Amber Wash** (#fff6e0): planned and warning.
- **Danger Red** (#c62b31) on **Red Wash** (#fdecee): overdue, failed, destructive. Solid danger buttons use #e5484d.
- Active Routes read indigo; archived reads #9aa0ba.

### Named Rules
**The One Voice Rule.** Indigo is the only action color. Violet decorates; it never marks something clickable.

**The Red Is Earned Rule.** Red appears only for overdue, failed or destructive states, including on invoices.

**The Role Token Rule.** Shared components read `--nd-role-accent`, `--nd-role-focus-ring` and `--nd-role-nav-active-*`, never a hard-coded role color or a hard-coded dark or light shell.

## Typography

**Display Font:** Comfortaa (with Trebuchet MS, system-ui)
**Body Font:** Manrope (with Segoe UI, system-ui)
**Label/Mono Font:** JetBrains Mono for emails, Route Codes and other identifiers

**Character:** a rounded geometric heading face over a clean humanist sans. Friendly without being playful; the mono face signals "this is a reference you may copy".

### Hierarchy
- **Display** (700, clamp(1.8rem, 5vw, 2.8rem), 1.1): page `h1` only.
- **Headline** (700, 26px / clamp 1.3-2rem, 1.2): section headings.
- **Title** (700, 16px, 1.3, -0.01em): card titles and panel headers.
- **Body** (400-500, 15px, 1.55): all reading text; prose capped at 68ch. Table and compact UI use 13px.
- **Label** (600, 11px, +0.08em, uppercase): sidebar captions, section eyebrows.
- **Mono** (400, 12px): identifiers and emails.

### Named Rules
**The Heading Face Rule.** Comfortaa is for headings and button text in the legacy default button; everything else is Manrope. Never set body copy in Comfortaa.

## Layout

Page content sits in a 1280px max container with a 32px gutter (20px on small screens), beneath a fixed 248px sidebar. Spacing runs on a 4/8/12/16/20/24/32/40/48/64px scale; cards use 24px internal padding and stack with 24px gaps. The legacy `.nd-page-shell` caps at 1200px.

Controls are 32/40/48px tall; Operator field actions use 52px (`--control-h-touch`) and must never fall below 44px. Text must not clip at 390, 393, 412 and 430px widths. On mobile the sidebar collapses behind a menu toggle with an overlay, and bottom padding respects `env(safe-area-inset-bottom)`.

Administrator tables keep stable columns, with frequent actions visible and low-frequency or destructive actions in row menus. Do not nest cards; use a card only for repeated items, modals or genuinely framed tools.

## Elevation & Depth

Hybrid but mostly tonal. Depth at rest comes from surface tint (page, card, raised, sunken) and 1px hairline borders; shadows are light and ambient. Interactive cards lift on hover (`translateY(-2px)` with the large shadow and an indigo-200 border). Dark mode raises surfaces by lightening navy and deepens shadows.

### Shadow Vocabulary
- **Rest** (`box-shadow: 0 1px 3px rgba(13,13,13,0.07), 0 1px 2px rgba(13,13,13,0.04)`): default card.
- **Raised** (`0 2px 6px rgba(13,13,13,0.1)`): raised card.
- **Lifted** (`0 12px 28px rgba(13,13,13,0.12)`): hover on interactive cards, dialogs.
- **Focus ring** (`0 0 0 3px rgba(93,101,230,0.28)`, 0.45 on dark/inverse): keyboard focus on pills, inputs, tags.
- **Indigo glow** (`0 0 12px rgba(93,101,230,0.4)`): legacy hover on default buttons only.

### Named Rules
**The Response-Only Glow Rule.** Glows and lifts appear as a reaction to hover or focus, never at rest.

## Shapes

Soft and rounded, with two clear tiers: **pills** (999px) for actions, badges and icon buttons, and **12-16px** corners for inputs (12px), cards (16px), and sidebar links (12px). Tags and checkboxes use 8px and 6px. Borders are 1px hairlines; 2px for checkbox boxes and the customer sidebar's indigo divider. Circles are for avatars and agent initials badges.

## Components

### Buttons
- **Shape:** pill (999px), 32/40/48px tall, Manrope 600.
- **Primary:** Signal Indigo fill, white text; hover deepens to #4a51cc; press settles down 1px.
- **Secondary:** white (or Cloud-dark) fill, hairline border, navy text; hover strengthens the border.
- **Ghost:** transparent, indigo text, mist fill on hover.
- **Danger:** #e5484d fill, white text; used only for destructive confirmation.
- **Focus:** 3px indigo ring, no outline. Disabled is 50% opacity.
- Unstyled `<button>`s fall back to a 6px-radius bordered button in Comfortaa; the fallback has near-zero specificity so any component class wins.

### Cards / Containers
- **Corner Style:** 16px.
- **Background:** card surface with a hairline border and Rest shadow.
- **Header/footer:** 24px/32px padding with hairline dividers; title in Comfortaa 700 16px.

### Inputs / Fields
- **Style:** 40px tall, 12px radius, hairline default border, card-surface fill.
- **Focus:** border turns brand indigo with the 3px ring.
- **Error / Disabled:** red border and 12px red message; disabled uses the sunken surface and disabled text.
- Labels are 13px 600 above the field; hints 12px subtle.

### Badges / Status
- Pill, 12px 600 text, 5px/10px padding, optional 6px dot. Variants: neutral, success (indigo), warning (amber), danger (red), info, brand. Route status maps six phases onto three styles: planned (amber), active (indigo, all in-progress phases), completed (deep indigo).

### Navigation
- Fixed 248px sidebar: brand block, uppercase 11px captions, links at 13px 600 with 12px radius. Active link takes the mist tint and indigo text and sets `aria-current="page"`. Staff sidebar is always navy; the customer sidebar follows the theme with a 2px indigo right border.
- Breadcrumbs, tabs, period selectors and row menus follow the same pill/hairline language.

### Operator field controls
- Large (52px) pill actions, high-contrast dark surfaces, the map and next Stop dominant, upcoming Stops secondary. Route setup and planning controls are absent during an active Route.

## Do's and Don'ts

### Do:
- **Do** use the unprefixed tokens and `app/components/ui/` primitives for new UI.
- **Do** keep indigo as the only action color and reserve red for danger, overdue and failure.
- **Do** make every role support light and dark through the shared resolved theme mode.
- **Do** keep touch targets at 44px minimum, and 52px for primary Operator actions.
- **Do** give active navigation `aria-current="page"` and a visible role-tinted focus ring.
- **Do** confirm destructive and replacement actions.

### Don't:
- **Don't** mix neon accents across equal-priority cards in the Customer portal.
- **Don't** hard-code a role shell to dark or light where the shared theme is available (the staff sidebar is the deliberate exception).
- **Don't** show invoices, balances or restricted placeholders to `read_only` Customers.
- **Don't** nest cards or use marketing-style hero compositions in operational workflows.
- **Don't** let global typography or button rules override MUI or Amplify component states.
- **Don't** put glow or lift on resting elements.
