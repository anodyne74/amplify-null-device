---
target: Operator Routes list and Placement
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:/home/dave/Code/amplify-null-device/app/operator/routes/placement/page.tsx"
target_fingerprint: "sha256:a73b06e28e0d500a2298b266d33db5021f50b467a64ae1db906da66c665e96a6"
target_path: /home/dave/Code/amplify-null-device/app/operator/routes/placement/page.tsx
timestamp: 2026-11-04T22-50-22Z
slug: app-operator-routes-placement-page-tsx
---
⚠️ DEGRADED: single-context (no sub-agent tool exposed; dev server down and no signed-in browser, so layout is read from source and CSS, not seen)

# Critique: Operator Routes list and Placement screen

Score 26/40, Acceptable. Detector: 9 advisory (8 non-token font sizes, 1 off-palette colour), 0 errors.

## Priority issues
- [P1] Field text is 11-12px (counter, chips, notes, Then metadata) on a dark phone screen in a moving van.
- [P1] "Signs placed" commits on one tap with no confirm and no visible undo.
- [P2] Operator Routes list is the admin table (6 columns, small View button, Created not Placement date) on a phone.
- [P2] Leg line shows straight-line x1.3 at 22 km/h as "km · min" with no approximation cue.
- [P3] Status chips on the operator list are plain toggles, not the radio group the admin list now has.
