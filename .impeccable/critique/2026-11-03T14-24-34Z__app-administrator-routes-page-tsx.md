---
target: administrator routes
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:/home/dave/Code/amplify-null-device/app/administrator/routes/page.tsx"
target_fingerprint: "sha256:fc01155f38b24231dc397f83d2739111cb898d7ab0798d1275f7e877f837a76d"
target_path: /home/dave/Code/amplify-null-device/app/administrator/routes/page.tsx
timestamp: 2026-11-03T14-24-34Z
slug: app-administrator-routes-page-tsx
---
Method: dual-agent (A: design review, source-only · B: detector, source scan only). Browser inspection blocked by sign-in; rendered UI not verified.

Score 25/40 (Acceptable). Heuristics: 1=3, 2=3, 3=3, 4=2, 5=3, 6=2, 7=2, 8=2, 9=3, 10=2.

Specificity: mixed. Schedule Diff, Route Sheet and detail flows are authored for sign runs; the list is a stock admin table organised around Created date.
Detector: 7 advisory design-system-color findings, all #000 in sheet/page.module.css (likely intentional print black).

Priority issues:
- [P1] List organised around record creation, not work (Placement/Pickup/Operator/Signs missing; Created filter only) -> /impeccable layout, clarify
- [P1] Too many controls before data; View/Edit/Delete crowded per row -> /impeccable distill
- [P2] Raw <a> for View/Edit, inline styles, mixed table systems, filters reset on return -> /impeccable polish
- [P2] Status badge folds four field phases into one style -> /impeccable colorize
- [P3] Empty/filtered state has no way forward -> /impeccable clarify
