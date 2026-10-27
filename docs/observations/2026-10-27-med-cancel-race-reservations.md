# P6-OBS-MED-002: cancel-order race leaves reservations on canceled orders (PRODUCT BUG (SUSPECTED))

- **Label:** PRODUCT BUG (SUSPECTED). The root cause is not yet confirmed against the Medusa fork's query output.
- **Proposed upstream issue title (not filed):** cancel-order race leaves reservations on canceled orders
- **Case:** P6-MED-LOAD-009 (double cancel and cancel-vs-fulfil under steady load).
- **Relation to P6-OBS-MED-001:** same leak, recorded earlier from the first probe that showed it. This entry is the one the known-fail marker names (see the case's verdict).

## Evidence

| Run                   | Job               | Artefact                         | Reservation rows | Live units | Canceled orders holding one reservation |
| --------------------- | ----------------- | -------------------------------- | ---------------- | ---------- | --------------------------------------- |
| 40487849160 (probe 2) | medusa-invariants | 9eb95c26-medusa-invariants_2.zip | 81               | 77         | 4                                       |
| 40491885325 (probe 3) | medusa-invariants | cdc34e06-medusa-invariants_3.zip | 85               | 77         | 8                                       |

- Each canceled order holds exactly one live `reservation_item`. The reservations are counted through `order_item` of the order's current version and `reservation_item.line_item_id`.
- The second cancel request of a double-cancel race answered `400` with `Order (...) already has an existing active order change`. No double `200` occurred in either run, so the X04 count is 0.
- The cancel-fulfil race answered `200` and `400`, or `200` and `200`, in the k6 race log.
- Probe 3 cleanup: each of the 8 reservations was listed once, deleted through the admin reservations API, and the product delete then succeeded.
- Earlier this entry's brief said the earlier run held 6 canceled orders; the artefact shows 4 (reservation rows 81, live units 77). The table above uses the artefact values.

## Suspected cause

Medusa 2.21.2 core-flows. The compiled files are the ones the package ships:

- `dist/order/workflows/cancel-order.js:104-109`: `lineItemIds` is `order.items?.map((i) => i.id)`, and `deleteReservationsByLineItemsStep(lineItemIds)` runs in parallel with the refund.
- `dist/reservation/steps/delete-reservations-by-line-items.js:13,18`: the step lists reservations by `line_item_id: ids` and deletes them.
- The source references from the review brief, `cancel-order.ts:182-186` and `delete-reservations-by-line-items.ts:37-49`, are not in the published package, so they could not be checked here.

If `order.items[].id` is the order item id while `reservation_item.line_item_id` holds the order line item id, the cancel step finds no reservation to delete. This is consistent with the evidence but not proven.

## Assertion and marker

The case keeps the strict assertion: a canceled order must hold 0 reservations. The count is not changed. The only exception is the `known-fail` marker tied to this id, which reports `KNOWN FAIL P6-OBS-MED-002` with the leaked count. The job passes only when every other clause passes, and the marker fails loudly when the leak no longer reproduces.
