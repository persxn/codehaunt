<div align="center">

<img src=".github/readme/icons/app-icon.png" alt="CodeHaunt reaper mascot" width="120">

# CodeHaunt

**A locked-down, AI-tutored coding contest you can host yourself.**
Participants write every line of their code; a small local AI tutor explains ideas but never writes the solution.
Code is judged in a sandbox; the *way* people used the tutor is judged afterwards by a larger local model.

<p>
<img alt="Next.js 15" src="https://img.shields.io/badge/Next.js-15-000000?logo=nextdotjs&logoColor=white">
<img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white">
<img alt="Node 22" src="https://img.shields.io/badge/Node-22-5FA04E?logo=nodedotjs&logoColor=white">
<img alt="PostgreSQL 16" src="https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white">
<img alt="Prisma 7" src="https://img.shields.io/badge/Prisma-7-2D3748?logo=prisma&logoColor=white">
<img alt="Docker Compose" src="https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white">
<img alt="vLLM" src="https://img.shields.io/badge/vLLM-k3s-FF6F00">
<img alt="Ollama" src="https://img.shields.io/badge/Ollama-GPT--OSS--120B-111111?logo=ollama&logoColor=white">
<img alt="Safe Exam Browser" src="https://img.shields.io/badge/Safe%20Exam%20Browser-required-7C3AED">
<img alt="Cloudflare Tunnel" src="https://img.shields.io/badge/Cloudflare-Tunnel%20%2B%20WAF-F38020?logo=cloudflare&logoColor=white">
<img alt="Playwright" src="https://img.shields.io/badge/E2E-Playwright-2EAD33?logo=playwright&logoColor=white">
<img alt="MIT license" src="https://img.shields.io/badge/license-MIT-F59E0B">
</p>

<a href="#-see-it-in-action">See it</a> ·
<a href="#-why-we-built-it">Why</a> ·
<a href="#-architecture">Architecture</a> ·
<a href="#-run-it-yourself">Run it</a> ·
<a href="#-composing-it-for-a-real-event">Production</a> ·
<a href="#-repository-map">Code map</a>

<br><br>

<img src=".github/readme/demo/participant-flow.gif" alt="A participant signs in inside Safe Exam Browser, accepts the logging consent, opens a problem, asks the tutor how Python's split() treats repeated spaces, types a solution by hand, runs the samples and submits: Accepted." width="900">

<sub>Real recording of a local stack with made-up contestants. The tutor reply is a live answer from the local model; the bar at the bottom is a stand-in for SEB's taskbar.</sub>

</div>

---

## <img src=".github/readme/icons/lantern.svg" width="26" align="top"> Why we built it

CodeHaunt was built for a college coding night run by the CSI Student Chapter at UEM Kolkata. The brief was
unusual: **allow AI, but keep the contest about the students.**

Most contests pick one of two bad options:

| Option | What goes wrong |
|---|---|
| Ban AI | Unenforceable on personal laptops, and it ignores how people actually learn to program today. |
| Allow any AI | The fastest prompter wins. Nobody can tell who understood the problem. |

CodeHaunt takes a third path:

- **Students type every line.** The editor blocks paste, drop and copy. Saves are versioned, and a sudden jump in code size is flagged.
- **The AI is a tutor, not a ghostwriter.** It never sees the student's code or the problem statement. It answers questions about concepts, and a server-side filter removes any code block longer than 3 lines before the student sees it.
- **Tokens cost something.** Each participant has a token budget, reserved before every call and settled afterwards, and the token count shows on screen. Using fewer tokens is worth 15% of the score.
- **The process counts.** After the contest a 120B model reads each student's questions, code versions and runs, and scores *how* they worked against a fixed rubric. Organisers can review and override every score.
- **The room stays honest.** The contest only opens inside Safe Exam Browser, checked both at the Cloudflare edge and again in the app.
- **Everything runs on hardware we own.** The tutor runs on a 4-GPU k3s cluster; the judge model, the database and the sandbox run on a DGX Spark. No participant data goes to a third-party AI API.

