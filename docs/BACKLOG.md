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
