# P6 Phase 4 evidence (CI)

Functional load, not capacity. These runs show that the cases complete under their profiles with their checks passing, and they record the soak and invariant behaviour. They do not measure how much load the products can take.

The release `p6-phase4` is not published yet. It is dispatched by the owner with `evidence-release.yml` (tag `p6-phase4`, target SHA of main after this PR, and the run IDs below). Until then these runs exist as Actions artefacts only.

## Soak runs (main)

| Run         | Event    | Head SHA  | What it proves                                                                         |
| ----------- | -------- | --------- | -------------------------------------------------------------------------------------- |
| 40505035282 | dispatch | `fead76c` | 30-minute soaks, all three products, VALID PASS.                                       |
| 40455577906 | dispatch | `a149825` | Medusa 120-minute soak, VALID PASS.                                                    |
| 40373634603 | dispatch | `93c9185` | Documenso 120-minute soak, VALID PASS.                                                 |
| 40373021384 | dispatch | `93c9185` | Cal 120-minute soak, VALID PASS; RSS growth (P6-OBS-CAL-005, PRODUCT BUG (SUSPECTED)). |
| 40376751161 | dispatch | `93c9185` | Documenso 30-minute soak, VALID PASS; RSS growth.                                      |
| 40376505653 | dispatch | `93c9185` | Cal 30-minute soak, VALID PASS; RSS growth.                                            |
| 40364715443 | dispatch | `93c9185` | Medusa 30-minute soak, VALID PASS.                                                     |
| 40364720958 | dispatch | `93c9185` | Documenso 30-minute soak, VALID PASS; RSS growth.                                      |

The calibration numbers and the growth evidence are in `docs/observations/2026-10-27-soak-bounds-not-calibrated.md`. No product is calibrated, so `k6/thresholds/soak-bounds.json` stays empty.

## Invariant runs (main)

| Run         | Event    | Cases                  | What it proves                                                                                                                     |
| ----------- | -------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 40498902575 | dispatch | cal, documenso, medusa | All invariants VALID PASS. Medusa P6-MED-LOAD-009 carries the KNOWN FAIL marker P6-OBS-MED-002 (cancel race, leak 4 of 85 orders). |
| 40465973379 | dispatch | cal, documenso         | VALID PASS.                                                                                                                        |
| 40469597860 | schedule | cal, documenso         | VALID PASS.                                                                                                                        |
| 40524237209 | dispatch | medusa                 | VALID PASS.                                                                                                                        |
| 40526041971 | dispatch | medusa                 | VALID PASS.                                                                                                                        |

## INVALID runs (listed, not used)

- 40380234236 (Medusa 120-minute soak): outcome FAIL on a cleanup TEST BUG, fixed by #99.
- 40351015461, 40352615775, 40354188739 (Medusa 30-minute soaks): outcome FAIL on a reconcile TEST BUG (stock exhausted), fixed by #93.

## Known issues carried

- P6-OBS-CAL-005 and P6-OBS-DOC-007: RSS growth in the soaks. PRODUCT BUG (SUSPECTED).
- P6-OBS-MED-002: cancel race leaves reservations on canceled orders. PRODUCT BUG (SUSPECTED).
- #115 merged with a non-Conventional title (`d7afb2a`).

## Not met in this release

- P6-RULE-004 (A/A noise and the A/B gate): the tolerance and the gate evidence come from the parallel session and are not on main yet.
- Pending runs from earlier phases (`docs/evidence/pending-release.json`) are included in the owner's run IDs for this release.
