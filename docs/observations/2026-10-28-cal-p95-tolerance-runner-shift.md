# Cal p95 tolerance: a day-to-day runner shift (known issue, no change)

**Status:** recorded. No change to K, FLOOR, the pooling rule or `k6/thresholds/tolerance.json`.

## What the data shows

The Cal steady p95 of the A/A arms moved between the two UTC days, while the arms within each day agree:

| Day | Gate run | Counted arm p95 (ms) | Spread within the day |
| --- | --- | --- | --- |
| 2026-10-27 | `40497029348` | 77.36 / 77.52 / 76.21 | 1.7 % |
| 2026-10-28 | `40605925118` | 60.06 / 59.51 / 58.34 | 2.9 % |

Pooled over both days, the spread is S = 28.15 %, so T = max(0.10, 2 × S) = 56.30 %. The pooled tolerance is wide because of the shift between the days, not because of noise within a day.

## Cause

Not established. The shift is a change between two dispatches on different days, with the same code and the same pinned Cal ref. The likely source is the runner (hardware or neighbours), but no runner data was collected for these two runs, so this is not confirmed.

## Effect on the gate

- The Cal p95 gate is weak: a regression smaller than 56.3 % in p95 is not detected. p50 is reported next to it (T = 80.8 %).
- Medusa is not affected in the same way: its p95 spread is 3.97 %, T at the 10 % floor.

## Decision

Kept as is (owner decision). K and FLOOR are the rule's constants, and the pooling uses both days as required. A change would be a new rule, decided separately, with its own A/A data.
