# _landing
Pieces of the public event page at `/` (ADR-029, art direction ADR-030). The leading underscore keeps Next from
treating this folder as a route.

## Contents
| Path | What it does |
|---|---|
| `countdown.tsx` | client: live countdown to 7 Nov 2026 10:00 IST; server renders "Doors at 10 AM" so hydration matches |
| `junior-demo.tsx` | client: the "tell the junior" demo; vague vs precise prompt → example code, verdict, tokens on a candle (worked example of ADR-018, no model call) |
| `reveal.tsx` | client: staggered entrances for `[data-reveal]`; shows anything at or above the fold line, so fast scrolls never leave content hidden; off under reduced motion |
| `hero-lab.webp` | hero background: the haunted computer lab |
| `coder-wave.webp`, `coder-debug.webp`, `winner.webp` | the Direct / Debug / Win panels |
| `coder-asleep.webp` | beside the FAQ cards |
| `reaper.webp` | "The day" section |
| `ghosts-peek.webp` | ghosts peeking over the bottom of "The day" |
| `divider.webp` | ornament at the top of the footer |
| `hood.webp` | wordmark icon |
| `icon-bat.webp` | the bats flying across the hero |
| `icon-ghost.webp` | the ghost in the Enter band |
| `poster.jpg` | the client's poster, offered as a download |

## Affects / depends on
- Used by: `../page.tsx` and `../landing.module.css` only.
- Images are imported, so Next serves them from `/_next/static/media` (public, and copied into the standalone image).

## Entry points & how to test
Open `/` signed out. `npm test -w @codehaunt/web` covers the policy (`/` public); the layout was checked with the
`design-taste-frontend` inspector at 1440/768/390.

## Gotchas
- Event facts (date, time, venue, MAR points, socials) come from the poster; change them in `../page.tsx` and `countdown.tsx`.
- All art is the client's generated set (control repo `docs/assets/generated/`), cut out to WebP; unused pieces stay there.
