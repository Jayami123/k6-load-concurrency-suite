# Backlog

Open items that a task or the owner deferred. Each line names where it came from and what "done" means.

## Medusa

- **F-M2: no stable expected failure (owner decision 2026-10-23, Phase 2 closeout, plan 6e).** F-M2 stays a PRODUCT BUG
  (D70) with a labelled `product-bug` annotation only. A losing checkout returns 400 but leaves an unpaid order that carries
  the promotion. Green full-count `main` runs (Task 9 plan §2.6): `-012` 209 of 1050 attempts (19.9 %; Wilson lower end 17.6 %,
  so the D65 formula gives 24 PR trials), `-005` 12 of 1051. The rate is not steady: 0 to 21 of 50 per run, and one whole
  50-trial run showed none. Over every window of consecutive attempts, a 28-trial PR run misses F-M2 in 64 of 483 windows
  (13.3 %), 35 trials in 10.7 %, and a full 50-trial run in 1 of 21 runs. A `test.fail()` would turn about one PR run in seven
  red at random. **Done when** a deterministic trigger exists without a fork change, or the owner accepts random reds.
- **F-M4, PRODUCT BUG (owner label 2026-10-23, medium).** Ten parallel cancels of one captured order: the payment holds one
  refund, but `order_summary.totals.refunded_total` is twice the refund rows (`P6-MED-RACE-014`). 684 of 953 attempts in 19
  green full-count `main` runs, 31 to 43 of 50 in each, including runs A [40037355173](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40037355173) and B [40039351021](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40039351021). Today a `product-bug` annotation. **Done when** a
  follow-up PR adds the `test.fail()` in `-014` with 5 PR trials (D65 gives 4; the measured miss is 0.9 % at 4 and 0.3 % at 5).
- **F-M5, SUSPECTED (owner decision 2026-10-23: same mechanism as F-M2).** An order of a `-001` attempt that no checkout
  returned. PRs #37 and #38 sweep it and annotate it. 0 orphan lines in the 13 green `main` runs since PR #38. The sweep and
  the annotation stay. **Done when** F-M2 is fixed upstream (then both close together).
- **`medusa-smoke` race step against its stop rule (owner decision 2026-10-23).** Estimated worst case 24.1 min (slowest
  measured 19.9 min in run [39961527451](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39961527451), plus a 4.2-minute allowance for every case using its whole invalid
  budget) against the 24.0-minute stop rule (80 % of the 30-minute step timeout). No trial or timeout change now.
  **Done when** it is re-measured in Phase 3 after the harness pin bump and the estimate is under the stop rule. The fix is
  less per-trial time or fewer trials, never a higher timeout.
- **`-009` PR trials 13 → 20 (follow-up).** The later `main` runs show X05 or F-M3 in 299 of 900 attempts, but as few as 6 of 50
  in one run, so 13 PR trials miss them in 2.3 % of measured windows (D69 aimed at under 1 %); 20 trials miss in 0.9 %.
  **Done when** a PR raises the count after a `medusa-smoke` PR budget recheck.
- **Known-bug visibility (follow-up).** The `-008`, `-009` and four Cal state known-bug tests carry no `issue` annotation, so
  the job summary does not list them; `cal-state-races` has no job summary step. **Done when** each known-bug test has an
  `issue` annotation that starts with its ID and every job with known-bug tests prints a summary.

## Cal

