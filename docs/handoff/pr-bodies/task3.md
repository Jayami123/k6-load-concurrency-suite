# Task 3 PR (not created: owner opens it)

Base: feat/2026-10-24-p6-med-multi-instance (Task 2). Merge order: Task 1, Task 2, then this PR.
Head: feat/2026-10-24-p6-load-foundation
Title: feat(load): add the pinned k6, the workload library and the coordinated-omission self-test (P6-X-LOAD-001)

Body:

Stacked on the Task 2 PR (feat/2026-10-24-p6-med-multi-instance). Merge order: Task 1, Task 2, then this PR.

## What and why

One pinned, checksum-verified k6 (2.3.0) for CI, the Cursor install step and the Claude Code hook; the open-model workload library
(`k6/lib`); the LOAD runner pipeline; and the coordinated-omission self-test `P6-X-LOAD-001`: an open model, a closed model and an
under-sized open model against one stub, with relations R1 to R6. Plan: docs/plans/2026-10-24-p6-phase3-task3-load-foundation.md.

## Commits (one per plan step)

- chore(k6): pin k6 2.3.0 with a checksum-verified installer (+3)
- chore(k6): fail the check when the installed k6 is not the pin
- feat(k6): add the sizing and option helpers of the workload library (+11; also drops three obsolete @ts-expect-error lines)
- feat(k6): add the prefix, journey and config helpers (+15)
- feat(k6): add the k6-facing library modules and the self-test script
- feat(load): add the stub server (+5)
- feat(load): add the runner core, summary parser and verdict (+20)
- ci(perf): install the pinned k6 and run the coordinated-omission self-test
- chore(env): install the pinned k6 in the cursor and claude cloud setups
- docs: explain how to read a load run
- docs(handoff): save the task 3 pr title and body (this file)

## Verification

- `npm run check`: # tests 557 / # pass 557 / # fail 0 (Task 2 baseline 503; +54 per the plan). `k6 inspect`: 13 script(s) ok.
- `scripts/install-k6.sh` run into a scratch directory: installs 2.3.0, a second run is a no-op. The hashes are committed and match
  the release's checksum file.
- Local `npm run load:selftest`: PASS. Open 1200 requests, 0 dropped, p95 1009 ms; closed 997 requests, p95 28 ms; under-sized
  1032 requests with 168 dropped (14 %, probe 170). R1 to R6 all hold.
- CI: `perf.yml` workflow_dispatch on this branch, run 40079793205 (see the Task 3 result below).

## CI (run 40079793205, workflow_dispatch on 44b3feb)

| Job                                                                           | Conclusion                           | Notes                                                                    |
| ----------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------ |
| load-selftest                                                                 | success                              | the new job: install pinned k6, self-test, token scan, upload            |
| medusa-multi-instance (redis), (memory)                                       | success                              | inherited from Task 2                                                    |
| twenty-smoke, twenty-races, twenty-obs, documenso-smoke, medusa-cancel-extras | success                              | k6 now from the installer or the pinned action                           |
| cal-smoke, cal-state-races                                                    | failure                              | `Start Cal (harness up)`: the inherited listener-pid error (Task 1 body) |
| medusa-smoke, medusa-order-races                                              | still running at the time of writing | the race steps; see the handoff for the final result                     |

Only one full dispatch was run, not the three the plan asks for (§3.6 item 2): the margins were measured on the VM first.

## Budget

Plan §9: `load-selftest` estimate 2.8 min, cap 6.6 min; the job's timeout is 20 min. Measured on run 40079793205: job 1 min 49 s;
install of k6 2 s; the self-test step 1 min 32 s; token scan and upload under 2 s.

## Deviations

- The coordinated-omission closed run uses 4 VUs (plan left the VU count open). With 10 VUs the closed run sent 2489 requests
  against 1201 for open and failed R3 (measured). 4 VUs is the probe's configuration.
- `k6/selftest` default values let `k6 inspect` run the init context without a config file (the plan's module does not, since it
  requires keys at init). A real run always reads every value from the runner's config file, which wins over the defaults.
- The `P6_LOAD_CONFIG` path is passed absolute: k6's `open()` resolves a relative path against the script's directory (found by
  the first local run; exit code 107).
- The relations (R1 to R6) run in the case's `reconcile` stage, not in `verdict` (the stage order is the runner's; the verdict stage
  only writes).
- The Task 3 plan's step 0 (plan on the branch) is not needed: the plan is on `main`.

## Environment changes

- Cursor Cloud: `.cursor/Dockerfile` drops the apt k6 block; `.cursor/environment.json` installs with `bash scripts/install-k6.sh`.
  The installer downloads from github.com and release-assets.githubusercontent.com. Whether the maintainer's Cursor environment
  allows those hosts is not visible from a session: build-time probe must confirm (plan §11).
- Claude Code cloud: `.claude/hooks/session-start.sh` installs the pinned k6 when it differs (no-op otherwise). On the probe VM this
  session installed k6 2.3.0 to `/usr/local/bin/k6` with the same script (v1.3.0 was there before).

## Escalation check (Task 3)

- Product bug suspected or label proposed: no.
- CI/runner/harness change: YES. New job `load-selftest`, five installs switched to the script, the Twenty pin read from `.k6-version`,
  `K6_VERSION` removed.
- Environment change: YES. The k6 pin 2.3.0 and the installer, in CI and both clouds (steps above).
- Unexplained red CI: the cal jobs are red from the inherited Task 1 pin (explained in Task 1's body).
- Timeout raised, test merged or split, or assertion weakened: no. Two `timeout-minutes` values are new, none raised.
- Secret printed, "Jayami" or footer line added, git add -A, or force-push: no.
