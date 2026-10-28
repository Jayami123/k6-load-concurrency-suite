# Upstream drafts

These are per-finding drafts for reporting P6 findings upstream. **Nothing here is filed, posted or sent.** The reporter files
each draft by hand after re-running its duplicate search on the filing day.

- **Recheck date:** 2026-10-29 (Asia/Colombo). The upstream HEADs read on that date are in each draft.
- **Numbers:** taken from the permanent release assets (`p6-phase3`, `p6-phase4`), unless a draft says otherwise.
- **Already filed in Phase 1, not repeated here:**
  - calcom/cal.diy #30374, #30375 and #30376;
  - a reproduction comment on documenso/documenso#3187 (https://github.com/documenso/documenso/issues/3187#issuecomment-6318151560).

## Index

| Finding id                                          | Product   | Channel                                                | Draft file                                            | Dup-check result (2026-10-29)                                                | Status |
| --------------------------------------------------- | --------- | ------------------------------------------------------ | ----------------------------------------------------- | ---------------------------------------------------------------------------- | ------ |
| `P6-TW-RACE-004`                                    | Twenty    | Private email, security@twenty.com                     | `2026-10-29-twenty-reset-token-private.md`            | No public duplicate. Still applies (code read at HEAD `762e8ae4`)            | draft  |
| `P6-OBS-TW-001`                                     | Twenty    | Private email, security@twenty.com                     | `2026-10-29-twenty-empty-body-hang-private.md`        | No duplicate (#26895 and #25165 differ). Applies on v2.44.0; HEAD not re-run | draft  |
| `P6-OBS-DOC-003`                                    | Documenso | Private GitHub security advisory                       | `2026-10-29-documenso-doc-003-private-advisory.md`    | No public duplicate. Still applies (L66 at HEAD `aef13b8d`)                  | draft  |
| `P6-MED-RACE-008`, `-013`, `-014` (X04, F-M3, F-M4) | Medusa    | Public issue, `bug_report_v2.yml`                      | `2026-10-29-medusa-cancel-race.md`                    | No duplicate. Related: #17369, #16569, PR #17420 (not merged). Still applies | draft  |
| `P6-OBS-MED-002` (`P6-MED-LOAD-009`)                | Medusa    | Section of, or first comment on, the cancel-race issue | `2026-10-29-medusa-med-002-load-evidence.md`          | Same mechanism as F-M3. Still applies                                        | draft  |
| `P6-MED-RACE-009` (X05)                             | Medusa    | Public issue, `bug_report_v2.yml`                      | `2026-10-29-medusa-cancel-vs-fulfil.md`               | No duplicate. Related: #17369. Still applies                                 | draft  |
| `P6-MED-RACE-012`, `-005` (F-M2)                    | Medusa    | Public issue, `bug_report_v2.yml`                      | `2026-10-29-medusa-promo-limit-leak.md`               | No duplicate. Related: #16012 (fixed, holds), #16997, #16595. Still applies  | draft  |
| `P6-CAL-RACE-006`, `-008` (F-C1)                    | Cal       | Comment on calcom/cal.diy#29815                        | `2026-10-29-cal-f-c1-comment-29815.md`                | Duplicate of #29815 (open, Stale). PR #29839 not merged                      | draft  |
| `P6-CAL-RACE-007` (F-C2)                            | Cal       | Public issue, `bug_report.md`                          | `2026-10-29-cal-confirm-vs-cancel.md`                 | No duplicate. Related: #29968, PR #28151. Still applies                      | draft  |
| `P6-CAL-RACE-009` (F-C3)                            | Cal       | Public issue, `bug_report.md`                          | `2026-10-29-cal-double-confirm.md`                    | No duplicate. Related: #29968 (a different booking pair). Still applies      | draft  |
| `P6-OBS-DOC-001`                                    | Documenso | Public issue, `bug-report.yml`                         | `2026-10-29-documenso-signin-500.md`                  | No duplicate. Still applies (L94, L115, L132 at HEAD)                        | draft  |
| `P6-OBS-DOC-005` (`P6-DOC-LOAD-007`)                | Documenso | Hold; optional comment on #3187                        | `2026-10-29-documenso-duplicate-seal-comment-3187.md` | Duplicate of #3187 (fix PR #3353 open); emails related to #3190              | draft  |
| `P6-CAL-LOAD-009` link-usage mismatch               | Cal       | Hold, do not file                                      | `2026-10-29-cal-link-usage-mismatch.md`               | Possibly the #29815 mechanism; 1 of 8 runs                                   | draft  |

The two 2026-10-25 drafts (`2026-10-25-documenso-duplicate-seal.md` and `2026-10-25-cal-link-usage-mismatch.md`) are superseded by the 2026-10-29
refreshes above.

## Filing order

1. **Twenty, private:** `P6-TW-RACE-004`, then `P6-OBS-TW-001`, by email to security@twenty.com.
2. **Documenso, private:** the `P6-OBS-DOC-003` advisory, through the GitHub private form.
3. **Medusa:** first the cancel race, with the MED-002 section; then cancel vs fulfil; then the promotion limit leak.
4. **Cal:** first the #29815 comment; then F-C2; then F-C3.
5. **Documenso, public:** `P6-OBS-DOC-001`. The duplicate-seal comment is held.

## Evidence links

- **Release pages:**
  - https://github.com/Jayami123/k6-load-concurrency-suite/releases/tag/p6-phase3
  - https://github.com/Jayami123/k6-load-concurrency-suite/releases/tag/p6-phase4
- **Assets used:**
  - `p6-40177412186-evidence.zip` (`p6-phase3`);
  - `p6-40498902575-evidence.zip`, `p6-40524237209-evidence.zip` and `p6-40526041971-evidence.zip` (`p6-phase4`).
- **`p6-phase2` was never published.** Its runs (40037355173 and 40039351021) have artefacts that expire 2026-11-06. The drafts cite them as history only.
