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
| `junior-demo.tsx` / `demo.module.css` | client: "Say what you mean": vague vs precise instruction → the junior's code, verdict and token meter (worked example of ADR-018; no model call) |
| `closing.tsx` / `closing.module.css` | FAQ accordion (`details name`, one open), ghosts' banner call to action, footer |
| `content.ts` | copy for steps, the day and FAQ |
| `reveal.tsx` | client: entrances for `[data-reveal]`; anything at or above the fold line shows, so fast scrolls never hide content |
| `hero-lab.webp`, `hero-lab-phone.webp` | hero art (generated asset 1) and its portrait crop |
| `coder-wave.webp`, `coder-debug.webp`, `winner.webp` | the three steps (assets 2, 7, 8) |
| `arch-competition.webp`, `arch-talk.webp` | the poster's two arch panels, cut from the client's poster |
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
- No `next/image`: the optimizer route would need opening in the tunnel and `sharp` in the image; images are
  pre-sized WebP with explicit width/height.
