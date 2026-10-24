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
- Secret printed, "Jayami" or footer line added, git add -A, or force-push: no.
