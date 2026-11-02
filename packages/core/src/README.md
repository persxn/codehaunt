# src

## Contents
| File | Description |
|---|---|
| `index.ts` | Barrel export of the core public API. |
| `language.ts` | Language‑to‑fence‑tag mapping. |
| `verdict-projection.ts` | Security‑critical verdict projection logic. |
| `extract-code.ts` | Extract code blocks from model replies. |
| `contest-clock.ts` | Compute contest clock state.

## Gotchas
- `verdict-projection` is security‑critical and Claude‑owned – never return `internalError` or hidden‑test output.
- All functions are pure; they contain **no side‑effects** or I/O.
