# Phase 2 closeout (2026-10-23)

- Model: Opus 5.5 (this closeout: Task 9 plan and build)
- Branch: `docs/2026-10-23-p6-phase2-closeout`
- Head SHA: the branch head of the closeout PR (the PR page shows it; this file is part of that head)
- CI status: closeout runs A [40037355173](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40037355173)
  (push to `main`, `a82521a`) and B [40039351021](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40039351021)
  (`workflow_dispatch` on `main`, `a82521a`): both success, 9 of 9 jobs

Plan: [2026-10-23-p6-phase2-task9-closeout.md](2026-10-23-p6-phase2-task9-closeout.md) (owner decisions in its §15).

## 1. Summary

Phase 2 set out to cover the Cal private-link and confirm/cancel races, the Medusa budget, refund and order-state races and the
Twenty lost-update and reset races, plus the carried-over Documenso sign-in contract and the rerun-on-spread framework change.
The goal is met: Tasks 1 to 8, 3b and X8 are merged, and runs A and B at `a82521a` are green in all nine jobs with every case at
full count and every known-bug test failing as expected. `P6-MED-RACE-006` moved to "Later" (no gift-card route at the pinned
Medusa). The evidence release `p6-phase2` is dispatched after this PR merges (plan §6 step 8).

## 2. Models used

Per task, which model planned it and which model built it. The task plans do not record the model, so earlier rows say so.

| Task               | Planned by   | Built by     |
| ------------------ | ------------ | ------------ |
| 1 to 8, 3b, X5, X8 | not recorded | not recorded |
| 9 (closeout)       | Opus 5.5     | Opus 5.5     |

## 3. Tasks

Merge commit SHA, unit-test count at that merge (`npm run test:unit` run at each merge commit for this report), and the push run
on `main`. Review rounds are not recorded in the plans.

| Task                                  | PR      | Merge commit | Unit tests after merge | CI run (push to `main`)               | Review rounds | Status             |
| ------------------------------------- | ------- | ------------ | ---------------------- | ------------------------------------- | ------------- | ------------------ |
| Roadmaps (Phases 2 to 5)              | #26     | `ac563ab`    | 299                    | 39736390454 success                   | not recorded  | merged             |
| 1 rerun-on-spread                     | #27     | `147d94b`    | 338                    | 39751077456 success                   | not recorded  | merged             |
| Agent rules, closeout template        | #28     | `c89f703`    | 338                    | 39821517901 success                   | not recorded  | merged             |
| Agent rules footer note               | #30     | `a63ef60`    | 338                    | 39827519846 success                   | not recorded  | merged             |
| 2 Medusa money races                  | #29     | `8a46530`    | 354                    | 39829474241 success                   | not recorded  | merged             |
| Plan self-check rule                  | #31     | `697afc2`    | 354                    | 39845479090 success                   | not recorded  | merged             |
| 3 Medusa budget and order-state races | #32     | `8cccc56`    | 383                    | 39914092582 success                   | not recorded  | merged             |
| 3 closeout docs                       | #33     | `937b57d`    | 383                    | 39917207104 failure (§8)              | not recorded  | merged             |
| 3b Medusa order-state extras          | #34     | `dc95c29`    | 391                    | 39923528658 failure (§8)              | not recorded  | merged             |
| 3b closeout docs                      | #35     | `8324170`    | 391                    | 39934300578 cancelled by a newer push | not recorded  | merged             |
| `beforeAll` timeout fix               | #36     | `73db10f`    | 391                    | 39926461664 cancelled by a newer push | not recorded  | merged             |
| Oversell cleanup sweep                | #37     | `49ddd05`    | 392                    | 39941365044 cancelled by a newer push | not recorded  | merged             |
| F-M5 orphan annotation                | #38     | `b221c85`    | 395                    | 39941942658 success                   | not recorded  | merged             |
| 4 Cal state races                     | #39     | `0728ebe`    | 409                    | 39948384170 success                   | not recorded  | merged             |
| 4 closeout docs                       | #40     | `2cf2de8`    | 409                    | 39951483517 success                   | not recorded  | merged             |
| 5 Documenso `P6-OBS-DOC-001`          | #41     | `92a9a93`    | 417                    | 39961527451 success (attempt 2)       | not recorded  | merged             |
| 5 closeout docs                       | #42     | `6ee9846`    | 417                    | 39969241809 success                   | not recorded  | merged             |
| 5 closeout follow-up                  | #43     | —            | —                      | —                                     | —             | closed, not merged |
| 6 Twenty stack                        | #44     | `38533b0`    | 431                    | 39979511916 success                   | not recorded  | merged             |
| X5 pull retry                         | #45     | `9b38d4f`    | 431                    | 39993081595 success                   | not recorded  | merged             |
| 6 closeout docs                       | #46     | `088ca04`    | 431                    | 39996805900 success                   | not recorded  | merged             |
| 7 Twenty races                        | #47     | `4b09d34`    | 452                    | 40006260061 success                   | not recorded  | merged             |
| 8 multi-instance Medusa probe         | #48     | `ad14c6a`    | 452                    | 40014093546 success                   | not recorded  | merged             |
| Rule fixes                            | #49     | `162e595`    | 452                    | 40033135757 success                   | not recorded  | merged             |
| X8 Twenty empty-body spec             | #50     | `a82521a`    | 471                    | 40037355173 success (run A)           | not recorded  | merged             |
| 9 closeout                            | this PR | —            | 471                    | —                                     | —             | open               |

