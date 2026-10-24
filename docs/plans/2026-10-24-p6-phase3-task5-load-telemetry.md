# P6 Phase 3 Task 5: outside-only telemetry sampler and correlated chart (`P6-X-LOAD-002`, `P6-X-LOAD-006`) (plan only)

This is the plan a weaker model builds from. It changes nothing in the repo. Structure follows
[docs/reference/p1-plan-example-medusa.md](../reference/p1-plan-example-medusa.md). Scope source: roadmap
[2026-10-22-p6-phase3-roadmap.md](2026-10-22-p6-phase3-roadmap.md) (on `origin/plan/2026-10-22-p6-phase3`), "Task 5", D2, D8, D14. It builds on the
interfaces of the Task 3 plan ([task3](2026-10-24-p6-phase3-task3-load-foundation.md) §6.2 types and stage pipeline, §6.4 runner) and the Task 4 plan
([task4](2026-10-24-p6-phase3-task4-load-validity.md) §6.2 `InvalidReason`, §6.3 `judgeValidity`, §6.4 `src/load/proc-stats.ts`, §6.7 wiring). Names not defined here are
defined there; if the merged code differs, the build stops at §5 check 3.

## 1. Header

- **Task.** Phase 3 Task 5. Cases: `P6-X-LOAD-002` (P0), `P6-X-LOAD-006` (accepted extra: sampler overhead).
- **Plan branch.** `plan/2026-10-24-p6-phase3-plans` (no PR, never deleted).
- **Build branch (pattern).** `feat/<build date>-p6-load-telemetry`.
- **Base.** `origin/main` = `5acd2a0`, plus Tasks 3 and 4 merged.
- **Harness pin assumed.** Any. Process records read: `.harness/medusa-backend.pid` (+ `medusa-backend-2.pid`), `.harness/documenso-web.pid`, and for Cal
  `results/harness/cal.pgid` (the P6 bridge) **until Task 1 part B**, then `.harness/cal-web.pid` (Task 1 plans). No harness telemetry (D2).
