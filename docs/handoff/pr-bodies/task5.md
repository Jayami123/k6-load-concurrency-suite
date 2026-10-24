# Task 5 PR (not created: owner opens it). PARTIAL: see "Not built".

Base: feat/2026-10-24-p6-load-validity (Task 4). Merge order: Task 1, Task 2, Task 3, Task 4, then this PR.
Head: feat/2026-10-24-p6-load-telemetry
Title: feat(load): add the telemetry sampler, clock markers, the chart and the telemetry and overhead self-tests (partial)

Body:

Stacked on the Task 4 PR. Merge order: Task 1, Task 2, Task 3, Task 4, then this PR.

## What and why

An outside-only sampler for each LOAD run (one row per second: the application process group's CPU, RSS and fds, and the
sampler's own cost), a clock marker per run (the k6 side measures the offset between its clock and the marker server's),
one self-contained chart per run, and two self-tests: `P6-X-LOAD-002` (telemetry: a normal run is VALID; a forced stall is
`telemetry_gap`; a skewed marker is `clock_skew`) and `P6-X-LOAD-006` (sampler overhead within margins). Plan:
docs/plans/2026-10-24-p6-phase3-task5-load-telemetry.md.

## Commits

- feat(load): detect gaps and judge clock skew (+11)
- feat(load): read the application process group from its pid record (+7)
- feat(load): add the sampler loop and its output files (+5)
- feat(load): render the correlated chart as one self-contained html file (+8, also the points aggregate)
- feat(load): wire the sampler and the clock markers into the runner, and add the telemetry self-test (no new tests)
- feat(load): add the sampler-overhead self-test with per-run telemetry switch (+2)
- ci(perf): run the telemetry and overhead self-tests (new job load-overhead)
- docs: explain how to read the chart
- docs(handoff): save the task 5 pr title and body (this file)

## Verification

- `npm run check`: # tests 634 / # pass 634 / # fail 0 (Task 4 baseline 601; +33 new tests, see Not built).
- Local `npm run load:telemetry-selftest` (P6-X-LOAD-002): PASS. normal VALID (32 samples, no gap, skew 2 ms); forcedGap
  INVALID with `telemetry_gap` (gap 4501 ms); forcedSkew INVALID with `clock_skew` (2500.5 ms).
- Local `npm run load:overhead-selftest` (P6-X-LOAD-006): PASS. Without the sampler: 800 to 801 requests, p95 1014 to 1031 ms;
  with it: 803 requests, p95 1016 to 1040 ms; no drops.
- CI: `perf.yml` workflow_dispatch on this branch, run 40081738239 (head fc1141b). At 09:30 UTC the run was still in progress.
  Finished: `load-overhead` success (4 min), `load-selftest` success (2 min), `twenty-smoke`, `twenty-races`, `twenty-obs` and
  `medusa-cancel-extras` success; `cal-smoke` and `cal-state-races` failed at `Start Cal (harness up)` (the inherited Task 1
  listener-pid error). Still running at that time: `medusa-smoke`, `medusa-order-races`, `medusa-multi-instance` (both legs),
  `documenso-smoke`. The final result is on the run page; it is not recorded here.

## Budget

New job `load-overhead`: estimate not in the plan's table (the plan's §10 budget is not built here). Local: the telemetry
self-test 94 s, the overhead self-test 167 s (8 runs of 20 s). Job timeout 20 min; steps capped at 4 and 6 min.

## Not built (from the plan; decide at review)

- Sources `pg` (database sessions, locks, counters), `container` (cgroup and `docker stats`), `log` (product log counters) and
  `probe` (timed health probe). None applies to the stub cases; they belong with the product cases (Task 7). The sampler's
  `sources` object says so for the proc source only.
- Plan §6.1 modules `telemetry/pg-stats.ts`, `telemetry/cgroup-stats.ts`, `telemetry/log-grep.ts`, `telemetry/probe.ts` and their
  tests (pg 6, cgroup 7, log 7 tests).
- The live output of the `markers`/`samplerStart`/`samplerStop` stages is folded into `runAllK6` (per run, not per case): the
  sampler must start before k6 does, so the hook is inside the k6 stage.
- Plan's `telemetry-stages` tests (2) and `k6/lib/markers.js` clock helper tests: the helper is covered by the self-test runs.
- Test count: 33 new tests, plan 56. Named tests not written: pg-stats, cgroup, log-grep, the two `telemetry-stages` tests.
- `P6-X-LOAD-002`'s "pg panels say source absent" and the `log` panel: the chart has eight panels, none of them database or log panels.

## Deviations

- The sampler is started and stopped inside the k6 stage (per run), not in separate samplerStart/samplerStop stages (see above).
- The stub case's app process: the stub runs in the runner's process, so the proc source is absent for the stub; the gap and
  skew checks do not need it (they use the sample times and the marker).
- A closed run's VU count and the forced-gap `injectGapMs` are test-only inputs (documented in the types).

## Environment changes

None for Cursor Cloud or Claude Code cloud (no tool, host or setting). /proc is read.

## Escalation check (Task 5)

- Product bug suspected or label proposed: no.
- CI/runner/harness change: YES. New job `load-overhead` (two self-tests, the token scan, the upload).
- Environment change: none.
- Unexplained red CI: the cal jobs are red from the inherited Task 1 pin (explained in Task 1's body).
- Timeout raised, test merged or split, or assertion weakened: no.
- Secret printed, the owner name or footer line added, git add -A, or force-push: no.
