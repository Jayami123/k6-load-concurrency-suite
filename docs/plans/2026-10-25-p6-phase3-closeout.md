# P6 Phase 3 closeout (2026-10-25)

Phase 3 is closed when the `p6-phase3` release exists, its zips hold the csv and html files, and this PR is merged.

## Pull requests

| PR                                                                    | Merge commit | Contents                                                                                                                        |
| --------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| [#62](https://github.com/Jayami123/k6-load-concurrency-suite/pull/62) | `63c4d87`    | Task 10: retry-storm cases for Cal, Medusa and Documenso, with judges and the known-bug gate.                                   |
| [#63](https://github.com/Jayami123/k6-load-concurrency-suite/pull/63) | `5db87d7`    | Evidence release allowlist (json, log, csv, html, txt), per-dispatch concurrency group, step timeouts.                          |
| [#64](https://github.com/Jayami123/k6-load-concurrency-suite/pull/64) | `0b07594`    | Telemetry and clock hooks on the ten product LOAD cases; p95 median and smoke-baseline tooling.                                 |
| [#65](https://github.com/Jayami123/k6-load-concurrency-suite/pull/65) | `6e307cf`    | Journey smoke baseline `k6/thresholds/smoke-p95.json` and its test.                                                             |
| [#66](https://github.com/Jayami123/k6-load-concurrency-suite/pull/66) | `4b05683`    | Phase 3 release notes `docs/releases/p6-phase3.md`.                                                                             |
| this PR                                                               |              | README Phase 3 results, this closeout, the Task 11 plan, upstream drafts, the backlog carry-over, the release-notes correction. |

## Evidence runs

Three `perf.yml` dispatches on `main` at `0b07594`, one after another:

- [40177412186](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40177412186): all 14 jobs green; all 10 LOAD cases PASS, VALID.
- [40178773022](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40178773022): all 14 jobs green; all LOAD cases PASS, VALID, except `P6-MED-LOAD-006`'s first attempt (FAIL, TEST BUG: storm not reached). Two cases ran twice in this run (`P6-MED-LOAD-001`, `P6-MED-LOAD-002`); the first attempts are used.
- [40180625279](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40180625279): all 14 jobs green; all 10 LOAD cases PASS, VALID.

Decision by the owner: run 40178773022 counts for `P6-MED-LOAD-006` on its second attempt (PASS, VALID), although its first
attempt FAILED. This bends the rule that a run with a FAIL for a case is not used for that case.

## Checks

- **P6-RULE-001** (baseline exists before thresholds are enforced): `k6/thresholds/smoke-p95.json` is committed (PR #65). No
  threshold is enforced in Phase 3, so the rule holds.
- **P6-RULE-002** (README numbers match the latest artefact): the README table numbers were computed from the `verdict.json`
  files of the three runs above (requests and p95 medians, dropped counts, first-attempt selection as in the README footnote).
  The journey medians equal the committed baseline. The Phase 3 results section contains no ideation figure.
- **Done-when items** (plan §14): 11a and 11b merged except this PR; three VALID dispatch runs per LOAD case; telemetry csv,
  json and html files present in each chosen run folder; the baseline file committed with its test; the release check comes
  after this PR merges; the README cites only these runs; the upstream drafts exist (below); `npm run check` green.

## Known issues carried into Phase 4

- `P6-MED-LOAD-006`: the retry storm does not reliably reach its threshold; the first attempt in run 40178773022 showed 3 of
  30 first attempts timing out. A TEST BUG fix is needed in its own PR; no threshold was weakened.
- `P6-CAL-LOAD-009`: the Cal link-usage mismatch (31 against 30 bookings) appeared once in four runs and is not explained.
  Draft: `docs/upstream/2026-10-25-cal-link-usage-mismatch.md`.
- `P6-DOC-LOAD-007`: the Documenso double seal is the declared known bug `P6-OBS-DOC-005`. Draft:
  `docs/upstream/2026-10-25-documenso-duplicate-seal.md`.
- `P6-OBS-DOC-006`: Documenso reset-password with an unknown token returns HTTP 500 (suspected, same root cause as `P6-OBS-DOC-001`, a
  different route). Not confirmed; no draft yet.
- `cal-smoke`: the total of its step caps is larger than its job timeout. A follow-up PR is needed.
- Cal two-slot bug: fixed later by the Task 2 fixed-slot mode. Listed for the record.

## Corrections

- The release notes first said only `P6-MED-LOAD-001` ran twice in run 40178773022. `P6-MED-LOAD-002` also ran twice; the
  correction is in `docs/releases/p6-phase3.md`, deviation 3.

## Not done in this PR

- Filing the upstream drafts: the owner files them.
- Upstream drafts for the other open product bugs in the README's known-bugs table (for example `P6-OBS-CAL-002`, the Medusa
  F-M and X-series bugs): no draft yet.
- The stale Cal start comments in `perf.yml` and `docs/handoff/pr-bodies/task1.md`: not reviewed in this PR.
