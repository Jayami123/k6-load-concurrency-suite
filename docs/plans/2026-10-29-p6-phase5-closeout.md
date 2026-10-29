# Phase 5 closeout (2026-10-29)

- Model: not recorded in this repository
- Branch: `docs/2026-10-29-p6-phase5-closeout` (plan: `plan/2026-10-29-p6-phase5-task8`, head `8e4b267`)
- Head SHA: the PR head commit at merge (see the PR)
- CI status: see the PR checks at merge

Copy of [`docs/templates/phase-closeout.md`](../templates/phase-closeout.md), filled in. The task plan is
`plan/2026-10-29-p6-phase5-task8`, file `docs/plans/2026-10-29-p6-phase5-task8-closeout.md` (plan branch only).

## 1. Summary

Phase 5 put Twenty under load. The foundation and the cases `P6-TW-LOAD-004`, `-005`, `-006` and `-011` run VALID on
`main`, and the accepted extra `P6-TW-LOAD-009` runs VALID. Medians of three VALID `main` runs are in the README section
"Phase 5 results". Two results are findings, not passes: `P6-TW-LOAD-004` variant B (silent lost update) and
`P6-TW-LOAD-009` (cross-key starvation). `P6-TW-LOAD-005` is a known failure linked to `P6-TW-RACE-004`. The gated cases
`P6-TW-LOAD-008` and `-010` are NOT RUN. The A/A flag check `P6-X-LOAD-009` passed on-first and failed on off-first in two
runs. Phase 5 is closed, trend pending (owner decision, 2026-10-29): the soak trend has 0 of 3 weekly points (first capture
2026-11-01 UTC; trend due after 2026-11-15, owner-tracked).

## 2. Models used

| Task | Planned by                 | Built by                   |
| ---- | -------------------------- | -------------------------- |
| 8    | not recorded in repository | not recorded in repository |

## 3. Tasks

| Task | PR                                    | Merge commit | Unit tests after merge | CI run                                                    | Review rounds | Status                                 |
| ---- | ------------------------------------- | ------------ | ---------------------- | --------------------------------------------------------- | ------------- | -------------------------------------- |
| 1    | see git log (harness release and pin) | see git log  | not recorded here      | not recorded here                                         | not recorded  | evidence used: harness `v0.2.18`       |
| 2    | see git log (A/A step, lane A)        | see git log  | not recorded here      | `40850333800`, `40848345879`, `40857206947` (tier-aa)     | not recorded  | flags on-first PASS, off-first FAIL x2 |
| 3    | see git log (twenty load foundation)  | see git log  | not recorded here      | `40896799127`, `40896827889`, `40896870640` (twenty-load) | not recorded  | foundation VALID PASS                  |
| 4    | #173                                  | see git log  | not recorded here      | as task 3                                                 | not recorded  | variant A PASS; variant B FINDING      |
| 5    | #172 (case), #177 (known failure)     | see git log  | not recorded here      | as task 3                                                 | not recorded  | known failure, `P6-TW-RACE-004`        |
| 6    | #174                                  | see git log  | not recorded here      | as task 3                                                 | not recorded  | `-006` PASS, `-009` FINDING            |
| 7    | #176                                  | see git log  | not recorded here      | not recorded here                                         | not recorded  | collecting (0/3 weeks)                 |
| 8    | this PR (see the PR)                  | at merge     | 1561                   | see the PR                                                | see the PR    | closeout                               |

"see git log" means the PR or merge is in the history of `main` and was not re-checked for this record.

## 4. Findings

