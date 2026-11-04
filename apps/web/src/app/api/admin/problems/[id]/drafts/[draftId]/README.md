# [draftId]
POST `DraftDecision`: approve (adds a HIDDEN test, or sets the NAIVE solution for that language) or reject one draft. Refused once the contest has started (same lock as the problem editor). Audit-logged.

## Contents
| Path | What it does |
|---|---|
| `route.ts` | handler |

## Affects / depends on
- Depends on: `src/lib/route.ts`, `src/server/draft-service.ts`.
- Access: ADMIN.

## Entry points & how to test
`apps/web/test/drafts.test.ts`.

## Gotchas
Keep handlers thin.
