# Documenso email fields, captured live (2026-10-24)

One real run through the harness helpers (`startRun`, `prepareDocument`, `completeWithToken`, `endRun`) against the local
Documenso stack, one recipient, one document. Inbucket mailbox messages were read through its API. Tokens are redacted
(`<TOKEN>`), recipient addresses are not recorded, and only field names and join results are kept. The capture script is a
one-off in the session scratchpad and is not committed.

## Recipient mailbox: two messages

- Signing request, subject `Please sign this document`. Headers include `X-Documenso-Envelope-Id` (equal to the run's envelope id),
  `X-Documenso-Sender-User-Id` and `X-Documenso-Team-Id`. The link is `/sign/<TOKEN>`.
  Joined from the token through `Recipient.token` to its envelope: 1 row, envelope id equal to the run's.
- Completion, subject `Signing Complete!`. No `X-Documenso-*` headers. The link is `/sign/<TOKEN>/complete`.
  Joined from the token through `Recipient.token`: 1 row, envelope id equal to the run's.

## Owner mailbox

- `Please confirm your email` (account verification), `P6 Signer 0 has signed "capture t1 cap"`, and `Signing Complete!`.
  Only the envelope id in its body was checked (true). The stage does not read owner mailboxes: a run's recipient mailboxes
  are the only ones the completion join needs.

## Which field ties a completion email to its envelope

The completion email has no envelope header, so the field is the recipient token in the completion link. It is unique per
recipient. Joining it through the `Recipient` table gives the envelope, and the join matched the run's envelope in this capture.
Recipient addresses and subjects were not used. The stage (`src/load/pipeline-email.ts`) keeps only messages whose link is
`/sign/<token>/complete` and whose token belongs to a run recipient. Tokens are used in memory and never written.

## Mistake corrected

Earlier code assumed "Inbucket messages carry no envelope key" and left emails pending. The signing request does carry
`X-Documenso-Envelope-Id`, and both messages carry the recipient token. Both statements were unverified guesses before this capture.
