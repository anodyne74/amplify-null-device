---
target: Administrator Routes list
total_score: 29
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 0
target_identity: "file:/home/dave/Code/amplify-null-device/app/administrator/routes/page.tsx"
target_fingerprint: "sha256:56cf5358db236a14de56c980c44d60ab2654362e29cdd45161bf8e792ffe9904"
target_path: /home/dave/Code/amplify-null-device/app/administrator/routes/page.tsx
timestamp: 2026-11-04T22-44-17Z
slug: app-administrator-routes-page-tsx
---
⚠️ DEGRADED: single-context (no sub-agent tool exposed; dev server down and no signed-in browser, so layout is read from source and CSS, not seen)

# Critique: Administrator Routes list (after #693 to #695)

Score 29/40, Good. Detector: 0 findings on the list; 7 advisory #000 hits in sheet/page.module.css (print Route Sheet, intentional).

## Priority issues
- [P2] Bulk is Assign Operator only. The job is assign and notify, but Notify Operator is per Route; no shift-click range select.
- [P2] Filter toolbar is still two rows with 5 controls, an always-visible rule hint under Needs attention (uneven row height) and 9 Status chips.
- [P2] Up to five role="status" regions on the page (sort, selection notice, selected count, result count, property note); two are empty paragraphs. Chatty for a screen reader.
- [P2] Layout still unverified in a browser at 1024/1280; the narrow-table breakpoint (1279) and pinned Actions were never seen.
- [P3] No pagination or virtualisation; every Route renders.

## Persona red flags
- Alex: no range select; no bulk Notify Operator; no shortcuts.
- Sam: Status group is now a proper radiogroup (fixed); the Needs attention chip is a toggle with a hint linked by aria-describedby, fine; live regions are noisy.

## Questions
- Can the list show whether an assigned Operator has been notified?