The result is one system that runs the whole evening: registration, QR check-in at the door, the contest itself,
a live projector board, process review and final results.

---

## <img src=".github/readme/icons/eye.svg" width="26" align="top"> See it in action

All screenshots and recordings come from a real local CodeHaunt stack filled with **made-up contestants and practice
problems**. No real participant data and no hidden tests appear anywhere in this README.

### Getting in: Edge → Safe Exam Browser

<table>
<tr>
<td width="55%"><img src=".github/readme/demo/edge-to-seb.gif" alt="A participant signs in from a normal browser and is sent to an 'Open Safe Exam Browser' page with the steps and a fallback for people without SEB."></td>
<td>

A participant who signs in from an ordinary browser is **not** let in. The login checks the password first, then
opens a handoff page. It launches SEB through a `sebs://` link to the event's `.seb` config, explains the three
steps, and links to the official download for anyone who doesn't have SEB yet.

Inside SEB, every request carries `X-SafeExamBrowser-ConfigKeyHash`, which is SHA-256 of the URL plus the Config Key.
Cloudflare's WAF rejects contest paths without it, and the app verifies the hash again against its own copy of the key.

</td>
</tr>
</table>

| Landing page | Sign-in | Pre-event system check |
|---|---|---|
| <img src=".github/readme/screenshots/landing.png" alt="Public landing page with the CodeHaunt title, event date and the reaper artwork"> | <img src=".github/readme/screenshots/login.png" alt="Sign-in page explaining that participants sign in inside Safe Exam Browser"> | <img src=".github/readme/screenshots/system-check.png" alt="System check page reporting browser, connection latency, screen size and clock"> |

### The participant, inside Safe Exam Browser

<sub>SEB itself only runs on Windows/macOS. These pages were captured in Chromium sending the same Config-Key header,
then framed with a stand-in SEB taskbar so you can see what a participant sees.</sub>

<img src=".github/readme/screenshots/seb-contest.png" alt="Contest screen: problem list and statement on the left, the tutor chat in the middle with a question and its answer, the code editor and runs on the right showing an accepted sample run.">

| Consent before the clock starts | A wrong answer, and what it costs | Sign-in inside SEB |
|---|---|---|
| <img src=".github/readme/screenshots/seb-consent.png" alt="Consent dialog: questions, replies and every code version are logged and judged; anonymised after 30 days"> | <img src=".github/readme/screenshots/seb-wrong-answer.png" alt="Runs panel showing a Wrong answer submission with 5 of 6 tests passed"> | <img src=".github/readme/screenshots/seb-login.png" alt="Sign-in page as shown inside Safe Exam Browser"> |

What the participant screen enforces:

- **Three panes, no page scroll** at 1366×768: problems + statement, tutor, editor + runs.
- **Typing only.** Paste, drop and copy do nothing in the editor and the chat box (`typing only, paste is off`).
- **Two meters:** total tokens left for the event, and how full this problem's tutor context is.
- **Autosave** every 20 s and on every run or submit. Each save is a version the judge can read later.
- **Sample runs are free.** Each counted wrong submission costs 20% of the problem's value, and the confirm dialog says so.

### The organisers

<img src=".github/readme/screenshots/admin-leaderboard.png" alt="Admin leaderboard: rank, name, per-problem points with attempts, correctness, tokens, token efficiency, memory and time, process score and total, with an override control per row.">

| Overview + door funnel | Contest clock | Judge review |
|---|---|---|
| <img src=".github/readme/screenshots/admin-overview.png" alt="Overview with counts of checked-in, consented and badge-issued participants and a door funnel"> | <img src=".github/readme/screenshots/admin-contest.png" alt="Contest page with time left, pause, end, extend and projector link controls"> | <img src=".github/readme/screenshots/admin-review.png" alt="Judge review list with process scores, statuses and flags such as identical final code"> |

| Problems | Participants + CSV import | Incidents |
|---|---|---|
| <img src=".github/readme/screenshots/admin-problems.png" alt="Problems table with visible/hidden test counts and reference solutions"> | <img src=".github/readme/screenshots/admin-participants.png" alt="Participants page with CSV import and per-person export and delete"> | <img src=".github/readme/screenshots/admin-incidents.png" alt="Incidents page with judge incidents and replaced sessions"> |

