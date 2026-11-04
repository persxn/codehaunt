# [token]
The projector page for one token.

## Contents
| Path | What it does |
|---|---|
| `page.tsx` | server route; `referrer: no-referrer` so the token never leaks in a Referer |
| `projector.tsx` | client board: polls every 5 s, local clock tick, frozen banner, totals once final; rank in an arch (top 3 podium), solved as dots + numbers, three drifting bats by the title |
| `projector.module.css` | large type for a room (scales with the screen), texture ground, row cards with a staggered entrance, live dot; reduced motion stops the drift and pulses; design tokens only |

## Affects / depends on
- Depends on `ProjectorView` (`@codehaunt/contracts`) and `Wordmark` (`src/components`).

## Entry points & how to test
Open the link on a projector; data tests in `apps/web/test/contest-ops.test.ts`.

## Gotchas
Shows rank, name, solved only; never add fields the view schema does not have.
