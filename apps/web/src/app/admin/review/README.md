# review
Batch-judge review screen (WP-07 task 6; ADR-009, ADR-033, ADR-035). ADMIN and ORGANIZER.

## Contents
| Path | What it does |
|---|---|
| `page.tsx` | route `/admin/review` |
| `review.tsx` | queue judging (contest ended, reason required), the DGX command to run the judge, per-participant status, process score (override shown with the judge's score), integrity flags in plain words (judge-addressing, save bursts, tutor-example copies, code-heavy questions, cross-participant similarity), per-problem rationale and criteria, override and re-judge (audited) |

## Affects / depends on
- Calls `/api/admin/review/*` and `/api/admin/ops/participants/[id]/override`.
- Depends on `../ops.tsx` (`ActionForm`, `usePoll`), `../event-picker.tsx`, `../admin.module.css`.

## Entry points & how to test
`/admin/review?event=<id>`; service tests in `apps/web/test/review.test.ts`.

## Gotchas
Rationale, evidence and names are participant- or model-written: text only, never HTML.
