# Phase 4 closeout (2026-10-27)

Written from `docs/templates/phase-closeout.md`. Base: `origin/main` at `fd5caff` (after #122, #123, #127, #128, #129, #130, #131 and #133). Gate runs were read from their job logs in this session, and the probe's arm verdicts from its artefact. Perf, soak and pages runs were checked for event, branch and conclusion in this session; their verdicts are as recorded in the earlier closeout. Gaps are written as "not met" with the reason, never as met.

## 1. Summary

Phase 4b finished the soak evidence, the soak schedule, the invariant evidence, the dashboard refresh, the A/A noise evidence (Task 11) and the A/B gate evidence (Task 12). The release `p6-phase4` is the last open item; the rule status is in section 9, and the done-when check is in section 12.

## 2. Models used

Recorded in the session log, not in the repository.

## 3. Tasks

| Task                                 | Status                         | Evidence                                                                                         |
| ------------------------------------ | ------------------------------ | ------------------------------------------------------------------------------------------------ |
| Task 7 soaks                         | Done (calibration not reached) | Section 4; PRs #122, #123                                                                        |
| Task 8 Cal invariants under load     | Done                           | cal-invariants VALID in runs 40498902575, 40465973379, 40469597860                               |
| Task 9 Documenso exactly-once        | Done                           | documenso-invariants VALID in the same three runs                                                |
| Task 10 Medusa invariants under load | Done, one KNOWN FAIL marker    | medusa-invariants VALID in runs 40498902575, 40524237209, 40526041971                            |
| Task 11 A/A noise                    | Done                           | Section 4a; day 1 run 40497029348, day 2 run 40605925118; tolerance PR #128 (`c8bb445`)          |
| Task 12 A/B gate                     | Done                           | Section 4b; trigger run 40636843578 (both PASS); S24 probe run 40643722351 (PASS, draft PR #134) |
| Task 13 dashboard                    | Done                           | #109, #120, #127; pages run 40526023077 success                                                  |
| Task 14 closeout                     | In progress                    | this record, the release notes (#125) and the README results (#126)                              |

## 4. Soak evidence

Every VALID soak on main is in `docs/observations/2026-10-27-soak-bounds-not-calibrated.md`, with its Theil-Sen slope and plateau.

- Calibration: no product has three VALID 30-minute soaks without growth. `k6/thresholds/soak-bounds.json` stays `"products": {}`.
- Two-hour soaks: 120-minute soak runs on main exist for each product (runs 40373021384, 40373634603 and 40455577906, all `success` on `main`). Cal and Documenso show RSS growth in their soaks (P6-OBS-CAL-005, P6-OBS-DOC-007, PRODUCT BUG (SUSPECTED)).
- Schedule: `soak.yml` runs nightly for 30 minutes and on Sundays for 120 minutes (PR #123).

## 4a. A/A noise and the tolerance (Task 11)

Two dispatches of `gate.yml` on `main`, each with a discarded warm-up arm and three counted A/A arms per product. Every counted arm is `VALID` and `PASS` in its job log.

| Day | Run         | Head of main | Cal arms (counted) | Medusa arms (counted) |
| --- | ----------- | ------------ | ------------------ | --------------------- |
| 1   | 40497029348 | `9640e8b`    | 3 PASS             | 3 PASS                |
| 2   | 40605925118 | `4db5975`    | 3 PASS             | 3 PASS                |

- The tolerance (PR #128, `c8bb445`) pools the six counted arms per product. Gate run 40610528621 on `c8bb445` is `success`.
- Committed values in `k6/thresholds/tolerance.json`: K = 2, FLOOR = 0.10. Cal: p95 56.30 %, p50 80.83 %, rps 10 %. Medusa: p95 10 %, p50 42.38 %, rps 10 %.
- Known issue (PR #130): the Cal p95 tolerance is wide because the p95 moved between days (about 77 ms on day 1, about 59 ms on day 2; within-day spread under 3 %). The tolerance is not changed for this (section 7).

## 4b. A/B gate (Task 12)

Gate fix PRs: #116 (`c21ac11`), #119 (`d9825c9`), #121 (`3694906`), #129 (`4884aec`), #131 (`2f215d8`), #133 (`fd5caff`).

- **Trigger 1 (push to main, run 40636843578 on `4884aec`, `success`).** The gate self-test job is `success`.
  - ab-medusa: PASS. A p95 224.5 / 215.3 / 215.2 ms; B p95 218.6 / 217.0 / 214.8 ms; ratios 1.015 / 1.008 / 0.998; T 10.0 %.
  - ab-cal: PASS. A p95 86.6 / 83.0 / 83.5 ms; B p95 83.3 / 82.3 / 85.5 ms; ratios 0.998 / 0.985 / 1.025; T 56.3 %.
- **S24 ref-bump probe (run 40643722351, `pull_request`, `success`).** Probe PR #134 is a draft, was closed and was never merged (D-F7). Its `pull_request` run is cited as probe evidence only: it is not on main, so the release workflow cannot release it.
  - ab-medusa: PASS. A (`f677db4`) p95 161.0 / 151.5 / 149.1 ms; B (`15ef93d`) p95 144.6 / 160.7 / 151.8 ms; ratios 0.954 / 1.060 / 1.002; T 10.0 %.
- **Earlier probe PR #132** (run 40638763475, `pull_request`, `failure`): INVALID. Its B arms did not run (0 arms) because of the bug that PR #133 fixed. It is a finding, not evidence.

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
- Gate runs 40508127828, 40508696876 and 40511258429 (null PR labels in the trigger detection): fixed by #119 (`d9825c9`).
- Gate run 40511560394 (push on `d9825c9`, `failure`): listed as INVALID. Its cause and fix PR were not re-read in this session, so no fix PR is cited for it.
- Probe PR #132, run 40638763475 (`failure`, B arms 0): fixed by #133 (`fd5caff`).

## 7. Known issues (each with evidence and a proposed PR title)

- P6-OBS-CAL-005 and P6-OBS-DOC-007: RSS growth in the soaks. PRODUCT BUG (SUSPECTED). Proposed: no PR here; the owner decides whether to file upstream.
- P6-OBS-MED-002: cancel race leaves reservations on canceled orders. PRODUCT BUG (SUSPECTED); marker in run 40498902575. Proposed upstream draft title: "cancel-order race leaves reservations on canceled orders".
- Cal p95 T = 56.3 % from a runner shift between days (PR #130, `docs/observations/2026-10-28-cal-p95-tolerance-runner-shift.md`). Proposed PR title: `feat(load): measure the a/a noise as paired within-run ratios`. K, FLOOR and pooling are unchanged; the committed tolerance is not changed for this.
- The bootstrap can keep an old product checkout on a rerun after a pin bump (CodeRabbit on #134). Proposed PR title: `fix(bootstrap): check out the pinned ref when the product repo already exists`.
- The Medusa admin seed logs "User with email ... already exists" on each A/B arm (harmless noise). Proposed PR title: `fix(ci): skip the medusa admin seed when the admin exists`.
- #115 merged with the non-Conventional title "Commit the empty soak bounds ..." (`d7afb2a`). Known issue; history is not rewritten.
- #133 merged as "Merge pull request #133 from ..." (`fd5caff`), not "<title> (#133)". Known issue; history is not rewritten.
- Remote branches of the probes that the proxy refused to delete (HTTP 403): owner to-do, not retried.
- The Known issue for the knee Saturday cron (D3 of the old run) was not re-checked in this session; it stays open until someone verifies it.
- Attribution footers: the bodies of #122, #123, #124, #125 and #126 carried an attribution footer. The bodies were updated to clean text before merge, and the merge commits are clean.

## 8. Decisions made without the owner

- D-C1: no further calibration soaks.
- D-C4: the two-hour soak step is skipped because VALID 120-minute runs exist.
- D-C5: invariant evidence counts full dispatches and nightly runs.
- D-C10 to D-C14: branch names, merge method, the Medusa dispatch count, the closeout PR structure and the schedule mapping (recorded in the progress log, not in the repo).
- D-F1: merge order #124, then #125, then #126 after the `p6-phase4` tag exists.
- D-F2: cite only VALID runs on main, plus the S24 probe run on its draft PR. Failed-for-fixed-bug runs are INVALID and listed in section 6.
- D-F3: the committed tolerance (#128) stands as is: K = 2, FLOOR = 0.10, pooled over both days. The Cal p95 shift is a known issue (section 7), not a reason to change the file.
- D-F7: probe PRs #132 and #134 are never reopened or merged; their remote branches are an owner to-do.

## 9. Rule status (P6-RULE-001 to P6-RULE-006)

| Rule        | Status         | Reason                                                                                                                                                            |
| ----------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P6-RULE-001 | met with a gap | The steady cases have no latency threshold; the baseline file is a record.                                                                                        |
| P6-RULE-002 | met            | Each case names its audit artefact.                                                                                                                               |
| P6-RULE-003 | met with a gap | Each cited run carries `run-meta.json`; the release notes list them. The gate runs cited here were read by their log verdicts, not by each run's `run-meta.json`. |
| P6-RULE-004 | met with a gap | The A/A tolerance cites its runs (section 4a) and the gate runs cite it (section 4b). Gap: the Cal p95 runner shift (PR #130, section 7).                         |
| P6-RULE-005 | met with a gap | Medians use VALID runs only; the INVALID runs are listed in section 6.                                                                                            |
| P6-RULE-006 | met with a gap | Knee ranges come from the Phase 4a release; Phase 4b did not add knees.                                                                                           |

## 10. Open items for the owner

- The release `p6-phase4` is dispatched by the session (`RELEASE_DISPATCH_BY_SESSION=yes`), with the inputs in the release notes (#125). Owner to-do if that dispatch fails.
- The README "Phase 4 results" PR (#126) merges after the release exists.
- The remote branch deletes listed in section 7 (HTTP 403).

## 11. Backlog and next phase

- Calibration needs a product with no growth; none yet.
- The Medusa stock-exhaustion check and the cancel-race reservations need product fixes, which are not this repo's work.
- The follow-up PR titles in section 7 (paired within-run A/A ratios, bootstrap pin check, Medusa seed skip).

## 12. Done-when check (task 14 plan, section 14)

1. Release `p6-phase4` exists and `docs/releases/p6-phase4.md` is on main: pending the release dispatch (F6). Not met until then.
2. Each run ID cited in the README is a VALID run with its own verdict and label: the gate runs in 4a and 4b were read in this session. Perf, soak and pages runs were checked for event, branch and conclusion; their artefacts were read in the earlier closeout. Partly met: the artefacts of the earlier perf and soak runs were not re-read in this session.
3. Each rule has a status in section 9: met.
4. Each open bug has a draft under `docs/upstream/` or a URL: not met for P6-OBS-CAL-005, P6-OBS-DOC-007 and P6-OBS-MED-002. Drafts exist only for the Cal link-usage bug and the Documenso duplicate seal. Gap: no draft for the three open product bugs; the owner decides whether to file them.
5. `npm run check` exit 0 on the closeout branch: recorded in the PR (F2).
