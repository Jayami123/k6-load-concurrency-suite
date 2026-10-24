# P6 Phase 3 Task 1 (harness side): Cal `up`/`down` fix (plan only, for the harness repo)

This plan is for the **harness repo** ([Jayami123/qa-portfolio-harness](https://github.com/Jayami123/qa-portfolio-harness)). It
lives here so P6 review sees it; the harness build copies it to the harness repo's `docs/plans/`. It is the second of the
two harness changes in roadmap Task 1 / D4 (the first, the second Medusa instance "H3", is already merged). Nothing in this
plan changes the P6 repo. Companion plan (P6 side):
[2026-10-24-p6-phase3-task1-harness-bump.md](2026-10-24-p6-phase3-task1-harness-bump.md). Scope source: roadmap
[2026-10-22-p6-phase3-roadmap.md](2026-10-22-p6-phase3-roadmap.md) (on `origin/plan/2026-10-22-p6-phase3`), "Task 1", D4.

## 1. Header

- **Owner decisions taken (2026-10-24, recorded, not open).** Q1 two releases (H3 ships now as harness `v0.2.13`; this fix is its own later release). Q2 accept the duplicated pid module (a shared module is a later follow-up). Q3 yes, `down` throwing on a foreign listener is handled by the separate X7 PR in P6 after this harness release. All three questions are closed in §10.
- **Task.** Phase 3 Task 1, harness PR 2 of 2. Cases: none (infrastructure).
- **Priority.** Not a case; it unblocks deleting the P6 "TEMPORARY BRIDGE" and gives Phase 3 Task 5 a real Cal process record.
- **Harness branch (pattern).** `fix/<build date>-harness-cal-up-down`; own PR; Conventional Commits; merge commit, no squash
  (harness `CONTRIBUTING.md`).
- **Base.** Harness `main` = `51b7d1eb04c3dcacf007e8e020750a7837420974` (merge of PR #23, "second Medusa instance"; it also
  contains PR #24, the zod 4 upgrade). Re-check on the build day (§5).
- **Version.** Its own release after `v0.2.13` (which carries H3 only; D4 amended by the owner, companion plan §1): bump `version` in
  `package.json`, dated `CHANGELOG.md` section, the maintainer tags `vX.Y.Z` on `main`.
- **Harness tests.** Baseline **207** (`npm run check` at `51b7d1e`: `# tests 207`, `# fail 0`). This plan adds **+13**: expected **220**.
- **Stop for owner review.** Yes (rule 10): it changes a harness behaviour that every consumer (P1, P2, P5, P6) runs.

## 2. What it fixes, and why it matters

- **`up` returns once Cal is healthy** (today it never returns).
- **`down` stops the Cal web server** (today it only removes the database container and leaves `next start` on :3000).
- **The seed check reads the right table** (today it looks for a table that does not exist and re-seeds on every `up`).
- **The seeded API key is not echoed into logs.**
- **Why it matters in finance and healthcare terms.** A test harness that cannot stop what it starts leaves a stale service
  holding the port and an old database connection: the next run tests the previous run's process. Reproducible, audited
  start/stop of every component is the same discipline as a deployment pipeline that must be able to roll a node back.

## 3. Live probe evidence (2026-10-24, cloud VM, Node v22.23.3, Docker 29.9.2)

All Cal starts used `node scripts/harness.mjs up|down cal` in a throwaway copy of the P6 repo whose harness was installed from
`main` `51b7d1e` (companion plan §3.2), with the P6 "bridge" turned off **in the copy only**
(`const LONG_RUNNING = {}`; the real repo file is untouched). `NODE_OPTIONS="--use-openssl-ca --max-old-space-size=8192"`
(the sandbox's own `NODE_OPTIONS` removes the harness heap default, see the P6 backlog item H-heap; unrelated to this fix).
Cal fork `c2b7ac44c66f24ffef1662b276f0653988a609a3`.

### 3.1 `up` never returns, even on `main`

```text
$ npm run up:cal                                   # bridge off, harness main 51b7d1e, started in its own session
...
Starting Cal web (prod): yarn next start -H 127.0.0.1 -p 3000 (logs: .../.harness/cal-web.log)
Cal web is up at http://127.0.0.1:3000/
$ ps -o etimes= -p <pid of scripts/up.mjs cal>
43                                                  # still running 43 s after the ready line
# in an earlier run the same process was still running 5 min after the ready line (timeout 420 killed it)
```

Cause (code, `src/adapters/cal.adapter.ts`): the web server is started with `spawnLogged(yarn, args, { cwd, logFile, env })`
(line ~429): not `detached`, and there is no `unref()`, so the child keeps the Node event loop of `scripts/up.mjs` alive.
Documenso does it right (`documenso.adapter.ts` `startWeb`: `detached: platform() !== "win32"`, `writeDocumensoWebPid`,
`webProcess.unref()`), and its `up` returns.

### 3.2 `down` leaves `next start` running

```text
$ npm run down:cal                                  # exit 0, real 0.913 s, while the web server was up
$ ps -eo pid,pgid,args | grep -E "next start|next-server"
24631 22229 node /usr/local/bin/yarn workspace @calcom/web exec next start -H 127.0.0.1 -p 3000
24642 22229 /usr/local/bin/node .../yarn-4.12.0.cjs workspace @calcom/web exec next start -H 127.0.0.1 -p 3000
24653 22229 next-server (v16.2.3)
$ curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/pro/30min      -> 500      (database container is gone, web is not)
```

Cause: `down()` is `await composeDown(this.composeOpts())` and nothing else (`cal.adapter.ts` line ~448). There is no pid record,
unlike Medusa (`medusa-backend.pid`) and Documenso (`documenso-web.pid`). (The probe ended by `kill -TERM -<pgid>` on its own
session; afterwards 0 listeners on :3000 and 0 `next` processes.)

### 3.3 The seed check queries a table that does not exist

```text
Cal seed presence check failed (relation "User" does not exist); running yarn db-seed.        # printed on every up, also when the DB is seeded
$ psql ... -c "select tablename from pg_tables where schemaname='public' and lower(tablename) in ('user','users')"
users
$ psql ... -c "select count(*) from users where email='free@example.com'"
1
```

The fork maps the model: `products/cal/packages/prisma/schema.prisma` line 401 `model User {` has `@@map(name: "users")`
(the `@@map` line is 121 lines into that block). `ApiKey` has no `@@map` (line 1172), so `"ApiKey"` in the second query is right. The check is
`seedAlreadyPresent()` (`cal.adapter.ts` line ~498): `SELECT 1 AS ok FROM "User" WHERE email = 'free@example.com' LIMIT 1`.
Effect: `yarn db-seed` runs on every `up` (seed run on a seeded DB: about 70 s of the 188 s probe `up`).

### 3.4 The seeded API key is printed into the `up` log

```text
2276:@calcom/prisma:db-seed: 🔑 Created seeded API Key: cal_<redacted>
$ grep -c "cal_[A-Za-z0-9]\{10,\}" results/harness/cal-up.log        -> 1
```

`runCapture` (`src/internal/run.ts`) copies each chunk of the child's output to `process.stdout` through
`redactSecrets(text, options.redact ?? [])`; the Cal seed call passes no `redact`, and the key is unknown before the seed prints
it. The fork's `scripts/seed.ts` line 527 seeds the constant `0123456789abcdef0123456789abcdef`, printed at line 519, so this
is a **public dev-seed value, not a production secret**; the roadmap still asks for no seed credential in logs, and the P6
scanner (`scripts/evidence-token-scan.mjs`) has no `cal_` pattern, so P6 uploads `cal-up.log` on failure with the key inside.
No password is printed: the only `password` hits in the log are migration names.

### 3.5 What the bridge in P6 does today (the cases the fix must also cover)

`scripts/harness.mjs` (P6) runs `up cal` in its own process group, waits for the ready line
(`/Cal web is up at |Cal already (healthy|listening) at /`), writes `results/harness/cal.pgid`, refuses a second `up` while a
recorded group is alive (waits for the port instead), stops the group on a leader that exited early, stops the group on
timeout (`HARNESS_UP_TIMEOUT_MS`, default 1 h; CI sets 30 min), and on `down` kills the group and waits for :3000 to close.
The fix must cover: (a) `up` returns when healthy; (b) a second `up` while the first is still starting does not spawn another
process; (c) `up` when Cal is already healthy exits 0; (d) `down` stops the web tree and frees :3000; (e) a dead leader with
live children is cleaned by `down`; (f) a missing, empty or corrupt pid file is not an error; (g) a wait bounded by the harness
(`CAL_WEB_WAIT_MS`, min 120 s, default 10 min, exists today in `up()`).

### 3.6 Decisions from the probe

- Mirror the Documenso pattern exactly: `detached` + record + `unref()` on start; kill the recorded process **group** on stop.
- Add the seed fix and the redaction in the same PR (all four items are D4's list).
- No change to Cal's build logic, heap handling or compose files.
- **Build-time probe must confirm:** that `up.mjs` exits on its own after the change (exit code 0, within seconds of the ready
  line) and that a second `up` is refused or waits, on Linux (CI and both clouds). Windows (the harness's original platform)
  keeps its `taskkill /T /F` branch, as Documenso does; the probe here cannot cover it.

## 4. Depends on

Nothing from P6. Inside the harness: `spawnLogged`, `isPidRunning`, `HARNESS_ROOT`, `captureProcessStartMark` patterns of
`src/adapters/documenso-web-pid.ts` (copied, see §6.1), `webListen()`, `isWebPortOpen()`, `createPgClient` in `cal.adapter.ts`.

## 5. Build-time recheck

| #   | Check                                   | Command                                                                                                                                        | Expected                                                                                                                                              |
| --- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Base and baseline                       | `git fetch origin main && git log -1 --format=%h origin/main && npm ci && npm run check`                                                       | `51b7d1e` or a descendant; `# tests 207` (or the new base count), exit 0                                                                              |
| 2   | Still unfixed                           | `grep -n 'FROM "User"' src/adapters/cal.adapter.ts; grep -n "unref" src/adapters/cal.adapter.ts`                                               | one hit for the first, no hit for the second                                                                                                          |
| 3   | The fork still maps `users`             | `grep -n '@@map(name: "users")' $PRODUCTS_ROOT/cal/packages/prisma/schema.prisma`                                                              | one hit                                                                                                                                               |
| 4   | Documenso model unchanged               | `grep -n "unref\|writeDocumensoWebPid" src/adapters/documenso.adapter.ts`                                                                      | both found                                                                                                                                            |
| 5   | P6 consumers of `up:cal` and `down:cal` | in the P6 repo: `grep -n "up:cal\|down:cal\|TEMPORARY BRIDGE\|cal.pgid" package.json scripts/harness.mjs .github/workflows/perf.yml README.md` | the bridge, the `down:cal \|\| true` steps and the `Start Cal (harness up)` steps are the only callers; any new caller is added to the acceptance run |
| 6   | P1 consumer                             | in the P1 repo (read only): `grep -rn "up cal\|up:cal\|down:cal" package.json scripts .github`                                                 | callers listed in the PR; each still works when `up` returns (none relied on a never-returning `up`)                                                  |
| 7   | Acceptance on the P6 copy               | the seven checks of §7 against a throwaway P6 copy using `node scripts/up.mjs cal` and `down.mjs cal`                                          | all pass; output pasted in the PR                                                                                                                     |

## 6. Design (harness repo)

### 6.1 File tree

```text
src/adapters/cal-web-pid.ts            NEW   (copy of documenso-web-pid.ts with Cal names)
src/adapters/cal-web-pid.test.ts       NEW   (9 tests, mirror of documenso-web-pid.test.ts)
src/adapters/cal-seed.ts               NEW   (CAL_SEED_USER_SQL, redactSeedOutput)
src/adapters/cal-seed.test.ts          NEW   (4 tests)
src/adapters/cal.adapter.ts            CHANGED (start detached + record + unref; down stops the web; seed check; redaction; up waits for a live recorded process)
CHANGELOG.md                           CHANGED (Unreleased entry)
README.md                              CHANGED (Cal section: up returns, down stops the web, pid file name)
```

**Non-standard choice, flagged.** `cal-web-pid.ts` duplicates about 150 lines of `documenso-web-pid.ts` and
`medusa-backend-pid.ts` (three near-identical pid modules). The standard alternative is one shared `pid-record.ts` that all
three adapters use. It is not done here because it touches the Documenso and Medusa adapters, which other consumers depend on,
for no behaviour change; propose it as a follow-up after this release (open question Q2).

### 6.2 `src/adapters/cal-web-pid.ts` (NEW)

Copy `documenso-web-pid.ts` and rename: `DOCUMENSO_WEB_PID_BASENAME` → `CAL_WEB_PID_BASENAME = "cal-web.pid"`,
`DocumensoWebPidRecord` → `CalWebPidRecord`, `DocumensoWebStopError` → `CalWebStopError`, `documensoWebPidFile` → `calWebPidFile`,
`parseDocumensoWebPidFileText` → `parseCalWebPidFileText`, `writeDocumensoWebPid` → `writeCalWebPid`,
`readDocumensoWebPidRecord` → `readCalWebPidRecord`, `readDocumensoWebPidFromFile` → `readCalWebPidFromFile`,
`stopDocumensoWebFromPidFile` → `stopCalWebFromPidFile`, `StopDocumensoWebFromPidFileDeps` → `StopCalWebFromPidFileDeps`; message
text "Documenso" → "Cal". Keep `parsePositiveSafeInteger`, `captureProcessStartMark` and `defaultKillProcessTree` as they are
(import them from `./documenso-web-pid.js` instead of copying them: they are generic; only the basename, the record name and
the messages are Cal's). Record format `{"pid":N,"startMark":"..."}` in `.harness/cal-web.pid`. On Linux `defaultKillProcessTree`
sends `SIGTERM` to the process group (`process.kill(-pid)`), falling back to the pid: that is why the web process must be
started `detached` (pgid = pid).

### 6.3 `src/adapters/cal-seed.ts` (NEW)

```ts
/** The fork maps `model User` to the table "users" (packages/prisma/schema.prisma, `@@map(name: "users")`). */
export const CAL_SEED_USER_SQL = `SELECT 1 AS ok FROM users WHERE email = 'free@example.com' LIMIT 1`;

/** The fork's seed prints `Created seeded API Key: cal_<hex>`. Hide the value, keep the line. */
const SEEDED_KEY = /(Created seeded API Key:\s*)\S+/g;

/** Redacts per complete line so a key split across two chunks is still caught. Returns the text to print and the carry-over. */
export function redactSeedOutput(chunk: string, carry = ""): { text: string; carry: string } {
  const joined = carry + chunk;
  const cut = joined.lastIndexOf("\n") + 1;
  const complete = joined.slice(0, cut);
  return { text: complete.replace(SEEDED_KEY, "$1***"), carry: joined.slice(cut) };
}
```

### 6.4 `src/internal/run.ts` and `cal.adapter.ts` (CHANGED)

`run.ts`: add `redactLine?: (chunk: string, carry: string) => { text: string; carry: string }` to `RunCaptureOptions`;
in the `data` handlers keep a `carry` per stream, print `text`, and at `exit` print any remaining carry through the same
function (so the last line without a newline is not lost). The existing `redact` (fixed secrets) keeps working.

`cal.adapter.ts`:

1. Seed check: `pool.query(CAL_SEED_USER_SQL)` instead of the `"User"` literal. Import from `./cal-seed.js`.
2. Seed run: `runCapture(resolveYarn(), ["db-seed"], { cwd, timeoutMs, redactLine: redactSeedOutput })`. The captured
   `stdout` still holds the real key (the adapter parses it with `captureApiKeyFromSeedOutput`); only what is printed is redacted.
3. Start: replace the `spawnLogged` call by

```ts
this.webProcess = spawnLogged(yarn, args, {
  cwd: this.productRoot,
  logFile,
  env: this.nodeHeapEnv(),
  detached: platform() !== "win32",
});
if (this.webProcess.pid !== undefined) {
  writeCalWebPid(this.webProcess.pid);
}
// Keep the web server running after this CLI exits. `down` stops it from the pid record.
this.webProcess.unref();
```

(`platform` from `node:os`; the existing `await new Promise((r) => setTimeout(r, 8000))` early-exit check stays.) 4. Second `up` during startup: before the `isWebPortOpen()` branch add

```ts
const recorded = readCalWebPidRecord();
if (recorded !== undefined && isPidRunning(recorded.pid) && !(await this.isWebPortOpen())) {
  console.log(
    `Cal web (pid ${String(recorded.pid)}) is still starting; waiting for it instead of starting another.`,
  );
  await this.waitForWeb(logFile, timeoutMs);
  console.log(`Cal web is up at ${this.webRootUrl()}`);
  return;
}
```

5. `down()`:

```ts
  async down(): Promise<void> {
    await this.stopWeb();
    await composeDown(this.composeOpts());
    console.log("Cal web stopped and compose stack torn down.");
  }

  /** Stops the recorded web process group; success means the port closed, not that the pid is gone (zombies answer kill 0). */
  private async stopWeb(): Promise<void> {
    const { host, port } = this.webListen();
    let stopError: Error | undefined;
    try {
      stopCalWebFromPidFile(HARNESS_ROOT);
    } catch (error) {
      stopError = error instanceof Error ? error : new Error(String(error));
    }
    const deadline = Date.now() + CAL_WEB_STOP_WAIT_MS; // 30_000
    while (Date.now() < deadline && (await this.isWebPortOpen())) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (await this.isWebPortOpen()) {
      throw stopError ?? new Error(`Cal web still listening on ${host}:${port}; not killed (not started by this harness).`);
    }
  }
```

Nothing is killed that the harness did not record (same rule as Documenso: "does not kill any other process").

### 6.5 Tests (harness, +13)

- `cal-web-pid.test.ts` (+9): the nine tests of `documenso-web-pid.test.ts`, renamed (full-integer parse, trailing junk, write
  and read back, missing file no-op, stale pid, running pid killed and file removed, kill failure keeps file, start-mark
  mismatch skips the signal, corrupt file removed). Same injected `deps` style.
- `cal-seed.test.ts` (+4): `CAL_SEED_USER_SQL selects from users and not from "User"`; `redactSeedOutput hides the key value and keeps the line`;
  `redactSeedOutput leaves other lines untouched`; `redactSeedOutput catches a key split across two chunks` (first chunk ends
  in `Created seeded API Key: cal_01`, second starts `23456...\n`; the printed text never contains the digits).
- Not unit-testable (needs Cal): `up` returns, `down` frees the port. They are the acceptance script in §7 and §9.

## 7. Oracles and assertions (what "fixed" means)

| Claim                                        | Check                                                                                                                                                 | Evidence class         |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `up` returns when healthy                    | `time node scripts/up.mjs cal` exits 0; after `Cal web is up` no more than 5 s pass                                                                   | live, exit code + time |
| `down` stops the web                         | after `down`: `lsof -nP -iTCP:3000 -sTCP:LISTEN` empty; `.harness/cal-web.pid` removed; no `next-server`                                              | live                   |
| Second `up` does not double-spawn            | start `up` in the background, run a second `up` 20 s later: one `next-server`, both exit 0                                                            | live                   |
| Seed check passes on a seeded DB             | second `up`: log has `Cal seed users and API key already present; skipped yarn db-seed.`; no `presence check failed`                                  | live                   |
| No key in the log                            | `grep -c "cal_[A-Za-z0-9]\{10,\}" <up log>` is 0; the line `Created seeded API Key: ***` is present                                                   | live                   |
| `down` removes the children of a dead leader | start `up`, wait for ready, `kill -9` the recorded leader pid, run `down`: no `next-server` remains, :3000 is free, `.harness/cal-web.pid` is removed | live                   |
| `down` refuses a foreign listener            | start any process on :3000 without the harness, `down`: error `Cal web still listening ... not killed`; the process lives                             | live                   |

## 8. Data isolation, cleanup, leak check

- **Isolation.** Harness only; no P6 data. The acceptance script uses a throwaway copy of P6 or the harness's own
  `node scripts/up.mjs cal` / `down.mjs cal`; the Postgres volume is kept as today. The pid record lives in `.harness/cal-web.pid`
  (one file, one process group).
- **Cleanup.** `down` stops the recorded web process group (not only the leader pid), waits for :3000 to close, removes the pid file,
  then removes the database container. **Dead leader, live children:** when the recorded leader is gone but the group still has
  members (the case P6's bridge handles today, §3.5 (e)), `down` signals the whole group (`kill(-pgid)`; SIGTERM, then SIGKILL after
  the same grace period as Documenso), so no `next-server` child survives. A missing, empty or corrupt pid file is not an error.
  A recycled pid is refused by the start-mark check (R3). `down` never kills a listener it did not start (§7, last row).
- **Leak check.** After `down`: `lsof -nP -iTCP:3000 -sTCP:LISTEN` is empty, `.harness/cal-web.pid` is gone, `pgrep -f next-server`
  shows no Cal process, and the database container is removed. The group signal (`kill(-pgid)`) is asserted by the existing `running pid killed and file removed` test (injected `deps` record the signalled target); the dead-leader case itself is part of the acceptance run (§7, the dead-leader row: a leader killed with `kill -9` before `down`). No test is added: the count stays 207 -> 220.

## 8a. Token scan

- The only new artefact is the redacted `up` log. Check with `grep -c "cal_[A-Za-z0-9]\{10,\}" <up log>` (expected 0; the line
  `Created seeded API Key: ***` is present).
- The `cal_` pattern `/\bcal_[A-Za-z0-9]{10,}/` is added to P6's `scripts/evidence-token-scan.mjs` as extra E1 (P6 repo, its own PR,
  after the harness release); until then the `grep` above is the check. P6's `cal-up.log` upload stops carrying the key once the
  P6 bump pins this release (Part B of the companion plan).

## 8b. CI and budget

The harness PR runs its own workflows (workflow lint, `npm ci`, typecheck, build, package contents, audit, PR title, CodeQL); no new
job and no new step. `npm run check` before every push. P6's CI proves the fix only after the P6 bump (companion plan, Part B), which
changes the cache suffix again (cold start) and sets `timeout-minutes: 30` on the `Start Cal (harness up)` steps (a new cap on an
existing step; no job timeout changes). Convention: Phase 2 closeout §2.7 worst case (`cal-smoke` 9.7 = 9.2 min, run 39741411392, + 0.5;
`cal-state-races` 11.4 = 10.1, run 40039351021, + 1.3) + cold start Cal +3.0 + pull at its cap minus measured +5.7 + new steps (none):

| Job               | §2.7 worst (min) | + cold start | + pull to cap | New steps | Worst, estimates (min) | Worst, at caps (min) | Timeout | Margin |
| ----------------- | ---------------- | ------------ | ------------- | --------- | ---------------------- | -------------------- | ------- | ------ |
| `cal-smoke`       | 9.7              | +3.0         | +5.7          | none      | 18.4                   | 18.4                 | 60      | 41.6   |
| `cal-state-races` | 11.4             | +3.0         | +5.7          | none      | 20.1                   | 20.1                 | 85      | 64.9   |

No timeout is raised; the bridge deletion removes the process-group wait from the Cal jobs, so the estimate is an upper bound.

## 8c. Environment changes

None for Cursor Cloud and none for Claude Code cloud: no tool, host, setting or setup-script change; the harness is fetched by
`npm ci` from its tag as today, and both clouds run the same `up:cal` / `down:cal` scripts.

## 9. Build order (harness repo; one commit per step; `npm run check` after each)

Branch: `git switch -c fix/<build date>-harness-cal-up-down origin/main`. Counts relative to the base count B (207 today).

| Step | Commit subject                                           | `git add` paths                                                                                          | `npm run check` |
| ---- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------- |
| 1    | `fix(cal): read the seed user from the users table`      | `src/adapters/cal-seed.ts src/adapters/cal-seed.test.ts src/adapters/cal.adapter.ts` (SQL part only)     | exit 0, B + 1   |
| 2    | `fix(cal): keep the seeded api key out of the log`       | `src/adapters/cal-seed.ts src/adapters/cal-seed.test.ts src/internal/run.ts src/adapters/cal.adapter.ts` | exit 0, B + 4   |
| 3    | `feat(cal): record the web process and stop it on down`  | `src/adapters/cal-web-pid.ts src/adapters/cal-web-pid.test.ts src/adapters/cal.adapter.ts`               | exit 0, B + 13  |
| 4    | `fix(cal): return from up once cal is healthy`           | `src/adapters/cal.adapter.ts` (detached, unref, waiting branch)                                          | exit 0, B + 13  |
| 5    | `docs: changelog and readme for the cal up and down fix` | `CHANGELOG.md README.md`                                                                                 | exit 0, B + 13  |

Acceptance (paste the output into the PR, CONTRIBUTING.md "live smoke"): with the P6 copy as in §3, run the seven checks of §7.
CHANGELOG text (under `## Unreleased`):

```text
- Cal `up()` returns once Cal is healthy: the web server is started detached, its pid is recorded in `.harness/cal-web.pid`, and the process is unref'd. A second `up()` while the recorded process is still starting waits for it.
- Cal `down()` stops the recorded web process group, waits for the port to close, then removes the database container. It never kills a listener it did not start.
- Cal's seed presence check reads the `users` table (the fork maps `model User` to `users`); before, it failed on every `up` and re-ran `yarn db-seed`.
- The seeded API key is no longer printed in the `up` log (`Created seeded API Key: ***`).
```

Release (the maintainer, after both harness PRs are merged and this one is the last): bump `version`, date the `CHANGELOG.md`
section, tag `vX.Y.Z` on `main`. Then the P6 bump with the bridge deletion (companion plan, Part B).

## 10. Risks, proposed extras, open questions

| ID  | Risk                                                                     | Mitigation                                                                                                     |
| --- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| R1  | Detaching changes behaviour on Windows (the harness's first platform)    | same branch as Documenso (`detached: platform() !== "win32"`); Windows keeps `taskkill /T /F`                  |
| R2  | `down` now throws when the port stays open (was silent)                  | P6 CI uses `down:cal \|\| true` (known item X7); consumers that relied on silence see an error with the reason |
| R3  | A pid file of a previous run points at a recycled pid                    | the start-mark check from the Documenso module refuses to signal a mismatching live pid                        |
| R4  | The redaction misses a differently worded key line in a future fork seed | the unit test fixes the current wording; the P6 scanner gets a `cal_` pattern (extra E1)                       |

**Proposed extras (out of scope until accepted; no P6 case IDs).**

- **E1.** P6 scanner pattern `/\bcal_[A-Za-z0-9]{10,}/` in `scripts/evidence-token-scan.mjs` (P6 repo, its own PR).
- **E2.** One shared `pid-record.ts` for Medusa, Documenso and Cal (see §6.1).

**Owner decisions (all three questions closed 2026-10-24).**

- **Q1 (closed: two releases).** H3 is released now as `v0.2.13`; this fix is its own later release (D4 amended).
- **Q2 (closed: accept).** The duplicated `cal-web-pid.ts` stays (matches the two existing modules); a shared module is a later follow-up (E2).
- **Q3 (closed: yes, as the separate X7 PR).** `down` throwing on a foreign listener is handled in P6 by the separate X7 PR after the harness release.

## 11. Done when (roadmap, made measurable)

- [ ] This PR is merged with a CHANGELOG entry, and H3 is released as `v0.2.13` and this fix as its own later release (owner decision).
- [ ] The seven checks of §7 pass on Linux, output pasted in the PR.
- [ ] Harness `npm run check` exit 0 with 220 tests (207 + 13), `npm audit --audit-level=high` clean.
- [ ] The P6 bridge deletion bump (companion plan, Part B) can start: `up:cal` and `down:cal` work through the harness alone.

## 12. Rule 20 self-check

- (a) Done-when items of the roadmap are in §11; gap: the two releases are the maintainer's actions in the harness repo.
- (b) Existing names grepped at `51b7d1e`: `src/adapters/cal.adapter.ts` (`FROM "User"`, `spawnLogged`, `webListen`, `isWebPortOpen`, `createPgClient`, `captureApiKeyFromSeedOutput`), `src/adapters/documenso-web-pid.ts` and `documenso.adapter.ts` (`unref`, `writeDocumensoWebPid`), `src/internal/run.ts` (`RunCaptureOptions`, `redact`). NEW: `cal-web-pid.ts`, `cal-seed.ts` (`CAL_SEED_USER_SQL`, `redactSeedOutput`), `redactLine`.
- (c) CI time: §8b (no new step; P6 jobs keep at least 41 minutes of margin).
- (d) Skeletons: §6; steps with paths, subjects and expected counts: §9 (207 -> 220).
- (e) The owner's answers to Q1 to Q3 are recorded in §1 and §10.