| ID                 | Product               | Case                       | Label                                    | Evidence                                                                         | Upstream issue                                                                               |
| ------------------ | --------------------- | -------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| P6-TW-LOAD-004 (B) | Twenty                | `P6-TW-LOAD-004` variant B | finding (C13: no optimistic concurrency) | runs `40896799127`, `40896827889`, `40896870640`, `reconcile.data.lostUpdate`    | feature-request draft `docs/upstream/2026-10-29-twenty-lost-update-variant-b.md` (not filed) |
| P6-TW-LOAD-009     | Twenty                | `P6-TW-LOAD-009`           | finding (cross-key starvation)           | same runs, `reconcile.data.fairness`                                             | none (a FINDING about the limiter's keying)                                                  |
| P6-TW-RACE-004     | Twenty                | `P6-TW-LOAD-005`           | known failure (PRODUCT BUG SUSPECTED)    | same runs, `verdict-public.json`; details withheld                               | private report (existing)                                                                    |
| P6-X-LOAD-009      | Medusa (harness tier) | `P6-MED-LOAD-002` A/A      | FAIL on off-first (cause open)           | `40848345879`, `40857206947` (off-first FAIL p95); `40850333800` (on-first PASS) | none                                                                                         |

## 5. Decisions made without the owner

| Decision                                                                                                | Reason                                                                   | Recorded in                                                |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------- |
| Created `docs/2026-10-29-p6-phase5-closeout` from `origin/main`, because the named branch did not exist | the task said to build on it; nothing to build on                        | this PR                                                    |
| Used the three `workflow_dispatch` runs on `main` for the medians                                       | they are the three VALID `main` runs named by the task                   | README "Phase 5 results"                                   |
| Cited the `-004` and `-009` outcome word as the stage verdicts (FINDING), with the gap stated           | the runner ignores the stage verdicts; the README rule says never a pass | README, plan §3 item 1                                     |
| Released only the `twenty-load` runs; `tier-aa` runs are cited in the README only                       | `400386604` (`tier-aa`) is not in `EVIDENCE_WORKFLOW_IDS`                | `docs/releases/p6-phase5.md`                               |
| Used a sparse clone of `twentyhq/twenty` (read) to get the issue template and check the upstream API    | the draft must use Twenty's own template                                 | `docs/upstream/2026-10-29-twenty-lost-update-variant-b.md` |

## 6. Deviations

- Phase 5 is closed with one open item, "trend pending" (owner decision, 2026-10-29). The soak trend has 0 of 3 weekly
  points; the README says `collecting (0/3 weeks)`. Recorded as a change against the master plan's Phase 5 exit.
- Owner decisions, 2026-10-29: `-004` variant B stays a FINDING (C13), not a PRODUCT BUG or a known failure. The runner
  outcome gap gets a fix PR (`fix/2026-10-29-p6-finding-outcome`). The `P6-X-LOAD-009` off-first breach is accepted as
  open, consistent with arm order, not explained.
- The roadmap asks for nightly runs for `-004`, `-005` and `-011`. The medians use `workflow_dispatch` runs on `main`.
- `P6-X-LOAD-009` on off-first FAILED twice (`40848345879`, `40857206947`). The explanation (arm order, warm-up) fits
  the off-first runs but is not confirmed by the on-first run.
- The Task 3 plan says harness `v0.2.16`; the runs record `v0.2.18`. The README uses `v0.2.18`.
- `-009` and `-004` outcome words read PASS in `verdict.json` while their stage verdicts are FINDING (runner gap).

## 7. Rule slips and fixes

- The README and upstream-draft commits (steps 2 and 3) were made before `npm run check` was run for them. The check
  is run before the PR is pushed (step 5). The check result is in the PR.
- Prettier reflowed the whole index table in `docs/upstream/README.md` when the new row was added. The change is
  formatting only.

## 8. CI health

- The three `twenty-load` runs took about 15 to 19 minutes from creation to their last job. All their jobs succeeded.
- The `tier-aa` run `40845100209` failed in setup (Medusa HEAD and pnpm checks); it is not counted.
- `gh release list` is refused in this session (GraphQL 403); the release list was read through the REST API.

## 9. Owner decisions and open questions

Decided by the owner on 2026-10-29:

1. Runner gap: a fix PR follows #178 on `fix/2026-10-29-p6-finding-outcome`. A VALID run with a stage FINDING gets outcome
   `FINDING`, prints `<case> FINDING (<detail>)` and exits 0. `knownFailure` stays for proven product bugs only.
2. A/A: accepted as open. The off-first breach is consistent with arm order; it is not explained.
3. Exit: Phase 5 closed, trend pending. Soak trend `collecting (0/3 weeks)`, first capture 2026-11-01 UTC, trend due after
   2026-11-15, owner-tracked.
4. C13: `-004` variant B stays a FINDING (no optimistic concurrency; last-write-wins by design). Not a PRODUCT BUG, not a
   known failure. The upstream draft is a feature request.

Still open:

5. Correct the `v0.2.16` line in the Task 3 plan to `v0.2.18`. Proposed answer: a docs fix in the next docs PR.
6. The owner dispatches `evidence-release` for `p6-phase5`. Steps are in the plan, section 10.

## 10. Backlog and next phase

- Runner outcome for FINDINGs (decision 1): `fix/2026-10-29-p6-finding-outcome`.
- The A/A off-first cause stays open (decision 2); no re-run is scheduled.
- Soak trend: weekly points on Sundays 2026-11-01, 11-08, 11-15.
- Gated cases: `P6-TW-LOAD-008` (an API-key knee dry run after H4), `P6-TW-LOAD-010` (a finer monitor or a queued burst).
- Later: `P6-TW-LOAD-007` (out of P6, belongs with P1).
- The master plan is not edited here (D9). The fold-in revision is a separate owner-approved docs PR.
