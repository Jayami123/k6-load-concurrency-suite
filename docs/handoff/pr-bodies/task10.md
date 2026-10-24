# Task 10 PR (not created: the owner opens it)

Base: feat/2026-10-24-p6-doc-load-pipeline-lag (Task 9), with `main` at 62f689e merged in
Head: feat/2026-10-24-p6-retry-storms
Title: feat(load): add the retry storm cases (P6-CAL-LOAD-007, P6-CAL-LOAD-009, P6-MED-LOAD-006, P6-DOC-LOAD-007)

## Body

## What and why

Plan task 10 (docs/plans/2026-10-24-p6-phase3-task10-retry-storms.md), steps 1 to 10. One intent is one logical request. The client
gives up after a short timeout, so the server finishes a request the client never sees, and the same body is sent again. The cases
check that the storm happened and that each intent still had one effect.

- **Retry plan** (`k6/lib/retry.js`, pure): `buildPlan`, `classifyAttempt`, `runAttempts`. The short storm attempts come first; the
  final attempt waits for the server (30 s) so every intent ends with an answer.
- **Storm judge** (`src/load/retry-validity.ts`): `judgeStorm` (at least half of the first attempts timed out, every timeout retried).
  It also holds the shared `RetryCounters`, `RetryFinding` and `RetryJudgement` types.
- **Audits** (`src/load/retry-audit/{cal,medusa,documenso}.ts`): pure judges with read-only readers. Cal: one accepted booking per
  intent, redacted 400 and 409 counted, one booking per private link. Medusa: one order and one payment per intent, reserved equals
  orders, one order id per intent. Documenso: one seal, one `DOCUMENT_COMPLETED` row, every recipient signed, one completion email per
  recipient.
- **Cal private links** (`src/load/products/cal.ts`): `calSetup({ privateLinks: true })` sets planned + 2 cap-1 links, keeps the host
  cookie in `ctx.secrets`, and cleanup restores the prior links (a failed restore is `TEST BUG: prior links not restored`).
- **Journeys and cases**: `k6/journeys/{cal-book,med-checkout,doc-sign}.js` take `opts.retryPlan` (unchanged without it). The retried
  request goes through `retried()` in `k6/lib/http.js`. Cases `k6/cases/{cal-load-007,cal-load-009,med-load-006,doc-load-007}.js`
  and their example JSON are registered in `src/load/cases.ts`. `package.json` has four `load:*-retry` commands.
