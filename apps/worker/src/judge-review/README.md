# judge-review
The batch process-quality judge (WP-07, ADR-033 rubric `judge-v2`, route ADR-035). Runs once after the contest in
the one-shot `judge-review` container (host network: Postgres and Ollama on 127.0.0.1); the long-running worker
never calls it.

## Contents
| Path | What it does |
|---|---|
| `main.ts` | entry point: validates `DATABASE_URL`, `JUDGE_OLLAMA_URL`, `JUDGE_MODEL`, `JUDGE_THINK`; drains the queue; exits |
| `review.ts` | `[claude]` `claimJudgeJob` (SKIP LOCKED), `requeueStuckJudgeJobs` (30 min), `askJudge` (≤ 3 calls: try, repair turn, fresh try), `parseJudgeReply` (JSON, `JudgeOutputV2`, exact problem coverage), `judgeJob` (writes per-problem + overall `judge_reviews` and DONE in one transaction, or NEEDS_MANUAL), `drainJudgeQueue` |
| `build-input.ts` | `[claude]` `buildJudgeInput`: one participant's `JudgeInputV2` from the DB (questions, filtered replies, saves with burst flags, runs/submits as verdict + counts, ≤ 4 snapshots, final code = first accepted version or newest, metrics, integrity flags) |
| `drafts.ts` | WP-07 task 8: `draftForEvent` asks GPT-OSS per problem for 3–6 small edge-case tests + one naive solution (`DraftReply`), stores `problem_drafts`; refused once the event is locked. Run: `... run --rm judge-review drafts <eventId>` |
| `ollama.ts` | `OllamaJudgeModel`: Ollama `/api/chat`, `format` = the output JSON schema, `think` low by default, temperature 0, 10-minute timeout |

## Affects / depends on
- Reads events, problems, chat sessions, prompt turns, code versions, submissions + verdicts, calibration runs;
  writes `judge_reviews` and `judge_jobs` (worker role grants, `packages/db/src/app-role.ts`).
- The leaderboard's process-quality component reads the newest overall row (problemId null) per participant.
- Depends on `@codehaunt/core` (`judge-prompt-v2`, `integrity-flags`, `process-metrics`, `reply-filter`).

## Entry points & how to test
`npm test -w @codehaunt/worker` (`test/judge-review.test.ts`, PGlite + a fake model). Real run: `scripts/judge-golden.ts`.

## Gotchas
- Hidden tests never enter the input: submissions contribute verdict and counts only (a test asserts it).
- The judge sees replies as the participant saw them (filtered); staff still see the stored, unfiltered reply.
- `judge_jobs.error` holds schema paths and counts only, never participant text.
