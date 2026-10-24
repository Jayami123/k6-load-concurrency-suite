# P6 Phase 3 Task 9: Documenso pipeline lag and webhook retry (`P6-DOC-LOAD-002`, `P6-DOC-LOAD-008`) (plan only)

This is the plan a weaker model builds from. It changes nothing in the repo. Structure follows
[docs/reference/p1-plan-example-medusa.md](../reference/p1-plan-example-medusa.md). Scope source: roadmap
[2026-10-22-p6-phase3-roadmap.md](2026-10-22-p6-phase3-roadmap.md) (on `origin/plan/2026-10-22-p6-phase3`), "Task 9", D1, D5, D9.

**Interfaces assumed from the other Phase 3 plans** (must match the merged code at build time, §5 check 3): Task 3 (`LoadCase`, `Stage`, `StageResult`, `runLoad`, `parseK6Summary`, `caseDataPrefix`, `runJourney`, `openModelScenario`, `standardOptions`), Task 4 (`judgeValidity`, `checkReadiness`, `load-table`), Task 6 ([task6](2026-10-24-p6-phase3-task6-load-reconciliation.md): `evaluateDocumensoAudit`, `waitForDrain` with the 30 s drain contract, `composeStages`, counter `p6_docs_completed`, `knownBugs["P6-OBS-DOC-002"]`), Task 7 ([task7](2026-10-24-p6-phase3-task7-journey-smokes.md): `k6/journeys/doc-sign.js` `runDocSign`, `src/load/products/documenso.ts` `documensoSetup`/`documensoCleanup`, `LoadContext.secrets` and `LoadContext.handles.documensoRun`).

## 1. Header

