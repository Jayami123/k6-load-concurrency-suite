# P6 Phase 1 evidence (CI)

One zip per CI run. Each zip holds the `*.json` and `*.log` files of that run's artefacts. `SHA256SUMS.txt` lists the
checksums. The release does not expire; the Actions artefacts do (14 days).

| Run                                                                                                    | Event    | Head SHA  | What it proves                                                                                                                 |
| ------------------------------------------------------------------------------------------------------ | -------- | --------- | ------------------------------------------------------------------------------------------------------------------------------ |
| [39429276298](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39429276298)         | push     | `98b1c82` | Cal self-test only                                                                                                             |
| [39434721131](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39434721131)         | push     | `c3183d2` | `P6-CAL-RACE-001` (50)                                                                                                         |
| [39449102426](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39449102426)         | push     | `6d73fd3` | `P6-CAL-RACE-001` (50), `P6-CAL-RACE-003` (30)                                                                                 |
| [39484324139](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39484324139)         | push     | `3c6b7c6` | `P6-CAL-RACE-001` (50), `P6-CAL-RACE-003` (30), Documenso self-test (3)                                                        |
| [39561220290](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39561220290)         | push     | `0f8bf23` | Medusa (3 trials), Cal 001 (50) and 003 (30), Documenso 001 and 002 (50), control (5)                                          |
| [39563393657](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39563393657)         | schedule | `0f8bf23` | the same cases as `39561220290` (nightly)                                                                                      |
| [39577832657](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39577832657) (run A) | push     | `4aecc2d` | Medusa `P6-MED-RACE-001` (50), Cal 001 (50) and 003 (30), Documenso 001 and 002 (50), control (5). First full-count Medusa run |
| [39580025937](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39580025937) (run B) | dispatch | `4aecc2d` | The same full-count cases as run A                                                                                             |

**Run A replaces `39569437056`.** 39569437056 failed in cal-smoke at 'extra (unmapped): sequential overlapping booking is
refused' (trial 3). The guard labelled it PRODUCT BUG; root cause was a TEST BUG (seed-data collision), fixed in
[PR #18](https://github.com/Jayami123/k6-load-concurrency-suite/pull/18).

The allocator treats any booking that is not cancelled or rejected (including PENDING) as busy, so it skipped windows over
pending seed bookings (see skippedWindowEvidence in runs A and B).
