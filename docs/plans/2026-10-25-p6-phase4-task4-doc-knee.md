# P6 Phase 4 Task 4: Documenso signing-journey knee and seal lag (`P6-DOC-LOAD-005`) (plan only)

This is the plan a weaker model builds from. It changes nothing in the repo. Structure follows
[docs/reference/p1-plan-example-medusa.md](../reference/p1-plan-example-medusa.md). Scope source: roadmap
[2026-10-22-p6-phase4-roadmap.md](2026-10-22-p6-phase4-roadmap.md) "Task 4", D2, D3, D13, D16. Method:
[2026-10-25-p6-phase4-task1-breakpoint-method.md](2026-10-25-p6-phase4-task1-breakpoint-method.md) (Task 1, **must be merged first**).
`knee.yml` is created by [Task 2](2026-10-25-p6-phase4-task2-cal-knee.md); this plan adds a job to it. The pipeline join is Phase 3 Task 9
([2026-10-24-p6-phase3-task9-doc-load-pipeline-lag.md](2026-10-24-p6-phase3-task9-doc-load-pipeline-lag.md), merged: `src/load/pipeline-lag.ts`,
`src/load/pipeline-stage.ts` are on `main`). The p95 reference comes from Phase 3 Task 11
([2026-10-25-p6-phase3-task11-closeout.md](2026-10-25-p6-phase3-task11-closeout.md)).

**Paths.** Every path is a path on `main` after the Phase 3 stack and Phase 4 Task 1 have merged. Paths created by Task 1 are marked
"(Task 1)", by Task 2 "(Task 2)", by Task 11 "(Task 11)".

## 1. Header

- **Task.** Phase 4 Task 4. Case: `P6-DOC-LOAD-005` (P1).
- **Plan branch.** `plan/2026-10-25-p6-phase4a-plans` (no PR, never deleted).
- **Build branch (pattern).** `feat/<build date>-p6-doc-knee`.
- **Base.** `origin/main` after Task 1 (and Task 11 for the p95 reference; Task 2 only for `knee.yml`, §6.7).
- **Harness pin.** Unchanged. **Environment change.** None. Documenso needs Node 24; `npm run up:documenso` and
  `bash scripts/bootstrap.sh documenso` pick `/opt/node24` themselves (AGENTS.md).
- **Unit tests.** B4 = count on `main` when the build starts (Task 1 adds +61; Tasks 2 and 3, if merged, +12 and +8). This plan adds
  **+11** (§12); expected B4 + 11.
- **Stop for owner review.** Yes (rule 10): a job in the new CI workflow `knee.yml`.

## 2. What it proves

Where the Documenso signing flow (create, add recipients, fields, distribute, both recipients sign) stops degrading gracefully, as a
step range, **and how the seal pipeline lags per step**. Documenso runs its background jobs inside the web process
(`NEXT_PRIVATE_JOBS_PROVIDER: "local"`), so the HTTP front and the asynchronous back end share one process; the report says which hit
first, the HTTP stop rule (D2) or the lag, and the audit proves that every completed document was sealed, announced and mailed
exactly once and that the backlog drained.

- **Finance and healthcare.** That an asynchronous back end can break before the HTTP front does: settlement lag in payments, result-
  delivery lag in a laboratory system.

## 3. Live probe evidence

Probe date 2026-10-25 (UTC). Cloud VM (Node v22.23.3 for the runner, Node v24.21.0 for Documenso, 4 vCPU, 16 GB), k6 2.3.0, harness
v0.2.15, Documenso at `DOCUMENSO_REF` `f4105e47` (`bash scripts/bootstrap.sh documenso`: 1.5 minutes; `npm run up:documenso`: about
35 s to a healthy `/signin`), stopped with `down` each time. The ramp ran through the real runner (`runLoad`, `documensoSetup`,
`documensoCleanup`, the pipeline stage, the sampler) with a scratch k6 script and a scratch case in the scratchpad; nothing in the repo
was edited or committed. **VM timings prove that a step works; no number below is a target or a published value.**

### 3.1 The coarse ramp (sizing only)

Scratch ramp: start 1, step 1 document per second, hold 30 s, ramp 2 s, eight steps planned, smoke p95 taken as 150 ms so the stop is at
1,500 ms, k6 abort with `delayAbortEval` 8 s.

