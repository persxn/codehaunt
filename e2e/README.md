# e2e
End-to-end tests (Playwright) of the participant flow against a real stack: the web app (`next start`), the worker on the
host (Docker runner images), the live inference gateway and CodeHaunt's own Postgres.

## Contents
| Path | What it does |
|---|---|
| `playwright.config.ts` | Chromium, 1366×768, one worker; starts web on `E2E_PORT` (3300; 3200 is the public preview) and the worker (health 3111) unless running |
| `global-setup.ts` | creates a fresh running E2E event, one problem, a checked-in participant per language and an admin; logins to `.state.json` |
| `admin.spec.ts` | WP-04: admin creates an event + 2 problems in the UI and calibrates; import, badges, inactive until scanned, single-use check-in; participant solves; live budget change; volunteer pages, add/remove, weak passwords |
| `participant.spec.ts` | ADR-033: login → consent → type the solution → real paste/drop change nothing → ask the tutor (code unchanged, reply not copyable) → sample run → submit → Accepted in C, C++, Java, Python; token and context meters equal the ledger; no response carries a hidden test; weak new passwords refused with their reason; public system check |
| `contest-ops.spec.ts` | WP-05 controls (WP-08): pause stops participants and resume restarts them; extend adds time; the projector freezes in the last minutes |

## Affects / depends on
- Depends on: `.env` (`DATABASE_URL`, `GATEWAY_URL`, `GATEWAY_FALLBACK_URL`, `GATEWAY_TOKEN`), runner images (`make runners`),
  a built web app (`npm run build -w @codehaunt/web`), `@playwright/test` 1.63.0 (pinned to the cached Chromium build 1243).
- Writes E2E events and accounts into the database it points at (slugs `e2e-*`): run it against the practice DB only.

## Entry points & how to test
`make e2e` (loads `.env`, builds the web app, runs the suite).

## Gotchas
- Never during a load test or the event: it uses the real model and the sandbox.
- The model is real, so a run can fail if the model writes a wrong program; rerun once before suspecting the code.
- `.state.json` holds the E2E password; it is git-ignored.
