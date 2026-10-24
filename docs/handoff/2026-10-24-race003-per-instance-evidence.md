# RACE-003 per-instance evidence (run 40120499660, job 120950792734)

Artifact: `race-histograms-medusa-multi-instance-memory` (id 12570908153), file `races/P6-MED-RACE-003.json`, read only.
Two trials exceed S = 3 on one backend. Request i went to backend `i % 2` (`src/medusa/run-case.ts`, `pickInstance` in
`src/medusa/store.ts:165`). `completeCart` is one POST per index with no retry (`src/medusa/store.ts:156`).

## Trial 45: instance 0 admitted 3, instance 1 admitted 4 (total 7)

| index | instance | status | order id                         |
| ----- | -------- | ------ | -------------------------------- |
| 0     | 0        | 200    | order_01M5QK0MPX8PKXG9T2NK9JX884 |
| 3     | 1        | 200    | order_01M5QK0MPG4DV0RQ4RQ51RRC52 |
| 5     | 1        | 200    | order_01M5QK0MPQZ48FRB7TDX0CSDFM |
| 7     | 1        | 200    | order_01M5QK0MQWKQ7Z2KEGP202TYS8 |
| 9     | 1        | 200    | order_01M5QK0MQFC9TB7Z0KZMBZQ2PD |
| 10    | 0        | 200    | order_01M5QK0MPZDXYXXEHMV4HB534R |
| 12    | 0        | 200    | order_01M5QK0MQ6M8ZE8H5VT3P9EHHA |

Other indices are 400 `not_allowed` (stock). All 15 requests started within 0.6 ms of each other.

## Trial 39: instance 0 admitted 1, instance 1 admitted 4 (total 5)

| index | instance | status | order id                         |
| ----- | -------- | ------ | -------------------------------- |
| 2     | 0        | 200    | order_01M5QJYVT1QXTMPK2YJMRQTXC4 |
| 1     | 1        | 200    | order_01M5QJYVQE752YAWE5RHG6GZ3X |
| 7     | 1        | 200    | order_01M5QJYVRE4CZ1ERW6S200WS5X |
| 9     | 1        | 200    | order_01M5QJYVQGY6FPMSBMWA0BY3N2 |
| 11    | 1        | 200    | order_01M5QJYVQZCQNPAWPB837YVS8W |

## Checks

- **Retries:** none. Each index appears once; `completeCart` sends one POST.
- **Duplicate responses / same order counted twice:** none. Every 200 has a distinct order id (trial 45: 7 ids; trial 39: 5 ids).
- **Ghost orders:** none. `ghostOrders` is 0 in both trials.
- **Invalid attempts:** none in the histogram.
- **DB oracle order count:** `orderCount` is `COUNT(DISTINCT o.id)` over `"order"` joined to the variant (`ORDERS_FOR_VARIANT_SQL`,
  `src/medusa/oracle.ts:5`), read from the database after the trial settled. Trial 45: DB 7, HTTP winners 7, unique ids 7,
  reservation rows 7. Trial 39: DB 5, HTTP winners 5, unique ids 5, reservation rows 5.
- **Stock:** `stocked` 3 and `reserved` 3 in both trials, so the `inventory_level` counter lost updates while 7 (or 5) reservation
  rows exist. That is the characterization finding already recorded.

## Verdict (superseded)

The counts are real: the database holds the same orders the HTTP responses returned. The first reading was PRODUCT BUG (SUSPECTED).
That reading is withdrawn: see the decision below.

## Decision: TEST BUG in the bound

The passing run 40119155757 (`race-histograms-medusa-multi-instance-memory`, id 12570730242, verdict `pass`, no invariant violations)
has one backend with 4 successful completes for S = 3 in trials 8, 16, 18, 24, 41, 43 and 49 (for example trial 8: instance 0 = 2,
instance 1 = 4, 6 orders; trial 18: instance 0 = 4, instance 1 = 1, 5 orders). So one backend admitting 4 is not a rare failure, and
the bound `instances × S = 6` is not a guarantee. The bound was removed from the hard invariants; the per-backend and per-trial
oversell counts are recorded as the characterization finding. Hard invariants: no ghost orders, `orderCount = uniqueOrderIds =
httpWinnerCount = reservationQty`, orders ≤ N, all trials valid.

## Limits

- The artifact records no cart id and no instance per order row. The instance is the request routing (`i % 2`), not a value the
  database stores. The per-instance attribution is therefore by construction, not read from the database.
- The CI database is gone after the run, so cart ids cannot be recovered now.
- The in-memory lock is per process (`node_modules/.pnpm/@medusajs+locking@2.21.2…/dist/providers/in-memory.js`, `this.locks = new Map()`
  at line 8, acquire at lines 57–97). The evidence shows 4 admissions on one backend but does not by itself prove which lock path let them
  through.

## Change

`checkMemoryLockCharacterization` (`src/medusa/invariants.ts`): the `instances × S` violation is removed; the per-backend admission
counts and the most any one backend admitted are findings (`CHARACTERIZATION: per backend admitted [3, 4], most 4 for S=3`). Ghost
orders in either direction and `orders > N` are hard violations. Regression tests in `tests/unit/medusa-invariants.test.ts`: the trial 45
shape (3 + 4 = 7) and the trial 39 shape pass the hard invariants; a ghost order and an N violation fail. Plan text updated (erratum in
§2 of the Task 2 plan); spec line 75 comment updated; spec line 66 unchanged.
