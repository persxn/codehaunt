# [token]
GET `ProjectorView` for the event whose projector token hashes to this one; 404 for an unknown token or a disabled projector.

## Contents
| Path | What it does |
|---|---|
| `route.ts` | public handler (no `route()` wrapper: no session); `no-store`, `no-referrer` |

## Affects / depends on
- Depends on: `projectorView` in `src/server/leaderboard-service.ts`; `errorResponse` in `src/lib/route.ts`.

## Entry points & how to test
`apps/web/test/contest-ops.test.ts`.

## Gotchas
The token is the only key: never log it, never echo it. The view is `.strict()` in contracts.