- **Task.** Phase 3 Task 9. Cases: `P6-DOC-LOAD-002` (P0), `P6-DOC-LOAD-008` (accepted extra 2026-10-22; gate passed, §3.5).
- **Plan branch.** `plan/2026-10-24-p6-phase3-plans` (no PR, never deleted).
- **Build branch (pattern).** `feat/<build date>-p6-doc-load-pipeline-lag`.
- **Base.** `origin/main` = `5acd2a0`, plus Tasks 3 to 7 merged (Task 8 is independent).
- **Harness pin.** Unchanged.
- **Environment change.** None.
- **Unit tests.** B = count on main when the build starts (today's chain: 719 after Tasks 1 to 8). This plan adds **+24** (§12); expected B + 24 (**743** today). Chain in merge order: 471 -> T1 481 -> T2 503 -> T3 554 -> T4 597 -> T5 653 -> T6 686 -> T7 702 -> T8 719 -> T9 743 -> T10 777. If Task 8 is not merged first the deltas still hold.
- **Owner decisions taken (2026-10-24, recorded, not open).** D5 amended (Medusa only, Task 7). Q1 accept the 30 s drain and per-stage contracts. Q2 **no label yet** for the no-backoff webhook retry; if it is labelled later the id is `P6-OBS-DOC-004` (`-003` is taken), and only after `P6-DOC-LOAD-010` repeats three times (rule 13). Q3 yes, `-008` runs on PRs too, with the Documenso LOAD step caps of §10. All closed in §13.
- **Stop for owner review.** Yes (rule 10): `perf.yml` steps added.

## 2. What it proves

- **`P6-DOC-LOAD-002`.** At a steady rate of sequential document completions, every document reaches every pipeline stage exactly once (sealed, webhook job done, webhook call recorded, receiver delivery, completion email), the stage lag is measured per document, and the backlog drains within a recorded contract after the load stops. In-process jobs competing with requests is a finding, not a test bug.
- **`P6-DOC-LOAD-008`.** When the subscriber's endpoint fails the first delivery of each event, Documenso retries and exactly one delivery per event is accepted; `WebhookCall` shows the failed and the successful attempt and the document is unaffected.
- **Finance and healthcare.** "A queue that fills must drain": the same check as settlement jobs after a payments spike or lab-result notifications after a clinic's morning peak; and a notification that fails once must arrive once, not never and not twice.

## 3. Live probe evidence

Probe date 2026-10-24 (UTC), cloud VM (Node v22.23.3 runner, Documenso under `/opt/node24` v24.21.0, 4 vCPU, 16 GB), k6 2.3.0, Documenso started with `npm run up:documenso`, stopped with `down`. Timings are **VM, proof only**; the lag numbers are never published (AGENTS.md: only Actions medians are).

### 3.1 Stage timestamps and clocks (probe item 3)

For one journey (create, distribute, both sign, complete) these rows and times exist, all on the host clock (the database runs in UTC in a container that shares the host kernel clock; the runner receiver stamps `Date.now()`):

| Stage                 | Source                                                                                                                               | Timestamp column                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| last recipient signed | `completeDocumentWithToken` response time in k6 (also `Envelope.updatedAt` of the recipient row)                                     | k6 `Date.now()` after the response                                      |
| envelope completed    | `Envelope.completedAt` (`status = COMPLETED`)                                                                                        | `timestamptz`                                                           |
| seal done             | `BackgroundJob` `jobId = 'internal.seal-document'`, `payload->>'documentId'` (`SEAL_JOBS_SQL`)                                       | `submittedAt`, `completedAt`                                            |
| webhook job done      | `BackgroundJob` `jobId = 'internal.execute-webhook'`, `payload->'data'->>'id'` (`WEBHOOK_JOBS_SQL`)                                  | `submittedAt`, `completedAt`                                            |
| webhook call recorded | `WebhookCall` by `webhookId` (`WEBHOOK_CALLS_SQL`)                                                                                   | `createdAt`; also `status`, `responseCode`                              |
| receiver arrival      | the runner receiver (`startWebhookReceiver`)                                                                                         | `receivedAt` (epoch ms)                                                 |
| completion email      | `BackgroundJob` `jobId = 'send.document.completed.emails'`, `payload->>'envelopeId'` (`EMAIL_JOBS_SQL`); and the message in Inbucket | job `completedAt`; message `date` (ISO, nanoseconds) and `posix-millis` |

Median stage latencies at 1 document per second, relative to the last signature response (VM, 1 per second run): `Envelope.completedAt` **+260 ms**, webhook job done **+285 ms**, seal job done **+439 ms**, email job done **+467 ms**. All 258 envelopes of the probe session ended `COMPLETED` with exactly one seal job and one `DOCUMENT_COMPLETED` audit row each (`stuck = 0`).
Clock check: the database timezone is UTC and the container shares the host kernel clock; build-time probe must confirm the offset between database `now()` and host `Date.now()` (read twice, back to back; §5 check 7). The Task 5 marker server measures the offset for the run (`run-meta.json`), so a skewed clock is reported as INVALID there, and this plan's joins use database and receiver stamps only after that check.

### 3.2 Fixed rate and backlog (probe item 1)

From Task 7 §3.3: 0.5, 1 and 2 documents per second drop nothing (iteration median 0.69 s at 1 per second, 0.84 s at 2); 5 per second drops 15 of 100 and the number of jobs in flight reaches 46; 10 per second drops 106. **Fixed rate 1 per second** (a fifth of the first dropping rate). At that rate the backlog stays bounded (every run ended with all envelopes `COMPLETED` and nothing stuck), and the drain after the last request was **≤ 3 s** in every run (0.5, 1, 2 per second ≤ 2 s; 5 and 10 per second about 3 s).

### 3.3 The drain contract (probe item 3, drain)

Measured drain: at most 3 s after the last completion, at rates up to 10 per second (which already drops iterations). The **contract is 30 s** (10× the worst measured), the value Task 6 uses for `waitForDrain`; a drain that takes longer is a PRODUCT BUG with the pending job ids as evidence (not a timeout of the harness). The per-document stage contract is the same 30 s: a stage that is not reached 30 s after the envelope completed is "missing".
Recorded for the report, not asserted: p50/p95/max of each stage lag. A lag threshold would be a performance claim (D1 and AGENTS.md forbid publishing it from the VM), so the only asserted time bounds are the 30 s contracts.

### 3.4 Where the receiver runs (probe item 3)

Phase 1 runs the receiver inside the Playwright test process; `documensoSetup` of Task 7 (`startRun`) already creates it inside the runner process (`src/load/run-load.ts`) and registers the webhook the way `startRun` does today. In the probe, webhook calls recorded equalled documents (258 of 258) and the receiver saw 258 deliveries. So the receiver stays in the runner process; k6 never talks to it.

### 3.5 Gate for `P6-DOC-LOAD-008`: does Documenso retry a failed delivery? PASSES (probe item 2)

Using a receiver that answers 500 to the first delivery of each event (a throwaway variant of `startWebhookReceiver`), 10 documents:

```text
fail-first (500, then 200):  per event 2 deliveries; WebhookCall rows FAILED (responseCode 500) then SUCCESS (200); execute-webhook job retried=1, status COMPLETED; document COMPLETED, sealed once
fail-always (500 every time): 4 attempts per event (1 + 3 retries), about 11 to 16 ms apart; WebhookCall rows FAILED ×4; execute-webhook job FAILED, retried=3, maxRetries=3; the document is still COMPLETED, seal 1
```

The gate (Documenso retries a failed delivery at `DOCUMENSO_REF`) **passes**: up to 3 retries, recorded as one `WebhookCall` row per attempt, job `retried` increments. The local jobs provider retries **immediately, with no backoff** (11 to 16 ms between attempts); against an endpoint that is down for a few seconds all four attempts are burnt at once and the event is lost for good. That is a design observation, not a correctness bug under this task (the document is unaffected, the failure is recorded); §13 proposes a label for the owner to decide.

### 3.6 Facts that change the roadmap text

- The roadmap says the receiver is "after Phase 2 Task 4"; the current `src/receivers/webhook-receiver.ts` always answers 200 (line 79), so `-008` needs a **responder option** (`respond?: (delivery, index) => number`) in `startWebhookReceiver`. One additive parameter; the default behaviour does not change.
- `P6-OBS-DOC-002` (double seal) is a parallel-completion bug; the journeys complete sequentially, so a double seal in these runs is new evidence: Task 6 reports it under `knownBugs` and `unexpected`, and (owner decision, Task 6 Q1) an `unexpected` entry fails the run as `PRODUCT BUG (SUSPECTED)` (§7).

### 3.7 What the probe could not confirm ("build-time probe must confirm")

1. The join keys from a delivery body and an Inbucket message back to the document (the body carries the document under `payload`; which field to use is confirmed with one `console.log` of key names, no values, at build time, §5 check 6).
2. The fixed rate and the 30 s contracts on the GitHub runner (three dispatch runs before merge).
3. The lag at the PR profile (10 s): the probe ran 20 s runs.

## 4. Depends on earlier plans

The interface list above, plus from `main`: `src/documenso/oracle.ts` (`SEAL_JOBS_SQL`, `EMAIL_JOBS_SQL`, `WEBHOOK_JOBS_SQL`, `WEBHOOK_CALLS_SQL`, `readWebhookCalls`, `readSealJobs`, `readTerminalJobs`, `DOCUMENT_COMPLETED_AUDIT_SQL`), `src/documenso/inbucket.ts`, `src/documenso/run-case.ts` (`startRun`, `endRun`, `RunContext`), `src/receivers/webhook-receiver.ts` (`startWebhookReceiver`, `headerSecretCheck`, `parseDelivery`), `src/oracles/pg.ts`.

## 5. Build-time recheck

| #   | Check                      | Command                                                                                                                                                | Expected                                                                                                    |
| --- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| 1   | Base                       | `git fetch origin main && git log -1 --format=%h origin/main`                                                                                          | descendant of `5acd2a0`                                                                                     |
| 2   | Baseline                   | `export PATH="/usr/local/bin:$PATH"; npm run check`                                                                                                    | exit 0, `# tests` = B (719 once Tasks 1 to 8 are merged)                                                    |
| 3   | Task 7 names               | `grep -n "export function runDocSign\|export async function documensoSetup\|p6_docs_completed" k6/journeys/doc-sign.js src/load/products/documenso.ts` | found; otherwise stop and report                                                                            |
| 4   | Receiver default           | `grep -n "writeHead(200" src/receivers/webhook-receiver.ts`                                                                                            | one hit, status 200 constant (the responder option replaces it)                                             |
| 5   | Retry behaviour at the ref | the §3.5 fail-first probe on the VM, 5 documents                                                                                                       | per event: FAILED then SUCCESS, `retried=1`; if not, `-008` moves to "Later" with the evidence              |
| 6   | Join keys                  | one document: print the key names (not values) of the receiver body and of the Inbucket message                                                        | a document identifier is present in both; adapt `joinStages` keys                                           |
| 7   | Stage contract             | the case once on the VM (`npm run load:documenso-pipeline -- --profile pr`)                                                                            | every stage reached for every document; drain ≤ 30 s; database `now()` minus host `Date.now()` within 50 ms |

## 6. Design

### 6.1 File tree

```text
src/receivers/webhook-receiver.ts           CHANGED  startWebhookReceiver({ publicHost, check, respond? }); deliveries record `status` answered
src/load/pipeline-lag.ts                    NEW      joinStages (pure), summariseLag (pure), pipelineStage (reads DB, receiver, Inbucket)
src/load/webhook-retry.ts                   NEW      judgeWebhookRetry (pure) for -008
src/load/products/documenso.ts              CHANGED  documensoSetup({ webhookMode: "ok" | "fail-first" })
src/load/pipeline-table.ts                  NEW      formatPipelineRows (job-summary rows)
src/load/cases.ts                           CHANGED  + DOC_LOAD_002, DOC_LOAD_008
k6/cases/doc-load-002.js, doc-load-008.js   NEW      same journey as Task 7 (sequential completion); example JSON next to each
package.json                                CHANGED  + load:documenso-pipeline, load:documenso-webhook-retry
.github/workflows/perf.yml                  CHANGED  + two LOAD steps in documenso-smoke
README.md                                   CHANGED  + case rows, standalone commands
tests/unit/webhook-receiver-respond.test.ts, pipeline-lag.test.ts, pipeline-table.test.ts, webhook-retry.test.ts   NEW
```

### 6.2 The receiver responder (`src/receivers/webhook-receiver.ts`)

```ts
export type Responder = (delivery: WebhookDelivery, index: number) => number; // returns the HTTP status to answer; optional
export async function startWebhookReceiver(opts: {
  publicHost: string;
  check: SecretCheck;
  respond?: Responder;
}) {
  // ...unchanged...
  // inside req.on("end"): const d = parseDelivery(...); const status = opts.respond ? opts.respond(d, deliveries.length) : 200;
  //   deliveries.push({ ...d, status }); res.writeHead(status, ...); res.end(status === 200 ? '{"ok":true}' : '{"ok":false}');
}
/** -008: 500 for the first delivery of each event key, 200 afterwards. Pure given its Map. */
export function failFirstPerEvent(keyOf: (d: WebhookDelivery) => string): Responder;
```

`WebhookDelivery` gains an **optional** `status?: number` (the status answered; 200 when no responder is given). The `respond` option is optional with default 200, so every existing caller and `tests/unit/receivers-webhook-receiver.test.ts` stay unchanged and green (that file is not edited; the new tests live in `tests/unit/webhook-receiver-respond.test.ts`, which covers the default answer and a non-200 answer). The event key is `event + ":" + payload document id`, taken from the parsed body.

### 6.3 `joinStages` and `summariseLag` (`src/load/pipeline-lag.ts`, pure)

```ts
export interface StageInput {
  documents: {
    documentId: number;
    envelopeId: string;
    completedAtMs: number | null;
    lastSignedMs: number | null;
  }[];
  sealJobs: { documentId: number; status: string; completedAtMs: number | null }[];
  webhookJobs: {
    documentId: number;
    status: string;
    retried: number;
    completedAtMs: number | null;
  }[];
  webhookCalls: {
    documentId: number;
    status: string;
    responseCode: number | null;
    createdAtMs: number;
  }[];
  deliveries: { documentId: number; receivedAtMs: number; status: number }[];
  emailJobs: { envelopeId: string; status: string; completedAtMs: number | null }[];
  emails: { envelopeId: string; postedMs: number }[];
}
export type Stage =
  "completed" | "seal" | "webhookJob" | "webhookCall" | "receiver" | "emailJob" | "email";
export interface DocumentLag {
  documentId: number;
  reached: Record<Stage, boolean>;
  lagMs: Partial<Record<Stage, number>>;
  counts: { seal: number; webhookJob: number; receiverOk: number; emailJob: number };
}
export function joinStages(input: StageInput): DocumentLag[]; // lag = stage time - lastSignedMs
export function summariseLag(
  docs: DocumentLag[],
  contractMs: number,
): {
  documents: number;
  missing: Record<Stage, number>;
  duplicated: Record<string, number>;
  p50: Partial<Record<Stage, number>>;
  p95: Partial<Record<Stage, number>>;
  max: Partial<Record<Stage, number>>;
  overContract: number;
};
```

The stage `pipelineStage(ctx)` (reads through the read-only pool, the run's receiver from `ctx.handles.documensoRun`, `src/documenso/inbucket.ts`):

1. wait for the drain (Task 6 `waitForDrain`, 30 s contract); record `drainMs` and `drained`.
2. query the rows of §3.1 for every envelope of the prefix, call `joinStages`, `summariseLag(…, 30_000)`.
3. write `pipeline-lag.json` (counts, ids, milliseconds; no emails, no tokens, no titles) and return `ok: false, kind: "PRODUCT BUG"` for the violations of §7, and `data.pipeline` for the summary.

### 6.4 `judgeWebhookRetry` (`src/load/webhook-retry.ts`, pure)

```ts
export interface RetryInput {
  events: number;
  deliveries: { eventKey: string; status: number }[];
  calls: { eventKey: string; status: string; responseCode: number | null }[];
  jobs: { eventKey: string; status: string; retried: number }[];
  completedEnvelopes: number;
  documents: number;
}
export function judgeWebhookRetry(i: RetryInput): {
  ok: boolean;
  findings: { check: string; ok: boolean; kind?: "PRODUCT BUG" | "TEST BUG"; detail: string }[];
};
```

Per event: `deliveries` = exactly one with status 500 followed by exactly one with 200; `calls` = one `FAILED` (response 500) and one `SUCCESS` (200); the job `COMPLETED` with `retried == 1`; all documents `COMPLETED`. Details are numbers only.

### 6.5 Cases and scripts

```ts
export const DOC_LOAD_002: LoadCase = { id: "P6-DOC-LOAD-002", title: "Documenso pipeline lag at a steady rate", product: "documenso", label: "functional load, not capacity",
  profiles: { pr: { rate: 1, durationSec: 10, maxLatencyMs: 3000 }, full: { rate: 1, durationSec: 30, maxLatencyMs: 3000 } },
  runs: () => [{ label: "main", script: "k6/cases/doc-load-002.js", env: {}, secretEnv: ["DOCUMENSO_API_TOKEN"] }],
  stages: { setup: documensoSetup({ webhookMode: "ok" }), reconcile: composeStages([documensoAuditStage, pipelineStage]), cleanup: documensoCleanup } };
export const DOC_LOAD_008: LoadCase = { ...same shape, id: "P6-DOC-LOAD-008", title: "Webhook retry delivers exactly once after a first failure",
  stages: { setup: documensoSetup({ webhookMode: "fail-first" }), reconcile: composeStages([documensoAuditStage, webhookRetryStage]), cleanup: documensoCleanup } };
```

`k6/cases/doc-load-002.js` and `-008.js` are the Task 7 case script with the tags changed; the journey is Task 7's `runDocSign` (sequential completions). `documensoSetup` becomes a factory taking `{ webhookMode }` (Task 7 passes `"ok"`): `"fail-first"` passes `respond: failFirstPerEvent(...)` to the receiver. For `-008` the audit expects `webhookJobs` with `retried == 1`, which `documensoAuditStage` already tolerates (Task 6 does not assert on `retried`).

## 7. Oracles and assertions

| Case   | Assertion (post-load, plus the journey's k6 checks `== 1`)                                                              | Kind if it fails                                                                                                                                                                                                                    |
| ------ | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `-002` | every completed document reaches seal, webhook job, webhook call, receiver and email, **exactly once** (`counts` are 1) | PRODUCT BUG (missing or duplicated stage, with document count and stage name)                                                                                                                                                       |
| `-002` | every stage is reached within 30 s of the last signature; backlog drains within 30 s of the last request                | PRODUCT BUG (with the pending job ids as evidence)                                                                                                                                                                                  |
| `-002` | envelopes `COMPLETED` equal `p6_docs_completed`; no job stuck after drain (Task 6 audit)                                | PRODUCT BUG                                                                                                                                                                                                                         |
| `-002` | a double seal with sequential completions                                                                               | counted under `knownBugs["P6-OBS-DOC-002"]` **and** `unexpected`; an `unexpected` entry fails the run as `PRODUCT BUG (SUSPECTED)` (Task 6 owner decision): new evidence, repeated three times (rule 13) before the owner labels it |
| `-008` | per event: 500 then 200 at the receiver; `WebhookCall` FAILED then SUCCESS; job `retried == 1`; document `COMPLETED`    | PRODUCT BUG                                                                                                                                                                                                                         |
| both   | `dropped_iterations == 0`, VUs below the cap, runner not saturated                                                      | INVALID (Task 4), never hides a correctness failure                                                                                                                                                                                 |

Recorded, not asserted: p50/p95/max of each stage lag, `drainMs`. **PRODUCT BUG vs TEST BUG.** Setup errors (no token, receiver not reachable from the container, join key missing from a body) are TEST BUG; a missing stage, a duplicate or a retry that does not happen is PRODUCT BUG with the counts as evidence. No `test.fail()`: no new bug was proven; if the build run shows a missing stage or a double seal, repeat three times (rule 13) and report it SUSPECTED.

## 8. Data isolation, cleanup, leak check

Prefix `caseDataPrefix(runPrefix, caseId)` on titles and recipient addresses; Task 7's `documensoCleanup` collects the live envelope ids by title prefix, then `endRun` deletes envelopes, webhook, API token, mailboxes, account and closes the receiver; `leakCounts` must read 0. The webhook is created per run against the runner receiver and removed in cleanup, so `-008`'s failing receiver cannot affect another case. The Inbucket mailboxes are the per-recipient prefixed ones `endRun` already purges.

## 9. Token scan

New artefact: `pipeline-lag.json` (counts and milliseconds only). Delivery bodies, signing URLs, recipient addresses and Inbucket content are never written; the secret header check of the receiver never logs the secret. The runner's `tokenScan` stage and the job step scan `results/load` before upload; a unit test passes a built `pipeline-lag.json` through `findHits`.

## 10. CI budget

Convention (one for every Phase 3 plan, Task 3 §9): worst case = Phase 2 closeout §2.7 worst case (`documenso-smoke` 6.1 min, run 39821517901, + 0.8 allowance = 6.9) + the Task 1 cold start (Documenso +2.0, estimate) + the image pull at its 6-minute cap minus the measured 0.3 (+5.7) + each new step, "estimates" at its measured/estimated duration and "at caps" at its `timeout-minutes`; at least 10 minutes under the job timeout; no timeout raised. Base 6.9 + 2.0 + 5.7 = **14.6**. VM step time per case (full profile): setup 1 + k6 30 + drain 3 + joins 1 + cleanup of 30 documents 5 + scan 5 ≈ 45 s, doubled for the runner = **1.5 min**; `-008` the same plus about 1 s.

**One cap rule for all four Documenso LOAD steps (Tasks 7, 9 and 10): `timeout-minutes` 4 on `main`/dispatch, 3 on pull requests.** Estimate 1.5 min, 80 % stop rule 3.2 min (main) and 2.4 min (PR): the estimate sits under both.

| Job                                                                          | Base (min) | Task 3 install (estimate / cap) | Retired smoke | Steps (estimates / caps) | Worst, estimates (min) | Worst, at caps (min) | Timeout | Margin (caps) |
| ---------------------------------------------------------------------------- | ---------- | ------------------------------- | ------------- | ------------------------ | ---------------------- | -------------------- | ------- | ------------- |
| `documenso-smoke` through this task (Task 7 step, `-002`, `-008`)            | 14.6       | 0.04 / 2.0                      | −0.02         | 3 × 1.5 / 3 × 4.0        | 19.1                   | 28.6                 | 45      | 16.4          |
| `documenso-smoke` with Task 10's `P6-DOC-LOAD-007` as well (the fourth step) | 14.6       | 0.04 / 2.0                      | −0.02         | 4 × 1.5 / 4 × 4.0        | 20.6                   | **32.6**             | 45      | **12.4**      |

Every margin is at least 10 minutes at caps; no timeout is raised. Each new step and its 80 % stop rule: `P6-DOC-LOAD-002` and `-008` caps 4 main / 3 PR (estimate 1.5, stop 3.2 / 2.4); token scan cap 2 (estimate 0.1, stop 1.6); `load-documenso` upload cap 3 (estimate 0.2, stop 2.4). Steps (after the Task 7 LOAD step, before "Check Documenso artefacts for tokens"):

```yaml
- name: LOAD P6-DOC-LOAD-002 pipeline lag (functional load, not capacity)
  if: ${{ !cancelled() && steps.documenso_up.outcome == 'success' }}
  working-directory: ${{ env.P6_WORKING_DIRECTORY }}
  timeout-minutes: ${{ github.event_name == 'pull_request' && 3 || 4 }}
  run: |
    set -euo pipefail
    status=0
    npm run load:documenso-pipeline -- --profile "${{ github.event_name == 'pull_request' && 'pr' || 'full' }}" || status=$?
    if [ "$status" -eq 3 ]; then echo "::warning::LOAD run INVALID; excluded from medians (P6-RULE-005)"; status=0; fi
    exit "$status"
```

and the same for `P6-DOC-LOAD-008` (`npm run load:documenso-webhook-retry`, same caps). Stage times and the drain time appear in the job summary through `formatPipelineRows` (Task 4's summary step reads `pipeline-lag.json`); the existing `results/load` token scan and `load-documenso` upload cover the new artefacts. Trials: none (not a race).

## 11. Environment changes

None. Documenso still needs Node 24 (`scripts/harness.mjs` picks `/opt/node24`); the receiver listens on loopback and the product container reaches it as `startRun` already arranges. Nothing by hand in either cloud.

## 12. Build order (one commit per step; `npm run check` after each)

Run from the repo root with `export PATH="/usr/local/bin:$PATH"`. Branch: `git switch -c feat/<build date>-p6-doc-load-pipeline-lag origin/main` (after Task 7 is merged). Counts relative to B (B = count on main when the build starts; 719 today).

| Step | Commit subject                                                                   | `git add` paths                                                                                                                                                                         | `npm run check` expected           |
| ---- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| 0    | `docs(plans): bring the phase 3 task 9 plan onto the build branch`               | `docs/plans/2026-10-24-p6-phase3-task9-doc-load-pipeline-lag.md`                                                                                                                        | exit 0, B                          |
| 1    | `feat(receivers): let the webhook receiver choose its answer per delivery`       | `src/receivers/webhook-receiver.ts tests/unit/webhook-receiver-respond.test.ts`                                                                                                         | exit 0, **B + 3**                  |
| 2    | `feat(load): join the documenso pipeline stages per document`                    | `src/load/pipeline-lag.ts tests/unit/pipeline-lag.test.ts`                                                                                                                              | exit 0, **B + 15**                 |
| 3    | `feat(load): read the pipeline after the load and judge it against the contract` | `src/load/pipeline-lag.ts src/load/pipeline-table.ts tests/unit/pipeline-table.test.ts tests/unit/pipeline-lag-stage.test.ts`                                                           | exit 0, **B + 18**                 |
| 4    | `feat(load): judge the webhook retry`                                            | `src/load/webhook-retry.ts tests/unit/webhook-retry.test.ts`                                                                                                                            | exit 0, **B + 24**                 |
| 5    | `feat(load): register the pipeline lag and webhook retry cases`                  | `src/load/products/documenso.ts src/load/cases.ts k6/cases/doc-load-002.js k6/cases/doc-load-008.js k6/cases/doc-load-002.example.json k6/cases/doc-load-008.example.json package.json` | exit 0 (`k6 inspect` ok), B + 24   |
| 6    | `ci(perf): run the pipeline lag and webhook retry loads in documenso-smoke`      | `.github/workflows/perf.yml`                                                                                                                                                            | exit 0 (actionlint silent), B + 24 |
| 7    | `docs: document the pipeline lag and webhook retry load cases`                   | `README.md`                                                                                                                                                                             | exit 0, B + 24                     |

New unit tests, by name (24): `webhook-receiver-respond` (3: with no responder the answer stays 200 with body `{"ok":true}` and the delivery records `status` 200; the responder's status is sent and recorded; `failFirstPerEvent` answers 500 then 200 per event key); `pipeline-lag` (12: all stages reached once; lag computed from the last signature; a missing seal; a missing receiver delivery; a duplicated email job; a delivery that answered 500 is not counted as `receiverOk`; email matched by envelope; a document without `completedAt`; `summariseLag` percentiles on a fixed list; `overContract` counts a stage over 30 s; `missing` and `duplicated` counts; empty input is a TEST BUG signal); `pipeline-lag-stage` (2: `drained: false` becomes a PRODUCT BUG with the pending ids; `pipeline-lag.json` passes `findHits`); `pipeline-table` (1: rows show p50/p95/max per stage and the drain time); `webhook-retry` (6: clean fail-first passes; no retry at all; a second 500; a duplicate 200; the job not retried once; an envelope not `COMPLETED`). Sum 3 + 12 + 2 + 1 + 6 = **24**. Cumulative: step 1 +3; step 2 +12 → B+15; step 3 +3 → B+18; step 4 +6 → B+24.
Before step 6 run each case once on the VM (`npm run up:documenso`; `npm run load:documenso-pipeline -- --profile pr`; `npm run load:documenso-webhook-retry -- --profile pr`; `npm run down:documenso`): both PASS. After step 7: `git push -u origin feat/<build date>-p6-doc-load-pipeline-lag`, `gh pr create` (rule A3), read CI once (rule 15), one `workflow_dispatch` on `main` after merge. Merge only when the owner says "merge".

## 13. Risks, proposed extras, open questions

| ID  | Risk                                                       | Mitigation                                                                                                                                             |
| --- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R1  | In-process jobs compete with requests, lag grows with rate | rate 1 per second; the lag is reported, the only asserted bounds are the 30 s contracts; a breach is a finding                                         |
| R2  | Inbucket timestamps or message matching are unreliable     | email is also seen through the `send.document.completed.emails` job; the Inbucket check is an additional stage and its absence is reported with counts |
| R3  | Drain longer than the step timeout                         | contract 30 s against a measured 3 s; the step cap is 6 minutes                                                                                        |
| R4  | The receiver unreachable from the container on a runner    | `startRun` already solves the host name; the preflight stage fails as ENV, not as a product bug                                                        |
| R5  | A double seal appears with sequential completions          | Task 6 reports it as `unexpected`, which fails the run as `PRODUCT BUG (SUSPECTED)`; repeat three times (rule 13) and report; the owner labels         |

**Contradictions with the roadmap.** (1) The receiver "after Phase 2 Task 4" cannot choose its answer; §6.2 adds the option. (2) None else; the gate for `-008` passes, so it stays in scope rather than "Later".

**Observation for the owner (no label yet; owner decision Q2).** Documenso's local jobs provider retries a failed webhook three times with **no backoff** (11 to 16 ms between attempts), so a subscriber that is down for even a second loses the event permanently. Recommendation, adopted by the owner: **no label until `P6-DOC-LOAD-010` repeats three times (rule 13)**, scoped to the local jobs provider only (the CI and cloud runs use it; another provider may differ), **no `test.fail()`, no public issue**. If it is labelled later the id is `P6-OBS-DOC-004` (`P6-OBS-DOC-003` is taken). Evidence so far: `WebhookCall` rows and job `retried=3` in the fail-always probe (§3.5).

**Proposed extras (out of scope until accepted; new IDs).**

- `P6-DOC-LOAD-010`: fail-always receiver at the fixed rate, recording attempts, spacing and the final job state (`FAILED`, `retried=3`) as a characterisation of the retry budget, with the document asserted unaffected.
- `P6-X-LOAD-019`: add a `--drain-contract-seconds` option to `run-load.ts` for local probes only (not used in CI).

**Owner decisions (all three questions closed 2026-10-24).**

- **Q1 (closed: accept).** Contract numbers: 30 s drain and 30 s per-stage bound (10× the measured 3 s). Accept, or a tighter/looser value?
- **Q2 (closed: no label yet; `P6-OBS-DOC-004` only after `-010` repeats three times; no `test.fail()`, no public issue).** Label for the no-backoff webhook retries.
- **Q3 (closed: yes, with the caps of §10).** Run `-008` on PRs as well as on `main` (proposed: yes, 10 s profile, 1.5 min on the runner)?

## 14. Done when (roadmap, made measurable)

- [ ] `P6-DOC-LOAD-002` VALID and green on the PR and once on `main`: every document reaches every stage exactly once, backlog drains within 30 s, `verdict.json` outcome `PASS`, `pipeline-lag.json` shipped.
- [ ] `P6-DOC-LOAD-008` VALID and green the same way: one accepted delivery per event, `WebhookCall` FAILED then SUCCESS.
- [ ] Stage p50/p95/max and the drain time are in the job summary and in the artefacts after a clean token scan; none of them is published as a performance number.
- [ ] `npm run check` exit 0 with **B + 24** (743 on today's chain); no job timeout raised; every new step has `timeout-minutes`.

## 15. Rule 20 self-check

- (a) Done-when in §14; gaps: the join keys (§5 check 6), the rate and contracts on the runner (§3.7), settled at build time and by three dispatch runs.
- (b) Existing names grepped at `5acd2a0`: `src/documenso/oracle.ts` SQL names and readers (§4), `src/receivers/webhook-receiver.ts` (`writeHead(200` line 79), `startRun`/`endRun`. NEW: `joinStages`, `summariseLag`, `pipelineStage`, `judgeWebhookRetry`, `failFirstPerEvent`, `formatPipelineRows`, the two cases and scripts. Names from Tasks 3 to 7 are checked at build time (§5 check 3).
- (c) CI time: §10, estimates and at caps (32.6 of 45 with all four Documenso LOAD steps, margin 12.4).
- (d) Skeletons: §6. Steps with `git add` paths and expected counts: §12.
- (e) The owner's answers to Q1 to Q3 are recorded in §1 and §13.
