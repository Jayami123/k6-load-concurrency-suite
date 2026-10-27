# Phase 4 closeout (2026-10-27)

Written from `docs/templates/phase-closeout.md`. Base: `origin/main` at `6a9a23f` (after #122 and #123). Every run cited is a `perf.yml`, `soak.yml` or `pages.yml` run on `main`, and its artefact was read. Gaps are written as "not met" with the reason, never as met.

## 1. Summary

Phase 4b finished the soak evidence, the soak schedule, the invariant evidence and the dashboard refresh. Two Phase 4b items are still open: the parallel session's A/A and gate evidence (Tasks 11 and 12), and the release `p6-phase4` (owner dispatch). The rule status is in section 9.

## 2. Models used

Claude (Haiku 5.5 configured for the session; the serving model is not recorded here).

## 3. Tasks

| Task                                 | Status                          | Evidence                                                              |
| ------------------------------------ | ------------------------------- | --------------------------------------------------------------------- |
| Task 7 soaks                         | Done (calibration not reached)  | Section 4; PRs #122, #123                                             |
| Task 8 Cal invariants under load     | Done                            | cal-invariants VALID in runs 40498902575, 40465973379, 40469597860    |
| Task 9 Documenso exactly-once        | Done                            | documenso-invariants VALID in the same three runs                     |
| Task 10 Medusa invariants under load | Done, one KNOWN FAIL marker     | medusa-invariants VALID in runs 40498902575, 40524237209, 40526041971 |
| Task 11 A/A noise                    | WAITING on the parallel session | tolerance not on main                                                 |
| Task 12 A/B gate                     | WAITING on the parallel session | gate verdicts not on main                                             |
| Task 13 dashboard                    | Done                            | #109, #120; pages run 40526023077 success                             |
| Task 14 closeout                     | In progress                     | this record and the release notes                                     |

## 4. Soak evidence

Every VALID soak on main is in `docs/observations/2026-10-27-soak-bounds-not-calibrated.md`, with its Theil-Sen slope and plateau.

- Calibration: no product has three VALID 30-minute soaks without growth. `k6/thresholds/soak-bounds.json` stays `"products": {}`.
- Two-hour soaks: VALID 120-minute runs exist for each product on main (Cal 40373021384, Documenso 40373634603, Medusa 40455577906). Cal and Documenso show RSS growth in their soaks (P6-OBS-CAL-005, P6-OBS-DOC-007, PRODUCT BUG (SUSPECTED)).
- Schedule: `soak.yml` runs nightly for 30 minutes and on Sundays for 120 minutes (PR #123).

## 5. Invariant evidence

| Job                  | VALID runs on main | Runs                                  |
| -------------------- | ------------------ | ------------------------------------- |
| cal-invariants       | 3 of 3             | 40498902575, 40465973379, 40469597860 |
| documenso-invariants | 3 of 3             | 40498902575, 40465973379, 40469597860 |
| medusa-invariants    | 3 of 3             | 40498902575, 40524237209, 40526041971 |

Each run's case verdicts are VALID and PASS. Run 40498902575 holds the P6-OBS-MED-002 KNOWN FAIL marker for P6-MED-LOAD-009 (cancel race: leak 4 of 85 orders).

## 6. INVALID runs (listed, not used)

- Soak 40380234236 (Medusa 120 min): validity VALID, outcome FAIL on a cleanup TEST BUG (leak email pattern). Fixed by #99.
- Soaks 40351015461, 40352615775, 40354188739 (Medusa 30 min, on 6770606): outcome FAIL on a reconcile TEST BUG (stock exhausted), fixed by #93.

## 7. Known issues (each with evidence and a proposed PR title)

- P6-OBS-CAL-005 and P6-OBS-DOC-007: RSS growth in the soaks. PRODUCT BUG (SUSPECTED). Proposed: no PR here; the owner decides whether to file upstream.
- P6-OBS-MED-002: cancel race leaves reservations on canceled orders. PRODUCT BUG (SUSPECTED); marker in run 40498902575. Proposed upstream draft title: "cancel-order race leaves reservations on canceled orders".
- #115 merged with the non-Conventional title "Commit the empty soak bounds ..." (`d7afb2a`). Known issue; history is not rewritten.
- The Known issue for the knee Saturday cron (D3 of the old run) was not re-checked in this session; it stays open until someone verifies it.
- Session footers: #122 and #123 were created with an attribution footer; the bodies were updated to clean text before merge. Merge commits are clean.

## 8. Decisions made without the owner

- D-C1: no further calibration soaks.
- D-C4: the two-hour soak step is skipped because VALID 120-minute runs exist.
- D-C5: invariant evidence counts full dispatches and nightly runs.
- D-C10 to D-C14: branch names, merge method, the Medusa dispatch count, the closeout PR structure and the schedule mapping (recorded in the progress log, not in the repo).

## 9. Rule status (P6-RULE-001 to P6-RULE-006)

| Rule        | Status         | Reason                                                                               |
| ----------- | -------------- | ------------------------------------------------------------------------------------ |
| P6-RULE-001 | met with a gap | The steady cases have no latency threshold; the baseline file is a record.           |
| P6-RULE-002 | met            | Each case names its audit artefact.                                                  |
| P6-RULE-003 | met with a gap | Each cited run carries `run-meta.json`; the release notes list them when they exist. |
| P6-RULE-004 | not met        | The A/A tolerance and the gate evidence are WAITING on the parallel session.         |
| P6-RULE-005 | met with a gap | Medians use VALID runs only; the INVALID runs are listed in section 6.               |
| P6-RULE-006 | met with a gap | Knee ranges come from the Phase 4a release; Phase 4b did not add knees.              |

## 10. Open questions for the owner

- Dispatch the release `p6-phase4` with the inputs in the release notes (`RELEASE_DISPATCH_BY_SESSION=no`).
- The README "Phase 4 results" PR merges after the release exists.
- Confirm the parallel session's A/A and gate evidence, then update P6-RULE-004.

## 11. Backlog and next phase

- Calibration needs a product with no growth; none yet.
- The Medusa stock-exhaustion check and the cancel-race reservations need product fixes, which are not this repo's work.