| Event settings | Help desk | Staff |
|---|---|---|
| <img src=".github/readme/screenshots/admin-event.png" alt="Event editor showing that a running event only allows budget and schedule changes"> | <img src=".github/readme/screenshots/admin-desk.png" alt="Volunteer desk with search by name, enrolment or seat"> | <img src=".github/readme/screenshots/admin-staff.png" alt="Staff accounts table and form to add a volunteer"> |

<table>
<tr>
<td width="33%" align="center"><img src=".github/readme/screenshots/checkin-mobile.png" alt="QR check-in page on a phone" width="240"><br><sub>QR check-in on a volunteer's phone</sub></td>
<td width="33%" align="center"><img src=".github/readme/screenshots/admin-mobile.png" alt="Admin overview on a phone" width="240"><br><sub>Admin console on a phone</sub></td>
<td width="33%" align="center"><img src=".github/readme/screenshots/landing-mobile.png" alt="Landing page on a phone" width="240"><br><sub>Public page on a phone</sub></td>
</tr>
</table>

### The hall projector

<img src=".github/readme/demo/projector-live.gif" alt="Projector board updating live: a participant solves a second problem and moves from fifth to second place.">

Opened from an unguessable link (only its hash is stored), with no login. It shows rank, name and problems solved,
and nothing else. It freezes in the final minutes so the ending stays a surprise.

---

## <img src=".github/readme/icons/layers.svg" width="26" align="top"> Architecture

<img src=".github/readme/diagrams/architecture.svg" alt="CodeHaunt architecture: participants in SEB reach Cloudflare's WAF and tunnel, which lead to the DGX Spark running web, worker, docker-proxy, sandbox runners, Postgres, the batch judge and GPT-OSS-120B; the DGX reaches a k3s GPU cluster with two gateways and four vLLM model servers over Tailscale.">

| Tier | Runs | Why there |
|---|---|---|
| **Edge**: Cloudflare | TLS, WAF rule for the SEB header, login rate limit, tunnel (2 connectors) | No inbound ports on our machines; bad requests stop before they reach us |
| **App**: DGX Spark, Docker Compose | `web` (Next.js), `worker`, `docker-proxy`, sandbox runners, Postgres 16, `judge-review` + `judge-relay`, GPT-OSS-120B in Ollama | Hidden tests, personal data and the judge model never leave one machine |
| **Inference**: k3s GPU cluster | `gateway-a`/`gateway-b`, four vLLM servers (Qwen3-4B-Instruct FP8, one RTX 5070 each) | 50 concurrent tutor sessions with p95 time-to-first-token around 1 s |

### Asking the tutor

<img src=".github/readme/diagrams/tutor-flow.svg" alt="Sequence: the question is checked, tokens are reserved, the gateway counts and caps tokens, the model answers without seeing code, the reply is filtered and the reservation settled.">

Design points that matter:

- **Reserve, then call.** `token_ledger` is append-only (Postgres triggers reject UPDATE/DELETE); the balance is a sum.
  The web API reserves the maximum the call could cost under a per-participant lock, and settles with the gateway's
  exact usage. If the call fails, the whole reservation is released.
- **The gateway holds no balance.** It counts the prompt with the model's own `/tokenize`, refuses prompts that don't
  fit, sets `max_tokens` so the reply cannot overspend, and sends each request to the least-busy healthy node.
- **Built for a slow link.** The DGX reaches the cluster over a Tailscale relay (~78 ms, ~0.5 MB/s). The gateway
  re-encodes vLLM's stream and merges tokens every 100 ms, which brought time-to-first-token from as much as 22 s in an early load test down to a p95 under 1 s with 50 sessions.
- **Context isolation.** Each problem gets a fresh tutor session. The model sees only the `tutor-v1` system prompt and
  that session's turns: no statement, no code, no tests.

### Judging

