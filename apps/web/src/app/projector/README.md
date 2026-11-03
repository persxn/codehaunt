# projector
Public projector board (ADR-008, ADR-028): no login; rank, name and solved for the room, frozen for the last minutes.

## Contents
| Path | What it does |
|---|---|
| `[token]/` | the board for one projector link |

## Affects / depends on
- Public in `packages/auth/src/policy.ts` (`/projector`). Uses `/api/projector/[token]`.

## Entry points & how to test
`/projector/<token>` (the link from the Contest page); data tests in `apps/web/test/contest-ops.test.ts`.

## Gotchas
Outside the admin layout: no session, nothing personal beyond the name.
