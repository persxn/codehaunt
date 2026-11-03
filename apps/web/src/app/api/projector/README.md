# projector
Public projector API (ADR-008, ADR-028): no session.

## Contents
| Path | What it does |
|---|---|
| `[token]/` | the board for one projector token |

## Affects / depends on
- Public in `packages/auth/src/policy.ts` (`/api/projector`). Serves `ProjectorView` only.

## Entry points & how to test
`apps/web/test/contest-ops.test.ts` (freeze, strict view, wrong/old token); `packages/auth/test/policy.test.ts`.

## Gotchas
Nothing here may need a session or return more than rank, name, solved (and the total once final).