<img src=".github/readme/diagrams/judging-flow.svg" alt="Submission path from the submissions table through worker, docker-proxy and sandbox to verdict, scoring and leaderboard; after the contest the batch judge feeds the review screen and the final score.">

- **The queue is a table.** `submissions` rows are claimed with `FOR UPDATE SKIP LOCKED`. A crashed worker's rows are
  requeued, and an idempotency key stops double submits. No Redis, no broker.
- **The sandbox is reachable only through a proxy.** The worker has no Docker socket. `docker-proxy` allows the 7 API
  calls the judge needs, rebuilds every container from a fixed template (`--network=none`, read-only root, uid 65534,
  all capabilities dropped, memory/pid/CPU limits) and caps live sandboxes. Tampering with the runner gives IE, never AC.
- **Two judges, kept apart.** Correctness is deterministic and immediate. Process quality is scored once, after the
  contest, by GPT-OSS-120B with the `judge-v2` rubric and a JSON schema, up to 3 attempts, otherwise "needs manual".
  The judge sees each participant's questions, filtered replies, code snapshots and run verdicts, never the hidden tests.
  Participant text is treated as untrusted, and the judge reports any injection attempt it finds.
- **Score** = 55% correctness (time decay, −20% per wrong try) + 15% token efficiency + 10% memory and runtime
  (against calibrated reference solutions) + 20% process quality.

### Defence in depth

<img src=".github/readme/diagrams/security-layers.svg" alt="Six nested layers: SEB, Cloudflare edge, app policy and sessions, ledger and tutor guard, database roles, sandbox.">

Some invariants the code keeps on purpose:

- `packages/auth/src/policy.ts` is **deny by default**. A route that isn't listed returns 401/403, and a test fails if a public route is missing from the list.
- Only `docker-proxy` mounts the Docker socket. Only the one-shot `migrate` container holds the database owner password. `web` and `worker` each log in with their own role and per-table grants.
- One live session per participant. A second login ends the first one and is recorded as an incident.
- Logins are slowed, never refused (up to 10 s per username), so a lab full of students can't be locked out by a typo storm.
- Every staff action that changes the contest (pause, extend, override, top up, disqualify) needs a reason and is written to the append-only `audit_log`.

### Event lifecycle

<img src=".github/readme/diagrams/event-lifecycle.svg" alt="Set up, check-in, running with pause and extend, ended, process judge, provisional results with appeals, final.">

---

## <img src=".github/readme/icons/terminal.svg" width="26" align="top"> Run it yourself

