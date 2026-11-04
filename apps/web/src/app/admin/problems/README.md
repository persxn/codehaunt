# problems
Problem editor (`/admin/problems`, ADMIN only): statement, visible and hidden tests, solutions per language, limits, calibration.

## Contents
| Path | What it does |
|---|---|
| `page.tsx` | route |
| `problems-admin.tsx` | problem list for the selected event; opens the editor |
| `problem-editor.tsx` | one problem as a whole form (save replaces it); delete |
| `test-list.tsx` | repeatable input/expected pairs; hidden tests from a JSON file |
| `calibration.tsx` | runs every stored solution against every test, polls, explains the expected outcome |
| `drafts.tsx` | GPT-OSS drafts (WP-07 task 8): edge-case tests and naive solutions to approve or reject; approving reloads the editor form so a later save keeps the new hidden test |

## Affects / depends on
- Calls `/api/admin/events/{id}/problems`, `/api/admin/problems/{id}`, `/api/admin/problems/{id}/calibrate`.
- Depends on `../api.ts`, `../event-picker.tsx`, `../admin.module.css`, `src/components/`.

## Entry points & how to test
Open the page in the admin console; `e2e/admin.spec.ts` drives it end to end.

## Gotchas
This page shows hidden tests and reference solutions: admin only (policy + route roles). Problems freeze when the contest starts.
