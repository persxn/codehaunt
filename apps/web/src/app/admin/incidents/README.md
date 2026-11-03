# incidents
Incident dashboard (ADR-021, ADR-028): judge errors after the re-check, sandbox refusals, replaced sessions, slowed logins, runs that failed twice.

## Contents
| Path | What it does |
|---|---|
| `page.tsx` | route (ADMIN, ORGANIZER) |
| `incidents.tsx` | polled every 5 s; per-incident action form (reverse penalty, re-judge, dismiss, end session, deactivate) |

## Affects / depends on
- Calls `/api/admin/ops/events/[id]/incidents` and `/api/admin/ops/incidents/[id]`.

## Entry points & how to test
`/admin/incidents?event=<id>` (ADMIN, ORGANIZER); services in `apps/web/test/contest-ops.test.ts`; access in `packages/auth/test/policy.test.ts`.

## Gotchas
- `internalError` can hold participant output: it is rendered in `<pre>` as text, never as HTML.
- Slowed logins live in the web process memory: a restart clears them.
