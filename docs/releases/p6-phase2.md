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
