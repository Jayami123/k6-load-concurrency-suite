# P6 Phase 3 Task 2: multi-instance Medusa races (`P6-MED-RACE-002`, `P6-MED-RACE-003`) (plan only)

This is the plan a weaker model builds from. It changes nothing in the repo. Do not build until the owner approves it and
Task 1 (the harness pin bump) is merged. Structure follows
[docs/reference/p1-plan-example-medusa.md](../reference/p1-plan-example-medusa.md). Scope source: roadmap
[2026-10-22-p6-phase3-roadmap.md](2026-10-22-p6-phase3-roadmap.md) (on `origin/plan/2026-10-22-p6-phase3`), "Task 2", D1 to
D14, "Rules that hold for every task". Input report:
[2026-10-24-p6-phase2-task8-med-multi-instance.md](2026-10-24-p6-phase2-task8-med-multi-instance.md).

## 1. Header

- **Task.** Phase 3 Task 2.
- **Cases.** `P6-MED-RACE-002` (P1): two Medusa backends, Redis lock, orders ≤ S. `P6-MED-RACE-003` (P2): the same two
  backends with the in-memory lock, a characterization.
- **Plan branch.** `plan/2026-10-24-p6-phase3-plans` (shared by all Phase 3 plans, no PR, never deleted).
- **Build branch (pattern).** `feat/<build date>-p6-med-multi-instance`.
- **Base.** `origin/main` = `5acd2a0` (merge of PR #51, the Phase 2 closeout; it contains PR #50, `a82521a`). Re-check on the
  day of the build (§5).
- **Harness pin assumed.** The first released tag that contains harness H3 (`51b7d1e`). **`v0.2.13` does not exist today**:
  the newest tag is `v0.2.12` (§3.1). This task is **blocked until Task 1 has bumped the pin**. Every harness fact below
  was probed on harness `main` `51b7d1e`, installed into a throwaway copy of this repo (§3.2), not on a tag.
- **Unit tests.** Baseline 471 on `main` (`npm run check`, exit 0, §3.9). The two env readers were moved to Task 1 (plan `…task1-harness-bump.md` §6.4), so the baseline for this task is the
  count Task 1 part A leaves: **481**. This plan adds **+21** (§12). Expected after the build: **502**.
- **Stop for owner review.** Yes (rule 10): the plan adds a CI job to `perf.yml` and depends on a harness pin bump.

## 2. What it proves

- **`-002`.** A finite resource sold through two application replicas that share one database and one lock service is never
  over-allocated: with S=3 and N=15 carts completed alternately on two backends, orders ≤ S in every trial.
- **`-003`.** The same topology with a per-process lock is **not** safe. The result (an oversell, expected) is recorded and
  asserted, so the repo documents why a shared lock is required. It is a characterization, not a product bug.
- **Finance and healthcare.** Two payment-service replicas must not both debit the last unit of a balance, and two clinic
  nodes must not both book the last slot. A guard that only works inside one process is not a guard once the service scales
  out. `-003` shows the failure on purpose so `-002` is a meaningful pass.

## 3. Live probe evidence

Probe date 2026-10-24 (UTC), cloud VM (Node v22.23.3, Docker 29.9.2, 4 vCPU, 16 GB RAM). Timings and memory are **VM, proof
only**; CI numbers come from §10. Products were started and stopped only with `node scripts/harness.mjs up|down medusa`
(npm scripts `up:medusa`, `down:medusa`) in a throwaway copy of the repo (§3.2). No product fork and no
`node_modules/qa-portfolio-harness` of the real checkout was touched. Throwaway scripts live in `/tmp` and are not committed.

### 3.1 Harness state (decides: this task cannot build yet)

```text
$ git ls-remote --tags https://github.com/Jayami123/qa-portfolio-harness.git | ... | sort -V | tail -3
v0.2.10
v0.2.11
v0.2.12
$ git ls-remote .../qa-portfolio-harness.git HEAD refs/heads/main
51b7d1eb04c3dcacf007e8e020750a7837420974  HEAD
51b7d1eb04c3dcacf007e8e020750a7837420974  refs/heads/main
```

`CHANGELOG.md` on harness `main` has an `## Unreleased` section with the zod 4 upgrade, `MEDUSA_SECOND_BASE_URL` and
`MEDUSA_LOCK`; `package.json` still says `"version": "0.2.12"`. So H3 is merged and **not released**. Release rule
(harness `CONTRIBUTING.md`): bump `version`, add a dated `CHANGELOG.md` section, the maintainer tags `vX.Y.Z` on `main`.

### 3.2 How the probe ran

```text
$ git worktree add --detach /tmp/s/p6h3 HEAD            # a throwaway copy of this repo at the base, never committed
$ sed -i 's|qa-portfolio-harness#v0.2.12|qa-portfolio-harness#51b7d1eb04c3dcacf007e8e020750a7837420974|' package.json
$ npm install --no-audit --no-fund                      # added 27 packages in 14s
$ npm run check                                         # in the copy, harness main installed
# tests 471 / # pass 471 / # fail 0                     # the repo works unchanged against harness main (typecheck included)
```

Environment for every `up`/`down`: `PRODUCTS_ROOT=/home/user/products`, `MEDUSA_REDIS=1`, `MEDUSA_SECOND_BASE_URL=http://127.0.0.1:9001`,
`MEDUSA_LOCK=redis|memory`, `MEDUSA_ADMIN_EMAIL=admin@qa.local` and a random `MEDUSA_ADMIN_PASSWORD` (never printed).

### 3.3 Redis lock mode: the lock is registered and used (answers Task 8 report C2/C3/Q7)

```text
$ MEDUSA_REDIS=1 MEDUSA_LOCK=redis MEDUSA_SECOND_BASE_URL=http://127.0.0.1:9001 npm run up:medusa      # exit 0, real 1m35s (first build)
Medusa backend is up at http://127.0.0.1:9000 (production, 6.1 s from spawn to HTTP 200).
Starting second Medusa backend on http://127.0.0.1:9001 in .../apps/backend/.medusa/server (logs: .../.harness/medusa-backend-2.log)
Second Medusa backend GET /health returned HTTP 200 (http://127.0.0.1:9001/health).
$ cat .harness/medusa-backend.pid .harness/medusa-backend-2.pid
{"pid":3280,"startMark":"31423"}
{"pid":3341,"startMark":"32028","baseUrl":"http://127.0.0.1:9001"}
$ grep -n locking -A12 apps/backend/.medusa/server/medusa-config.js        # the runtime config the harness wrote
34:      resolve: "@medusajs/medusa/locking",
38:            resolve: "@medusajs/medusa/locking-redis",
39:            id: "locking-redis",
40:            is_default: true,
41:            options: { redisUrl: process.env.REDIS_URL },
```

Startup log of the second backend (ANSI stripped; the primary shows the same):

```text
--- spawn 2026-10-24T00:02:45.051Z /usr/local/bin/node .../@medusajs/cli/cli.js start ---
info:    Connection to Redis in module 'event-bus-redis' established
info:    Connection to Redis in module 'cache-redis' established
info:    Connection to Redis in "locking-redis" provider established
info:    [Workflow-engine-redis] Connection to Redis in module 'workflow-engine-redis' established
✔ Server is ready on port: 9001 – 2494ms
```

No `Locking module: Using "in-memory" as default.` line appears after the `--- spawn` marker. **Q7 of the Task 8 report is
answered: yes, Medusa registers the array-style `locking-redis` provider.** Proof the lock is used, not only registered:
`redis-cli monitor` (40 s, during one S=3, N=15 trial) shows

```text
 60 "SET" "medusa_lock:cart_X" "*" "NX" "EX" "10"        # per-cart lock
  7 "SET" "medusa_lock:iitem_01M5NMACVM2YGW9Y9HW3K5YS4B" "execute:<uuid>" "NX" "EX" "60"   # per inventory item: the cross-instance stock guard
```

(plus `GET`/`DEL`/`evalsha` on the same keys). The stock guard is the lock on the **inventory item**; with the Redis provider it
is shared by both backends, with the in-memory provider each process has its own.

Both harness logs are **append-only** across `up` runs (the lock lines of an earlier run stay above the new `--- spawn`
marker, §3.4). A reader must look only at the text after the **last** `--- spawn` line.

### 3.4 In-memory mode (`MEDUSA_LOCK=memory` with `MEDUSA_REDIS=1`, the owner's Q6 answer)

```text
$ MEDUSA_REDIS=1 MEDUSA_LOCK=memory MEDUSA_SECOND_BASE_URL=http://127.0.0.1:9001 npm run up:medusa      # exit 0, real 29.3 s (build cached)
info:    Connection to Redis in module 'event-bus-redis' established
info:    Connection to Redis in module 'cache-redis' established
info:    [Workflow-engine-redis] Connection to Redis in module 'workflow-engine-redis' established
info:    Locking module: Using "in-memory" as default.                                  # both processes
$ grep -c locking apps/backend/.medusa/server/medusa-config.js
0
```

Event bus, cache and workflow engine are shared through Redis in both modes, so the **only** difference between `-002` and
`-003` is the lock provider. Decides: the spec asserts the lock line per case (§7.1, guard G3).

### 3.5 The race itself (throwaway probe `/tmp/s/probe/two-instances.ts`, S=3, N=15, 15 carts created on :9000, complete request `i` sent to `[9000, 9001][i % 2]`, same barrier as `fireTogether`)

| Mode                 | Trials | Oversold trials (orders > 3) | Orders per trial    | Wins by port (:9000 / :9001) | Dispatch spread max | Per trial (VM)                        |
| -------------------- | ------ | ---------------------------- | ------------------- | ---------------------------- | ------------------- | ------------------------------------- |
| `MEDUSA_LOCK=redis`  | 24     | **0**                        | 3 in all 24         | 31 / 41                      | 2.4 ms              | 10.3 / 10.9 / 12.1 s (min/median/max) |
| `MEDUSA_LOCK=memory` | 30     | **26**                       | 3:4, 4:7, 5:12, 6:7 | 75 / 67                      | (≤ 2.4 ms)          | 10.1 / 10.8 / 14.0 s                  |

Per trial, every HTTP response was 200 `type=order` or 400 `type=not_allowed` (no 5xx, no other status). In all 54 trials
`orders == number of HTTP 200s` (no ghost order: no F-M2/F-M5 in this probe). A `memory` trial with 6 orders:

```json
{
  "label": "memory-lock",
  "t": 5,
  "orders": 6,
  "orderQty": 6,
  "res": 6,
  "stocked": 3,
  "reserved": 3,
  "per": { "9000": { "200": 3, "400": 5 }, "9001": { "200": 3, "400": 4 } },
  "types": ["not_allowed", "order"],
  "spreadMs": 0.8,
  "ms": 11469
}
```

What it decides:

- `-002` is a real check: 0 of 24 oversold with the shared lock.
- `-003` oversells in 26 of 30 trials (86.7 %, Wilson 95 % interval 70.3 % to 94.7 %). Each backend admits at most S itself
  (3 and 3), so the bound is `instances × S = 6`; max seen 6.
- In `memory` mode `reservation_item` rows (6) exceed `inventory_level.reserved_quantity` (3): the lost update also hits the
  counter. The existing `checkOversellInvariants` would report that as `reserved !== reservationQty`. `-003` needs its own
  characterization invariants (§6.4); it cannot reuse the strict function.
- Both backends receive traffic and both win: `redis` 31/41, `memory` 75/67 (client side).

### 3.6 Per-instance traffic: client counts equal the server log counts

Each backend logs one JSON line per request (`"level":"http"`, `"method"`, `"path"`, `"status"`, `"request_id"`). After the
30 `memory` trials (N=15: 8 requests to :9000 and 7 to :9001 per trial):

```text
medusa-backend.log   complete lines after last spawn: 240      (30 x 8)
medusa-backend-2.log complete lines after last spawn: 210      (30 x 7)
```

where a "complete line" is a line matching `"method":"POST","path":"/store/carts/cart_[A-Z0-9]+/complete"`. This is the
server-side proof that the requests reached both instances (roadmap: "status counts per base URL"). The cart was created on
:9000 and completed on :9001 in the same probe, which also proves the shared database.

### 3.7 `down` (answers the Task 8 report's "survival" open item)

```text
$ npm run down:medusa                                  # redis mode: exit 0, real 1.269 s
$ lsof -nP -iTCP:9000/9001/5433/6380 -sTCP:LISTEN | wc -l      -> 0 0 0 0
$ ls .harness/                                         -> medusa-backend-2.log medusa-backend.log      (both .pid files removed)
$ docker ps -a --format '{{.Names}}'                   -> (empty)
$ (unset MEDUSA_SECOND_BASE_URL MEDUSA_LOCK; npm run down:medusa)  # started with the variables SET, stopped with them UNSET
exit 0, real 1.177 s; same four ports closed; no `cli.js start` process left
```

So `down` stops the second backend from the recorded `baseUrl` even when the environment changed. A second `up` while the
primary is healthy fails on purpose:

```text
Error: Medusa is already healthy at http://127.0.0.1:9000/health. Run down first; the second backend was not started (MEDUSA_SECOND_BASE_URL=http://127.0.0.1:9001).
```

Decides: each lock mode needs its own `down` then `up`; the CI job runs one mode per runner (§10).

### 3.8 Memory (VM, proof only)

After the 24 `redis` trials: primary `VmRSS` 1,143,376 kB (VmHWM the same), second 372,152 kB (VmHWM 646,600 kB); Postgres
247.9 MiB; Redis 5.6 MiB; `free -m` used 2,346 MB of 16,091 MB. The primary carries all cart setup, so it grows. GitHub's
`ubuntu-24.04` runner has 16 GB (4 vCPU) for public repositories: **build-time probe must confirm** in CI by logging `free -m`
and both pids' RSS at the end of each leg (§10, step "Log memory").

### 3.9 Existing code facts (grepped at `5acd2a0`)

- `npm run check` on `5acd2a0`: exit 0, `# tests 471`, `# suites 103`, `# fail 0`, 21 s.
- `src/medusa/run-case.ts`: `runOversellCase` (one attempt = product + carts + `fireTogether` + `waitForOversellStable` +
  `checkOversellInvariants` + sweep and cleanup in `finally`); line 175 calls `completeCart(publishableKey, cartId)`; its
  `warm` function hits `${base}/health` with `base = medusaBaseUrlFromEnv()`.
- `src/medusa/store.ts`: `storeRaw` (line 10) and `completeCart` (line 156) both use `medusaBaseUrlFromEnv()`.
- `src/races/env.ts` line 65 `medusaBaseUrlFromEnv`; `requiredEnv` (1) and `intFromEnv` (13) are the style to copy.
- `src/ci/race-table.ts` `MEDUSA_OVERSELL_CASES` (line 18) counts "oversold" as `available < 0`; with the `memory` lost
  update `available` stays 0 although 6 orders exist, so `-003` needs its own summary row (§6.6).
- `.github/workflows/perf.yml`: `medusa-smoke` (line 34, timeout 45) already measures 26.2 min worst case and a race step
  estimate of 24.1 min against a 24.0 stop rule (Phase 2 closeout §2.7, Q7). **`-002`/`-003` do not go into `medusa-smoke`** (§10).
- CI measured values used in §10 (GitHub Actions run data, `gh api .../actions/runs/<id>/jobs`): `Start Medusa (harness up)`
  30 s (run 40037355173), 49 s (39927945708, slowest), 39 s (39961527451); race step 1085 s, 1184 s, 1193 s; `medusa-smoke`
  job 19.5, 22.0, 21.4 min. Histograms of run 40037355173: `P6-MED-RACE-001` (N=20) 687.4 s / 50 = **13.75 s per trial**;
  README Phase 1 results: slowest `-001` per-trial 16.51 s.

### 3.10 What stays unconfirmed ("build-time probe must confirm")

1. The CI per-trial time of the two-instance cases (the first three `workflow_dispatch` runs). §10 uses 16.51 s, the slowest
   known `-001` time, as the stand-in.
2. The `memory` oversell rate on the runner (VM: 86.7 %). It decides the PR trial count of `-003` (§6.5, Q2).
3. Runner memory under the race (§3.8).

**What this probe decided:** (a) `-002` is buildable the day a tag with H3 exists, with no harness gap left; (b) `-003` runs
with `MEDUSA_REDIS=1` and `MEDUSA_LOCK=memory` (Q6); (c) one job cannot run both cases at full count (§10), so a two-leg matrix
job is used; (d) the lock line, the traffic counts and the oracle all come from files and SQL the harness and the repo
already produce.

## 4. Depends on earlier plans

| Needs                        | Exact name                                                                                                                                                                                                                                                                                                                                                                                                                      | From                                                |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Released harness tag with H3 | `package.json` `"qa-portfolio-harness": "github:Jayami123/qa-portfolio-harness#<tag>"`; env `MEDUSA_SECOND_BASE_URL`, `MEDUSA_LOCK`; files `.harness/medusa-backend.pid`, `medusa-backend-2.pid`, `medusa-backend.log`, `medusa-backend-2.log`                                                                                                                                                                                  | Phase 3 Task 1 (plan `…task1-harness-bump.md`)      |
| Spread framework             | `createRerunRunner`, `spreadPolicyFromEnv`, `attemptTag`, `invalidBudget` in `src/races/rerun-on-spread.ts`                                                                                                                                                                                                                                                                                                                     | Phase 2 Task 1 (on `main`)                          |
| Single-instance race code    | `runOversellCase`, `RunOversellCaseInput` (`src/medusa/run-case.ts`); `checkOversellInvariants`, `checkOrphanOrders` (`src/medusa/invariants.ts`); `readOversellSnapshot`, `waitForOversellStable`, `LEAK_LIVE_ORDER_IDS_SQL`, `leakCheck` (`src/medusa/oracle.ts`); `createStockedVariant`, `seedAndLogin`, `loadCatalog` (`src/medusa/admin.ts`); `prepareReadyCarts`, `completeCart` (`src/medusa/store.ts`); `fireTogether` | Phase 1 / 2 (on `main`)                             |
| Env readers (Task 1 part A)  | `medusaSecondBaseUrlFromEnv`, `medusaLockModeFromEnv`, `MedusaLockMode` in `src/races/env.ts`; `.env.example` names `MEDUSA_SECOND_BASE_URL`, `MEDUSA_REDIS`, `MEDUSA_LOCK`                                                                                                                                                                                                                                                     | Phase 3 Task 1 (plan `…task1-harness-bump.md` §6.4) |
| Env style and prefix         | `requiredEnv`/`intFromEnv` (`src/races/env.ts`), `casePrefix`/`caseLeakPattern`/`attemptEmailLike` (`src/medusa/payloads.ts`), `p6RunPrefix`                                                                                                                                                                                                                                                                                    | Phase 1 (on `main`)                                 |
| Nothing from Tasks 3 to 10   | the two cases are Playwright races, not LOAD runs                                                                                                                                                                                                                                                                                                                                                                               | —                                                   |

## 5. Build-time recheck (day of the build)

| #   | Check                        | Command                                                                                                                                                                            | Expected                                                                                                               |
| --- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 1   | Base                         | `git fetch origin main && git log -1 --format=%h origin/main`                                                                                                                      | `5acd2a0` or a descendant that still contains `a82521a`                                                                |
| 2   | Task 1 merged, tag exists    | `git ls-remote --tags https://github.com/Jayami123/qa-portfolio-harness.git \| grep -v '\^{}' \| sed 's#.*/##' \| sort -V \| tail -1` and `grep qa-portfolio-harness package.json` | newest tag ≥ the tag containing `51b7d1e` (`git merge-base --is-ancestor 51b7d1e <tag>`); `package.json` pins that tag |
| 3   | The tag has the two switches | `grep -n "MEDUSA_SECOND_BASE_URL\|MEDUSA_LOCK" node_modules/qa-portfolio-harness/src/config.ts node_modules/qa-portfolio-harness/src/adapters/medusa-env.ts`                       | both names found                                                                                                       |
| 4   | Baseline unit count          | `export PATH="/usr/local/bin:$PATH"; npm run check`                                                                                                                                | exit 0, `# tests 481` (Task 1 part A leaves 481; the deltas below are relative to whatever it left)                    |
| 5   | Medusa pin unchanged         | `grep MEDUSA_REF scripts/bootstrap.sh .github/workflows/perf.yml`                                                                                                                  | `f677db438f27294fc50e4c7c6612e71ff38eeff5` in both                                                                     |
| 6   | Re-run the probe on the tag  | §3.3, §3.4 and §3.7 commands on a clean worktree (copy §3.2 with `#<tag>`), then the two-line race probe                                                                           | `locking-redis` line in redis mode; `Using "in-memory" as default` in memory mode; `down` leaves 0 listeners           |
| 7   | Existing names still there   | `grep -n "export async function runOversellCase\|export async function completeCart\|MEDUSA_OVERSELL_CASES" src/medusa/run-case.ts src/medusa/store.ts src/ci/race-table.ts`       | three hits                                                                                                             |
| 8   | No other job grew meanwhile  | `gh run list --workflow perf.yml --branch main --limit 3`                                                                                                                          | green runs; re-read §10 numbers if `medusa-smoke` changed                                                              |
| 9   | Task 1's env readers exist   | `grep -n "export function medusaSecondBaseUrlFromEnv\|export function medusaLockModeFromEnv" src/races/env.ts`                                                                     | two hits                                                                                                               |

If check 2 fails, stop and report: the task is blocked on the harness release.

## 6. Design

### 6.1 File tree

```text
.env.example                                   CHANGED  (names only: P6_MEDUSA_LOG_DIR; the three harness names come from Task 1)
.github/workflows/perf.yml                     CHANGED  (new job medusa-multi-instance, 2 matrix legs)
README.md                                      CHANGED  (Phase 3 section: two rows; "Run two Medusa backends locally")
src/medusa/store.ts                            CHANGED  (completeCart/storeRaw take an optional base URL)
src/medusa/harness-log.ts                      NEW      (read the two harness logs: lock line, request counts)
src/medusa/invariants.ts                       CHANGED  (+ checkTwoInstanceTraffic, checkMemoryLockCharacterization, classifyTwoInstanceLoser)
src/medusa/run-case.ts                         CHANGED  (RunOversellCaseInput.instances / .lock, per-instance counts)
src/ci/race-table.ts                           CHANGED  (+ MEDUSA_TWO_INSTANCE_CASES row)
tests/medusa/races/med-race-002-two-instances-redis.spec.ts    NEW
tests/medusa/races/med-race-003-two-instances-memory.spec.ts   NEW
tests/unit/medusa-store-base-url.test.ts       NEW      (+2)
tests/unit/medusa-harness-log.test.ts          NEW      (+7)
tests/unit/medusa-invariants.test.ts           CHANGED  (+9)
tests/unit/race-table.test.ts                  CHANGED  (+3)
```

Nothing under `k6/`. No change to `playwright.config.ts`: the project `medusa-race` has `testDir: "tests/medusa/races"` and
picks the new files up. `medusa-smoke` already excludes by `--grep-invert "P6-MED-RACE-0(05|12|13|14)"`; the two new specs
would match it, so the grep gets `|0(02|03)` added (§10).

### 6.2 `src/races/env.ts`: two readers (built by Task 1, used here)

`medusaSecondBaseUrlFromEnv(env?)` (string or undefined; 127.0.0.1, http, not equal to the primary) and
`medusaLockModeFromEnv(env?)` (`"memory"` default, or `"redis"`) are added by Task 1 part A with their tests; the skeletons are
in the Task 1 plan §6.4. This task only imports them. Why: the specs must know what the harness was told, so a mismatch between
the environment and the observed lock line is reported as ENV, not as a product result. If Task 1 is merged without them, stop
(§5 check 9).

### 6.3 `src/medusa/store.ts` (CHANGED): optional base

`storeRaw(path, publishableKey, init?)` gets `init.baseUrl?: string` and uses `init?.baseUrl ?? medusaBaseUrlFromEnv()`.
`completeCart` becomes

```ts
/** Raced call: never throws on 5xx so the histogram records the real status and body. `baseUrl` picks the backend. */
export async function completeCart(publishableKey: string, cartId: string, baseUrl?: string) {
  const res = await storeRaw(`/carts/${cartId}/complete`, publishableKey, {
    method: "POST",
    baseUrl,
  });
  return { status: res.status, body: res.text };
}
```

Existing callers pass two arguments and are unchanged. Why: the smallest change that lets one cart be completed on either
backend; cart setup keeps using the primary.

### 6.4 `src/medusa/harness-log.ts` (NEW): read the harness logs

```ts
import { readFileSync } from "node:fs";
import path from "node:path";

/** Marker the harness writes before each process start (probe §3.3): `--- spawn <iso> <command> ---`. */
const SPAWN_MARKER = /^--- spawn /m;
// eslint-free ANSI strip: the harness logs colour codes in front of "info:".
// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;]*m/g;

export type LockProvider = "redis" | "memory" | "unknown";

export function stripAnsi(text: string): string {
  return text.replace(ANSI, "");
}

/** Text after the last `--- spawn` line. The logs are append-only across `up` runs. */
export function lastSpawnSection(text: string): string {
  const clean = stripAnsi(text);
  const parts = clean.split(/^--- spawn .*$/m);
  return parts.length > 1 ? (parts[parts.length - 1] ?? "") : clean;
}

/** `locking-redis` provider line => redis; `Using "in-memory" as default` => memory; neither => unknown. */
export function lockProviderFromLog(text: string): LockProvider {
  const section = lastSpawnSection(text);
  if (/Connection to Redis in "locking-redis" provider established/.test(section)) return "redis";
  if (/Locking module: Using "in-memory" as default\./.test(section)) return "memory";
  return "unknown";
}

const COMPLETE_LINE = /"method":"POST","path":"\/store\/carts\/cart_[A-Za-z0-9]+\/complete"/g;

/** Cart completions this backend logged since its last start. */
export function countCompleteRequests(text: string): number {
  return (lastSpawnSection(text).match(COMPLETE_LINE) ?? []).length;
}

/** Harness state directory: `<repo>/node_modules/qa-portfolio-harness/.harness` unless P6_MEDUSA_LOG_DIR is set. */
export function harnessLogDir(env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()): string {
  const override = env.P6_MEDUSA_LOG_DIR?.trim();
  return override ? override : path.join(cwd, "node_modules", "qa-portfolio-harness", ".harness");
}

export function readBackendLog(index: 0 | 1, dir = harnessLogDir()): string {
  return readFileSync(
    path.join(dir, index === 0 ? "medusa-backend.log" : "medusa-backend-2.log"),
    "utf8",
  );
}
```

Why: §3.3 and §3.6 showed that the lock and the traffic are visible only here. `P6_MEDUSA_LOG_DIR` is a test-only override
(add its name to `.env.example`). **Build-time probe must confirm** that Windows paths do not matter: CI and both clouds are
Linux; Windows is not a P6 target.

### 6.5 `src/medusa/invariants.ts` (CHANGED): three pure functions

```ts
/** Client count and server log count per instance must match, and every instance must have been hit. */
export function checkTwoInstanceTraffic(input: {
  clientCounts: readonly number[]; // requests this case sent to instance 0, 1 (warm-up and invalid attempts included)
  serverCounts: readonly number[]; // cart-complete lines each backend logged during the case (delta of two reads)
}): string[] {
  const out: string[] = [];
  input.clientCounts.forEach((sent, i) => {
    if (sent === 0) out.push(`TEST BUG: instance ${i} was sent no request`);
    if (input.serverCounts[i] !== sent) {
      out.push(
        `TEST BUG: instance ${i} logged ${input.serverCounts[i]} cart completions, the client sent ${sent}`,
      );
    }
  });
  return out;
}

/** A loser that is not a clean stock refusal. F-M2's signature is the temp_failure message (Appendix B3 of the Phase 2 closeout). */
export function classifyTwoInstanceLoser(
  message: string,
  type: string | null,
): "clean" | "f-m2-signature" | "other" {
  if (type === "not_allowed" && message.includes("Not enough stock available")) return "clean";
  if (message.includes('"temp_failure"')) return "f-m2-signature";
  return "other";
}

/**
 * -003. Findings are the characterization; violations are what must still hold with a per-process lock.
 * `instances * S` is the bound: each backend admits at most S itself (probe §3.5: 3 + 3 = 6).
 */
export function checkMemoryLockCharacterization(input: {
  s: number;
  instances: number;
  orderCount: number;
  uniqueOrderIds: number;
  httpWinnerCount: number;
  reservationQty: number;
  reserved: number;
  statuses: Array<number | null>;
  loserTypes: string[];
  loserMessages: string[];
}): { violations: string[]; findings: string[]; suspected: string[] } {
  const violations: string[] = [];
  const findings: string[] = [];
  const suspected: string[] = [];
  for (const status of input.statuses) {
    if (status === null || status >= 500)
      violations.push(`PRODUCT BUG: HTTP ${status === null ? "error" : status}`);
    else if (status !== 200 && status !== 400)
      violations.push(`PRODUCT BUG: completion status ${status}`);
  }
  // Ghost order (F-M2/F-M5): a DB order no checkout returned. Not a lock failure.
  if (input.orderCount > input.uniqueOrderIds) {
    suspected.push(
      `SUSPECTED PRODUCT BUG: ${input.orderCount - input.uniqueOrderIds} order(s) in the database that no checkout returned (F-M5)`,
    );
  }
  if (input.uniqueOrderIds !== input.httpWinnerCount) {
    violations.push(
      `PRODUCT BUG: HTTP winners ${input.httpWinnerCount} share order ids (unique ${input.uniqueOrderIds})`,
    );
  }
  if (input.uniqueOrderIds > input.instances * input.s) {
    violations.push(
      `PRODUCT BUG: ${input.uniqueOrderIds} orders exceed instances x S = ${input.instances * input.s}`,
    );
  }
  // Reservation rows follow the orders a checkout returned (probe §3.5: 6 rows for 6 returned orders).
  if (input.reservationQty !== input.uniqueOrderIds) {
    violations.push(
      `PRODUCT BUG: reservation rows ${input.reservationQty} != returned orders ${input.uniqueOrderIds}`,
    );
  }
  input.loserTypes.forEach((type, i) => {
    const kind = classifyTwoInstanceLoser(input.loserMessages[i] ?? "", type);
    if (kind === "f-m2-signature")
      suspected.push("SUSPECTED PRODUCT BUG: loser with the temp_failure message (F-M2)");
    if (kind === "other")
      violations.push(
        `PRODUCT BUG: loser type=${type ?? "missing"} message=${(input.loserMessages[i] ?? "").slice(0, 80)}`,
      );
  });
  if (input.uniqueOrderIds > input.s)
    findings.push(`CHARACTERIZATION: oversold, ${input.uniqueOrderIds} orders for S=${input.s}`);
  if (input.reserved !== input.reservationQty)
    findings.push(
      `CHARACTERIZATION: inventory_level.reserved ${input.reserved} != reservation rows ${input.reservationQty}`,
    );
  return { violations, findings, suspected };
}
```

Keep these three functions small and pure; do not edit `checkOversellInvariants` (it serves 25 other cases). The reservation
rule assumes a ghost order carries no counted reservation: **build-time probe must confirm** (no ghost order occurred in the 54
probe trials); if one does, compare with `orderCount` instead.

### 6.6 `src/medusa/run-case.ts` (CHANGED): reuse, do not copy

Extend the input and keep one code path (the 350-line attempt, sweep and cleanup logic stays single):

```ts
export type RunOversellCaseInput = {
  /* ...existing fields unchanged... */
  /** Backends that receive the completes: request i goes to instances[i % instances.length]. Default: [medusaBaseUrlFromEnv()]. */
  instances?: string[];
  /** Which invariant set decides the trial. "redis" (default) = checkOversellInvariants unchanged; "memory" = checkMemoryLockCharacterization. */
  lock?: MedusaLockMode;
};
```

Inside `runAttempt`, replace `completeCart(input.catalog.publishableKey, cartId)` by
`completeCart(input.catalog.publishableKey, cartId, instances[i % instances.length])`, count `sent[i % n] += 1` (a closure
array shared by warm-up and every attempt), and make the `warm` function hit `/health` of **each** instance. In the
`recordTrial` callback:

- `lock !== "memory"` (including `-001`): call `checkOversellInvariants` exactly as today.
- `lock === "memory"`: call `checkMemoryLockCharacterization`; throw only `violations`; push `suspected` into the case's
  `suspected` array; keep `findings` in `record.oracle` as counts.

Add to `record.oracle` (flat numbers, `RaceOracleValue`): `i0_200`, `i0_400`, `i0_other`, `i1_200`, `i1_400`, `i1_other`
(status counts per instance for this attempt), `oversold` (1 if `uniqueOrderIds > s`, else 0), and `ghostOrders`
(`orderCount - uniqueOrderIds`). At the end of the case, before `histogram.verdict`:

```ts
const traffic = checkTwoInstanceTraffic({ clientCounts: sent, serverCounts: serverDelta() });
histogram.invariantViolations.push(...traffic);
```

where `serverDelta()` is `countCompleteRequests(readBackendLog(i))` read **after** minus the same read **before** the first
warm-up (the log counts every cart completion since the backend started, so a delta is the case's own traffic). Only run this
check when `instances.length > 1`.

Why a delta and not an absolute count: the log is per start, not per case (§3.6), and a rerun of the leg after a failed trial
must not inherit earlier traffic.

### 6.7 The two specs (NEW)

`tests/medusa/races/med-race-002-two-instances-redis.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { seedAndLogin, loadCatalog } from "../../../src/medusa/admin.ts";
import { runOversellCase } from "../../../src/medusa/run-case.ts";
import { lockProviderFromLog, readBackendLog } from "../../../src/medusa/harness-log.ts";
import { closePool, createReadOnlyPool } from "../../../src/oracles/pg.ts";
import { p6RunPrefix } from "../../../src/races/prefix.ts";
import {
  medusaBaseUrlFromEnv,
  medusaLockModeFromEnv,
  medusaSecondBaseUrlFromEnv,
  raceTrialsFromEnv,
} from "../../../src/races/env.ts";

const trials = raceTrialsFromEnv();

test.describe("P6-MED-RACE-002 two Medusa backends, Redis lock", () => {
  // 60 s + 30 s per trial, as -001 (2x the worst measured per-trial time).
  test.describe.configure({ timeout: 60_000 + trials * 30_000 });
  const runPrefix = p6RunPrefix();
  const pool = createReadOnlyPool();
  let token: string;
  let catalog: Awaited<ReturnType<typeof loadCatalog>>;
  let second: string;

  test.beforeAll(async () => {
    // Guards first: a wrong topology is ENV, never a product result (rule: root-cause, never weaken).
    const url = medusaSecondBaseUrlFromEnv();
    if (url === undefined)
      throw new Error("ENV: MEDUSA_SECOND_BASE_URL is unset; the harness started one backend");
    second = url;
    if (medusaLockModeFromEnv() !== "redis")
      throw new Error("ENV: MEDUSA_LOCK must be redis for P6-MED-RACE-002");
    for (const [i, base] of [medusaBaseUrlFromEnv(), second].entries()) {
      const res = await fetch(`${base}/health`);
      if (res.status !== 200) throw new Error(`ENV: instance ${i} /health HTTP ${res.status}`);
      const provider = lockProviderFromLog(readBackendLog(i as 0 | 1));
      if (provider !== "redis")
        throw new Error(
          `ENV: instance ${i} lock provider is ${provider}, expected redis (harness config, not a product result)`,
        );
    }
    token = await seedAndLogin();
    catalog = await loadCatalog(token);
  });
  test.afterAll(async () => {
    await closePool(pool);
  });

  test("P6-MED-RACE-002 S=3, N=15 across two instances → orders≤S", async () => {
    const histogram = await runOversellCase({
      pool,
      token,
      catalog,
      runPrefix,
      caseId: "P6-MED-RACE-002",
      title: "S=3, N=15 across two instances, Redis lock → orders≤S",
      s: 3,
      n: 15,
      mode: "qty1",
      trials,
      instances: [medusaBaseUrlFromEnv(), second],
      lock: "redis",
    });
    for (const line of histogram.suspected ?? [])
      test.info().annotations.push({ type: "suspected-bug", description: line });
    expect(histogram.verdict).toBe("pass");
  });
});
```

`-003` is the same file shape with: `MEDUSA_LOCK` must be `memory` (guard `lockProviderFromLog === "memory"` on both
instances), `caseId: "P6-MED-RACE-003"`, `lock: "memory"`, `trials` taken from `raceTrialsFromEnv()` (the matrix passes 8 on
PRs, 50 otherwise), and after the verdict check a characterization block:

```ts
// Characterization (annotation, not a product bug): record it, then assert the documented behaviour.
const valid = histogram.attempts.filter((a) => a.valid);
const oversold = valid.filter((a) => a.oracle.oversold === 1).length;
test.info().annotations.push({
  type: "characterization",
  description: `P6-MED-RACE-003: in-memory lock across two instances oversold in ${oversold} of ${valid.length} trials (expected; shows why a shared lock is required)`,
});
expect(histogram.verdict).toBe("pass"); // hard invariants of checkMemoryLockCharacterization held in every trial
expect(oversold).toBeGreaterThanOrEqual(1); // the documented behaviour; see §7.3 for the miss probability and what a red means
```

No `test.fail()` in either file: neither case has a proven product bug (§7.2).

### 6.8 `src/ci/race-table.ts` (CHANGED) and `README.md`

`MEDUSA_TWO_INSTANCE_CASES = new Set(["P6-MED-RACE-002", "P6-MED-RACE-003"])`; in `outcomeFor`, before the
`MEDUSA_OVERSELL_CASES` branch:

```ts
if (MEDUSA_TWO_INSTANCE_CASES.has(caseId)) {
  const oversold = trialNumbers(valid, "oversold");
  if (!oversold) return { keyCounts: NA, outcome: NA };
  const n = sum(oversold);
  return {
    keyCounts: `oversold trials ${n}; ghost orders ${sum(trialNumbers(valid, "ghostOrders") ?? [])}`,
    outcome:
      caseId === "P6-MED-RACE-003"
        ? `Characterization: oversold in ${n} of ${unit} (expected with the in-memory lock)`
        : n > 0
          ? `Oversold in ${n} of ${unit}`
          : `No oversell in ${unit}`,
  };
}
```

Why a separate branch: the existing branch counts `available < 0`, which stays 0 under the `memory` lost update (§3.5).
README: add the two cases to the Phase 3 list and a short "Run two Medusa backends locally" block (the env lines in §11) and
state that `-003` is a characterization.

## 7. Oracles and assertions

### 7.1 Guards (TEST BUG / ENV, before any race)

| Guard | Check                                                                                                          | Failure label                               |
| ----- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| G1    | `MEDUSA_SECOND_BASE_URL` set, 127.0.0.1, different from `MEDUSA_BASE_URL`                                      | `ENV:` the harness ran one backend          |
| G2    | `/health` 200 on both                                                                                          | `ENV:`                                      |
| G3    | `lockProviderFromLog` of **both** logs equals the case's lock (`redis` / `memory`)                             | `ENV:` harness config, not a product result |
| G4    | After the case: client count per instance equals the server log delta (`checkTwoInstanceTraffic`) and both > 0 | `TEST BUG:`                                 |

G3 is the answer to the roadmap risk "a `-002` failure that is a configuration error (lock provider not registered) is
labelled TEST/ENV until the probe proves otherwise": while G3 fails there is no race result at all.

### 7.2 `-002`: strict, with the existing oracle

Per trial `checkOversellInvariants(mode "qty1", s 3, n 15)` unchanged: orders ≤ S (DB `ORDERS_FOR_VARIANT_SQL`), exactly S
orders, HTTP 200 count = S, 400 count = N − S, reservations = orders, `available` 0, losers `not_allowed` with "Not enough
stock available", no 5xx, HTTP unique order ids = DB orders. The SQL is read-only (`createReadOnlyPool`,
`default_transaction_read_only=on`; `assertSelectOnly` in `selectRows`). **PRODUCT BUG** only when: G3 proved `redis` on both
backends **and** the failure repeats in at least three full-count CI runs (rule 13); before that it is SUSPECTED. A single
oversell with a ghost order (orders > HTTP winners) is F-M5/F-M2 (§7.4), not a lock failure. No `test.fail()` exists for it
(none is proven); if a repeated oversell is later proven, add the labelled pattern: guards first, then the `issue`
annotation `"P6-MED-RACE-002: …"`, then `test.fail()`, then the strict assertion.

### 7.3 `-003`: characterization, with its own invariants

Hard (must hold every trial): `checkMemoryLockCharacterization.violations` empty: no 5xx, only 200/400, clean losers,
`uniqueOrderIds ≤ instances × S` (6), reservation rows = returned orders. Recorded (not failures): `findings` (oversold,
`reserved` ≠ reservation rows) as the `characterization` annotation. Asserted: `oversold ≥ 1` over the valid trials.

Miss probability (a false red on a correct run), from the probe rate: 26 of 30, Wilson 95 % lower end `p = 0.703`.
`P(no oversell in k trials) = (1 − p)^k = 0.297^k`: k = 3 → **2.6 %** (too high for a PR), k = 8 → **6.1e-5**, k = 50 → 1e-26.
The D65 formula (`ceil(ln 0.01 / ln(1 − p))`) gives 4 trials for a 1 % miss; the plan uses **8** on pull requests (miss 6e-5,
cost 3.1 min worst, §10) and **50** otherwise. If the CI rate (§3.10 item 2) is lower than the probe's, recompute with the
same formula before merging; the number is a plan input, not a guess.

What a red `oversold ≥ 1` means: G3 passed (memory lock on both) yet no oversell in 8 or more trials. Label **ENV/TEST**
until a full-count run shows the same; then the characterization changed (Medusa made the lock shared by default, or the
harness changed). The owner decides. It is never reported as a product bug and the test is never loosened.

### 7.4 Known Medusa bugs that appear in two-instance traces, told apart from a lock failure

The two cases only run checkouts (`POST /store/carts/:id/complete`) on cart-setup that other cases already use. Evidence for
each signature is in the case histograms (`attempts[].oracle`) and the `suspected` array.

| Signal                                                                                                                         | Where it shows                                                                                     | What it is                                                                                  | Label                   |
| ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------- |
| Orders > S and every order was returned by an HTTP 200 (`ghostOrders` 0, `orderCount == httpWinnerCount`), `redis` lock proven | `oversold` 1                                                                                       | A lock failure. In `-003` expected; in `-002` suspected, then PRODUCT BUG after 3 full runs | by case (§7.2, §7.3)    |
| A DB order that no checkout returned; the sweep finds it by email                                                              | `ghostOrders` > 0 and a `suspected` line `orphan order (F-M5)`                                     | F-M5, same mechanism as F-M2 (Phase 2 closeout 6b). Not a lock failure                      | SUSPECTED, annotation   |
| A 400 loser whose message is `Updating Status from "ok" to "temp_failure" is not allowed.`                                     | `classifyTwoInstanceLoser` → `f-m2-signature`                                                      | F-M2 ghost-order signature (closeout Appendix B3)                                           | SUSPECTED, annotation   |
| Any 400 loser with another message                                                                                             | `classifyTwoInstanceLoser` → `other`                                                               | Contract violation                                                                          | PRODUCT BUG (violation) |
| F-M1 (refund 400 after the row), X04/X05, F-M3 (reservation restored by a losing cancel/fulfil), F-M4 (summary refund)         | cannot appear: the cases never refund, cancel or fulfil                                            | If a trace shows them, the flow is wrong                                                    | TEST BUG                |
| `reserved ≠ reservation rows` with 2 backends                                                                                  | `-003` `findings`; `-002` violation `reservationQty !== orderCount` from `checkOversellInvariants` | In `-003` part of the lost update; in `-002` a real inconsistency                           | by case                 |

Rule: a ghost order never makes a `-002` result "a lock failure" and never excuses an oversell where every order was
returned. The sweep and cleanup of `runOversellCase` already cancel and archive every live order of the attempt by email
(F-M5 sweep), so ghosts do not leak into the next attempt.

## 8. Data isolation, cleanup, leak check

- Prefix: `casePrefix(runPrefix, caseId)` = lowercased `${p6RunPrefix()}-P6-MED-RACE-002` (or `-003`); every product handle,
  SKU and customer email of an attempt starts with it (`attemptEmailLike`). Cart setup runs on the primary only.
- Cleanup (per attempt, in `finally` of `runOversellCase`): sweep live orders by email (`LEAK_LIVE_ORDER_IDS_SQL`), cancel
  and archive them, delete the product, delete the customers. A failing sweep is a cleanup violation, never silent.
- Leak check at the end: `leakCheck(pool, caseLeakPattern(runPrefix, caseId), inventoryItemIds)` (products, live orders,
  customers, live reservations). A non-zero count is `TEST BUG`/`PRODUCT BUG` as `leakCheck` labels it.
- The leak assertion is **not** skipped: it can read non-zero (a `memory` trial leaves 6 orders; the cleanup must remove all
  6), so it is informative in `-003` too.
- The harness leaves the two backends' logs in place; they hold no customer data beyond generated cart ids and `p6-qa-…@qa.local`.

## 9. Token scan

New artefacts: the case histograms (`results/races/P6-MED-RACE-00{2,3}.json`), the Playwright JSON, and, new, copies of both
backend logs (the only proof of per-instance traffic; ≈ 3 MB and 0.2 MB after 57 trials, probe §3). Probe result:
`node scripts/evidence-token-scan.mjs /tmp/s/scan` on copies of both logs → `token scan: clean`, exit 0, and
`grep -c "Authorization\|Bearer"` = 0 in both. In CI a step runs the repo scanner on a staging directory before any upload
(§10); a hit stops the upload.

## 10. CI

### 10.1 Why a separate job, with numbers

Convention (Phase 2 closeout §2.7, Task 3 §11): worst case = job overhead measured worst, with the image pull at its cap, plus
the race step at (trials + 1 warm-up + invalid budget) × per-trial time; at least 10 min under the job timeout; the race step
under 80 % of its step timeout; no timeout raised.

Inputs (all measured, §3.9): job overhead = `medusa-smoke` slowest green job 22.0 min − its race step 1184 s (19.7 min) = 2.3
min, of which the pull is < 20 s; pull at the cap (6 min) → **8.0 min**. Start Medusa (slowest 49 s, plus 10 s for the second
backend) → **1.0 min**. `down` 1.3 s → **0.1 min**. Per trial 16.51 s (slowest known `-001`; build-time probe confirms).
Invalid budget at 50 trials: `invalidBudget(50, 20, 2)` = 10. One case: (50 + 1 + 10) × 16.51 s + 6 s setup = 1013 s = **16.9 min**.

| Design                                            | Worst case (min)                  | Timeout | Margin   | Verdict |
| ------------------------------------------------- | --------------------------------- | ------- | -------- | ------- |
| Add both cases to `medusa-smoke`                  | 26.2 + 2 × 16.9 + 2.2 = 62.2      | 45      | −17.2    | no      |
| One new job, both modes in sequence               | 8.0 + 2.0 + 33.8 + 0.2 = 44.0     | 45      | 1.0      | no      |
| **One job, two matrix legs, one runner per mode** | 8.0 + 1.0 + 16.9 + 0.1 = **26.0** | 45      | **19.0** | **yes** |

`medusa-smoke` is already at 26.2 min worst case and a 24.1 min race-step estimate against a 24.0 stop rule (closeout §2.7), so
nothing is added to it (Q1). Race step of a leg: 16.9 min against a 30-min step timeout (stop rule 24.0) → under it. PR
legs: `-002` (3 + 1 + 2) × 16.51 + 6 = 105 s = 1.8 min; `-003` (8 + 1 + 2) × 16.51 + 6 = 188 s = 3.1 min; step timeout 10 min
(stop rule 8.0) → under it. Both legs run in parallel, so the workflow wall time is the longer leg.

### 10.2 `perf.yml` changes (exact)

1. `medusa-smoke` race step grep: `--grep-invert "P6-MED-RACE-0(05|12|13|14)"` → `--grep-invert "P6-MED-RACE-0(02|03|05|12|13|14)"`.
   (Without this the two new specs would run in `medusa-smoke` and break its budget.)
2. New job after `medusa-cancel-extras`, copying the structure of `medusa-order-races` (lines 234 to 407: checkout, Medusa
   fork checkout and HEAD verify, stub product roots, setup-node, `npm ci`, corepack pnpm, pnpm store restore, Medusa
   dependencies, build cache **restore only**, admin password, image pull with `compose-pull.sh`, harness up, race, summary,
   upload, down) **without** the k6 install and smoke steps (this job needs no k6; Task 7 deletes those steps elsewhere):

```yaml
medusa-multi-instance:
  name: medusa-multi-instance (${{ matrix.lock }})
  runs-on: ubuntu-24.04
  timeout-minutes: 45
  strategy:
    fail-fast: false
    matrix:
      include:
        - { lock: redis, case: P6-MED-RACE-002, pr_trials: "3" }
        - { lock: memory, case: P6-MED-RACE-003, pr_trials: "8" }
  env:
    P6_WORKING_DIRECTORY: p6
    PRODUCTS_ROOT: ${{ github.workspace }}/products
    MEDUSA_CHECKOUT_PATH: products/medusa-dtc-starter
    MEDUSA_BASE_URL: http://127.0.0.1:9000
    MEDUSA_SECOND_BASE_URL: http://127.0.0.1:9001
    MEDUSA_REDIS: "1"
    MEDUSA_LOCK: ${{ matrix.lock }}
    # Public harness default database URL, not a secret.
    MEDUSA_DB_URL: postgres://medusa:medusa@127.0.0.1:5433/medusa
    MEDUSA_ADMIN_EMAIL: admin@qa.local
    MEDUSA_SKIP_STOREFRONT: "1"
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: "1"
    COREPACK_ENABLE_STRICT: "0"
```

Steps and their `timeout-minutes` (every new step has one): checkout 2; Medusa fork checkout 6; verify HEAD 1; stub roots 1;
setup-node 3; `npm ci` 5; corepack 2; pnpm store restore 3; Medusa deps 8; build cache restore 3; admin password 1; image pull
6 (as `medusa-order-races`); **Start Medusa** 10; **guard** below 2; **race** `${{ github.event_name == 'pull_request' && 10 || 30 }}`;
log memory 1; token scan 2; summary 2; uploads 3 each; **Stop Medusa** 3.

```yaml
- name: Race ${{ matrix.case }} (two Medusa backends, ${{ matrix.lock }} lock)
  if: ${{ steps.medusa_up.outcome == 'success' }}
  working-directory: ${{ env.P6_WORKING_DIRECTORY }}
  timeout-minutes: ${{ github.event_name == 'pull_request' && 10 || 30 }}
  env:
    RACE_TRIALS: ${{ github.event_name == 'pull_request' && matrix.pr_trials || '50' }}
    P6_PLAYWRIGHT_JSON: results/playwright/${{ matrix.case }}.json
  run: |
    set -euo pipefail
    npm run race:medusa -- --grep "${{ matrix.case }}"

- name: Log memory (both backends, Postgres, Redis)
  if: ${{ !cancelled() && steps.medusa_up.outcome == 'success' }}
  timeout-minutes: 1
  run: |
    free -m
    for f in node_modules/qa-portfolio-harness/.harness/medusa-backend.pid node_modules/qa-portfolio-harness/.harness/medusa-backend-2.pid; do
      [ -f "p6/$f" ] && grep -E 'VmRSS|VmHWM' "/proc/$(jq -r .pid "p6/$f")/status" || true
    done
    docker stats --no-stream --format '{{.Name}} {{.MemUsage}}'

- name: Check artefacts for tokens
  id: token_check
  if: ${{ !cancelled() && steps.medusa_up.outcome == 'success' }}
  working-directory: ${{ env.P6_WORKING_DIRECTORY }}
  timeout-minutes: 2
  run: |
    set -euo pipefail
    mkdir -p results/evidence
    cp -r results/races results/evidence/races
    cp node_modules/qa-portfolio-harness/.harness/medusa-backend.log node_modules/qa-portfolio-harness/.harness/medusa-backend-2.log results/evidence/
    node scripts/evidence-token-scan.mjs results/evidence

- uses: actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2
  if: ${{ !cancelled() && steps.token_check.outcome == 'success' }}
  with:
    name: race-histograms-medusa-multi-instance-${{ matrix.lock }}
    path: ${{ env.P6_WORKING_DIRECTORY }}/results/evidence/
    if-no-files-found: warn
    retention-days: 14
```

(The Playwright JSON is not scanned by the repo scanner because its `config.metadata` holds the git diff; the job
summary step reads it as the other jobs do. The Documenso job's `jq '{suites, errors}'` scan pattern is the model if the
owner wants the JSON uploaded.) 3. The `Stop Medusa` step is `if: always()`, `npm run down:medusa || true`, as in the other jobs (X7 is a known harness item,
not this task's). 4. Trial counts: PR `-002` 3, `-003` 8; `main`, schedule, `workflow_dispatch` 50 for both (Phase 1 D2). No job timeout raised. 5. `actionlint` runs inside `npm run check`; expected output is empty.

Worst case, restated: **job `medusa-multi-instance` leg, 26.0 min against a 45-min timeout, margin 19.0 min**; race step 16.9
min against a 30-min timeout (stop rule 24.0).

## 11. Environment changes

None for Cursor Cloud or Claude Code cloud: no new tool, no new host (Redis and Postgres run in the harness's containers; the
second backend needs no image). The names `MEDUSA_SECOND_BASE_URL`, `MEDUSA_REDIS` and `MEDUSA_LOCK` are in `.env.example` from
Task 1. This task adds one test-only name after them:

```text
# Test-only: folder that holds medusa-backend.log and medusa-backend-2.log. Default: node_modules/qa-portfolio-harness/.harness
P6_MEDUSA_LOG_DIR=
```

Running locally: `export PATH="/usr/local/bin:$PATH"; MEDUSA_REDIS=1 MEDUSA_LOCK=redis MEDUSA_SECOND_BASE_URL=http://127.0.0.1:9001 npm run up:medusa`,
the race, then `npm run down:medusa` (the same variables are not needed for `down`, §3.7). Switching the lock mode needs a `down`
first (§3.7). Timings on a cloud VM prove a test works and are never published.

## 12. Build order (one commit per step; `npm run check` after each)

Run from the repo root with `export PATH="/usr/local/bin:$PATH"`. Branch: `git switch -c feat/<build date>-p6-med-multi-instance origin/main`.
Unit counts are relative to the baseline B measured in §5 check 4 (481 once Task 1 part A is merged).

| Step | Commit subject                                                                       | `git add` paths                                                                                                                                                                                 | `npm run check` expected                                                          |
| ---- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 0    | (none) bring this plan onto the branch                                               | `git checkout origin/plan/2026-10-24-p6-phase3-plans -- docs/plans/2026-10-24-p6-phase3-task2-med-multi-instance.md`, commit `docs(plans): bring the phase 3 task 2 plan onto the build branch` | exit 0, B tests                                                                   |
| 1    | `feat(medusa): let cart completion target a chosen backend`                          | `src/medusa/store.ts tests/unit/medusa-store-base-url.test.ts`                                                                                                                                  | exit 0, **B + 2**                                                                 |
| 2    | `feat(medusa): read the lock provider and request counts from the harness logs`      | `src/medusa/harness-log.ts tests/unit/medusa-harness-log.test.ts`                                                                                                                               | exit 0, **B + 9**                                                                 |
| 3    | `feat(medusa): add the two-instance traffic and memory-lock characterization checks` | `src/medusa/invariants.ts tests/unit/medusa-invariants.test.ts`                                                                                                                                 | exit 0, **B + 18**                                                                |
| 4    | `feat(medusa): run oversell trials across several backends`                          | `src/medusa/run-case.ts`                                                                                                                                                                        | exit 0, B + 18 (no new unit test; typecheck proves the shape)                     |
| 5    | `feat(ci): summarise the two-instance cases`                                         | `src/ci/race-table.ts tests/unit/race-table.test.ts`                                                                                                                                            | exit 0, **B + 21**                                                                |
| 6    | `test(medusa): add P6-MED-RACE-002 and P6-MED-RACE-003`                              | `tests/medusa/races/med-race-002-two-instances-redis.spec.ts tests/medusa/races/med-race-003-two-instances-memory.spec.ts`                                                                      | exit 0, B + 21; `npx playwright test --project=medusa-race --list` shows both ids |
| 7    | `ci(perf): run the two-instance races in a two-leg job`                              | `.github/workflows/perf.yml`                                                                                                                                                                    | exit 0 (actionlint silent), B + 21                                                |
| 8    | `docs: document the two-instance races`                                              | `README.md`                                                                                                                                                                                     | exit 0, B + 21                                                                    |

New unit tests, by name (these are the 21):

- `tests/unit/medusa-store-base-url.test.ts` (+2): `completeCart posts to the given base URL` (local `node:http` server on port 0 records the path and the `x-publishable-api-key` header); `completeCart falls back to MEDUSA_BASE_URL`.
- `tests/unit/medusa-harness-log.test.ts` (+7): `lastSpawnSection returns the text after the last marker`; `lockProviderFromLog reads redis from the real locking-redis line`; `… reads memory from the real in-memory line`; `… ignores an earlier section (append-only log)`; `… returns unknown when neither line exists`; `countCompleteRequests counts only cart completions after the last marker`; `harnessLogDir honours P6_MEDUSA_LOG_DIR`. Fixtures are the real lines quoted in §3.3, §3.4 and §3.6.
- `tests/unit/medusa-invariants.test.ts` (+9): `checkTwoInstanceTraffic` accepts equal counts; flags a count mismatch; flags an instance with zero requests; `classifyTwoInstanceLoser` returns clean, f-m2-signature and other (3 tests); `checkMemoryLockCharacterization` reports an oversold clean trial as findings only (no violation); flags a 5xx; flags orders above `instances × S`.
- `tests/unit/race-table.test.ts` (+3): `-002` row with no oversell; `-003` row counts oversold from `oversold`, not from `available`; a two-instance histogram without `oversold` gives n/a.

After step 8: `git push -u origin feat/<build date>-p6-med-multi-instance`, open the PR with `gh pr create` (rules A3), read CI once
(rule 15), then dispatch three full-count `workflow_dispatch` runs on the branch to measure the per-trial time and the
`-003` rate before merging (§3.10); record them in the PR body, not in this plan.

## 13. Risks, proposed extras, open questions

### Risks

| ID  | Risk                                                             | Mitigation                                                                                                        |
| --- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| R1  | The tag with H3 is not released yet                              | §5 check 2 stops the build; Task 1 owns the pin                                                                   |
| R2  | Runner memory with two backends (VM: ≈ 2.3 GB used of 16)        | `Log memory` step in every leg; no number is quoted before three CI runs                                          |
| R3  | CI per-trial time above 16.51 s makes the worst case grow        | first three dispatch runs recompute §10; if a leg exceeds 35 min the trial count is cut, never the timeout raised |
| R4  | The `memory` rate on the runner is lower than 86.7 %             | PR count 8 is recomputed with the §7.3 formula before merge                                                       |
| R5  | A harness log is truncated or rotated by another job step        | G3 reads the last spawn section; absence gives `unknown` and an ENV stop                                          |
| R6  | Both backends share one in-memory event bus assumption (roadmap) | false in both modes: `MEDUSA_REDIS=1` shares the bus (§3.4); `-003` differs from `-002` only by the lock          |
| R7  | `inventory_level.reserved` lost update changes `leakCheck`       | `leakCheck` counts live reservation rows, not the counter; cleanup deletes the product (checked in step 7 CI run) |

### Proposed extras (out of scope until the owner accepts them; new IDs)

- `P6-MED-RACE-016`: the same cart completed in parallel on both instances with the Redis lock: one order, both answers 200
  with one order id (extends the sameCart extra across replicas; the per-cart lock `medusa_lock:cart_*` has a 10 s TTL, §3.3).
- `P6-MED-RACE-017`: Task 8 report E1, `-003` with `MEDUSA_REDIS` unset (per-process event bus).
- `P6-MED-RACE-018`: Task 8 report E2, a token issued by one instance is accepted by the other (`JWT_SECRET` shared).

### Open questions for the owner

- **Q1.** Accept a separate two-leg job `medusa-multi-instance` instead of adding the cases to `medusa-smoke`? Numbers in §10.1
  (62.2 min worst case in `medusa-smoke`, 26.0 min per leg in the new job). Proposed: yes.
- **Q2.** Accept `-003` asserting `oversold ≥ 1` with 8 PR trials (false red 6e-5 at the probe's lower rate), instead of
  recording only on PRs? Proposed: yes; recording-only would let a silent change of Medusa's default lock pass.
- **Q3.** `-003` as a Playwright `characterization` annotation (not `test.fail()`, not an issue label): confirm the wording
  "characterization" for the README row. Proposed: yes.
- **Q4.** Add `P6-MED-RACE-016` to this task? Proposed: later, after `-002` is green three times.
- **Q5.** The harness `Unreleased` section also upgrades zod to 4; P6 does not import zod, but P1, P2 and P5 consume the same
  tag. Confirm the harness release is the maintainer's to cut after those consumers are checked (Task 1 plan, Q-list).

## 14. Done when (roadmap, made measurable)

- [ ] `P6-MED-RACE-002` passes at the PR count (3 trials) and at 50 trials on `main`/dispatch with 0 oversold trials, or a
      proven product bug is recorded with three full-count runs (§7.2). Evidence: histogram `results/races/P6-MED-RACE-002.json`
      with `verdict: "pass"`.
- [ ] `P6-MED-RACE-003`'s characterization is recorded (annotation `characterization` with the oversold count) and asserted
      (`oversold ≥ 1`, hard invariants every trial) at 8 and 50 trials. Evidence: `P6-MED-RACE-003.json` and the job summary row.
- [ ] Per-instance traffic proven in both: `checkTwoInstanceTraffic` empty (client count = server log delta, both > 0).
- [ ] Histograms and both backend logs uploaded after a clean `evidence-token-scan` (artifact
      `race-histograms-medusa-multi-instance-{redis,memory}`).
- [ ] Leak check empty at the end of both cases.
- [ ] Every new `perf.yml` step has `timeout-minutes`; leg worst case ≤ 35 min against 45 (margin ≥ 10); no existing timeout changed.
- [ ] `npm run check` exit 0 with **502** unit tests (481 + 21); no skipped test.

## 15. Rule 20 self-check

- (a) Done-when items are listed in §14; open gaps: CI per-trial time and the `memory` rate on the runner (§3.10), settled by the
  three dispatch runs before merge.
- (b) Existing names grepped at `5acd2a0`: `runOversellCase`, `RunOversellCaseInput` (`src/medusa/run-case.ts`), `completeCart`,
  `storeRaw` (`src/medusa/store.ts`), `medusaBaseUrlFromEnv` (`src/races/env.ts`), `checkOversellInvariants`,
  `checkOrphanOrders` (`src/medusa/invariants.ts`), `MEDUSA_OVERSELL_CASES` (`src/ci/race-table.ts`), `evidence-token-scan.mjs`,
  `medusa-order-races` job. From Task 1 (not built here): `medusaSecondBaseUrlFromEnv`, `medusaLockModeFromEnv`. NEW:
  `src/medusa/harness-log.ts` and its functions, `checkTwoInstanceTraffic`, `classifyTwoInstanceLoser`, `checkMemoryLockCharacterization`,
  `MEDUSA_TWO_INSTANCE_CASES`, the two specs, the job; each has a skeleton in §6.
- (c) CI time: §10.1 includes the invalid budget, the warm-up, the pull at its cap and setup; 26.0 min against 45.
- (d) Skeletons: §6. Steps with `git add` paths, commit subjects and expected output: §12.
- (e) No owner answer is recorded in this plan; §13 holds proposals only (the Task 8 report's Q1 and Q6 answers are cited as
  given there).
