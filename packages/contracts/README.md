# contracts
Zod schemas for every shape that crosses a boundary: API requests/responses, event config, problems, judge I/O.
The single source of truth for validation and types (`z.infer`).

## Contents
| Path | What it does |
|---|---|
| `src/` | the schemas (details in `src/README.md`) |
| `test/` | contract tests (`test/README.md`) |
| `package.json` | `@codehaunt/contracts`; depends on zod 4 only |
| `tsconfig.json` | extends the root base config |

## Affects / depends on
- Used by: `apps/web` (API routes, login form), `apps/worker` (CodeRunner, jobs), `apps/gateway` (chat request/error shapes), `scripts/seed.ts`.
- Depends on: zod 4.
- Changing a schema changes what every API accepts and returns; DB fields that overlap must match `packages/db/prisma/schema.prisma`.

## Entry points & how to test
`import { EventConfig, RunRequest, … } from '@codehaunt/contracts'`. Test: `npm test -w @codehaunt/contracts`.

## Gotchas
- `ParticipantProblem` and `ParticipantVerdict` are the only shapes participant routes may return for problems and verdicts.
  They are `.strict()`, so hidden tests or reference solutions fail validation instead of leaking.
- Don't hand-write duplicate types elsewhere; derive them from these schemas.
