# public
Static files Next serves as-is at the site root. Each one is reachable only if `packages/auth/src/policy.ts` lists
its path as public (the middleware runs for these too; this README is not served).

## Contents
| Path | What it does |
|---|---|
| `CodeHaunt.seb` | the event's Safe Exam Browser config ("starting an exam", start URL `/login?seb=1`), served at `/CodeHaunt.seb` so the login page's `sebs://` link can open SEB with it (ADR-039) |

## Affects / depends on
- Used by: `src/app/login/seb-handoff.tsx` (`sebs://<host>/CodeHaunt.seb`); copied into the image by `../Dockerfile`.
- The file's Config Key must match `SEB_CONFIG_KEY` in `.env`: replacing the file means a new key, so update `.env`
  and restart web in the same change.

## Entry points & how to test
`curl -sI https://codehaunt.jojocode.in/CodeHaunt.seb` → 200; `sha256sum CodeHaunt.seb` against the organisers' copy.

## Gotchas
- The file holds the unsalted SHA-256 of the SEB quit password: anyone can download it, so the quit password must be
  long and random (ADR-039).
