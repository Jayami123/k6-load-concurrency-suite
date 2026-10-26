# P6 Phase 4b Task 9: Documenso exactly-once under load (`P6-DOC-LOAD-003`) (plan only)

Roadmap: [2026-10-22-p6-phase4-roadmap.md](2026-10-22-p6-phase4-roadmap.md) lines 581 to 611 (Task 9), Note 3 (line 262), D16 (line 846). Written on `plan/2026-10-26-p6-phase4b-plans` from `origin/main` at `e27ad5a`. Probe date 2026-10-25 (UTC). **The Documenso stack did not start on this VM (§3, row D-1), so every Documenso runtime number below is either from the 4a plan on its branch, from the knee reports on GitHub Actions, or UNPROBED.** VM timings prove that a step works; none is a published number or a target.

## 1. Header

- **Task and roadmap line:** Phase 4b Task 9, roadmap lines 581 to 611.
- **Cases and priority:** `P6-DOC-LOAD-003` (P1). Known bug counted under `P6-OBS-DOC-002` (documenso/documenso#3187, roadmap line 593).
- **Build branch pattern:** `feat/<build date>-p6-doc-load-exactly-once`.
- **Unit-test delta:** **+11 against B0 1025** (`main` at `e27ad5a`). With Task 6 merged first (+36): B = 1061, expected **1072**.
- **Stop for owner review: yes.** A new job in a shared CI file (Q-PLACE, §13), and a stop on the upstream PR status (D-4, §3.2) that the owner must see.

## 2. What it proves

- One completion produces one seal, one audit row, one webhook call and one completion email per recipient, under a steady stream (sequential share).
- A known race (two last recipients signing at the same moment) is counted as the pair share of `P6-OBS-DOC-002`, keyed by document id and pair id, so the count is not inflated by repeats of the same pair (L15).
- Transfer: one settlement message per trade, one result notification per test, one consent record per signature: the side effects a payments or lab system must send once even when its workflow engine retries.

## 3. Live probe evidence

### 3.1 Roadmap item: the share of concurrent pairs that keeps the run VALID

| #   | Command or source                                                                                                        | Output (trimmed)                                                                                                                                                                                                                                          | Value it sets                                                                                                                                                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D-1 | `npm run up:documenso` (background)                                                                                      | exit 1 in 2 s: `Documenso local signing certificate missing at /home/user/products/documenso/apps/remix/example/cert.p12. Run npm ci in the Documenso fork, then retry.`; `/home/user/products/documenso` is an **empty directory** (`ls -A` = 0 entries) | **no Documenso run on this VM.** Cloning the fork is outside this session's GitHub scope (owner decision); every D-row below is marked                                                                       |
| D-2 | knee reports of runs 40235802167, 40236486969, 40237156783 (`gh run download`, read-only, this repo)                     | `range.lowerRate` 4, `upperRate` 5 in all three; `stop` at step 4 (rate 5), reason `p95`, limit 2,331.3 ms; `firstSaturated` `app_cpu` at step 2                                                                                                          | the steady rate of this task is 50 % of **4 per second** = **2.0 per second** if `knee-bounds.json` carries the same lower bound: **NOT ON MAIN** (Task 6 commits the entry, §4)                             |
| D-3 | the same reports, `sealLag.byStep`                                                                                       | seal p95 **423 ms** at step 0 (30 documents), **2,104 ms** at rate 4 (step 3), **2,846 ms** at rate 5 (`steps[4].p95Ms`)                                                                                                                                  | seal lag rises steeply above 3 per second on the runner; 2 per second is below the step 1 p95 of 250 ms (`steps[1].p95Ms`)                                                                                   |
| D-4 | the 4a Task 4 plan, `git show origin/plan/2026-10-25-p6-phase4a-plans:docs/plans/2026-10-25-p6-phase4-task4-doc-knee.md` | pipeline join about 0.05 s per document; seal lag p95 0.66 s at 1 per second and 3.65 s at 4 per second (4a index finding 6, L15)                                                                                                                         | **contradiction with D-3:** 4a gives 0.66 s at 1 per second, the run 40237156783 gives 423 ms at its step 0. Both are measurements of different runs; the build uses its own run's numbers and cites the run |
| D-5 | `gh pr view 3353 -R documenso/documenso --json state,mergedAt`                                                           | **not run**: `documenso/documenso` is outside this session's GitHub repository scope                                                                                                                                                                      | the state of upstream PR #3353 on the day is **UNPROBED**: the build session or the owner runs the command and records the result in the build PR (§5 row 2)                                                 |
| D-6 | concurrent-pair share that keeps the run VALID                                                                           | **UNPROBED** (no Documenso run)                                                                                                                                                                                                                           | the share is a build-time parameter, `pairShare` (§6.3), starting at 0.1 of the documents (proposal), to be confirmed by the first step-4 probe                                                              |

### 3.2 What the probe could not confirm

1. Every Documenso runtime row (D-1 to D-6 except D-2 to D-4 sources): **UNPROBED**, reason: the fork is absent; **confirm at build time** on a checkout the owner provides.
2. The state of `documenso/documenso` PR #3353 (D-5): **UNPROBED**; it was open on 2026-10-22 (roadmap line 595), and the roadmap's rule is that the pair share turns green only on one seal per document after a pin move, not on a merge.
3. Email counting under load (Inbucket, by document id and by the recipient token join, README lines 770 to 775): **UNPROBED** on this VM.
4. Whether `P6-OBS-DOC-002` reproduces at 2 per second: UNPROBED.

## 4. Depends on

Main at `e27ad5a`, verified in this plan run:

- `src/documenso/oracle.ts`: `WEBHOOK_CALLS_SQL` (line 5), `readWebhookCalls` (line 26), `DOCUMENT_COMPLETED_AUDIT_SQL` (line 83), `ITEM_SEALED_SQL` (line 90), `DOCUMENT_DATA_COUNT_SQL` (line 98), `readTerminalJobs` (line 132, terminal set `COMPLETED` and `FAILED`, line 125), `readCompletedAudit` (line 155), `readCompletedEmailCount` (line 190), `SEAL_JOBS_SQL` (line 59), `EMAIL_JOBS_SQL` (line 67).
- `src/load/reconcile/documenso.ts`: `waitForDrain` (line 22), `STUCK_JOBS_FOR_RUN_SQL` (line 131), `waitForDrainPool` (line 172).
- `src/load/pipeline-stage.ts`: `PIPELINE_SEAL_JOBS_SQL` (line 39), `PIPELINE_EMAIL_JOBS_SQL` (line 62), the stage join (Phase 3 Task 9).
- `src/load/knee/doc-intents.ts` (per-intent knee audit, Task 1 §6.8) and `src/load/knee/lag-by-step.ts` (seal lag by step, Task 4).
- `k6/journeys/doc-sign.js`, `k6/cases/doc-load-002.js` (pipeline check, the receiver), `k6/cases/doc-load-005.js` (knee).
- `scripts/load/run-load.ts`, `perf.yml` `documenso-smoke` (line numbers from the job list in Task 7 §4), `knee.yml` `documenso-knee`.
- `sequentialCompletions` (exported from `src/documenso/run-case.ts`, Phase 1 race framework): the sequential driver this case reuses.

**Not on main (Task 6, not on main at `e27ad5a`):** the Documenso steady rate source (`k6/thresholds/knee-bounds.json` `products.documenso`, Task 5 plan §6.2 and Task 6). Until it exists this case cannot set its rate, so its job is blocked (§5 row 1).

**Limiter (L11):** this case runs on the default Documenso profile (the bypass is on: `scripts/harness.mjs` line 33 sets `DANGEROUS_BYPASS_RATE_LIMITS=true`). It does **not** use `limitedFailMayLeaveUnfinished`; only `P6-DOC-LOAD-004` may (the limiter spike). Stated once here, as L11 requires.

## 5. Build-time recheck table

| #   | Check                                                                                   | Exact command                                                                                                           | Expected                                                                                                                                                                                            | If it differs                                                                         |
| --- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 1   | Task 6 merged and the Documenso knee entry exists (**hard stop for the Documenso job**) | `jq '.products.documenso' k6/thresholds/knee-bounds.json`                                                               | not `null`, `lowerBoundRate` > 0                                                                                                                                                                    | Stop. Build the parser and the classifier (steps 1 to 3); the job waits               |
| 2   | Upstream PR #3353 state, recorded in the build PR                                       | `gh pr view 3353 -R documenso/documenso --json state,mergedAt` (the owner or the build session, with the repo in scope) | `state` and `mergedAt` recorded with the date                                                                                                                                                       | Record the result; the verdict does not depend on it (roadmap line 597)               |
| 3   | The Documenso fork present                                                              | `ls -A /home/user/products/documenso \| wc -l`                                                                          | > 0 with `apps/remix/example/cert.p12` after `npm ci` in the fork                                                                                                                                   | Owner provides the checkout (bootstrap clones the fork, outside this session's scope) |
| 4   | Steady rate source                                                                      | `jq '.products.documenso.lowerBoundRate' k6/thresholds/knee-bounds.json`                                                | the file carries a lower bound (4 in the knee reports, D-2); the case rate is **50 % of it, rounded down to 0.1, via `steadyRateFor(bounds, "documenso")`**, so 4 gives **2.0 per second**, never 4 | the rate follows the file; state the change                                           |
| 5   | `npm run check`                                                                         | `npm run check`                                                                                                         | exit 0, 1036 or 1072 tests as in §12                                                                                                                                                                | fix before the next step                                                              |

## 6. Design

### 6.1 File tree

```text
k6/cases/doc-load-003.js                      NEW  P6-DOC-LOAD-003 (sequential stream + concurrent pair share)
k6/journeys/doc-pair.js                       NEW  two signers complete the same document in one iteration (the pair)
src/load/doc/exactly-once.ts                  NEW  classifyExactlyOnce: per document, per pair, counts under P6-OBS-DOC-002
src/load/doc/pair-key.ts                      NEW  pairKey(documentId, pairId) and pairCounts(rows)
src/load/cases.ts                             CHANGED  registers DOC_LOAD_003
perf.yml                                      CHANGED  Q-PLACE: a new job `documenso-invariants` (dispatch + schedule), §9
tests/unit/doc-exactly-once.test.ts           NEW  6 tests
tests/unit/doc-pair-key.test.ts               NEW  3 tests
tests/unit/doc-pair-share.test.ts             NEW  2 tests
README.md                                     CHANGED  section "Documenso exactly-once under load"
```

### 6.2 Sequential share (every document: exactly once)

A document in the sequential share completes before the next one starts its last signature (the existing `sequentialCompletions` driver). For each document the audit checks, with the oracles of §7:

- one `DOCUMENT_COMPLETED` audit row (`readCompletedAudit`, `DOCUMENT_COMPLETED_AUDIT_SQL`);
- one seal job, `COMPLETED` (`SEAL_JOBS_SQL`, `readTerminalJobs`);
- one webhook call with the document's payload (`readWebhookCalls`, `WEBHOOK_CALLS_SQL`, the receiver of `src/receivers/webhook-receiver.ts` via the runner);
- one completion email per recipient (`readCompletedEmailCount`, by document id).

Any other count for a document in this share is **FAIL (PRODUCT BUG, SUSPECTED)**: the sequential path is not a known bug.

### 6.3 Concurrent pair share (the known bug)

`pairShare` is a build-time parameter, proposal 0.1. It is **relative to the sequential steady rate**: the pair stream runs at `rate × pairShare` **in addition to** the sequential stream at `rate`. The pair fraction of all documents is therefore `pairShare / (1 + pairShare)` (0.1 gives 9.1 %, not 10 %), and the scenario rates are not changed. In a pair, the two last recipients of one document sign at the same moment, in `k6/journeys/doc-pair.js`. Each pair has a pair id `<document id>:<pair index>`. Seal jobs and audit rows are counted per **document id**; a document with two seal jobs is counted once under `P6-OBS-DOC-002` by the pair key, not as a new bug per row. Webhook calls are **not** in the pair accounting: no source on main carries a pair id for a webhook call (checked: `WEBHOOK_CALLS_SQL` in `src/documenso/oracle.ts` line 5 has no pair column), so a duplicate webhook in a pair is UNPROBED and not counted. Webhook exactness is checked on the sequential share only.

```ts
// src/load/doc/pair-key.ts
/** The key of one concurrent pair: `${documentId}:${pairId}`. Two rows with the same key are one pair with a duplicate, never two pairs. */
export function pairKey(documentId: string, pairId: string): string;
/** Duplicates per pair key: a map of key to the count of side-effect rows beyond the first. Pure. */
export function pairCounts(
  rows: Array<{ documentId: string; pairId: string; kind: "seal" | "audit" }>,
): Map<string, { seal: number; audit: number }>;
```

### 6.4 The verdict (`src/load/doc/exactly-once.ts`)

```ts
// src/load/doc/exactly-once.ts
export interface ExactlyOnceVerdict {
  sequentialDocs: number;
  sequentialExact: number; // documents that pass every check of the input below
  pairDocs: number;
  pairKnownDuplicates: number; // pair keys with a duplicate seal, counted under P6-OBS-DOC-002 (never a verdict input on its own)
  verdict: "PASS" | "PASS (P6-OBS-DOC-002 counted)" | "FAIL (PRODUCT BUG)" | "TEST BUG" | "INVALID";
  reasons: string[];
}
/**
 * A sequential document is exact only when ALL of: seal === 1 (COMPLETED seal jobs only), failedSeal === 0,
 * pendingSeal === 0, audit === 1, webhook === 1 with webhookPayloadMatched === true, and matchedRecipientTokens is a
 * one-to-one match: its length equals recipients, its values are distinct, and each is a Recipient.token of that
 * document (the caller performs the join and the distinct check before classification; a duplicate or unmatched token
 * is reported in invalidReasons, never counted).
 *
 * Precedence, one outcome per run, highest first: TEST BUG (testBugReasons not empty: setup or drain failure) >
 * INVALID (invalidReasons not empty: telemetry, dropped iterations, L9 mismatch, duplicate or unmatched token) >
 * FAIL (PRODUCT BUG) (any sequential document not exact) > PASS (P6-OBS-DOC-002 counted) (sequential exact and
 * pairKnownDuplicates > 0) > PASS. Both PASS branches require empty invalidReasons and empty testBugReasons.
 */
export function classifyExactlyOnce(input: {
  sequential: Array<{
    docId: string;
    seal: number; // COMPLETED seal jobs only
    failedSeal: number; // FAILED seal jobs after drain: any value is a FAIL
    pendingSeal: number; // seal jobs still PENDING or PROCESSING after the drain: any value is a FAIL (readTerminalJobs timed out)
    audit: number;
    webhook: number;
    webhookPayloadMatched: boolean; // caller compares WebhookCall.requestBody with the document's payload; a mismatch is FAIL (PRODUCT BUG)
    matchedRecipientTokens: string[]; // one entry per completion email whose token joined to a Recipient.token; duplicates are kept so the classifier can see them
    recipients: number;
  }>;
  pairRows: Array<{ documentId: string; pairId: string; kind: "seal" | "audit" }>;
  invalidReasons: string[]; // includes the L9 reconciliation failure and telemetry or dropped-iteration reasons
  testBugReasons: string[];
}): ExactlyOnceVerdict;
```

### 6.5 k6 case skeleton

```js
// k6/cases/doc-load-003.js  (P6-DOC-LOAD-003: exactly-once seal, audit, webhook and email under load; P6-OBS-DOC-002 counted)
// Rate: rate = steadyRateFor(bounds, "documenso") = 50 % of products.documenso.lowerBoundRate (Task 6 file), rounded down to 0.1;
// 4 gives 2.0 per second. The k6 call passes that rate, never the lower bound itself.
// Scenario: sequential stream at `rate`, plus a pair stream at rate x pairShare (in addition, §6.3).
// Oracle: classifyExactlyOnce over the audit rows, the seal and email jobs and the webhook receiver's calls, per document id and pair key.
export const options = standardOptions({
  scenarios: {
    sequential: openModelScenario({
      rate,
      durationSec,
      maxLatencyMs: 12000,
      exec: "sequential",
      tags: { case: "P6-DOC-LOAD-003" },
    }),
    pairs: openModelScenario({
      rate: rate * pairShare,
      durationSec,
      maxLatencyMs: 12000,
      exec: "pair",
      tags: { case: "P6-DOC-LOAD-003" },
    }),
  },
  thresholds: { checks: ["rate==1"], http_req_failed: ["rate==0"] },
});
```

VU pools: `preAllocatedVUs` with `maxLatencyMs` 12,000 (PR #79 `iterationMs 12000`, the worst case of one document): at 2 per second the pool is `ceil(2 × 12 × 1.25) = 30`, max 45; the pair stream adds `ceil(0.2 × 12 × 1.25) = 3`. Any dropped iteration is INVALID (L17).

## 7. Oracles and assertions

| Check                                 | Oracle                                                                                                 | Rule                                                                                                                       |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| one completion audit row per document | `DOCUMENT_COMPLETED_AUDIT_SQL` (`src/documenso/oracle.ts` line 83) via `readCompletedAudit` (line 155) | exactly 1; 0 is a PRODUCT BUG (SUSPECTED) when the document completed (the drain check)                                    |
| one seal job, COMPLETED, per document | `SEAL_JOBS_SQL` (line 59), `readTerminalJobs` (line 132)                                               | exactly 1 COMPLETED; a FAILED or PENDING job after the drain is a stuck job (FAIL)                                         |
| one webhook call per document         | `WEBHOOK_CALLS_SQL` (line 5) via `readWebhookCalls` (line 26), plus the receiver's own log             | exactly 1 call with the document's payload                                                                                 |
| one completion email per recipient    | `readCompletedEmailCount` (line 190), by document id (Inbucket)                                        | equal to the recipient count; the completion link token of each email joins to `Recipient.token` (README lines 770 to 775) |
| no stuck jobs after the drain         | `STUCK_JOBS_FOR_RUN_SQL` (`src/load/reconcile/documenso.ts` line 131), `waitForDrain` (line 22)        | 0                                                                                                                          |
| pair duplicates                       | `pairCounts` (§6.3) over `SEAL_JOBS_SQL` and `DOCUMENT_COMPLETED_AUDIT_SQL` rows                       | counted under `P6-OBS-DOC-002`, keyed by the pair key                                                                      |

**L9 (per-intent audit, no count slack):** every iteration writes one intent line (`<prefix>-i<n> sequential` or `<prefix>-i<n> pair`) and one outcome line; reconciliation counts by intent and must match exactly. The caller runs this reconciliation **before** `classifyExactlyOnce` and puts any mismatch (a count that differs, a document or pair missing from the rows) into `invalidReasons` (§6.4), so a missing row cannot pass on the observed rows alone.

**Known bugs (counted, never hidden):** `P6-OBS-DOC-002` (concurrent pairs, documenso/documenso#3187; the count per pair key). `P6-OBS-DOC-001` and `-006` are not on this path and are not counted here. **Labels: SUSPECTED until the owner confirms; only the owner labels a bug, after repeated runs (L12).**

## 8. Data isolation, cleanup and leak check

- Run prefix `p6-qa-<run id>-<case>` in every document title (`<prefix>-i<n> <intent>`) and in every recipient email (the existing email scheme of `src/documenso/run-case.ts`).
- Cleanup: `documensoCleanupWith` (`src/load/products/documenso.ts`; envelope delete); its cost per document is **UNPROBED** (no run); the step cap in §9 covers it as a placeholder.
- Leak check: `LIVE_ENVELOPE_LEAK_SQL` and `leakCheck` on the run prefix; **expected output 0 rows** after cleanup.

## 9. CI, token scan and budget

Q-PLACE (§13), recommended option (a): a new job `documenso-invariants` in `perf.yml`, dispatch and schedule only, with the setup steps of `documenso-smoke` copied (the Node 24 setup and the harness start, same timeouts) and one run step, the job summary, the token scan, an upload with `retention-days: 14` (perf.yml's retention), and the stop step with `if: always()`.

Budget (the step caps are placeholders until the first dispatch; the job arithmetic is the rule): the case's k6 is 2 min at the steady rate plus 1 min of drain. Setup steps (copied from `documenso-knee`, computed in Task 7 §9) sum to **22**, the run step **10** (k6 3 min, drain and audit 6, cleanup of about 240 documents, margin), summary 2, scan 2, upload 3, stop 1: **sum 40**; job timeout **60**; margin **20 ≥ 10** ✓. **Confirm in the first CI dispatch** (cleanup per document is UNPROBED).

The token scan runs before every upload (the `token_scan` step guards the upload). Permissions `contents: read`.

## 10. Expected output

```text
P6-DOC-LOAD-003 sequential: documents <n>, exact <n>, seal 1 each, audit 1 each, webhook 1 each, emails = recipients
P6-DOC-LOAD-003 pairs: pairs <p>, duplicate seals in <k> pair keys (P6-OBS-DOC-002 counted)
P6-DOC-LOAD-003 <PASS | PASS (P6-OBS-DOC-002 counted) | FAIL (PRODUCT BUG) | TEST BUG | INVALID>
```

Placeholders only.

## 11. Environment changes

None. The Documenso fork checkout is an **owner-provided setup step** for the probes and the build, not a repo change: the fork at `/home/user/products/documenso` is empty in this session, and the fork's `npm ci` writes its certificate. Cursor Cloud and Claude Code cloud need no change in the repo. Documenso needs Node 24 (`/opt/node24`, handled by the harness).

## 12. Build order

| Step | Commit                                                               | Files                                                                                                                                        | Unit tests after the step (B0 1025) |
| ---- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| 1    | `feat(load): add the exactly-once classifier`                        | `src/load/doc/exactly-once.ts`, `src/load/doc/pair-key.ts`, `tests/unit/doc-exactly-once.test.ts` (6), `tests/unit/doc-pair-key.test.ts` (3) | 1034                                |
| 2    | `feat(k6): add the pair share and the exactly-once case`             | `k6/journeys/doc-pair.js`, `k6/cases/doc-load-003.js`, `src/load/cases.ts`, `tests/unit/doc-pair-share.test.ts` (2)                          | 1036                                |
| 3    | `ci(perf): add the documenso invariants job`                         | `.github/workflows/perf.yml`                                                                                                                 | 1036 (plus `lint:actions`)          |
| 4    | `docs(load): describe the documenso exactly-once case in the readme` | `README.md`                                                                                                                                  | 1036                                |

**Expected after the last step: 1036** (B0 1025 + 11). With Task 6 merged first: 1072.

## 13. Risks, proposed extras and open decisions

**Open decisions:**

- **Q-PLACE (Documenso invariant case).** Options: (a) a new job `documenso-invariants` in `perf.yml` (recommended; `documenso-smoke` already has 22 uncapped steps on main, the 4a PRE-2 rule is to cap each step, and a new job keeps its margin); (b) a new mode in `knee.yml`; (c) a new workflow. Recommended: **(a)**, the same choice as Task 8.
- **Q-PAIRSHARE.** The concurrent share: 0.1 (recommended, a small known-bug count that keeps the run VALID) or 0.5 (a larger count, more chance of INVALID by the generator). Evidence: none (D-6 UNPROBED). Recommended: **0.1**, then the first probe decides.
- **Q-PR3353.** Whether the case records the upstream PR state in its verdict. Recommended: **record it in the build PR only**, never in the verdict (roadmap line 597: the verdict is the single-seal test, not the merge).
- **Q-DOCRATE:** the steady source if Task 6 slips: wait (recommended) or use the knee reports' lower bound of 4 with the 50 % rule written into the file by Task 6, never computed here.

**Proposed extras:** none needed. (`P6-DOC-LOAD-016` is proposed by the 4a Task 6 plan on its branch, not on main; not reused here.)

**Risks:**

- A known bug's duplicates counted as new ones: the pair key is the mitigation (§6.3).
- Seal lag rising above 3 per second on the runner (D-3): the 2 per second steady rate is below it, but the margin is measured only in the knee reports.
- The fork is missing on this VM: no runtime evidence for this task from this session.

## 14. Done when (roadmap, made measurable)

Roadmap: "≥ 3 VALID runs: sequential share exactly-once on every document; concurrent share counted under `P6-OBS-DOC-002`; `npm run check` green."

Measured: (1) `npm run check` with 1036 tests (1072 with Task 6), `# fail 0`; (2) three VALID `documenso-invariants` dispatches, each with `verdict.json` listing every sequential document as exact; (3) the pair counts per run in the job summary, keyed by pair key.

## 15. Rule self-check

- **A1, A2, A3, A5:** plan branch, Conventional Commits, explicit paths, no attribution.
- **B7 (probe first):** §3 records the blocked probe (D-1) and the sources used; no runtime number is invented.
- **B9:** §13 lists the open decisions and the contradiction D-3 versus D-4 (seal lag 423 ms versus 0.66 s).
- **B10:** stop for review (§1).
- **C12:** the sequential share has no tolerance; pairs are counted, not hidden.
- **L11:** the case does not use `limitedFailMayLeaveUnfinished` (§4).
- **Industry practice:** exactly-once side effects by idempotency keys and terminal-state checks follow the Phase 1 race framework and the k6 `constant-arrival-rate` executor docs (Grafana k6); the GitHub `timeout-minutes` rule is GitHub docs ("Workflow syntax").
- **F (plan self-check):** (a) roadmap "Done when" in §14; (b) names grep-verified in §4 (`src/documenso/oracle.ts` lines 5, 26, 59, 67, 83, 90, 98, 125, 132, 155, 190; `src/load/reconcile/documenso.ts` lines 22, 131, 172); (c) budget in §9 with margin 20; (d) skeletons in §6; (e) no owner answer recorded as given.
