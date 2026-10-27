# Soak bounds: no product calibrated (S17, D5)

Date: 2026-10-27. Task 7 (soaks), step S17. The bounds file `k6/thresholds/soak-bounds.json` is committed empty, so every soak verdict reports NO THRESHOLD YET. No growth is absorbed into a bound.

## The calibration guard (D5)

A product is calibrated only when its 30-minute soaks are VALID and show no RSS growth (positive Theil-Sen slope and a plateau). The 30-min runs recorded in the build log:

| Product   | Runs                                                                 | RSS growth (Theil-Sen, MB/min)     | Calibrated |
| --------- | -------------------------------------------------------------------- | ---------------------------------- | ---------- |
| Cal       | 40351015461, 40352615775, 40354188739                                | 0.647, 0.479, 1.577 (all positive) | no         |
| Documenso | 40364720958 (30 min)                                                 | LS 10.23                           | no         |
| Medusa    | replacement 40364715443 (30 min), fewer than three VALID 30-min runs | 1.20                               | no         |

So no metric of any product meets the rule today. Cal's three runs also carry the Medusa job that ran before the stock-exhaustion fix (TEST BUG, PR #93), which is why they are not counted as Medusa calibration.

## What the bounds file holds

- `products` is empty. A product gets an entry only from a calibration PR, from three VALID 30-min soaks.
- `src/load/soak/bounds.ts` reads the file and returns the product's thresholds, or null. The runner applies them to the soak verdict. Null gives NO THRESHOLD YET.

## Open

- Cal shows a steady RSS climb in the 2-hour soak (P6-OBS-CAL-005, D37). Documenso shows one (P6-OBS-DOC-007). Both are PRODUCT BUG (SUSPECTED); neither is absorbed by a bound.

## Update: every VALID soak on main (Task 7, C2)

Rebuilt from the soak workflow runs on `main` and their `soak-*` artefacts. Slope is the Theil-Sen RSS slope (MB per minute, the calibration measure). Plateau is the ratio of the last third to the middle third. Every run listed had outcome PASS and validity VALID unless the table says otherwise.

| Product   | Duration | Run         | Main SHA | Theil-Sen (MB/min) | Plateau | Counts for calibration                                                |
| --------- | -------- | ----------- | -------- | ------------------ | ------- | --------------------------------------------------------------------- |
| Cal       | 30       | 40376505653 | 93c9185  | 0.794              | 1.0009  | yes, growth                                                           |
| Cal       | 30       | 40505035282 | fead76c  | 0.792              | 1.0013  | yes, growth                                                           |
| Cal       | 120      | 40373021384 | 93c9185  | 2.470              | 1.0387  | no (2-hour, growth)                                                   |
| Documenso | 30       | 40364720958 | 93c9185  | 10.354             | 1.0410  | yes, growth                                                           |
| Documenso | 30       | 40376751161 | 93c9185  | 11.650             | 1.0636  | yes, growth                                                           |
| Documenso | 30       | 40505035282 | fead76c  | 12.449             | 1.0628  | yes, growth                                                           |
| Documenso | 120      | 40373634603 | 93c9185  | -0.760             | 1.0400  | no (2-hour)                                                           |
| Medusa    | 30       | 40364715443 | 93c9185  | 1.203              | 1.0027  | yes, growth                                                           |
| Medusa    | 30       | 40505035282 | fead76c  | 0.223              | 1.0048  | yes, growth (least squares -6.63, Theil-Sen counted)                  |
| Medusa    | 120      | 40455577906 | a149825  | 0.148              | 1.0107  | no (2-hour)                                                           |
| Medusa    | 120      | 40380234236 | 7de2d91  | 0.162              | 1.0083  | no: outcome FAIL, cleanup TEST BUG (leak email pattern, fixed by #99) |

Per product, the calibration count (D5, 30-minute VALID soaks with no growth):

- Cal: 2 VALID 30-minute soaks, both with growth. Not calibrated. Two-hour run 40373021384 also climbs (P6-OBS-CAL-005, PRODUCT BUG (SUSPECTED)).
- Documenso: 3 VALID 30-minute soaks, all with growth (10 to 12 MB/min). Not calibrated. Two-hour run 40373634603 is flat, but it is not a calibration run. P6-OBS-DOC-007, PRODUCT BUG (SUSPECTED).
- Medusa: 2 VALID 30-minute soaks, both with positive Theil-Sen slope. Not calibrated (fewer than three). Two-hour run 40455577906 is VALID and PASS.

Decision (D-C1): no more calibration soaks are dispatched. Three more soaks per product would not change the result, because each product already has VALID 30-minute growth. The bounds file stays `"products": {}`. No bound absorbs growth (H3).
