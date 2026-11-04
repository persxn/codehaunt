# contest
Participant contest API (WP-03). Every route: PARTICIPANT only, through `lib/route.ts`; services in `src/server/`.

## Contents
| Path | What it does |
|---|---|
| `state/` | contest phase, time left, tokens, languages, consent text until accepted |
| `consent/` | POST: accept the consent text (ADR-010) |
| `problems/` | problem list; `[id]/` statement (visible tests only) and workspace |
| `sessions/` | POST: new tutor chat (first, or a fresh empty one when the context is full; ADR-033) |
| `code/` | POST: save the participant's own code (ADR-033; no-op when unchanged) |
| `revert/` | POST: copy an older code version as the newest |
| `prompt/` | POST: one question to the tutor, the filtered reply streamed as NDJSON (`PromptStreamEvent`) |
| `runs/` | POST: queue a sample run or submission (idempotent); `[id]/` GET: its projected verdict |

## Affects / depends on
- Depends on: `src/lib/route.ts` (session, roles, error envelope), services in `src/server/`.
- Access: PARTICIPANT (middleware), plus the role list passed to `route()`.

## Entry points & how to test
Service logic is tested in `apps/web/test/` (`npm test -w @codehaunt/web`); access per path in `packages/auth/test/policy.test.ts`.

## Gotchas
Keep handlers thin: parse with the contract schema, call one service, return its result.
