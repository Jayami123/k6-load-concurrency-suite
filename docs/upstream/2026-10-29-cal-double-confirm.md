# Draft: Cal two parallel confirms of one PENDING booking both succeed (F-C3)

Status: not filed

- **Finding:** `P6-CAL-RACE-009` (F-C3).
- **Target:** `calcom/cal.diy`.
- **Channel:** public issue, template `bug_report.md`.
- **Source draft:** Task 9 plan Appendix C3.

## Upstream recheck (2026-10-29, Asia/Colombo)

- **Upstream HEAD:** `main` `91eefbf9`. `confirm.handler.ts` is unchanged since the pin `c2b7ac44`.
- **Duplicate search** (`repo:calcom/cal.diy`):
  - `confirm twice webhook`
  - `BOOKING_CREATED twice`
  - `confirm cancel race`
- **Related, not a duplicate:** #29968 (open), "idempotency key not set on PENDING→ACCEPTED". It is about two _different_
  overlapping pending bookings both being confirmed, not about one booking confirmed twice. A fix there (its PR #30003, closed
  and not merged) may or may not cover this, so link it in the issue.
- **Verdict: still applies.**

## Title

Two parallel confirms of one pending booking both succeed and fire BOOKING_CREATED twice

## Issue Summary

Two confirms of one PENDING booking at the same moment both succeed, and two `BOOKING_CREATED` webhooks fire. A sequential
second confirm is refused (400, no webhook), so this is a race, not a missing check.

## Steps to Reproduce

1. Use an event type that requires confirmation (seed `pro/tennis-class`), and create a booking, so it is PENDING.
2. Send two host confirm calls together for the same booking: `POST /api/trpc/bookings/confirm?batch=1` with `{bookingId, confirmed: true, emailsEnabled: false}`.
3. Count the `BOOKING_CREATED` deliveries.

## Actual Results

- Both requests return 200.
- The status is ACCEPTED.
- There are two `BOOKING_CREATED` deliveries.

This happened in 50 of 50 trials in each of four CI runs (200 of 200).

## Expected Results

One confirm succeeds and fires one `BOOKING_CREATED`. The other gets a 4xx, as the sequential case does.

## Technical details

As in the F-C2 draft (`2026-10-29-cal-confirm-vs-cancel.md`).

## Evidence

- **Spec:** `tests/cal/races/cal-race-009-double-confirm.spec.ts`.
- **Per-trial JSON:** `race-histograms-cal-state/P6-CAL-RACE-009.json` in each zip. Each trial records `finalStatus` accepted and `createdCount` 2.

| Run         | Release   | Asset                         | Trials with two 200s and two BOOKING_CREATED |
| ----------- | --------- | ----------------------------- | -------------------------------------------- |
| 40177412186 | p6-phase3 | `p6-40177412186-evidence.zip` | 50/50                                        |
| 40498902575 | p6-phase4 | `p6-40498902575-evidence.zip` | 50/50                                        |
| 40524237209 | p6-phase4 | `p6-40524237209-evidence.zip` | 50/50                                        |
| 40526041971 | p6-phase4 | `p6-40526041971-evidence.zip` | 50/50                                        |

TODO: the sequential-second-confirm 400 is from the Phase 2 work (Task 9 plan), not from a released file. Re-verify it, or drop the sentence.
