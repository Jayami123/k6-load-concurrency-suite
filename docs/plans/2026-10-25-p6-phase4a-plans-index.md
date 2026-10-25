# P6 Phase 4a plans: index and findings for Phase 4b

Written on `plan/2026-10-25-p6-phase4a-plans` (no PR, never deleted). First written from `origin/main` at `ba3ee19`; updated on 2026-10-25 to `origin/main` at `2db9726` (the Phase 3 stack, Task 10 and Task 11 are merged: PRs #62 to #68), with the owner's answers to every
open decision and three prerequisite plans. Probe date 2026-10-25 (UTC), cloud VM (4 vCPU, 16 GB, Node v22.23.3 / v24.21.0 for Documenso), k6 2.3.0, harness v0.2.15, products at the pinned refs. Code was probed from a detached worktree of the Task 10 branch; nothing was committed from it, no workflow
was dispatched, no PR or branch of the other sessions was touched. **VM timings prove that a step works; none is a published number or a target.** Every runner value is marked "confirm in the first CI dispatch" in its plan.

**Phase 3 Task 11 is done** (PRs #63 to #68; `docs/plans/2026-10-25-p6-phase3-closeout.md`; release `p6-phase3`, target `7301cf1`, three zips of `*.json`, `*.log`, `*.csv`, `*.html`, `*.txt`). Its plan file is not edited (no earlier plan carries a status line; completion is recorded in the phase closeout).

## Table

| Task   | Plan file                                                                          | Cases                                                                                                                         | Probe items (probed / UNPROBED)         | Decisions | New CI job or step                                                                                                              | Harness or environment prerequisite |
| ------ | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| PRE-1  | [pre1-med-load-006-storm-fix](2026-10-25-p6-phase4-pre1-med-load-006-storm-fix.md) | `P6-MED-LOAD-006` (TEST BUG fix, judge unchanged)                                                                             | read from the repo and the release zips | 3 decided | none (code only)                                                                                                                | no                                  |
| PRE-2  | [pre2-cal-smoke-step-caps](2026-10-25-p6-phase4-pre2-cal-smoke-step-caps.md)       | `cal-smoke` step caps                                                                                                         | measured on 55 runs                     | 4 decided | `perf.yml`: `timeout-minutes` on the 19 uncapped `cal-smoke` steps, 5 caps lowered                                              | no                                  |
| Task 1 | [task1-breakpoint-method](2026-10-25-p6-phase4-task1-breakpoint-method.md)         | `P6-X-LOAD-021` (proves `P6-RULE-006`)                                                                                        | 8 / 4                                   | 7 decided | new job `load-knee-selftest` in `perf.yml` (product-free, every event)                                                          | no                                  |
| Task 2 | [task2-cal-knee](2026-10-25-p6-phase4-task2-cal-knee.md)                           | `P6-CAL-LOAD-005`                                                                                                             | 5 / 5                                   | 6 decided | new `knee.yml` (dispatch only), job `cal-knee`                                                                                  | no                                  |
| PRE-3  | [pre3-evidence-workflow-ids](2026-10-25-p6-phase4-pre3-evidence-workflow-ids.md)   | release check                                                                                                                 | jq probed; workflow id UNPROBED         | 4 decided | `evidence-release.yml`: `EVIDENCE_WORKFLOW_IDS`, caps 125 → 16                                                                  | no                                  |
| Task 3 | [task3-med-knee](2026-10-25-p6-phase4-task3-med-knee.md)                           | `P6-MED-LOAD-004`                                                                                                             | 5 / 4                                   | 4 decided | job `medusa-knee` in `knee.yml`                                                                                                 | no                                  |
| Task 4 | [task4-doc-knee](2026-10-25-p6-phase4-task4-doc-knee.md)                           | `P6-DOC-LOAD-005`                                                                                                             | 5 / 4                                   | 4 decided | job `documenso-knee` in `knee.yml`                                                                                              | no                                  |
| Task 5 | [task5-steady-baselines](2026-10-25-p6-phase4-task5-steady-baselines.md)           | `P6-CAL-LOAD-003`, `P6-MED-LOAD-002` re-run                                                                                   | 5 / 4                                   | 6 decided | jobs `cal-steady` and `medusa-steady` in `knee.yml` (dispatch only), input `mode`                                               | no                                  |
| Task 6 | [task6-spike-recovery](2026-10-25-p6-phase4-task6-spike-recovery.md)               | `P6-CAL-LOAD-004`, `P6-MED-LOAD-003`, `P6-DOC-LOAD-004`, `-009`, `P6-MED-LOAD-010`; `P6-CAL-LOAD-010` to "Later" (gate fails) | 7 / 5                                   | 7 decided | jobs `cal-spike`, `medusa-spike`, `documenso-limiter` in `knee.yml`; Task 6 no longer edits `evidence-release.yml` (PRE-3 does) | no                                  |

Totals: **42 decisions, all decided by the owner on 2026-10-25** (34 in Tasks 1 to 6 — the 31 of the first draft plus 3 added: Task 1 Q7, Task 2 Q6, Task 5 Q6 —, 5 in Phase 3 Task 11 resolved by PRs #63 to #68, and 3 in the prerequisite plans: PRE-1 Q1 option 1 with a gate on the failing artefact, PRE-2 Q1 tight warm-path caps, PRE-3 Q1 the caps of its §5). No plan needs a harness release, a harness pin bump, an environment change (Cursor Cloud or Claude Code cloud), a new secret or a repo setting. Plans that edit or add a CI workflow stop for owner review (rule 10): PRE-2, Task 1,
Task 2, PRE-3, and the job additions of Tasks 3 to 6.

**Overrides of the first-draft defaults:** Task 1 Q5 (the self-test case is a new `P6-X-LOAD-021`, not `P6-RULE-006`); Task 4 Q3 (unfinished documents are judged per intent, not bounded by `interrupted`); Task 6 Q4 (`reset-password` 500 gets its own id `P6-OBS-DOC-006`, not an extension of `-001`).
**Placement and timing decisions:** Task 2 Q5 (dispatch only; the Saturday cron is a later PR); Task 5 Q6 (steady runs are own jobs in `knee.yml`, not steps in `cal-smoke` and `medusa-load`); Task 6 Q5 (the workflow-id list moved to PRE-3); Task 2 Q6 (artefact retention 90 days and early release widening). **Added decision:** Task 1 Q7 (per-intent reconciliation).

**Unit-test chain** (measured: `main` at `2db9726` runs **865** tests, 178 suites, all pass, Node 24; the old chain from 818 and the Task 11 step are obsolete). Expected after each merge, in the order below:
PRE-1 +4 → 869; PRE-2 +0 → 869; Task 1 +69 → 938; Task 2 +14 → 952; PRE-3 +2 → 954; Task 3 +10 → 964; Task 4 +13 → 977; Task 5 +22 (5a) → 999, +1 (5b) → 1000; Task 6 +36 → **1036**. Each plan states its own delta against "the count on `main` when the build starts" (B), so the order of Tasks 3 and 4 may swap.

**Order and dependencies.**

1. PRE-1 (the storm fix; the case runs on every PR, so a flaky storm turns any PR's CI red; must merge before Task 3).
2. PRE-2 (the `cal-smoke` caps; `knee.yml` copies those steps and their caps).
3. Task 1 (method, per-intent reconciliation, self-test job).
4. Task 2 (creates `knee.yml`).
5. PRE-3 (right after Task 2: the release check needs the `knee.yml` workflow id).
6. Tasks 3 and 4, one workflow PR at a time.
7. Three VALID `knee.yml` dispatches (`mode: knee`) per product.
8. Task 5 (needs the Cal and Medusa knee ranges).
9. Three VALID steady dispatches (`mode: steady`).
10. Task 6 (needs all three knees and the Task 5 band).
11. The release-notes PR (`chore(release): add the phase 4a evidence notes`).
12. `evidence-release` `p6-phase4a`.
13. The `ci(knee)` Saturday-cron PR (below).

Runs come from owner dispatches (`workflow_dispatch` on `main`) and any nightlies; **no plan requires scheduled nightlies**. `knee.yml` is dispatch-only in every Phase 4a PR: there is no `schedule:` block until the release holds 3 VALID runs of every knee job.

**The later Saturday-cron PR** (`ci(knee): add the weekly saturday schedule`; D16, `43 3 * * 6`): after step 12, add `schedule: - cron: "43 3 * * 6"` to `knee.yml` and change the concurrency group to `knee-${{ github.event_name == 'schedule' && 'weekly' || github.run_id }}` (cancel-in-progress stays false). The scheduled run takes the input defaults (`mode: knee`, empty plan inputs). It is a shared-workflow edit
(owner review stop) with no new test beyond `actionlint`; its done-when is one green scheduled run that the owner may release like any other.

## Phase 3 Task 11 decisions (resolved by what shipped)

Decided (owner, 2026-10-25): resolved by PRs #63 to #68. Shipped outcomes, read against Q1 to Q5 of `docs/plans/2026-10-25-p6-phase3-task11-closeout.md` (lines 619 to 630):

- **Q1. Which runs count.** Only `workflow_dispatch` and `schedule` runs on `main` with a GitHub Actions run id enter a median (`selectSmokeRuns`, `src/load/smoke-baseline.ts`; `selectPublishable`, `src/load/medians.ts`; PR #64, #65).
- **Q2. `*.json.gz` in the release.** Out: the allowlist keeps `json log csv html txt` (`evidence-release.yml` line 140, PR #63); the release zips hold no `.gz`.
- **Q3. A product run INVALID by `telemetry_gap` or `clock_skew`.** Excluded and listed, never widened: `selectPublishable` accepts only PASS and VALID runs (PR #64).
- **Q4. Concurrency of dispatches.** An own group per dispatch run: `perf-${{ schedule && 'nightly' || dispatch && run_id || ref }}` with cancel-in-progress (PR #63).
- **Q5. Medusa and Documenso upstream templates.** The drafts exist in `docs/upstream/` and name their templates (Cal: `bug_report.md`; Documenso: `.github/ISSUE_TEMPLATE/bug-report.yml`); the owner files them. Release notes shipped in their own PR (#66, `chore(release)`), the smoke medians file in #65, the scoped gitleaks allowlist in #68 and the results README in #67.

**Id notes.** `docs/plans/2026-10-25-p6-phase3-task11-closeout.md` lines 612 and 614 on main reuse `P6-X-LOAD-012` and `-013` (already the extras of Phase 3 Task 4 line 603 and Task 5 line 588). They are proposals only; `P6-X-LOAD-025` and `-026` are reserved for them, to be renumbered by a one-commit docs PR on main (owner's act, not part of these plans).

## PRODUCT BUG (SUSPECTED) found by the probes (only the owner confirms)

1. **`P6-OBS-DOC-006` (suspected; the owner labels it): Documenso `POST /api/auth/email-password/reset-password` with an unknown token answers HTTP 500** `{"code":"NOT_FOUND","message":"NOT_FOUND"}`: 5 of 5 requests in one probe run (limiter profile, fresh database). Linked to `P6-OBS-DOC-001` (auth
   routes map an `AppError` without a `statusCode` to 500; bad CSRF on `authorize` is the known instance, also seen). The id is already used on main (`docs/BACKLOG.md`, the Phase 3 closeout); `P6-OBS-DOC-004` is reserved by the Phase 3 Task 9 plan (Q2) for `-010`. Evidence and request shape: Task 6 plan §3.4 and §6.6. No expected-failure
   marker is planned (rule 13: repeated-run evidence first); one upstream draft may cover both routes.

Observations that are **not** labelled: one `connection reset by peer` on a Documenso multipart upload under a 3× spike (1 of 3,196 requests; Task 4 §3.1); Cal and Medusa accept every request under a 3× spike and answer 11 to 20 seconds late instead of refusing (Task 6 §3.1; Medusa verified to have no limiter or queue, §3.3);
a Documenso 429 on auth routes with an empty message (`{"code":"UNKNOWN_ERROR","message":"","statusCode":429}`, Task 6 §3.4).

Test bugs found (not product bugs): the Phase 3 Cal journey consumes two slots per booking and reads a list that shifts under concurrency (latent; fixed by Task 2's fixed-slot mode); the post-load audits misread the iterations a stopped knee run interrupts (Cal 318 vs 311, Documenso 197 vs 192; Task 2 §3.4, Task 4 §3.2, Task 1 §3.9 R3,
replaced by per-intent reconciliation, Task 1 §6.8); the `P6-MED-LOAD-006` storm does not reliably reach its threshold (PRE-1). Two items of the first draft are closed: the Phase 3 product LOAD telemetry shipped in PR #64, and the container source reads on the runner (30 of 30 telemetry files of the release zips report it present with no errors; the 31-of-31 errors were the
Claude Code VM's `tmpfs` cgroup).

## Known issues carried from Phase 3 (each with its owner or PR)

| Issue                                                                                                        | Where it is handled                                        |
| ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| `P6-MED-LOAD-006` storm TEST BUG (3 of 30 first attempts timed out, run 40178773022 attempt 1)               | PRE-1                                                      |
| `P6-OBS-DOC-006` (suspected)                                                                                 | the owner labels it; Task 6 counts it (`-009`)             |
| `cal-smoke` step-cap total (98 against 60)                                                                   | PRE-2 (the other jobs: PRE-2 §5 finding table, a later PR) |
| Upstream drafts `docs/upstream/2026-10-25-cal-link-usage-mismatch.md` and `...-documenso-duplicate-seal.md`  | the owner files them                                       |
| Cal two-slot bug                                                                                             | Task 2's fixed-slot mode                                   |
| Branch `docs/2026-10-25-p6-closeout-checklist-wording` (`0c5ca47`, one line in the closeout doc) is unmerged | left alone                                                 |

## UNPROBED items (each marked "confirm at build time" or "confirm in the first CI dispatch" in its plan)

- Every runner value: knee ranges, steady bands, spike recovery times, step and job times of the new steps (all plans); the Task 1 `load-knee-selftest` job times; whether `gracefulStop` drains in-flight iterations after an `abortOnFail` stop (compare `p6_step_started`, the outcome lines and `iterations` in the first self-test run).
- `max_connections` of the Cal and Documenso databases (Medusa's is 100).
- Seven Documenso limiters and their 429 shapes: signup, update-password, passkey, request-2fa-email, link-org-account, report-sender, sync-subscription (need a session, a credential or billing state).
- Whether a repo-level retention setting clamps the 90-day `knee.yml` artefacts (the `expires_at` of the first artefact).
- The `knee.yml` workflow id (known only after Task 2 merges; PRE-3 reads it); the step-0 / smoke-median ratio per product; the indeterminate-intent count against `interrupted`; the Documenso limiter refusal rate at 0.2 and 0.6 per second; the knee spread on the runner.
- The cause of the `P6-MED-LOAD-006` shortfall (PRE-1: the failing attempt's artefact, readable with authentication until about 2026-11-08).
- The cold Cal build on a cache miss (the tight caps trip visibly, PRE-2 R1); the runner durations of the new `knee.yml` steps and of a 12-run evidence release.

## Prerequisites and decisions the owner may want to look at first

- **Harness or environment:** none. The only environment note: on a Claude Code cloud VM that sets `NODE_OPTIONS=--use-openssl-ca`, Cal needs `--max-old-space-size=8192` (already in the 2026-10-24 handoff).
- **Shared CI:** shipped: the `perf.yml` dispatch group and the release allowlist (#63), the gitleaks scope (#68). Planned: PRE-2 (`cal-smoke` caps), PRE-3 (`EVIDENCE_WORKFLOW_IDS`, caps 125 → 16), new workflow `knee.yml` (Task 2, extended by Tasks 3 to 6), new job `load-knee-selftest` (Task 1). Every Medusa artefact of `knee.yml` keeps the inner folder `load-medusa/P6-MED-LOAD-nnn/<attempt>/` so
  the scoped gitleaks allowlist applies (probed with gitleaks 8.30.1 on fixtures; Task 3 §6.6); the regex is never widened.
- **Decisions with the biggest effect (decided):** the knee and spike jobs live in a dispatch-only `knee.yml` (Task 2 Q1, Q5); the steady rate is 50 % of the minimum lower bound over the VALID knee runs (Task 5 Q1) and the steady runs are their own jobs (Task 5 Q6); Documenso's spike rates come from the limiter that binds, not from the knee
  (Task 6 Q2); the audits reconcile per intent (Task 1 Q7), with a known-bug count only for the F-M2 signature: a `fail` intent whose line carries `ghost: true` and has one order is counted under `F-M2`, any other `fail` intent with an order stays `PRODUCT BUG (SUSPECTED)` (Task 1 §6.8, Task 3); the limiter exemption of Task 6 is exact (a `fail` line AND a `limited` line AND exactly one unfinished envelope, set only by `P6-DOC-LOAD-004`); `*.json.gz` points stay out of the permanent release (shipped in #63); the permanent evidence is the GitHub release, Actions artefacts are transient (90 days for `knee.yml`).

## Cross-task findings for the Phase 4b plans (Tasks 7 to 14)

1. **Soak slot supply (Task 7, Cal).** A booking removes its slot from `getSchedule`, there are about 11.4 slots per day, and one `getSchedule` of 270 days returned 3,104 slots. A 2-hour soak at 3 per second needs 21,600 slots (about 1,900 days); even 1 per second needs 7,200 (632 days). The soak must recycle slots (book then cancel in the iteration, which doubles the load and the
   cancellation traffic) or use a lower rate or several hosts/event types. Plan it before choosing a soak rate. Cancelled bookings do free their slots (Phase 1 allocator behaviour, confirmed by the cleanup sweeps).
2. **Memory grows during the steady phase (Task 7).** Cal RSS went 707 → 1,082 → 1,504 → 1,697 MB across a 170-second run at 3 per second; Medusa 456 → 764 MB over three steps; Documenso 1,078 → 1,418 MB. The slope/plateau rule must ignore warm-up (skip the first minutes) and compare windows, or every soak will "leak".
3. **DB growth per unit (Task 7).** Medusa +4.2 MB per 46 orders (about 91 KB per order after cleanup; orders are archived, not deleted; reservations soft-deleted). Track DB size separately from RSS as the roadmap says.
4. **Telemetry over long runs (Task 7).** The sampler's first samples cost 173 to 1,310 ms (db, probe and process reads), so the effective interval is 1.0 to 1.3 s; the gap rule (more than 2 intervals) has little slack for a slow database read. A 2-hour Cal file would be about 7,200 samples (~5.5 MB JSON, csv small). No Redis or event bus exists in the default Medusa harness mode
   (in-memory event bus and lock), so `P6-MED-LOAD-005`'s "Redis/event-bus backlog if present" has nothing to observe unless `MEDUSA_REDIS=1`. The container source reads on the runner, so `db_cpu` is available there.
5. **Cal invariants (Task 8).** No Redis client in the harness Cal stack and `UNKEY_ROOT_KEY` empty, so the `getSchedule` slot cache is **inactive** and D15's "never offered again after commit" contract applies; the probe shows a booked slot leaves `getSchedule` at once (320 → 318 slots right after two bookings). Slots listed by `getSchedule` shift under concurrency, so burst
   targets must be chosen from a fixed list (Task 2's fixed-slot mode). Cal's log carries SMTP and daily-video noise (`ECONNREFUSED 127.0.0.1:1025`, `createMeeting failed`), which the log-grep already counts as noise.
6. **Documenso exactly-once under load (Task 9).** The pipeline join costs about 0.05 s per document; Inbucket reads held up; seal lag p95 0.66 s at 1 per second, 3.65 s at 4 per second, 9.6 s in a 3× spike; the drain after the last request was 18 ms to 1.5 s. Knee mode needs "completed documents only" with unfinished documents per intent (Task 4 §6.4); the concurrent-pair share must be counted by document id.
7. **Medusa invariants (Task 10).** Reservations exist only for completed carts (abandoned carts reserve nothing); a cancelled order soft-deletes its reservation; cleanup is 0.33 s per order sequentially. The in-memory lock is the default; two-instance load needs `MEDUSA_REDIS=1` and a different knee (extra `P6-MED-LOAD-014` in Task 3).
8. **A/A and A/B (Tasks 11, 12).** Run-to-run spread on the VM: Cal knee range identical twice (6 to 8 per second), Cal steady p95 175 vs 173 ms, but Medusa's last clean step p95 876 vs 1,954 ms near the knee. Take the A/A tolerance from steady runs at 50 % of the knee, never from near-knee steps. Per-window p95s over 45 to 135 requests are noisy; the band stores
   run-level and window-level ranges (Task 5 §6.4).
9. **Dashboard and README (Task 13, 14).** `tests/unit/readme-rules.test.ts` forbids the bare word "capacity": use "knee range", "steady baseline", "spike characterisation". Chart HTML is 5 to 10 KB and the telemetry JSON 23 to 56 KB per run; points (`*.json.gz`, 92 KB to 1.9 MB in the probes, up to tens of MB for a product knee) never enter the release (allowlist, #63), so charts are built from csv/json/html
   artefacts. `knee.yml` artefacts live 90 days (`perf.yml` 14); the release is the permanent record. The release check takes a list of workflow ids (PRE-3); any new workflow (`soak.yml`, `gate.yml`) must be added to that list in the PR that creates it.
10. **Spike and knee runs share a lesson for soak/gate generators.** An arrival-rate generator needs a VU pool that covers every arrival in flight (Task 6 §3.2): a lazily allocated VU drops an iteration (INVALID). Size pools from the backlog bound, not from the steady rate.
11. **Per-intent reconciliation is the audit pattern for 4b.** Every journey persists an intent (`exec.scenario.iterationInTest`) in its attendee email, cart email or document title, and the client logs one outcome line per finished iteration (Task 1 §6.8). Soak and gate audits should reuse it instead of count slack, which lets duplicate and ghost writes pass unseen.
12. **Step caps are a real constraint.** Twelve of the thirteen `perf.yml` jobs have a naive cap sum over their timeout or a margin under 10 (PRE-2 §5); a soak or gate job needs a cap table from its first draft, and a job that cannot meet it needs its own workflow.

## Environment changes

None planned (Cursor Cloud: `.cursor/environment.json`, `.cursor/Dockerfile`; Claude Code cloud: setup script, `.claude/hooks/session-start.sh`). Repo settings by hand: none. The owner's manual steps are workflow dispatches (`knee.yml` three times per mode, then `evidence-release.yml` with `tag=p6-phase4a`) and the reviews of the shared-workflow PRs.

**Contradictions with the roadmap** (details in each plan's table): the roadmap's `knee` and `perf.yml` placement (Task 2 C2), the Documenso 150 % of the knee on the limiter profile (Task 6 C2), the `ALREADY_SIGNED` conflict class (Task 1 C1), `P6-CAL-LOAD-010` gated on `reserveSlot` (Task 6 C4), the "≥ 3 nightly runs" evidence (dispatches instead).
