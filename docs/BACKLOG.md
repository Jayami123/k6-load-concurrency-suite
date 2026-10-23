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
