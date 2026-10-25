# P6 Phase 4a plans: index and findings for Phase 4b

Written on `plan/2026-10-25-p6-phase4a-plans` (no PR, never deleted), from `origin/main` at `ba3ee19` plus the merge of that tip. Probe date 2026-10-25 (UTC), cloud VM
(4 vCPU, 16 GB, Node v22.23.3 / v24.21.0 for Documenso), k6 2.3.0, harness v0.2.15, products at the pinned refs. Code was read and probed from a detached worktree of
`origin/feat/2026-10-24-p6-retry-storms` (Phase 3 through Task 10); nothing was committed from it, no workflow was dispatched, no PR or branch of the other sessions was touched.
**VM timings prove that a step works; none is a published number or a target.** Every runner value is marked "confirm in the first CI dispatch" in its plan.

## Table

| Task            | Plan file                                                                                          | Cases                                                                                                                         | Probe items (probed / UNPROBED) | Open decisions | New CI job or step                                                                                                             | Harness or environment prerequisite |
| --------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| Phase 3 Task 11 | [2026-10-25-p6-phase3-task11-closeout.md](2026-10-25-p6-phase3-task11-closeout.md)                 | all 14 Phase 3 LOAD cases (evidence), RULE-001/002 checked, smoke p95 medians                                                 | 7 / 4                           | 5              | `perf.yml` dispatch concurrency group; `evidence-release.yml` calls `scripts/ci/filter-evidence.sh` (D14)                      | no                                  |
| Phase 4 Task 1  | [2026-10-25-p6-phase4-task1-breakpoint-method.md](2026-10-25-p6-phase4-task1-breakpoint-method.md) | `P6-RULE-006` (self-test case of the same id: knee, undersized, no-rule runs)                                                 | 8 / 4                           | 6              | new job `load-knee-selftest` in `perf.yml` (product-free, every event)                                                         | no                                  |
| Phase 4 Task 2  | [2026-10-25-p6-phase4-task2-cal-knee.md](2026-10-25-p6-phase4-task2-cal-knee.md)                   | `P6-CAL-LOAD-005`                                                                                                             | 5 / 5                           | 5              | new workflow `knee.yml` (dispatch + Saturday) with job `cal-knee`                                                              | no                                  |
| Phase 4 Task 3  | [2026-10-25-p6-phase4-task3-med-knee.md](2026-10-25-p6-phase4-task3-med-knee.md)                   | `P6-MED-LOAD-004`                                                                                                             | 5 / 4                           | 4              | job `medusa-knee` in `knee.yml`                                                                                                | no                                  |
| Phase 4 Task 4  | [2026-10-25-p6-phase4-task4-doc-knee.md](2026-10-25-p6-phase4-task4-doc-knee.md)                   | `P6-DOC-LOAD-005`                                                                                                             | 5 / 4                           | 4              | job `documenso-knee` in `knee.yml`                                                                                             | no                                  |
| Phase 4 Task 5  | [2026-10-25-p6-phase4-task5-steady-baselines.md](2026-10-25-p6-phase4-task5-steady-baselines.md)   | `P6-CAL-LOAD-003`, `P6-MED-LOAD-002` re-run                                                                                   | 5 / 4                           | 5              | one step each in `cal-smoke` and `medusa-load` (never on pull requests)                                                        | no                                  |
| Phase 4 Task 6  | [2026-10-25-p6-phase4-task6-spike-recovery.md](2026-10-25-p6-phase4-task6-spike-recovery.md)       | `P6-CAL-LOAD-004`, `P6-MED-LOAD-003`, `P6-DOC-LOAD-004`, `-009`, `P6-MED-LOAD-010`; `P6-CAL-LOAD-010` to "Later" (gate fails) | 7 / 5                           | 7              | jobs `cal-spike`, `medusa-spike`, `documenso-limiter` in `knee.yml`; **`evidence-release.yml` accepts a list of workflow ids** | no                                  |

Totals: 36 open decisions (each with option, evidence and a recommended default inside its plan). No plan needs a harness release, a harness pin bump, an environment change
(Cursor Cloud or Claude Code cloud), a new secret or a repo setting. Five plans edit or add a CI workflow; two edit the shared `evidence-release.yml`
(Phase 3 Task 11, Task 6): both stop for owner review (rule 10).

**Unit-test chain** (measured: `main` at `ba3ee19` 790; Task 10 head `c48faff` 818). Expected after each merge, in the suggested order, starting at 818:
Task 11 +23 → 841; Task 1 +61 → 902; Task 2 +12 → 914; Task 3 +8 → 922; Task 4 +11 → 933; Task 5 +22 → 955; Task 6 +37 → **992**. Each plan states its own delta against "the count
on `main` when the build starts" (B1 to B6), so the order may change; Task 1 can be built before Task 11 (it needs no medians).

