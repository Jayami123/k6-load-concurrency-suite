# Task 2 PR (not created: owner opens it)

Base: chore/2026-10-24-p6-harness-bump (stacked on Task 1; merge order: Task 1, then this PR)
Head: feat/2026-10-24-p6-med-multi-instance
Title: feat(medusa): add the two-instance oversell races (P6-MED-RACE-002, -003)

Body:

Stacked on the Task 1 PR (chore/2026-10-24-p6-harness-bump). Merge order: Task 1, then this PR.

## What and why

Adds `P6-MED-RACE-002` (two Medusa backends, Redis lock: orders ≤ S) and `P6-MED-RACE-003` (two backends, in-memory
lock: characterization, the oversell is expected). Plan: docs/plans/2026-10-24-p6-phase3-task2-med-multi-instance.md.

## Commits (one per plan step)

- feat(medusa): let cart completion target a chosen backend (+3 tests)
- feat(medusa): read the lock provider and request counts from the harness logs (+7)
- feat(medusa): add the two-instance traffic and memory-lock characterization checks (+9)
- feat(medusa): run oversell trials across several backends (run-case, no new test)
- feat(ci): summarise the two-instance cases (+3)
- test(medusa): add P6-MED-RACE-002 and P6-MED-RACE-003 (two specs)
- ci(perf): run the two-instance races in a two-leg job (new job medusa-multi-instance, grep-invert of medusa-smoke)
- docs: document the two-instance races (README, .env.example P6_MEDUSA_LOG_DIR)

## Verification

- `npm run check`: # tests 503 / # pass 503 / # fail 0 (Task 1 baseline 481; +22 per the plan).
- `npx playwright test --project=medusa-race --list`: both ids listed.
- Local probes on the cloud VM (harness `up:medusa` / `down:medusa` only, harness v0.2.14):
  - Redis leg: both backends healthy, both log `locking-redis` provider; `-002` 2 trials: 1 passed (57 s). Histogram:
    orders 3 = S, oversold 0, i0_200 2 and i1_200 1 (both backends served completes), no violations.
  - Memory leg: both backends log `Using "in-memory" as default`; `-003` 3 trials: verdict pass, oversold in 3 of 3
    valid trials (4, 5, 4 orders against S = 3). Hard invariants held in every trial. Characterization, as planned.
  - `down:medusa` exit 0 both times; no listener on 9000, 9001, 5433, 6380 afterwards.

## CI

perf.yml workflow_dispatch on this branch: run 40078055622 (head c01e217), conclusion failure, both new legs green.

| Job                                                     | Conclusion | Measured                                                                        |
| ------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------- |
| medusa-multi-instance (redis)                           | success    | job 8 min 33 s; start Medusa 55 s; race P6-MED-RACE-002 at 50 trials 6 min 50 s |
| medusa-multi-instance (memory)                          | success    | job 7 min 32 s; start Medusa 50 s; race P6-MED-RACE-003 at 50 trials 5 min 56 s |
| medusa-smoke, medusa-order-races, medusa-cancel-extras  | success    | none                                                                            |
| documenso-smoke, twenty-smoke, twenty-races, twenty-obs | success    | none                                                                            |
| cal-smoke, cal-state-races                              | failure    | Start Cal (harness up): the inherited listener-pid error (Task 1 PR body)       |

The dispatch runs used the 50-trial count (only pull requests use 3 and 8), so the PR trial counts are not yet measured in CI.
The memory leg's `-003` spec asserts at least one oversell and passed, which confirms the characterization in CI.

Budget (plan §10, estimates against measured): the new job's race step estimate was 14.1 min (main and dispatch), measured 6.8 and
5.9 min; the start estimate 1.0 min, measured 0.9 and 0.8 min. Job timeout 45 min: 36 min of margin at the measured job time.
The cal jobs are red from the inherited Task 1 pin, not from this PR.

## Budget

Plan estimates for the new job: leg 24.8 min (estimates), 27.6 min (at caps), job timeout 45 min. Measured CI numbers
are added after the run.

## Deviations

- The live probe ran after the build, not before it (the probe here verifies the built code; the plan's §5 check 6 is
  run on the tag). Same commands, same expected lines.
- `.env.example` got P6_MEDUSA_LOG_DIR (plan §11), added with the docs step.
- The Medusa admin volume `qa-harness-medusa_medusa_harness_pg` was removed once between the two local probes (it held a
  previous probe's admin with a different random password; CI starts with a fresh database).

## Environment changes

None for Cursor Cloud or Claude Code cloud. Observed: the Claude Code cloud session exports
NODE_OPTIONS=--use-openssl-ca, which makes the harness drop its 8192 MB heap for `next build` (Cal only).

## Escalation check (Task 2)

- Product bug suspected or label proposed: no. `-003` oversell is the expected characterization, annotated, not a bug.
- CI/runner/harness change: YES. New CI job `medusa-multi-instance` (two legs), grep-invert change in `medusa-smoke`.
- Environment change: none.
- Unexplained red CI: the cal jobs are red from the inherited Task 1 pin (explained, see Task 1's body).
- Timeout raised, test merged or split, or assertion weakened: no.
- Secret printed, "Jayami" or footer line added, git add -A, or force-push: no.
