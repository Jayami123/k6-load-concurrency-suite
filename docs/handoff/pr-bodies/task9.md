# Task 9 PR (not created: owner opens it)

Base: feat/2026-10-24-p6-med-load-conservation (Task 8)
Head: feat/2026-10-24-p6-doc-load-pipeline-lag
Title: feat(load): judge the documenso pipeline lag and the webhook retry (partial)

## Body

## What and why

Builds the pure parts of the Documenso pipeline checks of plan task 9 (docs/plans/2026-10-24-p6-phase3-task9-doc-load-pipeline-lag.md):

- **The webhook responder** (`src/receivers/webhook-receiver.ts`): an optional `respond` that picks the HTTP status per delivery
  (default 200, so every existing caller is unchanged), `failFirstPerEvent` (500 for the first delivery of each event key, then 200).
  A delivery records the status it was answered with.
- **The pipeline join** (`src/load/pipeline-lag.ts`, pure): per document, whether each stage was reached, its lag from the last
  signature, and the row counts that show duplicates. `summariseLag` gives missing, duplicated, p50, p95, max and the number of
  lags over the contract.
- **The webhook retry judge** (`src/load/webhook-retry.ts`, pure): per event, exactly one 500 then one 200 delivery, one FAILED and one
  SUCCESS call, one COMPLETED job with `retried == 1`, and every envelope COMPLETED.

## Not built (partial)

- **Step 3, the pipeline stage** (`pipelineStage`, reads the rows through the read-only pool and waits for the drain): not built. Its
  SQL reads the Documenso `Envelope`, `Recipient` and signing tables; the column names are not checked against the live schema.
  Verifying them needs a live Documenso run, so this is left for the next session. Also needs Task 6's `waitForDrain` wiring.
- **Step 5, the cases** (`DOC-LOAD-002` and `DOC-LOAD-008`) and the `documensoSetup({ webhookMode })` factory: not built, because the
  cases compose with `documensoAuditStage` (Task 6), which is not built in this stack, and with the pipeline stage above.
- **Step 6, perf.yml** (the two loads in `documenso-smoke`) and **step 7, README**: not built, for the same reason.
- **Live steps** of the plan (run each case once on the VM, `npm run load:documenso-pipeline` and `load:documenso-webhook-retry`):
  not run, because the cases do not exist.

## Commits

- feat(receivers): let the webhook receiver choose its answer per delivery (3 tests)
- feat(load): join the documenso pipeline stages per document (12 tests)
- feat(load): judge the webhook retry (6 tests)

## Verification

`npm run check` after each commit. Unit tests: 707 after step 1 (Task 8's 704 plus 3), 719 after step 2, 725 after step 4.
The plan's count for the full task is B + 24; this partial build is B + 21 (the 3 stage tests of step 3 are not written).

## CI

perf.yml workflow_dispatch on this branch (head 09b5cc8): the receiver change is on the Documenso run path, so `documenso-smoke` and
`documenso-race` exercise it. Result: see the update below.

## Escalation check (Task 9, partial)

- Product bug suspected: NO.
- CI/runner change: NO (perf.yml is not changed in this partial build).
- Timeout raised, test merged or split, or assertion weakened: NO.
- Secret, footer line, force-push or merge to main: NO.
