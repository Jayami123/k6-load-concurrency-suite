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