X8 built to 470; its review fix `dae02ed` added the 471st test (`tests/unit/twenty-timed-post.test.ts`, "speaks TLS to an https
base URL and never sends cleartext HTTP").

## 4. Findings

Counts are attempts in green full-count `main` runs (plan §2.5), unless marked "label evidence".

| ID               | Product   | Case                              | Label                                   | Evidence                                                               | Upstream issue                                                                                                  |
| ---------------- | --------- | --------------------------------- | --------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| X04              | Medusa    | `P6-MED-RACE-008`, `-013`, `-014` | PRODUCT BUG (D67)                       | `-008` 653 of 900; `-013` 948 of 950                                   | draft (plan Appendix B1)                                                                                        |
| X05              | Medusa    | `P6-MED-RACE-009`                 | PRODUCT BUG (D69)                       | 259 of 900                                                             | draft (Appendix B2)                                                                                             |
| F-M3             | Medusa    | `-008`, `-009`, `-013`, `-014`    | PRODUCT BUG (D68)                       | 247, 40, 945 and 950 attempts                                          | draft (Appendix B1)                                                                                             |
| F-M2             | Medusa    | `-012`, `-005`                    | PRODUCT BUG (D70), annotation only      | 209 of 1050, 12 of 1051                                                | draft (Appendix B3)                                                                                             |
| F-M4             | Medusa    | `-014`                            | PRODUCT BUG, medium (owner, 2026-10-23) | 684 of 953                                                             | draft (Appendix B1)                                                                                             |
| F-M1             | Medusa    | `-011`                            | SUSPECTED (D40)                         | 705 of 1000                                                            | none                                                                                                            |
| F-M5             | Medusa    | `-001`                            | SUSPECTED (same mechanism as F-M2)      | 0 orphans in 13 runs since PR #38                                      | none                                                                                                            |
| Run 121          | Medusa    | `-001` extra `S=1 vs N=2`         | finding (observation, no label)         | one oversell in a warm-up burst, F-M2 signature                        | none                                                                                                            |
| F-C1             | Cal       | `P6-CAL-RACE-006`, `-008`         | PRODUCT BUG (O6)                        | 600 of 600 each                                                        | [calcom/cal.diy#29815](https://github.com/calcom/cal.diy/issues/29815) (existing; comment drafted, Appendix C1) |
| F-C2             | Cal       | `P6-CAL-RACE-007`                 | PRODUCT BUG (O6)                        | 600 of 600                                                             | draft (Appendix C2)                                                                                             |
| F-C3             | Cal       | `P6-CAL-RACE-009`                 | PRODUCT BUG (O6)                        | 600 of 600                                                             | draft (Appendix C3)                                                                                             |
| `P6-OBS-DOC-001` | Documenso | sign-in contract                  | PRODUCT BUG                             | both tests expected failures in every green `main` run since `92a9a93` | draft (Appendix E)                                                                                              |
| `P6-OBS-DOC-003` | Documenso | sign-in validation                | finding (low)                           | Task 5 probe §3.2 rows 11, 12                                          | private-advisory draft for the owner (Appendix F)                                                               |
| `P6-TW-RACE-004` | Twenty    | reset token                       | PRODUCT BUG                             | 250 of 250                                                             | private email to Twenty's security contact, drafted (Appendix D1)                                               |
| `P6-OBS-TW-001`  | Twenty    | empty-body hang                   | PRODUCT BUG                             | 8 of 8 hang tests in runs A and B                                      | private email, drafted (Appendix D2)                                                                            |
| X9               | P6        | Twenty histograms                 | TEST BUG (reporting)                    | every `P6-TW-RACE-*` histogram says `verdict: "fail"` in green jobs    | n/a (BACKLOG follow-up)                                                                                         |

## 5. Decisions made without the owner

| Decision                                                                    | Reason                                                    | Recorded in  |
| --------------------------------------------------------------------------- | --------------------------------------------------------- | ------------ |
| Run B dispatched only after run A finished                                  | the shared concurrency group would cancel A               | plan §5 D71  |
| A run counts for a published number only when its job ended `success`       | a failed or cancelled job is not evidence of a green case | plan §5 D72  |
| `target_sha` = the runs' head `a82521a`                                     | same as Phase 1 (`4aecc2d`)                               | plan §5 D73  |
| README harness version `v0.2.11` → `v0.2.12`                                | the pin is `v0.2.12`                                      | plan §5 D74  |
| One closeout PR for the plan, fixes, notes, README, BACKLOG and this report | one PR per task (rule 6)                                  | plan §5 D75  |
| Unit-test counts in §3 measured at each merge commit                        | the plans do not all record them                          | this file §3 |

## 6. Deviations

- `P6-MED-RACE-006` moved to "Later" (Task 2 gate, D5, D34).
- Multi-instance Medusa (`P6-MED-RACE-002/003`) moved to Phase 3 behind harness H3 (D11); Task 8 wrote the spec only.
- Several task plans were committed on their `feat/` branch instead of a `plan/` branch, on the owner's word (Task 3 §21, Task
  3b C6, Task 5 C6).
- F-C1 has an existing upstream issue, so it gets a comment, not a new issue (plan C1). The Twenty findings go to Twenty's
  security contact by private email, not as public issues (owner, plan §15 item 2).
- Phase 2 added three jobs beyond the roadmap's "one job per product": `medusa-order-races`, `medusa-cancel-extras` (Task 3, 3b)
  and `cal-state-races` (Task 4), and the Twenty jobs `twenty-races` and `twenty-obs` (Task 7, X8), each for its time budget.

## 7. Rule slips and fixes

- PRs #31 and #32 were opened through `gh api`; the session proxy appended a "Generated by Claude Code" footer (rule 3), which
  the owner was asked to remove by hand (Task 3 closeout).
- PR #33 was opened and merged through the GitHub connector, which rule 3 forbids (Task 3b closeout).
- PR #34 could not be opened with `gh pr create` (GraphQL 403); the `gh api` fallback was used and the proxy footer stayed
  (Task 3b closeout).
- Task 4: a step was committed before its check passed and amended before any push; a `cal-smoke` margin missed the
  10-minute rule until an owner fix (Task 4 closeout).
- Task 7: tests were merged to match a planned unit-test count, then split back on the owner's review (Task 7 closeout).
- Probe-side slips with no repo effect: environment settings and a stale admin password (Task 3b), duplicate monitors (Task 4),
  a first evidence one-liner (X8).

## 8. CI health

- Red `main` runs: `39917207104` and `39923528658`, both 60-second `beforeAll` timeouts in the Medusa order-state specs,
  fixed by PR #36. No repeat in the 18 runs after it or in run B.
- Re-runs: `39961527451` attempt 2 (a Docker registry 500 on the `postgres` pull before any test ran; Task 5 closeout);
  `39994702506` (PR #46, a one-off Yarn "unexpected empty event loop", not seen again in 170 `main` and 32 Cal PR job logs).
- Flaky tests: none found. Invalid trials (Task 1): 1 in `-005` and 3 in `-014` across all counted runs; 0 in runs A and B.
- Budgets (plan §2.7): every job at least 16 minutes under its timeout. The `medusa-smoke` race step's worst-case estimate is
  24.1 min against its 24.0-minute stop rule (slowest measured 19.9 min); kept as a BACKLOG item for Phase 3 (no timeout raise).

## 9. Open questions for the owner

1. Severity of X04, X05, F-M3 and F-M2 (README still says "proposed"). Proposed answer: X04 medium, X05 high, F-M3 medium,
   F-M2 medium, and drop "(proposed)".
2. Filing order of the upstream drafts. Proposed answer: the Twenty emails first (security), then the Medusa issues, then the
   Cal comment and issues, then Documenso.

## 10. Backlog and next phase

Carried forward (plan §10, `docs/BACKLOG.md`): F-M4 `test.fail()` PR; Twenty histogram verdict fix; known-bug annotations and
summaries for `-008`, `-009` and the Cal state tests, a `cal-state-races` summary step and `twenty-obs` artefacts; `-009` PR
trials 13 → 20 after a budget recheck; the `medusa-smoke` stop-rule item; X7, H-twenty-auth, X1, X6, H-email, H-heap; step
timeouts for the older uncapped steps; the P1 PR removing X04/X05.

Next phase: Phase 3 starts with the harness `v0.2.13` release (H3, merged on harness `main` as `51b7d1e`), the P6 pin bump, and
the live probe for `P6-MED-RACE-002/003` (two Medusa instances). k6 load testing is planned for Phases 3 to 5.
