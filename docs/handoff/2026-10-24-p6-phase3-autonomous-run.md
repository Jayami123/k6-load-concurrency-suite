# P6 Phase 3 autonomous run: handoff (2026-10-24)

Stopped after Task 6 (partial). Task 7 was not started: the rule was that Tasks 1 to 6 are all done, and Task 1 part B, Task 5 and
Task 6 are partial. Tasks 10 and 11 were never started (instruction).

No PR was created: the session's `GH_TOKEN` is rejected by `gh`, and the repo rule forbids creating PRs through the connector.
The PR title and body of each task are in `docs/handoff/pr-bodies/task<N>.md` on that task's branch. Open each PR with base and
head as stated there, in the merge order below.

## Table

| Task                                                        | Branch                                 | PR (owner opens) | Base   | Head SHA | Tests (plan) | CI run and result                                                                                                               | Budget                                | Deviations                                                                                      |
| ----------------------------------------------------------- | -------------------------------------- | ---------------- | ------ | -------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 1 harness pin, part A                                       | chore/2026-10-24-p6-harness-bump       | not created      | main   | 658d2fd  | 481 (481)    | 40077117412: medusa-smoke ok, documenso-smoke ok, cal-smoke and cal-state-races **failed** at `Start Cal` (listener pid, below) | no new step; cal jobs red             | part B parked; README and bridge comment updated; the probe ran after the pin                   |
| 2 multi-instance Medusa                                     | feat/2026-10-24-p6-med-multi-instance  | not created      | Task 1 | 2e57861  | 503 (503)    | 40078055622: both new legs ok (job 8 min 33 s and 7 min 32 s); cal jobs failed (inherited)                                      | 45-min timeout, 36 min margin         | built before the live probe; probe run afterwards and recorded                                  |
| 3 load foundation (k6 2.3.0, COOP self-test)                | feat/2026-10-24-p6-load-foundation     | not created      | Task 2 | 11c94ae  | 557 (557)    | 40079793205: load-selftest ok (1 min 49 s); medusa jobs ok; cal jobs failed (inherited)                                         | load-selftest 1.8 min vs 2.8 estimate | closed model 4 VUs; undersized expects INVALID; absolute config path; defaults for inspect      |
| 4 run validity, meta, readiness                             | feat/2026-10-24-p6-load-validity       | not created      | Task 3 | baef748  | 601 (601)    | 40080601245: load-selftest ok (2 min 53 s); medusa-smoke still running at last check; cal jobs failed (inherited)               | validity self-test 1 min 2 s vs 3 cap | steps 1 and 2 in one commit; `ctx.meta` optional                                                |
| 5 telemetry sampler, markers, chart, overhead (**partial**) | feat/2026-10-24-p6-load-telemetry      | not created      | Task 4 | 1131eb6  | 634 (657)    | 40081738239: in progress at last check                                                                                          | no CI budget measured yet             | pg, cgroup, log, probe sources not built; 33 of 56 tests                                        |
| 6 post-load audits (**partial**)                            | feat/2026-10-24-p6-load-reconciliation | not created      | Task 5 | 8a08f5a  | 666 (690)    | 40081928914: queued at last check                                                                                               | no CI change                          | live readers and the audit stage not built; Documenso and the pure audits built; 32 of 33 tests |
| 7 journey smokes                                            | not started                            |                  |        |          |              |                                                                                                                                 |                                       |                                                                                                 |
| 8, 9, 10, 11                                                | not started                            |                  |        |          |              |                                                                                                                                 |                                       |                                                                                                 |

Head SHAs are the branch heads as pushed. The CI runs were dispatched on earlier heads; the later commits on each branch touch only
`docs/` and `README.md` (checked with `git diff`), so the code is the one the run tested.

## Merge order

Task 1, then Task 2, Task 3, Task 4, Task 5, Task 6. Each branch contains the one below it. Merge commits only (rule A6).

## Where I stopped and why

- **Task 1 part B (delete the Cal bridge): parked.** Harness v0.2.14 `up()` finds Cal healthy and then fails with
  `Cal is healthy on 127.0.0.1:3000, but no listener pid could be read (recorded pid N, start mark M)`. The `lsof` lookup does not
  report the Cal `next-server` socket. This reproduces on this VM and on the GitHub runner (run 40077117412, `cal-smoke`, step
  `Start Cal (harness up)`). The bridge stays. The part B patch is in `docs/handoff/task1-part-b-parked.patch`.
