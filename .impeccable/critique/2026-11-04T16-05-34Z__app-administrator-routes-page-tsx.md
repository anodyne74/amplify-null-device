---
target: Administrator Routes list
total_score: 28
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
target_identity: "file:/home/dave/Code/amplify-null-device/app/administrator/routes/page.tsx"
target_fingerprint: "sha256:d801cd50a87f597a517d5e51f0a51525368c55e2d81cf4108ba12d940745924f"
target_path: /home/dave/Code/amplify-null-device/app/administrator/routes/page.tsx
timestamp: 2026-11-04T16-05-34Z
slug: app-administrator-routes-page-tsx
---
⚠️ DEGRADED: single-context (no sub-agent tool exposed; no signed-in browser, so layout is read from source and CSS, not seen)

# Critique: Administrator Routes list (after #676 to #680)

Score 28/40, Good (low end). Detector: clean (0 findings on page.tsx).

## Priority issues
- [P1] Width fit at 1024px unverified and likely still scrolls: 8 columns in about 710px of content area; the Actions column is last, so it is the first thing scrolled out of reach inside .tableWrap (overflow-x: auto, no visible cue).
- [P2] Filter toolbar is dense: search, two dates, Needs attention (+ always-visible rule), Find a property, then nine Status chips, then an applied-filters row repeating what the toolbar already shows.
- [P2] The idle selection bar reserves a 48px band with two disabled buttons on every load; stability was bought with permanent chrome.
- [P2] Status chips carry role="radio" but each is its own tab stop and nothing handles arrow keys, so the radiogroup contract is unmet.
- [P3] "More" menu holds one item (Delete); the menu label and affordance outweigh its content.

## Persona red flags
- Alex: no range select (shift-click), bulk limited to Assign Operator, no Notify Operator in bulk, no keyboard shortcuts.
- Sam: nine Status chips are nine tab stops with no arrow keys; the Go to selection actions link is a good fix.
- Riley: no pagination, every Route renders; unverified at a thousand rows.

## Questions
- Can the list show whether an assigned Operator has been notified?
