# Task 10 PR (not created: the owner opens it)

Base: feat/2026-10-24-p6-doc-load-pipeline-lag (Task 9), with `main` at 62f689e merged in
Head: feat/2026-10-24-p6-retry-storms
Title: feat(load): add the retry storm cases (P6-CAL-LOAD-007, P6-CAL-LOAD-009, P6-MED-LOAD-006, P6-DOC-LOAD-007)

## Body

## What and why

Plan task 10 (docs/plans/2026-10-24-p6-phase3-task10-retry-storms.md). One intent is one logical request. The client gives up
after a short timeout, so the server finishes a request the client never sees, and the same body is sent again. The cases check
that the storm happened and that each intent still had one effect.

- **Retry plan** (`k6/lib/retry.js`, pure): `buildPlan`, `classifyAttempt`, `runAttempts`. Short storm attempts first; the final
  attempt waits for the server (30 s) so every intent ends with an answer.
- **Storm judge** (`src/load/retry-validity.ts`): `judgeStorm` (at least half of the first attempts timed out, every timeout
  retried). It also holds the shared `RetryCounters`, `RetryFinding` and `RetryJudgement` types.
- **Audits** (`src/load/retry-audit/{cal,medusa,documenso}.ts`): pure judges with read-only readers.
  - Cal: one accepted booking per intent; redacted 400 and 409 counted; per-intent join of each booking to its link's usage, before
    and after the run (`judgeCalLinkJoin`), written to `audit.json` on every run.
  - Medusa: one order and one payment per intent; reserved equals orders; one order id per intent.
  - Documenso: one seal, one `DOCUMENT_COMPLETED` row, every recipient signed, one completion email per recipient.
- **Cal private links** (`src/load/products/cal.ts`): `calSetup({ privateLinks: true })` sets planned + 2 cap-1 links, keeps the host
  cookie in `ctx.secrets`, records each link's usage before the run, and cleanup restores the prior links (a failed restore is
  `TEST BUG: prior links not restored`).
- **Journeys and cases**: `k6/journeys/{cal-book,med-checkout,doc-sign}.js` take `opts.retryPlan` (unchanged without it). The
  retried request goes through `retried()` in `k6/lib/http.js`. Cases `k6/cases/{cal-load-007,cal-load-009,med-load-006,doc-load-007}.js`
  and their example JSON are registered in `src/load/cases.ts`. `package.json` has four `load:*-retry` commands.
