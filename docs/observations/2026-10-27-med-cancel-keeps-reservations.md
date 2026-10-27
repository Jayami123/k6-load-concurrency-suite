# P6-OBS-MED-001: canceled Medusa orders keep their stock reservations (PRODUCT BUG, suspected root cause)

- **Status:** observed, reproduced in the probe. Root cause suspected, not confirmed against the Medusa fork's query output.
- **Severity:** product. A canceled order holds stock, so inventory is under-sold until the reservation is removed.
- **Case:** P6-MED-LOAD-009 (double cancel and cancel-vs-fulfil under steady load). Strict assertions unchanged; the case fails.

## Evidence

- Run 40487849160 (`perf`, `main` at c25a585), job `medusa-invariants` (job 122134044858), artifact `9eb95c26-medusa-invariants_2.zip`, run dir `P6-MED-LOAD-009/20261027T103329Z-d83ed019`.
- Validity VALID (0 dropped iterations, 0 invalid reasons).
- Reconcile: reservation rows 81, live units 77, `inventory_level.reserved` 81. The difference of 4 is the reservations of 4 canceled orders, one each:
  - `order_01M5YERQA83R7BM4A15S0SAXX1` (double-cancel, HTTP 200,400)
  - `order_01M5YETF4KYJ8TS6ZAJZ1HQ59Q` (double-cancel, HTTP 200,400)
  - `order_01M5YESK71D7Q4H6B4DP1WQ72T` (double-cancel, HTTP 400,200)
  - `order_01M5YEVRY7A6KKR63JTGV4AFVG` (cancel-fulfil, HTTP 200,400)
- The cleanup deleted those reservations through the admin reservations API before the product delete, and the product delete then succeeded (no cleanup TEST BUG).

## Medusa code (2.21.2, compiled `dist`, npm package @medusajs/core-flows)

- `dist/order/workflows/cancel-order.js:104-109`: `lineItemIds` is `order.items?.map((i) => i.id)`, and `deleteReservationsByLineItemsStep(lineItemIds)` runs in parallel with the refund.
- `dist/reservation/steps/delete-reservations-by-line-items.js:13,18`: the step lists reservations by `line_item_id: ids` and deletes them with `deleteReservationItemsByLineItem(ids)`.
- The inventory schema keeps reservations on `reservation_item.line_item_id` (`@medusajs/inventory` 2.21.2 migration `Migration20240307132720.js`).

The source line numbers of the `.ts` files (`cancel-order.ts:182-186`, `delete-reservations-by-line-items.ts:37-49`) are not in the published package. The lines above are the compiled ones.

## Suspected mechanism

`order.items[].id` is the id of the order item row (`order_item.id`), while `reservation_item.line_item_id` refers to the order line item (`order_line_item.id`, which `order_item.item_id` points to). If the cancel query returns order item ids, the step finds no reservation and deletes nothing, so the reservation survives the cancel. This would also explain why the same leak appears for both cancel races.

This is not yet proven. To confirm, read the output of `order.items[].id` for a canceled order in the Medusa fork, or run the cancel path once and compare the id with `reservation_item.line_item_id`.

## What the case does about it

- The reconcile counts reservations against live units (non-canceled orders) and reports the difference as PRODUCT BUG.
- The cancel-race stage fails each canceled order that holds a live reservation, with its race type and the HTTP statuses of its race requests.
- The cleanup records this run's leaked reservations as a finding and deletes them before the product, so the next case is not blocked.
