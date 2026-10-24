# P6 Phase 3 autonomous run: handoff (2026-10-24)

Stopped after Task 6, which is partial. Task 7 was not started: its condition (Tasks 1 to 6 all done) is not met, because
Task 1 part B, Task 5 and Task 6 are partial. Tasks 10 and 11 were never started (instruction).

No PR was created. `gh` rejects the session's `GH_TOKEN`, and the connector is not allowed to open PRs for this run. Each
task's PR title and body are in `docs/handoff/pr-bodies/task<N>.md` on that task's branch. Open them in the merge order below.

## Table

| Task                                                        | Branch                                 | PR (owner opens) | Base   | Head SHA | Tests (plan) | CI run and result                                                                                                                                                                    | Budget                                        | Deviations                                                                                          |
| ----------------------------------------------------------- | -------------------------------------- | ---------------- | ------ | -------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 1 harness pin, part A                                       | chore/2026-10-24-p6-harness-bump       | not created      | main   | 658d2fd  | 481 (481)    | 40077117412: `medusa-smoke`, `documenso-smoke` ok; `cal-smoke` and `cal-state-races` **failed** at `Start Cal (harness up)` (listener pid, see below)                                | no new step; cal jobs red                     | part B parked; README and bridge comment updated                                                    |
| 2 multi-instance Medusa                                     | feat/2026-10-24-p6-med-multi-instance  | not created      | Task 1 | 2e57861  | 503 (503)    | 40078055622: both new legs ok (redis job 8 min 33 s, memory job 7 min 32 s); cal jobs failed (inherited)                                                                             | 45-min job timeout, 36 min margin             | none against the plan                                                                               |
| 3 load foundation (k6 2.3.0, COOP self-test)                | feat/2026-10-24-p6-load-foundation     | not created      | Task 2 | 11c94ae  | 557 (557)    | 40079793205: `load-selftest` ok (job 1 min 49 s); medusa jobs ok; cal jobs failed (inherited)                                                                                        | `load-selftest` 2.8 min estimate, 6.6 min cap | closed model 4 VUs; undersized run expects INVALID; absolute config path; defaults for `k6 inspect` |
| 4 run validity, meta, readiness                             | feat/2026-10-24-p6-load-validity       | not created      | Task 3 | abfc4e8  | 601 (601)    | 40080601245 (finished): `load-selftest` ok (job 2 min 53 s); `medusa-smoke` ok (22 min); `medusa-multi-instance` ok, both legs; `cal-smoke` and `cal-state-races` failed (inherited) | validity self-test 1 min 2 s vs 3 min cap     | none beyond Task 3's                                                                                |
| 5 telemetry sampler, markers, chart, overhead (**partial**) | feat/2026-10-24-p6-load-telemetry      | not created      | Task 4 | 90d2e00  | 634 (657)    | 40081738239: **in progress** at 09:30 UTC. Done: `load-overhead` ok (4 min), `load-selftest` ok, `twenty-*` ok, `medusa-cancel-extras` ok; cal jobs failed (inherited)               | `load-overhead` job 4 min; no budget set yet  | pg, container, log and probe sources not built (see Task 5 body)                                    |
| 6 post-load audits (**partial**)                            | feat/2026-10-24-p6-load-reconciliation | not created      | Task 5 | 014127a  | 666 (690)    | 40081928914: **in progress** at 09:30 UTC; cal jobs at `Start Cal (harness up)` (inherited)                                                                                          | no CI change                                  | live readers and the audit stage not built (see Task 6 body)                                        |
| 7 journey smokes                                            | not started                            |                  |        |          |              |                                                                                                                                                                                      |                                               |                                                                                                     |
| 8, 9, 10, 11                                                | not started                            |                  |        |          |              |                                                                                                                                                                                      |                                               |                                                                                                     |

Head SHAs are the branch tips before this report commit. The report commit is the tip of `feat/2026-10-24-p6-load-reconciliation`
(`git log -1`). The CI runs for Tasks 1 to 3 and 5 to 6 ran on earlier commits of the same branch. Checked with `git diff`, the
later commits change only `docs/` and `README.md`, so the runs tested the same code. Task 4 ran on `2f1cc6d`; its later commits are
docs only.

Runs 40081738239 and 40081928914 were still in progress when this was written. The final results are on the run pages.
Owner: check them before merging Tasks 5 and 6.

## Merge order

Task 1, then Task 2, Task 3, Task 4, Task 5, Task 6. Each branch contains the one below it. Merges go up the stack; no rebase and no
force-push was used.

## Where I stopped and why

