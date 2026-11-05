---
target: administrator routes list
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
target_identity: "file:/home/dave/Code/amplify-null-device/app/administrator/routes/page.tsx"
target_fingerprint: "sha256:5b2426cd6f08c5ac967ff1fa2638d77af9910fc903621287266b10d9b0fd36f1"
target_path: /home/dave/Code/amplify-null-device/app/administrator/routes/page.tsx
timestamp: 2026-11-04T14-36-26Z
slug: app-administrator-routes-page-tsx
---
Method: DEGRADED single-context (no sub-agent tool exposed). Source-only; page behind sign-in. Score 27/40 (Acceptable). Detector: 7 advisory #000 hits in sheet/page.module.css (print stylesheet, false positive for this target); 0 in the list.

Heuristics: 1=3, 2=3, 3=3, 4=3, 5=3, 6=2, 7=3, 8=2, 9=3, 10=2

Priority issues
- [P1] Selection bar renders above the table; ticking the first row shifts the table ~50px. Fix: reserve height or make sticky. Command: layout.
- [P2] sortBy/sortDirection are in shownScope, so sorting wipes the selection silently. Fix: drop the sort keys; announce when filters clear it. Command: harden.
- [P2] A failed customers fetch reads "Unknown customer" on every row; customer search and sort degrade silently. Fix: alert with Try again, dash instead. Command: harden.
- [P2] The selection bar precedes the table in tab order, so keyboard users shift-tab back to Assign Operator; Edit is hidden in the row menu. Command: layout.
- [P3] Nine columns scroll sideways below ~1280px; Route Code link has inline styles. Command: adapt.

Personas: Alex (selection lost on sort, table jumps, no bulk Notify Operator), Sam (bar out of tab order, row click mouse-only).
