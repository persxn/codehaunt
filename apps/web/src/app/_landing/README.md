# _landing
Sections of the public event page at `/` (ADR-029, design ADR-031). Each section is a component with its own CSS
module, all on the tokens in `../_public/`.

## Contents
| Path | What it does |
|---|---|
| `nav.tsx` / `nav.module.css` | client: sticky bar (wordmark, section links, Add to calendar; Sign in only when the full launch is configured); edge line after scrolling |
| `hero.tsx` / `hero.module.css` | full-bleed haunted-lab art (phone crop via `<picture>`), wordmark, poster info rows, countdown, actions, flying bats, vertical tagline rail |
| `countdown.tsx` | client: four tiles to 7 Nov 10:00 IST; dashes on the server (no hydration mismatch); per-minute without seconds under reduced motion |
| `sections.tsx` / `sections.module.css` | How it works (three arches), One day two halves (the poster's own arch panels), The day (five-stop track) |
| `tutor-demo.tsx` / `demo.module.css` | client: "Ask the right question": asking for the answer vs asking about the idea → the tutor's reply, the code you typed, verdict, 20% penalty note and token meter (worked example of ADR-033/034; no model call) |
| `closing.tsx` / `closing.module.css` | FAQ accordion (`details name`, one open), ghosts' banner call to action, footer |
| `content.ts` | copy for steps, the day and FAQ |
| `reveal.tsx` | client: entrances for `[data-reveal]`; anything at or above the fold line shows, so fast scrolls never hide content |
| `hero-arch.webp`, `hero-arch-phone.webp` | hero art drawn for the arch (generated asset 15) and its landscape phone crop |
| `coder-wave.webp`, `coder-debug.webp`, `winner.webp` | the three steps (assets 2, 7, 8) |
| `arch-competition.webp`, `arch-talk.webp` | the two halves, drawn for the arch (generated assets 16, 17) |
| `coder-asleep.webp` | beside the FAQ (asset 6) |
| `ghosts-banner.webp` | the call-to-action banner (asset 4) |
| `divider.webp` | footer ornament (asset 11) |
| `icon-bat.webp` | the bats in the hero (from asset 9) |
| `poster.jpg` | the client's poster, offered as a download |

## Affects / depends on
- Used by: `../page.tsx` only. Depends on `../_public/` (tokens, icons, event facts).
- Images are imported, so Next serves them from `/_next/static/media` (public; allowed by the preview tunnel).

## Entry points & how to test
Open `/` signed out. Checked with Playwright at 1920/1440/820/390 and the `design-taste-frontend` inspector.

## Gotchas
- Copy not confirmed by the client: FAQ answers, the order of "The day", the tech-talk line, the demo's token numbers.
- The copy states the game rules (ADR-033: you write the code, the AI tutors, no paste; ADR-034: 20% per wrong
  submission). Change them here and in `content.ts` when the rules change.
- No `next/image`: the optimizer route would need opening in the tunnel and `sharp` in the image; images are
  pre-sized WebP with explicit width/height.
