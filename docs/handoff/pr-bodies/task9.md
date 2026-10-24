# Task 9 PR (not created: the owner opens it)

Base: feat/2026-10-24-p6-med-load-conservation (Task 8)
Head: feat/2026-10-24-p6-doc-load-pipeline-lag
Title: feat(load): judge the documenso pipeline lag and the webhook retry (P6-DOC-LOAD-002, P6-DOC-LOAD-008)

## Body

## What and why

Plan task 9 (docs/plans/2026-10-24-p6-phase3-task9-doc-load-pipeline-lag.md), steps 1 to 7:

- **Receiver responder** (`src/receivers/webhook-receiver.ts`): picks the HTTP status per delivery; default 200, so existing callers
  are unchanged. `failFirstPerEvent` answers 500 once per event, then 200.
- **Pipeline join and lag** (`src/load/pipeline-lag.ts`, pure): per document, each stage reached once, its lag from the last signature,
  duplicates, and percentiles.
- **Webhook retry judge** (`src/load/webhook-retry.ts`, pure).
- **Pipeline stage** (`src/load/pipeline-stage.ts`): reads the run's rows through the read-only pool, waits for the drain (30 s), judges
  the 30 s contract, writes `pipeline-lag.json` (counts and milliseconds only, token-scanned before it is kept).
- **Completion emails** (`src/load/pipeline-email.ts`): matched by the recipient token in the completion link
  (`/sign/<token>/complete`), which joins through `Recipient.token` to the envelope. The signing request has `X-Documenso-Envelope-Id`,
  but the completion email has no header, so the token is the field that ties every completion email to its envelope.
  Evidence: `docs/handoff/2026-10-24-documenso-email-fields.md`.
- **Cases and CI**: `P6-DOC-LOAD-002` and `P6-DOC-LOAD-008` registered, LOAD steps in `documenso-smoke`, README section.

## Verified live (this session, local Documenso stack)

- `npm run load:documenso-pipeline -- --profile pr`: **PASS**. 11 documents; 22 of 22 completion emails matched (two recipients each);
  every stage reached for every document; drain 14 ms.
- `npm run load:documenso-webhook-retry -- --profile pr`: **PASS**.

Numbers are the VM's, recorded for the check only; they are not published performance (AGENTS.md).

## CI

- Run `40115097825` (head `5bfbb85`): **success**. Its documenso-smoke job ran the live Documenso SQL of the pipeline reader.
- Run `40117133971` (head `5450050`, the stack before the email commit): **success**.
- Final run on this head: see the status line at the end of this body.

## Not in this PR

- The 30 s contract is judged on the runner's own timings; the VM run is a check of the code path, not of the contract.

## Merge order

Task 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9, each `--no-ff`. The full report with per-task status is
`docs/handoff/2026-10-24-p6-phase3-run2.md`. Nothing merged to `main`.