Merged in [#39](https://github.com/Jayami123/k6-load-concurrency-suite/pull/39) as `0728ebe`; first `main` full-count run [39948384170](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39948384170) `success`.

- **F-C1, PRODUCT BUG (owner label 2026-10-23, O6).** A private link with `maxUsageCount` N admits every parallel
  booking, not N: `P6-CAL-RACE-006` (N=1) and `-008` (N=3). Evidence: 150 of 150 attempts across the full-count runs
  [39932990882](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39932990882),
  [39935674101](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39935674101) and
  [39938126238](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39938126238). Today it is a known-bug
  test under `test.fail()` in each spec. **Done when** a product fix ships, the known-bug tests turn red, and the
  `test.fail()` and the label are removed in the same change. Upstream: the existing issue
  [calcom/cal.diy#29815](https://github.com/calcom/cal.diy/issues/29815); the Task 9 plan (Appendix C1) drafts a comment with the
  concurrent evidence for the owner to post. `main`: 600 of 600 attempts in 12 green runs.
- **F-C2, PRODUCT BUG (owner label 2026-10-23, O6).** Confirm and cancel on one PENDING booking both succeed; the booking
  ends accepted and both side effects fire: `P6-CAL-RACE-007`. Same evidence runs and the same removal rule.
- **F-C3, PRODUCT BUG (owner label 2026-10-23, O6).** Two confirms on one PENDING booking both succeed and two
  `BOOKING_CREATED` webhooks fire: `P6-CAL-RACE-009`. Same evidence runs and the same removal rule.
- **Run 121: observation, no label (owner decision 2026-10-23). Closed.** Run 121 is
  [39926614996](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39926614996) (PR, `1bd71e4`). The
  `med-race-001` extra `S=1 vs N=2` oversold once (2 orders for 1 unit) in the untimed warm-up burst (`[warmup 1]`), not in a
  counted trial. The losing request's 400 was "Updating Status from \"ok\" to \"temp_failure\" is not allowed.", F-M2's
  ghost-order signature; the leak line was that order. Since then 0 oversold in 1200 `-001` and 72 `extra-s1-n2` trials in
  green `main` runs. Recorded under F-M5.
- **Cal email capture** (harness follow-up H-email, plan D9). The `P6-CAL-RACE-007` email half cannot be asserted until a
  mail catcher runs in `docker/cal.compose.yml`. Not in P6 without a harness change.
- **Heap default under `NODE_OPTIONS`** (harness follow-up H-heap, plan §3.1.1). The Cal adapter applies its heap default
  only when `NODE_OPTIONS` is unset, so a sandbox that sets `--use-openssl-ca` loses it and `up:cal` runs out of memory.
- **X7 (harness bug): `down:cal || true` hides a crash.** Both Stop Cal steps (`cal-smoke`, `cal-state-races`) run
  `npm run down:cal || true`. The harness `loadConfig` (via `adapters/registry` `getAdapter`) resolves every product root
  eagerly, so `down:cal` fails with "Error: Documenso product root does not exist" when Documenso is not checked out.
  Evidence: run [39994702506](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39994702506) (PR #46), job
  [120555085199](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39994702506/job/120555085199). Fix: a
  harness patch that resolves only the requested product, with a unit test; then P6 bumps the pin and removes `|| true`
  (keep `if: always()`). No P6 workaround. **Done when** both are merged.
- **Yarn crash (watch item): closed (owner decision 2026-10-23).** The one-off Yarn "unexpected empty event loop" exit 42
  (job 120555085199, PR #46) did not repeat: 0 matches in 170 `main` job logs (runs A and B included) and 32 Cal job logs of
  the 14 PR runs since then.
- **P6-CAL-LOAD-010, Later (Phase 4 Task 6 §6.7, Phase 4a release).** The Cal abandoned-cart judgement needs the journey to
  call `reserveSlot`. Gate evidence: `reserveSlotGate` in `src/load/gates/cal-hold.ts` returns `passes: false`, because no file
  under `k6/` calls `reserveSlot`; the Cal journey calls `getSchedule` and `POST /api/book/event` only. The case stays out of
  the knee and spike runs. **Done when** a Cal journey calls `reserveSlot` and the gate passes, then the case is planned in its
  own PR.

## Twenty

- **P6-OBS-TW-001, PRODUCT BUG (owner label, 2026-10-23, Task 7 plan §3.9).** `POST /metadata` and `POST /graphql` with an
  empty body or an empty JSON object `{}` get no response on any run: 12 of 12 hangs in the Task 7 repro (3 runs each, 30 s
  client timeout, `curl` exit 28 at 30.0 s, TTFB none), and Task 6 §3.5 saw the same in three sessions. `{"foo":1}` gets a
  400 in 4 to 9 ms and a valid query a 200 in 5 to 12 ms, both in the same runs. The server log has no line for the hang.
  **Test:** `tests/twenty/tw-obs/` (follow-up X8): 8 hang tests under `test.fail()` after the guards and 2 resource tests, run by the `twenty-obs` job.
  **Update 2026-10-24 (X8 probe on the pinned image, plan `docs/plans/2026-10-24-p6-x8-twenty-empty-body.md` §3):** the same requests without `Authorization` hang
  identically (12 of 12; owner-confirmed as the same PRODUCT BUG with a wider precondition). **Unauthenticated clients can hold sockets open indefinitely: 0 of 20 closed after 400 s, past
  Node's 300 s `requestTimeout`** (the same 0 of 20 with a signed-in session). Valid queries still answer in 3.9 to 32.2 ms with 20 hung requests held, and the server log has no line for any hang.
  **Update 2026-10-23 (Phase 2 closeout):** 8 of 8 hang tests expected failures in runs A [40037355173](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40037355173) and B [40039351021](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40039351021). Upstream: not filed
  publicly; the Task 9 plan (Appendix D2) drafts a private email for the owner to send, per Twenty's security policy.
- **P6-TW-RACE-004, PRODUCT BUG (owner label, 2026-10-23, Task 7 plan §3.7 and §6.10).** Ten parallel redemptions of one
  reset token all succeed: 50 of 50 requests in the probe (5 trials), with a check-then-act window in
  `updatePasswordViaResetToken` (validate, update, revoke; no lock). The spec asserts the guards, then `test.fail()`, then
  exactly one success per trial. A fix turns that test red as "unexpectedly passed". `main`: 250 of 250 attempts
  with more than one success, including runs A [40037355173](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40037355173) and B [40039351021](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40039351021). Upstream: not filed publicly; Twenty's security policy asks for a private
  report, so the Task 9 plan (Appendix D1) drafts an email to Twenty's security contact for the owner to send.
- **X8 done in [PR #50](https://github.com/Jayami123/k6-load-concurrency-suite/pull/50)** (follow-up from Task 7 §12.2; job `twenty-obs`). A P6 spec for P6-OBS-TW-001 with three parts:
  (a) guards: a valid query returns 200 and `{"foo":1}` returns 400, both under 1 s; (b) then `test.fail()` and expect an empty body and `{}` to get a 4xx (owner: any
  4xx) within a 5-second client timeout, never 30 s; (c) the same requests without auth (they hang too, so they are tests under the same pattern), and a P6-style check
  that N=10 parallel empty-body requests do not stop a valid request from answering. Plan: `docs/plans/2026-10-24-p6-x8-twenty-empty-body.md`. **Done when** the spec is merged and CI runs it.
- **H-twenty-auth (harness follow-up).** The harness `authenticate()` (v0.2.12) returns the workspace-agnostic token when
  signIn gives one, and that token cannot read data (500 "No data sources found" on REST). P6 works around it in
  `src/twenty/auth.ts`. **Done when** the harness returns a workspace token for data calls, and P6 can use the adapter's
  `authenticate()` directly.
- **X1 digest pin for the Twenty images (proposed in the Task 6 plan §12; a harness change).** Pin `twentycrm/twenty`,
  `postgres`, `redis` and `axllent/mailpit` by digest (the Twenty digest is in plan §3.9). **Done when** the harness overlay
  uses digests.
- **X5 pull retry for the other jobs: done in [PR #45](https://github.com/Jayami123/k6-load-concurrency-suite/pull/45).** Every product job pulls its images with 3 tries (100 s per try, 15 s then 30 s backoff, 6-minute step cap) before harness up. Plan: `docs/plans/2026-10-23-p6-x5-pull-retry.md`.
- **X6 one token scanner (proposed in the Task 6 plan §12).** Make `scripts/evidence-token-scan.mjs` value-only, so one scanner
  serves every job. **Done when** the owner accepts it.
- **Twenty histogram verdict (follow-up, TEST BUG in reporting).** `runTwentyTrials` (`src/twenty/run-case.ts`) never sets
  `verdict`, so every `P6-TW-RACE-*` histogram keeps the default `"fail"` and the job summary prints "Failed: see the job log" in
  green jobs. The tests read the trials, so no result is wrong. **Done when** the runner sets `verdict` like the Medusa and Cal
  runners, with a unit test.
- **`twenty-obs` artefacts (follow-up).** The job uploads only its container log, so the `P6-OBS-TW-001` results live only in
  the job log. **Done when** it uploads the Playwright `{suites, errors}` JSON after the token scan.

## Documenso

- **P6-OBS-DOC-003, finding (low; owner decision 2026-10-23).** A sign-in validation 400 (`POST
/api/auth/email-password/authorize` with a missing `csrfToken` or a password under 6 characters) echoes the submitted
  password and CSRF value back in its body (`sValidator` without a hook, `email-password.ts` L66; unchanged at upstream
  `8707e33c`). The echo goes only to the sender; the risk is logs that store response bodies. No test, no public issue; the
  Task 9 plan (Appendix F) holds a private-advisory draft for the owner. **Done when** the owner decides whether to send it.

## Phase 3 carry-over (2026-10-25 closeout)

- **P6-MED-LOAD-006 storm TEST BUG.** The first attempt in run 40178773022 found 3 of 30 first attempts timing out, below the
  50% the storm judge needs. Done when the storm reaches its threshold reliably, in a PR of its own, with no judge weakened.
- **P6-OBS-DOC-006 (suspected).** Documenso reset-password with an unknown token returns HTTP 500, probably the same root cause
  as `P6-OBS-DOC-001`. Done when the root cause is confirmed or ruled out and a draft exists.
- **Upstream drafts.** Drafts for the Cal link-usage mismatch and the Documenso double seal are in `docs/upstream/`. Done when the
  owner files them or decides not to.