- **Known-bug gate** (`src/load/known-bug-gate.ts`, pure; one gate, in the case's own verdict): a case declares its known bugs in
  `LoadCase.knownBugs`. `P6-DOC-LOAD-007` declares `P6-OBS-DOC-005`.
  - KNOWN BUG when the declared bug is observed: the duplicate seal job, the completed audit row count != 1, or the duplicate
    completion emails. The Task 6 audit files the same duplicate under the declared ID, so it is not "unexpected".
  - FAIL when the declared bug is not observed (the product is fixed: remove the marker).
  - FAIL when any other violation appears (for example a 5xx or a document not COMPLETED).
  - FAIL when the storm checks or `audit.json` are missing.
  - Four unit tests cover the four outcomes (known bug only; bug absent; extra violation; missing audit).
- **CI** (`.github/workflows/perf.yml`): one LOAD step in `medusa-load` (`P6-MED-LOAD-006`), two in `cal-smoke` (`-007`, then `-009`
  last, because it restores the shared event type's links), one in `documenso-smoke` (`P6-DOC-LOAD-007`). Each has
  `timeout-minutes`; no existing job timeout was raised. No separate gate step and no `continue-on-error`: the case verdict gates.
- **README**: four standalone commands, a section on what each judge checks, and the `P6-OBS-DOC-005` known-issues entry with its
  evidence, suspected area and removal condition.

Unit tests: the Task 9 tip measures 775; this task adds +34 (its plan steps: +9 retry plan, +3 storm judge, +8 cal audit, +6 medusa
audit, +5 documenso audit, +3 cal private links) = 809. Merging `main` brings 2 more (811). The owner decision round adds 7 (+4 known-bug
gate, +3 cal link join) = 818.

## Cal `P6-CAL-LOAD-009`: the link-usage mismatch

Repeat 1 of the full profile (`40135722015`, before the diagnostics) failed: 31 accepted bookings, 30 link uses. The owner asked for
per-intent diagnostics and three repeats.

- Diagnostics: per intent, the booking id, uid and status, the link, the usage before and after the run, and any accepted booking
  whose link shows no use. Written to `audit.json` on every run.
- First diagnostic run (`40141368545`) failed as a TEST BUG of the audit: the join covered the two spare links that setup creates
  beyond the iterations that ran. Fixed in `c48faff`: the join covers the intents that ran (`p6_intents`) only.
- Repeats on the fixed head `c48faff`: `40142908660` PASS (31 join rows, none flagged), `40144142420` PASS (30 rows, none flagged),
  `40145366743` PASS (31 rows, none flagged).
- Across the `-009` runs on this branch, one of four failed (the repeat before the diagnostics). Its root cause is not established:
  the artifact of that run has no per-intent rows. It is not labelled and not marked.

## Live runs (earlier session, harness v0.2.15, k6 v2.3.0, PR profile)

| Case            | Result                   | Evidence                                                                                                                                      |
| --------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| P6-CAL-LOAD-007 | PASS                     | 10 of 10 first attempts timed out, 30 retries; 10 accepted bookings for 10 intents; 1 redacted 400 (P6-OBS-CAL-001), 9 × 409 (counted); 0 5xx |
| P6-CAL-LOAD-009 | PASS                     | 11 of 11 first attempts timed out, 33 retries; 11 bookings, 11 link uses                                                                      |
| P6-MED-LOAD-006 | PASS (VALID)             | 11 of 11 first attempts timed out, 33 requests; 11 orders, 11 payments, reserved equals orders; 0 order-id mismatches                         |
| P6-DOC-LOAD-007 | KNOWN BUG P6-OBS-DOC-005 | see the known-issues entry in the README                                                                                                      |

## Deviations from the plan (each one is in the commits)

1. `calSetup` is a factory now (`calSetup({})` for `P6-CAL-LOAD-001`, `calSetup({ privateLinks: true })` for `-009`).
2. The plan's `documensoSetup({ webhookMode })` is the existing `makeDocumensoSetup({ webhookMode })`.
3. The retry transport (`sendStep`, `retried`, the counters) is in the existing `k6/lib/http.js`, not a new file. `k6/lib/retry.js`
   stays free of k6 imports.
4. The final attempt carries `parallelRetries` (`buildPlan`), so Documenso sends 1 + 3 requests as the probe describes.
5. The shared judge types (`RetryCounters`, `RetryFinding`, `RetryJudgement`) are in `src/load/retry-validity.ts`. The plan's file
   list has no shared types file, and the three audits need the same shape.
6. **`P6-MED-LOAD-006` `maxLatencyMs` 6000, not the plan's 2000 to 4000 range (accepted by the owner).** Evidence: the slowest
   iteration on the VM was 5.7 s (iteration durations averaged 4.3 to 4.5 s on the first runs). With 4000 the case pre-allocated 5
   VUs, one arrival was dropped, and the run was INVALID in 2 runs in a row. With 6000 it pre-allocates 8 VUs and passes VALID with
   no dropped iteration. The dropped-iteration check is unchanged. The sizing input is the slowest iteration, so it follows the
   measurement, not the probe.
7. The Documenso storm counts each recipient's first request, two per intent, so the storm ratio is per request. The judge's
   denominator is the intents, so the reported ratio is above 1 (for example 62 of 31). The storm test still holds at ≥ 0.5.
8. `main` (62f689e) is merged in with `--no-ff`. The one conflict was an import list in `tests/unit/load-runner.test.ts`; both imports
   are kept.
9. The known-bug gate replaces a separate Playwright gate step and its `continue-on-error`, at the owner's decision. The Documenso
   audit gets the declared IDs from the case (`knownBugs` on the audit config); no other audit changes.

## Documenso `P6-DOC-LOAD-007`

KNOWN BUG `P6-OBS-DOC-005`, confirmed by the owner in 3 CI runs and 2 local runs. In the full-profile CI runs, every envelope has two
seal jobs about 0.3 s apart, two `DOCUMENT_COMPLETED` rows and two completion-email jobs per recipient. The no-retry control
`P6-DOC-LOAD-002` gives one seal per envelope in the same runs. The suspected area is `completeDocumentWithToken` (read-only); the
cause is not established.

## CI

Final head: see the status line added below after the final dispatch.

## Not in this PR

- The Documenso duplicate seal is a known product bug (P6-OBS-DOC-005) and stays open until the product fixes it.
- The Cal `-009` failure before the diagnostics is not established (see above).
- Task 11 is not started.

## Merge order

Task 9 → this PR. Merge only when the owner says "merge", as a merge commit.
