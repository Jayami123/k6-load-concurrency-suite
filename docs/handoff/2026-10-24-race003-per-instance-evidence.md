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

## Verdict

The counts are real: the database holds the same orders the HTTP responses returned. This is **PRODUCT BUG (SUSPECTED)**: instance 1
returned 4 successful completes for S = 3 in trials 39 and 45.

## Limits

- The artifact records no cart id and no instance per order row. The instance is the request routing (`i % 2`), not a value the
  database stores. The per-instance attribution is therefore by construction, not read from the database.
- The CI database is gone after the run, so cart ids cannot be recovered now.
- The in-memory lock is per process (`node_modules/.pnpm/@medusajs+locking@2.21.2…/dist/providers/in-memory.js`, `this.locks = new Map()`
  at line 8, acquire at lines 57–97). The evidence shows 4 admissions on one backend but does not by itself prove which lock path let them
  through.

## Change

`checkMemoryLockCharacterization` (`src/medusa/invariants.ts`) now adds `PRODUCT BUG (SUSPECTED): instance k admitted n orders for S=…`
for each backend with more than S successful completes. The bound `instances × S` stays as a hard invariant. Regression tests:
`tests/unit/medusa-invariants.test.ts` (trial 45 and trial 39 status patterns from the artifact, plus a passing case).