- **Environment change.** None (§11).
- **Unit tests.** B = count on main when the build starts (today's chain: 599 after Tasks 1 to 4). This plan adds **+56** (§12); expected B + 56 (**655** today). Chain in merge order: 471 -> T1 481 -> T2 503 -> T3 556 -> T4 599 -> T5 655 -> T6 688 -> T7 706 -> T8 723 -> T9 747 -> T10 781.
- **Owner decisions taken (2026-10-24, recorded, not open).** Q1 split into a new job `load-overhead`, move **both** Task 5 self-tests there, and keep `load-selftest` at 20 minutes (no raise). Q2 accept the cgroup reads. Q3 one chart per run. Q4 yes, the p95 panel is labelled "info, not a result". All closed in §13.
- **Stop for owner review.** Yes (rule 10): a CI workflow change and a shared runner change.

## 2. What it proves

- **Bottleneck attribution without touching the product.** Beside every LOAD run an outside-only sampler records database sessions, lock waits, commit and rollback
  rates, the application's CPU and memory, the database container's CPU and memory, a health-probe latency and error-line counts, on the clock k6 uses, and one self-contained
  chart lines them up with the load. A gap or a clock skew makes the run INVALID (Task 4 reasons), never a pass.
- **Finance and healthcare.** The evidence an incident review needs in a bank or a hospital when the system cannot be instrumented: was it the database, the locks, the application or the load tool?
- **`P6-X-LOAD-006`.** The sampler itself must not change what it observes: with and without it, the same stub run stays inside a recorded margin.

## 3. Live probe evidence

Probe date 2026-10-24 (UTC), cloud VM (Node v22.23.3 and v24.21.0, 4 vCPU, 16 GB, Ubuntu 24.04.5, root), k6 2.3.0. Timings and memory are **VM, proof only**. Products were started with
`npm run up:medusa|cal|documenso` and stopped with the matching `down` (Cal through the P6 bridge). Throwaway scripts (`/tmp/s/probe/sampler.mjs`, `pgstats.ts`, `procgroup.mjs`, `skew/`, `co/overhead.mjs`) are not committed.

### 3.1 Can the harness database users read other sessions? (roadmap probe item 1)

`pgstats.ts` connects through the repo's own read-only pool (`createReadOnlyPool`, `default_transaction_read_only=on`) with the harness URL of each product:

```text
Medusa    postgres://medusa:medusa@127.0.0.1:5433/medusa      role [{"u":"medusa","super":true,"read_all_stats":true,"ro":"on"}]    pg_stat_activity 6 rows, hidden query text 0
Cal       postgresql://postgres@127.0.0.1:5450/calendso       role [{"u":"postgres","super":true,"read_all_stats":true,"ro":"on"}]  1 row (only the probe itself; Cal keeps connections idle), hidden 0
Documenso postgres://documenso:password@127.0.0.1:5451/documenso role [{"u":"documenso","super":true,"read_all_stats":true,"ro":"on"}] 8 rows, hidden 0
```

All three roles are superusers (the images create `POSTGRES_USER` as superuser), so full rows are visible: `state`, `wait_event_type`, `wait_event`, `query`; `pg_locks` has every session; `pg_stat_database`
returns `xact_commit`, `xact_rollback`, `blks_read`, `blks_hit`, `deadlocks`, `numbackends` (as strings: `bigint` columns come back as text from `pg`, so the code casts with `::bigint` and `Number()`).
`SELECT count(*) FILTER (WHERE NOT granted) FROM pg_locks` was 0 at idle. A role without `pg_read_all_stats` would see `<insufficient privilege>` in `query` and null `wait_event` for other roles'
sessions; the sampler therefore records `visibleSessions` (rows whose `state` is not null) beside `totalSessions` and never reads `query` (not needed, and it can carry data). Not run with such a role: **build-time probe must confirm** that the counts degrade as described if a harness ever stops using a superuser.

### 3.2 Container names and the cost of `docker stats` (probe item 2)

```text
docker ps --format '{{.Names}}'   qa-harness-medusa-postgres-1  qa-harness-medusa-redis-1  |  qa-harness-cal-postgres-1  |  qa-harness-documenso-postgres-1  qa-harness-documenso-inbucket-1
$ docker stats --no-stream --format '{{.Name}} {{.CPUPerc}} {{.MemUsage}}'      1.05 s, 2.00 s, 2.00 s   (one container: 2.00 s, 2.00 s, 2.00 s)
$ docker inspect -f '{{.State.Pid}}' qa-harness-medusa-postgres-1               0.023 s
```

`docker stats --no-stream` costs about **2 seconds per call** (it samples for two seconds), longer than a 1 s sampling interval; calling it in the loop would create gaps by design. So the sampler reads the container's cgroup files
directly: cheap and constant. On this VM the cgroup is **v1**:

```text
$ stat -fc %T /sys/fs/cgroup     tmpfs
cpu:      /sys/fs/cgroup/cpuacct/docker/<container id>/cpuacct.usage          31585917683          (ns, cumulative)
memory:   /sys/fs/cgroup/memory/docker/<container id>/memory.usage_in_bytes   110960640
read cost (both files, 100 reads in a shell loop): 1.45 ms per read
```

GitHub-hosted `ubuntu-24.04` runners use cgroup **v2** (`cpu.stat` field `usage_usec`, `memory.current` under `/sys/fs/cgroup/system.slice/docker-<id>.scope/`): not probeable from this VM, so
the code detects the version at start (`stat -fc %T /sys/fs/cgroup` = `cgroup2fs` for v2) and **build-time probe must confirm** the v2 paths in the first CI run (the self-test job prints the detected kind). If neither layout is readable the source is `absent` and a slow
fallback `docker stats` every 5 s is used (not the 1 s loop), flagged `container.kind = "docker-stats"` in the output.

### 3.3 Process-tree discovery per record (probe item 3)

```text
Medusa     .harness/medusa-backend.pid = {"pid":27377,"startMark":"336415"}   one process, pgid = pid, 11 threads, 27 fds, RSS 407 MB, no children
Documenso  .harness/documenso-web.pid = {"pid":5894,"startMark":"460207"}     pgid 5894 holds 7 processes: npm, sh, npm, sh, dotenv, cross-env, node build/server/main.js (24 threads, RSS 1.26 GB); group RSS 1478 MB, 125 fds
Cal        results/harness/cal.pgid   = 30047  (P6 bridge)                     pgid 30047 holds 4 processes: yarn node, yarn cjs, next-server; RSS 1323 MB, 106 fds
Medusa 2nd .harness/medusa-backend-2.pid = {"pid":3341,"startMark":"32028","baseUrl":"http://127.0.0.1:9001"}    (harness main 51b7d1e; Task 2 plan)
```

Every app runs as a **process group whose id equals the recorded pid** (`detached: true`). So "all processes of the app" = every `/proc/<pid>/stat` whose group field (index 2 after the closing `)`) equals the recorded pid. Scanning `/proc`
(117 entries on the VM) took **3.2 ms**. CPU is `utime + stime` summed over the group (ticks, `CLK_TCK` 100); RSS is field 21 (pages × 4 KB); fds is the entry count of `/proc/<pid>/fd`.
`/proc` is readable by the same user on the VM, on the GitHub runner and on both clouds (all Linux). A pid file with a legacy bare integer is accepted too (the harness parser accepts both).

### 3.4 Sampler cost and the overhead margin (probe items 4)

Prototype sampler, 1 s interval, against the running Documenso stack: three read-only queries on one extra connection (`pool max 1`), the group scan, the cgroup read, a `GET /api/auth/csrf` probe and a log-offset grep:

```text
{"samples":20,"intervalMs":1000,"sampleCostMs":{"p50":8.9,"max":52},"samplerCpuCores":0.012,"groupMembers":7,"rssMB":1478,"fds":125,"dbConnections":10}
```

A sample costs 9 ms typically (52 ms worst); the sampler uses 0.012 cores (1.2 % of one core); it opens **one** extra database connection. `P6-X-LOAD-006` experiment (k6 2.3.0, stub from Task 3 §3.4: 25 ms service, 1500 ms stall every 10 s, 40 per second, 20 s, 80 pre-allocated VUs), 4 runs without and 4 with the sampler running beside it:

| Runs         | Requests completed | p95 (ms)               | `dropped_iterations` |
| ------------ | ------------------ | ---------------------- | -------------------- |
| without (×4) | 800, 800, 801, 801 | 1025, 1013, 1011, 1008 | 0, 0, 0, 0           |
| with (×4)    | 800, 800, 800, 800 | 1015, 1017, 1013, 1025 | 0, 0, 0, 0           |

The natural run-to-run spread without the sampler is ±0.1 % in requests and 1.7 % in p95 (17 ms of 1017). The margin recorded for the case is set at about five times the noise and far
below any real perturbation: **requests within ±2 %, p95 within ±10 %, `dropped_iterations` equal (0)** between the median of the runs with and the median of the runs without. A real perturbation of the generator
shows as dropped iterations first (Task 4 §3.2), which has no tolerance at all.

### 3.5 Clock alignment and the marker request (probe item 5)

k6's JSON output stamps each point with an ISO time with nanoseconds (`"time":"2026-10-24T00:47:13.382153795Z"`, Task 3 §3.4); the sampler uses `Date.now()` (epoch ms) on the same host: both read the system clock.
To **measure** the offset instead of assuming it, the runner hosts a tiny marker endpoint (`GET /marker` → `{"serverNowMs": <Date.now()>}` on `127.0.0.1`, random port) and k6 calls it in `setup()` and in `teardown()`:

```js
function offset(url) {
  const a = Date.now();
  const r = http.get(url, { tags: { name: "p6-marker" } });
  const b = Date.now();
  return r.json("serverNowMs") - (a + b) / 2;
}
export function setup() {
  start.add(offset(__ENV.MARKER_URL));
} // Trend("p6_clock_offset_start_ms")
export function teardown() {
  end.add(offset(__ENV.MARKER_URL));
} // Trend("p6_clock_offset_end_ms")
```

Both metrics appear in `--summary-export` (`metrics.p6_clock_offset_start_ms.avg`). Three runs: offset start/end in ms: `1.5 / 0.5`, `0 / 0`, `0.5 / 0.5`. Resolution is 1 ms (`Date.now()`); NTP-style half-round-trip correction. Skew limit: **one sampling interval (1000 ms)**, as the
roadmap says. The forced-skew self-test makes the marker endpoint add a fixed 2500 ms.

### 3.6 Product log lines (probe item 6)

| Product   | Log file (harness `.harness/`) | What is countable                                                                                                                                                                                                      | Probe                                                                                                     |
| --------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Medusa    | `medusa-backend.log`           | one JSON line per request: `{"level":"http",…,"status":200,"duration":146.421,…}` → count `status >= 500`, max `duration`; error-level lines (`error:` prefix)                                                         | 547 KB; 0 five-hundreds; 10 error-level lines                                                             |
| Cal       | `cal-web.log`                  | free text. The word `error` appears 6825 times, almost all **environment noise**: `ECONNREFUSED 127.0.0.1:1025` (3 lines per booking: no mail catcher, BACKLOG H-email) and `createMeeting failed … daily-video` (283) | a naive error grep would be dominated by two known classes: count them separately, alarm only on the rest |
| Documenso | `documenso-web.log`            | free text; `[JOBS]: Job <name> failed` lines (13 in the probe, all from the webhook-failure experiment) and stack traces; `[JOBS]: Triggering job …` per job                                                           | 2.4 MB; no `/sign/`, no `Bearer` hit today                                                                |

**Tokens.** The Documenso web log can carry signing and verification tokens (the repo's own scan for that file exists in `perf.yml`), so the sampler **never stores a log line**: it reads the bytes appended since the last offset and emits only **counts** per interval (`errorLines`, `http5xx`, `jobFailures`, and the two Cal noise classes), plus `maxServerMs` for Medusa. Counts cannot contain a token (tested, §7).

### 3.7 What the probe decided

- Sources, each optional and recorded as `present: false` when it cannot be read (an absent source is **absent in the output and the chart, never zero**):
  `pg` (3 queries, one connection), `proc` (group scan), `container` (cgroup v1/v2 files, fallback slow `docker stats`), `probe` (health-URL latency each interval), `log` (counts only), `markers` (clock offset).
- Interval 1000 ms; a gap is a missing sample longer than **2 intervals**; sample cost (9 ms, 52 ms worst) is far below the gap limit.
- Overhead margin of `P6-X-LOAD-006`: requests ±2 %, p95 ±10 %, drops equal.
- Cal process discovery: `.harness/cal-web.pid` if present, else `results/harness/cal.pgid` (the bridge), so the sampler works before and after Task 1 part B.

### 3.8 What stays unconfirmed ("build-time probe must confirm")

1. cgroup v2 paths on the GitHub runner (§3.2) and whether the runner user can read the container's cgroup files.
2. The behaviour with a database role that lacks `pg_read_all_stats` (§3.1).
3. The chart's size for a 30-minute run (Phase 4): this phase's runs are 10 to 60 seconds.
4. `docker inspect` availability to the runner user in CI (it is a sibling-container setup with the Docker socket; the harness itself runs `docker compose` there, so yes, but unprobed).

## 4. Depends on earlier plans

From Task 3: `LoadCase`, `LoadContext`, `Stage`, `StageResult`, `K6RunResult.pid`, `runLoad`, `defaultStages` (the `samplerStart`/`samplerStop` no-op slots), `runK6`, `parseK6Summary`, `src/load/paths.ts`, the stub
(`src/load/stub-server.ts`), `k6/lib/pure/*`, `k6/lib/config.js`, `k6/selftest/coordinated-omission.js`, the `load-selftest` job. From Task 4: `InvalidCode` (`telemetry_gap`, `clock_skew`), `judgeValidity` (its `telemetry` input),
`ValidityInput`, `ResourceSummary`, `parseProcStat`, `parseCpuLine`, `src/load/proc-stats.ts` (reused, not copied), `RunMeta`, `write-ci-job-summary.ts` LOAD table. From `main`: `src/oracles/pg.ts` (`createReadOnlyPool`, `selectRows`, `assertSelectOnly`),
`medusaDatabaseUrlFromEnv`, `calDatabaseUrlFromEnv` (`src/races/env.ts`), `documensoDatabaseUrlFromEnv` (`src/documenso/env.ts`), `scripts/evidence-token-scan.mjs`. Task 6 (reconciliation) is independent.

## 5. Build-time recheck

| #   | Check                      | Command                                                                                                                                                                                                                    | Expected                                                                             |
| --- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 1   | Base, Tasks 3 and 4 merged | `git log -1 --format=%h origin/main; git log --oneline origin/main \| grep -i "validity\|runner core"`                                                                                                                     | descendant of `5acd2a0`; both tasks' commits present                                 |
| 2   | Baseline                   | `export PATH="/usr/local/bin:$PATH"; npm run check`                                                                                                                                                                        | exit 0, `# tests` = B (599 once Tasks 1 to 4 are merged)                             |
| 3   | Task 3 and 4 interfaces    | `grep -n "samplerStart\|samplerStop" src/load/stages.ts; grep -n "telemetry_gap\|clock_skew" src/load/types.ts; grep -n "export function startResourceSampler" src/load/proc-stats.ts`                                     | hits in all three                                                                    |
| 4   | Process records exist      | with a stack up: `ls node_modules/qa-portfolio-harness/.harness/*.pid results/harness/*.pgid 2>/dev/null`                                                                                                                  | the record of the running product; Cal: `cal-web.pid` (after Task 1 B) or `cal.pgid` |
| 5   | cgroup kind                | `stat -fc %T /sys/fs/cgroup`                                                                                                                                                                                               | `cgroup2fs` on the runner, `tmpfs` (v1) on this VM; both handled                     |
| 6   | Container names            | `docker ps --format '{{.Names}}' \| grep qa-harness-.*-postgres`                                                                                                                                                           | `qa-harness-<product>-postgres-1`                                                    |
| 7   | DB role                    | `node /tmp/…/pgstats.ts` equivalent (build step 4 test) → `rolsuper` / `pg_read_all_stats`                                                                                                                                 | true for all three harness roles                                                     |
| 8   | Palette check              | `node <dataviz skill>/scripts/validate_palette.js "<the 4 chart colours>" --mode light` and `--mode dark` (the script ships with the Claude dataviz skill; if absent, run the contrast and CVD check by hand and state it) | all checks PASS (the build records the output in the PR)                             |

## 6. Design

### 6.1 File tree

```text
src/load/types.ts                       CHANGED  + LoadContext.handles, TelemetrySummary
src/load/telemetry/types.ts             NEW      Sample, SourceStatus, TelemetryFile (schema 1)
src/load/telemetry/pg-stats.ts          NEW      SQL, readPgSample(), deltas
src/load/telemetry/proc-group.ts        NEW      resolveAppProcess(), readGroupStats()  (uses Task 4's parseProcStat)
src/load/telemetry/cgroup-stats.ts      NEW      detectCgroup(), readContainerStats(), container discovery
src/load/telemetry/log-grep.ts          NEW      countFromChunk(), createLogCounter() (counts only)
src/load/telemetry/probe.ts             NEW      timed health probe
src/load/telemetry/markers.ts           NEW      marker server, offsetFromSummary(), judgeSkew()
src/load/telemetry/gaps.ts              NEW      findGaps()
src/load/telemetry/sampler.ts           NEW      startSampler(), the loop, output files
src/load/telemetry/stages.ts            NEW      samplerStart / samplerStop stages
src/load/chart/k6-points.ts             NEW      streaming aggregate of the k6 .json.gz
src/load/chart/render-chart.ts          NEW      renderChartHtml()
src/load/overhead.ts                    NEW      evaluateOverhead(), OVERHEAD_MARGINS
src/load/cases.ts                       CHANGED  + P6-X-LOAD-002 and P6-X-LOAD-006
k6/lib/markers.js                       NEW      k6 glue: clockOffset(url), setup/teardown helpers
k6/selftest/coordinated-omission.js     CHANGED  calls the marker helpers when MARKER_URL is set
k6/selftest/sampler-overhead.js         NEW      the P6-X-LOAD-006 script (open model against the stub)
tests/unit/telemetry-*.test.ts, render-chart.test.ts, k6-points.test.ts, load-overhead.test.ts      NEW
tsconfig.races.json                     CHANGED  (none if Task 3 already includes src/**)
.github/workflows/perf.yml              CHANGED  new job load-overhead runs the two cases; uploads telemetry and charts
README.md                               CHANGED  "How to read the chart"
```

### 6.2 Output format (file contract, schema 1) — `telemetry.json` in `<outDir>/` per k6 run

Epoch milliseconds, the clock k6's points carry (§3.5). One file per k6 run (`telemetry-<label>.json`); a CSV twin (`telemetry-<label>.csv`, one row per sample, `NaN`-free: absent values are empty cells).

```json
{
  "schema": 1,
  "caseId": "P6-X-LOAD-002",
  "runId": "…",
  "label": "normal",
  "product": "stub",
  "startedAtMs": 1792801000000,
  "stoppedAtMs": 1792801031000,
  "intervalMs": 1000,
  "sources": {
    "pg": { "present": false, "reason": "no database (stub)" },
    "proc": {
      "present": true,
      "recordPath": ".harness/documenso-web.pid",
      "pgid": 5894,
      "members": 7
    },
    "container": {
      "present": true,
      "kind": "cgroup-v1",
      "name": "qa-harness-documenso-postgres-1"
    },
    "probe": { "present": true, "url": "http://127.0.0.1:3001/api/auth/csrf" },
    "log": { "present": true, "file": "documenso-web.log" }
  },
  "samples": [
    {
      "t": 1792801000123,
      "pg": {
        "active": 1,
        "idleInTx": 0,
        "waiting": 0,
        "totalSessions": 10,
        "visibleSessions": 10,
        "waitingLocks": 0,
        "commits": 585874,
        "rollbacks": 672,
        "deadlocks": 0,
        "blksRead": 17716,
        "blksHit": 6825833
      },
      "proc": { "cpuTicks": 6217, "rssMb": 1478, "fds": 125, "members": 7 },
      "container": { "cpuNs": 31585917683, "memBytes": 110960640 },
      "probe": { "ms": 2.6, "status": 200 },
      "log": {
        "errorLines": 0,
        "http5xx": 0,
        "jobFailures": 0,
        "knownNoise": { "smtp": 0, "dailyVideo": 0 },
        "maxServerMs": 146.4
      },
      "sampleCostMs": 8.9
    }
  ],
  "gaps": [{ "fromMs": 1792801010000, "toMs": 1792801013100, "lengthMs": 3100 }],
  "markers": { "startOffsetMs": 0.5, "endOffsetMs": 0.5 }
}
```

Rules: a source that is not present has no key in `samples[i]` (the field is omitted, **never 0**); rates (CPU cores, commits per second) are derived by the chart and the validity step from consecutive cumulative values, never stored as rates;
`log` contains counts and one max duration only; no URL with a path beyond the health URL, no query text, no header, no token.

### 6.3 Source readers (exact signatures)

```ts
// src/load/telemetry/pg-stats.ts
export const PG_ACTIVITY_SQL = `SELECT count(*) FILTER (WHERE state = 'active')::int AS active,
  count(*) FILTER (WHERE state = 'idle in transaction')::int AS idle_in_tx,
  count(*) FILTER (WHERE state = 'active' AND wait_event_type IS NOT NULL AND wait_event_type <> 'Client')::int AS waiting,
  count(*)::int AS total, count(*) FILTER (WHERE state IS NOT NULL)::int AS visible
  FROM pg_stat_activity WHERE datname = current_database()`;
export const PG_LOCKS_SQL = `SELECT count(*) FILTER (WHERE NOT granted)::int AS waiting_locks FROM pg_locks`;
export const PG_DB_SQL = `SELECT xact_commit::bigint AS commits, xact_rollback::bigint AS rollbacks, deadlocks::bigint AS deadlocks,
  blks_read::bigint AS blks_read, blks_hit::bigint AS blks_hit FROM pg_stat_database WHERE datname = current_database()`;
/** One connection (pool max 1), three SELECTs through selectRows (assertSelectOnly). Strings from bigint columns are cast with Number(). */
export async function readPgSample(pool: pg.Pool): Promise<PgSample>;
```

`wait_event_type = 'Client'` (idle `ClientRead`) is excluded from `waiting`: the probe showed idle sessions report `Client/ClientRead`, which is not a wait on a lock or I/O.

```ts
// src/load/telemetry/proc-group.ts
export interface AppProcess {
  recordPath: string;
  pgid: number;
  label: string;
}
/** Reads the first existing record: product "medusa" -> .harness/medusa-backend.pid (and -2 when present); "documenso" -> .harness/documenso-web.pid;
 *  "cal" -> .harness/cal-web.pid, else results/harness/cal.pgid. JSON {"pid":N,...} or a bare integer. Returns undefined when none (source absent). */
export function resolveAppProcess(
  product: LoadProduct,
  opts?: { harnessDir?: string; resultsDir?: string; readFile?: (p: string) => string },
): AppProcess[] | undefined;
/** Sums utime+stime ticks, RSS (kB) and fds of every /proc/<pid> whose group id equals pgid. Uses parseProcStat() from Task 4. Skips unreadable entries. */
export function readGroupStats(
  pgid: number,
  io?: { listPids(): string[]; readFile(p: string): string; listFds(pid: string): number },
): GroupStats;
```

```ts
// src/load/telemetry/cgroup-stats.ts
export type CgroupKind = "cgroup-v1" | "cgroup-v2" | "docker-stats" | "absent";
export function detectCgroup(statfsType: string): "cgroup-v1" | "cgroup-v2"; // "cgroup2fs" -> v2, anything else -> v1
export function cgroupPaths(
  kind: "cgroup-v1" | "cgroup-v2",
  containerId: string,
): { cpu: string; mem: string; cpuFormat: "ns" | "usec-in-stat" };
export function parseContainerCpuNs(text: string, format: "ns" | "usec-in-stat"): number; // v1 "31585917683\n" ; v2 "usage_usec 31585917\n..." -> x1000
/** docker ps --filter name=qa-harness-<product>-postgres --format {{.Names}}; docker inspect -f {{.Id}}. Once, at start. */
export async function discoverContainer(
  product: LoadProduct,
  run?: (cmd: string, args: string[]) => Promise<string>,
): Promise<{ name: string; id: string } | undefined>;
export function readContainerStats(
  kind: CgroupKind,
  id: string,
  readFile?: (p: string) => string,
): { cpuNs: number; memBytes: number } | undefined;
```

```ts
// src/load/telemetry/log-grep.ts   counts only; never returns a line
export const MEDUSA_5XX = /"level":"http".*?"status":5\d\d/;
export const KNOWN_NOISE = {
  smtp: /ECONNREFUSED 127\.0\.0\.1:1025/,
  dailyVideo: /createMeeting failed/,
} as const;
export function countFromChunk(
  product: LoadProduct,
  chunk: string,
): {
  errorLines: number;
  http5xx: number;
  jobFailures: number;
  knownNoise: { smtp: number; dailyVideo: number };
  maxServerMs?: number;
};
/** Tracks a byte offset per file; a shrunk file resets the offset (rotation / truncation). Starts at the current size, so earlier lines never count. */
export function createLogCounter(
  file: string,
  product: LoadProduct,
  io?: LogIo,
): { poll(): LogCounts };
```

`errorLines` counts lines that match `/\berror\b/i` **and** no `KNOWN_NOISE` pattern; Medusa also parses `"duration":<ms>` of http lines for `maxServerMs`; Documenso `jobFailures` counts `[JOBS]: Job … failed`.

```ts
// src/load/telemetry/gaps.ts
export function findGaps(
  timesMs: number[],
  intervalMs: number,
  factor = 2,
): Array<{ fromMs: number; toMs: number; lengthMs: number }>; // pure; a gap is a difference > factor x interval
// src/load/telemetry/markers.ts
export async function startMarkerServer(opts?: {
  skewMs?: number;
}): Promise<{ url: string; close(): Promise<void> }>; // 127.0.0.1, random port; serverNowMs = Date.now() + skewMs
export function offsetsFromSummary(summary: unknown): { startMs?: number; endMs?: number }; // metrics.p6_clock_offset_*_ms.avg
export function judgeSkew(
  offsets: { startMs?: number; endMs?: number },
  limitMs: number,
): { skewMs?: number; ok: boolean }; // worst absolute offset; missing offsets -> ok with skewMs undefined and a reason "marker not measured"
```

```ts
// src/load/telemetry/sampler.ts
export interface SamplerOptions {
  product: LoadProduct;
  intervalMs?: number;
  pool?: pg.Pool;
  appProcess?: AppProcess[];
  container?: { id: string; kind: CgroupKind };
  probeUrl?: string;
  logFile?: string;
  injectGapMs?: number /* self-test: stall the loop once, after 3 samples */;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}
export interface Sampler {
  stop(): Promise<TelemetryFile>;
}
/** Samples every intervalMs (default 1000) until stop(): sources are read in parallel; a source that throws becomes absent for that sample only, with a note in sources[...].errors (count). */
export function startSampler(opts: SamplerOptions): Sampler;
```

The loop reads the clock before and after each sample, schedules the next at `startedAt + n × interval` (no drift), records `sampleCostMs`, and never lets a slow source delay the timestamp `t`
(taken first). `injectGapMs` exists only for `P6-X-LOAD-002`'s forced-gap run; it is rejected by the CLI outside the self-test case.

### 6.4 Pipeline wiring (Task 3's slots, Task 4's validity)

`src/load/types.ts`: `LoadContext.handles: Record<string, unknown>` (non-serialisable objects: samplers, pools, marker servers), and

```ts
export interface TelemetrySummary {
  gaps: string[];
  skewMs?: number;
  skewLimitMs: number;
  files: string[];
  sources: Record<string, boolean>;
}
```

- `samplerStart` (`src/load/telemetry/stages.ts`): per k6 run is too late (the sampler must be running when k6 starts), so it starts **one sampler per K6RunSpec in the `k6` stage** through a hook:
  the `k6` stage (Task 3, `runAllK6`) gets two optional callbacks, `beforeRun(spec)` and `afterRun(spec, result)`. `samplerStart` stores `handles.telemetry = { start(spec), stop(label) }` and the marker server; `runAllK6` calls them around each `runK6`.
  The marker URL goes to k6 as `MARKER_URL` (non-secret env). `samplerStop` finishes anything still open, writes the files, builds `TelemetrySummary` and returns it in `data`, which is exactly the input
  `judgeValidity` reads as `telemetry` (Task 4 §6.7 step 3): `gaps` lines `"<lengthMs> ms at +<offsetMs> ms"`, `skewMs`, `skewLimitMs = intervalMs`.
- Product wiring: `pool = createReadOnlyPool(<product db url>)` with `max: 1` (override the default `max: 5` through an option added to `createReadOnlyPool(connectionString, { max })`, backwards compatible), closed in `samplerStop`.
  `probeUrl` = the first URL of Task 4's `READINESS[product](env)` (health route). Log file = `<harnessDir>/<medusa-backend|cal-web|documenso-web>.log`. `product: "stub"` has no pool, no container, no log (those sources are `present: false` with a reason).
- A sampler start that fails for a **source** reason is not a run failure: that source is absent. A failure to write the output file is a `TEST BUG`.

### 6.5 The chart (`src/load/chart/*`, one self-contained HTML file, D8)

`aggregateK6Points(path: string): Promise<K6Bins>` streams `k6-<label>.json.gz` line by line (`zlib.createGunzip` + `readline`), keeps only `Point` lines of `http_reqs`, `http_req_duration`, `http_req_failed`, `dropped_iterations`, `iterations`, `vus`,
and returns per-second bins `{ t, reqs, failed, p95Ms, dropped, vus }` (p95 per bin from the durations seen in that second, nearest-rank) — never raw points, so a 30-minute run stays a few hundred KB. `renderChartHtml(input: ChartInput): string` is pure:
`ChartInput = { title: string; label: "functional load, not capacity"; plannedRate: number; k6: K6Bins; telemetry: TelemetryFile; validity: { verdict; reasons } }`.

Layout and rules (from the dataviz method; build step 8 checks them):

1. **Eight small panels in one column, one shared x axis (seconds from the start of k6)**, each with one y axis. Never a dual axis. Panels, in order: (1) arrival rate: planned line and completed requests per second; (2) latency p95 per second (labelled "info, not a result");
   (3) error rate and dropped iterations per second; (4) database sessions: active, waiting, idle in transaction; (5) lock waits and rollbacks per second; (6) application CPU (cores) and RSS (MB); (7) database container CPU (cores) and memory; (8) health-probe latency and log error counts.
   Panels whose source is absent show the text "source absent: <reason>" and no axis (never a flat zero line).
2. **Colours follow the entity, in a fixed order, not cycled**: the same four series hues in every panel (`--c1..--c4`), defined as CSS custom properties with a `:root` light set, a dark set under `@media (prefers-color-scheme: dark)`, and `[data-theme]` overrides; text always uses the text tokens, never the series colour; the page background is explicit. The palette is validated with the dataviz `validate_palette.js` for both modes (§5 check 8).
3. **Thin marks** (2 px lines, no markers except on hover), recessive grid, labelled axes with units, the legend present for any panel with two or more series, direct labels for at most four. A verdict banner on top: `VALID` or `INVALID: <reason codes>`, the case id, the run id, the label "functional load, not capacity", and the environment line from `run-meta.json`.
4. **Hover layer**: one shared crosshair across the panels with a tooltip listing every value at that time; about 60 lines of inline JavaScript, no library, keyboard accessible (arrow keys move the crosshair).
5. **Table view**: a `<details>` section holds the same per-second data as a table (the accessibility and print route).
6. **Self-contained**: no `<link>`, no `<script src>`, no `@import`, no `url(http…)`, no web font, no image request; data is embedded as `<script type="application/json" id="p6-data">`. Test: the output contains no `http://` or `https://` except inside the JSON data's health URL text node and the footer link text (the test asserts there is no attribute value beginning with `http`).
7. **Size**: for a 60 s fixture under 120 KB; for a 30 min fixture under 600 KB (tested), by binning to seconds and rounding numbers to 3 significant digits.
8. **No secrets**: the HTML is built from `TelemetryFile` (counts) and `K6Bins` only; run through `scanTree` like every artefact.

Files written per run: `chart.html` (one per case run: all k6 runs of the case as tabs? No: one `chart-<label>.html` per k6 run, simpler and each self-contained).

### 6.6 `P6-X-LOAD-002` self-test case (`src/load/cases.ts`)

Product `stub` (stall stub of Task 3, 25 ms, stall 1500 ms every 10 s); three runs of 30 s at 40 per second, `MARKER_URL` provided, sampler interval 1000 ms:

| Label        | What differs                       | `expectValidity` | `expectCodes`   | Extra checks                                                                                                                                                    |
| ------------ | ---------------------------------- | ---------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `normal`     | nothing                            | `VALID`          | —               | `gaps` is empty; at least 28 samples; `markers` present and `offset` at most 50 ms; `chart-normal.html` exists, has the 8 panels, pg panels say "source absent" |
| `forcedGap`  | `injectGapMs: 3500` after sample 3 | `INVALID`        | `telemetry_gap` | exactly one gap of at least 3500 ms; all other samples fine                                                                                                     |
| `forcedSkew` | marker server `skewMs: 2500`       | `INVALID`        | `clock_skew`    | measured offset between 2400 and 2600 ms                                                                                                                        |

The case outcome is `PASS` when every expectation holds. `npm run load:telemetry-selftest`. In CI the stub case has no database, so the pg, container and log sources are absent and the chart shows that (roadmap CI change).

### 6.7 `P6-X-LOAD-006` sampler overhead (`src/load/overhead.ts`, `k6/selftest/sampler-overhead.js`)

```ts
export const OVERHEAD_MARGINS = { requestsPct: 2, p95Pct: 10, droppedMax: 0 } as const; // probe noise: 0.1 % and 1.7 %
export interface OverheadRun {
  requests: number;
  p95Ms: number;
  dropped: number;
}
/** Medians of the "with" and "without" groups (at least 3 runs each); returns one line per broken margin. */
export function evaluateOverhead(
  without: OverheadRun[],
  withSampler: OverheadRun[],
  margins = OVERHEAD_MARGINS,
): string[];
```

Case `P6-X-LOAD-006` (stub, 20 s per run, 40 per second, 80 pre-allocated VUs, `k6/selftest/sampler-overhead.js` = the Task 3 open scenario with a fixed config): the runner executes 4 runs **without** the sampler and 4 **with** it (the `with` runs use the **real** sampler including the pg source against the harness database **only when one is up**; otherwise the stub-only sources, and the case says so in `verdict.json`: `sampler.sources`). `evaluateOverhead` compares medians. A broken margin is a `TEST BUG` finding (the sampler perturbs the generator), not INVALID. Runtime: 8 × (20 s + 5 s) = 3.4 minutes. It runs in its own product-free job `load-overhead` on every event (§10).

## 7. Oracles and assertions

| Claim                                             | Check                                                                                                                                                          | Evidence class    |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| No gap longer than 2 intervals in a normal run    | `normal`: `gaps` empty                                                                                                                                         | live in CI (stub) |
| A forced gap marks the run INVALID                | `forcedGap`: exactly one gap ≥ 3500 ms, validity `telemetry_gap`                                                                                               | live in CI        |
| A forced skew marks the run INVALID               | `forcedSkew`: offset 2400 to 2600 ms, validity `clock_skew`                                                                                                    | live in CI        |
| Absent sources are absent, not zero               | unit: sample objects omit keys of absent sources; chart shows "source absent"; CSV cells empty                                                                 | unit              |
| The sampler is read-only                          | unit: every SQL passes `assertSelectOnly`; the pool is created through `createReadOnlyPool`                                                                    | unit              |
| No log text, URL path or token reaches the output | unit: `countFromChunk` returns numbers only for a chunk containing `/sign/AbCdEf…`, `Bearer abc`, an email; the telemetry JSON of that chunk passes `findHits` | unit              |
| Sampler overhead inside the margin                | `P6-X-LOAD-006` medians within ±2 % requests, ±10 % p95, drops equal                                                                                           | live in CI        |
| The chart is self-contained                       | unit: no external reference in the HTML                                                                                                                        | unit              |

**PRODUCT BUG vs TEST BUG.** Nothing here asserts product behaviour. A forced gap or skew that is not detected, a normal run with a gap, or an overhead breach is a **TEST BUG** of the sampler (root-caused from the telemetry file and the k6 summaries). INVALID reasons stay generator/telemetry reasons. No `test.fail()`, no skip, margins are never widened to pass.

## 8. Data isolation, cleanup, leak check

- No product data. Output per run in `results/load/<caseId>/<runId>/`. The sampler holds one DB connection, one marker server and one timer; `samplerStop` closes all three in a `finally` (asserted: the runner process exits without `--force-exit`, no listener remains on the marker port).
- The sampler reads other sessions' metadata only; it writes nothing to any database (read-only transaction option plus `assertSelectOnly`). It does not read `query`.
- Leak check (inherits Task 3): no stub listener, no k6 process, plus here no marker listener and no open pool (`pool.totalCount` is 0 after `end()`).

## 9. Token scan

New artefacts: `telemetry-<label>.json`, `telemetry-<label>.csv`, `chart-<label>.html`. They are built from counts only (§6.2, §6.5). The `tokenScan` stage (`scanTree` over the run directory) and the job step
`node scripts/evidence-token-scan.mjs results/load` run before the upload; the chart HTML is scanned as text. Unit test: a fixture `TelemetryFile` and the rendered HTML pass `findHits`. The k6 `.json.gz` is scanned decompressed (Task 3 §9). Health URLs in the output are the fixed loopback health routes (no id, no token).

## 10. CI

Both Task 5 self-tests run in a **new product-free job `load-overhead`** on every event; `load-selftest` (Tasks 3 and 4) is not touched by this task and keeps its 20-minute timeout (no raise; Task 3 §9 plans it for the whole phase). `load-overhead` has the same set-up steps as `load-selftest` (checkout, setup-node, `npm ci`, install k6) and, in order:

```yaml
- name: Telemetry self-test (P6-X-LOAD-002)
  timeout-minutes: 3
  run: |
    set -euo pipefail
    status=0
    npm run load:telemetry-selftest || status=$?
    if [ "$status" -eq 3 ]; then echo "::warning::LOAD run INVALID (see the job summary)"; status=0; fi
    exit "$status"
- name: Sampler overhead (P6-X-LOAD-006)
  timeout-minutes: 5
  run: npm run load:overhead-selftest
- name: Print cgroup kind and runner identity (one-time probe)
  timeout-minutes: 1
  run: |
    stat -fc 'cgroup fs: %T' /sys/fs/cgroup
    env | grep -E '^(ImageOS|ImageVersion)=' || true
```

followed by the token scan (cap 1) and the `load-overhead` artefact upload (charts and telemetry files are in `results/load/` after the token scan). Job timeout **25** (a new job; no existing timeout is raised).

**Budget** (one convention for every Phase 3 plan, Task 3 §9: Phase 2 closeout §2.7 worst case + cold start + pull at cap minus measured + each new step; "estimates" use measured/estimated durations, "at caps" use `timeout-minutes`; the set-up steps of a new job, the one-line probe step, the token scan and the upload are counted at their measured durations; at least 10 minutes under the job timeout; no timeout raised). No existing job changes.

| Job                   | Set-up, install, scan, upload (estimate; install cap) | Telemetry self-test (estimate / cap)           | Overhead self-test (estimate / cap)                | Probe and chart (estimate) | Worst, estimates (min) | Worst, at caps (min) | Timeout | Margin (caps) |
| --------------------- | ----------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------- | -------------------------- | ---------------------- | -------------------- | ------- | ------------- |
| `load-overhead` (new) | 0.7 / install cap 2.0                                 | 2.0 (3 runs × (30 s + 10 s allowance)) / **3** | 3.3 (8 runs × (20 s + 5 s) + 2 min set-up) / **5** | 0.3                        | 6.3                    | 11.0                 | **25**  | **14.0**      |

Each new step and its 80 % stop rule: telemetry self-test cap **3** (was 8; estimate 2.0, stop rule 2.4); overhead self-test cap **5** (was 8; estimate 3.3, stop rule 4.0); probe step cap 1 (estimate 0.1, stop rule 0.8); install cap 2 (estimate 0.04, stop rule 1.6); token scan cap 1 (estimate 0.1, stop rule 0.8). `load-selftest` stays at 4.4 min (estimates) and 9.9 min (at caps) against 20 (Task 3 §9). The 25-minute timeout of the _new_ job gives 14.0 minutes of margin at caps (a 20-minute timeout would leave 9.0, under the rule).

## 11. Environment changes

None for Cursor Cloud or Claude Code cloud: the sampler needs only `/proc`, `/sys/fs/cgroup`, `docker inspect`/`docker ps` (already required by the harness) and Node 22.23. No new tool, host or setting.

## 12. Build order (one commit per step; `npm run check` after each)

Run from the repo root with `export PATH="/usr/local/bin:$PATH"`. Branch: `git switch -c feat/<build date>-p6-load-telemetry origin/main` (after Tasks 3 and 4 are merged). Counts relative to B (B = count on main when the build starts; 599 today).

| Step | Commit subject                                                              | `git add` paths                                                                                                                                                                  | `npm run check` expected           |
| ---- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| 0    | `docs(plans): bring the phase 3 task 5 plan onto the build branch`          | `docs/plans/2026-10-24-p6-phase3-task5-load-telemetry.md`                                                                                                                        | exit 0, B                          |
| 1    | `feat(load): detect gaps and judge clock skew`                              | `src/load/telemetry/gaps.ts src/load/telemetry/markers.ts src/load/telemetry/types.ts tests/unit/telemetry-gaps.test.ts tests/unit/telemetry-markers.test.ts`                    | exit 0, **B + 11**                 |
| 2    | `feat(load): read database sessions, locks and counters without writing`    | `src/load/telemetry/pg-stats.ts src/oracles/pg.ts tests/unit/telemetry-pg-stats.test.ts tests/unit/pg-oracle.test.ts`                                                            | exit 0, **B + 18**                 |
| 3    | `feat(load): read the application process group and the database container` | `src/load/telemetry/proc-group.ts src/load/telemetry/cgroup-stats.ts tests/unit/telemetry-proc-group.test.ts tests/unit/telemetry-cgroup.test.ts`                                | exit 0, **B + 32**                 |
| 4    | `feat(load): count error lines from product logs without keeping any text`  | `src/load/telemetry/log-grep.ts src/load/telemetry/probe.ts tests/unit/telemetry-log-grep.test.ts`                                                                               | exit 0, **B + 39**                 |
| 5    | `feat(load): add the sampler loop and its output files`                     | `src/load/telemetry/sampler.ts tests/unit/telemetry-sampler.test.ts`                                                                                                             | exit 0, **B + 44**                 |
| 6    | `feat(load): render the correlated chart as one self-contained html file`   | `src/load/chart/k6-points.ts src/load/chart/render-chart.ts tests/unit/k6-points.test.ts tests/unit/render-chart.test.ts`                                                        | exit 0, **B + 52**                 |
| 7    | `feat(load): wire the sampler and the clock markers into the runner`        | `src/load/telemetry/stages.ts src/load/types.ts src/load/stages.ts src/load/runner.ts k6/lib/markers.js k6/selftest/coordinated-omission.js tests/unit/telemetry-stages.test.ts` | exit 0, **B + 54**                 |
| 8    | `feat(load): add the telemetry and sampler-overhead self-tests`             | `src/load/overhead.ts src/load/cases.ts k6/selftest/sampler-overhead.js package.json tests/unit/load-overhead.test.ts`                                                           | exit 0, **B + 56**                 |
| 9    | `ci(perf): run the telemetry and overhead self-tests`                       | `.github/workflows/perf.yml`                                                                                                                                                     | exit 0 (actionlint silent), B + 56 |
| 10   | `docs: explain how to read the chart`                                       | `README.md`                                                                                                                                                                      | exit 0, B + 56                     |

New unit tests, by name (the 56):

- `telemetry-gaps` (4): no gap; one gap; a difference of exactly 2 × interval is not a gap; unsorted input is sorted first.
- `telemetry-markers` (7): `offsetsFromSummary` reads both; a missing metric; `judgeSkew` within the limit; beyond it; missing offsets give "not measured"; the server answers `Date.now() + skewMs`; the server closes its port.
- `telemetry-pg-stats` (6): every SQL passes `assertSelectOnly`; mapping of a real row (strings cast to numbers); `visible` below `total` is reported; a pool failure gives an absent sample; the three queries share one connection; `wait_event_type Client` is not counted as waiting. Plus `pg-oracle` (1): `createReadOnlyPool(url, { max })`.
- `telemetry-proc-group` (7): JSON record; bare-integer record; missing record gives undefined; Cal prefers `cal-web.pid` over `cal.pgid`; group sum over a fake `/proc`; an unreadable entry is skipped; a command name with spaces and parentheses.
- `telemetry-cgroup` (7): detect v1 and v2; paths for each; parse v1 nanoseconds; parse v2 `usage_usec`; discovery parses `docker ps` output; unreadable files give undefined; the slow `docker stats` fallback is flagged.
- `telemetry-log-grep` (7): Medusa 5xx and max duration; Cal noise classes excluded from `errorLines`; Documenso job failure; the offset starts at the current size; truncation resets it; the result holds numbers only for a chunk containing a token; a chunk split across two polls is counted once.
- `telemetry-sampler` (5): schedule without drift; gap injection; an absent source is omitted; stop writes the JSON and CSV; a failing source is absent for that sample only.
- `k6-points` (4): bins per second; nearest-rank p95; other metrics ignored; gzip stream. `render-chart` (4): eight panels; absent-panel text; no external reference; size caps for 60 s and 30 min fixtures.
- `telemetry-stages` (2): the summary shape feeds `judgeValidity`; handles are closed. `load-overhead` (2): within margins; each margin broken alone.
  Sum: 4 + 7 + 7 + 7 + 7 + 7 + 5 + 8 + 2 + 2 = **56**. Per-step cumulative: step 1 +11 → B+11; step 2 +7 → B+18; step 3 +14 → B+32; step 4 +7 → B+39; step 5 +5 → B+44; step 6 +8 → B+52; step 7 +2 → B+54; step 8 +2 → B+56.

After step 10: `git push -u origin feat/<build date>-p6-load-telemetry`, `gh pr create` (rule A3), read CI once: `load-selftest` and `load-overhead` green; one `workflow_dispatch` on `main` after merge. Merge only when the owner says "merge".

## 13. Risks, proposed extras, open questions

| ID  | Risk                                              | Mitigation                                                                                                  |
| --- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| R1  | The roles cannot see other sessions               | all three harness roles are superusers (§3.1); `visibleSessions` is recorded so a degraded view is explicit |
| R2  | The sampler perturbs the measurement              | 9 ms per sample, 0.012 cores, one connection (§3.4); `P6-X-LOAD-006` guards it on every event               |
| R3  | `docker stats` latency causes gaps                | not used in the loop (2 s per call); cgroup files read in 1.5 ms (§3.2)                                     |
| R4  | cgroup v2 paths differ on the runner              | detection plus the one-time probe step; the container source degrades to absent, never to zero              |
| R5  | Chart size                                        | per-second bins and rounding; size tests for 60 s and 30 min                                                |
| R6  | A log line with a token reaches the output        | the sampler returns counts only (tested); the scan runs on every artefact                                   |
| R7  | The Cal log noise (SMTP, video) hides real errors | known classes counted separately; only the remainder is `errorLines`                                        |

**Contradictions with the roadmap.**

| #   | Roadmap says                                                      | Probe shows                                              | Effect                                                                      |
| --- | ----------------------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------- |
| C1  | Sampler uses `docker stats` for the DB container                  | `docker stats --no-stream` takes about 2 s per call      | cgroup files in the loop; `docker stats` only as a slow fallback            |
| C2  | Cal process group from `results/harness/cal.pgid`                 | after Task 1 part B the record is `.harness/cal-web.pid` | resolver prefers the harness record, falls back to the bridge file          |
| C3  | "Sampler self-test: the stub self-test produces a telemetry file" | the stub has no database, container or log               | those sources are absent in the output and the chart (as the roadmap wants) |

**Proposed extras (out of scope until accepted; new IDs).**

- `P6-X-LOAD-013`: add a second marker pair at mid-run (drift check for soaks, Phase 4).
- `P6-X-LOAD-014`: a `pg_stat_statements` panel once the harness H1 exists (Phase 5, D2); not before.

**Owner decisions (all four questions closed 2026-10-24).**

- **Q1 (closed: split into `load-overhead`, both self-tests move there, `load-selftest` keeps 20).** Budget layout of §10.
- **Q2 (closed: accept).** Accept `docker stats` replaced by cgroup reads (contradiction C1)?
- **Q3 (closed: one chart per run).** Chart: one HTML file per k6 run (proposed) or one per case with tabs?
- **Q4 (closed: yes, labelled "info, not a result").** Is the p95 panel acceptable in the chart ("info, not a result") given D9 and `P6-RULE-003`? Proposed: yes, labelled; the job summary shows no latency.

## 14. Done when (roadmap, made measurable)

- [ ] Unit tests green: `npm run check` exit 0 with **B + 56** (655 on today's chain).
- [ ] CI on the PR and once on `main`: `P6-X-LOAD-002` `normal` has no gap longer than 2 intervals and `chart-normal.html` exists; `forcedGap` is INVALID with `telemetry_gap`; `forcedSkew` is INVALID with `clock_skew`; the case outcome is `PASS`.
- [ ] `P6-X-LOAD-006`: medians with and without the sampler within ±2 % requests, ±10 % p95, equal drops (job `load-overhead`).
- [ ] Telemetry, chart and `run-meta.json` uploaded after a clean token scan; the chart opens offline (no external reference, tested).
- [ ] The palette validator output for light and dark is in the PR.
- [ ] `npm run check` green; no existing job timeout raised; `load-selftest` (20) and `load-overhead` (25, new) at least 10 minutes under their timeouts at caps.

## 15. Rule 20 self-check

- (a) Done-when in §14; gaps: cgroup v2 on the runner and the DB-role degradation (§3.8), read from the first CI run and a build-time probe.
- (b) Existing names grepped at `5acd2a0`: `createReadOnlyPool`, `selectRows`, `assertSelectOnly` (`src/oracles/pg.ts`), `medusaDatabaseUrlFromEnv`, `calDatabaseUrlFromEnv` (`src/races/env.ts`), `documensoDatabaseUrlFromEnv` (`src/documenso/env.ts`),
  `scripts/evidence-token-scan.mjs` (`findHits`, `scanTree`), `.harness/*.pid` names, `results/harness/cal.pgid` (`scripts/harness.mjs`). Task 3/4 names are checked at build time (§5 check 3). Everything else is NEW with a skeleton.
- (c) CI time: §10; `load-overhead` 6.3 (estimates) and 11.0 (at caps) against 25; `load-selftest` unchanged.
- (d) Skeletons: §6. Steps with `git add` paths, subjects and expected output: §12.
- (e) The owner's answers to Q1 to Q4 are recorded in §1 and §13.
