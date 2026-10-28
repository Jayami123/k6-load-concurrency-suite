# P6 Phase 4 evidence (CI)

Functional load, not capacity. These runs show that the cases complete under their profiles with their checks passing, and they record the soak, invariant, A/A and A/B gate behaviour. They do not measure how much load the products can take. Knee ranges come from the Phase 4a release (`p6-phase4a`).

The release `p6-phase4` is dispatched with `evidence-release.yml` (tag `p6-phase4`, target SHA of main after the merge of this notes PR, and the run IDs below). Every run linked here is a release input; every plain ID is listed but not released.

## A/A noise and the A/B gate (Task 11, Task 12)

| Run                                           | Event    | Head      | What it proves                                                                                                                   |
| --------------------------------------------- | -------- | --------- | -------------------------------------------------------------------------------------------------------------------------------- |
| [40497029348](../../actions/runs/40497029348) | dispatch | `9640e8b` | A/A day 1: three counted arms per product, VALID PASS (one warm-up arm discarded).                                               |
| [40605925118](../../actions/runs/40605925118) | dispatch | `4db5975` | A/A day 2: three counted arms per product, VALID PASS (one warm-up arm discarded).                                               |
| [40636843578](../../actions/runs/40636843578) | push     | `4884aec` | A/B gate on main: ab-medusa PASS (ratios 1.015 / 1.008 / 0.998, T 10.0 %); ab-cal PASS (ratios 0.998 / 0.985 / 1.025, T 56.3 %). |

The tolerance is committed in PR #128 (`c8bb445`): K = 2, FLOOR = 0.10, pooled over both A/A days. The Cal p95 runner shift between the days is a known issue (PR #130), and the file is not changed for it.

The S24 ref-bump probe, run 40643722351 (`pull_request` on a closed draft probe, not merged), is cited in the closeout as probe evidence. It is not on main, so it is not a release input.

## Soak runs (main)

| Run                                           | Event    | Head      | What it proves                                                                         |
| --------------------------------------------- | -------- | --------- | -------------------------------------------------------------------------------------- |
| [40505035282](../../actions/runs/40505035282) | dispatch | `fead76c` | 30-minute soaks, all three products, VALID PASS.                                       |
| [40455577906](../../actions/runs/40455577906) | dispatch | `a149825` | Medusa 120-minute soak, VALID PASS.                                                    |
| [40373634603](../../actions/runs/40373634603) | dispatch | `93c9185` | Documenso 120-minute soak, VALID PASS.                                                 |
| [40373021384](../../actions/runs/40373021384) | dispatch | `93c9185` | Cal 120-minute soak, VALID PASS; RSS growth (P6-OBS-CAL-005, PRODUCT BUG (SUSPECTED)). |
| [40376751161](../../actions/runs/40376751161) | dispatch | `93c9185` | Documenso 30-minute soak, VALID PASS; RSS growth.                                      |
| [40376505653](../../actions/runs/40376505653) | dispatch | `93c9185` | Cal 30-minute soak, VALID PASS; RSS growth.                                            |
| [40364715443](../../actions/runs/40364715443) | dispatch | `93c9185` | Medusa 30-minute soak, VALID PASS.                                                     |
| [40364720958](../../actions/runs/40364720958) | dispatch | `93c9185` | Documenso 30-minute soak, VALID PASS; RSS growth.                                      |

The calibration numbers and the growth evidence are in `docs/observations/2026-10-27-soak-bounds-not-calibrated.md`. No product is calibrated, so `k6/thresholds/soak-bounds.json` stays empty.

## Invariant runs (main)

| Run                                           | Event    | Cases                  | What it proves                                                                                                                     |
| --------------------------------------------- | -------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| [40498902575](../../actions/runs/40498902575) | dispatch | cal, documenso, medusa | All invariants VALID PASS. Medusa P6-MED-LOAD-009 carries the KNOWN FAIL marker P6-OBS-MED-002 (cancel race, leak 4 of 85 orders). |
| [40465973379](../../actions/runs/40465973379) | dispatch | cal, documenso         | VALID PASS.                                                                                                                        |
| [40469597860](../../actions/runs/40469597860) | schedule | cal, documenso         | VALID PASS.                                                                                                                        |
| [40524237209](../../actions/runs/40524237209) | dispatch | medusa                 | VALID PASS.                                                                                                                        |
| [40526041971](../../actions/runs/40526041971) | dispatch | medusa                 | VALID PASS.                                                                                                                        |

## Earlier-phase runs in this release (from `docs/evidence/pending-release.json`)

| Run                                           | Workflow | What it is                                                 |
| --------------------------------------------- | -------- | ---------------------------------------------------------- |
| [40242002499](../../actions/runs/40242002499) | knee     | Steady baseline band (`k6/thresholds/baseline-band.json`). |
| [40242007346](../../actions/runs/40242007346) | knee     | Steady baseline band.                                      |
| [40242009224](../../actions/runs/40242009224) | knee     | Steady baseline band.                                      |
| [40234172872](../../actions/runs/40234172872) | knee     | Cal knee bound (`k6/thresholds/knee-bounds.json`).         |
| [40235802167](../../actions/runs/40235802167) | knee     | Cal knee bound.                                            |
| [40237156783](../../actions/runs/40237156783) | knee     | Cal knee bound.                                            |

## INVALID runs (listed, not used; not release inputs)

- 40380234236 (Medusa 120-minute soak): outcome FAIL on a cleanup TEST BUG, fixed by #99.
- 40351015461, 40352615775, 40354188739 (Medusa 30-minute soaks): outcome FAIL on a reconcile TEST BUG (stock exhausted), fixed by #93.
- 40508127828, 40508696876, 40511258429 (gate runs with missing PR labels): fixed by #119.
- 40511560394 (gate push on `d9825c9`): failure; cause not re-read.
- 40638763475 (probe PR #132): B arms did not run, fixed by #133.

## Not released

- 40643722351: `pull_request` run on a probe branch, not main (the release workflow accepts main runs only).
- 40526023077: `pages.yml`, which is not in the release workflow's ids.

## Known issues carried

- P6-OBS-CAL-005 and P6-OBS-DOC-007: RSS growth in the soaks. PRODUCT BUG (SUSPECTED).
- P6-OBS-MED-002: cancel race leaves reservations on canceled orders. PRODUCT BUG (SUSPECTED).
- Cal p95 T = 56.3 % from a runner shift between days (PR #130). Proposed PR title: `feat(load): measure the a/a noise as paired within-run ratios`.
- #115 merged with a non-Conventional title (`d7afb2a`); #133 merged as "Merge pull request #133 ..." (`fd5caff`). History is not rewritten.
- The bootstrap can keep an old product checkout on a rerun after a pin bump. Proposed PR title: `fix(bootstrap): check out the pinned ref when the product repo already exists`.
- The Medusa admin seed logs "already exists" on each A/B arm. Proposed PR title: `fix(ci): skip the medusa admin seed when the admin exists`.

## Not met in this release

- P6-RULE-004 is met with a gap: the A/A tolerance and the gate evidence are on main, and the gap is the Cal p95 runner shift (PR #130).
- The upstream drafts for P6-OBS-CAL-005, P6-OBS-DOC-007 and P6-OBS-MED-002 do not exist yet (closeout section 12, item 4).
