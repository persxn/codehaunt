# contest
The participant contest screen (WP-03): problem list and statement, chat with the junior-developer model, read-only
code with version history and revert, sample runs and submissions, token and context meters, contest banner, consent.

## Contents
| Path | What it does |
|---|---|
| `page.tsx` | route `/contest`; renders `ContestApp` |
| `contest-app.tsx` | screen shell: polls `/api/contest/state` every 5 s, local clock, banner, problem list + statement, tabs below 1280 px |
| `chat-panel.tsx` | turns, live streamed reply, context meter, language picker, new session, prompt box (Ctrl+Enter); `ModelText` (plain text + code blocks, never HTML) |
| `code-panel.tsx` | current code, versions + revert, Run samples / Submit (confirm), polls unfinished runs every second |
| `code-view.tsx` | read-only highlighted code (highlight.js core, 4 languages), line numbers; the only `dangerouslySetInnerHTML` (hljs output) |
| `runs-panel.tsx` | runs newest first: verdict badge, counts, time, memory, compile log, per-sample results |
| `consent-dialog.tsx` | blocking consent dialog (ADR-010): required agree, guardian when the event allows minors, optional reuse |
| `api.ts` | `getJSON`, `postJSON` (errors carry the server's message), `streamPrompt` (NDJSON reader, always ends in one done/error) |
| `contest.module.css` | layout and styles, design tokens only |

## Affects / depends on
- Calls `/api/contest/*` (state, consent, problems, workspace, sessions, revert, prompt, runs).
- Depends on `src/components/` (Button, Meter, Banner, VerdictBadge, Wordmark, icons), `@codehaunt/contracts` types
  (type imports only, no zod in the browser), `highlight.js`.

## Entry points & how to test
`/contest` as a checked-in participant (dev: `npm run dev -w @codehaunt/web`). E2E: WP-03 task 8.

## Gotchas
- The code view is read-only by design (ADR-007): no input, no contentEditable; paste/drop are blocked.
- Model and participant text is rendered as text, never as HTML. Only hljs output (which escapes) is injected.
- The prompt stream is NDJSON; a replayed idempotency key answers one JSON event instead.
- A reply that fails is discarded server-side (not charged); the panel shows the server's message.
