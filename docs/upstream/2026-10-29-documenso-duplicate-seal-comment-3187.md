# Draft: Documenso duplicate seal under retried completions (P6-OBS-DOC-005, case P6-DOC-LOAD-007), refresh

Status: hold. If anything is posted, it is an optional short comment on documenso/documenso#3187. No new issue.

- **Supersedes:** `docs/upstream/2026-10-25-documenso-duplicate-seal.md`.
- **Finding:** `P6-OBS-DOC-005` (load case `P6-DOC-LOAD-007`).
- **Target:** `documenso/documenso`.
- **Channel:** none by default. Optionally, one follow-up comment on #3187.

## Corrections to the 2026-10-25 draft

- **Recipients:** the case uses envelopes with **two** recipients, not one. Every released run shows 31 envelopes × 2 recipients: `sealJobs` 2, `completedAudit` 2 and `emailsPerRecipient` [2,2].
- **The trigger:** each recipient's `completeDocumentWithToken` gets a 25 ms first attempt, which times out on the client. Then **3 parallel identical retries** follow, the last with a 30 s timeout (`k6/cases/doc-load-007.js`, `RETRY`). The overlap of the two recipients' completions is the #3187 trigger.
- **Gate attribution:** the retry audit attributes the duplicate seal to `P6-OBS-DOC-002` (31 per run). The reconcile stage counts `P6-OBS-DOC-005` (62 per run, the duplicate emails).

## Upstream recheck (2026-10-29, Asia/Colombo)

- **Upstream HEAD:** `main` `aef13b8dd3101aaa51e5e9dd6f03a476f4b921d6`.
- **#3187** ("Concurrent completion can trigger sealing twice, re-signing the PDF over itself"):
  - It is open.
  - A comment of 2026-09-09 confirms it, and lists duplicate webhook and completion emails as consequences.
  - Our Phase 1 reproduction comment (2026-10-21) is already posted: https://github.com/documenso/documenso/issues/3187#issuecomment-6318151560 (two `PARALLEL` signers completing at once, 50/50 per run on 4 CI runs).
- **Fix PR #3353:** "fix: add terminal-status idempotency guard to the seal handler". It is open and not merged.
- **#3190** (open): `send-document-completed-emails` has no idempotency. It is related to the duplicate emails.
- **Duplicate search** (unauthenticated, `repo:documenso/documenso`): `sealed twice`, `duplicate completed email`, `seal document job retry`.
- **Verdict: duplicate of #3187** (fix in #3353). The duplicate emails are a consequence that #3187's comments already mention, and they are related to #3190.

## Optional follow-up comment on #3187 (draft; post only if it adds value)

> One more trigger for the same bug, in case it matters for #3353's tests: client retries. A load case completes 31
> two-recipient envelopes per run; each `completeDocumentWithToken` first times out on the client (25 ms), then 3 identical
> retries fire in parallel. In every one of four CI runs: 31 of 31 envelopes got 2 `internal.seal-document` jobs and 2
> `DOCUMENT_COMPLETED` audit rows, and 62 of 62 recipients got the completion email twice, with no 5xx (62 first attempts
> timed out and 217 retries were sent per run). Same commit as above (`f4105e47`). Per-run evidence:
> https://github.com/Jayami123/k6-load-concurrency-suite/releases/tag/p6-phase4 (`load-documenso/P6-DOC-LOAD-007/*/`).

Recommendation: **hold.** The Phase 1 comment already gives the maintainers a deterministic reproduction. Post this only if
#3353 is reviewed and a retry scenario would help its tests.

## Evidence (permanent)

| Run         | Release   | Load-run dir                | Envelopes | Seal jobs per envelope | Emails per recipient |
| ----------- | --------- | --------------------------- | --------- | ---------------------- | -------------------- |
| 40177412186 | p6-phase3 | `20261025T084522Z-905b38e5` | 31        | 2                      | [2,2]                |
| 40498902575 | p6-phase4 | `20261027T115513Z-bb395a1a` | 31        | 2                      | [2,2]                |
| 40524237209 | p6-phase4 | `20261027T145648Z-5a9595a9` | 31        | 2                      | [2,2]                |
| 40526041971 | p6-phase4 | `20261027T150320Z-fe4a4223` | 31        | 2                      | [2,2]                |

Each run dir is `load-documenso/P6-DOC-LOAD-007/<dir>/` in `p6-<run>-evidence.zip`, with `verdict.json` and `retry-audit.json`. The
product pin in the run-meta is `f4105e47eba56f5d8d7e70dd516a8fcc0c870d7c`, and Node is v24.21.0.

The 2026-10-25 draft cited runs 40134262533, 40135722015 and 40137277800. Those are Actions artefacts only, they are not released, and they expire 2026-11-07.