**Order and dependencies.** Task 1 (and Task 11 in parallel) → Tasks 2, 3, 4 (parallel; Task 2 creates `knee.yml`, the others add jobs, one workflow PR at a time) → three VALID
`knee.yml` dispatch runs per product → Task 5 (needs the Cal and Medusa knee ranges) → three VALID `perf.yml` dispatches → Task 6 (needs all three knees and the Task 5 band). Task 11's
smoke p95 medians are read by Tasks 2 to 4 from `k6/thresholds/smoke-p95.json`; Task 5's rates from `k6/thresholds/knee-bounds.json`; Task 6's recovery reference from
`k6/thresholds/baseline-band.json`. No plan requires scheduled nightly runs: every run set comes from `workflow_dispatch` (and nightlies if any exist).

## PRODUCT BUG (SUSPECTED) found by the probes (only the owner confirms)

1. **Documenso `POST /api/auth/email-password/reset-password` with an unknown token answers HTTP 500** `{"code":"NOT_FOUND","message":"NOT_FOUND"}`: 5 of 5 requests in one probe run
   (limiter profile, fresh database). Same mechanism as the known `P6-OBS-DOC-001` (auth routes map an `AppError` to 500; bad CSRF on `authorize` is the known instance, also seen). Evidence and request
   shape: Task 6 plan §3.4 and §6.6. No expected-failure marker is planned (rule 13: repeated-run evidence first).

Observations that are **not** labelled: one `connection reset by peer` on a Documenso multipart upload under a 3× spike (1 of 3,196 requests; Task 4 §3.1); Cal and Medusa accept every request
under a 3× spike and answer 11 to 20 seconds late instead of refusing (Task 6 §3.1; Note 6 of the roadmap said as much for Cal; Medusa verified to have no limiter or queue, §3.3); a Documenso 429 on
auth routes with an empty message (`{"code":"UNKNOWN_ERROR","message":"","statusCode":429}`, Task 6 §3.4).

Test bugs found (not product bugs): the Phase 3 Cal journey consumes two slots per booking and reads a list that shifts under concurrency (latent; Task 2 §3.1); the post-load audits mis-read the
iterations a stopped knee run interrupts (Cal 318 vs 311, Documenso 197 vs 192; Task 2 §3.4, Task 4 §3.2, Task 1 §3.9 R3); the Phase 3 product LOAD cases ship no telemetry and no chart (Task 11 §3.4);
the container telemetry source errors on 31 of 31 samples on this VM because `/sys/fs/cgroup` is `tmpfs` (Task 11 §3.4, Task 1 §3.8; runner behaviour UNPROBED).

## UNPROBED items (each marked "confirm at build time" or "confirm in the first CI dispatch" in its plan)

