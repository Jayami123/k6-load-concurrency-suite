# Task 6 PR (not created: owner opens it). PARTIAL: the pure audits are built; the live readers are not.

Base: feat/2026-10-24-p6-load-telemetry (Task 5). Merge order: Task 1, Task 2, Task 3, Task 4, Task 5, then this PR.
Head: feat/2026-10-24-p6-load-reconciliation
Title: feat(load): add the post-load audits for Cal, Medusa and Documenso as pure checks (partial, P6-X-LOAD-005)

Body:

Stacked on the Task 5 PR. Merge order: Task 1, Task 2, Task 3, Task 4, Task 5, then this PR.

## What and why

After a LOAD run, the product's own invariants are checked on the run's data: Cal (accepted bookings match what the client was
told; no overlapping accepted pairs, counted under P6-OBS-CAL-002), Medusa (no oversell, reservations and inventory agree, one
payment per order, capture and refund caps, ghost orders counted under F-M2) and Documenso (drain, one seal per completed
envelope, client count matches, double seals counted under P6-OBS-DOC-002). A violation is a PRODUCT BUG or a TEST BUG; a known
bug is counted, not failed, except when it appears where it should not (an unexpected double seal with sequential completions
fails the run, owner Q1). Plan: docs/plans/2026-10-24-p6-phase3-task6-load-reconciliation.md.

## Commits

- feat(load): define the audit result and the cal reconciliation (+7)
- feat(load): reconcile medusa stock, reservations and balances after a run (+11)
- feat(load): reconcile documenso seals and drain after a run (+8)
- feat(load): compose the audit stages and map findings to the stage result (+6)
- docs(handoff): save the task 6 pr title and body (this file)

## Verification

Archived snapshot as of fd9c789 (2026-10-24). The counts and the live-audit status below are as of that commit, not the current head.

- `npm run check`: # tests 666 / # pass 666 / # fail 0 (Task 5 baseline 634; +32 new tests, see Not built).
- Every evaluator is pure and tested on fixtures: clean snapshots pass; each named violation and each known bug is asserted.
- No product is started by this branch. No live audit has run yet: `P6-X-LOAD-005` is unit-evidenced until Task 7 (plan Q4).

## CI

perf.yml workflow_dispatch on this branch, run 40081928914 (head cd63a80). At 09:30 UTC the run was still in progress. Finished:
`cal-smoke` and `cal-state-races` were running `Start Cal (harness up)` (the inherited Task 1 listener-pid error), and `twenty-smoke`,
`medusa-cancel-extras` succeeded. Still running at that time: the rest, including `load-selftest` and `load-overhead`. The final
result is on the run page; it is not recorded here. No job changes in this PR, so CI checks that the stack still passes.

## Budget

No CI change: no budget change.

## Not built (decide at review)

- The live readers: `readCalSnapshot`, `readMedusaSnapshot`, `readDocumensoSnapshot`, `waitForDrain` over a pool (the pure
  `waitForDrain(countStuck)` is built and tested). Needs the product databases (Task 7).
- The stage that reads the product, writes `audit.json`, runs the token scan and the cleanup leak check (`reconcileStage` in
  `src/load/reconcile/index.ts`). Not wired into the runner: the stub cases have no audit, so the wiring would be unused today.
