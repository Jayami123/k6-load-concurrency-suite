# P6 Phase 4 Task 4: Documenso signing-journey knee and seal lag (`P6-DOC-LOAD-005`) (plan only)

This is the plan a weaker model builds from. It changes nothing in the repo. Structure follows
[docs/reference/p1-plan-example-medusa.md](../reference/p1-plan-example-medusa.md). Scope source: roadmap
[2026-10-22-p6-phase4-roadmap.md](2026-10-22-p6-phase4-roadmap.md) "Task 4", D2, D3, D13, D16. Method:
[2026-10-25-p6-phase4-task1-breakpoint-method.md](2026-10-25-p6-phase4-task1-breakpoint-method.md) (Task 1, **must be merged first**).
`knee.yml` is created by [Task 2](2026-10-25-p6-phase4-task2-cal-knee.md); this plan adds a job to it (one workflow PR at a time); PRE-3
([2026-10-25-p6-phase4-pre3-evidence-workflow-ids.md](2026-10-25-p6-phase4-pre3-evidence-workflow-ids.md)) puts `knee.yml` into the release check. The pipeline join is Phase 3 Task 9
([2026-10-24-p6-phase3-task9-doc-load-pipeline-lag.md](2026-10-24-p6-phase3-task9-doc-load-pipeline-lag.md), merged: `src/load/pipeline-lag.ts`,
`src/load/pipeline-stage.ts` are on `main`). The p95 reference is `k6/thresholds/smoke-p95.json` (Phase 3 Task 11, on main, PR #65, `6e307cf`).

**Paths.** Every path is a path on `main` after Phase 4 Task 1 and Task 2 have merged. Paths created by Task 1 are marked "(Task 1)", by Task 2 "(Task 2)". The Phase 3 stack (Task 10
is PR #62, `63c4d87`) and the smoke baseline (PR #65) are on main.

## 1. Header

- **Task.** Phase 4 Task 4. Case: `P6-DOC-LOAD-005` (P1).
- **Plan branch.** `plan/2026-10-25-p6-phase4a-plans` (no PR, never deleted).
- **Build branch (pattern).** `feat/<build date>-p6-doc-knee`.
- **Base.** `origin/main` after Task 1 and Task 2 (`knee.yml` exists). B4 is measured at build time (865 at `2db9726`, plus the deltas of PRE-1, PRE-2, Task 1, Task 2 and Task 3 if merged).
- **Harness pin.** Unchanged. **Environment change.** None. Documenso needs Node 24; `npm run up:documenso` and
  `bash scripts/bootstrap.sh documenso` pick `/opt/node24` themselves (AGENTS.md).
- **Unit tests.** B4 = the count on `main` when the build starts. This plan adds **+13** (§12); expected B4 + 13.
- **Stop for owner review.** Yes (rule 10): a job in the new CI workflow `knee.yml` (dispatch only).

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
  stage must judge **completed documents only**, and every unfinished document is matched to an intent by its title `<prefix>-i<n> journey` (`k6/journeys/doc-sign.js:37`, `n` from line 22).
  Only **indeterminate** intents (no outcome line, at most `interrupted`) may leave an unfinished document; an `ok` intent with an unfinished document, a `fail` intent with one, and an
  unfinished document of no started intent are findings (Task 1 §6.8; PRODUCT BUG (SUSPECTED)). Fix in this task (§6.4). **UNPROBED — confirm in the first CI dispatch:** the indeterminate
  count against `interrupted` (the VM had 27 to 36 unfinished documents).
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
2. Job time on the runner: the copied setup steps are measured (§9, 52 `documenso-smoke` runs); the knee step is from the VM and **UNPROBED** on the runner.
3. The `db_cpu` source on the runner reads (30 of 30 `telemetry-main.json` files of the `p6-phase3` release zips report `sources.container` `present: true, errors: 0`, Task 1 §3.8 item 2); the VM's
   `tmpfs` cgroup is a VM-only failure.
4. Seal lag on the runner at the same load (the lag numbers above are VM values and are not published).

## 4. Depends on earlier plans

Task 1: `kneeOptions`, `beginKneeIteration`, `endKneeIteration`, `observeKneeResponses`, `kneeHooks`, `buildKneePlan`, `kneeStage`, `kneePlanFromInputs`,
`K6RunSpec.knee`, `K6RunSpec.allowExits`, the per-intent reconciliation (`parseIntentLog`, `auditByIntent`, `opts.onCommit`). Task 2: `.github/workflows/knee.yml`. On `main` (PR #65, `6e307cf`): `k6/thresholds/smoke-p95.json`,
`parseSmokeBaseline`, `smokeP95For` (`src/load/smoke-baseline.ts`). On `main`: `k6/journeys/doc-sign.js` (`runDocSign`), `k6/cases/doc-load-002.js`,
`src/load/products/documenso.ts` (`makeDocumensoSetup`, `documensoCleanup`), `src/load/pipeline-lag.ts` (`joinStages`, `summariseLag`,
`STAGES`, `StageInput`), `src/load/pipeline-stage.ts` (`PIPELINE_DOCUMENTS_SQL`, `readPipelineInput`, `evaluatePipeline`, `makePipelineStage`, `CONTRACT_MS`),
`src/load/reconcile/documenso.ts` (`ENVELOPES_BY_TITLE_SQL`), `src/documenso/run-case.ts` (`startRun`, `endRun`), `src/documenso/oracle.ts`
(`SEAL_JOBS_SQL`, `readTerminalJobs`, `DOCUMENT_COMPLETED_AUDIT_SQL`), `.github/workflows/perf.yml` (`documenso-smoke` job as the template).

## 5. Build-time recheck

| #   | Check               | Command                                                                                                                                                                                                                                                                                   | Expected                                                           |
| --- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 1   | Base                | `git fetch origin main && git log --oneline origin/main \| grep -c "knee"; ls .github/workflows/knee.yml`                                                                                                                                                                                 | Task 1 merged (≥ 1) and `knee.yml` exists (Task 2)                 |
| 2   | Baseline            | `export PATH="/usr/local/bin:$PATH"; npm run check`                                                                                                                                                                                                                                       | exit 0; `# tests` = B4 (measure; write it into the PR)             |
| 3   | Names               | `grep -n "export function evaluatePipeline" src/load/pipeline-stage.ts; grep -n "export function joinStages" src/load/pipeline-lag.ts; grep -n "export function kneeOptions" k6/lib/knee.js; ls .github/workflows/knee.yml`                                                               | all found; otherwise stop and report                               |
| 4   | p95 reference       | `node --input-type=module -e 'import { readFileSync } from "node:fs"; import { parseSmokeBaseline, smokeP95For } from "./src/load/smoke-baseline.ts"; console.log(smokeP95For(parseSmokeBaseline(JSON.parse(readFileSync("k6/thresholds/smoke-p95.json", "utf8"))), "P6-DOC-LOAD-001"))'` | prints `233.131137` at `2db9726`                                   |
| 5   | Documenso bootstrap | `bash scripts/bootstrap.sh documenso`; `ls /opt/node24/bin/node`; `grep p6-webhook.test /etc/hosts`                                                                                                                                                                                       | exit 0; Node 24; host mapped                                       |
| 6   | The case runs once  | `npm run up:documenso`; `npm run load:documenso-knee -- --profile pr`; `npm run down:documenso`                                                                                                                                                                                           | exit 0 or 3, `knee-report-main.md` and `pipeline-lag.json` written |
| 7   | Join keys           | one completed document: `joinStages` returns `lagMs.seal` and `lagMs.email` (the Task 9 plan §5 check 6)                                                                                                                                                                                  | numbers, not undefined                                             |

## 6. Design

### 6.1 File tree

```text
k6/cases/doc-load-005.js                    NEW      knee script (Task 1 library + runDocSign with onCommit)
k6/cases/doc-load-005.example.json          NEW      example config for a standalone run
k6/journeys/doc-sign.js                     CHANGED  observe(r) on the multipart create (Task 1 §6.3) and opts.onCommit?.() beside completedCounter.add(1) (:185) (Task 1 §6.8)
src/load/knee/lag-by-step.ts                NEW      lagByStep(docs, windows), lagMarker(table)
src/load/knee/doc-intents.ts                NEW      docIntentOf(prefix, title), docRowsByIntent(rows, prefix) (§6.4b)
src/load/pipeline-stage.ts                  CHANGED  knee mode: judge completed documents only; unfinished documents per intent; per-step table; the title column
src/load/knee/stage.ts                      CHANGED  (Task 1) feeds the report the per-step lag table when the case provides it
src/load/cases.ts                           CHANGED  + DOC_LOAD_005
package.json                                CHANGED  + load:documenso-knee
.github/workflows/knee.yml                  CHANGED  + job documenso-knee (created by Task 2)
README.md                                   CHANGED  + "Documenso knee and seal lag" after the runs exist (§12 step 7)
tests/unit/knee-lag-by-step.test.ts, knee-doc-intents.test.ts, pipeline-knee.test.ts, load-cases-doc-knee.test.ts   NEW
```

### 6.2 The knee script (`k6/cases/doc-load-005.js`, NEW)

```js
// P6-DOC-LOAD-005: Documenso signing knee (plan Phase 4 task 4). The API token arrives in the environment only (DOCUMENSO_API_TOKEN).
// Standalone, against a Documenso stack started by the harness:
//   DOCUMENSO_API_TOKEN=... P6_LOAD_CONFIG=k6/cases/doc-load-005.example.json k6 run k6/cases/doc-load-005.js
import { loadLoadConfig } from "../lib/config.js";
import {
  beginKneeIteration,
  endKneeIteration,
  kneeHooks,
  kneeOptions,
  observeKneeResponses,
} from "../lib/knee.js";
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
  const intent = beginKneeIteration(plan);
  let committed = false;
  runDocSign(cfg, PDF, { onCommit: () => (committed = true) }); // called beside completedCounter.add(1) (doc-sign.js:185)
  endKneeIteration(intent, committed); // one outcome line per finished iteration (Task 1 §6.8)
}
```

`k6/journeys/doc-sign.js` changes by two lines: the multipart `create` step passes its response to `observe(r)` (Task 1 §6.3), and `opts.onCommit?.()` runs beside `completedCounter.add(1)` (Task 1 §6.8).

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
 * not in any bucket; the caller matches them to intents (§6.4).
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

### 6.4 Pipeline stage in knee mode (`src/load/pipeline-stage.ts`, CHANGED) and rows by intent (`src/load/knee/doc-intents.ts`, NEW)

`PIPELINE_DOCUMENTS_SQL` gains the title column (`e.title AS "title"`; the existing callers ignore it), and `makePipelineStage` reads `ctx.config.knee` (set by the case). In knee mode, before
`evaluatePipeline`:

1. Split `input.documents` into **completed** (`completedAtMs !== null`) and **unfinished**; drop the unfinished from the stage input and from `expectedEmails` (so `completed missing …` and
   `email missing …` can no longer be raised for them).
2. Reconcile the unfinished documents **per intent** (Task 1 §6.8, `auditByIntent`): `docRowsByIntent(rows, prefix)` maps each envelope title `<prefix>-i<n> journey` to `n` (`k6/journeys/doc-sign.js:37`)
   and counts envelopes per intent and per status. Rules: a title that maps to no started intent is a ghost document; two envelopes for one intent is a duplicate; an `ok` intent has exactly one envelope and it
   is `COMPLETED`; a `fail` intent (without `net`) has none; **only an indeterminate intent (no outcome line, or `fail` with `net: true`) may leave an unfinished document**, and the intents with no line number at most
   `interrupted` (`p6_step_started` total minus `iterations`; Task 1 provides `kneeInterrupted(ctx)`). Every violation is a `PRODUCT BUG (SUSPECTED)` line with the intent number, the counts and the
   numbers `interrupted` and `indeterminate`, never a title.
3. `evaluatePipeline` on the completed documents only: every stage exactly once, the double seal counted under `P6-OBS-DOC-002` (sequential journeys: a double seal here is new evidence, Task 9 §3.6), lags over the 30 s
   contract, undrained backlog.
4. Write `pipeline-lag.json` as today plus `byStep` (the `StepLag[]` table, counts and milliseconds only), `unfinishedByIntent` (counts), `indeterminate`, `interrupted`, and `lagMarker`; the knee stage puts the
   table and the marker into `knee-report-main.json`/`.md`.

```ts
/** "<prefix>-i<n> journey" → n (k6/journeys/doc-sign.js:37); undefined for another prefix, another suffix or a leaf that is not a whole number. */
export function docIntentOf(prefix: string, title: string): number | undefined;
/** Envelopes per intent, split by completed and unfinished; an envelope of no intent is a ghost row. */
export function docRowsByIntent(
  rows: Array<{ title: string; completed: boolean }>,
  prefix: string,
): {
  rowsByIntent: Map<number, number>;
  unfinishedByIntent: Map<number, number>;
  ghostRows: number;
};
```

Everything else in the stage (drain, token scan before write, file name) is unchanged. A case without `ctx.config.knee` behaves exactly as today (the Phase 3 cases keep their tests).

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

`reconcileStage` is the Documenso audit (`src/load/reconcile/documenso.ts`): one seal per completed document, no stuck jobs after drain, `P6-OBS-DOC-002` counted separately, and in knee mode the count check
`client-matches-db` is replaced by the per-intent rules of §6.4 (Task 1 §6.8). The setup stage also reads `smokeP95Ms` through the shipped reader (PR #65):
`smokeP95For(parseSmokeBaseline(JSON.parse(readFileSync("k6/thresholds/smoke-p95.json", "utf8"))), "P6-DOC-LOAD-001")`; an unreadable or invalid file is `ENV: smoke p95 reference unreadable`, and there is no
default number in code. `kneePlanFor(ctx)` (Task 1) defaults: `{ startRate: 1, stepRate: 1, holdSec: 30, rampSec: 2, maxSteps: 8 }` on `full`, `{ 1, 1, 12, 2, 3 }` on `pr`. `CASES` gets the entry;
`package.json`: `"load:documenso-knee": "node scripts/load/run-load.ts --case P6-DOC-LOAD-005"`. The limiter is off, as in every P6 Documenso start except the D12 profile of Task 6: the environment line says
"Documenso production build, jobs in the web process, rate limits bypassed".

### 6.6 The p95 reference

The stop limit is `10 x cases["P6-DOC-LOAD-001"].medianP95Ms` from `k6/thresholds/smoke-p95.json` (**233.131137 ms** at `2db9726`, so the limit is about 2,331 ms), computed at setup and never a constant in code.
The smoke and this journey are the same eight requests; the VM's step-0 p95 (322 ms) is 1.4 times the released median. The report prints the ratio `step 0 p95 / smoke median` and a warning above 2.
**UNPROBED — confirm in the first CI dispatch:** the step-0 p95 / 233.13 ms ratio.

### 6.7 The workflow job (`.github/workflows/knee.yml`, CHANGED)

Add job `documenso-knee`, `timeout-minutes: 60`, `runs-on: ubuntu-24.04`, and add `DOCUMENSO_REF: f4105e47eba56f5d8d7e70dd516a8fcc0c870d7c` to the workflow-level `env:` (same SHA as `perf.yml` line 31 and
`scripts/bootstrap.sh` line 10). The job env is the `documenso-smoke` env verbatim (print it with `sed -n '/^  documenso-smoke:/,/^    steps:/p' .github/workflows/perf.yml`; ten keys at `2db9726`) plus the four
knee inputs (empty by default, Task 2 §6.7 "Inputs"):

```yaml
env:
  P6_WORKING_DIRECTORY: p6
  PRODUCTS_ROOT: ${{ github.workspace }}/products
  DOCUMENSO_CHECKOUT_PATH: products/documenso
  DOCUMENSO_BASE_URL: http://127.0.0.1:3001
  # Harness compose's local placeholder credentials. Not a secret.
  DOCUMENSO_DB_URL: postgres://documenso:password@127.0.0.1:5451/documenso
  INBUCKET_BASE_URL: http://127.0.0.1:9003
  P6_WEBHOOK_HOST: p6-webhook.test
  # Test environment: limiters off (harness passes it through), SSRF allowlist for the receiver.
  DANGEROUS_BYPASS_RATE_LIMITS: "true"
  NEXT_PRIVATE_WEBHOOK_SSRF_BYPASS_HOSTS: p6-webhook.test
  PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: "1"
  KNEE_START_RATE: ${{ inputs.start_rate }}
  KNEE_STEP_RATE: ${{ inputs.step_rate }}
  KNEE_HOLD_SEC: ${{ inputs.hold_sec }}
  KNEE_MAX_STEPS: ${{ inputs.max_steps }}
```

The steps: first the ref guard of Task 2 §6.7 (3) verbatim (`timeout-minutes: 1`), then the 13 `documenso-smoke` steps from the first `actions/checkout` through `Start Documenso (harness up)`, by exact name
(`sed -n '/^  documenso-smoke:/,/name: Start Documenso/p' .github/workflows/perf.yml | rg "^      - (name|uses):"` prints them in this order): `actions/checkout@3d3c42e5… # v7.0.1` (path `p6`),
`Checkout Documenso fork`, `Verify Documenso fork HEAD`, `Verify DOCUMENSO_REF matches bootstrap.sh`, `actions/setup-node@949feb24… # v7.1.0`, `Install P6 dependencies`,
`Install k6 (pinned in .k6-version, checksum-verified)`, `Install Documenso dependencies`, `Prepare harness roots`, `Map the webhook host` (`p6-webhook.test` in `/etc/hosts`),
`Restore Documenso build cache`, `Pull Documenso images (3 tries, 15 s then 30 s)`, `Start Documenso (harness up)`. Every one has a `timeout-minutes` (the table of §9; `documenso-smoke` leaves 11 of them
uncapped, and this job never copies an uncapped step). The build cache is restored here, never saved (`documenso-smoke` saves it on `main`):

```yaml
- uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
  timeout-minutes: 1
  with:
    persist-credentials: false
    path: ${{ env.P6_WORKING_DIRECTORY }}

- name: Checkout Documenso fork
  timeout-minutes: 1
  uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
  with:
    repository: Jayami123/documenso
    ref: ${{ env.DOCUMENSO_REF }}
    path: ${{ env.DOCUMENSO_CHECKOUT_PATH }}
    persist-credentials: false

- name: Verify Documenso fork HEAD
  timeout-minutes: 1
  run: |
    set -euo pipefail
    head="$(git -C "${DOCUMENSO_CHECKOUT_PATH}" rev-parse HEAD)"
    if [ "$head" != "${DOCUMENSO_REF}" ]; then
      echo "::error::Documenso HEAD ${head} does not match DOCUMENSO_REF ${DOCUMENSO_REF}"
      exit 1
    fi

- name: Verify DOCUMENSO_REF matches bootstrap.sh
  timeout-minutes: 1
  run: |
    set -euo pipefail
    if ! grep -q "^DOCUMENSO_REF=\"${DOCUMENSO_REF}\"$" "${P6_WORKING_DIRECTORY}/scripts/bootstrap.sh"; then
      echo "::error::DOCUMENSO_REF in perf.yml does not match scripts/bootstrap.sh"
      exit 1
    fi

# Documenso needs Node 24 (fork engines, harness assert). This job only; the other jobs keep .nvmrc.
- uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
  timeout-minutes: 1
  with:
    node-version: "24.21.0"
    cache: npm
    cache-dependency-path: |
      p6/package-lock.json
      products/documenso/package-lock.json

- name: Install P6 dependencies
  timeout-minutes: 1
  working-directory: ${{ env.P6_WORKING_DIRECTORY }}
  run: |
    set -euo pipefail
    npm ci

- name: Install k6 (pinned in .k6-version, checksum-verified)
  timeout-minutes: 2
  run: |
    set -euo pipefail
    bash "${{ github.workspace }}/p6/scripts/install-k6.sh"

- name: Install Documenso dependencies
  timeout-minutes: 2
  working-directory: ${{ env.DOCUMENSO_CHECKOUT_PATH }}
  run: |
    set -euo pipefail
    npm ci --no-audit --no-fund

- name: Prepare harness roots
  timeout-minutes: 1
  working-directory: ${{ env.P6_WORKING_DIRECTORY }}
  env:
    BOOTSTRAP_SKIP_INSTALL: "1"
  run: |
    set -euo pipefail
    bash scripts/bootstrap.sh documenso

- name: Map the webhook host
  timeout-minutes: 1
  run: |
    set -euo pipefail
    echo "127.0.0.1 ${P6_WEBHOOK_HOST}" | sudo tee -a /etc/hosts >/dev/null
    getent hosts "${P6_WEBHOOK_HOST}" | grep -q '^127\.0\.0\.1 '

- name: Restore Documenso build cache
  timeout-minutes: 1
  id: documenso_build
  uses: actions/cache/restore@55cc8345863c7cc4c66a329aec7e433d2d1c52a9 # v6.1.0
  with:
    path: ${{ env.DOCUMENSO_CHECKOUT_PATH }}/apps/remix/build
    key: ${{ runner.os }}-documenso-build-${{ env.DOCUMENSO_REF }}-h0.2.15

- name: Pull Documenso images (3 tries, 15 s then 30 s)
  id: documenso_pull
  timeout-minutes: 3
  working-directory: ${{ github.workspace }}/p6/node_modules/qa-portfolio-harness/docker
  run: |
    set -euo pipefail
    bash "${{ github.workspace }}/p6/scripts/ci/compose-pull.sh" -p qa-harness-documenso -f documenso.compose.yml

- name: Start Documenso (harness up)
  timeout-minutes: 5
  id: documenso_up
  if: ${{ steps.documenso_pull.outcome == 'success' }}
  working-directory: ${{ env.P6_WORKING_DIRECTORY }}
  run: |
    set -euo pipefail
    SECONDS=0
    npm run up:documenso
    echo "HARNESS_UP_SECONDS=${SECONDS}" >> "$GITHUB_ENV"

- name: Knee P6-DOC-LOAD-005 (knee range, environment-bound)
  id: knee
  if: ${{ steps.documenso_up.outcome == 'success' }}
  timeout-minutes: 15
  working-directory: ${{ env.P6_WORKING_DIRECTORY }}
  run: |
    set -euo pipefail
    status=0
    npm run load:documenso-knee -- --profile full || status=$?
    # exit 3 is INVALID: shown in the summary, excluded from the knee statistics (P6-RULE-005), the job stays green
    if [ "$status" -eq 3 ]; then echo "::warning::knee run INVALID (see the job summary)"; status=0; fi
    exit "$status"

- name: Job summary (knee table and seal lag table)
  if: ${{ !cancelled() }}
  timeout-minutes: 2
  working-directory: ${{ env.P6_WORKING_DIRECTORY }}
  run: node scripts/write-ci-job-summary.ts

- name: Token scan of the knee results
  id: token_scan
  if: ${{ !cancelled() }}
  timeout-minutes: 2
  working-directory: ${{ env.P6_WORKING_DIRECTORY }}
  run: node scripts/evidence-token-scan.mjs results/load

- uses: actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2
  if: ${{ !cancelled() && steps.token_scan.outcome == 'success' }}
  timeout-minutes: 3
  with:
    name: knee-documenso
    path: ${{ env.P6_WORKING_DIRECTORY }}/results/load/
    if-no-files-found: warn
    retention-days: 90

- name: Stop Documenso (harness down)
  if: ${{ always() }}
  timeout-minutes: 1
  working-directory: ${{ env.P6_WORKING_DIRECTORY }}
  run: |
    set -euo pipefail
    npm run down:documenso || true
```

`DANGEROUS_BYPASS_RATE_LIMITS` is `"true"` in the job env exactly as in `documenso-smoke`; the job never sets it to `false` (that is the Task 6 job; a pre-set `false` wins over the harness `||=`).
**Artefact name and kinds:** `knee-documenso` holds `verdict.json`, `run-meta.json`, `k6-main-summary.json`, `k6-main.log` (the intent lines), `telemetry-main.{json,csv}`, `chart-main.html`,
`knee-report-main.{json,md}`, `pipeline-lag.json`, `audit.json`: all among the kinds the release allowlist keeps (`json log csv html txt`, `evidence-release.yml` line 140); `k6-main.json.gz` stays in the Actions
artefact only. Documenso has no `pk_` key (the API token travels in `ctx.secrets` and the k6 environment only), so the gitleaks scope (PR #68) is not involved. Retention is 90 days and the run is released after
PRE-3 (Task 2 Q6). Every action is pinned by SHA as in `perf.yml`. The job runs on `workflow_dispatch` only, on `main` (the guard), never on pull requests.

## 7. Oracles and assertions

(1) The **post-load audit**: every completed envelope sealed exactly once (`SEAL_JOBS_SQL`), the completion audit row once (`DOCUMENT_COMPLETED_AUDIT_SQL`), no stuck jobs after the drain, a double seal counted
under `P6-OBS-DOC-002`, and per intent (Task 1 §6.8, §6.4 here): no ghost or duplicate document, an `ok` intent has exactly one `COMPLETED` document, a `fail` intent none, only indeterminate intents may leave an
unfinished document (at most `interrupted` of them). (2) The **pipeline stage** on completed documents: each stage reached exactly once, lags under the 30 s contract, backlog drained. (3) The **leak check**
after the cleanup (`leakCounts`). (4) The **knee contract**: a KNEE report with a range, stop reason, first saturated resource, per-step lag table and lag marker, or NO_KNEE/INVALID with its reason.

**PRODUCT BUG vs TEST BUG.** A completed document without a seal, a double seal in a sequential journey (beyond the known pair bug), a duplicate webhook or email, a stuck job after the drain, an unfinished
document of an `ok` or `fail` intent, a duplicate or ghost document, or a 5xx before the rule trips would be `PRODUCT BUG (SUSPECTED)` with the run link, labelled only by the owner after repeated full-count
runs (rule 13). The unfinished documents of indeterminate intents, a plan that ends without a stop, a stale join key, or more indeterminate intents than `interrupted` are TEST BUG or INVALID. **No
`PRODUCT BUG (SUSPECTED)` was found by this probe** (the reset in §3.1 is one event, listed there). No expected-failure marker, no skip.

## 8. Data isolation, cleanup, leak check

Prefix: `caseDataPrefix(runPrefix, "P6-DOC-LOAD-005")`; document titles `iterationId(prefix, n) journey`, recipients
`<iterationId>-r<i>@example.com`. The per-run account, API token and webhook are made by `documensoSetup` and removed by `documensoCleanup`
(envelope deletes found by prefix, webhook, token, account); a failure is a TEST BUG line, the sweep continues, the leak check runs last.
Cleanup is 65 ms per document (§3.2). The API token travels in `ctx.secrets` and the k6 environment only; the token scan runs in the
`tokenScan` stage and the workflow step.

## 9. CI, token scan, budget

Job `documenso-knee`, own timeout **60 minutes**, `workflow_dispatch` only. Durations of the copied setup steps are the maximum over the 52 successful `documenso-smoke` runs on `main` (3 dispatch: 40177412186,
40178773022, 40180625279; 6 pull request; 43 push; `https://api.github.com/repos/Jayami123/k6-load-concurrency-suite/actions/runs/<run id>/jobs`).

| step name (as in YAML)                                 | timeout-minutes | estimate (source)                                                                                     | 80 % stop | runs on this event?                             |
| ------------------------------------------------------ | --------------- | ----------------------------------------------------------------------------------------------------- | --------- | ----------------------------------------------- |
| Stop unless dispatched from main                       | 1               | UNPROBED (a shell test; expect < 1 s)                                                                 | 48 s      | workflow_dispatch                               |
| `actions/checkout@3d3c42e5…` (path `p6`)               | 1               | 2 s (max of 52 `documenso-smoke` runs)                                                                | 48 s      | workflow_dispatch                               |
| Checkout Documenso fork                                | 1               | 5 s (same)                                                                                            | 48 s      | workflow_dispatch                               |
| Verify Documenso fork HEAD                             | 1               | 1 s (same)                                                                                            | 48 s      | workflow_dispatch                               |
| Verify DOCUMENSO_REF matches bootstrap.sh              | 1               | 1 s (same)                                                                                            | 48 s      | workflow_dispatch                               |
| `actions/setup-node@949feb24…`                         | 1               | 15 s (same)                                                                                           | 48 s      | workflow_dispatch                               |
| Install P6 dependencies                                | 1               | 9 s (same)                                                                                            | 48 s      | workflow_dispatch                               |
| Install k6 (pinned in .k6-version, checksum-verified)  | 2               | 2 s (same)                                                                                            | 96 s      | workflow_dispatch                               |
| Install Documenso dependencies                         | 2               | 57 s (same)                                                                                           | 96 s      | workflow_dispatch                               |
| Prepare harness roots                                  | 1               | 1 s (same)                                                                                            | 48 s      | workflow_dispatch                               |
| Map the webhook host                                   | 1               | 1 s (same)                                                                                            | 48 s      | workflow_dispatch                               |
| Restore Documenso build cache                          | 1               | 5 s (same)                                                                                            | 48 s      | workflow_dispatch                               |
| Pull Documenso images (3 tries, 15 s then 30 s)        | 3               | 19 s (same)                                                                                           | 144 s     | workflow_dispatch                               |
| Start Documenso (harness up)                           | 5               | 224 s (same; the dispatch runs: 41 s)                                                                 | 240 s     | workflow_dispatch                               |
| Knee P6-DOC-LOAD-005 (knee range, environment-bound)   | 15              | UNPROBED on the runner: VM about 4.0 min worst (1,080 documents: k6 4.3 + pipeline 0.9 + cleanup 1.2) | 12 min    | workflow_dispatch (if `documenso_up` succeeded) |
| Job summary (knee table and seal lag table)            | 2               | 1 s (`documenso-smoke` summary step, same runs)                                                       | 96 s      | workflow_dispatch                               |
| Token scan of the knee results                         | 2               | 0 s (`documenso-smoke` token scan, same runs)                                                         | 96 s      | workflow_dispatch                               |
| `actions/upload-artifact@cf430e03…` (`knee-documenso`) | 3               | 6 s (`documenso-smoke` upload steps, same runs)                                                       | 144 s     | workflow_dispatch                               |
| Stop Documenso (harness down)                          | 1               | 2 s (same runs)                                                                                       | 48 s      | workflow_dispatch                               |

Sum of the step caps: 1 + 1 + 1 + 1 + 1 + 1 + 1 + 2 + 2 + 1 + 1 + 1 + 3 + 5 + 15 + 2 + 2 + 3 + 1 = **45 min**. Job timeout **60**. 60 − 45 = **15 ≥ 10**. No range, no cache-save allowance (the job only restores). If the first
dispatch shows the knee step above 12 minutes (80 % of 15) or any step above 80 % of its cap, that is a stop and report; the fix is a shorter hold or fewer steps, never a higher cap or timeout. **Cold path:** a
Documenso build-cache miss makes `Start Documenso` a production build and trips its 5-minute cap; that is a visible failure, not a silent one; the owner re-runs after a `documenso-smoke` push has warmed the
cache. No existing job changes; no existing timeout is raised. A dispatch costs about 7 runner minutes (three: 21).

## 10. Expected output

```text
$ npm run load:documenso-knee -- --profile pr
P6-DOC-LOAD-005 (knee range, environment-bound) run 20261025T120000Z-3fa9c0d1
  setup        ok   smoke p95 reference 300 ms; account, token, webhook
  k6 main      exit 99  steps 0..2 of 3  (stop rule: p95 >= 3000 ms)  or  exit 0, no stop
  knee         KNEE between step 1 (2/s) and step 2 (3/s); stop: p95; first saturated: app_cpu (step 2); lag marker: none
  reconcile    ok   sealed once: 61 completed; intents 63 started, 61 ok, 2 indeterminate (1 unfinished document); pipeline: 61 documents, 0 missing, drained in 18 ms
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
| 2    | `feat(load): map documenso envelopes to intents`                   | `src/load/knee/doc-intents.ts tests/unit/knee-doc-intents.test.ts`                             | exit 0, **B4 + 7**                                                                                          |
| 3    | `feat(load): judge only completed documents in a knee run`         | `src/load/pipeline-stage.ts tests/unit/pipeline-knee.test.ts`                                  | exit 0, **B4 + 10**; the existing pipeline tests unchanged                                                  |
| 4    | `feat(k6): add the documenso knee script`                          | `k6/cases/doc-load-005.js k6/cases/doc-load-005.example.json k6/journeys/doc-sign.js`          | exit 0, B4 + 10; `k6 inspect` ok                                                                            |
| 5    | `feat(load): add the documenso knee case`                          | `src/load/cases.ts src/load/knee/stage.ts package.json tests/unit/load-cases-doc-knee.test.ts` | exit 0, **B4 + 13**; `npm run load:documenso-knee -- --profile pr` against a started Documenso exits 0 or 3 |
| 6    | `ci(knee): add the documenso job to the knee workflow`             | `.github/workflows/knee.yml`                                                                   | exit 0 (actionlint silent), B4 + 13                                                                         |
| 7    | `docs: describe the documenso knee and seal lag`                   | `README.md`                                                                                    | exit 0, B4 + 13                                                                                             |

New unit tests by name (13): `knee-lag-by-step` (5: documents bucket by last signature into hold windows and a ramp-window signature is in no step; unfinished documents are in no bucket; nearest-rank
p50/p95/max per stage per step; the lag marker is the first step at or above 10 times the step-0 seal p95 and steps under 20 documents are skipped; an empty step yields empty percentiles);
**`knee-doc-intents` (2: `docIntentOf` maps `<prefix>-i<n> journey` to `n` and rejects another prefix, another suffix and a non-numeric leaf; `docRowsByIntent` counts envelopes per intent, splits
completed from unfinished, and counts a title of no intent as a ghost row)**; `pipeline-knee` (3: in knee mode the unfinished documents of indeterminate intents do not raise "missing"; an unfinished document of an
`ok` intent, one of a `fail` intent and one of no started intent are `PRODUCT BUG` lines with the intent number and both counts; completed documents still fail on a missing stage, a duplicated webhook and a double
seal counted under `P6-OBS-DOC-002`); `load-cases-doc-knee` (3: the case and its run (`allowExits [0, 99]`, `secretEnv DOCUMENSO_API_TOKEN`, `maxVUs 200`) and telemetry product `documenso`; `package.json` has the
script; the example config has the keys the script reads and no token). Count 5 + 2 + 3 + 3 = **13**; steps 1 → +5, 2 → +2, 3 → +3, 5 → +3. The workflow file has no unit test (`actionlint` is part of
`npm run check`); its cap table of §9 is checked by hand with the script of PRE-2 §4.

After step 7: push, `gh pr create` (rule 3), CI once (rule 15). The PR runs only the product-free job of Task 1 (a new job in `knee.yml` is dispatchable only after the merge). After the owner merges, the
owner dispatches `knee.yml` three times on `main` (§14).

## 13. Risks, proposed extras, open decisions

| ID  | Risk                                                           | Mitigation                                                                                                                               |
| --- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | The seal work makes steps slow and moves the knee between runs | the report is a range per run, min and max over runs                                                                                     |
| R2  | Drain longer than the job allows                               | measured 1.5 s; the 30 s contract is a PRODUCT BUG with job ids when broken                                                              |
| R3  | A transport reset under overload is read as saturation         | 1 in 3,196 is under the 1 % rule; the report lists transport errors separately                                                           |
| R4  | The limiter profile leaks into this job                        | the job sets `DANGEROUS_BYPASS_RATE_LIMITS: "true"` exactly as `documenso-smoke` and never `false`; the environment line says "bypassed" |
| R5  | The pipeline join is 0.05 s per document                       | counted in §9 (54 s at the default plan's worst case)                                                                                    |

**Contradictions with the roadmap.**

| #   | Roadmap says                                                       | Probe shows                                                                          | Effect                                                                                                        |
| --- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| C1  | "audit: one seal per document, no stuck jobs after drain"          | a stopped run leaves unfinished documents the Phase 3 pipeline stage calls "missing" | knee mode judges completed documents; unfinished documents per intent, only indeterminate ones allowed (§6.4) |
| C2  | "`ALREADY_SIGNED` … are conflicts" (Task 1 note)                   | a 200 by design (README)                                                             | no conflict class for Documenso                                                                               |
| C3  | "per held step, completion → seal lag from the Phase 3 stage join" | the join gives per-document lag; steps come from the last-signature time             | `lagByStep` (§6.3)                                                                                            |
| C4  | knee workflow or `perf.yml`                                        | as Task 2                                                                            | job in `knee.yml`                                                                                             |

**Proposed extras (out of scope until accepted; new IDs).** (`P6-DOC-LOAD-010` is already proposed by Phase 3 Task 9; the next free numbers are used here.)

- `P6-DOC-LOAD-014`: a lag rule alongside D2 (stop when the seal-lag p95 reaches 10 times the step-0 value), with evidence from three
  runs, if the owner wants "lag first" to end a run (D2 keeps the HTTP rule only).
- `P6-DOC-LOAD-015`: the same knee with the jobs provider moved out of the web process (needs a harness change; Phase 5).

**Decisions (owner, 2026-10-25).**

- **Q1. Default plan.** Decided (owner, 2026-10-25): (a) start 1, step 1, hold 30 s, 8 steps — the VM knee is at step 3 of 8; 1,080 documents at most.
  Options considered: (a) start 1, step 1, hold 30 s, 8 steps; (b) start 1, step 2.
- **Q2. Lag is reported, not a stop condition.** Decided (owner, 2026-10-25): (a) as D2 — the HTTP rule tripped first in the probe, the lag stayed under 4 s.
  Options considered: (a) as D2; (b) add the `P6-DOC-LOAD-014` rule.
- **Q3. Unfinished documents of a stopped run.** Decided (owner, 2026-10-25): per intent — only indeterminate intents may leave an unfinished document, matched by title `<prefix>-i<n> journey`; an `ok`
  intent with an unfinished document is a finding. Reason: a count bound (`unfinished <= interrupted`) would let duplicate or ghost documents pass unseen (Task 1 §6.8). UNPROBED — confirm in first CI
  dispatch: the indeterminate count against `interrupted` (the VM had 27 to 36 unfinished).
  Options considered: (a) judge completed documents and bound the unfinished by `interrupted` (the old default); (b) cancel in-flight work before the audit; (c) per intent. Evidence: 27 to 36 unfinished per probe run.
- **Q4. The smoke reference.** Decided (owner, 2026-10-25): (a) the `P6-DOC-LOAD-001` median 233.13 ms from `k6/thresholds/smoke-p95.json`; UNPROBED — confirm in first CI dispatch: the step-0 p95 / 233.13 ratio.
  Options considered: (a) the shipped median; (b) re-measure step 0. Evidence: the VM's step-0 p95 is 1.4 times the released median.

## 14. Done when (roadmap, made measurable)

- [ ] `npm run check` exit 0 with **B4 + 13** unit tests; `k6 inspect` lists the new script.
- [ ] 3 VALID `workflow_dispatch` runs of `knee.yml` (job `documenso-knee`) on `main`, each with a KNEE report (range, stop reason, first
      saturated resource), the per-step seal-lag table and which came first (HTTP or lag), a drained backlog, a clean per-intent audit (one seal per
      completed document, unfinished documents only for indeterminate intents) or a recorded product bug under its ID (`P6-OBS-DOC-002` counted separately); the three ranges and their spread in
      the job summaries.
- [ ] Run ids and `run-meta.json` listed; INVALID runs listed with reasons and excluded.
- [ ] README says "knee range" and carries the label "Documenso production build, jobs in the web process, rate limits bypassed"; no VM
      number appears.

## 15. Rule 20 self-check

- (a) Roadmap "Done when": ≥ 3 VALID runs with range, per-step seal lag, stop reason, resource, drained backlog, clean audit: §14. Gap:
  runner values (§3.6).
- (b) Existing names grepped on `main` at `2db9726`: `k6/journeys/doc-sign.js` (`runDocSign`), `k6/cases/doc-load-002.js`,
  `src/load/products/documenso.ts` (`makeDocumensoSetup`, `documensoCleanup`), `src/load/pipeline-lag.ts` (`joinStages`, `summariseLag`,
  `STAGES`), `src/load/pipeline-stage.ts` (`PIPELINE_DOCUMENTS_SQL`, `readPipelineInput`, `evaluatePipeline`, `makePipelineStage`, `CONTRACT_MS`, `pipelineStage`),
  `src/load/reconcile/documenso.ts`, `src/documenso/run-case.ts`, `.github/workflows/perf.yml` (`documenso-smoke`), `src/load/smoke-baseline.ts`. NEW here with skeletons:
  §6.1. From Tasks 1, 2: the names in §4.
- (c) CI time: §9 (exact table, 45 min of caps in a 60-minute timeout, margin 15); no existing timeout raised.
- (d) Skeletons §6; steps with `git add` paths, subjects and expected output §12.
- (e) Every owner answer is recorded in "Decisions (owner, 2026-10-25)" (§13); Q3 is the override.
