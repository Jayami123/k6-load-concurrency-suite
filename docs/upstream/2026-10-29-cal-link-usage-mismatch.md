# Draft: Cal private-link usage one higher than the bookings that used it (P6-CAL-LOAD-009), refresh

Status: hold. Do not file.

- **Supersedes:** `docs/upstream/2026-10-25-cal-link-usage-mismatch.md`.
- **Finding:** an unlabelled observation in case `P6-CAL-LOAD-009` (one cap-1 private link per booking intent).
- **Target:** `calcom/cal.diy`, if ever filed.
- **Channel:** none for now.

## Why hold

- **The mismatch is rare.** It was seen once: run 40135722015 had usage 31 against 30 bookings that used the links. That run's artefacts are not released and expire 2026-11-07. The three later unreleased runs (40142908660, 40144142420 and 40145366743) passed.
- **The released runs all passed the link join.** All four released runs (40177412186 in `p6-phase3`, and 40498902575, 40524237209 and 40526041971 in `p6-phase4`) have `outcome: PASS` in `load-cal/P6-CAL-LOAD-009/*/verdict.json`. **That makes 1 of 8 runs.**
- **The cause is not established,** and it is not established whether the product or the test is wrong.
- **What those runs do record** is the known bug `P6-OBS-CAL-001`: 1, 15, 1 and 16 per run, counted as known and not a failure. That is a different finding.
- **Overlap with F-C1:** a usage counter written after the booking (#29815, F-C1) could plausibly produce an off-by-one. A comment on #29815 (`2026-10-29-cal-f-c1-comment-29815.md`) already covers the mechanism.

## Upstream recheck (2026-10-29, Asia/Colombo)

- **Upstream HEAD:** `main` `91eefbf9`. The link-usage code is unchanged since the pin `c2b7ac44` (see the F-C1 draft).
- **Duplicate search:** `maxUsageCount`, `private link usage`. They found #29815 only.
- **Verdict: possibly the same mechanism as #29815.** It is not reproducible enough to file.

## To revisit

- [ ] If the mismatch reappears in a released run, save the per-intent join rows (`retry-audit.json`, `judgeCalLinkJoin`) from that zip and reopen this draft.
- [ ] Before 2026-11-07, optionally download the 40135722015 artefact to the box so the one failing join is not lost. TODO.