- **PRs not created**: `GH_TOKEN` is invalid for `gh` (no other login); the connector is not allowed for PRs.
- **Task 5 partial**: the pg, container, log and probe sources need a database, Docker or a product; they belong with Task 7's
  product cases. Built: gap detector, clock markers, app process group, sampler, chart, overhead self-test and the telemetry self-test.
- **Task 6 partial**: the audits are pure checks over snapshots (Cal, Medusa, Documenso), tested with fixtures. The database
  readers, `audit.json`, the leak check and the runner wiring need a product (Task 7); `P6-X-LOAD-005` is unit-evidenced only.
- **Task 7 and later**: not started. The condition for Task 7 (Tasks 1 to 6 all done) is not met.

## Environment changes (both clouds)

- **k6 pinned to 2.3.0** (`.k6-version`, checksums in `scripts/k6-sha256.txt`, installer `scripts/install-k6.sh`).
  - Cursor Cloud: `.cursor/Dockerfile` has no apt k6 block; `.cursor/environment.json` install runs `bash scripts/install-k6.sh`.
    It needs github.com and release-assets.githubusercontent.com. Confirm the maintainer environment allows them.
  - Claude Code cloud: the session hook installs the pinned k6 when it differs. On this VM, k6 2.3.0 was installed to
    `/usr/local/bin/k6` (v1.3.0 was there before).
- **Cal needs a heap setting in Claude Code cloud sessions**: the session exports `NODE_OPTIONS=--use-openssl-ca`, which makes the
  harness drop its 8 GB heap default for `next build` (OOM). CI does not set it. Use
  `NODE_OPTIONS="--use-openssl-ca --max-old-space-size=8192"` for local Cal runs there.
- **Token**: `GH_TOKEN` is invalid in this session. The owner must refresh it before PRs can be opened by `gh`.

## Open questions for the owner

1. **The pin.** `main` is at harness v0.2.12. Part A pins v0.2.14. With that pin, `cal-smoke` and `cal-state-races` fail on every run
   (listener-pid error). Merging Task 1 would turn them red on `main`. Options: (a) keep v0.2.14 and fix the lookup in the harness
   (the harness is outside this run's scope); (b) pin v0.2.13 (H3 only, without the Cal fix) until the lookup is fixed. Please decide.
2. **Open the PRs** from `docs/handoff/pr-bodies/task<N>.md` (or give a valid `GH_TOKEN`).
3. **Task 1 part B**: apply `docs/handoff/task1-part-b-parked.patch` after the harness fix is released and probed.
4. **Scope cuts**: confirm that Task 5 ships without the pg, container, log and probe sources, and that Task 6 ships without its
   live readers until Task 7.
5. **Self-test inputs**: the closed model uses 4 VUs (was 10; with 10 the closed run sent more requests than open and failed R3),
   and the under-sized run declares `expectValidity: INVALID`. Confirm both are the intended design, not a relaxed check.
6. **CI budget**: the job numbers come from workflow_dispatch runs, not pull requests. The PR trigger counts (3 and 8 trials) are
   not yet measured in CI. The plan asks for three full-count runs before merge; only one per task was run.
7. **Documenso and Medusa live audits**: they need the Task 7 product cases before `P6-X-LOAD-005` has live evidence (plan Q4).

## Owner escalation check

- Product bug suspected or label proposed: **NO**. The `-003` oversell is the expected characterization, asserted and annotated,
  not labelled. No `test.fail()` was added.
- CI/runner/harness change: **YES**. New jobs `medusa-multi-instance` (two legs), `load-selftest`, `load-overhead`; the grep-invert
  change in `medusa-smoke`; five installs moved to the script; the Twenty pin read from `.k6-version`; the cache-key bump (h0.2.14).
  Harness: a **suspected defect in v0.2.14** `up()` (listener-pid lookup, above) that needs a harness change. Not worked around in P6.
- Environment change: **YES**: k6 pin 2.3.0 (steps above, both clouds), and the Cal heap note.
- Unexplained red CI: **NO**. Every red job is `Start Cal (harness up)` with the error above, and it is the same in all runs.
- Timeout raised, test merged or split, or assertion weakened: **NO** timeout was raised (the Cal start steps went from a 40-minute
  env cap to a 30-minute step cap). Tests were not merged or split. Assertions were not weakened; the self-test inputs in question 5 changed.
- Secret printed, "Jayami" or footer line added, `git add -A`, or force-push: **NO**. The only "Jayami" strings are existing
  `repository: Jayami123/...` references and the owner's repo URLs.

**ESCALATE**
