# _public
The public theme (ADR-031): the poster's design system shared by the event page (`/`) and the sign-in page
(`/login`). The leading underscore keeps Next from treating this folder as a route. Plan and rationale: control repo
`docs/UI_UX_REDESIGN_PLAN.md`.

## Contents
| Path | What it does |
|---|---|
| `public.module.css` | tokens on `.theme` (palette, type scale, spacing, radius, motion), `.textured` ground, `.container`, `.section`, `.title`, `.lead`, buttons (`.btn` + `.primary`/`.secondary`), `.arch` frame, skip link, reveal rules, reduced motion |
| `icons.tsx` | one line-icon family (24px, 2px stroke): calendar, clock, pin, arrows, download, plus, scan, lock, code, mic, trophy, check, cross; decorative unless given a `title` |
| `event.ts` | event facts from the poster (date, time, venue, socials) and `calendarHref()` (.ics data URL for "Add to calendar") |
| `texture.webp` | the client's grunge texture (generated asset 12), the page ground at 40% |
| `desk-scene.webp` | sign-in page art (generated asset 13) |
| `logo-iem.webp`, `logo-uem.webp`, `logo-csi.webp` | organiser logos for the navbar (client-supplied, cropped on white; CSI shown round). Sources: control repo `docs/assets/logos/` |
| `logo-iem.webp`, `logo-uem.webp`, `logo-csi.webp` | organiser logos for the navbar (client-supplied, cropped on white; CSI shown round). Sources: control repo `docs/assets/logos/` |
| `hood.webp` | the hooded-skull mark (generated asset 10) next to the wordmark |

## Affects / depends on
- Used by: `../page.tsx`, `../_landing/*`, `../login/page.tsx`.
- The login page remaps the app's tool tokens (`--accent`, `--raised`, …) onto these, so `@/components/field` and
  `button` render in this theme unchanged.

## Entry points & how to test
Open `/` and `/login`. Tokens are the only colours/sizes the public CSS uses.

## Gotchas
- Font tokens are `--font-text` / `--font-code`: `--text` is the app's text colour token and must not be reused.
- Changing `event.ts` dates also moves the countdown and the calendar entry; `endsAt` is an assumption (7 PM IST).