- **Task 1 part B (delete the Cal bridge): parked.** Harness v0.2.14 `up()` finds Cal healthy and then fails with
  `Cal is healthy on 127.0.0.1:3000, but no listener pid could be read (recorded pid N, start mark M)`. The `lsof` lookup does not
  report the Cal `next-server` socket. This reproduces on this VM and on the GitHub runner (run 40077117412, `cal-smoke`, step
  `Start Cal (harness up)`). The bridge stays. The part B patch is in `docs/handoff/task1-part-b-parked.patch`.
- **PRs not created**: `GH_TOKEN` is invalid for `gh`; see the note at the top.
- **Task 5 partial**: the pg, container, log and probe sources need a database, Docker or a product, so they belong with Task 7's
  product cases. Built: gap detector, clock markers, app process group, sampler, chart, overhead self-test and telemetry self-test.
- **Task 6 partial**: the audits are pure checks over snapshots (Cal, Medusa, Documenso), tested with fixtures. The database
  readers, `audit.json`, the leak check and the runner wiring need a product (Task 7). The live-evidence claim is unit-level only.
- **Task 7 and later**: not started (see above).

## Environment changes

- **k6 pinned to 2.3.0** (`.k6-version`, checksums in `scripts/k6-sha256.txt`, installer `scripts/install-k6.sh`).
  - Cursor Cloud: `.cursor/Dockerfile` no longer has the apt k6 block; `.cursor/environment.json` install runs `bash scripts/install-k6.sh`.
    The installer needs github.com and release-assets.githubusercontent.com. Confirm the maintainer environment allows them.
  - Claude Code cloud: the session hook installs the pinned k6. On this VM, k6 2.3.0 is at `/usr/local/bin/k6`.
- **Cal needs a heap setting in Claude Code cloud sessions**: the session exports `NODE_OPTIONS=--use-openssl-ca`, which makes the
  harness drop its 8 GB heap default for `next build` (OOM). CI does not set it. Use
  `NODE_OPTIONS="--use-openssl-ca --max-old-space-size=8192"` for local Cal runs there.
- **Token**: `GH_TOKEN` is invalid in this session. The owner must refresh it before `gh` can open PRs.

## Open questions for the owner

1. **The pin.** `main` is at harness v0.2.12. Part A pins v0.2.14. With that pin, `cal-smoke` and `cal-state-races` fail on every run
   (listener-pid error). Merging Task 1 turns them red on `main`. Options: (a) keep v0.2.14 and fix the lookup in the harness
   (outside this run's scope); (b) pin v0.2.13 (H3 only, without the Cal fix) until the lookup is fixed. Please decide.
2. **Open the PRs** from `docs/handoff/pr-bodies/task<N>.md`, or give a valid `GH_TOKEN`.
3. **Task 1 part B**: apply `docs/handoff/task1-part-b-parked.patch` after the harness fix is released and probed.
4. **Scope cuts**: confirm that Task 5 ships without the pg, container, log and probe sources, and that Task 6 ships without its
   live readers until Task 7.
5. **Self-test inputs**: the closed model uses 4 VUs (it was 10; with 10 the closed run sent more requests than the open run and
   failed R3), and the undersized run declares `expectValidity: INVALID`. Confirm both are the intended design, not a relaxed check.
6. **CI numbers**: all CI figures come from `workflow_dispatch` runs. Timings for pull-request triggers have not been measured.
7. **Live audits**: the Documenso and Medusa audits need the Task 7 product cases before they have live evidence.

## Owner escalation check

- Product bug suspected or label proposed: **NO**. The `-003` oversell is the expected characterization: it is asserted and annotated,
  not labelled. No `test.fail()` was added.
- CI, runner or harness change: **YES**. New jobs `medusa-multi-instance` (two legs), `load-selftest` and `load-overhead`; the
  `medusa-smoke` grep-invert change; five installs moved to the script; the Twenty pin read from `.k6-version`; new step timeouts.
  Harness: a **suspected defect in v0.2.14** `up()` (listener-pid lookup, above) that needs a harness change. Not worked around in P6.
- Environment change: **YES**: k6 pin 2.3.0 (steps above, both clouds), and the Cal heap note.
- Unexplained red CI: **NO**. Every red job is `Start Cal (harness up)` with the error above, and it is the same in every run.
- Timeout raised, test merged or split, or assertion weakened: **NO**. The diff against `main` adds `timeout-minutes` lines and removes
  none. Tests were not merged or split. Assertions were not weakened; the self-test inputs in question 5 changed.
- Secret printed, owner-name string or footer line added, `git add -A`, or force-push: **NO**. Only `Jayami123/...` repository
  paths and URLs appear in the diff; no commit has a footer line.

**ESCALATE**
