# CodeHaunt

AI‑assisted coding‑contest harness: participants write their own code and may ask a small AI tutor about concepts, under a strict token budget (ADR-033). Solutions run in a sandboxed Docker judge; process quality is evaluated by an LLM judge.

## Quick start (development)
- Prereqs: Node 22, Docker.
- `cp .env.example .env`, then set `POSTGRES_PASSWORD`, `WEB_DB_PASSWORD` and `WORKER_DB_PASSWORD` (each
  `openssl rand -hex 16`) and put the
  Postgres password in `DATABASE_URL`.
- `make runners` – build sandbox runner images.
- `make dev` – start Postgres, apply migrations, seed demo data.
- `npm run dev -w @codehaunt/web` → http://127.0.0.1:3100 (seeded logins shown by `make seed`).

## Contents
| Path | What it does |
|---|---|
| `.gitignore` | files ignored by git |
| `.dockerignore` | files ignored by Docker builds |
| `.env.example` | template environment variables |
| `LICENSE` | MIT |
| `Makefile` | common development commands |
| `VENDORED.md` | list of vendored upstream code |
| `docker-compose.yml` | canonical install: profile `db` (Postgres) and `core` (+ migrate, web, worker, docker-proxy); profile `judge`: the batch judge and its Ollama relay (ADR-035); internal networks, hardened containers; web gets `GATEWAY_*`, worker `JUDGE_CONCURRENCY` from `.env` |
| `package.json` | root npm workspace definition; `overrides` pins patched `postcss` |
| `package-lock.json` | lockfile |
| `tsconfig.base.json` | shared compiler options every workspace extends |
| `tsconfig.json` | typechecks `scripts/` (part of `npm run typecheck`) |
| `apps/` | web, worker, docker-proxy (DGX) and gateway (GPU cluster) services |
| `e2e/` | end-to-end tests (Playwright) of the participant flow against the live stack (`e2e/README.md`) |
| `deploy/` | deployment manifests outside Docker Compose: the GPU cluster (`deploy/README.md`) |
| `packages/` | shared libraries (auth, db, judge, …) |
| `scripts/` | tooling scripts (README checks, CI, seeding) |

## Affects / depends on
- Affects: every component of the contest platform; changing top‑level config impacts all workspaces.
- Depends on: Node 22, Docker, a PostgreSQL server (via `docker compose`).

## Entry points & how to test
- `make test` – run all unit/integration tests (requires Docker runner images).
- `make check-readmes` – verify all folder READMEs are up‑to‑date.
- `make e2e` – end-to-end tests against the live gateway (practice DB only; never during the event).
- `make ci` – full CI pipeline (lint, typecheck, tests).

## Gotchas
- The stack runs on 127.0.0.1 only until Cloudflare values are set in `.env`.
- Only `docker-proxy` mounts the Docker socket and only `migrate` holds the DB owner password (ADR-019). Keep it so.
- `make ci` starts the compose Postgres for the concurrency tests (needs `.env`).
- Never point `DATABASE_URL` at another product's database: CodeHaunt's migrations and seed would write into it.
- Full stack in containers: `make runners && docker compose --profile core up -d --wait` (web on 127.0.0.1:3100).
