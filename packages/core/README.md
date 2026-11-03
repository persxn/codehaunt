# @codehaunt/core

Framework‑free business‑logic library for the CodeHaunt platform. It contains pure functions and type definitions with **no I/O** – suitable for both server‑side and client‑side usage.

## Contents
| Path | What it does |
|---|---|
| `src/` | Pure source files (`extract-code.ts`, `contest-clock.ts`, `language.ts`, `verdict-projection.ts`, `scoring.ts`, `index.ts`). |
| `test/` | Unit tests for the pure functions. |
| `package.json` | NPM package metadata. |
| `tsconfig.json` | TypeScript configuration (extends the workspace base). |

## Used by
- `apps/web` – API routes and UI logic.
- `apps/worker` – contest execution and judging.

## How to test
```sh
npm test -w @codehaunt/core
```
Runs the TypeScript type‑check and the Node test runner.