```text
step rate  started/planned  http p95   iteration p50 / p95   errors   app cores  db act/total  RSS     seal lag p50 / p95 / max (step, from the join)
0   1/s    30/30            321.6 ms   1.08 s / 1.30 s       0/270    0.89       1.2 / 7       1078    0.51 / 0.66 / 1.14 s
1   2/s    60/60            416.8 ms   1.44 s / 1.60 s       0/540    1.37       1.2 / 10      1339    0.54 / 0.70 / 0.73 s
2   3/s    90/90            1317.8 ms  5.12 s / 7.92 s       0/810    1.61       1.2 / 10      1418    1.52 / 2.65 / 2.82 s
3   4/s    32/120           1533.2 ms  (cut)                 0/115    1.69       1.8 / 10      1385    3.04 / 3.65 / 3.66 s   <- stop (p95 >= 1500)
exit 99; k6 stopped 9 s into step 3; steps 4 to 7 never started; vus_max 60 of 60; dropped_iterations 0
```

- **The knee on the VM is between 3 and 4 documents per second** (with the 1,500 ms stop used here; with a smoke reference of the size the
  CI example shows, 259 ms, the stop is 2,590 ms and the range moves up by a step or two: the reference matters, §6.6).
- **The HTTP front slows from step 2 and the seal lag from step 2 too**: seal lag p95 0.66 s, 0.70 s, 2.65 s, 3.65 s; completion-email lag
  p95 0.74 s, 0.78 s, 5.76 s, 6.82 s (join output, email = Inbucket arrival). Lag grew with load but stayed far under the 30 s contract
  of Phase 3 Task 9; here the HTTP rule tripped first. **Which hit first is a per-run fact the report states.**
