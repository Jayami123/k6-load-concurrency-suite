# Task 4 PR (not created: owner opens it)

Base: feat/2026-10-24-p6-load-foundation (Task 3). Merge order: Task 1, Task 2, Task 3, then this PR.
Head: feat/2026-10-24-p6-load-validity
Title: feat(load): add run validity, run metadata and the readiness preflight (P6-X-LOAD-004)

Body:

Stacked on the Task 3 PR (feat/2026-10-24-p6-load-foundation). Merge order: Task 1, Task 2, Task 3, then this PR.

## What and why

Every LOAD run now gets a VALID or INVALID verdict with reasons before any pass or fail is read, plus a `run-meta.json` that says
where and with what it ran (P6-RULE-003). INVALID runs are excluded from medians (P6-RULE-005). The readiness preflight replaces the
health smokes (D10). Plan: docs/plans/2026-10-24-p6-phase3-task4-load-validity.md.

## Commits

- feat(load): read cpu and memory from /proc and judge run validity (steps 1 and 2 in one commit: they share the types file)
- feat(load): write run-meta.json for every run
- fix(load): keep the run-meta limits to the validity limits (found in review of the previous commit, unpushed)
- feat(load): add the readiness preflight that replaces the health smokes
- feat(load): exclude invalid runs from medians and label published numbers
- feat(load): wire validity, run metadata and readiness into the runner
- feat(ci): add the LOAD table to the job summary
- ci(perf): run the validity self-test and print the runner identity
- docs: explain valid and invalid runs

## Verification

- `npm run check`: # tests 601 / # pass 601 / # fail 0 (Task 3 baseline 557; +44 per the plan).
- Local `npm run load:selftest` (P6-X-LOAD-001, PR profile): PASS. Open 1200 requests, 0 dropped, p95 1009 ms; closed 997 requests,
  p95 28 ms; under-sized 1032 requests, 168 dropped. R1 to R6 pass. Token scan and cleanup pass.
- Local `npm run load:validity-selftest` (P6-X-LOAD-004, PR profile): PASS. Normal run VALID (1201 requests, 0 dropped, peak 80 of
  120 VUs); saturated run INVALID with `dropped_iterations` (168) and `vu_exhausted` (5 of 5), as expected.
- Resource sampling worked on this VM (/proc): normal run k6 0.05 cores average, runner 41 % busy average, memory available 93 %.

## CI

perf.yml workflow_dispatch on this branch, run 40080601245 (head 2f1cc6d): `load-selftest` success (job 2 min 53 s: the
coordinated-omission self-test 1 min 32 s, the validity self-test 1 min 2 s, the LOAD table and runner identity under 1 s each).
The cal jobs failed at `Start Cal (harness up)` with the inherited Task 1 listener-pid error; medusa-smoke was still in its race
step when this was written. Other jobs: medusa-cancel-extras, medusa-order-races, medusa-multi-instance (both legs), documenso-smoke,
twenty-smoke, twenty-races, twenty-obs all success.

## Budget

Plan §10: validity self-test estimate 1.3 min, cap 3; measured locally 62 s for two runs. Job summary cap 2, runner identity cap 1.

## Deviations

- Steps 1 and 2 are one commit (both change src/load/types.ts). A fix commit repairs run-meta's limits (the first version had a
  VU formula the plan does not define); it was found before any push.
- `LoadContext.meta` and `K6RunResult.validity` / `resources` are optional (additive). Task 3's tests and types keep compiling.
- The validity judge runs inside the reconcile slot, composed before the case's own reconcile (`seqStages`), so the relations of
  Task 3 still run after it. The plan puts the judge in the reconcile slot first; the order is the same.
- P6-X-LOAD-001's under-sized run now declares `expectValidity: INVALID` with `dropped_iterations`. Without it, Task 4's rule
  would make the Task 3 self-test INVALID. This is the expected verdict of an under-sized run, not a relaxed assertion.
- P6-X-LOAD-001's closed run uses 4 VUs (was 10). With 10, the closed run sent 2489 requests against 1201 for open, failing R3
  (measured on this VM, before the change). 4 VUs is the probe's configuration (1008 requests in the probe).
- `write-ci-job-summary.ts` appends the LOAD table only when `results/load/**/verdict.json` exists.

## Environment changes

None for Cursor Cloud or Claude Code cloud. (/proc is read; no new tool or host.)

## Escalation check (Task 4)

- Product bug suspected or label proposed: no.
- CI/runner/harness change: YES. Two new steps in `load-selftest` (validity self-test, LOAD table) and the runner identity step.
- Environment change: none.
- Unexplained red CI: the cal jobs are red from the inherited Task 1 pin (explained in Task 1's body).
- Timeout raised, test merged or split, or assertion weakened: no (the self-test case's undersized expectation is documented above).
- Secret printed, "Jayami" or footer line added, git add -A, or force-push: no.
