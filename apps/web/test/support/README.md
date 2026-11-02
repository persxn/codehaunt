# test/support
Test-only setup for the web tests.

## Contents
| Path | What it does |
|---|---|
| `next-resolve.mjs` | Node resolve hook mapping `next/server` to `next/server.js` (Next ships no exports map) |
| `fixtures.ts` | `setup()` (running event, problem with visible + hidden tests, checked-in participant), `fakeModel()`, `eventConfig()`, hidden-test marker strings |

## Affects / depends on
- Loaded by the web `test` script with `--import`; never part of the app build.

## Entry points & how to test
`npm test -w @codehaunt/web`.

## Gotchas
- Remove it if Next adds an exports map for `next/server`.
