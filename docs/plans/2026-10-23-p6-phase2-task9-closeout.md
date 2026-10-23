# P6 Phase 2 Task 9: Phase 2 closeout (plan only)

This is the plan a weaker model will build from. Do not build until the owner approves it. This commit adds the plan
only. Runs A and B already exist, because the task asked for them before the plan. The evidence release is **not** dispatched.

Structure follows the Phase 1 closeout plan [2026-10-21-p6-phase1-task8-closeout.md](2026-10-21-p6-phase1-task8-closeout.md).
Scope: roadmap [2026-10-22-p6-phase2-roadmap.md](2026-10-22-p6-phase2-roadmap.md), "Task 9: Phase 2 closeout". Rules:
[docs/agent-rules.md](../agent-rules.md). No new cases. Harness pin stays `qa-portfolio-harness#v0.2.12`.

## 0. Header and status

- Plan branch: `plan/2026-10-23-p6-phase2-closeout` (this commit only, no PR, never deleted; rules 6 and 10).
- Build branch (after approval): `docs/2026-10-23-p6-phase2-closeout`, one PR.
- Base: `origin/main` = `a82521a` (merge of PR #50, X8). It contains the rule-fixes merge `162e595` (PR #49) and the X8 merge
  `a82521a` (PR #50). Base check: **met**.
- Probe date: 2026-10-23 (UTC), from GitHub (`gh`, the REST API), the downloaded artefacts and job logs, and read-only
  blobless clones of the four upstream repositories. No product was started: this task changes no product code, and every
  number comes from CI.
- **Stop for owner review: yes.** This plan proposes a CI workflow change (§6 step 2, the release title) and asks for product
  bug labels (§4 6a, 6c, 6d). Rule 10.
- Unit-test count today: **471** (`npm run check`, exit 0; §11).
- **Owner review (2026-10-23): approved with changes.** §15 records the owner's decisions; where §15 differs from a
  proposal in §4, §6, §8, §9 or §10, §15 and the edited sections win.

## 1. What the build does, and what it does not

The build:

1. Fixes the three `issue` annotations that do not start with their ID (§4 6f).
2. Takes the evidence release title from the notes heading, so the Phase 2 release is not called "Phase 1" (§2.9; CI change).
3. Adds `docs/releases/p6-phase2.md`, listing exactly runs A and B (§8.2).
4. Adds "Phase 2 results" to README, extends "Known product bugs", fixes the stale harness version (§8.1).
5. Updates `docs/BACKLOG.md` with the owner's decisions on §4 (§8.3).
6. Adds the phase closeout report `docs/plans/2026-10-2x-p6-phase2-closeout.md` from the template (rule 19; §8.4).
7. After the PR merges (owner's word), dispatches `evidence-release.yml` for `p6-phase2` (§6 step 8).

The build does not: add or change a case, change a trial count (no run proved a timeout, §2.7), change a product fork, the
harness or its pin, file an upstream issue or post a comment anywhere. The owner files every draft in §9 and the appendices.

## 2. Probe findings

### 2.1 Phase 2 cases (Tasks 2 to 8, 3b and X8)

"Label evidence" is the run set the owner labelled from. Those are full-count `workflow_dispatch` runs on the feature
branches, so they are label evidence only. Published numbers in §2.5 come from `main` runs only.

| Task | Case / test                                       | Spec                                                                                                  | CI job                                                      | Label today                                                    | Label evidence                                                                                                                                                                                                                                                                                 |
| ---- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2    | `P6-MED-RACE-007` refunds of X                    | `tests/medusa/races/med-race-007-refunds.spec.ts`                                                     | `medusa-smoke`                                              | none (invariant holds)                                         | —                                                                                                                                                                                                                                                                                              |
| 2    | `P6-MED-RACE-010` captures of X                   | `tests/medusa/races/med-race-010-captures.spec.ts`                                                    | `medusa-smoke`                                              | none (invariant holds)                                         | —                                                                                                                                                                                                                                                                                              |
| 2    | `P6-MED-RACE-011` refunds of X/2                  | `tests/medusa/races/med-race-011-partial-refunds.spec.ts`                                             | `medusa-smoke`                                              | F-M1 SUSPECTED (D40), annotation                               | live probe 2026-10-22                                                                                                                                                                                                                                                                          |
| 2    | `P6-MED-RACE-006` gift card                       | none (Later, D5/D34)                                                                                  | —                                                           | —                                                              | no gift-card route at `MEDUSA_REF`                                                                                                                                                                                                                                                             |
| 3    | `P6-MED-RACE-005` campaign budget                 | `tests/medusa/races/med-race-005-campaign-budget.spec.ts`                                             | `medusa-order-races`                                        | F-M2 PRODUCT BUG (D70), annotation only                        | [39843267008](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39843267008), [39845815035](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39845815035), [39848223959](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39848223959) |
| 3    | `P6-MED-RACE-012` usage limit                     | `tests/medusa/races/med-race-012-usage-limit.spec.ts`                                                 | `medusa-order-races`                                        | F-M2 PRODUCT BUG (D70), annotation only                        | same three runs                                                                                                                                                                                                                                                                                |
| 3    | `P6-MED-RACE-008` double cancel                   | `tests/medusa/races/med-race-008-double-cancel.spec.ts`                                               | `medusa-smoke`                                              | X04, F-M3 PRODUCT BUG (D67, D68), `test.fail()`                | same three runs                                                                                                                                                                                                                                                                                |
| 3    | `P6-MED-RACE-009` cancel ‖ fulfil                 | `tests/medusa/races/med-race-009-cancel-vs-fulfil.spec.ts`                                            | `medusa-smoke`                                              | X05, F-M3 PRODUCT BUG (D68, D69), `test.fail()`, 13 PR trials  | same three runs                                                                                                                                                                                                                                                                                |
| 3b   | `P6-MED-RACE-013` ten cancels                     | `tests/medusa/races/med-race-013-cancel-burst.spec.ts`                                                | `medusa-cancel-extras`                                      | X04, F-M3 as `product-bug` annotations (existing labels)       | Task 3b §16.1                                                                                                                                                                                                                                                                                  |
| 3b   | `P6-MED-RACE-014` ten cancels, captured           | `tests/medusa/races/med-race-014-captured-cancels.spec.ts`                                            | `medusa-cancel-extras`                                      | X04, F-M3 annotations; **F-M4 SUSPECTED** (label waits, §4 6a) | §2.5                                                                                                                                                                                                                                                                                           |
| 4    | `P6-CAL-RACE-006` link cap 1                      | `tests/cal/races/cal-race-006-private-link.spec.ts`                                                   | `cal-state-races`                                           | F-C1 PRODUCT BUG (O6), known-bug test under `test.fail()`      | [39932990882](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39932990882), [39935674101](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39935674101), [39938126238](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39938126238) |
| 4    | `P6-CAL-RACE-008` link cap 3                      | `tests/cal/races/cal-race-008-private-link-cap.spec.ts`                                               | `cal-state-races`                                           | F-C1 PRODUCT BUG (O6), `test.fail()`                           | same three runs                                                                                                                                                                                                                                                                                |
| 4    | `P6-CAL-RACE-007` confirm ‖ cancel                | `tests/cal/races/cal-race-007-confirm-vs-cancel.spec.ts`                                              | `cal-state-races`                                           | F-C2 PRODUCT BUG (O6), `test.fail()`                           | same three runs                                                                                                                                                                                                                                                                                |
| 4    | `P6-CAL-RACE-009` confirm ‖ confirm               | `tests/cal/races/cal-race-009-double-confirm.spec.ts`                                                 | `cal-state-races`                                           | F-C3 PRODUCT BUG (O6), `test.fail()`                           | same three runs                                                                                                                                                                                                                                                                                |
| 5    | `P6-OBS-DOC-001` (2 negative tests + setup)       | `tests/documenso/api/doc-obs-001-signin-errors.spec.ts`                                               | `documenso-smoke` (step "Documenso sign-in error contract") | PRODUCT BUG (owner), `test.fail()` on both                     | Task 5 §14: PR #41 heads `4671661`, `b0937e0`; `main` [39961527451](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39961527451)                                                                                                                                           |
| 6    | Twenty self-test (no race)                        | `tests/twenty/races/twenty-self-test.spec.ts`                                                         | `twenty-smoke`                                              | none                                                           | —                                                                                                                                                                                                                                                                                              |
| 7    | `P6-TW-RACE-001`, `-002`, `-003`, `-005`, `-006`  | `tests/twenty/tw-races/tw-race-00{1,2,3,5,6}-*.spec.ts`                                               | `twenty-races`                                              | none (all pass)                                                | —                                                                                                                                                                                                                                                                                              |
| 7    | `P6-TW-RACE-004` reset token                      | `tests/twenty/tw-races/tw-race-004-reset-token.spec.ts`                                               | `twenty-races`                                              | PRODUCT BUG (owner), `test.fail()` after the guards            | Task 7 probe §3.7 (50 of 50 requests)                                                                                                                                                                                                                                                          |
| 8    | none (probe report, harness spec H3)              | —                                                                                                     | —                                                           | —                                                              | —                                                                                                                                                                                                                                                                                              |
| X8   | `P6-OBS-TW-001` (8 hang tests + 2 resource tests) | `tests/twenty/tw-obs/tw-obs-001-empty-body-hang.spec.ts`, `tw-obs-001-hung-requests-resource.spec.ts` | `twenty-obs`                                                | PRODUCT BUG (owner), 8 tests under `test.fail()`               | X8 plan §3.1 to §3.4                                                                                                                                                                                                                                                                           |

Task 1 (rerun-on-spread) added no case; its invalid-trial and rerun counts are in §2.5. PRs #37 and #38 added the `-001`
orphan-order sweep and the F-M5 annotation (§4 6b).

### 2.2 Every `perf.yml` run on `main` since 2026-10-22

30 runs before run B (23 push, 5 `workflow_dispatch`, 2 schedule; run A included), plus run B. Job durations are wall clock in minutes. `—` = the job did
not exist yet.

| Run                                                                                                | Event    | Head      | Result    | medusa-smoke   | medusa-order-races | medusa-cancel-extras | cal-smoke     | cal-state-races | documenso-smoke | twenty-smoke | twenty-races | twenty-obs  |
| -------------------------------------------------------------------------------------------------- | -------- | --------- | --------- | -------------- | ------------------ | -------------------- | ------------- | --------------- | --------------- | ------------ | ------------ | ----------- |
| [40039351021](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40039351021) (B) | dispatch | `a82521a` | success   | success 19.9   | success 10.1       | success 3.8          | success 4.7   | success 10.1    | success 5.0     | success 3.0  | success 6.1  | success 4.6 |
| [40037355173](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40037355173) (A) | push     | `a82521a` | success   | success 19.5   | success 15.6       | success 6.7          | success 4.8   | success 10.0    | success 5.9     | success 2.9  | success 6.0  | success 4.5 |
| [40033135757](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40033135757)     | push     | `162e595` | success   | success 19.7   | success 15.2       | success 4.3          | success 3.9   | success 9.8     | success 4.9     | success 3.2  | success 6.1  | —           |
| [40014093546](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40014093546)     | push     | `ad14c6a` | success   | success 19.6   | success 9.6        | success 4.4          | success 4.7   | success 9.9     | success 5.8     | success 3.9  | success 5.5  | —           |
| [40006260061](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40006260061)     | push     | `4b09d34` | success   | success 19.9   | success 15.2       | success 4.4          | success 4.7   | success 10.0    | success 4.8     | success 3.6  | success 6.1  | —           |
| [39996805900](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39996805900)     | push     | `088ca04` | success   | success 14.5   | success 17.7       | success 3.9          | success 4.6   | success 9.9     | success 6.0     | success 3.5  | —            | —           |
| [39993081595](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39993081595)     | push     | `9b38d4f` | success   | success 14.8   | success 11.6       | success 3.5          | success 5.5   | success 7.6     | success 5.8     | success 3.9  | —            | —           |
| [39979511916](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39979511916)     | push     | `38533b0` | success   | success 20.4   | success 15.2       | success 4.4          | success 5.2   | success 9.8     | success 6.0     | success 3.8  | —            | —           |
| [39969241809](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39969241809)     | push     | `6ee9846` | success   | success 11.9   | success 16.1       | success 4.5          | success 4.3   | success 9.7     | success 5.8     | —            | —            | —           |
| [39961527451](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39961527451)     | push     | `92a9a93` | success   | success 21.4   | success 9.9        | success 5.0          | success 5.3   | success 10.0    | success 5.7     | —            | —            | —           |
| [39951483517](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39951483517)     | push     | `2cf2de8` | success   | success 13.1   | success 16.4       | success 3.8          | success 3.7   | success 9.5     | success 5.9     | —            | —            | —           |
| [39948384170](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39948384170)     | push     | `0728ebe` | success   | success 14.1   | success 13.1       | success 5.0          | success 4.5   | success 9.0     | success 5.5     | —            | —            | —           |
| [39941942658](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39941942658)     | push     | `b221c85` | success   | success 19.4   | success 16.1       | success 4.6          | success 5.2   | —               | success 5.4     | —            | —            | —           |
| [39941365044](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39941365044)     | push     | `49ddd05` | cancelled | cancelled 5.3  | cancelled 5.3      | success 4.5          | cancelled 5.0 | —               | cancelled 5.3   | —            | —            | —           |
| [39935736478](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39935736478)     | dispatch | `8324170` | success   | success 19.4   | success 15.7       | success 3.2          | success 3.7   | —               | success 5.8     | —            | —            | —           |
| [39934300578](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39934300578)     | push     | `8324170` | cancelled | cancelled 12.8 | cancelled 12.8     | success 3.4          | success 4.7   | —               | success 5.7     | —            | —            | —           |
| [39930717584](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39930717584)     | dispatch | `73db10f` | success   | success 13.5   | success 15.7       | success 4.7          | success 5.2   | —               | success 5.4     | —            | —            | —           |
| [39927945708](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39927945708)     | dispatch | `73db10f` | success   | success 22.0   | success 16.5       | success 4.4          | success 4.0   | —               | success 4.9     | —            | —            | —           |
| [39927942238](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39927942238)     | dispatch | `73db10f` | cancelled | —              | —                  | —                    | —             | —               | —               | —            | —            | —           |
| [39927939437](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39927939437)     | dispatch | `73db10f` | cancelled | —              | —                  | —                    | —             | —               | —               | —            | —            | —           |
| [39926461664](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39926461664)     | push     | `73db10f` | cancelled | cancelled 12.8 | success 10.4       | success 4.6          | success 4.5   | —               | success 5.8     | —            | —            | —           |
| [39923528658](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39923528658)     | push     | `dc95c29` | failure   | failure 20.4   | success 17.9       | failure 3.2          | success 5.1   | —               | success 5.9     | —            | —            | —           |
| [39918269577](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39918269577)     | schedule | `937b57d` | success   | success 15.2   | success 9.6        | —                    | success 4.7   | —               | success 5.7     | —            | —            | —           |
| [39917207104](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39917207104)     | push     | `937b57d` | failure   | failure 19.7   | success 10.8       | —                    | success 5.1   | —               | success 5.6     | —            | —            | —           |
| [39914092582](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39914092582)     | push     | `8cccc56` | success   | success 18.6   | success 12.3       | —                    | success 5.6   | —               | success 6.0     | —            | —            | —           |
| [39845479090](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39845479090)     | push     | `697afc2` | success   | success 15.0   | —                  | —                    | success 4.7   | —               | success 5.5     | —            | —            | —           |
| [39829474241](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39829474241)     | push     | `8a46530` | success   | success 17.6   | —                  | —                    | success 5.1   | —               | success 5.4     | —            | —            | —           |
| [39827519846](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39827519846)     | push     | `a63ef60` | success   | success 13.5   | —                  | —                    | success 3.9   | —               | success 5.9     | —            | —            | —           |
| [39821517901](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39821517901)     | push     | `c89f703` | success   | success 14.4   | —                  | —                    | success 4.5   | —               | success 6.1     | —            | —            | —           |
| [39751077456](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39751077456)     | push     | `147d94b` | success   | success 10.6   | —                  | —                    | success 3.6   | —               | success 5.8     | —            | —            | —           |
| [39741411392](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39741411392)     | schedule | `ac563ab` | success   | success 16.1   | —                  | —                    | success 9.2   | —               | success 5.8     | —            | —            | —           |

Red and cancelled runs on `main`, all explained (none is unexplained):

- `39917207104` (push `937b57d`, failure): `medusa-smoke` race step, `P6-MED-RACE-008` and `-009` hit the 60 s `beforeAll`
  timeout (`seedAndLogin()`). Same commit green in schedule `39918269577`. Task 3b §10 recorded it; the same symptom is what
  PR #36 (`73db10f`, own `beforeAll` timeouts) fixed. No `medusa-smoke` or `medusa-cancel-extras` failure in the 18 `main`
  runs from `73db10f` on before run B (3 of their `medusa-smoke` jobs were cancelled by newer pushes), nor in run B.
- `39923528658` (push `dc95c29`, failure): `beforeAll` 60 s timeouts in `medusa-smoke` (`-008`, `-009`) and
  `medusa-cancel-extras` (`-014`). Root cause and fix: PR #36 (Task 3b §10).
- `39926461664`, `39934300578`, `39941365044` (push, cancelled): a newer push to `main` cancelled them
  (`cancel-in-progress` in the `concurrency` block). `39927939437`, `39927942238` (dispatch, cancelled): duplicate
  dispatches, cancelled the same way.
- No scheduled run since `39918269577` (2026-10-23 07:30 UTC). The next slot is 2026-10-24 02:17 UTC; it will run at
  `a82521a` unless `main` moves. It is not needed for this closeout.

### 2.3 Runs A and B

- **Run A** = [40037355173](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40037355173), push of the
  PR #50 merge, head `a82521a`, created 2026-10-23 23:02 UTC: **success**, 9 of 9 jobs green.
- **Run B** = [40039351021](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40039351021),
  `workflow_dispatch` on `main` (`gh workflow run perf.yml --ref main`), head `a82521a`, created 23:23 UTC, after run A had
  finished (the push and the dispatch share the `perf-refs/heads/main` concurrency group, so an earlier dispatch would have
  cancelled A): **success**, 9 of 9 jobs green.

| Job                    | Run A             | Run B             | Expected failures (known-bug tests) in A / B                | "Known product bugs still reproducing" line (job summary, A)                                                           |
| ---------------------- | ----------------- | ----------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `medusa-smoke`         | success, 19.5 min | success, 19.9 min | 2 / 2                                                       | none                                                                                                                   |
| `medusa-order-races`   | success, 15.6 min | success, 10.1 min | 0 / 0                                                       | none                                                                                                                   |
| `medusa-cancel-extras` | success, 6.7 min  | success, 3.8 min  | 0 / 0                                                       | none                                                                                                                   |
| `cal-smoke`            | success, 4.8 min  | success, 4.7 min  | 2 / 2                                                       | P6-OBS-CAL-001, P6-OBS-CAL-002                                                                                         |
| `cal-state-races`      | success, 10.0 min | success, 10.1 min | 4 / 4 (read from the list reporter: 4 × `✘` in green steps) | no job summary step                                                                                                    |
| `documenso-smoke`      | success, 5.9 min  | success, 5.0 min  | 3 / 3                                                       | PRODUCT BUG P6-OBS-DOC-001 (low), PRODUCT BUG P6-OBS-DOC-001 (low), P6-OBS-DOC-002                                     |
| `twenty-smoke`         | success, 2.9 min  | success, 3.0 min  | 0 / 0                                                       | none                                                                                                                   |
| `twenty-races`         | success, 6.0 min  | success, 6.1 min  | 1 / 1                                                       | P6-TW-RACE-004 PRODUCT BUG                                                                                             |
| `twenty-obs`           | success, 4.5 min  | success, 4.6 min  | 8 / 8                                                       | P6-OBS-TW-001, P6-OBS-TW-001, P6-OBS-TW-001, P6-OBS-TW-001, P6-OBS-TW-001, P6-OBS-TW-001, P6-OBS-TW-001, P6-OBS-TW-001 |

Every product job is green, and every known-bug test failed as expected. No re-run was needed or made.

### 2.4 Known-bug tests and the job summary

The job summary is echoed into each job log, so its "Known product bugs still reproducing" line is readable from the logs.
It lists only tests that carry an annotation of type `issue` (`src/ci/playwright-json-summary.ts` `ISSUE_ANNOTATION_TYPE`) and
takes the ID as the text before the first colon (`issueIdFromDescription`). Findings:

- `medusa-smoke` shows 2 expected failures (`-008`, `-009`) but "none": those two tests have no `issue` annotation.
- `cal-state-races` has **no job summary step**, so its four known-bug tests appear in no summary.
- `documenso-smoke` lists `PRODUCT BUG P6-OBS-DOC-001 (low)` twice, and `twenty-races` lists `P6-TW-RACE-004 PRODUCT BUG`: the
  ID nit (§4 6f).
- `twenty-races` rows show `fail` and "Failed: see the job log" for all six Twenty cases in a green job (§2.10, X9).

### 2.5 Phase 2 results from `main` (the numbers README will publish)

Rule: a run counts when its event is push, schedule or `workflow_dispatch` on `main` **and the job that wrote the histogram
ended `success`**. Every case below ran at 50 trials in every counted run, so one median per case is valid. Per-trial time is
`(finishedAt − startedAt) ÷ trials` from the histogram. "Signals" counts attempts (valid and invalid, D3) that showed the tag.

| Case              | Job                    | Runs | Median per-trial (s) | Range (s)     | Invalid trials / reruns | Signals (attempts)                               | Run A (time; signals) | Run B (time; signals) |
| ----------------- | ---------------------- | ---- | -------------------- | ------------- | ----------------------- | ------------------------------------------------ | --------------------- | --------------------- |
| `P6-MED-RACE-007` | `medusa-smoke`         | 20   | 1.37                 | 0.84 to 1.58  | 0 / 0                   | none                                             | 1.38 s                | 1.39 s                |
| `P6-MED-RACE-010` | `medusa-smoke`         | 20   | 1.28                 | 0.79 to 1.48  | 0 / 0                   | none                                             | 1.30 s                | 1.31 s                |
| `P6-MED-RACE-011` | `medusa-smoke`         | 20   | 1.46                 | 0.90 to 1.65  | 0 / 0                   | F-M1 705 of 1000                                 | 1.50 s; 31            | 1.49 s; 39            |
| `P6-MED-RACE-008` | `medusa-smoke`         | 18   | 1.16                 | 0.72 to 1.33  | 0 / 0                   | X04 653 of 900; F-M3 247 of 900                  | 1.20 s; 42; 8         | 1.20 s; 43; 7         |
| `P6-MED-RACE-009` | `medusa-smoke`         | 18   | 1.12                 | 0.70 to 1.33  | 0 / 0                   | X05 259 of 900; F-M3 40 of 900                   | 1.13 s; 11; 4         | 1.15 s; 11; 3         |
| `P6-MED-RACE-005` | `medusa-order-races`   | 21   | 8.28                 | 4.91 to 9.72  | 1 / 1                   | F-M2 12 of 1051                                  | 8.57 s; 2             | 5.52 s; 0             |
| `P6-MED-RACE-012` | `medusa-order-races`   | 21   | 8.16                 | 4.86 to 10.28 | 0 / 0                   | F-M2 209 of 1050                                 | 8.50 s; 10            | 5.01 s; 2             |
| `P6-MED-RACE-013` | `medusa-cancel-extras` | 19   | 1.68                 | 1.11 to 3.29  | 0 / 0                   | X04 948 of 950; F-M3 945 of 950                  | 3.29 s; 50; 46        | 1.40 s; 50; 50        |
| `P6-MED-RACE-014` | `medusa-cancel-extras` | 19   | 1.80                 | 1.19 to 2.75  | 3 / 3                   | X04 949 of 953; F-M3 950 of 953; F-M4 684 of 953 | 2.75 s; 49; 48; 43    | 1.55 s; 50; 50; 36    |
| `P6-CAL-RACE-006` | `cal-state-races`      | 12   | 2.09                 | 1.23 to 2.24  | 0 / 0                   | accepted above the cap 600 of 600                | 2.24 s; 50            | 2.19 s; 50            |
| `P6-CAL-RACE-008` | `cal-state-races`      | 12   | 1.98                 | 1.19 to 2.10  | 0 / 0                   | accepted above the cap 600 of 600                | 2.10 s; 50            | 2.10 s; 50            |
| `P6-CAL-RACE-007` | `cal-state-races`      | 12   | 1.81                 | 1.70 to 1.82  | 0 / 0                   | both side-effect sets 600 of 600                 | 1.82 s; 50            | 1.81 s; 50            |
| `P6-CAL-RACE-009` | `cal-state-races`      | 12   | 1.81                 | 1.72 to 1.85  | 0 / 0                   | two BOOKING_CREATED 600 of 600                   | 1.85 s; 50            | 1.84 s; 50            |
| `P6-TW-RACE-001`  | `twenty-races`         | 5    | 0.06                 | 0.05 to 0.06  | 0 / 0                   | none                                             | 0.06 s                | 0.06 s                |
| `P6-TW-RACE-002`  | `twenty-races`         | 5    | 0.04                 | 0.04 to 0.05  | 0 / 0                   | none                                             | 0.04 s                | 0.04 s                |
| `P6-TW-RACE-003`  | `twenty-races`         | 5    | 0.10                 | 0.08 to 0.10  | 0 / 0                   | none                                             | 0.09 s                | 0.10 s                |
| `P6-TW-RACE-004`  | `twenty-races`         | 5    | 1.45                 | 1.35 to 1.46  | 0 / 0                   | more than one success 250 of 250                 | 1.35 s; 50            | 1.46 s; 50            |
| `P6-TW-RACE-005`  | `twenty-races`         | 5    | 0.05                 | 0.04 to 0.06  | 0 / 0                   | none                                             | 0.06 s                | 0.04 s                |
| `P6-TW-RACE-006`  | `twenty-races`         | 5    | 1.02                 | 0.95 to 1.06  | 0 / 0                   | none                                             | 1.05 s                | 1.01 s                |

Notes:

- Invalid trials and reruns (Task 1): 3 in `-014`, 1 in `-005` and none elsewhere among the Phase 2 cases. Runs A and B had 0.
- `-001` (Phase 1 case, now with the F-M5 sweep): 0 oversold in 1200 trials of 24 green `medusa-smoke` runs; 0 orphan-order
  (F-M5) lines in the 13 green runs since PR #38 (A and B included).
- Run B's Medusa budget cases ran faster than A (`-005` 5.52 s against 8.57 s per trial): the same code at the same head, so
  this is runner speed, not a change (range 4.9 to 9.7 s over 21 runs).
- F-M1 (`-011`) stays SUSPECTED (no label was asked for): 31 to 40 of 50 attempts in every run.
- Twenty medians use n = 5 runs (A and B included), the minimum the rule allows plus two. A Twenty per-trial time is mostly
  setup, not the burst.

### 2.6 F-M2 and the D65 arithmetic (for §4 6e)

`P6-MED-RACE-012`, green full-count `main` runs: F-M2 in **209 of 1050** attempts (19.9 %; Wilson 95 % lower end 17.6 %). The D65
formula gives `n = ceil(ln 0.01 / ln(1 − 0.176)) = 24`. But the rate is not steady from run to run: 0 to 21 of 50, 6 of 21 runs
at 2 or fewer (run B: 2), and one whole run with none (`39918269577`, schedule). Measured over every window of consecutive attempts in
those runs:

| PR trials          | Empirical miss (no F-M2 in the window)                       |
| ------------------ | ------------------------------------------------------------ |
| 13                 | 173 of 798 = 21.7 %                                          |
| 24 (the D65 n)     | 78 of 546 windows at 25 = 14.3 % (25 shown; 24 is no better) |
| 28 (BACKLOG count) | 64 of 483 = 13.3 %                                           |
| 35                 | 36 of 336 = 10.7 %                                           |
| 50 (a full run)    | 1 of 21 runs = 4.8 %                                         |

`-005`: 12 of 1051 attempts; 15 of 21 full runs show none. Same method for comparison:

| Case and signal                        | Pooled                                                          | D65 n | Empirical miss at the D65 n, or at the PR count used today                         |
| -------------------------------------- | --------------------------------------------------------------- | ----- | ---------------------------------------------------------------------------------- |
| `-014` F-M4                            | 684 of 953 (71.8 %; lower end 68.8 %), every run 31 to 43 of 50 | 4     | 4 trials: 8 of 896 = 0.9 %; 5 trials: 3 of 877 = 0.3 %                             |
| `-009` X05 or F-M3 (PR count 13 today) | 299 of 900 (33.2 %; lower end 30.2 %), per run 6 to 28          | 13    | 13 trials: 16 of 684 = **2.3 %**; 20 trials: 5 of 558 = 0.9 %; 25 trials: 0 of 468 |

The `-009` row is a side finding: its PR count misses more often than the 1 % D65 aimed at, because the rate fell in later runs
(follow-up F9).

### 2.7 Time budget per job (worst case against the job timeout)

Convention (Task 3 §11, Task 3b §16.2, rule 20 c): worst case = the slowest green `main` job, plus the full invalid budget of
reruns for every 50-trial case (`invalidBudget(50) = 10` attempts each) at that case's slowest per-trial time; it must stay 10
minutes under the job timeout, and a race step must stay under 80 % of its step timeout (the stop rule).

| Job                    | Green `main` runs | Slowest job (min, run) | Rerun allowance (min) | Worst case (min) | Job timeout | Margin | Race step: slowest + allowance vs step timeout (stop rule 80 %)   |
| ---------------------- | ----------------- | ---------------------- | --------------------- | ---------------- | ----------- | ------ | ----------------------------------------------------------------- |
| `medusa-smoke`         | 24                | 22.0 (39927945708)     | 4.2                   | 26.2             | 45          | 18.8   | 19.9 + 4.2 = 24.1 vs 30 (24.0)                                    |
| `medusa-order-races`   | 21                | 17.9 (39923528658)     | 3.3                   | 21.3             | 45          | 23.7   | 16.5 + 3.3 = 19.9 vs 40 (32.0)                                    |
| `medusa-cancel-extras` | 19                | 6.7 (40037355173)      | 1.0                   | 7.7              | 30          | 22.3   | 5.2 + 1.0 = 6.2 vs 20 (16.0)                                      |
| `cal-smoke`            | 28                | 9.2 (39741411392)      | 0.5                   | 9.7              | 60          | 50.3   | 1.1 + 0.5 = 1.6 vs 15 (12.0) (the `-001` step; `-003` is smaller) |
| `cal-state-races`      | 12                | 10.1 (40039351021)     | 1.3                   | 11.4             | 85          | 73.6   | 1.9 + 1.3 = 3.2 vs 10 (8.0) (each of the four race steps)         |
| `documenso-smoke`      | 28                | 6.1 (39821517901)      | 0.8                   | 6.9              | 45          | 38.1   | 3.9 + 0.8 = 4.7 vs 30 (24.0)                                      |
| `twenty-smoke`         | 8                 | 3.9 (39993081595)      | 0.0                   | 3.9              | 20          | 16.1   | 0.1 + 0.0 = 0.1 vs 5 (4.0)                                        |
| `twenty-races`         | 5                 | 6.1 (40033135757)      | 0.5                   | 6.6              | 33          | 26.4   | 2.4 + 0.5 = 2.8 vs 9 (7.2)                                        |
| `twenty-obs`           | 2                 | 4.6 (40039351021)      | 0.0                   | 4.6              | 27          | 22.4   | 0.7 + 0.0 = 0.7 vs 3 (2.4)                                        |

Every job is at least 16 minutes under its job timeout. **One step estimate passes its stop rule, by 0.1 min:**
`medusa-smoke`'s race step, slowest measured 19.9 min (run 39961527451) + a 4.2-minute allowance = 24.1 min against the 24.0-minute
stop rule (80 % of its 30-minute step timeout). The allowance assumes every case in the step uses its whole invalid budget at
its slowest trial; in the 24 green runs the step's cases used 0 reruns, except one in `-010`. No run came near the step
timeout (slowest 66 % of it), so no run proves a timeout, and the task rule keeps the trial counts unchanged. Proposed (Q7):
leave `perf.yml` as it is now and watch it (R1); if the owner wants the rule met on paper, the minimal fix is the step timeout
30 → 31 min (stop rule 24.8), a CI change for a later PR, never a trial cut. The `cal-state-races` row adds the whole-job
allowance to one step, which overstates it.

### 2.8 Evidence release inputs (prepared, not dispatched)

```text
workflow:   .github/workflows/evidence-release.yml   (dispatch from main only)
tag:        p6-phase2
target_sha: a82521ad0e258ea3e5f9b649b389745cd96280a9   (head of runs A and B; Phase 1 used the head of its runs, 4aecc2d)
run_ids:    40037355173 40039351021
```

Checks the workflow will run, and the probe result for each:

| Check                                                                             | Probe                                                                                                                        |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| dispatched from `main`                                                            | the command uses `--ref main`                                                                                                |
| tag format `^p6-[a-z0-9-]+$`, 40-hex SHA                                          | `p6-phase2`, `a82521ad…`                                                                                                     |
| `target_sha` on `main`, `docs/releases/p6-phase2.md` on `main`                    | SHA yes; the notes land with the build PR, so dispatch only after it merges                                                  |
| notes link exactly the run ids                                                    | the notes template (§8.2) links only A and B; it never writes `actions/runs/` for any other run                              |
| tag and release do not exist                                                      | `p6-phase2`: not found (only `p6-phase1` exists)                                                                             |
| each run is a successful perf.yml run on `main`, head an ancestor of `target_sha` | A: yes. B: **success**, 9 of 9 jobs green                                                                                    |
| project token scan (`scripts/evidence-token-scan.mjs`)                            | dry run on the downloaded `*.json`/`*.log` of A: `token scan: clean`, 48 files, 41 MB; B: `token scan: clean`, 48 files, 41M |
| gitleaks                                                                          | not run locally (not installed); runs in the workflow                                                                        |
| artefacts still present                                                           | 14-day retention: A and B artefacts expire on 2026-11-06. Dispatch before then.                                              |

### 2.9 The release title is hard-coded

`evidence-release.yml`, step "Create the release", passes `--title "P6 Phase 1 evidence (CI)"`. Dispatched as it is, the
`p6-phase2` release would be titled "Phase 1". Fix in the build, step 2 (a CI change, so the owner reviews it): the title comes
from the first line of `docs/releases/$TAG.md`. The Phase 1 notes start with `# P6 Phase 1 evidence (CI)`, so the rule gives the
same title for Phase 1. Alternative without a CI change: dispatch as it is, then `gh release edit p6-phase2 --title …` by hand.
Proposed: the CI fix (Q2).

### 2.10 Evidence defects found (TEST BUG, reporting only)

- **X9 Twenty histograms always say `verdict: "fail"`.** `src/twenty/run-case.ts` `runTwentyTrials` never sets `verdict`, so it
  keeps the `createHistogram` default `"fail"` (`src/races/histogram.ts`). Medusa and Cal set `verdict = trialsOk &&
invariantViolations.length === 0`. All six `P6-TW-RACE-*` histograms in every `main` run, A included, say `fail` with 0
  violations, and the job summary prints "Failed: see the job log" for them in a green job. The tests themselves are correct
  (the guards and the `test.fail()` read the trials, not `verdict`). Proposed: a separate small fix PR after the closeout, with a
  unit test; the release notes explain the field (§8.2). It is not in this build: it changes runner code.
- **X10 `twenty-obs` uploads only `containers.log`.** Its test results are only in the job log, which the release does not
  hold. The same is true of `documenso-api` (no histogram). The release notes say so and README links the job pages.
- **E1, E2** (§4 6f): six known-bug tests without an `issue` annotation, and no job summary in `cal-state-races`.

### 2.11 Upstream check (read-only)

Upstream HEAD from `git ls-remote` on 2026-10-23; code read from blobless clones in the session scratchpad (never committed).

| Product   | Upstream                      | HEAD checked                                                                       | Pin in P6                                                             | Bug code path at HEAD                                                                                                                                                                                                                                                                                                                       | Issue template                                                      | Security policy                                                        |
| --------- | ----------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Medusa    | `medusajs/medusa` (`develop`) | `029fb31fd077ab9c6d6fd9d68c676c17c71294c7` (2026-10-23, `@medusajs/medusa` 2.22.1) | starter `f677db43`, `@medusajs/*` 2.21.2 (tag `v2.21.2` = `02056539`) | `core-flows` `cancel-order.ts`, `create-fulfillment.ts`, `complete-cart.ts`, `delete-reservations-by-line-items.ts`, `delete-reservations.ts`: **identical** between `v2.21.2` and HEAD. `promotion-module.ts`: +136 −23, all in per-attribute budget usage, not the F-M2 path                                                              | `.github/ISSUE_TEMPLATE/bug_report_v2.yml` (form; blank issues off) | `SECURITY.md`: security@medusajs.com                                   |
| Cal       | `calcom/cal.diy`              | `0f19cc46ef6b6426ee398c670575b3c96be7af9e` (2026-10-19)                            | `CAL_REF` `c2b7ac44`                                                  | `BookingEventHandlerService.ts`, `hashedLink/` (repository and service), `confirm.handler.ts`, `handleCancelBooking.ts`: **no diff** between `CAL_REF` and HEAD. Link usage is still incremented after the booking, in `Promise.allSettled`, error logged only (`BookingEventHandlerService.ts` L45–67 at HEAD)                             | `.github/ISSUE_TEMPLATE/bug_report.md` (blank issues off)           | `SECURITY.md`: security@cal.com; DoS out of scope                      |
| Twenty    | `twentyhq/twenty`             | `c13b414b7a5a8a0a9c4f967be40bfa2c5a3a175e` (2026-10-23)                            | image `v2.44.0`, `TWENTY_REF` `7cbdfec6`                              | `auth.resolver.ts` `updatePasswordViaResetToken` (L1299–1311 at HEAD): validate → `updatePassword` → `invalidatePasswordResetToken`, no lock; `reset-password.service.ts` L254–309 identical to the pin (`findOne` unrevoked token, then an unconditional `update`). Empty-body hang: runtime behaviour, not re-run on HEAD; cause not read | `.github/ISSUE_TEMPLATE/report-bug.md`                              | `.github/SECURITY.md`: security@twenty.com, keep it confidential       |
| Documenso | `documenso/documenso`         | `8707e33c124e4b1a68dde92d5e05178c9aabd0be` (unchanged since Task 5)                | `DOCUMENSO_REF` `f4105e47`                                            | `packages/auth/server/routes/email-password.ts` L94, L115, L132 `AppError` without `statusCode`; `index.ts` `onError`                                                                                                                                                                                                                       | `.github/ISSUE_TEMPLATE/bug-report.yml`                             | `SECURITY.md`: private GHSA only, no public issue for security reports |

**Twenty's policy matters for two drafts.** `P6-TW-RACE-004` (a single-use reset token redeemed ten times) and `P6-OBS-TW-001`
(an unauthenticated client can hold server sockets open indefinitely) are security-relevant. Twenty asks for these by email to
security@twenty.com and confidentiality. This repo's README and BACKLOG already describe both in public. Owner decision
(§15 item 2): follow the policy; private emails, no public issue drafts.

### 2.12 Duplicate search (read-only)

Method: GitHub's public issue and PR search pages, read with WebFetch (first page of results per query). The GitHub API search
and the repo-scoped issue API are not available in this session (403: the upstream repositories are not attached, and the
attach with credentials was refused). So the search covers titles and bodies as GitHub's web search returns them, one page per
query. The owner repeats the search before filing (each template asks for it).

| Bug                      | Queries (repo)                                                                                                                                                  | Duplicate?                                                                                                                                                                                           | Related items to link                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| X04, F-M3 (cancel-order) | "cancel order concurrent", "\"already has an existing active order change\"", "reserved_quantity cancel reservation", "cancel order twice credit line" (medusa) | **none**                                                                                                                                                                                             | [#17369](https://github.com/medusajs/medusa/issues/17369) (open, 2.21.0: concurrent _fulfillment_ workflows corrupt the order; unlocked order-change guard; does not test order cancel); [#16823](https://github.com/medusajs/medusa/issues/16823) (concurrent `createReturn`, same unlocked `createOrderChange_` guard; closed not planned); [#15397](https://github.com/medusajs/medusa/pull/15397) (merged May 2026, locking in reservation steps; in 2.21.2, so F-M3 persists after it) |
| X05 (cancel ‖ fulfil)    | "canceled order fulfillment race" (medusa)                                                                                                                      | **none**                                                                                                                                                                                             | #17369 (its suggested lock covers `createOrderFulfillmentWorkflow`, but it reports fulfillment-level cancel, not order cancel)                                                                                                                                                                                                                                                                                                                                                              |
| F-M2                     | "promotion usage limit exceeded order complete cart", "promotion limit order created checkout failed", "complete cart concurrent promotion" (medusa)            | **none**                                                                                                                                                                                             | [#16012](https://github.com/medusajs/medusa/issues/16012) (closed, fixed by #16097, July 2026: check-then-act on promotion budgets; the counter now holds, which matches F-M2: the counter holds, the orders do not)                                                                                                                                                                                                                                                                        |
| F-C1                     | "maxUsageCount", "private link usage concurrent", "hashed link expired usage" (cal.diy)                                                                         | **yes: [calcom/cal.diy#29815](https://github.com/calcom/cal.diy/issues/29815)** (open, "Private link configured to expire after one booking can still be reused", sequential report, labelled Stale) | [#29839](https://github.com/calcom/cal.diy/pull/29839) (closed unmerged: "consume private link before creating booking", claims to fix #29815). So: no new issue; a comment with the concurrent evidence (Appendix C1)                                                                                                                                                                                                                                                                      |
| F-C2                     | "confirm cancel race booking" (cal.diy)                                                                                                                         | **none**                                                                                                                                                                                             | — ([#29966](https://github.com/calcom/cal.diy/pull/29966) is an overlap check on confirm, a different bug)                                                                                                                                                                                                                                                                                                                                                                                  |
| F-C3                     | "BOOKING_CREATED twice confirm", "duplicate webhook confirmed booking", "confirm booking twice" (cal.diy)                                                       | **none**                                                                                                                                                                                             | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `P6-TW-RACE-004`         | "updatePasswordViaResetToken", "is:issue reset password token concurrent", "is:issue password reset token race", "is:pr reset token" (twenty)                   | **none**                                                                                                                                                                                             | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `P6-OBS-TW-001`          | "empty body hang", "graphql empty body timeout", "metadata request hangs no response" (twenty)                                                                  | **none**                                                                                                                                                                                             | [#15090](https://github.com/twentyhq/twenty/issues/15090) and [#26895](https://github.com/twentyhq/twenty/issues/26895) are other hangs (event-loop blocking, pool deadlock), not this one                                                                                                                                                                                                                                                                                                  |
| `P6-OBS-DOC-001`         | "signin wrong password 500 status", "is:issue signin 500 invalid credentials", "is:pr AppError statusCode signin" (documenso)                                   | **none**                                                                                                                                                                                             | — (one query, "INVALID_CREDENTIALS 500", returned no list page)                                                                                                                                                                                                                                                                                                                                                                                                                             |

### 2.13 Yarn "unexpected empty event loop" (watch item)

`grep -i "empty event loop"` over every job log read: 170 job logs of the `main` runs in §2.2 (A and B included) and
32 Cal job logs of the 14 pull-request runs created since 2026-10-23 17:00 UTC. One match only: the original job
[120555085199](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39994702506/job/120555085199) (PR #46, attempt 1,
line "ERROR: Yarn is terminating due to an unexpected empty event loop.", exit 42). **No repeat.**

### 2.14 What the probe did not confirm

- Upstream search through the GitHub API (§2.12); the web search reads one page per query.
- The empty-body hang on Twenty's upstream HEAD (runtime; P6 runs the pinned image only).
- `gitleaks` on the release input (it runs in the workflow).
- The CI job summary pages themselves (read from the job logs, which echo them).

## 3. Contradictions with the roadmap

- **C1 "Upstream issue drafts … for every new confirmed product bug".** F-C1 already has an upstream issue (#29815), so the
  plan drafts a comment for it instead (task rule: link, do not duplicate).
- **C2 "README cites only those runs and the cited main/nightly runs".** README keeps the label-evidence runs (feature-branch
  dispatches) in "Known product bugs", as it does today; they are labelled "label evidence", and no number in "Phase 2 results"
  comes from them.
- **C3 Rule 19 "its own docs/ branch with a PR".** The closeout report rides the Task 9 build PR, which is a `docs/` branch
  (one PR per task, rule 6).
- **C4 Roadmap "Twenty first-boot time making run B slow".** Not seen: `twenty-*` jobs took 2.8 to 6 min in A.
- **C5 Upstream drafts for Twenty.** The roadmap asks for drafts in each product's issue template. Twenty's security policy
  asks for email and confidentiality (§2.11), so the owner chose private emails to security@twenty.com (§15 item 2).

## 4. Open decisions (evidence and a proposed answer each; the owner decides labels)

### 6a. Task 5 closeout and the F-M4 label

- **Task 5.** Its closeout (§14) is met: 3 runs with both negative tests as expected failures. Since then every green
  `documenso-smoke` on `main` (9 runs, `39961527451` attempt 2 to run A `40037355173`, plus B) shows 4 passed and 3 expected failures (both
  `P6-OBS-DOC-001` tests and `P6-DOC-RACE-001`). Open from Task 5: the ID nit (6f, fixed in this build) and the upstream draft
  (Appendix E, refreshed). **Proposed: Task 5 closed.**
- **F-M4** (`-014`: parallel cancels of a captured order leave `order_summary.totals.refunded_total` at twice the refund rows,
  while the payment holds one refund). 684 of 953 attempts (71.8 %) in 19 green full-count `main` runs; every run 31 to 43 of
  50, never 0; run A 43 of 50, run B 36 of 50. Static path: the same lock-free `cancel-order.ts` as X04 (unchanged at upstream
  HEAD). **Proposed: PRODUCT BUG, severity medium** (order accounting disagrees with the payment ledger; no money moves twice).
  If labelled: a follow-up PR (not this build, Task 3b §16.4) adds the `test.fail()` in `-014` with **5 PR trials** (D65 gives 4:
  `(1 − 0.688)^4 = 0.95 %`; empirical miss 0.9 % at 4 and 0.3 % at 5; cost about 6 s per PR run), and Appendix B1 includes the
  F-M4 paragraph.

### 6b. F-M5 review

F-M5 = a live order of a `-001` attempt that no checkout returned (an orphan), annotated `SUSPECTED` by PR #38 and swept by
PR #37. Since PR #38 (`b221c85`): **0 orphan lines** in 13 green `main` runs, A and B included (650 `-001` trials, 156 extra trials).
Run 121 is the only sighting (6d). **Proposed:** keep the sweep and the annotation (they cost nothing and keep cleanup
honest); keep F-M5 SUSPECTED; record it as the oversell-path view of F-M2's mechanism (6d); no own upstream draft.

### 6c. `P6-OBS-DOC-003` (validation 400 echoes the submitted password and CSRF value)

Evidence: Task 5 probe §3.2 rows 11 and 12 (a missing `csrfToken` or a 3-character password returns 400 with `data` echoing
`email`, `password` and `csrfToken`). Code: `email-password.ts` L66 `sValidator('json', ZSignInSchema)` with no error hook,
unchanged at upstream `8707e33c`. The echo goes back only to the sender; the risk is that a proxy, APM tool or client error
log stores the password. Deterministic, not a race; one probe session. **Proposed: label "finding" (low), not PRODUCT BUG yet;
no P6 test in Phase 2 (the spec avoids validation on purpose, Task 5 R4); no public issue: Documenso's policy sends anything
security-related to a private advisory, so the owner decides whether to send one.** BACKLOG gets the item either way.

### 6d. Run 121, `med-race-001` extra `S=1 vs N=2` oversell

Run 121 = [39926614996](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39926614996) (pull request,
`docs/2026-10-23-p6-task3b-closeout`). Its `race-histograms-medusa/extra-s1-n2.json`: verdict `fail`, and the violation line
ends with **`[warmup 1]`**: the oversell was in the untimed warm-up burst, not in a counted trial (the three trials each have
one order). The line: `orderCount 2 !== S 1`, `HTTP unique order ids 1 != DB orders 2`, and the loser got 400 `not_allowed`
"Updating Status from \"ok\" to \"temp_failure\" is not allowed." That is F-M2's ghost-order signature (Task 3 §2.2): a losing
checkout returns 400 but leaves an order. The leak line (`TEST BUG: leak live orders …`) is that order, which the sweep of PR #37
now cancels. Since then: 0 oversold in 72 counted `extra-s1-n2` trials and 1200 `-001` trials (24 green `medusa-smoke` runs, A and B included).
**Proposed: observation, not a separate label.** Record it under F-M5 as one sighting of the F-M2 mechanism on the stock path
(an order beyond stock S = 1), and mention it in the F-M2 draft. If the owner prefers a label, the D3 rule already counts a
warm-up violation as a failure, so the evidence is valid; but one sighting in 26 runs is not "repeated full-count runs" (rule 13).

### 6e. F-M2: is a stable `test.fail()` spec affordable now?

**Proposed: no.** §2.6: the pooled rate gives 23 trials by D65, but the per-run rate swings from 0 to 21 of 50, so a 28-trial
PR run (the BACKLOG count) misses F-M2 in 13.3 % of measured windows and even a full 50-trial run missed it once in 21. A
`test.fail()` would turn about 1 PR run in 7 red at random. Keep the labelled annotation (D70). BACKLOG gets this arithmetic and
"done when" changes to: a deterministic trigger exists without a fork change, or the owner accepts random reds.

### 6f. The annotation nit: every `issue` annotation description starts with its ID

`grep -rn -A3 'type: "issue"' tests` (unit-test fixtures excluded). The summary takes the text before the first colon as the ID.

| File:line                                                       | Description starts                                   | Parsed ID                          | Conforms                                           |
| --------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------- | -------------------------------------------------- |
| `tests/documenso/api/doc-obs-001-signin-errors.spec.ts:62`      | `PRODUCT BUG P6-OBS-DOC-001 (low): wrong password …` | `PRODUCT BUG P6-OBS-DOC-001 (low)` | **no**                                             |
| `tests/documenso/api/doc-obs-001-signin-errors.spec.ts:77`      | `PRODUCT BUG P6-OBS-DOC-001 (low): bad CSRF …`       | `PRODUCT BUG P6-OBS-DOC-001 (low)` | **no**                                             |
| `tests/twenty/tw-races/tw-race-004-reset-token.spec.ts:71`      | `P6-TW-RACE-004 PRODUCT BUG: one reset token …`      | `P6-TW-RACE-004 PRODUCT BUG`       | **no** (starts with the ID, but no colon after it) |
| `tests/documenso/races/doc-race-001-last-recipients.spec.ts:43` | `P6-OBS-DOC-002: double seal …`                      | `P6-OBS-DOC-002`                   | yes                                                |
| `tests/cal/races/cal-race-001-identical-slot.spec.ts:119`       | `P6-OBS-CAL-001: concurrent losers …`                | `P6-OBS-CAL-001`                   | yes                                                |
| `tests/cal/races/cal-race-003-overlap.spec.ts:54`               | `P6-OBS-CAL-002: double-booked …`                    | `P6-OBS-CAL-002`                   | yes                                                |
| `tests/twenty/tw-obs/tw-obs-001-empty-body-hang.spec.ts:41`     | `P6-OBS-TW-001: PRODUCT BUG …`                       | `P6-OBS-TW-001`                    | yes                                                |

The build fixes the three (step 1), in the `tw-obs-001` style `<ID>: PRODUCT BUG …`. Proposed extras, not in the build unless
accepted: **E1** add an `issue` annotation to the six known-bug tests that have none (`-008`, `-009`, `cal-race-006`, `-007`,
`-008`, `-009`); **E2** add the job summary step to `cal-state-races` (a CI change).

### 6g. Yarn "unexpected empty event loop"

§2.13: no repeat in any run read. **Proposed: close the watch item** (BACKLOG "done when" is met).

### Other questions

- **Q1 Run B as the closeout pair with A.** Proposed: yes (both green at `a82521a`).
- **Q2 Release title.** Proposed: the CI fix (§2.9, step 2).
- **Q3 X9 (Twenty `verdict`).** Proposed: a separate fix PR after this closeout; the notes explain the field meanwhile.
- **Q4 F-C1.** Proposed: comment on calcom/cal.diy#29815 (Appendix C1) instead of a new issue.
- **Q5 Twenty channel.** Proposed: send `P6-TW-RACE-004` and `P6-OBS-TW-001` to security@twenty.com (their policy), not as
  public issues; decide whether README keeps its detail meanwhile (it is public already). Cal F-C1 is a usage-cap bypass on a
  public issue that already exists, so the comment is proposed as public. Owner decides all three.
- **Q6 Severity for X04, X05, F-M3, F-M2** (README says "proposed"). Proposed: keep X04 medium, X05 high, F-M3 medium, F-M2
  medium, and drop "(proposed)" if the owner agrees.
- **Q7 `medusa-smoke` stop rule (§2.7).** The worst-case estimate passes the 80 % stop rule by 0.1 min; no run came near
  it. Proposed: no change now; if the owner wants the rule met on paper, a later CI PR raises that step timeout to 31 min.

## 5. Decisions taken without the owner (routine)

| ID  | Decision                                                                                                        | Reason                                                                |
| --- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| D71 | Run B dispatched after run A finished                                                                           | the shared concurrency group would have cancelled A                   |
| D72 | A run counts for a published number only when the job that wrote the histogram ended `success`                  | a failed or cancelled job's histogram is not evidence of a green case |
| D73 | `target_sha` = the runs' head `a82521a`                                                                         | same as Phase 1 (`4aecc2d` = head of its runs)                        |
| D74 | README harness line `v0.2.11` → `v0.2.12`                                                                       | `package.json` pins `v0.2.12`; the README top line is stale           |
| D75 | One closeout PR carries the plan (cherry-picked), the fixes, the notes, README, BACKLOG and the closeout report | one PR per task (rule 6)                                              |

## 6. Build steps (in order; one commit per step)

Before step 0, on the build machine:

```bash
export PATH="/usr/local/bin:$PATH"
cd k6-load-concurrency-suite
git fetch origin main plan/2026-10-23-p6-phase2-closeout
git checkout -b docs/2026-10-23-p6-phase2-closeout origin/main
git log -1 --format=%h        # expected: a82521a (or a later main; then re-read §2.2 rows for the new runs)
npm ci
npm run check                 # expected: exit 0; "# tests 471", "# pass 471", "# fail 0"
```

If `main` moved past `a82521a`, stop and tell the owner: runs A and B stay valid (the release checks ancestry), but README and
the notes must not cite a run the plan has not read.

### Step 0: bring the plan onto the build branch

```bash
git cherry-pick <the plan commit on plan/2026-10-23-p6-phase2-closeout>
git log -1 --format=%B        # check: no Co-Authored-By, Claude-Session or "Generated" lines
```

### Step 1: `test: start every issue annotation with its case id`

Files: `tests/documenso/api/doc-obs-001-signin-errors.spec.ts`, `tests/twenty/tw-races/tw-race-004-reset-token.spec.ts`.
Change only the three description strings; titles, guards and assertions stay as they are.

```ts
// doc-obs-001-signin-errors.spec.ts, wrong-password test (line 62 today)
      "P6-OBS-DOC-001: PRODUCT BUG (low), wrong password returns 500 INVALID_CREDENTIALS, not 401. Cause: AppError without statusCode, onError maps it to 500.",
// doc-obs-001-signin-errors.spec.ts, bad-CSRF test (line 77 today)
      "P6-OBS-DOC-001: PRODUCT BUG (low), bad CSRF returns 500 INVALID_REQUEST, not 400 or 403. Cause: AppError without statusCode (line 94), onError maps it to 500.",
// tw-race-004-reset-token.spec.ts (line 71 today)
      "P6-TW-RACE-004: PRODUCT BUG, one reset token is redeemed more than once under concurrency (check-then-act, no lock)",
```

Check that every `issue` description now starts with an ID and a colon (expected output: nothing):

```bash
grep -rn -A3 'type: "issue"' tests --include=*.spec.ts | grep -E 'description' -A1 | grep -E '"|`' \
  | grep -vE '["`]P6-[A-Z]+-[A-Z0-9-]+: ' | grep -vE 'description:$'
```

```bash
npm run check                 # expected: exit 0, 471 tests, 471 pass (no unit test reads these strings)
git add tests/documenso/api/doc-obs-001-signin-errors.spec.ts tests/twenty/tw-races/tw-race-004-reset-token.spec.ts
git commit -m "test: start every issue annotation with its case id"
```

The specs need a live product; CI on the PR runs them. Expected on the PR run: `documenso-smoke` summary line
`Known product bugs still reproducing: P6-OBS-DOC-001, P6-OBS-DOC-001, P6-OBS-DOC-002`; `twenty-races` line
`… : P6-TW-RACE-004`.

### Step 2: `ci(release): take the title from the notes heading` (owner review: CI change)

File: `.github/workflows/evidence-release.yml`. Its own commit (owner, §15 item 4). Two changes:

1. In the step "Check that target_sha is on main", after the `[[ -f "docs/releases/$TAG.md" ]]` line, stop early when the notes
   have no H1, so a bad notes file fails before any download:

```yaml
head -n 1 "docs/releases/$TAG.md" | grep -qE '^# +[^[:space:]]' \
|| { echo "::error::docs/releases/$TAG.md must start with an H1 line ('# <release title>'); none found"; exit 1; }
```

2. In the step "Create the release", replace the hard-coded `--title "P6 Phase 1 evidence (CI)"`:

```yaml
run: |
  set -euo pipefail
  # The release title is the notes' H1 without its "# " (Phase 1 notes: "P6 Phase 1 evidence (CI)").
  first="$(head -n 1 "docs/releases/$TAG.md")"
  if [[ ! "$first" =~ ^#[[:space:]]+([^[:space:]].*)$ ]]; then
    echo "::error::docs/releases/$TAG.md must start with an H1 line ('# <release title>'); found: ${first:0:80}"
    exit 1
  fi
  title="${BASH_REMATCH[1]}"
  echo "Release title: $title"
  gh release create "$TAG" \
    --target "$TARGET_SHA" \
    --title "$title" \
    --notes-file "docs/releases/$TAG.md" \
    "$RUNNER_TEMP"/release/*.zip "$RUNNER_TEMP/release/SHA256SUMS.txt"
```

Prove the title locally with the same bash test (expected output: `P6 Phase 2 evidence (CI)` and `P6 Phase 1 evidence (CI)`;
a file without an H1 prints the error):

```bash
for f in docs/releases/p6-phase2.md docs/releases/p6-phase1.md; do
  first="$(head -n 1 "$f")"; [[ "$first" =~ ^#[[:space:]]+([^[:space:]].*)$ ]] && echo "${BASH_REMATCH[1]}" || echo "error: $f"
done
```

(Step 3 creates `p6-phase2.md`; run this check after step 3 and paste its output into the PR body.)

```bash
npm run check                 # expected: exit 0, 471 tests; actionlint (with shellcheck) prints nothing for this file
git add .github/workflows/evidence-release.yml
git commit -m "ci(release): take the title from the notes heading"
```

### Step 3: `docs(releases): add the p6-phase2 evidence notes`

File: `docs/releases/p6-phase2.md` (NEW), text in §8.2. Then prove the workflow's check passes on it:

```bash
grep -oE 'actions/runs/[0-9]+' docs/releases/p6-phase2.md | sed 's#^actions/runs/##' | sort -u
# expected exactly:
# 40037355173
# 40039351021
npm run check                 # expected: exit 0, 471 tests (Prettier formats the new file)
git add docs/releases/p6-phase2.md
git commit -m "docs(releases): add the p6-phase2 evidence notes"
```

### Step 4: `docs(readme): add the phase 2 results`

File: `README.md`. Edits in §8.1 (intro, harness version, new section, Known product bugs rows, Phase 1 status line).

```bash
grep -n "v0.2.11" README.md   # expected after the edit: no line
npm run check                 # expected: exit 0, 471 tests
git add README.md
git commit -m "docs(readme): add the phase 2 results"
```

### Step 5: `docs: update the backlog for the phase 2 closeout`

File: `docs/BACKLOG.md`. Edits in §8.3, following the owner's answers to §4 (write only what the owner decided; rule 20 e).

```bash
npm run check                 # expected: exit 0, 471 tests
git add docs/BACKLOG.md
git commit -m "docs: update the backlog for the phase 2 closeout"
```

### Step 6: `docs(plans): add the phase 2 closeout report`

File: `docs/plans/2026-10-2x-p6-phase2-closeout.md` (NEW; `2x` = the build day), copied from
`docs/templates/phase-closeout.md` and filled per §8.4. Then fill §12 of this plan (closeout notes).

```bash
npm run check                 # expected: exit 0, 471 tests
git add docs/plans/2026-10-2x-p6-phase2-closeout.md docs/plans/2026-10-23-p6-phase2-task9-closeout.md
git commit -m "docs(plans): add the phase 2 closeout report"
```

### Step 7: push, PR, CI once

```bash
git log --format=%B origin/main..HEAD | grep -iE "co-authored-by|claude-session|generated (with|by)" || echo "clean"
git push -u origin docs/2026-10-23-p6-phase2-closeout
owner=Jayami123; repo=k6-load-concurrency-suite; branch=docs/2026-10-23-p6-phase2-closeout
title="docs: close out phase 2 with runs A and B, readme results and upstream drafts"
body="$(cat <<'EOF'
Phase 2 closeout (Task 9). Plan: docs/plans/2026-10-23-p6-phase2-task9-closeout.md.

- Runs A (40037355173, push) and B (40039351021, dispatch) at a82521a: every product job green.
- README "Phase 2 results", Known product bugs extended; release notes docs/releases/p6-phase2.md (runs A and B only).
- evidence-release.yml takes the release title from the notes H1 and fails with a clear message when there is none (CI
  change). Resulting title for docs/releases/p6-phase2.md: "P6 Phase 2 evidence (CI)".
- Three issue annotations now start with their case id.
- Upstream drafts and the private security emails are in the plan appendices; nothing is filed or sent by P6.

npm run check: exit 0, 471 tests.
EOF
)"
gh pr create --base main --head "$branch" --title "$title" --body "$body" \
  || gh api -X POST "repos/$owner/$repo/pulls" -f title="$title" -f head="$branch" -f base=main -f body="$body"
```

Read CI once (rule 15). Expected: all nine `perf.yml` jobs green at PR counts; the two summary lines of step 1. Check the PR body for
any footer (rule 3) and report it if the proxy added one. The owner merges (merge commit).

### Step 8: dispatch the evidence release (only after the owner merges the PR and says "release")

```bash
gh workflow run evidence-release.yml -R Jayami123/k6-load-concurrency-suite --ref main \
  -f tag=p6-phase2 \
  -f target_sha=a82521ad0e258ea3e5f9b649b389745cd96280a9 \
  -f run_ids="40037355173 40039351021"
# REST fallback:
# gh api -X POST repos/Jayami123/k6-load-concurrency-suite/actions/workflows/evidence-release.yml/dispatches \
#   -f ref=main -f 'inputs[tag]=p6-phase2' -f 'inputs[target_sha]=a82521ad0e258ea3e5f9b649b389745cd96280a9' \
#   -f 'inputs[run_ids]=40037355173 40039351021'
```

Read the run once when it finishes. Expected: success; then

```bash
gh release view p6-phase2 -R Jayami123/k6-load-concurrency-suite --json name,targetCommitish,assets \
  --jq '.name, .targetCommitish, [.assets[].name]'
# expected: "P6 Phase 2 evidence (CI)", "a82521ad0e258ea3e5f9b649b389745cd96280a9",
#           ["p6-40037355173-evidence.zip","p6-40039351021-evidence.zip","SHA256SUMS.txt"]
```

A red release run is root-caused from its log (a token-scan or gitleaks hit stops before upload; nothing is published). Never
re-dispatch blindly; a tag is never reused.

## 7. Done when (roadmap "Done when", rule 20 a)

| Item                                                                    | Status                                                     |
| ----------------------------------------------------------------------- | ---------------------------------------------------------- |
| Runs A and B green with all histograms                                  | A: met. B: **success**, 9 of 9 jobs green                  |
| `p6-phase2` release exists                                              | gap until step 8 (owner gate)                              |
| README cites only A, B and the cited `main`/nightly runs                | step 4 (C2: the label-evidence runs stay labelled as such) |
| Every open product bug has evidence linked and an upstream draft or URL | §9 and appendices; F-C1 → #29815; F-M4 waits for its label |
| `npm run check` green                                                   | baseline met (471); every step                             |

## 8. Text templates

### 8.1 README

**Line 5** (`qa-portfolio-harness` version): `v0.2.11` → `v0.2.12`.

**Intro paragraph** (lines 7 to 9), replace with:

> Phase 0 proved the harness and k6 smoke. Phase 1 is done: the race framework and the six race cases for Medusa, Cal and
> Documenso (see "Phase 1 results"). Phase 2 is done: concurrency races for Medusa, Cal and Twenty and two error-contract
> checks (see "Phase 2 results"). Every published number comes from a GitHub Actions run on `main` (push, schedule or
> `workflow_dispatch`).

**Phase 1 status** last sentence: "Open product bugs: the five above." → "Open product bugs at the end of Phase 1: the five
`P6-OBS-*` rows above."

**New section**, placed after "### Phase 1 status" and before "## Phase 3 (next)":

```markdown
## Phase 2 results

Phase 2 tests concurrency races and two error contracts; k6 load testing is planned for Phases 3 to 5.

Every number here comes from a GitHub Actions run on `main` (push, schedule or `workflow_dispatch`) whose job ended green. A
timing is a median of at least 3 runs at the same trial count (50 in every row). Per-trial time is the histogram's wall-clock
time from `startedAt` to `finishedAt`, divided by its trials. "Signals" counts the attempts that showed the tag, valid and
invalid (Task 1, D3).

Closeout runs: [40037355173](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40037355173) (A, push to
`main`, `a82521a`) and [40039351021](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40039351021) (B,
`workflow_dispatch` on `main`, `a82521a`). Their histograms and logs are in the
[`p6-phase2` release](https://github.com/Jayami123/k6-load-concurrency-suite/releases/tag/p6-phase2), one zip per run.

| Case              | Job                    | Runs | Median per-trial (s) | Range (s)     | Invalid trials / reruns | Signals (attempts)                               | Run A (time; signals) | Run B (time; signals) |
| ----------------- | ---------------------- | ---- | -------------------- | ------------- | ----------------------- | ------------------------------------------------ | --------------------- | --------------------- |
| `P6-MED-RACE-007` | `medusa-smoke`         | 20   | 1.37                 | 0.84 to 1.58  | 0 / 0                   | none                                             | 1.38 s                | 1.39 s                |
| `P6-MED-RACE-010` | `medusa-smoke`         | 20   | 1.28                 | 0.79 to 1.48  | 0 / 0                   | none                                             | 1.30 s                | 1.31 s                |
| `P6-MED-RACE-011` | `medusa-smoke`         | 20   | 1.46                 | 0.90 to 1.65  | 0 / 0                   | F-M1 705 of 1000                                 | 1.50 s; 31            | 1.49 s; 39            |
| `P6-MED-RACE-008` | `medusa-smoke`         | 18   | 1.16                 | 0.72 to 1.33  | 0 / 0                   | X04 653 of 900; F-M3 247 of 900                  | 1.20 s; 42; 8         | 1.20 s; 43; 7         |
| `P6-MED-RACE-009` | `medusa-smoke`         | 18   | 1.12                 | 0.70 to 1.33  | 0 / 0                   | X05 259 of 900; F-M3 40 of 900                   | 1.13 s; 11; 4         | 1.15 s; 11; 3         |
| `P6-MED-RACE-005` | `medusa-order-races`   | 21   | 8.28                 | 4.91 to 9.72  | 1 / 1                   | F-M2 12 of 1051                                  | 8.57 s; 2             | 5.52 s; 0             |
| `P6-MED-RACE-012` | `medusa-order-races`   | 21   | 8.16                 | 4.86 to 10.28 | 0 / 0                   | F-M2 209 of 1050                                 | 8.50 s; 10            | 5.01 s; 2             |
| `P6-MED-RACE-013` | `medusa-cancel-extras` | 19   | 1.68                 | 1.11 to 3.29  | 0 / 0                   | X04 948 of 950; F-M3 945 of 950                  | 3.29 s; 50; 46        | 1.40 s; 50; 50        |
| `P6-MED-RACE-014` | `medusa-cancel-extras` | 19   | 1.80                 | 1.19 to 2.75  | 3 / 3                   | X04 949 of 953; F-M3 950 of 953; F-M4 684 of 953 | 2.75 s; 49; 48; 43    | 1.55 s; 50; 50; 36    |
| `P6-CAL-RACE-006` | `cal-state-races`      | 12   | 2.09                 | 1.23 to 2.24  | 0 / 0                   | accepted above the cap 600 of 600                | 2.24 s; 50            | 2.19 s; 50            |
| `P6-CAL-RACE-008` | `cal-state-races`      | 12   | 1.98                 | 1.19 to 2.10  | 0 / 0                   | accepted above the cap 600 of 600                | 2.10 s; 50            | 2.10 s; 50            |
| `P6-CAL-RACE-007` | `cal-state-races`      | 12   | 1.81                 | 1.70 to 1.82  | 0 / 0                   | both side-effect sets 600 of 600                 | 1.82 s; 50            | 1.81 s; 50            |
| `P6-CAL-RACE-009` | `cal-state-races`      | 12   | 1.81                 | 1.72 to 1.85  | 0 / 0                   | two BOOKING_CREATED 600 of 600                   | 1.85 s; 50            | 1.84 s; 50            |
| `P6-TW-RACE-001`  | `twenty-races`         | 5    | 0.06                 | 0.05 to 0.06  | 0 / 0                   | none                                             | 0.06 s                | 0.06 s                |
| `P6-TW-RACE-002`  | `twenty-races`         | 5    | 0.04                 | 0.04 to 0.05  | 0 / 0                   | none                                             | 0.04 s                | 0.04 s                |
| `P6-TW-RACE-003`  | `twenty-races`         | 5    | 0.10                 | 0.08 to 0.10  | 0 / 0                   | none                                             | 0.09 s                | 0.10 s                |
| `P6-TW-RACE-004`  | `twenty-races`         | 5    | 1.45                 | 1.35 to 1.46  | 0 / 0                   | more than one success 250 of 250                 | 1.35 s; 50            | 1.46 s; 50            |
| `P6-TW-RACE-005`  | `twenty-races`         | 5    | 0.05                 | 0.04 to 0.06  | 0 / 0                   | none                                             | 0.06 s                | 0.04 s                |
| `P6-TW-RACE-006`  | `twenty-races`         | 5    | 1.02                 | 0.95 to 1.06  | 0 / 0                   | none                                             | 1.05 s                | 1.01 s                |

Runs counted: [39829474241](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39829474241), [39845479090](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39845479090), [39914092582](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39914092582), [39917207104](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39917207104), [39918269577](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39918269577), [39923528658](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39923528658), [39926461664](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39926461664), [39927945708](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39927945708), [39930717584](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39930717584), [39934300578](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39934300578), [39935736478](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39935736478), [39941365044](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39941365044), [39941942658](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39941942658), [39948384170](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39948384170), [39951483517](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39951483517), [39961527451](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39961527451), [39969241809](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39969241809), [39979511916](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39979511916), [39993081595](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39993081595), [39996805900](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39996805900), [40006260061](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40006260061), [40014093546](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40014093546), [40033135757](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40033135757), [40037355173](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40037355173), [40039351021](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40039351021) (25 runs; a case counts only the runs in which it existed. `39917207104`, `39923528658` are red and `39926461664`, `39934300578`, `39941365044` were cancelled as a whole: only their jobs that ended green count, plan D72).

Invalid trials and reruns (Task 1): `P6-MED-RACE-005` 1 invalid trial, 1 rerun; `P6-MED-RACE-014` 3 invalid trials, 3 reruns; every other Phase 2 case 0, and runs A and B 0. The Twenty histograms record `verdict: "fail"` because the Twenty runner
never sets the field (follow-up X9); the tests read the trials, and the jobs are green.

Error-contract tests (no trial count; one deterministic run per job):

| Test                                             | Job               | Runs A and B                                                                                                                                                                                                                                                    |
| ------------------------------------------------ | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `P6-OBS-DOC-001` (2 tests)                       | `documenso-smoke` | both expected failures in A ([job](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40037355173/job/120699991412)) and B ([job](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40039351021/job/120706503810))           |
| `P6-OBS-TW-001` (8 hang tests, 2 resource tests) | `twenty-obs`      | 8 expected failures and 2 passes in A ([job](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40037355173/job/120699991564)) and B ([job](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40039351021/job/120706503795)) |

### Phase 2 status

Phase 2 of the master plan is **done**. The cases are evidenced from `main` runs; the closeout runs are A and B above.
`P6-MED-RACE-006` is in "Later" (no gift-card route at the pinned Medusa). Open product bugs: the Phase 2 rows of "Known
product bugs".
```

**Known product bugs** (edit the existing rows; keep the column order). For every Phase 2 row, the Evidence cell keeps the
label-evidence runs (marked "label evidence") and adds `main` counts and runs A and B. Exact cells:

| Row                      | Severity                                     | Upstream                                                                                                          | Evidence cell (append)                                                                                                          |
| ------------------------ | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `P6-OBS-DOC-001`         | low                                          | "not filed (draft: Task 9 plan Appendix E)"                                                                       | "`main`: both tests expected failures in every green `documenso-smoke` since `39961527451`; runs A and B (release `p6-phase2`)" |
| `P6-MED-RACE-011` (F-M1) | suspected (D40)                              | not filed                                                                                                         | "`main`: 705 of 1000 attempts (green full-count runs)"                                                                          |
| `P6-MED-RACE-008` (X04)  | per Q6                                       | "not filed (draft: Task 9 plan Appendix B1)"                                                                      | "`main`: X04 653 of 900 attempts; runs A and B"                                                                                 |
| `P6-MED-RACE-009` (X05)  | per Q6                                       | "not filed (draft: Appendix B2)"                                                                                  | "`main`: X05 259 of 900 attempts; runs A and B"                                                                                 |
| F-M3                     | per Q6                                       | "not filed (draft: Appendix B1)"                                                                                  | "`main`: `-008` 247 of 900, `-009` 40 of 900, `-013` 945 of 950, `-014` 950 of 953 attempts"                                    |
| F-M2                     | per Q6                                       | "not filed (draft: Appendix B3)"                                                                                  | "`main`: `-012` 209 of 1050, `-005` 12 of 1051 attempts"                                                                        |
| F-M4 (`-014`), NEW row   | PRODUCT BUG, medium (owner label 2026-10-23) | "not filed (draft: Appendix B1)"                                                                                  | "`main`: 684 of 953 attempts; runs A and B"                                                                                     |
| `P6-CAL-RACE-006` (F-C1) | PRODUCT BUG (O6)                             | "[calcom/cal.diy#29815](https://github.com/calcom/cal.diy/issues/29815) (existing; comment drafted, Appendix C1)" | "`main`: 600 of 600 attempts"                                                                                                   |
| `P6-CAL-RACE-008` (F-C1) | PRODUCT BUG (O6)                             | same as `-006`                                                                                                    | "`main`: 600 of 600 attempts"                                                                                                   |
| `P6-CAL-RACE-007` (F-C2) | PRODUCT BUG (O6)                             | "not filed (draft: Appendix C2)"                                                                                  | "`main`: 600 of 600 attempts"                                                                                                   |
| `P6-CAL-RACE-009` (F-C3) | PRODUCT BUG (O6)                             | "not filed (draft: Appendix C3)"                                                                                  | "`main`: 600 of 600 attempts"                                                                                                   |
| `P6-OBS-TW-001`          | PRODUCT BUG                                  | "not filed publicly: reported privately per Twenty's security policy (owner sends; Appendix D2)"                  | "`main`: 8 of 8 hang tests expected failures in runs A and B"                                                                   |
| `P6-TW-RACE-004`         | PRODUCT BUG                                  | "not filed publicly: reported privately per Twenty's security policy (owner sends; Appendix D1)"                  | "`main`: 250 of 250 attempts with more than one success (10 of 10 every time); runs A and B"                                    |

**Reproduction detail (owner, §15 item 2).** The README Phase 2 text adds no reproduction steps beyond what the repo already
holds: no request bodies, endpoints or token handling beyond the existing "Twenty races", "Twenty empty-body spec" and
"Known product bugs" text. The new Twenty cells above carry counts and run links only.

### 8.2 `docs/releases/p6-phase2.md` (verbatim)

```markdown
# P6 Phase 2 evidence (CI)

One zip per CI run. Each zip holds the `*.json` and `*.log` files of that run's artefacts. `SHA256SUMS.txt` lists the
checksums. The release does not expire; the Actions artefacts do (14 days).

| Run                                                                                                    | Event    | Head SHA  | What it proves                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------ | -------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [40037355173](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40037355173) (run A) | push     | `a82521a` | Every Phase 1 and Phase 2 case at full count (50 trials; `P6-CAL-RACE-003` 30; the extras 3 to 5), nine jobs green: Medusa `-001`, `-007` to `-014` (no `-006`); Cal `-001`, `-002` (the histograms), `-003`, `-006` to `-009`; Documenso `-001`, `-002`, control, `P6-OBS-DOC-001`; Twenty self-test, `P6-TW-RACE-001` to `-006`, `P6-OBS-TW-001` |
| [40039351021](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40039351021) (run B) | dispatch | `a82521a` | The same cases as run A                                                                                                                                                                                                                                                                                                                            |

Known-bug tests (`test.fail()`) failed as expected in both runs. Their results are in the job logs, not in the zips: the
`P6-OBS-DOC-001` and `P6-OBS-TW-001` tests write no histogram, and `twenty-obs` uploads only its container log.

The Twenty race histograms (`race-histograms-twenty-races/*.json`) say `"verdict": "fail"` for every case. The Twenty runner
does not set that field, so it keeps its default. Read the trials and the job result instead: both jobs are green, and
`P6-TW-RACE-004` shows more than one success in every trial.
```

### 8.3 BACKLOG (the owner's decisions, §15)

- Medusa, F-M2: keep "PRODUCT BUG, annotation only"; replace the arithmetic with §2.6 (pooled 209 of 1050, D65 n = 24, per-run
  0 to 21 of 50, empirical miss 13.3 % at 28 trials and 1 of 21 full runs) and the decision "no F-M2 `test.fail()` spec" (6e);
  done when a deterministic trigger exists without a fork change.
- Medusa, new **F-M4, PRODUCT BUG (owner label 2026-10-23), medium**: 684 of 953 attempts in 19 green full-count `main` runs
  (31 to 43 of 50 each; runs A and B 43 and 36); follow-up PR adds the `test.fail()` with 5 PR trials (F8).
- Medusa, new **F-M5, SUSPECTED** (same mechanism as F-M2): 0 orphan lines in 13 green runs since PR #38; the sweep and the
  annotation stay.
- Medusa, new **`medusa-smoke` race-step stop rule** (Q7): 24.1 min estimated (slowest measured 19.9 min + 4.2 min rerun
  allowance) vs the 24.0-minute stop rule (80 % of 30); re-measure in Phase 3 after the pin bump; the fix is less per-trial
  time or fewer trials, never a higher timeout.
- Medusa, new `-009` PR trials 13 → 20 after a budget recheck (F11); Twenty histogram verdict (F9); known-bug visibility (F10).
- Cal, run 121: **observation, no label** (6d): the oversell was in the warm-up burst, the loser's 400 was F-M2's
  `temp_failure` signature; 0 in 1200 `-001` and 72 `extra-s1-n2` counted trials since. Item closed.
- Cal, F-C1: link calcom/cal.diy#29815 (comment drafted for the owner).
- Cal, Yarn watch item: **closed** (6g): 0 repeats in 170 `main` job logs and 32 Cal PR job logs.
- Documenso (new section): **`P6-OBS-DOC-003`, finding (low)**: the validation 400 echoes the submitted password and CSRF
  value; no test, no public issue; a private-advisory draft for the owner (plan Appendix F).
- Twenty, P6-TW-RACE-004 and P6-OBS-TW-001: add the `main` evidence (runs A and B) and "reported privately per Twenty's
  security policy (owner sends; plan Appendices D1, D2)".

### 8.4 Phase closeout report (`docs/plans/2026-10-2x-p6-phase2-closeout.md`)

Copy `docs/templates/phase-closeout.md`. Fill: §1 summary (Phase 2 goal met: Tasks 1 to 8, 3b and X8 merged; runs A and B
green); §2 models (from each task plan's header or closeout; write "not recorded" where a plan does not say); §3 tasks: one row
per PR (#19 onward: read `git log --merges --first-parent origin/main` and each merge's PR), unit-test count after each merge
(run `npm run test:unit` at that merge if the plan does not record it, or write "not recorded"); §4 findings: §2.1 rows plus F-M4,
F-M5, `P6-OBS-DOC-003`, run 121, X9; §5 decisions: §5 of this plan; §6 deviations: §3 of this plan; §7 rule slips: the ones each
task closeout lists (for example the Task 3b PR #33 connector slip); §8 CI health: §2.2 reds, §2.7 budget, §2.13; §9 open
questions: what the owner leaves open from §4; §10 backlog and next phase: §10 of this plan, first task of Phase 3 = the
H3 pin bump and the `P6-MED-RACE-002/003` probe.

## 9. Upstream drafts (summary; full text in the appendices)

| Bug               | Upstream            | Action                                                            | Appendix |
| ----------------- | ------------------- | ----------------------------------------------------------------- | -------- |
| X04 + F-M3 + F-M4 | medusajs/medusa     | new issue                                                         | B1       |
| X05               | medusajs/medusa     | new issue                                                         | B2       |
| F-M2              | medusajs/medusa     | new issue                                                         | B3       |
| F-C1              | calcom/cal.diy      | comment on #29815                                                 | C1       |
| F-C2              | calcom/cal.diy      | new issue                                                         | C2       |
| F-C3              | calcom/cal.diy      | new issue                                                         | C3       |
| `P6-TW-RACE-004`  | twentyhq/twenty     | private email to security@twenty.com (owner sends)                | D1       |
| `P6-OBS-TW-001`   | twentyhq/twenty     | private email to security@twenty.com (owner sends)                | D2       |
| `P6-OBS-DOC-003`  | documenso/documenso | private advisory draft (GHSA form), owner decides whether to send | F        |
| `P6-OBS-DOC-001`  | documenso/documenso | new issue (Task 5 Appendix A, refreshed)                          | E        |

Nothing is filed, posted or sent by P6. The owner files or sends each one; for public issues the owner then puts the URL in
README. The two Twenty emails and the Documenso advisory get no URL in README.

## 10. Follow-ups (not built here)

| ID  | Item                                                                                                                                                                                                                                                             | Where                                         | Done when                                                                                                          |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| F1  | P1 PR removing X04/X05 from `tests/medusa/api/races.spec.ts` (now `P6-MED-RACE-008/009`)                                                                                                                                                                         | `playwright-e2e-ci-framework` (separate repo) | the P1 PR merges                                                                                                   |
| F2  | Harness H3 merged on harness `main` as `51b7d1e` (`git ls-remote` HEAD = `51b7d1eb04c3…`); `v0.2.13` not tagged yet (latest `v0.2.12`)                                                                                                                           | qa-portfolio-harness                          | `v0.2.13` tagged; then the P6 pin bump PR (`package.json`, README) and the Phase 3 probe for `P6-MED-RACE-002/003` |
| F3  | X7: harness resolves only the requested product root; then P6 removes the `\|\| true` from both "Stop Cal" steps                                                                                                                                                 | harness, then `perf.yml`                      | both merged                                                                                                        |
| F4  | H-twenty-auth: harness `authenticate()` returns a workspace token                                                                                                                                                                                                | harness                                       | P6 uses the adapter directly                                                                                       |
| F5  | X1: digest pins for the Twenty images                                                                                                                                                                                                                            | harness overlay                               | digests in the overlay                                                                                             |
| F6  | X6: one value-only token scanner (`scripts/evidence-token-scan.mjs`) for every job                                                                                                                                                                               | P6                                            | owner accepts                                                                                                      |
| F7  | `timeout-minutes` for older uncapped steps. Uncapped today: `medusa-smoke` 19 of 23 steps, `medusa-order-races` 18 of 20, `medusa-cancel-extras` 12 of 20, `cal-smoke` 23 of 29, `cal-state-races` 19 of 24, `documenso-smoke` 19 of 23; the three Twenty jobs 0 | `perf.yml`                                    | every step has a cap                                                                                               |
| F8  | F-M4 `test.fail()` in `-014`, 5 PR trials (owner label PRODUCT BUG, medium)                                                                                                                                                                                      | spec, own PR                                  | merged                                                                                                             |
| F9  | Twenty histogram `verdict` fix (X9): `runTwentyTrials` sets `verdict` like the other runners, with a unit test                                                                                                                                                   | `src/twenty/run-case.ts`                      | merged; Twenty histograms say `pass`                                                                               |
| F10 | Known-bug visibility: `issue` annotations and job-summary lines for `-008`, `-009` and the four Cal state known-bug tests (E1); a job summary step in `cal-state-races` (E2); `twenty-obs` uploads its Playwright `{suites, errors}` JSON (X10)                  | tests, `perf.yml`                             | merged                                                                                                             |
| F11 | `-009` PR trials 13 → 20 (empirical miss 2.3 % → 0.9 %, §2.6), after a `medusa-smoke` PR budget recheck                                                                                                                                                          | spec + plan arithmetic                        | merged                                                                                                             |
| F12 | `medusa-smoke` race step: estimate 24.1 min vs 24.0 stop rule (§2.7, BACKLOG item); re-measure in Phase 3 after the pin bump                                                                                                                                     | `perf.yml` / specs                            | the estimate is under the stop rule by less per-trial time or fewer trials, never a higher timeout                 |
| F13 | H-email (Cal mail catcher), H-heap (`NODE_OPTIONS` heap default)                                                                                                                                                                                                 | harness                                       | carried from BACKLOG                                                                                               |

## 11. `npm run check` baseline and expected counts

At `a82521a` on the plan branch: exit 0. `All matched files use Prettier code style!`; actionlint prints nothing; `k6 inspect:
5 script(s) ok.`; `# tests 471`, `# suites 103`, `# pass 471`, `# fail 0`, `# skipped 0`.

| After step        | Unit tests | Why                                                  |
| ----------------- | ---------- | ---------------------------------------------------- |
| 0 (plan)          | 471        | docs only                                            |
| 1 (annotations)   | 471        | strings in Playwright specs; no unit test reads them |
| 2 (release title) | 471        | workflow only (actionlint checks it)                 |
| 3 to 6            | 471        | docs only                                            |

Where the 471st test came from: the X8 plan built to 470; its review fix `dae02ed` ("fix(twenty): send https base urls over
tls in the timed post client") added one unit test, `tests/unit/twenty-timed-post.test.ts` "speaks TLS to an https base URL
and never sends cleartext HTTP" (X8 plan §12: "471 after the review fixes"). So `main` at `a82521a` has 471.

A different count at any step: stop and explain (rule 11).

## 12. Closeout notes (filled in by the build)

- Build branch head, PR link, PR CI run: _fill in_.
- Release run id and result: _fill in after step 8_.

## 13. Risks

| ID  | Risk                                                                                                | Mitigation                                                                                                                               |
| --- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | `medusa-smoke` race step: the worst-case estimate is 24.1 min, 0.1 over its 24-min stop rule (§2.7) | measured worst 19.9 min (66 % of the step timeout); Q7: leave it, or raise the step timeout to 31 min in a later CI PR; never cut trials |
| R2  | The release workflow fails on a token or gitleaks hit                                               | nothing is uploaded; root-cause from the log; the A dry run was clean                                                                    |
| R3  | Artefacts expire on 2026-11-06                                                                      | dispatch the release before then                                                                                                         |
| R4  | A README number drifts from the histograms                                                          | §2.5 is generated from the downloaded artefacts by the scratch scripts (Appendix A); the build copies the cells                          |
| R5  | Twenty bugs are public before the vendor hears (Q5)                                                 | owner decides the channel and the README detail                                                                                          |
| R6  | The duplicate search missed an item (one page per query, no API)                                    | the owner repeats the search before filing                                                                                               |

## 14. Rule 20 self-check

- (a) Roadmap "Done when": §7; gaps: the release (step 8, owner gate) and F-M4's draft (waits for its label).
- (b) Existing names named by the plan, checked at `a82521a`: `runTwentyTrials` (`src/twenty/run-case.ts`), `createHistogram`
  (`src/races/histogram.ts`), `ISSUE_ANNOTATION_TYPE`, `issueIdFromDescription` (`src/ci/playwright-json-summary.ts`),
  `invalidBudget` (`src/races/rerun-on-spread.ts`), `outcomeFor` (`src/ci/race-table.ts`), the three spec files of step 1,
  `.github/workflows/evidence-release.yml` step "Create the release", `scripts/evidence-token-scan.mjs`. NEW files:
  `docs/releases/p6-phase2.md`, `docs/plans/2026-10-2x-p6-phase2-closeout.md` (templates in §8). No new function.
- (c) CI time: §2.7 includes reruns and setup; every job is at least 16 minutes under its timeout. Gap: the `medusa-smoke` race
  step estimate passes its 80 % stop rule by 0.1 min (Q7, R1); no trial count changes.
- (d) Every step has its files, `git add` paths, commit subject and the expected `npm run check` output (§6, §11).
- (e) No owner answer is recorded; §4 holds proposals only.

## 15. Owner decisions (2026-10-23) and what changed

The owner approved the plan at `8bf5946` with these changes. They supersede the proposals in §4 and the sections named here.

1. **Labels and items.** 6a: F-M4 = **PRODUCT BUG, medium**; its `test.fail()` test (5 PR trials) is a separate follow-up PR
   (F8), not this build. Task 5 is closed. 6b: F-M5 stays SUSPECTED, recorded as the same mechanism as F-M2. 6c:
   `P6-OBS-DOC-003` = **finding (low)**, no test, no public issue; the private-advisory draft is kept for the owner
   (Appendix F). 6d: run 121 = observation, no label. 6e: no F-M2 `test.fail()` spec; the arithmetic (§2.6) goes into
   BACKLOG. 6f: the three annotations are fixed in the build (step 1). 6g: the Yarn watch item is closed.
2. **Q5 Twenty.** Follow Twenty's security policy: no public GitHub issue drafts for `P6-TW-RACE-004` or `P6-OBS-TW-001`;
   Appendices D1 and D2 are private emails to security@twenty.com for the owner to send. The README Phase 2 text adds no
   reproduction steps beyond what the repo already holds (§8.1 note).
3. **Q7.** No trial or timeout change. BACKLOG gets the `medusa-smoke` race-step item: 24.1 min estimated vs the 24.0-minute
   stop rule, 19.9 min slowest measured; re-measure in Phase 3 after the pin bump; the fix is less per-trial time or fewer
   trials, never a higher timeout (F12).
4. **`evidence-release.yml`.** Its own commit, `ci(release): take the title from the notes heading`; it fails with a clear
   message when the notes file has no H1 (step 2). The PR body shows the resulting title for `p6-phase2.md`.
5. **Follow-ups** (§10): F8 F-M4 `test.fail()` PR; F9 Twenty histogram verdict fix; F10 `issue` annotations and summaries for
   `-008`, `-009` and the Cal state known-bug tests, a `cal-state-races` summary step and `twenty-obs` artefacts; F11 `-009`
   PR trials 13 → 20 after a budget recheck.
6. **471st test**: stated in §11 (from `dae02ed`, X8's review fix).
7. **Release.** After the owner merges, dispatch exactly as §2.8 (tag `p6-phase2`, target
   `a82521ad0e258ea3e5f9b649b389745cd96280a9`, run_ids `"40037355173 40039351021"`) before 2026-11-06, and report the release
   URL.

Not changed by the owner, so kept as proposed: Q1 (run B pairs with A), Q2 (CI title fix), Q3 (X9 as its own PR, now F9), Q4
(F-C1 as a comment on #29815). Q6 (severities) got no answer: README keeps "(proposed)" for X04, X05, F-M3 and F-M2.

## Appendix A. Scratch scripts (never committed)

In the session scratchpad: `runs/` (job JSON per run), `art/<run>/` (artefacts), `logs/` (job logs), `scripts/summ.py`
(per-histogram summary), `scripts/tables2.py` (§2.5), `scripts/rates.py` (§2.6), `scripts/steps.py` (§2.7). The build does not
need them: it copies the cells from this plan. To re-derive a cell: `gh run download <id> --dir art/<id>`, then read the
histogram fields named in §2.5 (`trialsRequested`, `trials`, `attempts[].oracle.suspectedBug`, `invalidTrials`, `reruns`,
`startedAt`, `finishedAt`).

## Appendix B1. Medusa: X04 + F-M3 + F-M4, for the owner to file (not filed by P6)

Template: `medusajs/medusa` `.github/ISSUE_TEMPLATE/bug_report_v2.yml` ("Bug report for v2.0", form), checked at
`029fb31fd077ab9c6d6fd9d68c676c17c71294c7`. Duplicate search: none (§2.12). Title prefix from the template: `[Bug]: `.

> **Title.** [Bug]: Parallel cancels of one order both succeed, and a losing cancel restores the order's stock reservation
> (`cancelOrderWorkflow` takes no lock)
>
> **Package.json file.** `apps/backend/package.json` of the reproduction app (Medusa DTC starter, `@medusajs/*` 2.21.2): owner
> pastes the file from https://github.com/Jayami123/medusa-dtc-starter/blob/f677db438f27294fc50e4c7c6612e71ff38eeff5/apps/backend/package.json
>
> **Node.js version.** v22.23.3
>
> **Database and its version.** PostgreSQL 15 (`postgres:15` image)
>
> **Operating system name and version.** Ubuntu 24.04 (GitHub-hosted runner, image 20261012.601)
>
> **Browser name.** None (Admin API calls only)
>
> **What happened?** One order (one line item, quantity 1, payment authorised by the system provider). N parallel
> `POST /admin/orders/:id/cancel` requests, fired within about 1 ms of each other.
>
> - N = 2: both cancels return 200 in 653 of 900 attempts. Each writes a `credit_line` order change; the second stays
>   `pending`, and confirming it later returns 400 "Order with id … has been canceled.".
> - When the losing cancel gets 400 "Order (…) already has an existing active order change", its rollback restores the
>   reservation that the winning cancel deleted: the canceled order keeps a live reservation (247 of 900 attempts at N = 2).
> - N = 10: 948 of 950 attempts have more than one 200, and 945 of 950 leave `inventory_level.reserved_quantity` above the
>   sum of the live reservations (4 to 7 for a quantity-1 order). The product can then not be deleted ("Cannot remove
>   following inventory item(s) since they have reservations").
> - (F-M4) N = 10 on a **captured** order: the payment holds one refund of the captured amount (no double
>   refund), but `order_summary.totals.refunded_total` is twice the refund rows in 684 of 953 attempts.
>
> **Expected behavior.** Exactly one cancel takes effect; the other requests fail with a 4xx and change nothing. The order has
> one confirmed `credit_line` change, no live reservation, `reserved_quantity` equal to the live reservations, and a
> `refunded_total` equal to the payment's refunds.
>
> **Actual behavior.** As above. Code (unchanged between `v2.21.2` and `develop` `029fb31f`):
> `packages/core/core-flows/src/order/workflows/cancel-order.ts` has no `acquireLockStep`. `cancelValidateOrder` (L71–79)
> reads the order, then `parallelize(refundCapturedPaymentsWorkflow, deleteReservationsByLineItemsStep, cancelPaymentStep)`
> (L182–187), `createOrderRefundCreditLinesWorkflow` (L252) and `cancelOrdersStep` (L272) run. Two requests both pass the
> validation. The compensation of `deleteReservationsByLineItemsStep` (`reservation/steps/delete-reservations-by-line-items.ts`
> L48, `restoreReservationItemsByLineItem`) brings back reservations the winner deleted. Related: #17369 (the same unlocked
> order-change guard in fulfillment workflows), #16823 (`createReturn`), #15397 (reservation locking; already in 2.21.2).
>
> **Link to reproduction repo.** https://github.com/Jayami123/k6-load-concurrency-suite (specs
> `tests/medusa/races/med-race-008-double-cancel.spec.ts`, `med-race-013-cancel-burst.spec.ts`,
> `med-race-014-captured-cancels.spec.ts`; CI evidence: release `p6-phase2`, runs 40037355173 and 40039351021).

## Appendix B2. Medusa: X05, for the owner to file (not filed by P6)

Template and commit as B1. Duplicate search: none (§2.12).

> **Title.** [Bug]: Cancel and create-fulfillment in parallel leave a canceled order with an open fulfillment that can no
> longer be canceled
>
> **Package.json file / Node.js / Database / OS / Browser.** As in B1.
>
> **What happened?** One authorised order. `POST /admin/orders/:id/cancel` and `POST /admin/orders/:id/fulfillments` fired in
> parallel. Both return 200 in 259 of 900 attempts. The order ends `canceled` with one open fulfillment and `fulfilled_quantity`
>
> 1. `POST /admin/orders/:id/fulfillments/:fid/cancel` then returns 400 "Order with id … has been canceled.", so the
>    fulfillment is stuck. A losing request can also restore the reservation of the canceled order (40 of 900 attempts).
>
> **Expected behavior.** One of the two wins. Either the order is canceled and the fulfillment is refused, or the
> fulfillment exists and the cancel is refused ("non-canceled fulfillment"). Never both.
>
> **Actual behavior.** As above. Code (unchanged between `v2.21.2` and `develop` `029fb31f`): neither `cancel-order.ts` nor
> `create-fulfillment.ts` takes a lock. `create-fulfillment.ts` checks `throwIfOrderIsCancelled` (L115) and the cancel checks
> for non-canceled fulfillments (`cancelValidateOrder`, L71–79), each before the other's write. Related: #17369 (its suggested
> per-order lock includes `createOrderFulfillmentWorkflow`; it does not test order cancel).
>
> **Link to reproduction repo.** https://github.com/Jayami123/k6-load-concurrency-suite (spec
> `tests/medusa/races/med-race-009-cancel-vs-fulfil.spec.ts`; CI evidence as in B1).

## Appendix B3. Medusa: F-M2, for the owner to file (not filed by P6)

Template and commit as B1. Duplicate search: none (§2.12).

> **Title.** [Bug]: Under parallel checkouts, a checkout that returns 400 still leaves an unpaid order that carries the
> promotion, so live orders exceed the promotion's usage limit
>
> **Package.json file / Node.js / Database / OS / Browser.** As in B1.
>
> **What happened?** A promotion with `limit: 3` (or a campaign usage budget of 3). Ten ready carts with the code applied;
> ten parallel `POST /store/carts/:id/complete`. Three return 200 and seven return 400. The promotion's `used` counter stays at
> 3, as it should (#16012's fix holds). But in 209 of 1050 attempts (`limit`) and 12 of 1051 attempts (campaign budget) one
> losing request returned 400 `not_allowed` "Updating Status from \"ok\" to \"temp_failure\" is not allowed." and its order
> stayed: status `pending`, no payment row, payment collection `not_paid`, a live `order_promotion` link, a live reservation,
> and the cart's `completed_at` set. So 4 live orders carry a promotion limited to 3, and the client was told the checkout
> failed. The same leak was seen once on the stock path: stock 1, two parallel checkouts, two orders.
>
> **Expected behavior.** A checkout that returns an error leaves no order, no promotion link and no reservation.
>
> **Actual behavior.** As above. Code (unchanged between `v2.21.2` and `develop` `029fb31f`):
> `cart/workflows/complete-cart.ts` creates the order (`createOrdersStep`, L542), then runs `parallelize(createRemoteLinkStep,
updateCartsStep, reserveInventoryStep, registerUsageStep)` (L648–652), then `authorizePaymentSessionStep` (L687). The lock
> (L362) is per cart, so parallel carts do not serialise. The rollback after the payment-session status error does not remove
> the created order.
>
> **Link to reproduction repo.** https://github.com/Jayami123/k6-load-concurrency-suite (specs
> `tests/medusa/races/med-race-012-usage-limit.spec.ts`, `med-race-005-campaign-budget.spec.ts`; CI evidence as in B1).

## Appendix C1. Cal: F-C1, comment for the existing issue calcom/cal.diy#29815 (the owner posts it; not posted by P6)

#29815 is open ("Private link configured to expire after one booking can still be reused"; sequential report; labelled Stale).
A commenter there suggested a race; this adds measured evidence. The closed PR #29839 proposed consuming the link before the
booking. Checked at `0f19cc46ef6b6426ee398c670575b3c96be7af9e`.

> We can reproduce this under concurrency on a self-hosted build (fork at `c2b7ac44`; the files below are unchanged at `main`
> `0f19cc46`). A private link with `maxUsageCount` 1 and 10 parallel bookings through it on distinct free slots: **all 10 are
> ACCEPTED** and `usageCount` ends at 1, in 600 of 600 attempts. With `maxUsageCount` 3: all 10 ACCEPTED, `usageCount` 3
> (600 of 600 attempts). No request gets a 4xx.
>
> Cause: the link is checked when the page renders, and usage is counted only after the booking exists:
> `BookingEventHandlerService.onBookingCreatedOrRescheduled` runs `updatePrivateLinkUsage` inside `Promise.allSettled`
> (`packages/features/bookings/lib/onBookingEvents/BookingEventHandlerService.ts` L45–67), and a failed
> `validateAndIncrementUsage` is only logged. Nothing stops a booking once the counter is full. Validating and incrementing in
> one atomic step before the booking is created (as #29839 proposed) would fix both the sequential and the concurrent case.
>
> Reproduction: https://github.com/Jayami123/k6-load-concurrency-suite, specs `tests/cal/races/cal-race-006-private-link.spec.ts`
> and `cal-race-008-private-link-cap.spec.ts`; CI evidence: release `p6-phase2`, runs 40037355173 and 40039351021.

## Appendix C2. Cal: F-C2, for the owner to file (not filed by P6)

Template: `calcom/cal.diy` `.github/ISSUE_TEMPLATE/bug_report.md` (label "🐛 bug"), checked at `0f19cc46`. Duplicate search:
none (§2.12).

> **Issue Summary.** Confirming and cancelling one PENDING booking at the same moment: both requests succeed, the booking ends
> ACCEPTED, and both the `BOOKING_CREATED` and the `BOOKING_CANCELLED` webhooks fire. The attendee and the host get
> contradictory side effects, and the booking that was "cancelled" stays on the calendar.
>
> **Steps to Reproduce.**
>
> 1. An event type that requires confirmation (seed `pro/tennis-class`); create a booking, so it is PENDING.
> 2. Fire together: confirm as the host (`POST /api/trpc/bookings/confirm?batch=1`, `{bookingId, confirmed: true, emailsEnabled: false}`), and `POST /api/cancel` for the same
>    booking uid.
> 3. Read the booking status and the webhook deliveries (a `BOOKING_CREATED` and a `BOOKING_CANCELLED` subscriber).
>
> **Actual Results.** Both 200; final status ACCEPTED; one `BOOKING_CREATED` and one `BOOKING_CANCELLED` delivery, in
> 600 of 600 attempts.
>
> **Expected Results.** One terminal state. Either ACCEPTED with only `BOOKING_CREATED`, or CANCELLED with only
> `BOOKING_CANCELLED`; the losing request gets a 4xx.
>
> **Technical details.** Self-hosted, fork at `c2b7ac44` (`confirm.handler.ts` and `handleCancelBooking.ts` unchanged at `main`
> `0f19cc46`). Node v22.23.3, PostgreSQL 15, Ubuntu 24.04 (GitHub Actions). API only, no browser.
>
> **Evidence.** https://github.com/Jayami123/k6-load-concurrency-suite, spec `tests/cal/races/cal-race-007-confirm-vs-cancel.spec.ts`;
> CI evidence: release `p6-phase2`, runs 40037355173 and 40039351021 (webhook signatures verified per delivery).

## Appendix C3. Cal: F-C3, for the owner to file (not filed by P6)

Template and commit as C2. Duplicate search: none (§2.12).

> **Issue Summary.** Two confirms of one PENDING booking at the same moment both succeed, and two `BOOKING_CREATED` webhooks
> fire. A sequential second confirm is refused (400, no webhook), so this is a race, not a missing check.
>
> **Steps to Reproduce.**
>
> 1. As in F-C2 step 1.
> 2. Fire two host confirm calls (the request of F-C2 step 2) for the same booking together.
> 3. Count the `BOOKING_CREATED` deliveries.
>
> **Actual Results.** Both 200; status ACCEPTED; two `BOOKING_CREATED` deliveries, in 600 of 600 attempts.
>
> **Expected Results.** One confirm succeeds and fires one `BOOKING_CREATED`; the other gets a 4xx, as the sequential case does.
>
> **Technical details.** As in F-C2.
>
> **Evidence.** Spec `tests/cal/races/cal-race-009-double-confirm.spec.ts`; CI evidence as in F-C2.

## Appendix D1. Twenty: `P6-TW-RACE-004`, private email to security@twenty.com (the owner sends it; not sent by P6)

Twenty's `.github/SECURITY.md` (checked at `c13b414b7a5a8a0a9c4f967be40bfa2c5a3a175e`) asks for vulnerability reports by email to
security@twenty.com, kept confidential until a fix ships. No public GitHub issue is drafted (owner, §15 item 2). Duplicate
search: none (§2.12).

```text
To: security@twenty.com
Subject: Password-reset token can be redeemed many times by parallel requests

Hello Twenty security team,

We found that one password-reset token can be redeemed many times when the redemptions arrive in parallel.

What we see
- Ten parallel updatePasswordViaResetToken mutations (POST /metadata) with one valid reset token all succeed.
- This happened in every attempt we ran: 250 of 250 in our CI runs (10 of 10 redemptions succeeded each time).
- A replay after a finished redemption is refused ("Token is invalid"), so the single-use check exists but is not atomic.

Where it is
- auth.resolver.ts updatePasswordViaResetToken (L1299-1311 at c13b414b) calls validatePasswordResetToken (a findOne for an
  unrevoked, unexpired token; reset-password.service.ts L254-288), then authService.updatePassword, then
  invalidatePasswordResetToken (an unconditional update of revokedAt; L290-309). Nothing locks or conditions the update
  between the check and the revoke.
- A conditional revoke first (UPDATE ... SET revokedAt = now() WHERE value = :hash AND revokedAt IS NULL, and continue only
  when one row changed) would close the window.

Impact
- Anyone holding a reset token (for example from a forwarded or intercepted reset email) can race the legitimate user and set
  the password more than once with the same token. Each redemption changes the password hash.

Environment
- Self-hosted image twentycrm/twenty:v2.44.0; the code path is the same at main c13b414b.
- Our test and its CI evidence are in a public QA repository; we can share the exact links and the request shape on request.

We are happy to help verify a fix. Please let us know if you need anything else.
```

## Appendix D2. Twenty: `P6-OBS-TW-001`, private email to security@twenty.com (the owner sends it; not sent by P6)

Same policy and commit as D1. No public GitHub issue is drafted. Duplicate search: none (§2.12).

```text
To: security@twenty.com
Subject: Unauthenticated requests with an empty JSON body hold server sockets open indefinitely

Hello Twenty security team,

We found that POST /graphql and POST /metadata never answer a request whose JSON body is empty or {}, and the server never
closes those sockets, with or without an Authorization header.

What we see
- Content-Type: application/json with an empty body, or the body {}, on POST /graphql or POST /metadata: no status and no
  bytes, ever. Same result without credentials.
- Twenty such requests held for 400 s were all still open (past Node's 300 s requestTimeout), with and without
  authentication. The server log has no line for them.
- The body {"foo":1} gets a 400 within 10 ms and a valid query a 200, so the server is otherwise healthy.
- In our CI the eight combinations (two endpoints x two bodies x with and without auth) hang in every run.

Impact
- An unauthenticated client can hold server sockets (and whatever per-request resources they keep) open indefinitely. In our
  test, ten held requests did not slow a valid query, so we have not shown a denial of service; we did not test larger
  numbers.

Environment
- Self-hosted image twentycrm/twenty:v2.44.0; not re-run on main c13b414b. We did not trace the cause in the source.
- Our tests and CI evidence are in a public QA repository; we can share the exact links on request.

Expected: an immediate 4xx (for example 400 "Must provide query string"), as for {"foo":1}.

We are happy to help verify a fix.
```

## Appendix E. Documenso: `P6-OBS-DOC-001` (refresh of Task 5 Appendix A)

The draft is [Task 5 plan Appendix A](2026-10-23-p6-phase2-task5-doc-obs-001.md). Re-checked: upstream `main` is still
`8707e33c124e4b1a68dde92d5e05178c9aabd0be`; `email-password.ts` L94, L115, L132 throw `AppError` without `statusCode`; duplicate
search: none (§2.12). Replace its last evidence sentence ("CI run links are added at closeout.") with:

> In CI both cases return 500 in every run: release `p6-phase2` (runs 40037355173 and 40039351021), test
> `tests/documenso/api/doc-obs-001-signin-errors.spec.ts` in https://github.com/Jayami123/k6-load-concurrency-suite.

This is a status-code contract bug, not a security report, so the public bug form fits Documenso's policy.

## Appendix F. Documenso: `P6-OBS-DOC-003`, private advisory draft (the owner decides whether to send it; not sent by P6)

Owner label: **finding (low)**, no test, no public issue (§15 item 1, 6c). Documenso's `SECURITY.md` (checked at
`8707e33c124e4b1a68dde92d5e05178c9aabd0be`) prefers GitHub's private vulnerability reporting form
(https://github.com/documenso/documenso/security/advisories/new), else security@documenso.com. Fields of that form:

> **Title.** Sign-in validation errors echo the submitted password and CSRF token in the response body
>
> **Affected product / versions.** `documenso/documenso`, `main` at `8707e33c` (also the self-hosted fork at `f4105e47`).
>
> **Severity (proposed).** Low. The value goes back only to the client that sent it.
>
> **Description.** `POST /api/auth/email-password/authorize` validates its JSON body with `sValidator('json', ZSignInSchema)`
> (`packages/auth/server/routes/email-password.ts` L66) and no error hook, so a validation failure returns 400 with the
> validator's default body, which includes the submitted input. A body without `csrfToken` returns the `email` and the
> `password` in `data`; a password shorter than 6 characters returns the `password` and the `csrfToken`.
>
> **Impact.** Any layer that logs response bodies (a reverse proxy, an APM agent, a browser or mobile error reporter) then
> stores a user's password in clear text. No other user's data is exposed.
>
> **Suggested fix.** Pass a hook to `sValidator` that returns only the issue codes and paths, never `data`, for this route
> (and the other auth routes that use the same pattern).
>
> **Reproduction.** Send the two request bodies above to the route and read the 400 body. Observed in a local probe on
> 2026-10-23 (two samples per body); the code is the same at `main` `8707e33c`.
