# Draft: Documenso seals one envelope twice under a retried completion

Draft for the Documenso bug-report form (`.github/ISSUE_TEMPLATE/bug-report.yml`). Not filed. The owner files it.

## Issue Description

When the same document completion is sent twice in parallel, Documenso records two seals and two "completed" audit rows
for one envelope, and sends each recipient the completion email twice. A control with a single completion records one seal.

## Steps to Reproduce

1. Create a document with one recipient, and sign every field as that recipient, so that the document is ready to complete.
2. Send the completion request for that document. Let the client time out (the case uses a short client timeout).
3. Retry the completion in parallel, as `P6-DOC-LOAD-007` does (the CI runs sent 217 retries per run, for 31 envelopes).
4. Count the envelope's seals, its `completed` audit rows and the completion emails to each recipient.
5. Repeat without the retries, as the control `P6-DOC-LOAD-002`.

In the k6 load case `P6-DOC-LOAD-007`, the retried completions produced two seals and two completion rows for one envelope in
the earlier CI runs below. The control `P6-DOC-LOAD-002` produced one seal per envelope in the same runs.

## Expected Behavior

One seal, one `completed` audit row, and one completion email per recipient, however many completion requests arrive.

## Current Behavior

Two seals and two `completed` audit rows for one envelope when the completion is retried in parallel.

Evidence (CI, `P6-DOC-LOAD-007` before the declared-bug gate): runs 40134262533, 40135722015 and 40137277800 (full profile,
31 envelopes each): 31 of 31 envelopes with more than one seal job and more than one `DOCUMENT_COMPLETED` row; 62 of 62
recipients with more than one completion email; 62 first requests timed out and 217 retries sent per run; no 5xx. Control
`P6-DOC-LOAD-002` in the same runs: one seal per envelope, and 62 of 62 emails matched. Run 40139142246 shows the same
duplicate seal. The case is registered as the declared known bug `P6-OBS-DOC-005`, so the gate reports it as observed
rather than failing the run.

## Screenshots (optional)

Not applicable: the evidence is the database rows and the k6 summaries in the CI artefacts.

## Operating System

Ubuntu 24.04 (the CI runner image `ubuntu24 20261023.334.3`).

## Browser

Not applicable (API calls only).

## Version

The Documenso ref the harness pins; see `software.products` in the run-meta of the release zip.

## Checklist

- [ ] I have searched the existing issues to make sure this is not a duplicate.
- [x] I have provided steps to reproduce the issue.
- [x] I have included relevant environment information.
- [ ] I have included any relevant screenshots.