This gets you a full local stack (database, web, worker and sandbox) in about ten minutes. The tutor needs a
model endpoint, covered in [step 5](#5-give-it-a-tutor).

### 1. Prerequisites

| Need | Check |
|---|---|
| Linux or macOS, x86-64 or arm64 | `uname -m` |
| Node.js 22 | `node -v` |
| Docker Engine 24+ with Compose v2 | `docker compose version` |
| ~6 GB free disk for the four runner images | `df -h` |
| Optional: an NVIDIA GPU with 12 GB+ for the tutor | `nvidia-smi` |

### 2. Clone and configure

```bash
git clone https://github.com/persxn/codehaunt.git && cd codehaunt
cp .env.example .env
```

Fill in `.env`. Every key is documented in `.env.example`. The minimum for local work:

```bash
# three different secrets
POSTGRES_PASSWORD=$(openssl rand -hex 16)
WEB_DB_PASSWORD=$(openssl rand -hex 16)
WORKER_DB_PASSWORD=$(openssl rand -hex 16)
# DATABASE_URL must carry POSTGRES_PASSWORD
DATABASE_URL=postgresql://codehaunt:<POSTGRES_PASSWORD>@127.0.0.1:5434/codehaunt
DOCKER_GID=$(getent group docker | cut -d: -f3)
COOKIE_SECURE=false          # local http only; never in production
```

Leave `SEB_CONFIG_KEY` and `PUBLIC_ORIGIN` empty for now. With both empty, SEB isn't enforced on localhost.

### 3. Build the sandbox and start the database

```bash
make install       # npm workspaces
make runners       # codehaunt-runner{,-cpp,-java,-python}:1
make dev           # Postgres on 127.0.0.1:5434, migrations, demo seed
```

`make dev` prints a one-time password for `admin`, `p1`, `p2` and `p3`. The demo event opens for check-in tomorrow.
For an event that is **running right now**, with checked-in participants:

```bash
node --env-file=.env --experimental-strip-types scripts/seed-test-event.ts \
  --slug test-local --participants 5 --minutes 180 --running
```

### 4. Start web and worker

```bash
npm run dev -w @codehaunt/web          # http://127.0.0.1:3100
npm run start -w @codehaunt/worker     # judges runs and submissions
```

Sign in as `admin` at `/login` for the console, or as a participant for `/contest`.

### 5. Give it a tutor

The web API talks to the CodeHaunt **gateway**, not to a model directly. Run vLLM with any small instruct model,
then the gateway in front of it:

```bash
# a model server (one GPU)
docker run --gpus all -p 8000:8000 vllm/vllm-openai:v0.33.0 \
  --model Qwen/Qwen3-4B-Instruct-2507-FP8 --served-model-name junior --max-model-len 10240

# the gateway (token caps, routing, compact streaming)
GATEWAY_TOKEN=$(openssl rand -hex 32) GATEWAY_MODEL=junior \
GATEWAY_NODES=node0=http://127.0.0.1:8000 GATEWAY_PORT=8080 \
  npm start -w @codehaunt/gateway
```

Then set `GATEWAY_URL=http://127.0.0.1:8080` and the same `GATEWAY_TOKEN` in `.env`, and restart web.
More nodes go in `GATEWAY_NODES` as a comma-separated list. The k3s manifests in `deploy/gpu-cluster/` run the same
thing as two gateways and one model server per GPU node.

### 6. Check it

```bash
make test           # unit + integration (PGlite, real runner images)
make check-readmes  # every folder's README matches its contents
make ci             # lint, typecheck, all tests
make e2e            # Playwright: full participant + admin + contest-ops flows (uses the real model)
```

---

## <img src=".github/readme/icons/compose.svg" width="26" align="top"> Composing it for a real event

Development runs on the host. A real event runs entirely in Compose, with the hardening already in
`docker-compose.yml`. This section covers each layer and why it is set up the way it is.

### Compose profiles

| Profile | Services | When |
|---|---|---|
| `db` | `postgres` | development: just the database |
| `core` | `postgres`, `migrate` (one-shot), `web`, `worker`, `docker-proxy` | the event |
| `judge` | `judge-relay`, `judge-review` (one-shot) | after the contest, and for test-case drafts before it |

```bash
make runners
docker compose --profile core up -d --wait      # web on 127.0.0.1:${WEB_PORT:-3100}
```

What the compose file already does for you:

- **Networks.** `db` and `sandbox` are `internal: true`. `worker` sits on those two only, so it cannot reach the internet, the GPU cluster or the host. `web` is the only service on `edge`, and it publishes on `127.0.0.1` only.
- **Containers.** Every service runs `read_only`, `cap_drop: [ALL]`, `no-new-privileges`, with memory and pid limits. `web` gets `.next/cache` on a bounded tmpfs.
- **Secrets by role.** `migrate` alone receives the owner password and creates the `codehaunt_web` and `codehaunt_worker` roles. `web` and `worker` connect as those roles.
- **The judge's way out.** `judge-review` lives on `db` only. It reaches Ollama through `judge-relay`'s unix socket, which forwards `POST /api/chat` and nothing else, with a 1 MiB body cap.

### Putting it on the internet

1. **Tunnel, not ports.** Create a Cloudflare Tunnel to `http://127.0.0.1:3100` (see `deploy/tunnel/`). Run **two
   connectors** as separate user units, so restarting one never drops the site.
2. **WAF rule.** Block `/contest*` and `/api/contest*` when `X-SafeExamBrowser-ConfigKeyHash` is missing.
3. **Rate limit** `/api/auth/login` and `/api/account/password` per IP.
4. **Build the `.seb` file** in the SEB Configuration Tool (settings in `deploy/seb/`). Use the start URL
   `https://<host>/login?seb=1`, turn on sending the Config Key, and set a quit password. Copy the Config Key into
   `SEB_CONFIG_KEY`, set `PUBLIC_ORIGIN=https://<host>`, unset `COOKIE_SECURE`, and put the file at
   `apps/web/public/CodeHaunt.seb` so the handoff page can serve it.
   *Any* change to SEB settings changes the key, so copy it again and restart web.

### Releases you can undo in seconds

```bash
deploy/release/predeploy-check.sh .env   # refuses Secure-cookie off, half SEB config, seed passwords, …
git tag v1.2.3 && deploy/release/deploy.sh v1.2.3
deploy/release/rollback.sh               # back to :previous (measured 33 s)
```

`deploy.sh` requires a clean checkout at the tag, keeps the running images as `:previous`, builds, waits for health
and checks `/healthz`. Rollback only works because migrations are **expand-then-contract**: never drop or rename a
column in the release that stops using it.

### Backups

`deploy/release/codehaunt-backup.timer` runs `pg_dump` every 5 minutes to two hosts, keeping the last 72 dumps.
`restore.sh` restores into a check database by default. `--live` needs a typed confirmation and saves the current
database first. After the event, `retire-backups.sh` stops the timer, and `--purge` removes the dumps when the
retention period ends.

### Event-day rules we learned the hard way

- Nothing large downloads on the cluster or the app host during the contest. The tutor's link shares the uplink.
- Don't run the batch judge, load tests or E2E during the event. The DGX is serving the contest.
- Approve any SSH/Tailscale re-authentication *before* doors open, so off-host backups keep flowing.
- Run `seed-test-event.ts` for rehearsals and `delete-test-event.ts` (dry run first) to remove them.

---

## <img src=".github/readme/icons/api.svg" width="26" align="top"> HTTP API

Every route is listed in `packages/auth/src/policy.ts`. Anything not listed is refused.

| Prefix | Who | Highlights |
|---|---|---|
| `/api/auth/*` | public / any role | `login`, `logout`, `me` |
| `/api/account/password` | any role | strength rules: 12+ chars, not common, not containing the username |
| `/api/contest/*` | participant (in SEB) | `state`, `problems`, `consent`, `code` (autosave), `prompt` (tutor, streamed), `runs`, `sessions`, `revert` |
| `/api/projector/:token` | token holder | rank, name, solved: nothing else |
| `/api/staff/*` | admin, organiser, volunteer | `checkin` (QR), `participants` search, `promote` from waitlist |
| `/api/admin/*` | admin, organiser | events, problems (+ `calibrate`, GPT-OSS `drafts`), participants `import`, `badges`, `ops/*` (pause, extend, extra time, top-up, override, incidents, leaderboard, results), `review/*` (queue, requeue), `staff`, `roles` |

All request and response shapes are zod schemas in `packages/contracts`, shared by the web app, the gateway and the tests.

---

## <img src=".github/readme/icons/map.svg" width="26" align="top"> Repository map

Every folder has a `README.md` that lists its files, what depends on it, and how to test it. CI fails if one is
missing or out of date. Start with these:

| Path | What it does |
|---|---|
| `apps/web/` | Next.js app: public pages, participant contest screen, admin console, projector, `/api/*` |
| `apps/worker/` | judges sample runs and submissions through `CodeRunner`; `src/judge-review/` is the batch process judge |
| `apps/docker-proxy/` | the only holder of the Docker socket; allows 7 calls and enforces the sandbox template |
| `apps/gateway/` | inference gateway for the GPU cluster: token counting, caps, routing, compact streaming |
| `packages/auth/` | sessions, passwords, login slow-down, SEB hash check, the route policy |
| `packages/core/` | framework-free rules: scoring, contest clock, reply filter, judge prompt, integrity flags |
| `packages/contracts/` | zod schemas for every boundary |
| `packages/db/` | Prisma schema, migrations, per-table role grants |
| `packages/judge/` | vendored sandboxed judge (pinned, see `VENDORED.md`) |
| `deploy/` | `release/` (deploy, rollback, backup), `tunnel/`, `seb/`, `gpu-cluster/` |
| `e2e/` | Playwright suites: participant, admin, contest operations |
| `scripts/` | seeding, test events, staff accounts, README check, CI |
| `.github/readme/` | the images, recordings and diagrams on this page |

<details>
<summary><b>Root files</b></summary>

## Contents
| Path | What it does |
|---|---|
| `.gitignore` | files ignored by git |
| `.dockerignore` | files ignored by Docker builds |
| `.env.example` | template environment variables, each one documented |
| `LICENSE` | MIT |
| `Makefile` | common development commands (`make help`) |
| `VENDORED.md` | list of vendored upstream code |
| `docker-compose.yml` | canonical install: profile `db` (Postgres) and `core` (+ migrate, web, worker, docker-proxy); profile `judge`: the batch judge and its Ollama relay; internal networks, hardened containers |
| `package.json` | root npm workspace definition; `overrides` pins patched `postcss` |
| `package-lock.json` | lockfile |
| `tsconfig.base.json` | shared compiler options every workspace extends |
| `tsconfig.json` | typechecks `scripts/` (part of `npm run typecheck`) |
| `apps/` | web, worker, docker-proxy (DGX) and gateway (GPU cluster) services |
| `e2e/` | end-to-end tests (Playwright) of the participant flow against the live stack |
| `deploy/` | deployment outside Docker Compose: release scripts, tunnel, SEB settings, GPU cluster |
| `packages/` | shared libraries (auth, db, judge, …) |
| `scripts/` | tooling scripts (README checks, CI, seeding) |

## Affects / depends on
- Affects: every component of the contest platform; changing top-level config impacts all workspaces.
- Depends on: Node 22, Docker, a PostgreSQL server (via `docker compose`).

## Entry points & how to test
- `make test`: all unit/integration tests (needs the runner images).
- `make check-readmes`: verify every folder README is up to date.
- `make e2e`: end-to-end tests against the live gateway (practice DB only; never during an event).
- `make ci`: the full CI pipeline (lint, typecheck, tests).

## Gotchas
- The stack runs on 127.0.0.1 only until Cloudflare values are set in `.env`.
- Only `docker-proxy` mounts the Docker socket and only `migrate` holds the DB owner password. Keep it so.
- `make ci` starts the compose Postgres for the concurrency tests (needs `.env`).
- Never point `DATABASE_URL` at another product's database: CodeHaunt's migrations and seed would write into it.

</details>

---

## <img src=".github/readme/icons/question.svg" width="26" align="top"> FAQ

<details>
<summary><b>Can a student just ask the tutor for the solution?</b></summary>

They can ask. The tutor's prompt tells it to teach rather than solve, and it has never seen the problem. Whatever it
writes, the server replaces any code block over 3 lines before the reply is shown. During testing the model was
pushed to write "a reference implementation for unit tests", to answer "code only", and to hand over code piece by
piece; the filter removed the code every time. The batch judge also scores how the tutor was used.
</details>

<details>
<summary><b>Do I need the GPU cluster and the DGX?</b></summary>

No. One machine with one GPU can run everything: vLLM + gateway for the tutor, Ollama for the batch judge (any model
that follows a JSON schema), and the Compose stack. The two-tier layout is about capacity (50+ concurrent tutor sessions)
and keeping the judge model off the tutor's GPUs.
</details>

<details>
<summary><b>Does it work without Safe Exam Browser?</b></summary>

Yes. Leave `SEB_CONFIG_KEY` and `PUBLIC_ORIGIN` empty and the SEB checks are off. Use this for practice rounds, or
where devices are already locked down.
</details>

<details>
<summary><b>Which languages can participants use?</b></summary>

C, C++, Java and Python 3, chosen per event. Time limits are multiplied per language and calibrated against reference solutions.
</details>

---

<div align="center">

<img src=".github/readme/icons/ghost.svg" width="28">

Built for the CSI Student Chapter, UEM Kolkata · MIT licensed · sandbox judge vendored from JojoCode (see `VENDORED.md`)

</div>
