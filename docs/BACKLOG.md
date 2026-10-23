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

- **F-C1 as a stable expected failure** (from the Task 4 plan, owner O6; SUSPECTED). A private link with `maxUsageCount` N
  admits every parallel booking, not N: `P6-CAL-RACE-006` (N=1) and `-008` (N=3) in the step-4 local runs and the probe.
  **Done when** 3 full-count CI runs of `cal-state-races` reproduce it, the owner labels `F-C1` as PRODUCT BUG, and
  `labelled: ["F-C1"]` (or a `test.fail()` on the guard line) is added to both specs. The arithmetic and the run links go
  into the plan's closeout.
- **F-C2 as a stable expected failure** (SUSPECTED). Confirm ‖ cancel on a PENDING booking ends accepted with both
  `BOOKING_CREATED` and `BOOKING_CANCELLED` delivered: `P6-CAL-RACE-007`. **Done when** the same three-run evidence and an
  owner label exist, and the spec labels `F-C2`.
- **F-C3 as a stable expected failure** (SUSPECTED). Confirm ‖ confirm on a PENDING booking delivers two
  `BOOKING_CREATED` webhooks: `P6-CAL-RACE-009`. **Done when** the same evidence and label exist, and the spec labels `F-C3`.
- **Cal email capture** (harness follow-up H-email, plan D9). The `P6-CAL-RACE-007` email half cannot be asserted until a
  mail catcher runs in `docker/cal.compose.yml`. Not in P6 without a harness change.
- **Heap default under `NODE_OPTIONS`** (harness follow-up H-heap, plan §3.1.1). The Cal adapter applies its heap default
  only when `NODE_OPTIONS` is unset, so a sandbox that sets `--use-openssl-ca` loses it and `up:cal` runs out of memory.
- **`cal-smoke` worst-case margin** (plan O10). At the 40-minute `up` cap the job's worst case is 57 min against 60. A 30-min
  cap would give 47 min. Owner decision.
