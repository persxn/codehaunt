# state-art
State illustrations for the working screens (ADR-032), from the client's generated sheet (control repo
`docs/assets/generated/21–28`), resized to 320 px WebP.

## Contents
| Path | What it does |
|---|---|
| `state-art.tsx` | `StateArt kind size`: one decorative image (empty alt), shown beside the state's text |
| `state-art.module.css` | fixed size, smaller below 480 px |
| `accepted.webp` | 21: newest run accepted |
| `wrong-answer.webp` | 22: newest run rejected |
| `judging.webp` | 23: newest run queued or running |
| `budget-out.webp` | 24: token budget used up |
| `checked-in.webp` | 25: QR check-in succeeded |
| `not-found.webp` | 26: 404 page |
| `connection-lost.webp` | 27: the contest screen can't reach the server |
| `times-up.webp` | 28: contest ended |

## Affects / depends on
Used by `app/contest/` (runs panel, banners), `app/admin/checkin/scanner.tsx`, `app/not-found.tsx`.

## Entry points & how to test
Screens at 1366×768 and 390 px (WP-06 acceptance).

## Gotchas
Never the only signal: the verdict badge or banner text carries the meaning (colour-blind and screen-reader users).
