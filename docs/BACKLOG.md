# Backlog

Open items that a task or the owner deferred. Each line names where it came from and what "done" means.

## Medusa

- **F-M2 as a stable expected failure** (from the Task 3 plan, D70, labelled PRODUCT BUG 2026-10-23). A losing
  checkout returns 400 but leaves an unpaid order that carries the promotion, so live orders exceed the promotion's
  limit (`P6-MED-RACE-012`: 32 of 150 trials; `P6-MED-RACE-005`: 1 of 150) in the full-count runs
  [39843267008](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39843267008),
  [39845815035](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39845815035) and
  [39848223959](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39848223959). Today it is a
  labelled `product-bug` annotation only. The owner's decision (D70) used the pooled rate, 33 of 300 trials (11 %): a
  PR run would need about 40 trials at that point rate (56 by the Task 3 D65 formula, which uses the lower end of the
  95 % Wilson interval). Taken alone, `-012` shows F-M2 in 32 of 150 trials (21 %): 20 trials at the point rate, **28**
  by the D65 formula: 28 + 1 warm-up + 6 reruns allowed = 35 attempts, about 5 to 5.5 min on CI at the measured 8.3 to 9.5 s per `-012` trial (dispatch runs above). **Done
  when** `-012` (or a dedicated spec) asserts F-M2 under `test.fail()` without random PR failures, with the PR count and
  its arithmetic in the plan, and the owner agrees to the PR-time cost.

## Cal

Merged in [#39](https://github.com/Jayami123/k6-load-concurrency-suite/pull/39) as `0728ebe`; first `main` full-count run [39948384170](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39948384170) `success`.

- **F-C1, PRODUCT BUG (owner label 2026-10-23, O6).** A private link with `maxUsageCount` N admits every parallel
  booking, not N: `P6-CAL-RACE-006` (N=1) and `-008` (N=3). Evidence: 150 of 150 attempts across the full-count runs
  [39932990882](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39932990882),
  [39935674101](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39935674101) and
  [39938126238](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39938126238). Today it is a known-bug
  test under `test.fail()` in each spec. **Done when** a product fix ships, the known-bug tests turn red, and the
  `test.fail()` and the label are removed in the same change.
- **F-C2, PRODUCT BUG (owner label 2026-10-23, O6).** Confirm and cancel on one PENDING booking both succeed; the booking
  ends accepted and both side effects fire: `P6-CAL-RACE-007`. Same evidence runs and the same removal rule.
- **F-C3, PRODUCT BUG (owner label 2026-10-23, O6).** Two confirms on one PENDING booking both succeed and two
  `BOOKING_CREATED` webhooks fire: `P6-CAL-RACE-009`. Same evidence runs and the same removal rule.
- **Run 121 (docs branch, PR, `1bd71e4`) red: an unmapped Medusa extra, not labelled.** `med-race-001` extra `S=1 vs N=2`
  oversold once (2 orders for 1 unit) in its 3-trial run; a leftover-order leak line was also reported. It passed in every
  later run. Owner decision: label it or leave it as an observation. Plan closeout records the evidence.
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
- **Yarn crash (watch item).** The same job had a one-off Yarn "unexpected empty event loop" exit 42. A re-run fixed it.
  **Done when** no repeat is seen by the Phase 2 closeout, or it gets its own item if it repeats.

## Twenty

- **P6-OBS-TW-001, PRODUCT BUG (owner label, 2026-10-23, Task 7 plan §3.9).** `POST /metadata` and `POST /graphql` with an
  empty body or an empty JSON object `{}` get no response on any run: 12 of 12 hangs in the Task 7 repro (3 runs each, 30 s
  client timeout, `curl` exit 28 at 30.0 s, TTFB none), and Task 6 §3.5 saw the same in three sessions. `{"foo":1}` gets a
  400 in 4 to 9 ms and a valid query a 200 in 5 to 12 ms, both in the same runs. The server log has no line for the hang.
  **Test:** `tests/twenty/tw-obs/` (follow-up X8): 8 hang tests under `test.fail()` after the guards and 2 resource tests, run by the `twenty-obs` job.
  **Update 2026-10-24 (X8 probe on the pinned image, plan `docs/plans/2026-10-24-p6-x8-twenty-empty-body.md` §3):** the same requests without `Authorization` hang
  identically (12 of 12; owner-confirmed as the same PRODUCT BUG with a wider precondition). **Unauthenticated clients can hold sockets open indefinitely: 0 of 20 closed after 400 s, past
  Node's 300 s `requestTimeout`** (the same 0 of 20 with a signed-in session). Valid queries still answer in 3.9 to 32.2 ms with 20 hung requests held, and the server log has no line for any hang.
- **P6-TW-RACE-004, PRODUCT BUG (owner label, 2026-10-23, Task 7 plan §3.7 and §6.10).** Ten parallel redemptions of one
  reset token all succeed: 50 of 50 requests in the probe (5 trials), with a check-then-act window in
  `updatePasswordViaResetToken` (validate, update, revoke; no lock). The spec asserts the guards, then `test.fail()`, then
  exactly one success per trial. A fix turns that test red as "unexpectedly passed".
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
