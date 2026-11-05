# log
One participant's log (WP-05): runs, conversations (prompts, replies, code versions), token grants and top-ups, staff actions.

## Contents
| Path | What it does |
|---|---|
| `page.tsx` | route (ADMIN, ORGANIZER); `?event=&participant=` |
| `participant-log.tsx` | polled every 10 s; all participant/model text in `<pre>` as plain text; each tutor turn shows its guardrail line (intent, hint level, hints-only, code lines shown/this chat, removals; ADR-042) above the unfiltered reply |

## Affects / depends on
- Calls `/api/admin/ops/participants/[id]` (`participant-log-service.ts`).

## Entry points & how to test
`/admin/log?event=<id>` (ADMIN, ORGANIZER); services in `apps/web/test/contest-ops.test.ts`; access in `packages/auth/test/policy.test.ts`.

## Gotchas
- Hidden-test output never reaches this page (stripped by the service): organizers may not see hidden tests.
