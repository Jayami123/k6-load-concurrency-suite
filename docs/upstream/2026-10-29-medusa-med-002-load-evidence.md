# Draft: Medusa cancel race leaves reservations under steady load (P6-OBS-MED-002), a supplement to the cancel-race issue

Status: not filed

- **Finding:** `P6-OBS-MED-002` (case `P6-MED-LOAD-009`). The repo label is PRODUCT BUG (SUSPECTED).
- **Target:** `medusajs/medusa`.
- **Channel:** **no separate issue.** Add this as a section of, or the first comment on, the issue filed from
  `2026-10-29-medusa-cancel-race.md` once that issue has a number (TODO: the issue number).
- **Why it is not separate:** it is the same mechanism as F-M3 (see the next section).

## The mechanism is the losing cancel's rollback, not an id mismatch

The observation file (`docs/observations/2026-10-27-med-cancel-race-reservations.md`) suspected that `order.items[].id` and
`reservation_item.line_item_id` do not match. The released race histograms refute that:

- In `P6-MED-RACE-008`, every trial where one cancel got 200 and the other got 400 left a live reservation on the canceled order: 10/10, 21/21, 13/13 and 8/8 across the four released runs.
- No trial where both cancels got 200 leaked a reservation.

So the winning cancel deletes the reservation, and the loser's compensation (`restoreReservationItemsByLineItem`) puts it back. The observation file should be updated to say so. That update is out of scope here.

## Upstream recheck (2026-10-29, Asia/Colombo)

The same as the cancel-race draft:

- `develop` `5ac3fdcb`;
- `cancel-order.ts` and `delete-reservations-by-line-items.ts` are identical to `v2.21.2`;
- no duplicate found;
- related: PR #17420 (not merged), #16569.

**Verdict: still applies**, as part of the cancel-race issue.

## Comment text (draft)

> The same leak shows up under steady load, not only in a tight two-request race. A load case sends double cancels and
> cancel-vs-fulfil pairs at 0.7 iterations per 10 s for 120 s (run-meta `rate` 0.7, `durationSec` 120). After the run,
> several of the raced orders that ended `canceled` still held one live `reservation_item` each:
>
> | Run         | Orders | Raced and canceled | Canceled with a live reservation |
> | ----------- | ------ | ------------------ | -------------------------------- |
> | 40498902575 | 85     | 8                  | 4                                |
> | 40524237209 | 85     | 8                  | 5                                |
> | 40526041971 | 84     | 8                  | 6                                |
>
> Every leaked order is a raced order where the losing request got 400. For a double cancel, the loser's message is "Order (…)
> already has an existing active order change". The leaked reservations then block deleting the product ("reservation(s) held
> the inventory item") until they are removed through the admin reservations API.

## Evidence (release `p6-phase4`, permanent)

- **Assets:** `p6-40498902575-evidence.zip`, `p6-40524237209-evidence.zip` and `p6-40526041971-evidence.zip`. They are downloadable at `https://github.com/Jayami123/k6-load-concurrency-suite/releases/download/p6-phase4/<asset>`.
- **Paths in each zip:** `medusa-invariants/P6-MED-LOAD-009/<load-run-id>/verdict.json` (`stages.reconcile.data`) and `audit.json`. The load-run ids are:
  - `20261027T115442Z-0b12a9c1`
  - `20261027T145633Z-fcc678e2`
  - `20261027T150318Z-7cd08638`
- **Case:** `src/load/cases.ts` `MED_LOAD_009`, script `k6/cases/med-load-009.js`.
- **Profile:** `run-meta.json` of 40498902575 confirms `profile` full, `rate` 0.7 and `durationSec` 120.
- **The probe runs** 40487849160 and 40491885325 named in `docs/findings.json` are Actions artefacts only, not in a release. Do not cite them.
