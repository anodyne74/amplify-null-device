---
target: Administrator routes list
total_score: 23
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/home/dave/Code/amplify-null-device/app/administrator/routes/page.tsx"
target_fingerprint: "sha256:f1dffa8e69db0cf145e1fbaeaeee8b5094d2b5966d7592d97ccb7063237e38e1"
target_path: /home/dave/Code/amplify-null-device/app/administrator/routes/page.tsx
timestamp: 2026-11-03T16-35-03Z
slug: app-administrator-routes-page-tsx
---
Method: dual-agent (A: design review · B: detector). Source-only; page behind sign-in.

Score 23/40 (Acceptable). Detector: 0 findings.

Priority issues
- [P1] A row can't say why it needs attention (no Overdue marking, muted Unassigned). Fix: clarify, colorize.
- [P1] Needs attention sits in the Status group and looks like a status chip; Status exclusivity not conveyed. Fix: layout.
- [P1] Sort affordance (faint Unicode glyph) and default order (Placement, latest first, aria-sort none) undisclosed; sort not announced. Fix: polish.
- [P2] Stops and signs column: repeated "Loading…", layout shift, failure reads as "—". Fix: harden.
- [P2] Two "Clear filters" with different scopes; collapsed Find a property hides an active filter. Fix: distill.

Personas: Alex (can't see matched rule, no unassigned-first sort), Sam (toggle read inside Status, sort changes unannounced, row click mouse-only).
