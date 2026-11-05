# public
Static files Next serves as-is at the site root. Each one is reachable only if `packages/auth/src/policy.ts` lists
its path as public (the middleware runs for these too; this README is not served).

## Contents
| Path | What it does |
|---|---|
| `CodeHaunt.seb` | the event's Safe Exam Browser config ("starting an exam", start URL `https://codehaunt.csiuem.site/login?seb=1`, SHA-256 `469b6903…bcc855c`), served at `/CodeHaunt.seb` so the login page's `sebs://` link can open SEB with it (ADR-039, ADR-045) |
| `CodeHaunt-jojocode.seb` | the previous config (start URL on `codehaunt.jojocode.in`); the middleware serves it as `/CodeHaunt.seb` to requests on that host during the domain move (ADR-045) |

## Affects / depends on
- Used by: `src/app/login/seb-handoff.tsx` (`sebs://<host>/CodeHaunt.seb`); copied into the image by `../Dockerfile`.
- Each file's Config Key must be in `SEB_CONFIG_KEY` in `.env`, paired with its origin in `PUBLIC_ORIGIN` (ADR-045): replacing the file means a new key, so update `.env`
  and restart web in the same change.

## Entry points & how to test
`curl -s https://codehaunt.csiuem.site/CodeHaunt.seb | sha256sum` = `CodeHaunt.seb`; the same URL on `codehaunt.jojocode.in` = `CodeHaunt-jojocode.seb`.

## Gotchas
- The file holds the unsalted SHA-256 of the SEB quit password: anyone can download it, so the quit password must be
  long and random (ADR-039).
