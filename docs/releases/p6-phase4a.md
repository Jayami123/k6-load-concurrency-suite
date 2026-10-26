# P6 Phase 4a evidence (CI)

Knee ranges, steady baselines and spike recovery, measured in CI. These runs show where each product's functional load ends
under the knee method, how the steady runs sit against their bands, and how each spike recovers. A knee range is the rate
band where the stop rule fired on these runners, nothing more.

One zip per product and mode. Each zip holds the `*.json`, `*.log`, `*.csv`, `*.html` and `*.txt` files of its run.
The release does not expire; the Actions artefacts do (90 days for `knee.yml`).

## The runs

All nine are `knee.yml` dispatches on `main` at `efc2f7b`, the merge of PR #85. Each run's conclusion is `success`.

### Knee (mode `knee`)

| Run | Run id                                                                                         | Artefacts (cal / medusa / documenso)    | Cases and verdicts                                                        |
| --- | ---------------------------------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------- |
| 1   | [40290101719](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40290101719) | 12636607102 / 12636096662 / 12635478325 | `P6-CAL-LOAD-005` VALID, `P6-MED-LOAD-004` VALID, `P6-DOC-LOAD-005` VALID |
| 2   | [40291101493](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40291101493) | 12635834280 / 12635742869 / 12635664194 | `P6-CAL-LOAD-005` VALID, `P6-MED-LOAD-004` VALID, `P6-DOC-LOAD-005` VALID |
| 3   | [40291950598](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40291950598) | 12635799485 / 12636755867 / 12635634453 | `P6-CAL-LOAD-005` VALID, `P6-MED-LOAD-004` VALID, `P6-DOC-LOAD-005` VALID |

### Spike (mode `spike`)

| Run | Run id                                                                                         | Artefacts (cal / medusa / limiter-documenso) | Cases and verdicts                                                                                                   |
| --- | ---------------------------------------------------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 1   | [40293082174](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40293082174) | 12636838181 / 12637945276 / 12637182803      | `P6-CAL-LOAD-004`, `P6-MED-LOAD-003` (with `P6-MED-LOAD-010`), `P6-DOC-LOAD-004`, `P6-DOC-LOAD-009`: all VALID, PASS |
| 2   | [40294541228](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40294541228) | 12637504397 / 12637549089 / 12637873334      | same four cases plus `P6-MED-LOAD-010`: all VALID, PASS                                                              |
| 3   | [40295754821](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40295754821) | 12638326923 / 12638356745 / 12639185270      | same four cases plus `P6-MED-LOAD-010`: all VALID, PASS                                                              |

### Steady (mode `steady`)

| Run | Run id                                                                                         | Artefacts (cal / medusa)  | Cases and verdicts                                           |
| --- | ---------------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------ |
| 1   | [40296658253](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40296658253) | 12638637357 / 12638632096 | `P6-CAL-LOAD-003` VALID, PASS; `P6-MED-LOAD-002` VALID, PASS |
| 2   | [40296661816](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40296661816) | 12638776649 / 12638168167 | `P6-CAL-LOAD-003` VALID, PASS; `P6-MED-LOAD-002` VALID, PASS |
| 3   | [40296665884](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40296665884) | 12639265523 / 12638811929 | `P6-CAL-LOAD-003` VALID, PASS; `P6-MED-LOAD-002` VALID, PASS |

## Knee ranges

Range in iterations per second, from the knee report of each run (`P6-CAL-LOAD-005`, `P6-MED-LOAD-004`, `P6-DOC-LOAD-005`).

| Product   | Run 1    | Run 2    | Run 3    | Committed bound (`k6/thresholds/knee-bounds.json`) |
| --------- | -------- | -------- | -------- | -------------------------------------------------- |
| Cal       | 8 to 10  | 8 to 10  | 12 to 14 | lower 8, upper 14                                  |
| Medusa    | 1.5 to 2 | 1.5 to 2 | 1.5 to 2 | lower 1.5, upper 2.5                               |
| Documenso | 4 to 5   | 4 to 5   | 4 to 5   | not committed                                      |

All three new knee runs fall inside the committed bounds. The Cal lower step moved from 8 to 12 across runs, so the
8 per second bound is the smallest value seen, not a stable point. The Documenso range has no committed bound in this release.

## Steady baselines

p95 in milliseconds, from each run's verdict. Band from `k6/thresholds/baseline-band.json` (min to max of its three runs).

