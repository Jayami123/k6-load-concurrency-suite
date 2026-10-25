# P6 Phase 3 evidence (CI)

Functional load, not capacity. These runs show that each product LOAD case completes under its profile with its checks
passing. They do not measure how much load the products can take.

One zip per CI run. Each zip holds the `*.json`, `*.log`, `*.csv`, `*.html` and `*.txt` files of that run's artefacts.
`SHA256SUMS.txt` lists the checksums. The release does not expire; the Actions artefacts do (14 days).

## The runs

All three are `perf.yml` runs on `main` at `0b07594`, the merge of PR #64 (telemetry and median tooling).

| Run                                                                                                    | Event    | Head SHA  | What it proves                                                                                       |
| ------------------------------------------------------------------------------------------------------ | -------- | --------- | ---------------------------------------------------------------------------------------------------- |
| [40177412186](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40177412186) (run 1) | dispatch | `0b07594` | All 14 jobs green. All 10 product LOAD cases PASS and VALID, one attempt each.                       |
| [40178773022](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40178773022) (run 2) | dispatch | `0b07594` | All 14 jobs green. All 10 product LOAD cases PASS and VALID, with the three deviations listed below. |
| [40180625279](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40180625279) (run 3) | dispatch | `0b07594` | All 14 jobs green. All 10 product LOAD cases PASS and VALID, one attempt each.                       |

The LOAD cases are `P6-CAL-LOAD-001`, `-007`, `-009`; `P6-MED-LOAD-001`, `-002`, `-006`; `P6-DOC-LOAD-001`, `-002`, `-007`,
`-008`.

## Deviations, stated as they happened

1. **`P6-MED-LOAD-006`, run 2.** The first attempt in run 2 (`20261025T090121Z-c53f65ef`) FAILED with a TEST BUG: the storm
   check found 3 of 30 first attempts timing out, below the 50% needed. The second attempt in the same run
   (`20261025T092304Z-08a0cfda`) PASSED and is VALID. The owner decided to count run 2 for this case on the second attempt.
   This bends the rule that a run with a FAIL for a case is not used for that case. The storm is not reliable at this
   timeout setting; it is a known issue below.
2. **`P6-MED-LOAD-001`, run 2.** The case ran twice in run 2. Both attempts PASSED and are VALID. The baseline uses the
   first attempt (`20261025T090007Z-e68d9e61`), since two verdicts with one run id cannot share a baseline entry. The second
   attempt (`20261025T092142Z-22bb534c`) is not used.
3. **`P6-MED-LOAD-002`, run 2.** Also ran twice in run 2. Both attempts PASSED and are VALID. The first attempt
   (`20261025T090045Z-d8fe1494`) is used, as for `P6-MED-LOAD-001`. The second attempt (`20261025T092225Z-e2fb92fc`) is not
   used. This deviation was missed when the notes were first written and is recorded here.

## Smoke baseline

`k6/thresholds/smoke-p95.json` records the median p95 of the three runs for each journey case. Environment for all three:
`ubuntu24 20261023.334.3, 4 vCPU`.

| Case            | Median p95 (ms) | Runs used                             |
| --------------- | --------------- | ------------------------------------- |
| P6-CAL-LOAD-001 | 77.12           | 40177412186, 40178773022, 40180625279 |
| P6-MED-LOAD-001 | 171.60          | 40177412186, 40178773022, 40180625279 |
| P6-DOC-LOAD-001 | 233.13          | 40177412186, 40178773022, 40180625279 |

## Known issues carried into phase 4

- **P6-CAL-LOAD-009 (Cal link usage).** The Cal private-link usage mismatch from Task 10 stays a known issue with its
  diagnostics. It did not recur in these three runs; the audit artefact is kept when it does.
- **P6-DOC-LOAD-007 (Documenso double seal), `P6-OBS-DOC-005`.** The duplicate seal and completion row is a declared known
  bug. The case gate counts it as observed and fails on any other violation.
- **P6-OBS-DOC-006 (Documenso reset-password).** An unknown token returns HTTP 500. Suspected to share the root cause of
  `P6-OBS-DOC-001`, on a different route. Not confirmed.
- **P6-MED-LOAD-006 (storm).** The retry storm did not reach its threshold on the first attempt of run 2. The case needs a
  fix of its own before its storm can be relied on.
- **Cal two-slot bug.** The Cal journey's two-slot bug was fixed later by the Task 2 fixed-slot mode. Listed for the record.
- **cal-smoke step cap.** The step-cap total of the `cal-smoke` job is larger than its job timeout. Fixing this is a
  follow-up PR of its own.