- Every runner value: knee ranges, steady bands, spike recovery times, step and job times of the new steps (all plans).
- The container (database cgroup) telemetry source on the GitHub runner; `max_connections` of the Cal and Documenso databases (Medusa's is 100).
- The Documenso and Medusa upstream issue templates (the local forks have none; Cal's is `bug_report.md`).
- Seven Documenso limiters and their 429 shapes: signup, update-password, passkey, request-2fa-email, link-org-account, report-sender, sync-subscription (need a session, a credential or billing state).
- The cold Cal build time on a cache miss in `knee.yml` (14 minutes on the VM).
- The `knee.yml` workflow id for the release check (known only after Task 2 merges).

## Prerequisites and decisions the owner may want to look at first

- **Harness or environment:** none. The only environment note: on a Claude Code cloud VM that sets `NODE_OPTIONS=--use-openssl-ca`, Cal needs `--max-old-space-size=8192` (already in the 2026-10-24 handoff).
- **Shared CI:** `perf.yml` dispatch concurrency group (Task 11); `evidence-release.yml` filter allowlist (Task 11) and workflow-id list (Task 6); new workflow `knee.yml`; new job `load-knee-selftest`.
- **Decisions with the biggest effect (recommended defaults in the plans):** where the knee and spike jobs live (`knee.yml`, Task 2 Q1); which lower bound sets the steady rate (the minimum over VALID runs, Task 5 Q1);
  Documenso's spike rates come from the limiter that binds, not from the knee (Task 6 Q2); `*.json.gz` points stay out of the permanent release (Task 11 Q2).

## Cross-task findings for the Phase 4b plans (Tasks 7 to 14)

1. **Soak slot supply (Task 7, Cal).** A booking removes its slot from `getSchedule`, there are about 11.4 slots per day, and one `getSchedule` of 270 days returned 3,104 slots. A 2-hour soak at 3 per second needs
   21,600 slots (about 1,900 days); even 1 per second needs 7,200 (632 days). The soak must recycle slots (book then cancel in the iteration, which doubles the load and the cancellation traffic) or use a lower rate or
   several hosts/event types. Plan it before choosing a soak rate. Cancelled bookings do free their slots (Phase 1 allocator behaviour, confirmed by the cleanup sweeps).
2. **Memory grows during the steady phase (Task 7).** Cal RSS went 707 → 1,082 → 1,504 → 1,697 MB across a 170-second run at 3 per second; Medusa 456 → 764 MB over three steps; Documenso 1,078 → 1,418 MB.
   The slope/plateau rule must ignore warm-up (skip the first minutes) and compare windows, or every soak will "leak".
3. **DB growth per unit (Task 7).** Medusa +4.2 MB per 46 orders (about 91 KB per order after cleanup; orders are archived, not deleted; reservations soft-deleted). Track DB size separately from RSS as the roadmap says.
4. **Telemetry over long runs (Task 7).** The sampler's first samples cost 173 to 1,310 ms (db, probe and process reads), so the effective interval is 1.0 to 1.3 s; the gap rule (more than 2 intervals) has little slack for a
   slow database read. A 2-hour Cal file would be about 7,200 samples (~5.5 MB JSON, csv small). No Redis or event bus exists in the default Medusa harness mode (in-memory event bus and lock), so `P6-MED-LOAD-005`'s
   "Redis/event-bus backlog if present" has nothing to observe unless `MEDUSA_REDIS=1`.
5. **Cal invariants (Task 8).** No Redis client in the harness Cal stack and `UNKEY_ROOT_KEY` empty, so the `getSchedule` slot cache is **inactive** and D15's "never offered again after commit" contract applies; the probe shows a
   booked slot leaves `getSchedule` at once (320 → 318 slots right after two bookings). Slots listed by `getSchedule` shift under concurrency, so burst targets must be chosen from a fixed list (Task 2's fixed-slot mode).
   Cal's log carries SMTP and daily-video noise (`ECONNREFUSED 127.0.0.1:1025`, `createMeeting failed`), which the log-grep already counts as noise.
6. **Documenso exactly-once under load (Task 9).** The pipeline join costs about 0.05 s per document; Inbucket reads held up; seal lag p95 0.66 s at 1 per second, 3.65 s at 4 per second, 9.6 s in a 3× spike; the drain after
   the last request was 18 ms to 1.5 s. Knee mode needs "completed documents only" (Task 4 §6.4); the concurrent-pair share must be counted by document id.
7. **Medusa invariants (Task 10).** Reservations exist only for completed carts (abandoned carts reserve nothing); a cancelled order soft-deletes its reservation; cleanup is 0.33 s per order sequentially. The in-memory lock is the
   default; two-instance load needs `MEDUSA_REDIS=1` and a different knee (extra `P6-MED-LOAD-011` in Task 3).
8. **A/A and A/B (Tasks 11, 12).** Run-to-run spread on the VM: Cal knee range identical twice (6 to 8 per second), Cal steady p95 175 vs 173 ms, but Medusa's last clean step p95 876 vs 1,954 ms near the knee.
   Take the A/A tolerance from steady runs at 50 % of the knee, never from near-knee steps. Per-window p95s over 45 to 135 requests are noisy; the band stores both run-level and window-level ranges (Task 5 §3.3).
9. **Dashboard and README (Task 13, 14).** `tests/unit/readme-rules.test.ts` forbids the bare word "capacity": use "knee range", "steady baseline", "spike characterisation". Chart HTML is 5 to 10 KB and the telemetry
   JSON 23 to 56 KB per run; points (`*.json.gz`, 92 KB to 1.9 MB in the probes, up to tens of MB for a product knee) never enter the release, so charts must be built from csv/json/html artefacts. Artefacts expire after 14 days:
   release within the window. The release check accepts several workflow ids after Task 6; any new workflow (`soak.yml`, `gate.yml`) must be added to that list.
10. **Spike and knee runs share a lesson for soak/gate generators.** An arrival-rate generator needs a VU pool that covers every arrival in flight (Task 6 §3.2): a lazily allocated VU drops an iteration (INVALID).
    Size pools from the backlog bound, not from the steady rate.

## Environment changes

None planned (Cursor Cloud: `.cursor/environment.json`, `.cursor/Dockerfile`; Claude Code cloud: setup script, `.claude/hooks/session-start.sh`). Repo settings by hand: none. The owner's manual steps are
workflow dispatches (`perf.yml` and `knee.yml` three times each, then `evidence-release.yml` with `tag=p6-phase3` and later `p6-phase4a`).