| Case                                      | Run 1 | Run 2 | Run 3 | Band p95 (min to max) |
| ----------------------------------------- | ----- | ----- | ----- | --------------------- |
| `P6-CAL-LOAD-003` (4 per second, 120 s)   | 92.7  | 81.4  | 60.9  | 54.1 to 82.6          |
| `P6-MED-LOAD-002` (0.7 per second, 120 s) | 236.3 | 242.7 | 236.4 | 214.5 to 220.8        |

Every steady run is VALID, with no dropped iterations and no telemetry gaps. Two observations, not failures:

- `P6-CAL-LOAD-003` run 1 (92.7 ms) is above the band maximum (82.6 ms) by about 12 %. Runs 2 and 3 sit inside the band.
- `P6-MED-LOAD-002` is above the band maximum (220.8 ms) in all three runs, by 7 to 10 %. The band was measured on runs
  `40242002499`, `40242007346` and `40242009224`. The three new runs agree with each other, so this is a shift of the
  runner's level, not one bad run. The band is not changed in this release; a later release may re-measure it.

## Spike and recovery

Recovery in seconds, from each run's spike report. Every case verdict is PASS and VALID.

| Case                                           | Run 1                           | Run 2 | Run 3 |
| ---------------------------------------------- | ------------------------------- | ----- | ----- |
| `P6-CAL-LOAD-004` (spike to 150 % of the knee) | 48                              | 28    | 28    |
| `P6-MED-LOAD-003` (spike to 150 % of the knee) | 58                              | 38    | 58    |
| `P6-DOC-LOAD-004` (limiter profile)            | not reached in the watch period | 140   | 169   |

`P6-DOC-LOAD-009` (limiter contract: every 429 has a body and headers, on covered routes only) is PASS and VALID in all three
runs. It was checked against the limiter's own refusal shape, with no 429 lacking a body.

`P6-MED-LOAD-010` (abandoned carts, judged inside each `P6-MED-LOAD-003` run) is PASS in all three runs. Each run reports
49 abandoned carts and 148 orders. The three runs have different run ids and the same counts, which is worth checking when
the next Medusa spike runs. It is recorded as an observation.

The `P6-DOC-LOAD-004` run 1 recovery is "not reached in the watch period" and the case still returns PASS and VALID. The
other two runs recover in 140 s and 169 s. Its verdict is as the case defines it; no threshold was changed.

## Limitations

- **Fast stop, zero post-trim samples.** In `P6-CAL-LOAD-005` run 1 the stop step has no telemetry sample after the 2 s edge
  trim. The knee report records this as a limitation (`src/load/knee/knee-report.ts`), and the range rests on the steps before
  the stop.
- **First saturated resource before the stop.** In 7 of the 9 knee runs the first saturated resource comes from a step before
  the stop step. Each report records this as a limitation; it is not hidden. The Cal runs 2 and 3 have no such note.
- **Low-sample stop.** A stop that rests on fewer requests than the minimum is flagged `lowSampleStop` in the knee report
  (`src/load/knee/stage.ts`, `src/load/knee/stop-rule.ts`). All nine knee reports have it false.
- **Spike start alignment.** The Documenso spike starts on a minute boundary. The guard tolerates 5 s
  (`ALIGN_TOLERANCE_MS = 5000`, `src/load/spike/stage.ts`); a start further away is a TEST BUG, not a pass. No run in this
  release tripped it, and every Documenso spike verdict is VALID.
- **Harness state persistence.** The harness writes per-product state under `results/harness`: a process-group file
  (`<product>.pgid`) and the start-up log. `down` reads the process-group file to stop the products the harness started.
- **Cal lower step.** The Cal knee range is not stable across runs (8, 8, 12). The bound is the smallest value, and the
  steady rate is half of it.
- **Documenso bound.** `knee-bounds.json` has no Documenso entry in this release, so the Documenso knee range is recorded
  but not bounded.
- **What a knee range is.** The knee range is the rate band where the stop rule fired on these runners in these runs. It is
  not a limit a product can be promised on other hardware.

## Related

- Phase 4a plans: `docs/plans/2026-10-25-p6-phase4a-plans-index.md`.
- Phase 3 evidence, for comparison: `docs/releases/p6-phase3.md`.
- Open item for the next spike: the `P6-CAL-LOAD-010` abandoned-cart case, which stays in "Later" (see `docs/BACKLOG.md`).
