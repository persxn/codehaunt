# contest
The participant contest screen (WP-03, as changed by ADR-033): problem list and statement, a code editor the
participant types in (autosaved; paste/copy blocked), saved versions with restore, chat with the AI tutor (typed
questions, filtered replies that can't be copied), sample runs and submissions, token and context meters, banner, consent.

## Contents
| Path | What it does |
|---|---|
| `page.tsx` | route `/contest`; renders `ContestApp` |
| `contest-app.tsx` | screen shell: polls `/api/contest/state` every 5 s, local clock (outlined; pulses in the last 10 min), banner, problems pane (arch numbers, difficulty, solved count) + statement (limits, Input/Output samples), empty state (hooded coder in an arch), tabs below 1280 px |
| `chat-panel.tsx` | tutor chat: turns, live streamed (already filtered) reply, context meter, new chat, question box (Ctrl+Enter, `maxPromptChars`, paste blocked); replies not selectable or copyable; `ModelText` (plain text + code blocks, never HTML) |
| `code-panel.tsx` | the draft (language picker, editor), autosave when changed every 20 s / on hide / on unmount, save-then-run for Run samples / Submit (confirm names the 20% penalty), saved versions + restore, polls unfinished runs every second |
| `tutor-thinking.tsx` / `tutor-thinking.module.css` | the tutor's thinking state: a floating, blinking ghost with rosy cheeks and a three-dot thought bubble; still under reduced motion |
| `code-editor.tsx` | `CodeEditor`: transparent textarea over highlight.js output (4 languages), line numbers, Tab = 4 spaces, Enter keeps indent; `noClipboard` handlers (paste, drop, copy, cut, drag, context menu, paste-type `beforeinput`); the only `dangerouslySetInnerHTML` (hljs output) |
| `runs-panel.tsx` | runs newest first: verdict badge, counts, time, memory, compile log, per-sample results; the newest run's state art in an arch; a verdict that arrives live plays its moment once for its full length (ADR-037: Accepted ring + bats, rejected shake; R17-1), never on reload |
| `consent-dialog.tsx` | blocking consent dialog (ADR-010): required agree, guardian when the event allows minors, optional reuse; ghost header, cornered, checkbox rows outlined when ticked |
| `api.ts` | `getJSON`, `postJSON` (errors carry the server's message), `streamPrompt` (NDJSON reader, always ends in one done/error) |
| `contest.module.css` | layout (column shell, three framed panes at 1366×768, tabs, one column ≤ 720 px) and styles, design tokens only; keyframes `rise`/`drop`/`pop`/`shake`/… (transform/opacity), reduced-motion overrides |

## Affects / depends on
- Calls `/api/contest/*` (state, consent, problems, workspace, code, sessions, revert, prompt, runs).
- Depends on `src/components/` (Button, Meter, Banner, VerdictBadge, Wordmark, icons), `@codehaunt/contracts` types
  (type imports only, no zod in the browser), `highlight.js`.

## Entry points & how to test
`/contest` as a checked-in participant (dev: `npm run dev -w @codehaunt/web`). E2E: WP-03 task 8.

## Gotchas
- Paste/copy blocking in the browser can be bypassed; SEB's clipboard policy (`deploy/seb/`) and the server-side integrity flags (WP-07) back it up. The editor's textarea text is transparent: keep its font, size, padding and line height identical to `.code`, or the caret drifts from the colours.
- Motion (ADR-037): nothing animates inside the editor (typing latency); verdict moments are keyed by verdict so they replay only on a live change.
- Runs always use a saved version: `run()` saves first and runs the returned id.
- Model and participant text is rendered as text, never as HTML. Only hljs output (which escapes) is injected.
- The prompt stream is NDJSON; a replayed idempotency key answers one JSON event instead.
- A reply that fails is discarded server-side (not charged); the panel shows the server's message.
