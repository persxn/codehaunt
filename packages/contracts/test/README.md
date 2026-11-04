# contracts/test
Contract tests for `@codehaunt/contracts`.

## Contents
| Path | What it does |
|---|---|
| `judge-review.test.ts` | judge output strict/bounded, exact problem coverage, no hidden-test fields in the input; `judge-v2` (ADR-033) input kinds, snapshot cap, tutor-mode criteria |
| `contracts.test.ts` | defaults, strictness, hidden-test exclusion, size and format limits for every schema |

## Affects / depends on
- Depends on: `../src/index.ts` only.

## Entry points & how to test
`npm test -w @codehaunt/contracts`.

## Gotchas
Add a case here whenever a schema gains a rule that protects hidden data or bounds input.
