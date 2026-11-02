# packages/judge — `@cjudge/judge`: compile, run, verdict

Parent: [packages.md](../packages.md) · Root: [JojoCode.md](../../JojoCode.md) · Images: [docker/docker.md](../../docker/docker.md)

## Purpose

Takes a program and a problem's test cases and returns verdicts and a score. **It is the only
code that executes untrusted student code**, and it only does so through a sandbox backend.
Expected outputs never enter the sandbox: `runner.py` gets inputs only, and comparison happens
outside in `judge.ts`. Languages: **C, C++, Java, Python** (`types.ts` `LANGUAGES`).

## Files

```
src/
├── index.ts            barrel (judge, queue, backends, harness, types, comparator, restrictions)
├── types.ts            Verdict (Codeforces vocabulary), limits/defaults, TestCase/TestResult, Language,
│                       LANGUAGES, TIME_MULTIPLIER (per-language time scaling), CheckerKind
├── judge.ts            judge(): run backend → verdictForRun per test → score (scoreFor); remaps
│                       compile logs through #line, sanitises paths
├── comparator.ts       checkers: case-insensitive/trailing-ws default, strict whitespace, float;
│                       firstDifference for feedback
├── harness.ts          FUNCTION problems: assembles header + student body + generated driver with
│                       #line directives; starter code generation; rejects a student main()
├── restrictions.ts     banned keywords (e.g. forbid `if`/`for`), checked BEFORE compiling on
│                       comment/string-stripped source
├── queue.ts            JudgeQueue: bounded concurrency with two lanes, 'cohort' and 'public', so
│                       strangers cannot starve the class; JudgeAdmissionError when full
├── cli.ts              `cjudge` bin: run | selftest | backend — verify a host sandbox, check a
│                       reference solution, reproduce a disputed submission
├── backends/
│   ├── types.ts        ExecutionBackend contract: run runner.py in isolation, return raw observations
│   ├── index.ts        selectBackend(): Docker always preferred; local only if explicitly enabled (warns)
│   ├── docker.ts       PRODUCTION. One throwaway container per submission (compile once, run all
│   │                   tests). Flags: --network=none, --memory(+swap), --pids-limit, --cpus,
│   │                   --read-only, tmpfs /box (exec) + /tmp (noexec), --cap-drop=ALL,
│   │                   no-new-privileges, --user 65534:65534. Image: CJUDGE_RUNNER_IMAGE
│   │                   (default cjudge-runner:1); per language <name>-<lang>:<tag> or
│   │                   CJUDGE_RUNNER_IMAGE_<LANG>
│   ├── local.ts        DEV ONLY: `unshare --user --net --pid`; no filesystem isolation
│   └── process.ts      JSON in/out subprocess driver with wall-clock budget and bounded output
└── runner/runner.py    in-sandbox: compile + run each test with rlimits, JSON protocol on stdin/stdout.
                        Baked into the images by docker/runner/build.sh; copied to dist by
                        scripts/copy-runner.mjs
test/                   adversarial, comparator, harness, lanes, languages, pipeline, restrictions,
                        load (npm run test:load)
```

## Relationships

- **Callers:** `packages/worker` (`judge-runner.ts`, the production path for every submission) and `packages/db` (`capture-outputs.ts`, `forge-verify.ts`, `submissions.ts` for restrictions). The web app calls it too, from teacher authoring actions (`app/teacher/problems/{output,function}-actions.ts`, `problems/[id]/edit-actions.ts`: capture expected outputs), `lib/banned-keywords.ts`, `lib/playground-cases.ts`, and scripts under `scripts/content/` and `scripts/lib/verify-smallest.ts`.
- **Per-problem language choice** is resolved in `packages/db/src/languages.ts`, not here.
- The worker refuses to start without the Docker backend unless `CJUDGE_ALLOW_LOCAL_BACKEND=1`.

## Technology

TypeScript (strip-types), Python 3 runner, Docker CLI via `child_process`. No npm runtime dependencies.

## Related docs

[docs/lessons.md](../../docs/lessons.md) (sandbox traps) · `scripts/setup/verify-sandbox.sh`.