- Plan §6.4 Medusa payments SQL; plan §6.6 `reconcileStage`; plan §6.7 `P6-X-LOAD-005`.
- Test count: 32 new tests (cal 7, medusa 11, documenso 8, index 6), plan 33 (the plan's index list names 7 tests; 6 are written).

## Deviations

- The audits take plain snapshots (no `pg` import) so the checks are unit-testable without a database.
- `addFinding` counts known bugs with a multiplier (`count`), so Cal overlaps and Medusa ghost orders are counted in full.

## Environment changes

None for Cursor Cloud or Claude Code cloud.

## Escalation check (Task 6)

- Product bug suspected or label proposed: no. Known bugs are counted under their existing ids only.
- CI/runner/harness change: no.
- Environment change: none.
- Unexplained red CI: the cal jobs are red from the inherited Task 1 pin (explained in Task 1's body).
- Timeout raised, test merged or split, or assertion weakened: no.
- Secret printed, the owner name or footer line added, git add -A, or force-push: no.

## RACE-003 red on run 40081928914 (memory lock, two instances)

Artifact `race-histograms-medusa-multi-instance-memory` (id 12555533333) of run 40081928914, head cd63a80. Source file
`races/P6-MED-RACE-003.json` in the artifact; verdict `fail`.

- 45 of 50 trials oversold (1 unit over stock): the expected characterization. The characterization assertion
  (`expect(oversold).toBeGreaterThanOrEqual(1)`) is not what failed.
- Two trials (17 and 20) failed the per-trial invariant `src/medusa/invariants.ts:443-446`:
  `PRODUCT BUG: 7 orders exceed instances x S = 6` (`uniqueOrderIds > instances * s`, with s = 3, instances = 2).
  Evidence: trial 17 `statusCounts {200: 7, 400: 8}`, `i0_200 = 4`, `i1_200 = 3`; trial 20 `i0_200 = 3`, `i1_200 = 4`.
  In both, `reserved = 3` and `available = 0` on the stock row, yet 7 orders were accepted with 7 reservation rows.
- Label withdrawn. The `instances x S` bound was a test bug, removed in 64fc6db (memory-lock hard invariants). No such bound is
  asserted now. Runs 40081928914 and 40096192555 are historical failures, kept here for the record.
- The top-level `expect(histogram.verdict).toBe("pass")` stays and stays red for this run. Not weakened.

## CI run 40096192555 (workflow_dispatch, head 3237fe9)

| Job                            | Conclusion                        | Duration    |
| ------------------------------ | --------------------------------- | ----------- |
| medusa-multi-instance (memory) | **failure** (RACE-003 red)        | 8 min 33 s  |
| medusa-smoke                   | **failure** (`Check`: unit tests) | 0 min 44 s  |
| cal-state-races                | success                           | 12 min 32 s |
| medusa-multi-instance (redis)  | success                           | 10 min 19 s |
| medusa-order-races             | success                           | 16 min 50 s |
| documenso-smoke                | success                           | 9 min 05 s  |
| cal-smoke                      | success                           | 7 min 40 s  |
| load-overhead                  | success                           | 4 min 36 s  |
| load-selftest                  | success                           | 2 min 53 s  |
| medusa-cancel-extras           | success                           | 5 min 05 s  |
| twenty-smoke                   | success                           | 3 min 53 s  |
| twenty-obs                     | success                           | 4 min 25 s  |
| twenty-races                   | success                           | 5 min 23 s  |

**RACE-003 (same finding as above, second run).** Artifact `race-histograms-medusa-multi-instance-memory` (id 12561247464),
`races/P6-MED-RACE-003.json`, commit 3237fe9, verdict `fail`. 49 of 50 trials oversold. One trial failed the invariant
`src/medusa/invariants.ts:443-446`: trial 36, `PRODUCT BUG: 7 orders exceed instances x S = 6`. The first run had two such trials
(17 and 20). Label: **PRODUCT BUG (SUSPECTED)**, unchanged. The assertion `expect(histogram.verdict).toBe("pass")` is not changed.

**medusa-smoke `Check` failure: TEST BUG (stale cache-key suffix).** The failing unit test is
`tests/unit/harness-pin.test.ts` "is the suffix of every build cache key in perf.yml". On 3237fe9 one build key from the
Task 2 job `medusa-multi-instance` still said `-h0.2.14` (`.github/workflows/perf.yml`, the medusa build key), while the
pin is v0.2.15. The same test failed locally on the same content (`expected ['0.2.15'], actual ['0.2.15', '0.2.14']`).
This is the drift check doing its job; the key came from Task 2's new job, which was written before the pin bump. Fixed on
Task 2 (`ci(perf): move the medusa multi-instance build key to harness v0.2.15`) and merged up. It did not change any product
or test result. The fix landed after this run's head, so the next dispatch of this branch re-tests it.

## Live audit.json (run 40119155757, head 778d50b)

The plan (§12, "the first product run") asks for the live `audit.json` of a product run. The three journey cases of that run produced
them; artifacts `load-cal`, `load-medusa` (downloaded and read on 2026-10-24).

| Case                                      | Verdict | audit.json: rows | Checks                                                                                                            | Violations | knownBugs | Leak |
| ----------------------------------------- | ------- | ---------------- | ----------------------------------------------------------------------------------------------------------------- | ---------- | --------- | ---- |
| P6-CAL-LOAD-001 (cal)                     | PASS    | 61 live bookings | rows, accepted-only, client-matches-db (61 = 61), no-overlap                                                      | none       | none      | none |
| P6-MED-LOAD-001 (medusa)                  | PASS    | 31 orders        | orders-le-stock (31 of 50), reservations, available, one-payment-per-order, balances, no-ghost-orders (31 = 31)   | none       | none      | none |
| P6-MED-LOAD-002 (medusa, stock exhausted) | PASS    | 15 orders        | orders-le-stock (15 of 15), reservations, available 0, one-payment-per-order, balances, no-ghost-orders (15 = 15) | none       | none      | none |

Documenso: the live `audit.json` of P6-DOC-LOAD-002 came from a local run of this session on the Documenso stack (11 envelopes, sealed
once, client-matches-db 11 = 11, drain 528 ms, no leak). It is not in CI; the Documenso journey's CI artifact was not read here.
