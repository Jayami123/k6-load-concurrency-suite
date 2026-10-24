# P6 Phase 3 Task 4: run validity and metadata (`P6-X-LOAD-004`, `P6-RULE-003`, `P6-RULE-005`) (plan only)

This is the plan a weaker model builds from. It changes nothing in the repo. Structure follows
[docs/reference/p1-plan-example-medusa.md](../reference/p1-plan-example-medusa.md). Scope source: roadmap
[2026-10-22-p6-phase3-roadmap.md](2026-10-22-p6-phase3-roadmap.md) (on `origin/plan/2026-10-22-p6-phase3`), "Task 4", D1, D5, D6, D9, D10.
**It builds on the interfaces of the Task 3 plan exactly**:
[2026-10-24-p6-phase3-task3-load-foundation.md](2026-10-24-p6-phase3-task3-load-foundation.md) §6.2 (types, stage pipeline, `evaluateVerdict`),
§6.4 (`runLoad`, `runK6`, `parseK6Summary`, `verdict.json`), §6.3 (`k6/lib`). Every name used below that is not defined here is defined there.
If the merged Task 3 differs, the build stops at §5 check 3 and reports the difference.

## 1. Header

- **Task.** Phase 3 Task 4. Cases: `P6-X-LOAD-004` (P0), `P6-RULE-003`, `P6-RULE-005`.
- **Plan branch.** `plan/2026-10-24-p6-phase3-plans` (no PR, never deleted).
- **Build branch (pattern).** `feat/<build date>-p6-load-validity`.
- **Base.** `origin/main` = `5acd2a0`, plus Task 3 merged (this task cannot start before it).
- **Harness pin assumed.** Any (`v0.2.12` today; Task 1 may bump it). k6 `2.3.0` (Task 3).
- **Environment change.** None (§11).
- **Unit tests.** B = count on main when the build starts (today's chain: 557 after Tasks 1 to 3). This plan adds **+44** (§12); expected after the build B + 44 (**601** today). Chain in merge order: 471 -> T1 481 -> T2 503 -> T3 557 -> T4 601 -> T5 657 -> T6 690 -> T7 708 -> T8 728 -> T9 752 -> T10 786.
- **Owner decisions taken (2026-10-24, recorded, not open).** Q1 INVALID is a warning with a green job. Q2 accept the `unknown` fallback. Q3 strict `dropped_iterations > 0`. All closed in §13.
- **Stop for owner review.** Yes (rule 10): a CI workflow change and a shared runner change.

## 2. What it proves

- **A measurement is evidence only if the measuring tool was not the bottleneck and the environment is stated.** Every LOAD run gets a verdict
  of VALID or INVALID (with reasons) before any pass/fail, and a `run-meta.json` that says where and with what it ran.
- **Finance and healthcare.** The same rule as an audited latency figure for a trading gateway or an EHR availability report: a number without
  its test rig and a check that the rig kept up is not admissible. INVALID is not pass and not fail, and it can never hide a correctness failure.

## 3. Live probe evidence

Probe date 2026-10-24 (UTC), cloud VM (Node v22.23.3, 4 vCPU, 16 GB, Ubuntu 24.04.5), k6 2.3.0. Timings are **VM, proof only**. Products were
started only with `npm run up:<product>` (and stopped with `down`). Throwaway files are in `/tmp` and are not committed.

### 3.1 How to read the generator's own CPU (roadmap probe item 1)

k6 has no CPU metric. `/proc/<pid>/stat` has `utime` and `stime` (fields 14 and 15 of the file, i.e. indexes 11 and 12 after the closing `)` of the
command name; unit = `CLK_TCK`, `getconf CLK_TCK` = 100). A Node sampler (`/tmp/s/probe/co/cpu.mjs`) spawned k6 against the Task 3 stub and read it every second:

| Rate (requests/s, stub on the same box) | k6 cores used per 1 s sample  | `dropped_iterations` | `vus.max` | p95 (ms) |
| --------------------------------------- | ----------------------------- | -------------------- | --------- | -------- |
| 100                                     | 0.09 0.07 0.09 0.08 0.09 0.08 | 0                    | 20        | 26.2     |
| 1000                                    | 0.37 0.34 0.37 0.34 0.34 0.35 | 0                    | 60        | 26.1     |
| 4000                                    | 0.71 0.76 0.75 0.78 0.79 0.71 | 0                    | 200       | 26.4     |
| 9000                                    | 1.27 1.25 1.28 1.41 1.41 1.35 | **299**              | 414       | 30.6     |

(cores = Δticks ÷ 100 ÷ Δseconds; the parse must cut after the last `)` because the command name may contain spaces, e.g. `next-server (v16.2.3)`.) The sampler is two
file reads a second; it is not measurable next to k6. The functional rates of this phase (1 to 2 iterations per second, 9 requests each) put k6 at well under 0.05 cores.
Whole-runner CPU comes from the first line of `/proc/stat` (`cpu user nice system idle iowait irq softirq steal …`): busy = 1 − (Δidle + Δiowait) ÷ Δtotal.

### 3.2 The summary fields the guard reads (roadmap probe item 2)

On k6 2.3.0 (`--summary-export`), identical on 1.3.0:

```text
dropped_iterations   {"count":170,"rate":…}          # the key is ABSENT when nothing was dropped -> read as 0
vus_max              {"min":80,"max":80,"value":80}  # VUs initialised (>= preAllocatedVUs); not the peak in use
vus                  {"min":1,"max":57,"value":…}    # VUs running at once: the peak in use is vus.max
checks               {"passes":405,"fails":0,"value":1,"thresholds":{"rate==1":false}}   # true = crossed; exit code 99
```

Generator-saturation signals, measured with the Task 3 stub (service 25 ms, stall 1500 ms every 10 s, 40 per second, 30 s) and with real products:

| Run                                        | `dropped_iterations` | `vus_max` (initialised) / configured max | What it is                                             |
| ------------------------------------------ | -------------------- | ---------------------------------------- | ------------------------------------------------------ |
| stub open, 80 pre-allocated (Little's law) | 0                    | below 80                                 | normal                                                 |
| stub open, 5 pre-allocated, 5 max          | **170** of 1200      | 5 / 5                                    | VU supply binding: saturated on purpose                |
| stub open, 20 pre-allocated, 200 max       | 31                   | grew to 51                               | pool had to grow mid-run: drops while allocating       |
| Medusa journey 1 per second, 30 s          | **0**                | 20 / 60 (pre-allocated 20)               | normal (iteration median 1.5 s, p95 1.9 s)             |
| Medusa journey 2 per second, 20 s          | **4** of 40          | 24 / 60                                  | system past its knee: iteration median 13 s            |
| Medusa journey 3 per second, 20 s          | **16** of 60         | 36 / 60                                  | far past the knee: iteration median 21 s, http p95 6 s |
| Cal journey 2 per second, 20 s             | 0                    | 10 / 30 (pre-allocated 10)               | normal (iteration p95 221 ms)                          |
| Cal journey 10 per second, 15 s            | **7** of 150         | 17 / 60                                  | past the knee: iteration median 1.3 s                  |

So `dropped_iterations > 0` separates normal runs (0) from every saturated run (≥ 4) in all eight rows. The second signal is the peak number of VUs running at once (`vus.max`)
reaching the configured `maxVUs`. The table above recorded `vus_max` (VUs initialised), which reached the configured maximum only in the deliberately under-sized stub run;
the peak in use (`vus.max`) was not recorded in the product runs: **build-time probe must confirm** that it stays below `maxVUs` in normal runs (the first CI runs print it).

### 3.3 Runner image and environment (roadmap probe item 3)

GitHub Actions job log of run 40037355173 (`gh api repos/…/actions/jobs/<id>/logs`, "Set up job" block):

```text
Runner Image Provisioner / Hosted Compute Agent / Version: 20261012.601
Operating System: Ubuntu 24.04.5 LTS
Runner Image: Image: ubuntu-24.04   Version: 20261012.334.1
```

and the job record: `labels: ["ubuntu-24.04"]`, `runner_group_name: "GitHub Actions"`. GitHub documents the environment variables `ImageOS` (e.g. `ubuntu24`) and
`ImageVersion` (e.g. `20261012.334.1`) on hosted runners; they are not visible in the log, so **build-time probe must confirm** by printing `env | grep -E '^(ImageOS|ImageVersion|RUNNER_)'`
in the `load-selftest` job (the run-meta builder reads them and falls back to `unknown`; a run with `unknown` is not publishable, §6.2). Also available in Actions:
`GITHUB_EVENT_NAME`, `GITHUB_RUN_ID`, `GITHUB_RUN_ATTEMPT`, `GITHUB_SHA`, `GITHUB_REF_NAME`, `GITHUB_REPOSITORY`, `GITHUB_SERVER_URL`, `RUNNER_OS`, `RUNNER_ARCH`.
`nproc` and memory: the standard public-repo `ubuntu-24.04` runner has 4 vCPU and 16 GB (GitHub's runner documentation); read at run time with `os.availableParallelism()` and `os.totalmem()`
(this VM: `nproc` 4, `free -m` total 16091 MB), and **build-time probe must confirm** the CI values in the `load-selftest` job log.
Product SHAs are already job env in `perf.yml` (`MEDUSA_REF`, `CAL_REF`, `DOCUMENSO_REF`, lines 25 to 30) and `scripts/bootstrap.sh`; the harness tag is in `package.json`.

### 3.4 Readiness preflight URLs (D10, roadmap Task 4 scope)

The routes the retired smokes hit, answered live (single request, VM):

```text
Medusa    GET /health                      200   (curl, 25 ms warm)
Cal       GET /pro/30min                   200   0.07 s warm, 0.42 s first        /api/csrf 200 0.004 s
Documenso GET /signin, GET /api/auth/csrf  200 0.027 s, 200 0.003 s
```

The preflight also reads the race histograms of the same job (`results/races/*.json`): a case that ended with a leak violation leaves data that would pollute the audit.
Histogram `invariantViolations` lines carry `TEST BUG: leak …` / `PRODUCT BUG: live reservations remain …` text (`src/medusa/oracle.ts` `leakCheck`, `src/cal/oracle.ts` `leakCheck`).
Run 40037355173's `race-histograms-medusa` artefact: 11 histograms, every `verdict: "pass"`, `invariantViolations` empty (probe via `gh run download`).

### 3.5 Documenso routes

Documenso (fork `f4105e47`, harness `up` 3 min 8 s cold on the VM, Node 24 chosen by `scripts/harness.mjs`): `GET /signin` answers 200 in 0.027 s and `GET /api/auth/csrf` answers 200 in 0.003 s;
Inbucket `GET :9003/` answers 200. Those are the two routes of the retired smoke. **Build-time probe must confirm** the codes on the day of the build.

### 3.6 What the probe decided

- Rules, in the order the verdict reports them (limits in §6.1, each with its probe value):
  1. `dropped_iterations` > 0 → INVALID (`dropped_iterations`). Probe: normal 0, saturated ≥ 4.
  2. peak `vus.max` ≥ configured `maxVUs` → INVALID (`vu_exhausted`). Probe: initialised VUs reached the maximum only in the deliberately under-sized run (peak in use: build-time probe must confirm).
  3. average k6 CPU > 50 % of `nproc` cores → INVALID (`k6_cpu`). Probe: 0.75 cores at 4000 requests/s is 19 % of 4 cores; 1.3 cores is 33 %; the rule fires only when the generator really competes with the product (never at functional rates).
  4. average whole-runner CPU busy > 85 % → INVALID (`runner_cpu`): the generator, the product and the database share one machine (D5).
  5. minimum `MemAvailable` < 10 % of total → INVALID (`runner_memory`). Probe: 13.7 GB of 16 GB available during the Medusa run.
  6. telemetry gap or clock skew → INVALID (`telemetry_gap`, `clock_skew`): inputs from Task 5, wired here as a reason list.
- INVALID reasons are **only** the six above: generator, runner or telemetry reasons. A correctness result (k6 thresholds crossed, reconciliation violations, a 5xx) is a FAIL and is never turned into INVALID.
- `INVALID` ends in exit code 3 (Task 3 `EXIT_CODES`); the workflow turns it into a warning (§9), not a red job. Q1.

### 3.7 What stays unconfirmed ("build-time probe must confirm")

1. `ImageOS`, `ImageVersion` and the CI `nproc`/memory (§3.3).
2. The runner-wide CPU busy percentage of a normal functional run (the 85 % limit is a guard against saturation, the normal level is not measured on a shared runner yet): the first `load-selftest` and Task 7 CI runs print it.
3. Documenso readiness codes (§3.5).

## 4. Depends on earlier plans

From Task 3 (names exactly as in its plan): `LoadCase`, `LoadProfile`, `K6RunSpec`, `K6RunResult` (with `pid`), `LoadContext`, `Stage`, `StageSet`, `StageResult`, `StageName`,
`Outcome`, `EXIT_CODES`, `runLoad`, `evaluateVerdict`, `runK6` (`src/load/k6-process.ts`), `parseK6Summary` and `K6Summary` (`src/load/summary.ts`), `defaultStages`
(`src/load/stages.ts`), `loadRepoEnv` (`src/load/env.ts`), `runDir` and `newRunId` (`src/load/paths.ts`), the stub (`src/load/stub-server.ts`), `preAllocatedVUs`, `maxVUs`
(`k6/lib/pure/sizing.js`), `openModelScenario` (`k6/lib/pure/options.js`), `k6/selftest/coordinated-omission.js`, the `load-selftest` job. From `main`: `scripts/evidence-token-scan.mjs`,
`scripts/write-ci-job-summary.ts`, `src/ci/race-table.ts` (style), `src/races/prefix.ts`, race histogram files (`src/races/histogram.ts`). Nothing from Tasks 5 and 6 at build time:
the telemetry and reconciliation inputs of the validity step are optional fields (§6.1) that those tasks fill.

## 5. Build-time recheck

| #   | Check                  | Command                                                                                                                                                                         | Expected                                                                        |
| --- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 1   | Base and Task 3 merged | `git log -1 --format=%h origin/main; git log --oneline origin/main \| grep -i "load foundation\|runner core"`                                                                   | a descendant of `5acd2a0`; the Task 3 commits are there                         |
| 2   | Baseline               | `export PATH="/usr/local/bin:$PATH"; npm run check`                                                                                                                             | exit 0, `# tests` = B (557 once Tasks 1 to 3 are merged)                        |
| 3   | Task 3 interfaces      | `grep -n "export async function runLoad\|export function evaluateVerdict\|export const EXIT_CODES\|export interface K6RunResult\|export function parseK6Summary" src/load/*.ts` | five hits; `grep -n "pid:" src/load/types.ts` one hit                           |
| 4   | k6 pin                 | `k6 version; cat .k6-version`                                                                                                                                                   | `k6 v2.3.0` and `2.3.0`                                                         |
| 5   | Thresholds still true  | rerun `node /tmp/…/cpu.mjs`-style sample (build step 1 reproduces §3.1 with the new sampler on the stub)                                                                        | normal run 0 dropped; the under-sized stub run drops ≥ 5 % of planned           |
| 6   | Runner image names     | after the first CI run: `grep -E "ImageOS\|ImageVersion" <load-selftest log>`                                                                                                   | both printed; if not, the builder's `unknown` fallback is used and Q2 is raised |
| 7   | Health routes          | `curl -s -o /dev/null -w '%{http_code}' $BASE/health` (Medusa), `/pro/30min` (Cal), `/signin` and `/api/auth/csrf` (Documenso) with the product up                              | 200 each                                                                        |

## 6. Design

### 6.1 File tree

```text
src/load/types.ts                  CHANGED  + RunMeta, ValidityVerdict, InvalidReason, K6RunSpec.expectValidity and K6RunSpec.maxVUs, LoadContext.meta, K6RunResult.validity
src/load/validity.ts               NEW      judgeValidity(), VALIDITY_LIMITS, InvalidReason codes
src/load/proc-stats.ts             NEW      parseProcStat(), parseCpuLine(), startResourceSampler()
src/load/run-meta.ts               NEW      buildRunMeta(), isPublishable(), validateRunMeta()
src/load/readiness.ts              NEW      READINESS, checkReadiness(), raceLeakFindings()
src/load/medians.ts                NEW      selectPublishable(), medianOf() (RULE-005)
src/load/published.ts              NEW      formatPublishedNumber() (RULE-003)
src/load/stages.ts                 CHANGED  preflight = readiness; k6 stage starts the resource sampler; reconcile slot runs judgeValidity
src/load/runner.ts                 CHANGED  writes run-meta.json first and again at the end; evaluateVerdict adds per-run expectValidity
src/load/cases.ts                  CHANGED  + case P6-X-LOAD-004 (stub: one normal run, one deliberately saturated run)
src/ci/load-table.ts               NEW      formatLoadTable(): job-summary table from verdict.json files
scripts/write-ci-job-summary.ts    CHANGED  appends the LOAD table when results/load exists
scripts/load-medians.ts            NEW      CLI: medians of publishable runs from downloaded artefact folders
tests/unit/load-validity.test.ts, load-proc-stats.test.ts, load-run-meta.test.ts, load-readiness.test.ts,
  load-medians.test.ts, load-published.test.ts, load-table.test.ts, readme-rules.test.ts     NEW
tsconfig.races.json                CHANGED  include scripts/load-medians.ts
package.json                       CHANGED  scripts: load:validity-selftest, load:medians
.github/workflows/perf.yml         CHANGED  load-selftest runs the validity self-test too; INVALID handling
README.md                          CHANGED  "Valid and invalid runs"; rules RULE-003/005 text
```

### 6.2 Types added to `src/load/types.ts` (additive; nothing of Task 3 is renamed)

```ts
export type InvalidCode =
  | "dropped_iterations"
  | "vu_exhausted"
  | "k6_cpu"
  | "runner_cpu"
  | "runner_memory"
  | "telemetry_gap"
  | "clock_skew";
export interface InvalidReason {
  code: InvalidCode;
  detail: string;
} // detail: counts only, no URL, token or id
export interface ValidityVerdict {
  verdict: "VALID" | "INVALID";
  reasons: InvalidReason[];
}

/** Per-run resource summary written by the sampler of src/load/proc-stats.ts. */
export interface ResourceSummary {
  samples: number;
  intervalMs: number;
  k6CoresAvg: number;
  k6CoresMax: number;
  runnerBusyPctAvg: number;
  runnerBusyPctMax: number;
  memAvailablePctMin: number;
}

export interface RunMeta {
  schema: 1;
  caseId: string;
  runId: string;
  profile: LoadProfileName;
  label: "functional load, not capacity";
  rate: number;
  durationSec: number;
  plannedIterations: number;
  startedAt: string;
  finishedAt?: string; // ISO; finishedAt is set by the final write
  environment: {
    kind: "github-actions" | "local";
    event?: string;
    workflow?: string;
    ref?: string;
    sha?: string; // GITHUB_EVENT_NAME, GITHUB_WORKFLOW, GITHUB_REF_NAME, GITHUB_SHA
    runUrl?: string;
    attempt?: number; // built from GITHUB_SERVER_URL / GITHUB_REPOSITORY / GITHUB_RUN_ID / GITHUB_RUN_ATTEMPT
    runnerImage: string;
    imageVersion: string; // ImageOS / ImageVersion, "unknown" when absent
    runnerOs: string;
    runnerArch: string; // RUNNER_OS / RUNNER_ARCH, else os.platform()/os.arch()
    nproc: number;
    memTotalMb: number;
  };
  software: {
    k6: string;
    harness: string;
    node: string;
    products: Partial<Record<"medusa" | "cal" | "documenso" | "twenty", string>>; // 40-hex SHAs
  };
  limits: Record<string, number>; // VALIDITY_LIMITS as used
}
```

and, on existing types: `K6RunSpec.maxVUs?: number` (the `maxVUs` the run's scenario was built with; set by the case from `preAllocatedVUs`/the profile sizing, or `5` for the saturated self-test; absent for a closed-model run, in which case the `vu_exhausted` rule is skipped), `K6RunSpec.expectValidity?: "VALID" | "INVALID"` (default `"VALID"`), `K6RunResult.validity?: ValidityVerdict`, `K6RunResult.resources?: ResourceSummary`, `K6RunResult.telemetry?: TelemetrySummary` (defined and filled by Task 5, one summary per run, never shared between runs),
`LoadContext.meta: RunMeta`. `StageResult` and `Stage` are unchanged.

### 6.3 `src/load/validity.ts` (NEW)

```ts
import type { InvalidReason, ResourceSummary, ValidityVerdict } from "./types.ts";
import type { K6Summary } from "./summary.ts";

/** Each limit has its probe value in the Task 4 plan §3.2 and §3.6. Changing one needs new probe data and an owner decision. */
export const VALIDITY_LIMITS = {
  droppedIterationsMax: 0, // normal 0, saturated >= 4
  peakVusFractionOfMax: 1.0, // peak vus.max >= maxVUs
  k6CoresMaxFractionOfNproc: 0.5, // 0.75 cores at 4000 requests/s = 19 % of 4
  runnerBusyPctMax: 85,
  memAvailablePctMin: 10,
} as const;

export interface ValidityInput {
  summary: K6Summary; // parseK6Summary(), now also exposes peakVus (vus.max)
  maxVUs: number;
  nproc: number;
  resources?: ResourceSummary; // absent when the sampler could not read /proc: no CPU or memory reason is invented
  telemetry?: { gaps: string[]; skewMs?: number; skewLimitMs?: number }; // filled by Task 5; absent = no reason
}

/** Pure. Reasons come out in a fixed order: dropped, vus, k6 cpu, runner cpu, memory, telemetry gap, clock skew. */
export function judgeValidity(input: ValidityInput, limits = VALIDITY_LIMITS): ValidityVerdict {
  const reasons: InvalidReason[] = [];
  if (input.summary.dropped > limits.droppedIterationsMax) {
    reasons.push({
      code: "dropped_iterations",
      detail: `${input.summary.dropped} iterations dropped (limit ${limits.droppedIterationsMax})`,
    });
  }
  if (input.summary.peakVus >= input.maxVUs * limits.peakVusFractionOfMax) {
    reasons.push({
      code: "vu_exhausted",
      detail: `peak ${input.summary.peakVus} VUs of ${input.maxVUs} allowed`,
    });
  }
  const r = input.resources;
  if (r) {
    if (r.k6CoresAvg > input.nproc * limits.k6CoresMaxFractionOfNproc)
      reasons.push({
        code: "k6_cpu",
        detail: `k6 used ${r.k6CoresAvg.toFixed(2)} cores on average of ${input.nproc}`,
      });
    if (r.runnerBusyPctAvg > limits.runnerBusyPctMax)
      reasons.push({
        code: "runner_cpu",
        detail: `runner ${r.runnerBusyPctAvg.toFixed(0)} % busy on average`,
      });
    if (r.memAvailablePctMin < limits.memAvailablePctMin)
      reasons.push({
        code: "runner_memory",
        detail: `memory available fell to ${r.memAvailablePctMin.toFixed(0)} %`,
      });
  }
  const t = input.telemetry;
  if (t && t.gaps.length > 0)
    reasons.push({
      code: "telemetry_gap",
      detail: `${t.gaps.length} gap(s) longer than 2 intervals`,
    });
  if (
    t &&
    t.skewMs !== undefined &&
    t.skewLimitMs !== undefined &&
    Math.abs(t.skewMs) > t.skewLimitMs
  ) {
    reasons.push({
      code: "clock_skew",
      detail: `clock skew ${Math.round(t.skewMs)} ms (limit ${t.skewLimitMs})`,
    });
  }
  return { verdict: reasons.length === 0 ? "VALID" : "INVALID", reasons };
}
```

`parseK6Summary` (Task 3) gets one more field, `peakVus: number` (= `metrics.vus.max`); its tests gain one case (Task 3 owns the function: this task adds the field and one test, counted in §12).

### 6.4 `src/load/proc-stats.ts` (NEW): CPU and memory of the generator and the runner

```ts
/** After the closing ")" of the command name: [0]=state [1]=ppid [2]=pgrp ... [11]=utime [12]=stime (clock ticks). */
export function parseProcStat(text: string): { ticks: number; pgrp: number } {
  const f = text.slice(text.lastIndexOf(")") + 2).split(" ");
  return { ticks: Number(f[11]) + Number(f[12]), pgrp: Number(f[2]) };
}
/** First line of /proc/stat: "cpu  user nice system idle iowait irq softirq steal guest guest_nice". busy excludes idle and iowait. */
export function parseCpuLine(line: string): { total: number; idle: number } {
  const n = line.trim().split(/\s+/).slice(1).map(Number);
  const [user = 0, nice = 0, system = 0, idle = 0, iowait = 0, irq = 0, softirq = 0, steal = 0] = n;
  return {
    total: user + nice + system + idle + iowait + irq + softirq + steal,
    idle: idle + iowait,
  };
}
export function memAvailablePct(meminfo: string): number {
  // MemAvailable / MemTotal * 100 from /proc/meminfo
  const kb = (key: string) => Number(new RegExp(`^${key}:\\s+(\\d+) kB`, "m").exec(meminfo)?.[1]);
  return (kb("MemAvailable") / kb("MemTotal")) * 100;
}
export interface ResourceSampler {
  stop(): ResourceSummary;
}
/** Reads /proc every intervalMs (default 1000) for the k6 pid and the whole runner. Returns summaries on stop().
 *  A read that fails (no /proc, pid gone) skips that sample; with zero samples the summary is undefined and judgeValidity invents no reason. */
export function startResourceSampler(
  pid: number,
  opts?: { intervalMs?: number; clockTicksPerSec?: number; readFile?: (p: string) => string },
): ResourceSampler;
```

`clockTicksPerSec` defaults to 100 (`getconf CLK_TCK`; Linux x86-64 and arm64; the build step 1 confirms with `getconf CLK_TCK`). Windows and macOS are not P6 targets: on them
`/proc` is missing, the sampler yields no samples and the run's `resources` is undefined (documented in README).

### 6.5 `src/load/run-meta.ts` (NEW): P6-RULE-003

```ts
export function buildRunMeta(input: {
  caseDef: LoadCase;
  profileName: LoadProfileName;
  profile: LoadProfile;
  runId: string;
  startedAt: Date;
  env: NodeJS.ProcessEnv;
  k6Version: string;
  os?: { nproc: number; memTotalMb: number; platform: string; arch: string; node: string };
  readHarnessPin?: () => string; // default: parses package.json "qa-portfolio-harness" "#vX.Y.Z"
}): RunMeta;
/** RULE-003: only a run from GitHub Actions on main (push, schedule or workflow_dispatch), with a known image and the product SHA(s) of its product, may be published as a number. */
export function isPublishable(meta: RunMeta): { ok: boolean; reasons: string[] };
/** Throws on a missing field or a secret-shaped value (reuses PATTERNS from scripts/evidence-token-scan.mjs). */
export function validateRunMeta(value: unknown): RunMeta;
```

Product SHAs: `env.MEDUSA_REF`, `env.CAL_REF`, `env.DOCUMENSO_REF` (set in `perf.yml` top-level env), else `git -C $PRODUCTS_ROOT/<folder> rev-parse HEAD` (folders `medusa-dtc-starter`, `cal`, `documenso`).
Only the case's own product is required; others are recorded when known. No secret field exists in the type; `validateRunMeta` also scans the serialized JSON with `findHits` (token scan) and throws on a hit.

### 6.6 `src/load/readiness.ts` (NEW): the readiness preflight that replaces the health smokes (D10)

```ts
export const READINESS = {
  medusa: (env: NodeJS.ProcessEnv) => [
    `${(env.MEDUSA_BASE_URL ?? "http://127.0.0.1:9000").replace(/\/$/, "")}/health`,
  ],
  cal: (env) => [`${(env.CAL_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "")}/pro/30min`],
  documenso: (env) => [
    `${base(env.DOCUMENSO_BASE_URL, "http://127.0.0.1:3001")}/signin`,
    `${base(env.DOCUMENSO_BASE_URL, "http://127.0.0.1:3001")}/api/auth/csrf`,
  ],
} as const;
/** HTTP 200 on every URL within timeoutMs; returns the failing URLs with status or error name (no body). */
export async function checkReadiness(
  urls: string[],
  opts?: { fetchFn?: typeof fetch; timeoutMs?: number },
): Promise<{ ok: boolean; failures: string[] }>;
/** Lines of invariantViolations in results/races/*.json that mention a leak ("leak", "live reservations remain"). Empty dir or none = []. */
export function raceLeakFindings(racesDir: string): string[];
```

The default `preflight` stage (replaces Task 3's no-op): for product `stub` it is ok; for the others `checkReadiness(READINESS[product](env))` and `raceLeakFindings("results/races")`.
Any failure returns `{ ok: false, kind: "ENV", reasons: [...] }`, which stops the run before k6 (Task 3 rule 1): a failed preflight is an ENV/TEST BUG with evidence, never a LOAD result.

### 6.7 Wiring into the pipeline (`stages.ts`, `runner.ts`)

1. `runLoad` builds `ctx.meta = buildRunMeta(...)` before `setup`, writes `<outDir>/run-meta.json`, and rewrites it at the end with `finishedAt`.
2. The `k6` stage: for each run, after `runK6` returns the `pid`, `startResourceSampler(pid)` is started before the process is awaited and stopped after;
   `K6RunResult.resources` holds the summary. (`runK6` is changed to take an `onStart(pid)` callback so the sampler starts in the first 100 ms; the callback is the only change to Task 3's `runK6`.)
3. The `reconcile` slot (Task 6 fills the product audit later) first runs the validity step: for every `K6RunResult` **whose summary file exists and parses** (`try { parseK6Summary(read(summaryPath)) } catch { skip }`: a k6 run that ended before writing `summaryPath` gets no `validity`, and the read error is never thrown out of the reconcile slot), `judgeValidity({ summary: parseK6Summary(read(summaryPath)), maxVUs: spec.maxVUs /* typed field, never read back from env */, nproc, resources, telemetry: result.telemetry /* this run's own summary, attached by Task 5's afterRun; undefined until Task 5 merges, which skips the gap and skew rules */ })`,
   stores `validity` on the result and pushes its reasons (as `code: detail` lines) into `ctx.invalid` **only for runs whose `expectValidity` is not `"INVALID"`**. Task 6's reconciliation runs after it in the same slot and does not touch validity.
4. `evaluateVerdict` (Task 3) is extended, not replaced. **A missing `validity` (no readable summary) can never override a FAIL or ENV outcome**: the exit-code check (`FAIL` for a mismatch), a setup failure (`ENV`) and any correctness finding are evaluated first, and a result without `validity` contributes no `INVALID` reason: for a run with `expectValidity: "INVALID"` the verdict requires `validity.verdict === "INVALID"` **and** every expected code present (`expectCodes`), else `TEST BUG` ("the deliberately saturated run was not saturated"); for a run with `expectValidity` absent or `"VALID"` it requires `VALID`, else the case outcome is `INVALID` (not FAIL) unless a correctness finding exists, in which case `FAIL` wins (Task 3 precedence unchanged).
5. `verdict.json` gains `validity` (the case-level `{verdict, reasons[]}` over the non-expected runs), `k6[].validity`, `k6[].resources`, and `runMeta: "run-meta.json"`.

### 6.8 `P6-X-LOAD-004` self-test case (`src/load/cases.ts`)

Product `stub`. Two runs on one stub (service 25 ms, stall 1500 ms every 10 s), 30 s each, 40 per second:

| Label       | `env`                                                                                          | `expectValidity` | `expectCodes`                        |
| ----------- | ---------------------------------------------------------------------------------------------- | ---------------- | ------------------------------------ |
| `normal`    | `MODEL=open` (pre-allocated from `preAllocatedVUs({rate:40,maxLatencyMs:1600})` = 80, max 120) | `VALID`          | —                                    |
| `saturated` | `MODEL=open PRE=5 MAXVUS=5` (and `spec.maxVUs = 5`, the typed value the judge reads)           | `INVALID`        | `dropped_iterations`, `vu_exhausted` |

Probe values: `normal` 0 dropped, `vus.max` below 80; `saturated` 170 dropped, `vus.max` 5 of 5 (§3.2). `package.json`: `"load:validity-selftest": "node scripts/load/run-load.ts --case P6-X-LOAD-004"`. The case outcome is `PASS` when both expectations hold.

### 6.9 `P6-RULE-005`: invalid runs are not results (`src/load/medians.ts`, `scripts/load-medians.ts`)

```ts
export interface LoadRunRecord {
  verdict: VerdictFile;
  meta: RunMeta;
} // read from verdict.json and run-meta.json of one artefact folder
/** A run counts when: meta is publishable (isPublishable), outcome is PASS, validity is VALID. Everything else is excluded with its reasons. */
export function selectPublishable(runs: LoadRunRecord[]): {
  used: LoadRunRecord[];
  excluded: Array<{ runId: string; why: string[] }>;
};
export function medianOf(values: number[]): number; // even n: mean of the two middle values; n = 0 throws
export function summarizeMedian(
  runs: LoadRunRecord[],
  pick: (r: LoadRunRecord) => number | undefined,
  minRuns = 3,
): {
  median?: number;
  n: number;
  excludedCount: number;
  excluded: Array<{ runId: string; why: string[] }>;
  insufficient: boolean;
};
```

`scripts/load-medians.ts <folder> [<folder> ...] --metric requests|dropped|iterations`: prints a markdown table: median, n, excluded count with reasons, and the link to each used run's `runUrl` and
its `run-meta.json` path; exits 2 when `insufficient` (fewer than 3 valid runs). The README tooling of Task 11 uses it. The job summary (`load-table.ts`, §6.10) shows the excluded count and reasons of the current run.

### 6.10 `P6-RULE-003`: every published number links to its `run-meta.json` (`src/load/published.ts`, README test)

```ts
/** "<value> <unit> (functional load, not capacity; n=3 valid runs; environment: ubuntu-24.04 20261012.334.1, 4 vCPU; run-meta: <relative path or run URL>)". Throws if meta is not publishable. */
export function formatPublishedNumber(
  value: number,
  unit: string,
  meta: RunMeta,
  metaLink: string,
): string;
```

`tests/unit/readme-rules.test.ts` guards the text rules on `README.md` (two tests): every occurrence of the word "capacity" is part of the phrase "not capacity", and every line of a "Phase 3 results"
table (when the section exists) contains a link whose text or target includes `run-meta`. Today README has no "capacity" and no Phase 3 results section (probe: `grep -n -i capacity README.md` → nothing), so both pass now and bind Task 11.

### 6.11 `src/ci/load-table.ts` and the job summary

```ts
/** One row per verdict.json: case, profile, outcome, validity, planned/completed iterations, dropped, peak VUs, k6 cores avg, invalid reasons (codes). No latency is shown. */
export function formatLoadTable(files: Array<{ path: string; verdict: unknown }>): string;
```

`scripts/write-ci-job-summary.ts` appends `formatLoadTable(...)` when `results/load/*/*/verdict.json` exist, with a footer "Valid runs only count towards medians (P6-RULE-005). Label: functional load, not capacity." p95 is not shown, so no number in the summary can be quoted as a result.

## 7. Oracles and assertions

| Claim                                             | Check                                                                                                               | Evidence class     |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------ |
| A saturated run is INVALID with the right reasons | `P6-X-LOAD-004` `saturated`: `judgeValidity` returns `dropped_iterations` and `vu_exhausted`                        | live in CI (stub)  |
| A normal run is VALID                             | `P6-X-LOAD-004` `normal`: no reasons                                                                                | live in CI (stub)  |
| INVALID never hides a failure                     | unit: `evaluateVerdict` with a PRODUCT BUG finding and a non-empty `invalid` returns `FAIL`                         | unit               |
| Only generator/runner/telemetry reasons exist     | unit: the `InvalidCode` union is the six codes of §3.6; `judgeValidity` never emits a code from a correctness input | unit (type + test) |
| `run-meta.json` is complete and secret-free       | unit: `validateRunMeta` accepts a built meta, rejects a missing field, rejects a value that matches a token pattern | unit               |
| Local runs are never publishable                  | unit: `isPublishable` false for `kind: "local"`, for a feature-branch ref, for `imageVersion: "unknown"`            | unit               |
| Medians exclude INVALID                           | unit: `selectPublishable` on a fixture of 5 runs (3 valid, 1 INVALID, 1 local) uses 3, lists 2 with reasons         | unit               |

**PRODUCT BUG vs TEST BUG.** This task has no product assertion. A deliberately saturated run that is not INVALID, or a normal run that is INVALID, is a **TEST BUG** (limits or
stub), root-caused with the summaries' numbers and the resource summary; a limit is never widened to make a run pass (it changes only with new probe data and an owner decision).
No `test.fail()`, no skip.

## 8. Data isolation, cleanup, leak check

- No product data (stub only). Run directory per run (`results/load/<caseId>/<runId>/`), fresh each time; `run-meta.json` and `verdict.json` live there.
- Leak check (inherits Task 3): no stub listener and no k6 process left after `cleanup`. The resource sampler is stopped in a `finally` so no timer survives (asserted: the Node process exits without `--force-exit`).
- The readiness preflight's leak read is read-only (it parses histogram files, no DB).

## 9. Token scan

**Token scan.** New artefacts: `run-meta.json` and the validity fields of `verdict.json`. `validateRunMeta` scans the serialized text with `findHits`; the `tokenScan` stage and the job step
(`node scripts/evidence-token-scan.mjs results/load`) scan the folder as in Task 3. `run-meta.json` carries only ids, versions, counts and a public run URL (`https://github.com/<owner>/<repo>/actions/runs/<id>`).

## 10. CI

**`perf.yml` changes (exact).** In the Task 3 job `load-selftest`, after the existing self-test step, add:

```yaml
- name: Validity self-test (P6-X-LOAD-004)
  timeout-minutes: 3
  run: |
    set -euo pipefail
    status=0
    npm run load:validity-selftest || status=$?
    if [ "$status" -eq 3 ]; then
      echo "::warning::LOAD run INVALID (see the job summary); it is excluded from medians (P6-RULE-005)"
      status=0
    fi
    exit "$status"
- name: Job summary (LOAD table)
  if: ${{ !cancelled() }}
  timeout-minutes: 2
  run: node scripts/write-ci-job-summary.ts
- name: Print runner identity (one-time probe)
  timeout-minutes: 1
  run: env | grep -E '^(ImageOS|ImageVersion|RUNNER_OS|RUNNER_ARCH)=' ; nproc; free -m | sed -n 2p
```

The `INVALID → warning` wrapper is the pattern Tasks 7 to 10 copy for their LOAD steps (Q1). The self-test case itself exits 0 (both expectations hold), so the wrapper is for the pattern, not for this step.

**Budget** (one convention for every Phase 3 plan, Task 3 §9: Phase 2 closeout §2.7 worst case + cold start + pull at cap minus measured + each new step; "estimates" use measured/estimated durations, "at caps" use `timeout-minutes`; set-up steps of a new job at their measured durations; at least 10 minutes under the job timeout; no timeout raised). This task adds to the new job `load-selftest` only; it adds no step to any existing job:

| Job             | Task 3 part (estimates / at caps) | Added by this task (estimate / cap)                                                                                           | Worst, estimates (min) | Worst, at caps (min) | Timeout | Margin (caps) |
| --------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------- | -------------------- | ------- | ------------- |
| `load-selftest` | 2.8 / 6.6                         | validity self-test 1.3 / **3** (2 runs × (30 s + 10 s allowance) = 1.3); summary and runner identity 0.3 / 0.3 (set-up steps) | 4.4                    | 9.9                  | 20      | 10.1          |

Each new step and its 80 % stop rule: validity self-test cap **3** (was 8; estimate 1.3, stop rule 2.4); job summary cap 2 (estimate 0.1, stop rule 1.6); runner identity cap 1 (estimate 0.1, stop rule 0.8). Task 3 §9 holds the whole-phase `load-selftest` row; Task 5's two self-tests do not run here (they run in `load-overhead`). No other job changes. Trial counts: not applicable (no races). PR and `main` run the same self-test.

## 11. Environment changes

None for Cursor Cloud or Claude Code cloud (no tool, host or setting). `/proc` access is available in both clouds and on the GitHub runners (the probe VM is a Claude Code cloud VM; the sampler reads only `/proc/<own child pid>` and the global `/proc/stat`, `/proc/meminfo`).

## 12. Build order (one commit per step; `npm run check` after each)

Run from the repo root with `export PATH="/usr/local/bin:$PATH"`. Branch: `git switch -c feat/<build date>-p6-load-validity origin/main` (after Task 3 is merged). Counts relative to B (B = count on main when the build starts; 557 today after Tasks 1 to 3).

| Step | Commit subject                                                               | `git add` paths                                                                                                                                                                                                 | `npm run check` expected           |
| ---- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| 0    | `docs(plans): bring the phase 3 task 4 plan onto the build branch`           | `docs/plans/2026-10-24-p6-phase3-task4-load-validity.md`                                                                                                                                                        | exit 0, B                          |
| 1    | `feat(load): read cpu and memory of the generator and the runner from /proc` | `src/load/proc-stats.ts tests/unit/load-proc-stats.test.ts`                                                                                                                                                     | exit 0, **B + 7**                  |
| 2    | `feat(load): judge generator saturation and give runs a validity verdict`    | `src/load/validity.ts src/load/summary.ts src/load/types.ts tests/unit/load-validity.test.ts tests/unit/load-summary.test.ts`                                                                                   | exit 0, **B + 20**                 |
| 3    | `feat(load): write run-meta.json for every run`                              | `src/load/run-meta.ts tests/unit/load-run-meta.test.ts`                                                                                                                                                         | exit 0, **B + 28**                 |
| 4    | `feat(load): add the readiness preflight that replaces the health smokes`    | `src/load/readiness.ts tests/unit/load-readiness.test.ts`                                                                                                                                                       | exit 0, **B + 34**                 |
| 5    | `feat(load): exclude invalid runs from medians and label published numbers`  | `src/load/medians.ts src/load/published.ts scripts/load-medians.ts tests/unit/load-medians.test.ts tests/unit/load-published.test.ts tests/unit/readme-rules.test.ts tsconfig.races.json package.json`          | exit 0, **B + 41**                 |
| 6    | `feat(load): wire validity, run metadata and readiness into the runner`      | `src/load/stages.ts src/load/runner.ts src/load/k6-process.ts src/load/cases.ts src/ci/load-table.ts scripts/write-ci-job-summary.ts tests/unit/load-table.test.ts tests/unit/load-runner.test.ts package.json` | exit 0, **B + 44**                 |
| 7    | `ci(perf): run the validity self-test and print the runner identity`         | `.github/workflows/perf.yml`                                                                                                                                                                                    | exit 0 (actionlint silent), B + 44 |
| 8    | `docs: explain valid and invalid runs`                                       | `README.md`                                                                                                                                                                                                     | exit 0, B + 44                     |

New unit tests, by name (the 44): `load-proc-stats` (7: stat line with a command name containing spaces and parentheses; ticks sum; `/proc/stat` busy percentage from two lines; idle plus iowait excluded;
`MemAvailable` percent; sampler averages from a fake `readFile`; sampler with unreadable `/proc` returns no samples); `load-validity` (12: normal run VALID; dropped > 0; peak VUs equal to max; peak below max; k6 CPU over half of nproc;
runner busy over 85; memory under 10; telemetry gap; clock skew within and beyond the limit; absent `resources` gives no CPU or memory reason; reasons come in the fixed order); `load-summary` (+1: `peakVus` from `vus.max`);
`load-run-meta` (8: GitHub Actions environment built from env; local environment; missing `ImageVersion` gives `unknown`; product SHAs from `*_REF` and from git fallback; harness tag parsed from `package.json`;
`isPublishable` true for main + push + known image; false for local, for a pull request, for a feature ref; `validateRunMeta` rejects a token-shaped value); `load-readiness` (6: 200 ok; non-200 fails with the status; timeout fails with the error name;
Documenso needs both URLs; `raceLeakFindings` finds a leak line; ignores a clean histogram directory); `load-medians` (4: median odd and even; `selectPublishable` splits a fixture; `summarizeMedian` insufficient under 3; excluded reasons listed);
`load-published` (1: format contains the label, the environment and the link; throws for a non-publishable meta); `readme-rules` (2); `load-table` (1: INVALID row shows the reason codes and no latency);
`load-runner` (+2: expectValidity INVALID satisfied gives PASS; unsatisfied gives TEST BUG; a run whose k6 summary file is missing or unparseable is skipped by `judgeValidity` and the outcome stays the one `evaluateVerdict` would report without validity, FAIL for a non-zero exit and ENV for a setup failure). Count: 7+12+1+8+6+4+1+2+1+2 = **44**.
Per-step cumulative counts: step 1 +7 → B+7; step 2 +13 (validity 12, summary 1) → B+20; step 3 +8 → B+28; step 4 +6 → B+34; step 5 +7 (medians 4, published 1, readme 2) → B+41; step 6 +3 (table 1, runner 2) → B+44.

After step 8: `git push -u origin feat/<build date>-p6-load-validity`, `gh pr create` (rule A3), read CI once: `load-selftest` green with the LOAD table in the summary; then one `workflow_dispatch` on `main` after merge
(roadmap done-when "once on `main`"). Merge only when the owner says "merge".

## 13. Risks, proposed extras, open questions

| ID  | Risk                                                                             | Mitigation                                                                                                 |
| --- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| R1  | Shared-runner noise flips a verdict                                              | limits have large margins at functional rates (§3.2: 0 versus ≥ 4 drops); a noisy run is INVALID, not FAIL |
| R2  | The sampler perturbs k6                                                          | two small file reads per second; Task 5's `P6-X-LOAD-006` measures sampler overhead on the same stub       |
| R3  | INVALID used to hide a failure                                                   | only the six codes exist; a correctness finding wins (`evaluateVerdict`, unit test)                        |
| R4  | `ImageOS`/`ImageVersion` absent                                                  | `unknown` fallback makes the run unpublishable and the first CI run prints the environment (§3.7)          |
| R5  | `vus.max` equals `maxVUs` on a legitimate run                                    | `maxVUs` is 1.5 × the Little's-law pre-allocation; a run that needs all of it is saturated by definition   |
| R6  | The readiness preflight blocks a run for a reason the race step already reported | by design (ENV, D5/D10): the LOAD step reports ENV with the failing URL or leak line, never a LOAD result  |

**Contradictions with the roadmap.**

| #   | Roadmap says                                  | Probe / plan shows                                                         | Effect                                               |
| --- | --------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------- |
| C1  | Task 4 "builds the runner skeleton"           | Task 3's plan builds the runner core (needed by its own self-test)         | this task extends it (validity, readiness, run-meta) |
| C2  | Guard input "VU exhaustion (VUs at `maxVUs`)" | `vus_max` is VUs initialised, not VUs in use; the peak in use is `vus.max` | the rule reads `vus.max` (§3.2)                      |

**Proposed extras (out of scope until accepted; new IDs).**

- `P6-X-LOAD-012`: record the runner-wide CPU and memory series (not only the summary) in `run-meta.json` so a reviewer can see a noisy neighbour; needs Task 5's sampler.
- `P6-RULE-007`: a CI check that fails when `README.md` quotes a LOAD number without an adjacent `run-meta` link (generalises the two unit tests of §6.10; belongs with Task 11's `P6-RULE-002`).

**Owner decisions (all three questions closed 2026-10-24).**

- **Q1 (closed: a warning with a green job).** INVALID handling in CI: exit 3 turned into a `::warning::` and a green job (proposed), or a red job? Green keeps nightly noise from blocking merges; the count of VALID runs still gates the phase exit.
- **Q2 (closed: accept the `unknown` fallback).** If `ImageOS`/`ImageVersion` are missing on the runner, accept the `unknown` fallback (run unpublishable) or parse the "Set up job" log in the closeout tool? Proposed: fallback.
- **Q3 (closed: strict, `dropped_iterations > 0`).** Keep `dropped_iterations > 0` as the strict limit (probe: 0 normal, ≥ 4 saturated) or allow 0.5 % of planned? Proposed: strict; revisit only with CI data.

## 14. Done when (roadmap, made measurable)

- [ ] Unit tests green: `npm run check` exit 0 with **B + 44** (601 on today's chain).
- [ ] CI on the PR and once on `main`: `P6-X-LOAD-004` `saturated` is INVALID with `dropped_iterations` and `vu_exhausted`; `normal` is VALID; the case outcome is `PASS` (job `load-selftest`).
- [ ] `run-meta.json` uploaded with every run (artefact `load-selftest`) and passes the token scan (`node scripts/evidence-token-scan.mjs results/load` exit 0).
- [ ] The LOAD runner orchestrates k6 (setup, preflight, k6, reconcile slot with validity, cleanup, token scan, verdict) and `k6/selftest/coordinated-omission.js` still runs standalone with plain `k6 run` (Task 3 commands unchanged).
- [ ] `P6-RULE-005`: `scripts/load-medians.ts` on a fixture folder lists the excluded runs with reasons and refuses fewer than 3 valid runs. `P6-RULE-003`: `formatPublishedNumber` and the README tests exist.
- [ ] `npm run check` green; no job timeout raised; `load-selftest` worst case 4.4 min (estimates) and 9.9 min (at caps) against 20 (Task 3 §9).

## 15. Rule 20 self-check

- (a) Done-when in §14; gaps: the CI runner identity and runner-wide CPU level (§3.7), read from the first CI runs.
- (b) Existing names grepped at `5acd2a0` (Task 3 names are checked at build time, §5 check 3): `scripts/write-ci-job-summary.ts`, `src/ci/race-table.ts` (style), `scripts/evidence-token-scan.mjs` (`findHits`, `PATTERNS`),
  `src/races/prefix.ts`, `src/races/histogram.ts`, `perf.yml` `MEDUSA_REF`/`CAL_REF`/`DOCUMENSO_REF`, `README.md` (no "capacity"). NEW files and functions each have a skeleton in §6.
- (c) CI time: §10, margin 10.1 min at caps on the only job that changes.
- (d) Skeletons: §6. Steps with `git add` paths, subjects and expected output: §12.
- (e) The owner's answers to Q1 to Q3 are recorded in §1 and §13.
