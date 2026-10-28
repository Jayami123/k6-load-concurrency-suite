# Draft: Cal confirm and cancel of one PENDING booking both succeed (F-C2)

Status: not filed

- **Finding:** `P6-CAL-RACE-007` (F-C2).
- **Target:** `calcom/cal.diy`.
- **Channel:** public issue, template `.github/ISSUE_TEMPLATE/bug_report.md` (label "🐛 bug"). Cal's security policy treats
  concurrency and DoS as out of scope, and this is not a data-exposure bug, so a public issue fits.
- **Source draft:** Task 9 plan Appendix C2.

## Upstream recheck (2026-10-29, Asia/Colombo)

- **Upstream HEAD:** `main` `91eefbf9f460bac7d69327fea4d9560295390e0a`.
- **Code:** `packages/trpc/server/routers/viewer/bookings/confirm.handler.ts` and `handleCancelBooking.ts` are unchanged
  between the fork pin `c2b7ac44c66f24ffef1662b276f0653988a609a3` and that HEAD.
- **Duplicate search** (unauthenticated GitHub issue search, `repo:calcom/cal.diy`):
  - `confirm cancel race`
  - `confirm twice webhook`
  - `BOOKING_CREATED twice`

  The related items below came from following links in those results.

- **Related, not duplicates:**
  - #29968 (open): the idempotency key is not set on PENDING→ACCEPTED, so overlapping pending bookings can be confirmed. Its PR #30003 is closed, not merged.
  - PR #29966 (closed): an overlap check before confirming.
  - PR #28151 (open): a `FOR UPDATE` lock against double booking.

  None covers confirm racing cancel on the same booking.

- **Already filed in Phase 1, distinct:** #30374, #30375 and #30376.
- **Verdict: still applies.**

## Title

Confirming and cancelling one pending booking at the same time: both succeed, booking stays ACCEPTED, both webhooks fire

## Issue Summary

Confirming and cancelling one PENDING booking at the same moment: both requests succeed, the booking ends ACCEPTED, and both
the `BOOKING_CREATED` and the `BOOKING_CANCELLED` webhooks fire. The attendee and the host get contradictory side effects, and
the booking that was "cancelled" stays on the calendar.

## Steps to Reproduce

1. Use an event type that requires confirmation (seed `pro/tennis-class`), and create a booking, so it is PENDING.
2. Send these two requests together:
   - confirm as the host: `POST /api/trpc/bookings/confirm?batch=1` with `{bookingId, confirmed: true, emailsEnabled: false}`;
   - cancel: `POST /api/cancel` for the same booking uid.
3. Read the booking status and the webhook deliveries (a `BOOKING_CREATED` and a `BOOKING_CANCELLED` subscriber).

## Actual Results

- Both requests return 200.
- The final status is ACCEPTED.
- There is one `BOOKING_CREATED` and one `BOOKING_CANCELLED` delivery.

This happened in 50 of 50 trials in each of four CI runs (200 of 200).

## Expected Results

One terminal state:

- either ACCEPTED with only `BOOKING_CREATED`;
- or CANCELLED with only `BOOKING_CANCELLED`.

The losing request gets a 4xx.

## Technical details

- **Build:** self-hosted, fork at `c2b7ac44` (the files above are unchanged at `main` `91eefbf9`).
- **Node:** v22.23.3 (run-meta of the Cal load jobs in the same runs; the race job writes none). TODO: confirm from the job log.
- **Database:** PostgreSQL. TODO: the exact version from `qa-portfolio-harness` v0.2.15.
- **OS:** Ubuntu 24.04, GitHub Actions runner image `20261023.334.3`.
- **Client:** API only, no browser.

## Evidence

- **Spec:** `tests/cal/races/cal-race-007-confirm-vs-cancel.spec.ts` in https://github.com/Jayami123/k6-load-concurrency-suite. Webhook signatures are verified per delivery.
- **Per-trial JSON:** `race-histograms-cal-state/P6-CAL-RACE-007.json` in each zip. Each trial records `finalStatus` accepted, `createdCount` 1 and `cancelledCount` 1.

| Run         | Release   | Asset                         | Trials with both 200, ACCEPTED, both webhooks |
| ----------- | --------- | ----------------------------- | --------------------------------------------- |
| 40177412186 | p6-phase3 | `p6-40177412186-evidence.zip` | 50/50                                         |
| 40498902575 | p6-phase4 | `p6-40498902575-evidence.zip` | 50/50                                         |
| 40524237209 | p6-phase4 | `p6-40524237209-evidence.zip` | 50/50                                         |
| 40526041971 | p6-phase4 | `p6-40526041971-evidence.zip` | 50/50                                         |

The assets download from `https://github.com/Jayami123/k6-load-concurrency-suite/releases/download/<release>/<asset>`.