- **The web process is the first resource.** Application group CPU 0.89, 1.37, 1.61, 1.69 cores (plateau at the last two), RSS 1,078 to
  1,418 MB, database sessions active about 1.2 (1.8 at the stop step), 7 to 10 connections (`max_connections` of this database: **UNPROBED**, read it with the Task 1 sampler change; Medusa's is 100), waits 1 to 2 of 26 samples,
  health probe 18 to 68 ms. In-process jobs and requests compete for the same CPU, as the Phase 3 Task 7 plan found at 5 per second. By the
  Task 1 rule (floor 0.9 cores and 0.85 of the run's peak): `app_cpu` is saturated from step 2 (1.61 >= 0.85 x 1.69).
- **Generator headroom.** k6 0.03 cores average (max 0.07); runner busy 47 % on average (max 65 %); available memory never under 84 %; peak VUs 60 of 60 pre-allocated (the iteration takes 1.1 to 8 s).
  Dropped iterations were 0 in every clean step.
- **A transport error under overload (observation, not labelled).** In a separate spike run (§3.5) one `POST /api/v2/envelope/create`
  (multipart upload) was answered with `read: connection reset by peer` at 4.5 documents per second: 1 request of 3,196. It counts as an
  error in the classifier (status 0). It looks like the keep-alive race of a reused connection; **no PRODUCT BUG label**: one event, not
  repeated. If a knee run shows it in three runs the report lists it as `PRODUCT BUG (SUSPECTED)` evidence for the owner.

### 3.2 Drain after the top step; the pipeline in a stopped run (roadmap probe items 1 and 2)

```text
pipeline stage after the 4-step ramp (228 envelopes started, 192 completed by the client):
  drained in 1,541 ms, 0 stuck jobs   (a second run: 18 ms)
  seal / webhook / email lag over all documents: seal p50 0.83 s, p95 3.44 s, max 4.34 s; email p95 5.98 s, max 7.07 s; over the 30 s contract: 0
  "completed missing for 31 of 228 documents", "seal missing for 31 …"  -> the join counts documents the stop interrupted
  client completed 192, database holds 197 completed (5 more: interrupted iterations that had committed)
```

- **Drain** after the stop step: 1.5 s (VM), far inside the Task 9 contract of 30 s. The job needs no extra waiting step; the Task 6
  `waitForDrain` (30 s contract) is enough, and a longer drain would be a PRODUCT BUG with the pending job ids.
- **The stopped run leaves unfinished documents (36 started minus completed in the first run, 27 in the second).** Phase 3's pipeline stage
  reports every unfinished document as `PRODUCT BUG: <stage> missing`. That is the same TEST BUG shape as Cal's audit (Task 2 §3.4): the
  stage must judge **completed documents only** and compare the unfinished count with `interrupted` (started - completed). Fix in this
  task (§6.4); anything beyond the slack stays `PRODUCT BUG (SUSPECTED)` evidence.
- **Reconcile time.** The pipeline stage took 11.2 s for 228 documents (Inbucket and database reads, about 0.05 s per document) and the
  cleanup 14.8 s (65 ms per document). The default plan's worst case (1,080 documents) is about 54 s and 70 s.

### 3.3 Is the web CPU the first resource because the jobs run in process? (probe item 3)

By the numbers above, yes: the group `documenso-web.pid` is one process (the Remix server and the local job runner) and its CPU reaches the
plateau (1.6 to 1.7 cores) while Postgres stays at 1 to 2 active sessions. Whether the jobs or the requests use the CPU cannot be told from
outside; the report says `app_cpu` and "jobs run in the web process" (the environment line). Harness H2 (event loop delay) is Phase 5.

### 3.4 Inbucket under load (probe item 4)

Inbucket answered every read during and after the ramp; 442 completion emails were expected for the 228 envelopes of the first run (2 recipients,
completed ones), 394 matched (the other 48 belong to the 27 to 31 unfinished documents). Message reads are by envelope id through
`src/load/pipeline-email.ts`; no loss, no duplicate. The cost is the 11 s of §3.2.

### 3.5 What the spike runs add for this plan (used by Task 6)

Steady 1.5 documents per second then 4.5 for 30 s (150 % of the 3 per second lower bound) and back: http p95 per 10 s window 295 to 332 ms
steady, 1.0 s to 5.4 s in the spike, back at baseline about 66 s after the spike ended; seal lag p95 9.6 s, max 10.4 s; all
statuses 200 except the one reset above; 0 missing stages (355 documents), drained at once. The limiter profile (D12) is probed in the
Task 6 plan.

### 3.6 What the probe could not confirm ("confirm in the first CI dispatch" or at build time)

1. The knee on the GitHub runner: **UNPROBED**. The default plan's top (8/s) is twice the VM's upper bound.
2. Job time on the runner (§9 estimate from `documenso-smoke` run 40141809613 and the VM).
3. The `db_cpu` source on the runner (VM `/sys/fs/cgroup` is `tmpfs`; Task 1 §3.8).
4. Seal lag on the runner at the same load (the lag numbers above are VM values and are not published).

## 4. Depends on earlier plans

Task 1: `kneeOptions`, `beginKneeIteration`, `observeKneeResponses`, `kneeHooks`, `buildKneePlan`, `kneeStage`, `kneePlanFromInputs`,
`K6RunSpec.knee`, `K6RunSpec.allowExits`, the reconcile slack. Task 2: `.github/workflows/knee.yml`. Task 11: `k6/thresholds/smoke-p95.json`,
`parseSmokeBaseline`, `smokeP95For`. On `main`: `k6/journeys/doc-sign.js` (`runDocSign`), `k6/cases/doc-load-002.js`,
`src/load/products/documenso.ts` (`makeDocumensoSetup`, `documensoCleanup`), `src/load/pipeline-lag.ts` (`joinStages`, `summariseLag`,
`STAGES`, `StageInput`), `src/load/pipeline-stage.ts` (`readPipelineInput`, `evaluatePipeline`, `makePipelineStage`, `CONTRACT_MS`),
`src/load/reconcile/documenso.ts`, `src/documenso/run-case.ts` (`startRun`, `endRun`), `src/documenso/oracle.ts`
(`SEAL_JOBS_SQL`, `readTerminalJobs`, `DOCUMENT_COMPLETED_AUDIT_SQL`), `.github/workflows/perf.yml` (`documenso-smoke` job as the template).

## 5. Build-time recheck

| #   | Check               | Command                                                                                                                                                                                                                     | Expected                                                                              |
| --- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 1   | Base                | `git fetch origin main && git log --oneline origin/main \| grep -c "knee"`                                                                                                                                                  | Task 1 merged (≥ 1)                                                                   |
| 2   | Baseline            | `export PATH="/usr/local/bin:$PATH"; npm run check`                                                                                                                                                                         | exit 0; `# tests` = B4                                                                |
| 3   | Names               | `grep -n "export function evaluatePipeline" src/load/pipeline-stage.ts; grep -n "export function joinStages" src/load/pipeline-lag.ts; grep -n "export function kneeOptions" k6/lib/knee.js; ls .github/workflows/knee.yml` | all found; if `knee.yml` is missing build it with the job of §6.7 (Task 2 not merged) |
| 4   | p95 reference       | read `k6/thresholds/smoke-p95.json` for `P6-DOC-LOAD-001` (§6.6)                                                                                                                                                            | present, `n >= 3`                                                                     |
| 5   | Documenso bootstrap | `bash scripts/bootstrap.sh documenso`; `ls /opt/node24/bin/node`; `grep p6-webhook.test /etc/hosts`                                                                                                                         | exit 0; Node 24; host mapped                                                          |
| 6   | The case runs once  | `npm run up:documenso`; `npm run load:documenso-knee -- --profile pr`; `npm run down:documenso`                                                                                                                             | exit 0 or 3, `knee-report-main.md` and `pipeline-lag.json` written                    |
| 7   | Join keys           | one completed document: `joinStages` returns `lagMs.seal` and `lagMs.email` (the Task 9 plan §5 check 6)                                                                                                                    | numbers, not undefined                                                                |

## 6. Design

### 6.1 File tree

```text
k6/cases/doc-load-005.js                    NEW      knee script (Task 1 library + runDocSign)
k6/cases/doc-load-005.example.json          NEW      example config for a standalone run
src/load/knee/lag-by-step.ts                NEW      lagByStep(docs, windows), lagMarker(table)
src/load/pipeline-stage.ts                  CHANGED  knee mode: judge completed documents only; unfinished vs interrupted; per-step table
src/load/knee/stage.ts                      CHANGED  (Task 1) feeds the report the per-step lag table when the case provides it
src/load/cases.ts                           CHANGED  + DOC_LOAD_005
package.json                                CHANGED  + load:documenso-knee
.github/workflows/knee.yml                  CHANGED  + job documenso-knee (created by Task 2)
README.md                                   CHANGED  + "Documenso knee and seal lag" after the runs exist (§12 step 7)
tests/unit/knee-lag-by-step.test.ts, pipeline-knee.test.ts, load-cases-doc-knee.test.ts   NEW
```

### 6.2 The knee script (`k6/cases/doc-load-005.js`, NEW)

```js
// P6-DOC-LOAD-005: Documenso signing knee (plan Phase 4 task 4). The API token arrives in the environment only (DOCUMENSO_API_TOKEN).
// Standalone, against a Documenso stack started by the harness:
//   DOCUMENSO_API_TOKEN=... P6_LOAD_CONFIG=k6/cases/doc-load-005.example.json k6 run k6/cases/doc-load-005.js
import { loadLoadConfig } from "../lib/config.js";
import { beginKneeIteration, kneeHooks, kneeOptions, observeKneeResponses } from "../lib/knee.js";
import { buildKneePlan } from "../lib/pure/knee.js";
import { runDocSign } from "../journeys/doc-sign.js";

const cfg = {
  startRate: 1,
  stepRate: 1,
  holdSec: 30,
  rampSec: 2,
  maxSteps: 8,
  smokeP95Ms: 300,
  pre: 80,
  max: 200,
  delayAbortEvalSec: 8,
  baseUrl: "http://127.0.0.1:3001",
  prefix: "p6-qa-00000000t000000z-00000000-p6-doc-load-005",
  pdfPath: "",
  ...loadLoadConfig([]),
};
const PDF = cfg.pdfPath ? open(cfg.pdfPath, "b") : null; // opened once, in the init context
const plan = buildKneePlan(cfg);
export const options = kneeOptions({
  ...cfg,
  plan,
  exec: "journey",
  tags: { case: "P6-DOC-LOAD-005", journey: "doc-sign" },
});
export const { setup, teardown } = kneeHooks(__ENV.MARKER_URL);
observeKneeResponses("documenso");
export function journey() {
  if (PDF === null) throw new Error("TEST BUG: pdfPath is not set in the config");
  beginKneeIteration(plan);
  runDocSign(cfg, PDF);
}
```

`k6/journeys/doc-sign.js` changes by one line (Task 1 §6.3): the multipart `create` step passes its response to `observe(r)`.

### 6.3 Per-step lag (`src/load/knee/lag-by-step.ts`, NEW)

```ts
import type { DocumentLag, Stage } from "../pipeline-lag.ts";
import type { Window } from "./first-saturated.ts"; // { index, fromMs, toMs }, the hold windows from p6_knee_t0_ms (Task 1)

export interface StepLag {
  index: number;
  documents: number; // completed documents whose last signature fell inside the step's hold
  p50: Partial<Record<Stage, number>>;
  p95: Partial<Record<Stage, number>>;
  max: Partial<Record<Stage, number>>;
}

/**
 * Buckets the completed documents by `lastSignedMs` into the hold windows (a document signed in a ramp window belongs to no step) and
 * summarises each stage lag per step (nearest-rank percentiles, the rule of pipeline-lag.ts). Documents that never completed are
 * not in any bucket; the caller counts them against `interrupted`.
 */
export function lagByStep(
  docs: Array<DocumentLag & { lastSignedMs: number | null }>,
  windows: Window[],
): StepLag[];

/**
 * The reported (never stopping) lag marker: the first step whose seal-lag p95 is >= 10 x the step-0 seal-lag p95, or null. Printed beside
 * the HTTP stop step so the report says which came first. A step with fewer than 20 documents is skipped.
 */
export function lagMarker(table: StepLag[], factor?: number): number | null;
```

`DocumentLag` (Phase 3 Task 9) has no `lastSignedMs`; `lagByStep` takes the document rows it came from and zips them by `documentId`
(`joinStages` keeps the input order). The probe's scratch stage did exactly this and produced the table of §3.1.

### 6.4 Pipeline stage in knee mode (`src/load/pipeline-stage.ts`, CHANGED)

`makePipelineStage` reads `ctx.config.knee` (set by the case). In knee mode, before `evaluatePipeline`:

1. Split `input.documents` into **completed** (`completedAtMs !== null`) and **unfinished**; drop the unfinished from the stage input and from
   `expectedEmails` (so `completed missing …` and `email missing …` can no longer be raised for them).
2. `interrupted = started - completed iterations` from the k6 summary (`p6_step_started` total minus `iterations`; Task 1 provides
   `kneeInterrupted(ctx)`); `unfinished` must be `<= interrupted`; more is a `PRODUCT BUG (SUSPECTED)` line
   ("documents never completed beyond the iterations the stop interrupted") with both numbers.
3. `evaluatePipeline` on the completed documents only: every stage exactly once, the double seal counted under `P6-OBS-DOC-002` (sequential
   journeys: a double seal here is new evidence, Task 9 §3.6), lags over the 30 s contract, undrained backlog.
4. Write `pipeline-lag.json` as today plus `byStep` (the `StepLag[]` table, counts and milliseconds only), `unfinished`, `interrupted`, and
   `lagMarker`; the knee stage puts the table and the marker into `knee-report-main.json`/`.md`.

Everything else in the stage (drain, token scan before write, file name) is unchanged. A case without `ctx.config.knee` behaves exactly as
today (the Phase 3 cases keep their tests).

### 6.5 The case (`src/load/cases.ts`, CHANGED)

```ts
export const DOC_LOAD_005: LoadCase = {
  id: "P6-DOC-LOAD-005",
  title: "Documenso signing journey knee with seal lag per step",
  product: "documenso",
  label: "knee range, environment-bound",
  profiles: {
    pr: { rate: 1, durationSec: 108, maxLatencyMs: 8000 }, // 3 steps (1, 2, 3/s) x 12 s hold: a smoke of the machinery
    full: { rate: 1, durationSec: 256, maxLatencyMs: 8000 }, // 8 steps x 32 s
  },
  telemetry: { product: "documenso" },
  runs: (ctx) => [
    {
      label: "main",
      script: "k6/cases/doc-load-005.js",
      env: {},
      secretEnv: ["DOCUMENSO_API_TOKEN"],
      allowExits: [0, 99],
      knee: { ...kneePlanFor(ctx), smokeP95Ms: ctx.config.smokeP95Ms as number, maxVUs: 200 },
    },
  ],
  stages: {
    setup: makeDocumensoSetup({ webhookMode: "ok" }),
    reconcile: composeStages([kneeStage, reconcileStage, pipelineStage]),
    cleanup: documensoCleanup,
  },
};
```

`reconcileStage` is the Documenso audit with the interrupted slack (Task 1): one seal per completed document, no stuck jobs after drain,
`client 192, database 197` within `0 <= db - client <= interrupted`, `P6-OBS-DOC-002` counted separately. The setup stage also reads
`smokeP95Ms` (Task 11's file, key `P6-DOC-LOAD-001`; missing: `ENV`, no default number in code). `kneePlanFor(ctx)` (Task 1) defaults:
`{ startRate: 1, stepRate: 1, holdSec: 30, rampSec: 2, maxSteps: 8 }` on `full`, `{ 1, 1, 12, 2, 3 }` on `pr`. `CASES` gets the entry;
`package.json`: `"load:documenso-knee": "node scripts/load/run-load.ts --case P6-DOC-LOAD-005"`. The limiter is off, as in every P6 Documenso
start except the D12 profile of Task 6: the environment line says "Documenso production build, jobs in the web process, rate limits
bypassed".

### 6.6 The p95 reference

The stop limit is `10 x cases["P6-DOC-LOAD-001"].medianP95Ms` from `k6/thresholds/smoke-p95.json` (Task 11). The smoke and this
journey are the same eight requests; the VM's step-0 p95 (322 ms) against the one CI example (259.0 ms) shows the reference should
come from the runner. The report prints the ratio `step 0 p95 / smoke median` and a warning above 2.

### 6.7 The workflow job (`.github/workflows/knee.yml`, CHANGED)

Add job `documenso-knee`, `timeout-minutes: 60`, `runs-on: ubuntu-24.04`, the env of the `documenso-smoke` job in `perf.yml` plus the
`KNEE_*` variables from the workflow inputs, and the steps of `documenso-smoke` up to and including "Start Documenso (harness up)"
(checkout, fork checkout and HEAD check, `DOCUMENSO_REF` match check, `npm ci`, k6 install, Documenso dependencies, "Prepare harness roots",
"Map the webhook host" (`p6-webhook.test` in `/etc/hosts`), build cache restore, image pull), then:

```yaml
- name: Knee P6-DOC-LOAD-005 (knee range, environment-bound)
  timeout-minutes: 15
  working-directory: ${{ env.P6_WORKING_DIRECTORY }}
  run: |
    set -euo pipefail
    status=0
    npm run load:documenso-knee -- --profile full || status=$?
    if [ "$status" -eq 3 ]; then echo "::warning::knee run INVALID (see the job summary)"; status=0; fi
    exit "$status"

# then: Job summary (knee table and seal lag table), Token scan, upload artefact knee-documenso, Stop Documenso (harness down, if: always())
```

The Documenso build cache is restored, never saved (`documenso-smoke` saves it on `main`). `DANGEROUS_BYPASS_RATE_LIMITS` is left unset so
`scripts/harness.mjs` sets it to `true`; the job never sets it to `false` (that is the Task 6 job). Every action is pinned by SHA as in
`perf.yml`. The job runs on `workflow_dispatch` and the Saturday cron only (D16).

## 7. Oracles and assertions

(1) The **post-load audit**: every completed envelope sealed exactly once (`SEAL_JOBS_SQL`), the completion audit row once
(`DOCUMENT_COMPLETED_AUDIT_SQL`), no stuck jobs after the drain, the client count vs database within the interrupted slack, a double seal
counted under `P6-OBS-DOC-002`. (2) The **pipeline stage** on completed documents: each stage reached exactly once, lags under the 30 s
contract, backlog drained. (3) The **leak check** after the cleanup (`leakCounts`). (4) The **knee contract**: a KNEE report with a
range, stop reason, first saturated resource, per-step lag table and lag marker, or NO_KNEE/INVALID with its reason.

**PRODUCT BUG vs TEST BUG.** A completed document without a seal, a double seal in a sequential journey (beyond the known pair bug), a
duplicate webhook or email, a stuck job after the drain, unfinished documents beyond the interrupted slack, or a 5xx before the rule
trips would be `PRODUCT BUG (SUSPECTED)` with the run link, labelled only by the owner after repeated full-count runs (rule 13). The
unfinished documents of a stopped run, a plan that ends without a stop, a stale join key, or an audit mismatch within the slack are TEST
BUG or INVALID. **No `PRODUCT BUG (SUSPECTED)` was found by this probe** (the reset in §3.1 is one event, listed there). No expected-failure
marker, no skip.

## 8. Data isolation, cleanup, leak check

Prefix: `caseDataPrefix(runPrefix, "P6-DOC-LOAD-005")`; document titles `iterationId(prefix, n) journey`, recipients
`<iterationId>-r<i>@example.com`. The per-run account, API token and webhook are made by `documensoSetup` and removed by `documensoCleanup`
(envelope deletes found by prefix, webhook, token, account); a failure is a TEST BUG line, the sweep continues, the leak check runs last.
Cleanup is 65 ms per document (§3.2). The API token travels in `ctx.secrets` and the k6 environment only; the token scan runs in the
`tokenScan` stage and the workflow step.

## 9. CI, token scan, budget

Job `documenso-knee`, own timeout **60 minutes**, `workflow_dispatch` and Saturday only. Estimate (warm caches) from `documenso-smoke` run
40141809613: checkout and install 11 s, Documenso install 47 s, image pull 10 s, `up:documenso` 40 s = **about 1.8 min**; knee step: k6 about
2 to 3 minutes (stops near step 3 or 4) plus setup 1 s, pipeline stage 0.05 s per document (about 10 to 15 s) and cleanup 65 ms per document
(about 15 to 20 s); summary, scan, upload, `down` about 1 min. **Estimate 5 to 7 min.**

| Step                           | `timeout-minutes` | Estimate (min)                                                    | Stop rule (80 %)    |
| ------------------------------ | ----------------- | ----------------------------------------------------------------- | ------------------- |
| setup steps up to image pull   | 1 to 8 each       | 1.2                                                               | per step            |
| `up:documenso` (harness)       | 10                | 0.7 (cold build 8)                                                | 8                   |
| **knee step**                  | **15**            | 4.0 (worst, 1,080 documents: k6 4.3 + pipeline 0.9 + cleanup 1.2) | **12**              |
| summary / scan / upload / down | 2 / 2 / 3 / 5     | 1                                                                 | 1.6 / 1.6 / 2.4 / 4 |

Worst case at caps (`up` cold build 10 + knee 15 + warm setup and post steps and the Documenso build-cache allowance): **about 38
minutes**; timeout 60, **margin 22**. If the first dispatch shows the knee step above 12 minutes (80 % of 15), the fix is a shorter hold
or fewer steps, never a higher timeout. No existing job changes; no existing timeout is raised. A dispatch costs about 7 runner minutes
(three: 21).

## 10. Expected output

```text
$ npm run load:documenso-knee -- --profile pr
P6-DOC-LOAD-005 (knee range, environment-bound) run 20261025T120000Z-3fa9c0d1
  setup        ok   smoke p95 reference 300 ms; account, token, webhook
  k6 main      exit 99  steps 0..2 of 3  (stop rule: p95 >= 3000 ms)  or  exit 0, no stop
  knee         KNEE between step 1 (2/s) and step 2 (3/s); stop: p95; first saturated: app_cpu (step 2); lag marker: none
  reconcile    ok   sealed once: 61 completed; client 61, database 63 (interrupted 2); pipeline: 61 documents, 0 missing, drained in 18 ms
  seal lag     step 0 p95 0.66 s | step 1 0.70 s | step 2 2.65 s
  cleanup      ok   leak check clean
  verdict      PASS | INVALID  results/load/P6-DOC-LOAD-005/<run id>/verdict.json
```

(Illustrative VM-class values; the PR profile is a smoke of the machinery.) The job summary prints `knee-report-main.md`, the per-step lag
table and `pipeline-lag.json` highlights.

## 11. Environment changes (exact steps)

None for Cursor Cloud (`.cursor/environment.json`, `.cursor/Dockerfile`) or Claude Code cloud (setup script,
`.claude/hooks/session-start.sh`). Documenso needs Node 24 at `/opt/node24` (the hook already warns when it is missing) and
`p6-webhook.test` in `/etc/hosts` (the hook adds it). No repo setting changes; the owner starts a dispatch from the Actions tab.

## 12. Build order (one commit per step; `npm run check` after each)

Run from the repo root with `export PATH="/usr/local/bin:$PATH"`. Branch: `git switch -c feat/<build date>-p6-doc-knee origin/main`.
Counts relative to B4 (§5 check 2).

| Step | Commit subject                                                     | `git add` paths                                                                                | Expected (`npm run check`)                                                                                  |
| ---- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 0    | `docs(plans): bring the phase 4 task 4 plan onto the build branch` | `docs/plans/2026-10-25-p6-phase4-task4-doc-knee.md`                                            | exit 0, B4                                                                                                  |
| 1    | `feat(load): compute the seal lag per step of a knee`              | `src/load/knee/lag-by-step.ts tests/unit/knee-lag-by-step.test.ts`                             | exit 0, **B4 + 5**                                                                                          |
| 2    | `feat(load): judge only completed documents in a knee run`         | `src/load/pipeline-stage.ts tests/unit/pipeline-knee.test.ts`                                  | exit 0, **B4 + 8**; the existing pipeline tests unchanged                                                   |
| 3    | `feat(k6): add the documenso knee script`                          | `k6/cases/doc-load-005.js k6/cases/doc-load-005.example.json k6/journeys/doc-sign.js`          | exit 0, B4 + 8; `k6 inspect` ok                                                                             |
| 4    | `feat(load): add the documenso knee case`                          | `src/load/cases.ts src/load/knee/stage.ts package.json tests/unit/load-cases-doc-knee.test.ts` | exit 0, **B4 + 11**; `npm run load:documenso-knee -- --profile pr` against a started Documenso exits 0 or 3 |
| 5    | `ci(knee): add the documenso job to the knee workflow`             | `.github/workflows/knee.yml`                                                                   | exit 0 (actionlint silent), B4 + 11                                                                         |
| 6    | `docs: describe the documenso knee and seal lag`                   | `README.md`                                                                                    | exit 0, B4 + 11                                                                                             |

New unit tests by name (11): `knee-lag-by-step` (5: documents bucket by last signature into hold windows and a ramp-window signature is in
no step; unfinished documents are in no bucket; nearest-rank p50/p95/max per stage per step; the lag marker is the first step at or above
10 times the step-0 seal p95 and steps under 20 documents are skipped; an empty step yields empty percentiles); `pipeline-knee` (3: in knee
mode unfinished documents do not raise "missing"; more unfinished than `interrupted` is a PRODUCT BUG line with both numbers; completed
documents still fail on a missing stage, a duplicated webhook and a double seal counted under `P6-OBS-DOC-002`); `load-cases-doc-knee` (3: the
case and its run (`allowExits [0, 99]`, `secretEnv DOCUMENSO_API_TOKEN`, `maxVUs 200`) and telemetry product `documenso`; `package.json` has the
script; the example config has the keys the script reads and no token). Count 5 + 3 + 3 = **11**; steps 1 → +5, 2 → +3, 4 → +3.

After step 6: push, `gh pr create` (rule 3), CI once (rule 15). The PR runs only the product-free job of Task 1. After the owner merges, the
owner dispatches `knee.yml` three times on `main` (§14).

## 13. Risks, proposed extras, open decisions

| ID  | Risk                                                           | Mitigation                                                                              |
| --- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| R1  | The seal work makes steps slow and moves the knee between runs | the report is a range per run, min and max over runs                                    |
| R2  | Drain longer than the job allows                               | measured 1.5 s; the 30 s contract is a PRODUCT BUG with job ids when broken             |
| R3  | A transport reset under overload is read as saturation         | 1 in 3,196 is under the 1 % rule; the report lists transport errors separately          |
| R4  | The limiter profile leaks into this job                        | the job never sets `DANGEROUS_BYPASS_RATE_LIMITS`; the environment line says "bypassed" |
| R5  | The pipeline join is 0.05 s per document                       | counted in §9 (54 s at the default plan's worst case)                                   |

**Contradictions with the roadmap.**

| #   | Roadmap says                                                       | Probe shows                                                                          | Effect                                                                 |
| --- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| C1  | "audit: one seal per document, no stuck jobs after drain"          | a stopped run leaves unfinished documents the Phase 3 pipeline stage calls "missing" | knee mode judges completed documents; unfinished vs interrupted (§6.4) |
| C2  | "`ALREADY_SIGNED` … are conflicts" (Task 1 note)                   | a 200 by design (README)                                                             | no conflict class for Documenso                                        |
| C3  | "per held step, completion → seal lag from the Phase 3 stage join" | the join gives per-document lag; steps come from the last-signature time             | `lagByStep` (§6.3)                                                     |
| C4  | knee workflow or `perf.yml`                                        | as Task 2                                                                            | job in `knee.yml`                                                      |

**Proposed extras (out of scope until accepted; new IDs).**

- `P6-DOC-LOAD-010`: a lag rule alongside D2 (stop when the seal-lag p95 reaches 10 times the step-0 value), with evidence from three
  runs, if the owner wants "lag first" to end a run (D2 keeps the HTTP rule only).
- `P6-DOC-LOAD-011`: the same knee with the jobs provider moved out of the web process (needs a harness change; Phase 5).

**Open decisions** (option, evidence, recommended default).

- **Q1. Default plan.** (a) start 1, step 1, hold 30 s, 8 steps (recommended: the VM knee is at step 3 of 8; 1,080 documents at most);
  (b) start 1, step 2. **Default: (a).**
- **Q2. Lag is reported, not a stop condition.** (a) as D2 (recommended; the HTTP rule tripped first in the probe, the lag stayed under 4 s);
  (b) add the `P6-DOC-LOAD-010` rule. **Default: (a).**
- **Q3. Unfinished documents of a stopped run.** (a) judge completed documents and bound the unfinished by `interrupted` (recommended);
  (b) cancel in-flight work before the audit. Evidence: 27 to 36 unfinished per probe run. **Default: (a).**
- **Q4. The smoke reference.** (a) the Task 11 median (recommended); (b) re-measure step 0. Evidence: VM step-0 p95 is 1.2 times the CI example.
  **Default: (a).**

## 14. Done when (roadmap, made measurable)

- [ ] `npm run check` exit 0 with **B4 + 11** unit tests; `k6 inspect` lists the new script.
- [ ] 3 VALID `workflow_dispatch` runs of `knee.yml` (job `documenso-knee`) on `main`, each with a KNEE report (range, stop reason, first
      saturated resource), the per-step seal-lag table and which came first (HTTP or lag), a drained backlog, a clean audit (one seal per
      completed document) or a recorded product bug under its ID (`P6-OBS-DOC-002` counted separately); the three ranges and their spread in
      the job summaries.
- [ ] Run ids and `run-meta.json` listed; INVALID runs listed with reasons and excluded.
- [ ] README says "knee range" and carries the label "Documenso production build, jobs in the web process, rate limits bypassed"; no VM
      number appears.

## 15. Rule 20 self-check

- (a) Roadmap "Done when": ≥ 3 VALID runs with range, per-step seal lag, stop reason, resource, drained backlog, clean audit: §14. Gap:
  runner values (§3.6).
- (b) Existing names grepped on `main` (Task 9 merged): `k6/journeys/doc-sign.js` (`runDocSign`), `k6/cases/doc-load-002.js`,
  `src/load/products/documenso.ts` (`makeDocumensoSetup`, `documensoCleanup`), `src/load/pipeline-lag.ts` (`joinStages`, `summariseLag`,
  `STAGES`), `src/load/pipeline-stage.ts` (`readPipelineInput`, `evaluatePipeline`, `makePipelineStage`, `CONTRACT_MS`, `pipelineStage`),
  `src/load/reconcile/documenso.ts`, `src/documenso/run-case.ts`, `.github/workflows/perf.yml` (`documenso-smoke`). NEW here with skeletons:
  §6.1. From Tasks 1, 2, 11: the names in §4.
- (c) CI time: §9, worst 38 of 60 minutes; no existing timeout raised.
- (d) Skeletons §6; steps with `git add` paths, subjects and expected output §12.
- (e) No owner answer is recorded as given; Q1 to Q4 are open with defaults.