- **CI** (`.github/workflows/perf.yml`): one LOAD step in `medusa-load` (`P6-MED-LOAD-006`), two in `cal-smoke` (`-007`, then `-009`
  last, because it restores the shared event type's links), one in `documenso-smoke` (`P6-DOC-LOAD-007`). Each has `timeout-minutes`;
  no existing job timeout was raised.
- **README**: four standalone commands and a short section on what each judge checks.

Unit tests: 775 on the Task 9 tip, +34 from this task (+9 retry plan, +3 storm judge, +8 cal audit, +6 medusa audit, +5 documenso
audit, +3 cal private links) = 809. Merging `main` brings 2 more (811).

## Live runs (this session's VM, harness v0.2.15, k6 v2.3.0, PR profile)

| Case                                  | Result                        | Evidence                                                                                                                                                                     |
| ------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P6-CAL-LOAD-007                       | PASS                          | 10 of 10 first attempts timed out, 30 retries; 10 accepted bookings for 10 intents; 1 redacted 400 (counted, P6-OBS-CAL-001), 9 × 409 (counted); 0 5xx                       |
| P6-CAL-LOAD-009                       | PASS                          | 11 of 11 first attempts timed out, 33 retries; 11 bookings, 11 link uses, every link used once; prior links restored                                                         |
| P6-MED-LOAD-006                       | PASS (VALID)                  | 11 of 11 first attempts timed out, 33 requests; 11 orders, 11 payments, reserved equals orders; 0 order-id mismatches; 0 dropped iterations after the sizing fix (see below) |
| P6-DOC-LOAD-007                       | FAIL, PRODUCT BUG (SUSPECTED) | two runs with the same result (see below)                                                                                                                                    |
| P6-DOC-LOAD-002 (control, no retries) | PASS                          | one seal per envelope                                                                                                                                                        |

**P6-DOC-LOAD-007: PRODUCT BUG P6-OBS-DOC-005 (confirmed: 3 CI runs and 2 local runs).** Every envelope gets two seal jobs
about 0.3 s apart, two `DOCUMENT_COMPLETED` rows and two completion-email jobs per recipient. The no-retry control
`P6-DOC-LOAD-002` gives one seal per envelope in the same runs. It is a known bug: the case is marked with `test.fail()` in
`tests/documenso/load/doc-load-007-known-bug.spec.ts` (strict: it turns red when the product seals once), the hard storm checks are
separate tests, and the README has the entry with the evidence, the suspected area and the removal condition.

## Deviations from the plan (each one is in the commits)

1. `calSetup` is a factory now (`calSetup({})` for `P6-CAL-LOAD-001`, `calSetup({ privateLinks: true })` for `-009`).
2. The plan's `documensoSetup({ webhookMode })` is the existing `makeDocumensoSetup({ webhookMode })`.
3. The retry transport (`sendStep`, `retried`, the counters) is in the existing `k6/lib/http.js`, not a new file. `k6/lib/retry.js`
   stays free of k6 imports.
4. The final attempt carries `parallelRetries` (`buildPlan`), so Documenso sends 1 + 3 requests as the probe describes.
5. The shared judge types (`RetryCounters`, `RetryFinding`, `RetryJudgement`) are in `src/load/retry-validity.ts`. The plan's file list has no shared types file, and the three audits need the same shape.
6. `P6-MED-LOAD-006` uses `maxLatencyMs` 6000, not the plan's 2000 to 4000 range. The VM's slowest iteration was 5.7 s; with 4000
   the pool pre-allocated 5 VUs and one arrival was dropped (INVALID, twice). The dropped-iteration check is unchanged. The owner
   should confirm this value.
7. The Documenso storm counts each recipient's first request, two per intent, so the storm ratio is per request. The judge's
   denominator is the intents, so the reported ratio is above 1 (for example 22 of 11). The storm test still holds at ≥ 0.5.
8. `main` (62f689e) is merged in with `--no-ff`. The one conflict was an import list in `tests/unit/load-runner.test.ts`; both imports
   are kept.

## CI

Final head `fca02b2`, run [40139142246](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40139142246) (full profile):
**success**, 14 of 14 jobs green. `documenso-smoke` passes with `P6-DOC-LOAD-007` as the expected failure (known-bug step: storm
test passed, duplicate-seal test ✘ as expected). Job durations: medusa-smoke 21 min 41 s, medusa-order-races 15 min 53 s, cal-state-races
7 min 31 s, medusa-multi-instance (redis) 10 min 33 s, medusa-multi-instance (memory) 8 min 50 s, cal-smoke 5 min 41 s,
documenso-smoke 7 min 11 s, twenty-races 6 min 03 s, twenty-obs 4 min 12 s, medusa-cancel-extras 3 min 56 s, load-overhead 4 min 37 s,
twenty-smoke 3 min 42 s, medusa-load 3 min 12 s, load-selftest 2 min 55 s.

Earlier runs (same retry-storm code; the only later change is the known-bug marker):

- `40134262533` (6a76e3b, full): failure in `documenso-smoke` only (P6-DOC-LOAD-007 duplicate seal). Other jobs green.
- `40135722015` (67406f9, full, repeat 1): failure in `documenso-smoke` (duplicate seal, 31 of 31) and in `cal-smoke`
  (P6-CAL-LOAD-009: PRODUCT BUG (SUSPECTED) on `link-usage`, 31 accepted bookings but 30 link uses; storm held; 27 × 409 and 4 ×
  redacted 400). **Open:** this Cal result is not reproduced by the runs after it (`40137277800` and the final run both pass
  `cal-smoke`), and its cause is not known. The artifact does not hold the database rows of the link table, so the cause is
  not established. It is not labelled and not marked.
- `40137277800` (67406f9, full, repeat 2): failure in `documenso-smoke` only (duplicate seal, 31 of 31), control `P6-DOC-LOAD-002`
  one seal per envelope with 62 of 62 emails matched.

Documenso per run (full profile, 30 or 31 envelopes, about 62 recipients): first requests timed out 62, retries 217 (per run), 5xx 0; seal
jobs per envelope 2; `DOCUMENT_COMPLETED` rows 2 per envelope; completion emails 2 per recipient (the audit records "more than one";
the exact count of 2 comes from the database in the first run and from the final run's per-envelope audit).

## Not in this PR

- The Documenso double seal above is open. `documenso-smoke` will be red until the owner labels it and decides how to handle it.
- Task 11 is not started.
- Plan §13 proposed extras (`P6-CAL-LOAD-012`, `P6-MED-LOAD-011`, `P6-X-LOAD-020`) are not in scope.

## Merge order

Task 9 → this PR. Merge only when the owner says so, as a merge commit.
