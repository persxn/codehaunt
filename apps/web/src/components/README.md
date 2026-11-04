# Components

## Contents
| Path | What it does |
|---|---|
| `ghost-mark.tsx` | Ghost SVG logo and wordmark |
| `ghost-mark.module.css` | Styles for wordmark |
| `icons.tsx` | Lucide‑style SVG icons |
| `icons.module.css` | Spinner animation |
| `button.tsx` | Button component (primary, secondary, danger) |
| `button.module.css` | Button styles |
| `field.tsx` | Form field wrapper with label, hint, error |
| `field.module.css` | Input styles; inputs are `box-sizing: border-box` so they never overflow their container |
| `verdict-badge.tsx` | Verdict badge component |
| `verdict-badge.module.css` | Badge styles |
| `meter.tsx` | Token usage meter; `compact` = one line for top bars and pane headers; the bar fills with `scaleX` (no layout per poll) |
| `meter.module.css` | Meter styles |
| `banner.tsx` | Contest banner: a framed strip with a tone stripe and the state art in a small arch; enters once |
| `banner.module.css` | Banner styles |
| `ornaments.tsx` / `ornaments.module.css` | ADR-037 Halloween ornaments: `Bat`, `BatBurst` (the Accepted moment, off under reduced motion), `GhostAvatar` (tutor replies); `.cornered` = the poster's bracket corners on any box (four inline-SVG background layers, no DOM; boxes set `background-color`, not the shorthand); `.doubleRule` = the pumpkin line under a border (pseudo-element, not a shadow) |
| `card-page.module.css` | one centred card on the poster ground (account, system check, 404): textured ground, cornered card with an entrance, arch frame, eyebrow, Creepster title, back link |
| `state-art/` | state illustrations beside state text (ADR-032; `state-art/README.md`) |

## Affects / depends on
- Used by: contest and admin pages
- Depends on: `tokens.css` custom properties
