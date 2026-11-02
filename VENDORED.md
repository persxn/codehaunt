# Vendored code

Code copied from other repositories at a pinned commit (ADR-001). Upstream fixes are pulled deliberately, never automatically.

| Path | Source | Commit | License | Local changes |
|---|---|---|---|---|
| `packages/judge/` | JojoCode `packages/judge/` (`@cjudge/judge`) | `a8f4056` | MIT (`packages/judge/LICENSE`) | none in `src/` or `test/` (see below) |
| `packages/judge/docker/` | JojoCode `docker/runner/` | `a8f4056` | MIT | `build.sh`: runner path is `../src/runner/runner.py`; default image `codehaunt-runner:1` |
| `packages/auth/src/rate-limit.ts` | JojoCode `packages/db/src/auth/rate-limit.ts` | `a8f4056` | MIT | header note; lockout message says "organizer at the desk" |
| `packages/auth/src/{password,session,login}.ts` | JojoCode `packages/db/src/auth/{password,session,auth}.ts` | `a8f4056` | MIT | ported, not copied: CodeHaunt roles, single participant session, audit entry on replacement |
| `packages/db/src/testing.ts` | JojoCode `packages/db/test/harness.ts` | `a8f4056` | MIT | slimmed; `expectDbError` added |

## How CodeHaunt extends the judge without editing it
- Images: `DockerBackend({ image })` from `apps/worker/src/sandbox/code-runner.ts` selects `codehaunt-runner*:1`, never the
  production `cjudge-runner*` tags.
- Time limits: the judge multiplies by its own `TIME_MULTIPLIER`; `DockerCodeRunner` divides it out so the event config's
  per-language multiplier (ADR-005) is what applies.
- Only the Docker backend is used. The vendored `LocalBackend` has no filesystem isolation and is never constructed.

## Known differences on arm64 (the DGX)
The upstream suite was written on x86. On arm64, 2 of 78 upstream tests fail (`npm test -w @cjudge/judge`); containment holds in both:
- Integer divide by zero doesn't trap (ARM `sdiv` returns 0), so a C/C++ program dividing by zero gets **WA**, not RE.
- An output flood hits the time limit before the output cap: verdict **TLE**, not OLE. The excerpt is still bounded.

## Updating
1. Diff upstream `packages/judge` against the pinned commit; read every change to `backends/` and `runner/`.
2. Copy, run `npm test -w @cjudge/judge` and `npm test -w @codehaunt/worker`, rebuild the runner images.
3. Update the commit in this table.
