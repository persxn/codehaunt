# drafts
GET: GPT-OSS drafts for this problem (WP-07 task 8): edge-case tests with a proposed output and naive solutions. ADMIN only.

## Contents
| Path | What it does |
|---|---|
| `route.ts` | GET handler |
| `[draftId]/` | POST `DraftDecision`: approve or reject one draft |

## Affects / depends on
- Depends on: `src/lib/route.ts`, `src/server/draft-service.ts`.
- Access: ADMIN (`/api/admin/problems` in `packages/auth/src/policy.ts`): drafts become hidden tests, which organizers may not see.

## Entry points & how to test
`apps/web/test/drafts.test.ts`.

## Gotchas
Keep handlers thin. Draft text is model-written: the UI renders it as text.
