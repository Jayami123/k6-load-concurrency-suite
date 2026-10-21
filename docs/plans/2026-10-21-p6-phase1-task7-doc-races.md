# P6 Phase 1 Task 7: Documenso completion races `P6-DOC-RACE-001` + `P6-DOC-RACE-002` (plan only)

This is the implementation plan a weaker model will build from. Do not write code until Jayami
approves this document.

Structure and depth follow
[2026-10-20-p6-phase1-task5-cal-race-003.md](2026-10-20-p6-phase1-task5-cal-race-003.md) and
[2026-10-20-p6-phase1-task6-documenso-stack.md](2026-10-20-p6-phase1-task6-documenso-stack.md). Section
numbers follow them, with one change requested by Jayami: **Risks (§18), Decisions (§19) and numbered
Open questions (§20) close the document.** P1 UI-assertion and page-object rules do **not** apply. P6
asserts through HTTP and a read-only database oracle.

The source of this task is [2026-10-20-p6-phase1-roadmap.md](2026-10-20-p6-phase1-roadmap.md), section
"Task 7: `P6-DOC-RACE-001` + `P6-DOC-RACE-002`", and master plan DOC05 (§4, §6).

## Context

- Repo: [Jayami123/k6-load-concurrency-suite](https://github.com/Jayami123/k6-load-concurrency-suite)
  (P6). Plan branch **`plan/2026-10-20-p6-phase1`**. Before the probe it was merged with
  `origin/main` at `3c6b7c6` (PR #15, Task 6 merged; merge commit `21bd929`), so every file reference
  and every probe run uses Task 6 as merged. Written there only; no PR.
- Build branch (later): **`feat/2026-10-22-p6-doc-races`** cut from `origin/main`. Its first commit
  brings this doc in with
  `git checkout origin/plan/2026-10-20-p6-phase1 -- docs/plans/2026-10-21-p6-phase1-task7-doc-races.md`.
- Harness `qa-portfolio-harness#v0.2.11`: adapter
  `node_modules/qa-portfolio-harness/src/adapters/documenso.adapter.ts`. Fork: `Jayami123/documenso` @
  **`f4105e47eba56f5d8d7e70dd516a8fcc0c870d7c`** (`DOCUMENSO_REF`). Never edit the harness or the fork;
  `scripts/harness.mjs` owns start and stop.
- Cases in this task: **`P6-DOC-RACE-001`** (P0) and **`P6-DOC-RACE-002`** (P0), plus one unmapped extra
  (`extra (unmapped): sequential control for P6-DOC-RACE-001`, §4). **Not taken:** `P6-DOC-RACE-003`
  (later), and no ID is invented or renumbered. The observation ID `P6-OBS-DOC-002` (§2.13) is a finding
  label, not a case ID, and it is proposed for Jayami's approval (Open question 2).
- Probe status: **done once on 2026-10-21** (§2) in a Claude Code cloud session. The probe scripts lived
  only in the session scratchpad and imported the real `src/documenso/*`, `src/races/*` and
  `src/oracles/pg.ts`. Nothing was written to the repo, the harness or the fork. The stack was stopped
  with `npm run down:documenso` (twice, both exit 0).

## 1. Header

- Probe date 2026-10-21 (UTC). VM: 4 vCPU, 16 GB RAM, Docker 29.9.1, Node 22.23.3 in `/usr/local/bin`,
  Node 24.21.0 in `/opt/node24` (installed by the Task 6 setup, verified with `node -v`).
- `PRODUCTS_ROOT=/home/user/products`. `bash scripts/bootstrap.sh documenso` cloned the pin
  (`cloned f4105e47eba56f5d8d7e70dd516a8fcc0c870d7c`, depth 1) and ran `npm ci` under Node v24.21.0
  (`added 2053 packages in 1m`, `[bootstrap] done`, exit 0).
- The hosts entry `127.0.0.1 p6-webhook.test` was already present. `DANGEROUS_BYPASS_RATE_LIMITS=true`
  and `NEXT_PRIVATE_WEBHOOK_SSRF_BYPASS_HOSTS=p6-webhook.test` came from the harness defaults
  (Task 6 D2), not from a hand-set environment.
- Baseline on the merged branch, `npm run check`: Prettier clean, typecheck clean,
  `k6 inspect: 4 script(s) ok.`, `# tests 181`, `# pass 181`, `# fail 0`.
- Bring-up ran the fork's seed, which creates fixture users and about 1000 documents for a "medium"
  account. P6 never reads or writes those rows (the same rule as Task 6 D3).
- Timings below prove that the flow works. They are never published (AGENTS.md). Published numbers
  come only from GitHub Actions (median of at least 3 runs).

## 2. Probe findings (required; no guessed values)

### 2.1 Summary

| #   | Question                      | Observed                                                                                                                                                                                                                                                                                                                                                    |
| --- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | Cold `up:documenso`           | **269 s**, exit 0, returns by itself (Task 6 measured 266 s). `build:server` 46.9 s.                                                                                                                                                                                                                                                                        |
| P2  | Create and distribute         | v2 `envelope/create` 200 (106–126 ms), `recipient/create-many` 200, `field/create-many` 200, `distribute` 200 (200 ms). Every call in §2.3 is 200. No 5xx anywhere.                                                                                                                                                                                         |
| P3  | Completion endpoint           | `POST /api/trpc/recipient.completeDocumentWithToken`, body `{"json":{"token","documentId"}}`. Auth: **the recipient token only** (no session, no API token). `documentId` is the legacy number from `secondaryId`. (§2.4)                                                                                                                                   |
| P4  | Fill fields without the UI    | `POST /api/trpc/field.signFieldWithToken`, body `{"json":{"token","fieldId","value","isBase64":false}}`, 200 in 21–29 ms. `fieldId` is `Field.id` (number). Task 6 §2.7 named `envelope.field.sign`; that procedure does not exist (§2.12).                                                                                                                 |
| P5  | Sealed PDF in the DB          | The sealed document is the item's current `DocumentData` with `data <> initialData` (length 306 892 for `example.pdf`). `DocumentData` has no envelope column, so the count per document is a **per-trial delta** of `DocumentData` rows (§2.5).                                                                                                            |
| P6  | Sealing time                  | Seal job (`jobId internal.seal-document`): retried 0, p50 393 ms, max 937 ms; retried 1, p50 648 ms, max 838 ms. Each seal run writes one `DOCUMENT_COMPLETED` audit row (§2.5).                                                                                                                                                                            |
| P7  | Email time and identity       | Per recipient: `Please sign this document` (carries `X-Documenso-Envelope-Id`), `Waiting for others to complete signing`, `Signing Complete!` (no envelope header). Completed-email job p50 202 ms, p95 346 ms (§2.6).                                                                                                                                      |
| P8  | Webhook (receiver, rows, job) | One `DOCUMENT_COMPLETED` delivery per seal run. `payload.envelopeId` is the envelope id; `payload.id` is the legacy number. `WebhookCall` `SUCCESS` 200. Job `internal.execute-webhook` p95 29 ms (§2.7).                                                                                                                                                   |
| P9  | Race 001, parallel            | **Double seal in 20/20 trials**: 2 seal jobs (one retried in every trial), 2 `DOCUMENT_COMPLETED` audit rows, 2 completed emails per recipient, 2 webhook deliveries, 4 `DocumentData` rows. Both completions returned 200 `SIGNED`. **PRODUCT BUG** (§2.8, §2.10, §2.13).                                                                                  |
| P10 | Race 001 control, sequential  | 10/10 trials: 1 seal (retried 0), 1 audit row, 1 email per recipient, 1 webhook, 2 `DocumentData` rows. The duplication needs the concurrency (§2.8).                                                                                                                                                                                                       |
| P11 | Race 002, same recipient ×10  | 20/20 trials: **every response is 200**; one `SIGNED` and nine `ALREADY_SIGNED`; 1 seal, 1 audit row, 1 email, 1 webhook, 2 `DocumentData` rows. No 4xx and no 5xx. Not a product bug (§2.9).                                                                                                                                                               |
| P12 | 5xx                           | None. The web log has 0 `statusCode":500` lines. The six application-error lines all came from the probe: one `UNKNOWN_ERROR` from a field coordinate that was too large, one `MISSING_SIGNATURE_FIELD` from a distribute that ran before its field existed, and four `NOT_FOUND` from the probe's own dummy `envelope/delete` at the end of each race run. |
| P13 | Envelope delete               | `POST /api/v2/envelope/delete` `{"envelopeId"}` → 200 `{"success":true}`. **DRAFT and PENDING: hard delete** (rows gone). **COMPLETED: soft delete** (`deletedAt` set, rows kept). `DocumentData` rows survive every delete (§2.11).                                                                                                                        |
| P14 | Account delete                | `profile.deleteAccount` 200. Envelopes still owned by that user are **re-owned by the `deleted-account` service user** (`userId 2`, `teamId 2`). Team, user and token counts are safe; **envelope leak counts must key on the title prefix** (§2.11).                                                                                                       |
| P15 | Token, webhook create/delete  | As Task 6 §2.3 and §2.9: `apiToken.create` 200, `webhook.createWebhook` 200 for `http://p6-webhook.test:<port>/hook`, `webhook.deleteWebhook` 200, `apiToken.delete` 200.                                                                                                                                                                                   |
| P16 | Web log safety                | After every probe run: 0 matches for `api_[A-Za-z0-9]{8,}`, `Bearer `, `sessionId`, `/verify-email/`, `/sign/` plus 10 or more token characters. The guard in §11 passes.                                                                                                                                                                                   |

### 2.2 Bring-up (exact)

```bash
export PATH="/usr/local/bin:$PATH"
bash scripts/bootstrap.sh documenso                       # clone f4105e47…, npm ci under Node v24.21.0 (1 min)
npm run up:documenso                                      # exit 0, wall 269 s (cold)
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3001/api/auth/csrf   # 200
npm run down:documenso && npm run down:documenso          # both exit 0; :3001 closed, no build process left
```

- `up` ran Vite (client 55 s, SSR), `build:server` (rollup, 46.9 s), `npm run start -w @documenso/remix`
  and waited for `/signin` and `/api/auth/csrf` = 200.
- The harness picks Node 24 itself (`chooseDocumensoNode`); no `PATH` change was needed beyond
  `/usr/local/bin` first.

### 2.3 Document lifecycle (v2 API, one document, two recipients)

| #   | Request                                                                                                                                                                                                             | Observed                                                                                                                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `POST /api/v2/envelope/create`, multipart: part `payload` = `{"title","type":"DOCUMENT"}`, part `files` = `example.pdf` (39 842 bytes, the fork's `assets/example.pdf`), header `Authorization: Bearer <api token>` | 200 `{"id":"envelope_…"}`, 106–126 ms                                                                                                                                                                      |
| 2   | `POST /api/v2/envelope/recipient/create-many` `{"envelopeId","data":[{"email","name","role":"SIGNER","accessAuth":[],"actionAuth":[]}]}`                                                                            | 200 `{"data":[{"id":<number>,"token",…}]}`, 37–42 ms. No `signingOrder` given, so the envelope default applies: `DocumentSigningOrder` `PARALLEL` (Prisma default on `DocumentMeta`).                      |
| 3   | `GET /api/v2/envelope/<id>`                                                                                                                                                                                         | 200. `envelopeItems[0].id` (`envelope_item_…`), `recipients[].id` (numbers), `secondaryId` (`document_<n>`).                                                                                               |
| 4   | `POST /api/v2/envelope/field/create-many` `{"envelopeId","data":[{"recipientId","envelopeItemId","type":"SIGNATURE","page":1,"positionX","positionY","width","height"}]}`                                           | 200 `{"data":[{"id":<number field id>,"recipientId",…}]}`, 28 ms. **Position and size are percent of the page, maximum 100** (`positionY: 100` is refused with 400 `too_big`; the probe used `10 + 20·i`). |
| 5   | `POST /api/v2/envelope/distribute` `{"envelopeId"}`                                                                                                                                                                 | 200 `{"success":true,"recipients":[{"id","signingUrl"}]}`, 200 ms. `signingUrl` = `http://127.0.0.1:3001/sign/<recipient token>`. The token is the last path segment (§8.1).                               |
| 6   | Inbucket, each recipient mailbox                                                                                                                                                                                    | `Please sign this document` present right after distribute.                                                                                                                                                |

Notes: the fork's own e2e spec `packages/app-tests/e2e/api/v2/envelopes-api.spec.ts` uses the same
paths and bodies. The API token from Task 6 §2.3 works on every call here.

### 2.4 Completion endpoint, auth and payloads

The signing page calls two tRPC mutations with the **recipient token** and nothing else: no cookie,
no API token, no session. Source: `apps/remix/app/components/general/document-signing/` (field) and
`apps/remix/app/components/general/envelope-signing/envelope-signing-complete-dialog.tsx` (complete).

| Call                                                   | Request                                                                                                                    | Observed                                                                    |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `field.signFieldWithToken`                             | `POST /api/trpc/field.signFieldWithToken` `{"json":{"token","fieldId":<Field.id>,"value":"P6 Signer 0","isBase64":false}}` | 200 `{"result":{"data":{"json":{"id":847,…,"inserted":true,…}}}}`, 21–29 ms |
| `recipient.completeDocumentWithToken`, first recipient | `POST /api/trpc/recipient.completeDocumentWithToken` `{"json":{"token","documentId":<legacy n>}}`                          | 200 `{"result":{"data":{"json":{"status":"SIGNED"}}}}`, 254 ms              |
| same, last recipient (envelope becomes COMPLETED)      | same                                                                                                                       | 200 `{"result":{"data":{"json":{"status":"SIGNED"}}}}`, 404 ms              |
| same token again after SIGNED (sequential)             | same                                                                                                                       | **200** `{"result":{"data":{"json":{"status":"ALREADY_SIGNED"}}}}`          |
| 10 parallel, same token (race 002)                     | same                                                                                                                       | every trial: 10 × 200; one `SIGNED` and nine `ALREADY_SIGNED` (§2.9)        |

- `documentId` is the legacy number in `secondaryId` (`document_1018` → 1018). `fieldId` is the numeric
  `Field.id` (the create-many response returns it as `id`), not `secondaryId`.
- Why the duplicate is 200: `packages/trpc/server/recipient-router/router.ts` (`completeDocumentWithToken`)
  maps `RECIPIENT_ALREADY_SIGNED` to `{ status: "ALREADY_SIGNED" }` with HTTP 200 on purpose ("resolve
  retried, stale or concurrent duplicate completion requests idempotently"). The loser comes from
  `packages/lib/server-only/document/complete-document-with-token.ts`: the conditional
  `recipient.updateMany({ where: { id, signingStatus: { not: SIGNED } } })` inside the transaction returns
  count 0 and throws `RECIPIENT_ALREADY_SIGNED`.
- The field procedure is `signFieldWithToken` in `packages/trpc/server/field-router/router.ts`, mounted as
  `field` in `packages/trpc/server/router.ts`.

### 2.5 Sealed PDF, and the seal job

- **Sealed PDF = the envelope item's current `DocumentData`** whose `data` differs from `initialData`:
  `SELECT (dd.data <> dd."initialData") AS sealed FROM "EnvelopeItem" ei JOIN "DocumentData" dd ON dd.id = ei."documentDataId" WHERE ei."envelopeId" = $1`.
  The result is always one row, `sealed = true`, in every run. So this query alone **cannot** see a double
  seal, because the item always points at the latest seal.
- Each seal run stores a **new** `DocumentData` row and moves the item to it. The old row is never
  removed. `DocumentData` has no envelope column; `EnvelopeItem.documentDataId` is the only link.
  Therefore the per-document count of PDFs is a **per-trial delta** of `SELECT COUNT(*) FROM "DocumentData"`:
  - sequential control (10/10 trials): delta **2** (the uploaded original and one sealed copy);
  - race 002 (20/20): delta **2**;
  - race 001 parallel (20/20, settled): delta **4**.
- The seal job: `BackgroundJob` with `"jobId" = 'internal.seal-document'` (its `name` column holds the
  label `Seal Document`, so **query on `jobId`**), payload `{"documentId": <legacy>, "requestMetadata": …}`.
  Seal job durations from `BackgroundJob` over the probe window: retried 0, n 71, p50 393 ms, max 937 ms;
  retried 1, n 40, p50 648 ms, max 838 ms.
- The seal handler writes its `DOCUMENT_COMPLETED` audit row inside its transaction
  (`packages/lib/jobs/definitions/internal/seal-document.handler.ts`, `envelopeCompletedAuditLog`). So the
  count of `DOCUMENT_COMPLETED` rows per envelope = the number of seal runs that committed: sequential 1,
  race 002 1, race 001 parallel **2** (20/20, settled).

### 2.6 Emails (Inbucket)

- Mailbox = local part of the recipient address (Task 6 §2.5).
- Per recipient mailbox, the subjects seen during the probe:
  - `Please sign this document`: headers `X-Documenso-Envelope-Id: envelope_…`, `X-Documenso-Sender-User-Id`,
    `X-Documenso-Team-Id`;
  - `Waiting for others to complete signing` (first signer, after the first completion): no envelope header;
  - `Signing Complete!`: **no envelope header**.
- Completed emails per recipient mailbox after the race: race 001 parallel **2 per recipient** (20/20,
  settled); sequential control **1 per recipient** (10/10); race 002 **1** (20/20).
- BackgroundJob `send.document.completed.emails` (payload `{"envelopeId"}`): one per seal run; p50 202 ms,
  p95 346 ms, max 410 ms. `send.recipient.signed.email`: p50 85 ms, p95 106 ms.

### 2.7 Webhooks (receiver, `WebhookCall`, `BackgroundJob`)

- Delivered body `{event, payload, createdAt, webhookEndpoint}` (Task 6 §2.6). `payload.id` is the **legacy
  number** (type `number`, for example `1018`); `payload.envelopeId` is `envelope_…`. The count is by
  **`payload.envelopeId`** (the first draft of the probe matched `payload.id` and would have been wrong).
- Receiver deliveries per trial: race 001 parallel **2**; sequential control **1**; race 002 **1**.
- `WebhookCall` rows for the webhook: one `SUCCESS` with `responseCode` 200 per delivery.
- Event: `DOCUMENT_COMPLETED`, fired from the seal handler. `DOCUMENT_RECIPIENT_COMPLETED` also fires for
  each recipient, but the probe subscribed only to `DOCUMENT_COMPLETED`, so no job exists for it.
- BackgroundJob `internal.execute-webhook`: p50 14 ms, p95 29 ms, max 42 ms; payload
  `{"data": {"id": <legacy>, "title", "source", "status", …}}`. Filter on `payload->'data'->>'id'`.

### 2.8 DOC-RACE-001: two last recipients completing in parallel

| Run                                                    | Trials | HTTP per completion     | Seal jobs (status)       | Seal retried          | `DOCUMENT_COMPLETED` rows | Completed emails per recipient | Webhook deliveries | `WebhookCall` rows | `DocumentData` delta | Spread max | Trial p50 |
| ------------------------------------------------------ | ------ | ----------------------- | ------------------------ | --------------------- | ------------------------- | ------------------------------ | ------------------ | ------------------ | -------------------- | ---------- | --------- |
| parallel, first run (read before seal jobs settled)    | 20     | 200 × 2                 | 2 (`PROCESSING` at read) | not read              | 1 at read                 | 2                              | 2                  | 2                  | not read             | 0.41 ms    | 3164 ms   |
| parallel, settled (the figures this section relies on) | 20     | 200 × 2 (both `SIGNED`) | 2 (both `COMPLETED`)     | exactly one per trial | **2**                     | **2**                          | **2**              | **2**              | **4**                | 0.39 ms    | 3701 ms   |
| control: sequential, 300 ms gap                        | 10     | 200 × 2 (both `SIGNED`) | 1 (`COMPLETED`)          | 0                     | 1                         | 1                              | 1                  | 1                  | 2                    | n/a        | n/a       |

Evidence (probe run, `documenso-web.log`; the lines below are consecutive in the log):

- Both completions log `Triggering job internal.seal-document`.
- One seal run fails with Prisma `P2025` ("No record was found for an update", model `EnvelopeItem`,
  call `envelopeItem.update` in `seal-document.handler`). The job runner logs `Job internal.seal-document
failed BackgroundTaskFailedError` and retries it; the retry completes. 40 of 111 seal jobs in the
  two-hour window show `retried = 1`, all from the parallel race trials.
- The failing update matches `where: { envelopeId, documentDataId: oldDocumentDataId }`. Once the other seal
  run has moved the item to its new `DocumentData`, no row matches.

Classification: **PRODUCT BUG**, the finding `P6-OBS-DOC-002` (§2.13). Each parallel last-recipient
completion produces a second seal, a second completed email per recipient, a second
`DOCUMENT_COMPLETED` webhook and a second `DocumentData` row. The envelope still ends COMPLETED with one
sealed item, so the damage is duplicate side effects, not a broken PDF. Reproduced in 40/40 trials across
two independent 20-trial runs. The sequential control is clean, so the duplication needs the concurrency.

### 2.9 DOC-RACE-002: one recipient, 10 parallel completions

- 20 trials, each `fireTogether(10)` with the same recipient token and warm `GET /api/auth/csrf`.
- Every response is **HTTP 200**: 200 of 200 responses.
- In every trial the bodies are exactly one `{"status":"SIGNED"}` and nine
  `{"status":"ALREADY_SIGNED"}`. The DB guard (`updateMany … signingStatus != SIGNED`) lets one request win;
  the router maps the others to `ALREADY_SIGNED`.
- Per trial: seal jobs 1 (`COMPLETED`, retried 0) in 20/20; `DOCUMENT_COMPLETED` rows 1; completed emails 1;
  webhook deliveries 1; `WebhookCall` rows 1 (`SUCCESS` 200); `DocumentData` delta 2. Spread max 2.28 ms;
  trial p50 2737 ms.
- Result: **no product bug.** The roadmap's oracle, "one 2xx and nine 4xx", does not match this product:
  duplicates are 200 by design (`ALREADY_SIGNED` is the documented "resolve idempotently" branch). The plan
  therefore changes the oracle to the observed contract (D16, Open question 1).
- Caveat: the probe stored the unique body summaries per trial, not per-body counts. The one-`SIGNED`
  claim rests on the DB guard and on the single seal. The new run-case stores per-body counts (§8.5).

### 2.10 Root cause (code; recorded, not fixed)

Source at pin `f4105e47`:

1. `packages/lib/server-only/document/complete-document-with-token.ts`: each winning completion commits its own
   recipient update in a transaction, then reads `haveAllRecipientsSigned` (`envelope.findFirst` with
   `recipients: { every: { OR: [SIGNED, CC] } }`) and, when true, calls
   `jobs.triggerJob({ name: 'internal.seal-document' })`. Two winners that both commit before either
   read both see "all signed", so both trigger a seal.
2. `packages/lib/jobs/definitions/internal/seal-document.handler.ts`: there is **no "already COMPLETED"
   guard**. The handler reads the envelope once and seals it. Both runs then race on
   `envelopeItem.update({ where: { envelopeId, documentDataId: oldDocumentDataId } })`; the second one
   matches nothing (P2025), the job runner retries it, and the retry seals again.
3. The side effects (completed email job and `DOCUMENT_COMPLETED` webhook) are triggered by the seal handler,
   so each seal run repeats them.

### 2.11 Cleanup and leak (live)

| Operation                                                                              | Observed                                                                                                                                                                                                                                                                                                  |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/v2/envelope/delete` on a DRAFT (1 item, no recipient)                       | 200. **Hard delete**: `Envelope`, `EnvelopeItem`, `Recipient`, `Field`, `DocumentAuditLog` rows all gone. `DocumentData` residue was not measured for this exact case; the first, aborted probe run left +1 `DocumentData` row for an unsent envelope.                                                    |
| `POST /api/v2/envelope/delete` on a PENDING envelope (distributed, unsigned recipient) | 200. **Hard delete**: all rows gone (counts 0).                                                                                                                                                                                                                                                           |
| `POST /api/v2/envelope/delete` on a COMPLETED envelope                                 | 200 `{"success":true}`. **Soft delete**: `Envelope.deletedAt` set; rows kept. Probe counts after all runs: 71 `EnvelopeItem`, 122 `Recipient`, 1318 `DocumentAuditLog` rows remain for soft-deleted `p6-qa-…` envelopes.                                                                                  |
| `DocumentData` rows after any delete                                                   | **Never removed by the API.** Each completed document leaves 2 rows (sequential) or 4 (double seal). `EnvelopeItem` → `DocumentData` is the only link, and deleting the item does not delete the data row.                                                                                                |
| `webhook.deleteWebhook`, `apiToken.delete`                                             | 200 (Task 6 §2.9, unchanged).                                                                                                                                                                                                                                                                             |
| `profile.deleteAccount`                                                                | 200. The user row goes. Envelopes the user still owns are moved to the `deleted-account` service user (`packages/lib/server-only/envelope/orphan-envelopes.ts`, `envelope.updateMany` to `serviceAccount.id`). All 71 probe envelopes ended with `userId 2` / `teamId 2` after their owners were deleted. |
| Leak after cleanup (title prefix, `deletedAt IS NULL`)                                 | **0** in every run (20/20, 10/10, 20/20). Users with the run prefix: 0. Webhooks and API tokens for the run's team: 0 (the team row is removed with the account).                                                                                                                                         |

Consequence for the oracle: a leak count keyed on `teamId` or `userId` **misses** completed envelopes after
`deleteAccount`, because they are re-owned. The leak check keys on the title prefix (`"title" LIKE 'p6-qa-…%'`)
and on live rows (`"deletedAt" IS NULL`). Soft-deleted completed envelopes and `DocumentData` residue are
product behaviour: the plan records them as residue, not as a leak (D24).

### 2.12 Corrections to Task 6 (recorded here; the Task 6 file is not edited by this plan)

- Task 6 §2.7 names `envelope.field.sign` for filling a field. **No such procedure exists** in this fork.
  The signing page calls `field.signFieldWithToken` (router `field`), with `fieldId` = `Field.id`. Task 6's
  own `recipient.completeDocumentWithToken` step is correct; the body takes the legacy `documentId`.
- Task 6 §2.7 reads the recipient token from `GET /api/v2/envelope/<id>`. That also works, and the GET does
  return a `token` on each recipient. This task takes the token from `distribute` (`signingUrl`), which is
  the one the signing page is opened with.
- A one-line fix to Task 6 §2.7 can ride with this build (Open question 8).

### 2.13 Findings to record (not fixed here)

- **`P6-OBS-DOC-002`, PRODUCT BUG, severity medium (proposed; Open question 2).** Two last recipients completing
  in parallel seal the same document twice: 2 seal jobs (one retried after P2025), 2 `DOCUMENT_COMPLETED`
  audit rows, 2 completed emails per recipient, 2 `DOCUMENT_COMPLETED` webhook deliveries, and 4
  `DocumentData` rows. The envelope stays COMPLETED with one sealed item. Reproduced 40/40 across two runs;
  the sequential control is clean. Cause: §2.10. Test: `P6-DOC-RACE-001` with `test.fail()` (§10). A fix is
  out of scope; a likely shape is one winner only (for example a conditional envelope update PENDING →
  COMPLETED that gates the seal trigger) plus an "already COMPLETED" guard at the top of the seal handler.
- **Not a finding:** duplicate completion returns 200 `ALREADY_SIGNED` by design (§2.9). The roadmap's "nine
  4xx" expectation is corrected (D16).
- **Task 6 `P6-OBS-DOC-001`** (500 on a wrong password, Task 6 §2.11) is unchanged and not touched here.
- Harness notes: none new. Task 6's H1 (Inbucket `latest`) and H3 (`authenticate()` still asks for a token)
  stay open as Task 6 §21 follow-ups.

## 3. Goal and scope

**Goal.** Prove that a document's completion is single-shot under concurrency, and record what the product
really does. Two cases (`P6-DOC-RACE-001`, `P6-DOC-RACE-002`) plus one control, each with a histogram and a
per-trial oracle; `P6-DOC-RACE-001` expects a product bug under `test.fail()`; CI runs the cases on PRs at
about 5 trials and on `main`, nightly and `workflow_dispatch` at 50.

**In:** `src/documenso/{payloads,api,invariants,run-case}.ts`; additions to `src/documenso/oracle.ts`;
unit tests; `tests/documenso/races/doc-race-001-last-recipients.spec.ts` (with the control),
`tests/documenso/races/doc-race-002-double-submit.spec.ts`; the `documenso-smoke` race step and artefact
upload in `.github/workflows/perf.yml`; a README subsection.

**Out:** fixing the seal race; any edit to the harness, the fork or `qa-portfolio-harness`; `P6-DOC-RACE-003`;
rerun-on-spread logic; k6 load; `P6-OBS-DOC-001`; reject, cancel and delete races (§5); changes to
`medusa-smoke`, `cal-smoke`, `src/races/*` and `src/oracles/pg.ts`.

## 4. Test-case mapping

| Name                                           | File                                                         | Project          | Histogram `caseId`             | Concurrency | Product-correct expectation                                                                                                   | Status in this task                                                  |
| ---------------------------------------------- | ------------------------------------------------------------ | ---------------- | ------------------------------ | ----------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `P6-DOC-RACE-001` two last recipients          | `tests/documenso/races/doc-race-001-last-recipients.spec.ts` | `documenso-race` | `P6-DOC-RACE-001`              | 2           | both 200 `SIGNED`; 1 seal job; 1 `DOCUMENT_COMPLETED` row; 1 completed email per recipient; 1 webhook; `DocumentData` delta 2 | `test.fail()` with `P6-OBS-DOC-002`; passes while the bug reproduces |
| `P6-DOC-RACE-002` same recipient ×10           | `tests/documenso/races/doc-race-002-double-submit.spec.ts`   | `documenso-race` | `P6-DOC-RACE-002`              | 10          | every 200; exactly one `SIGNED`; nine `ALREADY_SIGNED`; no 4xx, no 5xx; 1 seal job; 1 audit row; 1 email; 1 webhook; delta 2  | plain assertions (no `test.fail()`); passes                          |
| `extra (unmapped)`: sequential control for 001 | same file as `P6-DOC-RACE-001` (second `describe`)           | `documenso-race` | `extra-doc-sequential-control` | 2           | same as 001, one completion after another; control must be clean                                                              | plain assertions; passes; failure is a TEST BUG (§10)                |
| documenso self-test (Task 6)                   | `tests/documenso/races/documenso-self-test.spec.ts`          | `documenso-race` | `documenso-self-test`          | 20          | unchanged                                                                                                                     | unchanged                                                            |

`npx playwright test --list --project=documenso-race` after the build: **4 tests in 3 files**.

## 5. Extra risky cases

| #   | Case                                                                                         | In this task?       | Reason                                                                                                                                                            |
| --- | -------------------------------------------------------------------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Sequential control of 001 (completions one after another)                                    | **In** (extra)      | Shows that the duplicate needs the concurrency, and catches harness false positives (D26).                                                                        |
| 2   | Two last recipients where one is slow to sign its field (ordering of field fill vs complete) | Later               | It changes setup timing, not the race; can wait for the completion race of a later case.                                                                          |
| 3   | Completion vs reject (`recipient.rejectDocumentWithToken`) on the same envelope              | Later               | Different terminal state (REJECTED) and its own seal path (`isRejected`); needs its own oracle. Phase 2.                                                          |
| 4   | Completion vs `envelope/delete` on a PENDING envelope                                        | Later               | A hard delete while completing can produce a 5xx or partial rows. Needs a delete-versus-sign invariant and a different cleanup order. Not a roadmap case.         |
| 5   | Completion vs cancel of the document                                                         | Later               | Same reason as 4: a state-machine race with its own invariant.                                                                                                    |
| 6   | Webhook retry after a slow receiver                                                          | Later               | A slow receiver can make one delivery look like two, which would confuse 001's delivery count. The receiver answers at once today; a delay knob comes first.      |
| 7   | Duplicate seal job pickup by two workers                                                     | Later               | The harness runs jobs inside the web process (`NEXT_PRIVATE_JOBS_PROVIDER=local`, Task 6 §2.7); there is no second worker to race. Revisit with a worker process. |
| 8   | Sequential signing order with a concurrent completion from a recipient not next in line      | Later               | Different invariant (`RECIPIENT_OUT_OF_TURN`) and different order semantics.                                                                                      |
| 9   | Dictated next signer (`nextSigner`) during a completion                                      | Later               | Needs `allowDictateNextSigner` and a two-step state change.                                                                                                       |
| 10  | Completion with 2FA access auth (`accessAuthOptions`)                                        | Later               | Needs an authenticated recipient setup; out of the P6 scope for now.                                                                                              |
| 11  | Seal retry itself (the P2025 retry under a double seal)                                      | **In**, as evidence | Recorded per trial as `sealJobsRetried` and in §2.10; not a separate case.                                                                                        |
| 12  | Signing token reuse after completion (`P6-DOC-RACE-003`)                                     | Later (roadmap)     | Not taken in this task.                                                                                                                                           |

## 6. Architecture (every file touched, one responsibility each)

| File                                                         | Change             | Responsibility                                                                                                                                                                                                                              |
| ------------------------------------------------------------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/documenso/payloads.ts`                                  | new                | Pure request bodies and parsers: recipient and field bodies, the legacy id, the token from a signing URL, the title. No I/O.                                                                                                                |
| `src/documenso/api.ts`                                       | new                | `fetch` calls: v2 REST (create, recipients, get, fields, distribute, delete) and the anonymous tRPC pair (sign field, complete). Errors never echo a body.                                                                                  |
| `src/documenso/invariants.ts`                                | new                | Pure: classify one completion response; per-trial invariants for 001, 002 and the control; labelled violation strings.                                                                                                                      |
| `src/documenso/oracle.ts`                                    | edit (Task 6 file) | Add SQL constants and waiting readers: seal jobs, email jobs, webhook jobs, `DOCUMENT_COMPLETED` audit, sealed item, `DocumentData` count, live envelope leak, completed emails. Task 6's `readWebhookCalls` and `leakCheck` are unchanged. |
| `src/documenso/run-case.ts`                                  | new                | `startRun` / `endRun` (per-run account, token, webhook, receiver, cleanup) and `runCompletionCase` (trial loop for 001, 002 and the control).                                                                                               |
| `src/documenso/account.ts`, `src/documenso/inbucket.ts`      | unchanged          | Task 6 helpers, used as they are.                                                                                                                                                                                                           |
| `tests/documenso/races/doc-race-001-last-recipients.spec.ts` | new                | `P6-DOC-RACE-001` (with `test.fail()`) and the sequential control extra.                                                                                                                                                                    |
| `tests/documenso/races/doc-race-002-double-submit.spec.ts`   | new                | `P6-DOC-RACE-002`.                                                                                                                                                                                                                          |
| `tests/unit/documenso-payloads.test.ts`                      | new                | Bodies, legacy id, token parsing.                                                                                                                                                                                                           |
| `tests/unit/documenso-api.test.ts`                           | new                | `api.ts` against a `node:http` fake: status to label mapping, no body in messages, tRPC path and body.                                                                                                                                      |
| `tests/unit/documenso-invariants.test.ts`                    | new                | Every pass and fail branch of §8.4.                                                                                                                                                                                                         |
| `tests/unit/documenso-oracle.test.ts`                        | edit (Task 6 file) | Extend the SELECT-only, no token/password/secret and quoting checks to the new queries.                                                                                                                                                     |
| `.github/workflows/perf.yml`                                 | edit               | `documenso-smoke`: race step, summary lines, token guard over the log and the histograms, uploads.                                                                                                                                          |
| `README.md`                                                  | edit               | "Documenso completion races" subsection (§16).                                                                                                                                                                                              |

Unchanged: `src/races/*`, `src/oracles/pg.ts`, `src/medusa/*`, `src/cal/*`, `src/documenso/account.ts`,
`src/documenso/inbucket.ts`, `src/documenso/env.ts`, `scripts/*`, `package.json`, `playwright.config.ts`
(project `documenso-race` already matches `tests/documenso/races`), `.env.example`, the harness, the fork,
`medusa-smoke`, `cal-smoke`.

## 7. Histogram fields

Per case: `createHistogram({ caseId, title, product: "documenso", concurrency, trials })` with concurrency
2 (001 and control), 10 (002). `trials` = `raceTrialsFromEnv()` (D22).

Per-trial `oracle` (primitives only; `RaceOracleValue`):

| Field                                                                                       | Meaning                                                                                   |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `sealJobs`                                                                                  | rows with `jobId = 'internal.seal-document'` and this document (expect 1)                 |
| `sealJobsRetried`                                                                           | how many of them have `retried > 0`                                                       |
| `completedAuditRows`                                                                        | `DOCUMENT_COMPLETED` rows for the envelope (expect 1)                                     |
| `sealedItemDocs`                                                                            | items whose current `DocumentData` is sealed (expect 1 per item)                          |
| `docDataDelta`                                                                              | change in `COUNT(*)` of `DocumentData` over the trial (expect 2)                          |
| `emailJobs`                                                                                 | `send.document.completed.emails` jobs for the envelope (expect 1)                         |
| `completedEmailsMin`, `completedEmailsMax`                                                  | `Signing Complete!` messages per recipient mailbox (expect 1 each)                        |
| `webhookDeliveries`                                                                         | receiver deliveries with `payload.envelopeId` equal to the envelope (expect 1)            |
| `webhookCallRows`                                                                           | `WebhookCall` rows with `requestBody.payload.envelopeId` equal to the envelope (expect 1) |
| `signedResponses`, `alreadySignedResponses`, `clientErrorResponses`, `serverErrorResponses` | counts of the classified completion responses                                             |
| `setupOk`                                                                                   | `true` when every setup call (create, recipients, fields, distribute, signing) was 200    |

Histogram `oracle` (aggregates):

| Field                                                                                       | Meaning                                                               |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `trialsSingleSeal`, `trialsDoubleSeal`                                                      | trials with exactly one seal job, and with two or more                |
| `sealJobsRetriedTotal`                                                                      | total retried seal jobs                                               |
| `docDataDeltaMin`, `docDataDeltaMax`                                                        | range of the per-trial delta                                          |
| `signedResponses`, `alreadySignedResponses`, `clientErrorResponses`, `serverErrorResponses` | totals over trials                                                    |
| `softDeletedEnvelopes`                                                                      | residue, informational (D24)                                          |
| `leakEnvelopesLive`                                                                         | live envelopes with the run prefix after cleanup (must be 0)          |
| `leakUsers`, `leakWebhooks`, `leakApiTokens`, `leakMails`                                   | Task 6 `leakCheck` counts, plus the mailboxes list length (must be 0) |

`statusCounts` (HTTP status of every completion request) is filled with `mergeStatusCounts`, as in Task 6.
`verdict`: `pass` only when every trial is `ok` and `invariantViolations` is empty. For 001, `verdict` is
`fail` while the bug reproduces, and the Playwright test is green because of `test.fail()` (§10); the README
says so.

## 8. Oracle and invariants (exact code)

### 8.1 `src/documenso/payloads.ts` (new, pure)

```ts
// Pure request bodies and parsers for the Documenso completion races (plan §8.1). No I/O.

export type RecipientBody = {
  email: string;
  name: string;
  role: "SIGNER";
  accessAuth: [];
  actionAuth: [];
};

/** One recipient mailbox per trial (plan D19). Lowercase, so Inbucket's mailbox name is stable. */
export function recipientEmail(casePfx: string, trial: number, index: number): string {
  return `${casePfx}-t${trial}-r${index}@example.com`;
}

export function recipientBodies(casePfx: string, trial: number, count: number): RecipientBody[] {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error("TEST BUG: recipientBodies count must be an integer >= 1");
  }
  return Array.from({ length: count }, (_, index) => ({
    email: recipientEmail(casePfx, trial, index),
    name: `P6 Signer ${index}`,
    role: "SIGNER" as const,
    accessAuth: [] as [],
    actionAuth: [] as [],
  }));
}

/** Document title. The case prefix comes first so the leak LIKE pattern matches it (plan §9). */
export function documentTitle(casePfx: string, trial: number, label: string): string {
  return `${casePfx} t${trial} ${label}`;
}

/**
 * One SIGNATURE field per recipient on page 1. Positions and sizes are percent (max 100, plan §2.3):
 * with positionY = 10 + 20 * index, at most five recipients fit.
 */
export function signatureFieldBodies(input: {
  envelopeItemId: string;
  recipientIds: number[];
}): Array<Record<string, unknown>> {
  if (input.recipientIds.length > 5) {
    throw new Error("TEST BUG: more than five recipients do not fit the field layout");
  }
  return input.recipientIds.map((recipientId, index) => ({
    recipientId,
    envelopeItemId: input.envelopeItemId,
    type: "SIGNATURE",
    page: 1,
    positionX: 10,
    positionY: 10 + index * 20,
    width: 20,
    height: 5,
  }));
}

/** Plain text for a SIGNATURE field (accepted with isBase64 false, plan §2.4). */
export function signValue(index: number): string {
  return `P6 Signer ${index}`;
}

export function signFieldBody(token: string, fieldId: number, value: string) {
  return { token, fieldId, value, isBase64: false };
}

export function completeBody(token: string, documentId: number) {
  return { token, documentId };
}

/** `document_1018` becomes 1018. Anything else is a TEST BUG: the completion route needs the legacy number. */
export function legacyDocumentId(secondaryId: string): number {
  const match = /^document_(\d+)$/.exec(secondaryId);
  if (!match)
    throw new Error(`TEST BUG: secondaryId is not document_<n>: ${secondaryId.slice(0, 40)}`);
  return Number(match[1]);
}

/** Last path segment of `…/sign/<token>`. The token is never logged. */
export function signingTokenFromUrl(signingUrl: string): string {
  const match = /\/sign\/([A-Za-z0-9_-]+)$/.exec(signingUrl);
  if (!match) throw new Error("TEST BUG: distribute signingUrl has no /sign/<token>");
  return match[1];
}
```

`tests/unit/documenso-payloads.test.ts` (node:test, `assert/strict`):

- `recipientEmail("p6-qa-x-p6-doc-race-001", 3, 1)` equals `p6-qa-x-p6-doc-race-001-t3-r1@example.com`.
- `recipientBodies(…, 0)` throws `TEST BUG`; `recipientBodies(…, 2)` returns two bodies, distinct emails,
  `role` `SIGNER`.
- `signatureFieldBodies` for `[7, 8]`: `positionY` `10` and `30`, all `<= 100`; for six recipients: throws
  `TEST BUG`.
- `legacyDocumentId("document_1018")` is `1018`; `legacyDocumentId("envelope_abc")` throws `TEST BUG`.
- `signingTokenFromUrl("http://127.0.0.1:3001/sign/abc_DEF-1")` is `abc_DEF-1`; a URL without `/sign/` throws
  `TEST BUG`.
- `signFieldBody("t", 5, "v")` deep-equals `{ token: "t", fieldId: 5, value: "v", isBase64: false }`;
  `completeBody("t", 9)` deep-equals `{ token: "t", documentId: 9 }`.

### 8.2 `src/documenso/api.ts` (new)

fetch helpers for the completion races. Errors name the call and the HTTP status only. Response
bodies can hold recipient tokens (the create-many response does), so a body is never put in a message.

```ts
import { completeBody, signFieldBody, signingTokenFromUrl } from "./payloads.ts";

export type HttpResult = { status: number; text: string; ms: number };

function parse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function timed(url: string, init: RequestInit): Promise<HttpResult> {
  const started = performance.now();
  const res = await fetch(url, init);
  const text = await res.text();
  return { status: res.status, text, ms: performance.now() - started };
}

/** Status-only failure. 5xx is a PRODUCT BUG, 429 is ENV (limiter not bypassed), other codes are TEST BUG. */
export function expectOk(label: string, res: HttpResult): void {
  if (res.status === 200) return;
  const kind = res.status >= 500 ? "PRODUCT BUG" : res.status === 429 ? "ENV" : "TEST BUG";
  throw new Error(`${kind}: ${label} HTTP ${res.status}`);
}

export async function v2Post(
  baseUrl: string,
  token: string,
  path: string,
  body: unknown,
): Promise<HttpResult> {
  return timed(`${baseUrl}/api/v2${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function createEnvelope(
  baseUrl: string,
  token: string,
  title: string,
  pdf: Uint8Array,
): Promise<string> {
  const form = new FormData();
  form.append("payload", JSON.stringify({ title, type: "DOCUMENT" }));
  form.append("files", new File([pdf], "example.pdf", { type: "application/pdf" }));
  const res = await timed(`${baseUrl}/api/v2/envelope/create`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: form,
  });
  expectOk("envelope/create", res);
  const id = (parse(res.text) as { id?: unknown } | null)?.id;
  if (typeof id !== "string") throw new Error("TEST BUG: envelope/create returned no id");
  return id;
}

/** Numeric recipient ids, in request order. */
export async function createRecipients(
  baseUrl: string,
  token: string,
  envelopeId: string,
  bodies: Array<Record<string, unknown>>,
): Promise<number[]> {
  const res = await v2Post(baseUrl, token, "/envelope/recipient/create-many", {
    envelopeId,
    data: bodies,
  });
  expectOk("recipient/create-many", res);
  const data = (parse(res.text) as { data?: Array<{ id?: unknown }> } | null)?.data ?? [];
  if (data.length !== bodies.length || data.some((r) => typeof r.id !== "number")) {
    throw new Error("TEST BUG: recipient/create-many returned an unexpected shape");
  }
  return data.map((r) => r.id as number);
}

export async function getEnvelope(
  baseUrl: string,
  token: string,
  envelopeId: string,
): Promise<{ itemId: string; secondaryId: string }> {
  const res = await timed(`${baseUrl}/api/v2/envelope/${envelopeId}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  expectOk("envelope GET", res);
  const json = parse(res.text) as {
    envelopeItems?: Array<{ id?: unknown }>;
    secondaryId?: unknown;
  } | null;
  const itemId = json?.envelopeItems?.[0]?.id;
  if (typeof itemId !== "string" || typeof json?.secondaryId !== "string") {
    throw new Error("TEST BUG: envelope GET has no item id or secondaryId");
  }
  return { itemId, secondaryId: json.secondaryId };
}

/** `Field.id` (used by signFieldWithToken) and the recipient each field belongs to. */
export async function createSignatureFields(
  baseUrl: string,
  token: string,
  envelopeId: string,
  bodies: Array<Record<string, unknown>>,
): Promise<Array<{ id: number; recipientId: number }>> {
  const res = await v2Post(baseUrl, token, "/envelope/field/create-many", {
    envelopeId,
    data: bodies,
  });
  expectOk("field/create-many", res);
  const data =
    (parse(res.text) as { data?: Array<{ id?: unknown; recipientId?: unknown }> } | null)?.data ??
    [];
  if (
    data.length !== bodies.length ||
    data.some((f) => typeof f.id !== "number" || typeof f.recipientId !== "number")
  ) {
    throw new Error("TEST BUG: field/create-many returned an unexpected shape");
  }
  return data as Array<{ id: number; recipientId: number }>;
}

/** Signing token per recipient id (from signingUrl). Keyed by id, never by position. */
export async function distribute(
  baseUrl: string,
  token: string,
  envelopeId: string,
): Promise<Map<number, string>> {
  const res = await v2Post(baseUrl, token, "/envelope/distribute", { envelopeId });
  expectOk("distribute", res);
  const recipients =
    (parse(res.text) as { recipients?: Array<{ id?: unknown; signingUrl?: unknown }> } | null)
      ?.recipients ?? [];
  const tokens = new Map<number, string>();
  for (const r of recipients) {
    if (typeof r.id !== "number" || typeof r.signingUrl !== "string") {
      throw new Error("TEST BUG: distribute returned an unexpected shape");
    }
    tokens.set(r.id, signingTokenFromUrl(r.signingUrl));
  }
  return tokens;
}

/** Returns the HTTP status. The caller decides; 200 is expected. */
export async function deleteEnvelope(
  baseUrl: string,
  token: string,
  envelopeId: string,
): Promise<number> {
  return (await v2Post(baseUrl, token, "/envelope/delete", { envelopeId })).status;
}

// Recipient-token calls: what the signing page sends. No cookie, no API token.

async function trpcMutation(baseUrl: string, proc: string, json: unknown): Promise<HttpResult> {
  return timed(`${baseUrl}/api/trpc/${proc}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ json }),
  });
}

export function signFieldWithToken(
  baseUrl: string,
  token: string,
  fieldId: number,
  value: string,
): Promise<HttpResult> {
  return trpcMutation(baseUrl, "field.signFieldWithToken", signFieldBody(token, fieldId, value));
}

export function completeWithToken(
  baseUrl: string,
  token: string,
  documentId: number,
): Promise<HttpResult> {
  return trpcMutation(
    baseUrl,
    "recipient.completeDocumentWithToken",
    completeBody(token, documentId),
  );
}
```

`tests/unit/documenso-api.test.ts` (node:test, `assert/strict`). Start a `node:http` fake on
`127.0.0.1:0` in the style of `tests/unit/documenso-inbucket.test.ts`. It answers by path and records each
request body and whether a `cookie` header was sent.

- `POST /api/v2/envelope/create` → 200 `{"id":"envelope_x"}`: `createEnvelope` returns `envelope_x`.
- `POST /api/v2/envelope/recipient/create-many` → 200 `{"data":[{"id":5,"token":"secret-token-5"},{"id":6,"token":"secret-token-6"}]}`:
  `createRecipients` returns `[5, 6]`, and no error message contains `secret-token`.
- `POST /api/v2/envelope/distribute` → 200 `{"recipients":[{"id":6,"signingUrl":"http://x/sign/tok6"},{"id":5,"signingUrl":"http://x/sign/tok5"}]}`:
  `distribute(...).get(5) === "tok5"` (order does not matter).
- Status mapping: a route answering 500 with body `leaked-body` makes `createEnvelope` throw a message that
  starts with `PRODUCT BUG: envelope/create HTTP 500` and does not contain `leaked-body`; 400 gives a
  message starting `TEST BUG:`; 429 gives one starting `ENV:`.
- `/api/trpc/field.signFieldWithToken` records `{"json":{"token":"t","fieldId":9,"value":"v","isBase64":false}}`.
- `completeWithToken("t", 42)` posts `/api/trpc/recipient.completeDocumentWithToken` with
  `{"json":{"token":"t","documentId":42}}`, and no `cookie` header is sent.
- `deleteEnvelope` posts `{"envelopeId":"envelope_x"}` to `/api/v2/envelope/delete` and returns 200.

### 8.3 `src/documenso/oracle.ts` additions (edit of the Task 6 file)

Add these after the Task 6 constants. Add `import { createInbucketClient } from "./inbucket.ts";` to the
imports (Task 6 already imports `selectRows` and `waitForStable`, and `type pg`). Keep the select lists
simple: the Task 6 SELECT-only test reads the text between the first `SELECT` and the first `FROM`.

```ts
export const ENVELOPE_SQL = `SELECT id, "secondaryId", status::text AS status FROM "Envelope" WHERE id = $1`;

/** Seal jobs for one legacy document id. Query on jobId: `name` is the display label. */
export const SEAL_JOBS_SQL = `
SELECT id, status::text AS status, retried
FROM "BackgroundJob"
WHERE "jobId" = 'internal.seal-document' AND payload->>'documentId' = $1
ORDER BY "submittedAt"
`;

/** One completed-email job per seal run; the payload carries the envelope id. */
export const EMAIL_JOBS_SQL = `
SELECT id, status::text AS status
FROM "BackgroundJob"
WHERE "jobId" = 'send.document.completed.emails' AND payload->>'envelopeId' = $1
ORDER BY "submittedAt"
`;

/** Webhook jobs for one legacy document id (the execute-webhook payload nests the document as data.id). */
export const WEBHOOK_JOBS_SQL = `
SELECT id, status::text AS status
FROM "BackgroundJob"
WHERE "jobId" = 'internal.execute-webhook' AND payload->'data'->>'id' = $1
ORDER BY "submittedAt"
`;

/** Seal runs that committed. The seal writes this row inside its own transaction. */
export const DOCUMENT_COMPLETED_AUDIT_SQL = `
SELECT COUNT(*)::int AS n
FROM "DocumentAuditLog"
WHERE "envelopeId" = $1 AND type::text = 'DOCUMENT_COMPLETED'
`;

/** Each item's current DocumentData, and whether it differs from the upload. */
export const ITEM_SEALED_SQL = `
SELECT (dd.data <> dd."initialData") AS sealed
FROM "EnvelopeItem" ei
JOIN "DocumentData" dd ON dd.id = ei."documentDataId"
WHERE ei."envelopeId" = $1
`;

/** Whole-table count. A per-trial delta of this is the sealed-PDF count (plan §2.5, D18). */
export const DOCUMENT_DATA_COUNT_SQL = `SELECT COUNT(*)::int AS n FROM "DocumentData"`;

/** Live envelopes of the run. Soft-deleted completed envelopes do not count. */
export const LIVE_ENVELOPE_LEAK_SQL = `
SELECT COUNT(*)::int AS n
FROM "Envelope"
WHERE title LIKE $1 AND "deletedAt" IS NULL
`;

/** Residue, reported and not asserted (plan §2.11, D24). */
export const SOFT_DELETED_ENVELOPE_SQL = `
SELECT COUNT(*)::int AS n
FROM "Envelope"
WHERE title LIKE $1 AND "deletedAt" IS NOT NULL
`;

export type JobRow = { id: string; status: string; retried?: number };

const TERMINAL_JOB_STATUSES = new Set(["COMPLETED", "FAILED"]);

/**
 * Waits until at least one job exists and every job is terminal (COMPLETED or FAILED). The job state is
 * the signal, not the row count: a seal or email job can exist before it has finished (plan D23).
 * On timeout it returns what it read, and the invariant reports the real count.
 */
export async function readTerminalJobs(
  pool: pg.Pool,
  sql: string,
  param: string,
): Promise<JobRow[]> {
  return waitForStable(() => selectRows<JobRow>(pool, sql, [param]), {
    timeoutMs: 20_000,
    stableReads: 2,
    accept: (rows) => rows.length > 0 && rows.every((r) => TERMINAL_JOB_STATUSES.has(r.status)),
    returnOnTimeout: true,
  });
}

export const readSealJobs = (pool: pg.Pool, documentId: number) =>
  readTerminalJobs(pool, SEAL_JOBS_SQL, String(documentId));

export const readEmailJobs = (pool: pg.Pool, envelopeId: string) =>
  readTerminalJobs(pool, EMAIL_JOBS_SQL, envelopeId);

export const readWebhookJobs = (pool: pg.Pool, documentId: number) =>
  readTerminalJobs(pool, WEBHOOK_JOBS_SQL, String(documentId));

/** Call only after the seal jobs are terminal. A count read earlier can be too low (plan D23). */
export async function readCompletedAudit(pool: pg.Pool, envelopeId: string): Promise<number> {
  const rows = await waitForStable(
    () => selectRows<{ n: number }>(pool, DOCUMENT_COMPLETED_AUDIT_SQL, [envelopeId]),
    { timeoutMs: 10_000, stableReads: 2, accept: (r) => r.length > 0, returnOnTimeout: true },
  );
  return Number(rows[0]?.n ?? 0);
}

export async function readItemSealed(
  pool: pg.Pool,
  envelopeId: string,
): Promise<{ items: number; sealed: number }> {
  const rows = await selectRows<{ sealed: boolean }>(pool, ITEM_SEALED_SQL, [envelopeId]);
  return { items: rows.length, sealed: rows.filter((r) => r.sealed === true).length };
}

export async function docDataCount(pool: pg.Pool): Promise<number> {
  const rows = await selectRows<{ n: number }>(pool, DOCUMENT_DATA_COUNT_SQL);
  return Number(rows[0]?.n ?? 0);
}

export async function liveEnvelopeLeak(pool: pg.Pool, titleLike: string): Promise<number> {
  const rows = await selectRows<{ n: number }>(pool, LIVE_ENVELOPE_LEAK_SQL, [titleLike]);
  return Number(rows[0]?.n ?? 0);
}

export async function softDeletedEnvelopes(pool: pg.Pool, titleLike: string): Promise<number> {
  const rows = await selectRows<{ n: number }>(pool, SOFT_DELETED_ENVELOPE_SQL, [titleLike]);
  return Number(rows[0]?.n ?? 0);
}

/**
 * Counts `Signing Complete!` in one recipient mailbox, after the list is stable. The completed mail has no
 * envelope header, so the count is per mailbox: each trial's mailboxes are its own (plan D19).
 */
export async function readCompletedEmailCount(
  inbucket: ReturnType<typeof createInbucketClient>,
  mailbox: string,
): Promise<number> {
  const subjects = await waitForStable(
    async () => (await inbucket.list(mailbox)).map((m) => m.subject),
    {
      timeoutMs: 10_000,
      intervalMs: 300,
      stableReads: 3,
      accept: (s) => s.length > 0,
      returnOnTimeout: true,
    },
  );
  return subjects.filter((s) => s === "Signing Complete!").length;
}
```

`tests/unit/documenso-oracle.test.ts` (edit): add the new constants to the `QUERIES` map (`ENVELOPE_SQL`,
`SEAL_JOBS_SQL`, `EMAIL_JOBS_SQL`, `WEBHOOK_JOBS_SQL`, `DOCUMENT_COMPLETED_AUDIT_SQL`, `ITEM_SEALED_SQL`,
`DOCUMENT_DATA_COUNT_SQL`, `LIVE_ENVELOPE_LEAK_SQL`, `SOFT_DELETED_ENVELOPE_SQL`). The existing SELECT-only
and no-token/password/secret tests then cover them. Extend the Prisma-name test with
`DOCUMENT_COMPLETED_AUDIT_SQL` matching `/FROM "DocumentAuditLog"/` and `ITEM_SEALED_SQL` matching
`/FROM "EnvelopeItem"/`. Add:

```ts
it("job queries filter on jobId, not on the display name", () => {
  assert.match(SEAL_JOBS_SQL, /"jobId" = 'internal\.seal-document'/);
  assert.match(EMAIL_JOBS_SQL, /"jobId" = 'send\.document\.completed\.emails'/);
  assert.match(WEBHOOK_JOBS_SQL, /"jobId" = 'internal\.execute-webhook'/);
  assert.doesNotMatch(SEAL_JOBS_SQL, /\bname\b/);
});

it("the live-envelope leak count ignores soft-deleted rows", () => {
  assert.match(LIVE_ENVELOPE_LEAK_SQL, /"deletedAt" IS NULL/);
  assert.match(SOFT_DELETED_ENVELOPE_SQL, /"deletedAt" IS NOT NULL/);
});
```

### 8.4 `src/documenso/invariants.ts` (new, pure)

`CompletionMode` is declared here, so `invariants.ts` never imports from `run-case.ts` (no cycle).
Every violation is one labelled string: `PRODUCT BUG: …`, `TEST BUG: …` or `ENV: …`. No I/O.

```ts
export type CompletionMode = "last-recipients" | "same-recipient" | "sequential-control";

export type CompletionClass =
  "SIGNED" | "ALREADY_SIGNED" | "client-error" | "server-error" | "other";

/** One completion response. A 200 is classified by its tRPC status. The body is never echoed. */
export function classifyCompletion(status: number | null, text: string): CompletionClass {
  if (status === null) return "other";
  if (status >= 500) return "server-error";
  if (status >= 400) return "client-error";
  if (status !== 200) return "other";
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    return "other";
  }
  const s = (json as { result?: { data?: { json?: { status?: unknown } } } } | null)?.result?.data
    ?.json?.status;
  if (s === "SIGNED") return "SIGNED";
  if (s === "ALREADY_SIGNED") return "ALREADY_SIGNED";
  return "other";
}

export function countClasses(classes: CompletionClass[]): Record<CompletionClass, number> {
  const out: Record<CompletionClass, number> = {
    SIGNED: 0,
    ALREADY_SIGNED: 0,
    "client-error": 0,
    "server-error": 0,
    other: 0,
  };
  for (const c of classes) out[c] += 1;
  return out;
}

export type SnapshotJob = { status: string; retried?: number };

/** Everything read for one trial, after the seal, email and webhook jobs are terminal (plan D23). */
export type TrialSnapshot = {
  sealJobs: SnapshotJob[];
  emailJobs: SnapshotJob[];
  webhookJobs: SnapshotJob[];
  completedAuditRows: number;
  itemDocs: number;
  itemsSealed: number;
  docDataDelta: number;
  completedEmails: number[]; // one count per recipient mailbox
  webhookDeliveries: number; // receiver deliveries whose payload.envelopeId is this envelope
  webhookCallRows: Array<{ status: string; responseCode: number | null }>; // this envelope only
  webhookHost: string;
};

export type TrialInput = {
  mode: CompletionMode;
  burst: number; // completions fired in the trial: 2 for 001 and the control, 10 for 002
  classes: CompletionClass[]; // one per completion request
  spreadMs: number;
  spreadLimitMs: number;
  snapshot: TrialSnapshot;
};

/** A trial double-seals when more than one seal job ran or more than one DOCUMENT_COMPLETED row exists. */
export function trialDoubleSealed(s: TrialSnapshot): boolean {
  return s.sealJobs.length > 1 || s.completedAuditRows > 1;
}

/** ENV: nothing was delivered and the WebhookCall row says the host was blocked (Task 6 §11). */
export function webhookBlockedEnv(s: TrialSnapshot): string | null {
  const blocked =
    s.webhookDeliveries === 0 &&
    s.webhookCallRows.some((r) => r.status === "FAILED" && r.responseCode === 0);
  return blocked
    ? `ENV: webhook blocked; NEXT_PRIVATE_WEBHOOK_SSRF_BYPASS_HOSTS must list ${s.webhookHost}`
    : null;
}

function expectedResponses(
  mode: CompletionMode,
  burst: number,
): { signed: number; already: number } {
  if (mode === "same-recipient") return { signed: 1, already: burst - 1 };
  return { signed: burst, already: 0 }; // last-recipients and the control: each recipient signs once
}

/**
 * The invariant set behind 001, 002 and the control. Violations of the control are relabelled
 * "TEST BUG (control)": a failing control means a harness or sequencing problem until a repro proves otherwise.
 */
export function checkCompletionTrial(input: TrialInput): string[] {
  const label = input.mode === "sequential-control" ? "TEST BUG (control)" : "PRODUCT BUG";
  const v: string[] = [];
  const s = input.snapshot;
  const counts = countClasses(input.classes);
  const exp = expectedResponses(input.mode, input.burst);

  if (input.spreadMs >= input.spreadLimitMs) {
    v.push(`TEST BUG: dispatchSpreadMs ${input.spreadMs} >= ${input.spreadLimitMs}`);
  }
  if (counts["server-error"] > 0)
    v.push(`${label}: completion HTTP 5xx x${counts["server-error"]}`);
  if (counts["client-error"] > 0)
    v.push(`${label}: completion HTTP 4xx x${counts["client-error"]}`);
  if (counts.other > 0)
    v.push(`${label}: completion response not SIGNED or ALREADY_SIGNED x${counts.other}`);
  if (counts.SIGNED !== exp.signed)
    v.push(`${label}: SIGNED responses ${counts.SIGNED}, expected ${exp.signed}`);
  if (counts.ALREADY_SIGNED !== exp.already) {
    v.push(`${label}: ALREADY_SIGNED responses ${counts.ALREADY_SIGNED}, expected ${exp.already}`);
  }
  if (s.sealJobs.length !== 1) v.push(`${label}: seal jobs ${s.sealJobs.length}, expected 1`);
  if (s.sealJobs.some((j) => j.status !== "COMPLETED")) v.push(`${label}: seal job not COMPLETED`);
  if (s.completedAuditRows !== 1)
    v.push(`${label}: DOCUMENT_COMPLETED rows ${s.completedAuditRows}, expected 1`);
  if (s.itemDocs !== 1 || s.itemsSealed !== 1) {
    v.push(`${label}: sealed items ${s.itemsSealed} of ${s.itemDocs}, expected 1 of 1`);
  }
  if (s.docDataDelta !== 2) {
    v.push(`${label}: DocumentData delta ${s.docDataDelta}, expected 2 (original + one sealed)`);
  }
  if (s.emailJobs.length !== 1)
    v.push(`${label}: completed-email jobs ${s.emailJobs.length}, expected 1`);
  for (const [i, n] of s.completedEmails.entries()) {
    if (n !== 1) v.push(`${label}: Signing Complete! for recipient ${i} x${n}, expected 1`);
  }
  if (s.webhookDeliveries !== 1) {
    v.push(`${label}: DOCUMENT_COMPLETED deliveries ${s.webhookDeliveries}, expected 1`);
  }
  if (s.webhookCallRows.length !== 1)
    v.push(`${label}: WebhookCall rows ${s.webhookCallRows.length}, expected 1`);
  if (s.webhookCallRows.some((r) => r.status !== "SUCCESS" || r.responseCode !== 200)) {
    v.push(`${label}: WebhookCall not SUCCESS 200`);
  }
  const env = webhookBlockedEnv(s);
  if (env) v.push(env);
  return v;
}

export const checkDoc001Trial = (input: TrialInput) =>
  checkCompletionTrial({ ...input, mode: "last-recipients" });
export const checkDoc002Trial = (input: TrialInput) =>
  checkCompletionTrial({ ...input, mode: "same-recipient" });
export const checkSequentialControl = (input: TrialInput) =>
  checkCompletionTrial({ ...input, mode: "sequential-control" });
```

Note on the 002 expectation: a 4xx is a PRODUCT BUG by the contract change (D16). If Jayami keeps the
roadmap wording ("one 2xx and nine 4xx"), this function changes in one place (Open question 1).

`tests/unit/documenso-invariants.test.ts` (node:test). A helper `passing(overrides)` returns a snapshot
that passes for 001 (two seal-free fields, one seal job COMPLETED, one audit row, delta 2, one email job,
emails `[1, 1]`, one delivery, one `SUCCESS` 200 call row). Each branch gets one test:

- `classifyCompletion`: 200 SIGNED → `SIGNED`; 200 ALREADY_SIGNED → `ALREADY_SIGNED`; 200 with another
  status → `other`; 200 with non-JSON → `other`; 400, 404, 429 → `client-error`; 500 → `server-error`;
  `null` → `other`.
- `checkDoc001Trial(passing)` → `[]`.
- Double seal (two seal jobs COMPLETED, two audit rows, delta 4, emails `[2, 2]`, two deliveries, two call
  rows, two email jobs): the result contains `PRODUCT BUG: seal jobs 2, expected 1`,
  `PRODUCT BUG: DOCUMENT_COMPLETED rows 2, expected 1`,
  `PRODUCT BUG: DocumentData delta 4, expected 2 (original + one sealed)`,
  `PRODUCT BUG: Signing Complete! for recipient 0 x2, expected 1`,
  `PRODUCT BUG: DOCUMENT_COMPLETED deliveries 2, expected 1`.
- One seal job `FAILED` → contains `PRODUCT BUG: seal job not COMPLETED`.
- A `server-error` class → `PRODUCT BUG: completion HTTP 5xx x1`; a `client-error` class → `PRODUCT BUG: completion HTTP 4xx x1`.
- `spreadMs` equal to `spreadLimitMs` → `TEST BUG: dispatchSpreadMs 20 >= 20`.
- `itemsSealed: 0` → `PRODUCT BUG: sealed items 0 of 1, expected 1 of 1`.
- One call row `FAILED` with `responseCode: 500` (and one delivery) → `PRODUCT BUG: WebhookCall not SUCCESS 200`.
- Zero deliveries and a `FAILED` row with `responseCode: 0` → contains
  `ENV: webhook blocked; NEXT_PRIVATE_WEBHOOK_SSRF_BYPASS_HOSTS must list p6-webhook.test`.
- `checkDoc002Trial` passing: classes `[SIGNED, ALREADY_SIGNED × 9]`, one seal, one audit row, delta 2,
  emails `[1]`, one delivery, one call row → `[]`.
- `checkDoc002Trial` with two SIGNED and eight ALREADY_SIGNED → contains `PRODUCT BUG: SIGNED responses 2, expected 1`.
- `checkDoc002Trial` with one 4xx → contains `PRODUCT BUG: completion HTTP 4xx x1`.
- `checkSequentialControl` with a double seal → every violation starts with `TEST BUG (control):`, and none starts with `PRODUCT BUG`.
- `trialDoubleSealed`: true for two seal jobs, true for two audit rows, false for `passing()`.
- `countClasses`: the totals equal the input length, for a mixed list.

### 8.5 `src/documenso/run-case.ts` (new)

One completion-race case. `runCompletionCase` owns its run: it creates the per-run account, token, webhook and
receiver, runs the trials, then always removes what it created and writes the histogram (`finishCase`), even
when a trial fails. Each test calls it once, so every case has its own owner and webhook and nothing is shared
between cases.

**Prefix gotcha (applies to the whole file).** `p6RunPrefix()` returns upper-case `T` and `Z`
(`p6-qa-20261021T053409Z-…`), while `casePrefix()` lower-cases the case prefix. Document titles and recipient
mailboxes use the lower-case form. So every LIKE pattern and every e-mail address built from the run prefix
uses `runPrefix.toLowerCase()`. A pattern built from the upper-case form matches nothing, and the leak check
would pass for the wrong reason.

```ts
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type pg from "pg";
import { raceMaxSpreadMsFromEnv } from "../races/env.ts";
import { fireTogether, summariseBody } from "../races/fire-together.ts";
import {
  aggregateDispatchSpread,
  createHistogram,
  mergeStatusCounts,
  writeHistogram,
} from "../races/histogram.ts";
import { runTrials } from "../races/run-trials.ts";
import { recordTrial } from "../races/trial-record.ts";
import type {
  RaceHistogram,
  RaceOracleValue,
  RaceRequestResult,
  RaceTrialResult,
} from "../races/types.ts";
import { casePrefix, likeLiteralPrefix } from "../medusa/payloads.ts";
import {
  createApiToken,
  createWebhook,
  deleteAccount,
  deleteApiToken,
  deleteWebhook,
  signUpVerifiedUser,
  type DocumensoAccount,
} from "./account.ts";
import {
  completeWithToken,
  createEnvelope,
  createRecipients,
  createSignatureFields,
  deleteEnvelope,
  distribute,
  expectOk,
  getEnvelope,
  signFieldWithToken,
} from "./api.ts";
import { createInbucketClient, mailboxName } from "./inbucket.ts";
import {
  legacyDocumentId,
  documentTitle,
  recipientBodies,
  signatureFieldBodies,
  signValue,
} from "./payloads.ts";
import {
  docDataCount,
  leakCheck,
  liveEnvelopeLeak,
  readCompletedAudit,
  readCompletedEmailCount,
  readEmailJobs,
  readItemSealed,
  readSealJobs,
  readWebhookCalls,
  readWebhookJobs,
  softDeletedEnvelopes,
} from "./oracle.ts";
import {
  checkCompletionTrial,
  classifyCompletion,
  countClasses,
  trialDoubleSealed,
  type CompletionClass,
  type CompletionMode,
  type TrialSnapshot,
} from "./invariants.ts";
import { startWebhookReceiver } from "./webhook-receiver.ts";
```

```ts
export type RunContext = {
  baseUrl: string;
  inbucket: ReturnType<typeof createInbucketClient>;
  runPrefix: string; // lower-case, see the prefix gotcha above
  pool: pg.Pool;
  account: DocumensoAccount;
  apiToken: string;
  apiTokenId: number;
  webhookId: string;
  webhookHost: string;
  receiver: Awaited<ReturnType<typeof startWebhookReceiver>>;
  envelopeIds: string[]; // live envelopes of this run; each trial removes its own, endRun sweeps the rest
};

/** The fork's example PDF, found through PRODUCTS_ROOT (the same root the harness uses). */
export function fixturePdfPath(env: NodeJS.ProcessEnv = process.env): string {
  const root = env.PRODUCTS_ROOT?.trim() || "../products";
  return path.resolve(process.cwd(), root, "documenso", "assets", "example.pdf");
}

export async function readFixturePdf(env: NodeJS.ProcessEnv = process.env): Promise<Uint8Array> {
  const file = fixturePdfPath(env);
  try {
    return await readFile(file);
  } catch {
    throw new Error(`ENV: fork fixture missing at ${file} (run scripts/bootstrap.sh documenso)`);
  }
}

/** Per-run account, API token, DOCUMENT_COMPLETED webhook and receiver. Throws in setup; nothing is left open. */
export async function startRun(input: {
  baseUrl: string;
  inbucketUrl: string;
  runPrefix: string;
  pool: pg.Pool;
  webhookHost: string;
}): Promise<RunContext> {
  const runPrefix = input.runPrefix.toLowerCase();
  const secret = randomBytes(16).toString("hex");
  const receiver = await startWebhookReceiver({
    publicHost: input.webhookHost,
    expectedSecret: secret,
  });
  const inbucket = createInbucketClient(input.inbucketUrl);
  try {
    const account = await signUpVerifiedUser({
      baseUrl: input.baseUrl,
      inbucketBaseUrl: input.inbucketUrl,
      email: `${runPrefix}-owner@example.com`,
      name: "P6 Race Owner",
    });
    const token = await createApiToken(input.baseUrl, account, `${runPrefix}-token`);
    const hook = await createWebhook(input.baseUrl, account, {
      webhookUrl: receiver.url,
      eventTriggers: ["DOCUMENT_COMPLETED"],
      secret,
    });
    return {
      baseUrl: input.baseUrl,
      inbucket,
      runPrefix,
      pool: input.pool,
      account,
      apiToken: token.token,
      apiTokenId: token.id,
      webhookId: hook.id,
      webhookHost: input.webhookHost,
      receiver,
      envelopeIds: [],
    };
  } catch (err) {
    await receiver.close();
    throw err;
  }
}

/**
 * Removes what the run created, in this order (plan §9): any live envelope (completed ones are soft-deleted),
 * the webhook, the API token, the mailboxes, the account (last: it re-owns completed envelopes, §2.11), the
 * receiver. Every failure becomes a TEST BUG line. Nothing here throws.
 */
export async function endRun(ctx: RunContext, recipientMailboxes: string[]): Promise<string[]> {
  const violations: string[] = [];
  const step = async (name: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      violations.push(`TEST BUG: cleanup ${name} failed: ${message.slice(0, 200)}`);
    }
  };
  for (const [i, envelopeId] of ctx.envelopeIds.entries()) {
    await step(`envelope/delete #${i}`, async () => {
      const status = await deleteEnvelope(ctx.baseUrl, ctx.apiToken, envelopeId);
      if (status !== 200) throw new Error(`HTTP ${status}`);
    });
  }
  await step("deleteWebhook", () => deleteWebhook(ctx.baseUrl, ctx.account, ctx.webhookId));
  await step("deleteApiToken", () => deleteApiToken(ctx.baseUrl, ctx.account, ctx.apiTokenId));
  for (const mb of [...recipientMailboxes, mailboxName(ctx.account.email)]) {
    await step(`purge ${mb.slice(0, 40)}`, () => ctx.inbucket.purge(mb));
  }
  await step("deleteAccount", () => deleteAccount(ctx.baseUrl, ctx.account));
  await step("receiverClose", () => ctx.receiver.close());
  return violations;
}

/** Leak counts after endRun. Every count must be 0; `softDeletedEnvelopes` is residue and is only reported. */
export async function leakCounts(
  ctx: RunContext,
  recipientMailboxes: string[],
): Promise<{ values: Record<string, number>; violations: string[] }> {
  const runLike = likeLiteralPrefix(`${ctx.runPrefix}-`);
  let remaining = 0;
  for (const mb of recipientMailboxes) remaining += (await ctx.inbucket.list(mb)).length;
  const base = await leakCheck(ctx.pool, {
    userLikePattern: runLike,
    teamId: ctx.account.teamId,
    mailboxCount: remaining,
  });
  const leakEnvelopesLive = await liveEnvelopeLeak(ctx.pool, runLike);
  const values = {
    ...base.counts,
    leakEnvelopesLive,
    softDeletedEnvelopes: await softDeletedEnvelopes(ctx.pool, runLike),
  };
  const violations = [...base.violations];
  if (leakEnvelopesLive !== 0)
    violations.push(`TEST BUG: leakEnvelopesLive = ${leakEnvelopesLive} after cleanup`);
  return { values, violations };
}

export type TrialDoc = {
  envelopeId: string;
  documentId: number;
  recipientIds: number[];
  tokens: Map<number, string>;
  mailboxes: string[];
};

/** Creates a document with `count` recipients, one signature field each, distributes it and signs every field. */
export async function prepareDocument(
  ctx: RunContext,
  opts: { casePfx: string; trial: number; count: number; label: string; pdf: Uint8Array },
): Promise<TrialDoc> {
  const title = documentTitle(opts.casePfx, opts.trial, opts.label);
  const envelopeId = await createEnvelope(ctx.baseUrl, ctx.apiToken, title, opts.pdf);
  ctx.envelopeIds.push(envelopeId); // registered before the rest, so endRun deletes it if a later step fails
  const bodies = recipientBodies(opts.casePfx, opts.trial, opts.count);
  const recipientIds = await createRecipients(ctx.baseUrl, ctx.apiToken, envelopeId, bodies);
  const env = await getEnvelope(ctx.baseUrl, ctx.apiToken, envelopeId);
  const fields = await createSignatureFields(
    ctx.baseUrl,
    ctx.apiToken,
    envelopeId,
    signatureFieldBodies({ envelopeItemId: env.itemId, recipientIds }),
  );
  const tokens = await distribute(ctx.baseUrl, ctx.apiToken, envelopeId);
  for (const [index, recipientId] of recipientIds.entries()) {
    const field = fields.find((f) => f.recipientId === recipientId);
    const token = tokens.get(recipientId);
    if (!field || !token) throw new Error("TEST BUG: recipient has no field or no signing token");
    expectOk(
      "field.signFieldWithToken",
      await signFieldWithToken(ctx.baseUrl, token, field.id, signValue(index)),
    );
  }
  return {
    envelopeId,
    documentId: legacyDocumentId(env.secondaryId),
    recipientIds,
    tokens,
    mailboxes: bodies.map((b) => mailboxName(b.email)),
  };
}

function payloadEnvelopeId(body: unknown): string | null {
  const id = (body as { payload?: { envelopeId?: unknown } } | null)?.payload?.envelopeId;
  return typeof id === "string" ? id : null;
}

/** Reads every per-trial oracle after the seal, email and webhook jobs are terminal (plan D23). */
export async function readSnapshot(
  ctx: RunContext,
  doc: TrialDoc,
  docDataBefore: number,
): Promise<TrialSnapshot> {
  const sealJobs = await readSealJobs(ctx.pool, doc.documentId);
  const emailJobs = await readEmailJobs(ctx.pool, doc.envelopeId);
  const webhookJobs = await readWebhookJobs(ctx.pool, doc.documentId);
  const completedAuditRows = await readCompletedAudit(ctx.pool, doc.envelopeId);
  const items = await readItemSealed(ctx.pool, doc.envelopeId);
  const docDataDelta = (await docDataCount(ctx.pool)) - docDataBefore;
  const completedEmails: number[] = [];
  for (const mb of doc.mailboxes)
    completedEmails.push(await readCompletedEmailCount(ctx.inbucket, mb));
  const deliveries = ctx.receiver.deliveries.filter(
    (d) => payloadEnvelopeId(d.body) === doc.envelopeId,
  );
  const calls = await readWebhookCalls(ctx.pool, ctx.webhookId);
  const webhookCallRows = calls
    .filter(
      (c) =>
        payloadEnvelopeId(c.requestBody) === doc.envelopeId && c.event === "DOCUMENT_COMPLETED",
    )
    .map((c) => ({ status: c.status, responseCode: c.responseCode }));
  return {
    sealJobs,
    emailJobs,
    webhookJobs,
    completedAuditRows,
    itemDocs: items.items,
    itemsSealed: items.sealed,
    docDataDelta,
    completedEmails,
    webhookDeliveries: deliveries.length,
    webhookCallRows,
    webhookHost: ctx.webhookHost,
  };
}

/** Sequential control: the same completions, one after another, with a 300 ms gap. */
export async function sequentialCompletions(
  n: number,
  complete: (i: number) => Promise<{ status: number | null; body: string }>,
): Promise<{ requests: RaceRequestResult[]; dispatchSpreadMs: number }> {
  const requests: RaceRequestResult[] = [];
  for (let i = 0; i < n; i++) {
    const { status, body } = await complete(i);
    requests.push({
      index: i,
      status,
      bodySummary: summariseBody(status, body),
      startedAtMs: 0,
      endedAtMs: 0,
    });
    await new Promise((r) => setTimeout(r, 300));
  }
  return { requests, dispatchSpreadMs: 0 };
}

function oracleOf(
  s: TrialSnapshot,
  c: Record<CompletionClass, number>,
): Record<string, RaceOracleValue> {
  return {
    sealJobs: s.sealJobs.length,
    sealJobsRetried: s.sealJobs.filter((j) => (j.retried ?? 0) > 0).length,
    completedAuditRows: s.completedAuditRows,
    sealedItemDocs: s.itemsSealed,
    docDataDelta: s.docDataDelta,
    emailJobs: s.emailJobs.length,
    completedEmailsMin: Math.min(...s.completedEmails),
    completedEmailsMax: Math.max(...s.completedEmails),
    webhookDeliveries: s.webhookDeliveries,
    webhookCallRows: s.webhookCallRows.length,
    signedResponses: c.SIGNED,
    alreadySignedResponses: c.ALREADY_SIGNED,
    clientErrorResponses: c["client-error"],
    serverErrorResponses: c["server-error"],
    doubleSealed: trialDoubleSealed(s),
  };
}

export type CaseResult = {
  histogram: RaceHistogram;
  productViolations: string[]; // every "PRODUCT BUG: …" line, across trials
  testViolations: string[]; // everything else: TEST BUG, ENV, TEST BUG (control)
  doubleSealTrials: number;
};

const splitViolations = (all: string[]) => ({
  productViolations: all.filter((v) => v.startsWith("PRODUCT BUG")),
  testViolations: all.filter((v) => !v.startsWith("PRODUCT BUG")),
});

export async function runCompletionCase(input: {
  baseUrl: string;
  inbucketUrl: string;
  runPrefix: string;
  pool: pg.Pool;
  webhookHost: string;
  caseId: string;
  title: string;
  mode: CompletionMode;
  trials: number;
}): Promise<CaseResult> {
  const burst = input.mode === "same-recipient" ? 10 : 2;
  const recipientCount = input.mode === "same-recipient" ? 1 : 2;
  const spreadLimit = raceMaxSpreadMsFromEnv();
  const casePfx = casePrefix(input.runPrefix, input.caseId);
  const pdf = await readFixturePdf();
  const ctx = await startRun(input);
  const histogram = createHistogram({
    caseId: input.caseId,
    title: input.title,
    product: "documenso",
    concurrency: burst,
    trials: input.trials,
  });
  const perTrial: RaceTrialResult[] = [];
  const spreads: number[] = [];
  const violations: string[] = [];
  const recipientMailboxes: string[] = [];
  try {
    const results = await runTrials(input.trials, async (trial) => {
      const docDataBefore = await docDataCount(ctx.pool);
      let doc: TrialDoc | null = null;
      try {
        doc = await prepareDocument(ctx, {
          casePfx,
          trial,
          count: recipientCount,
          label: input.mode,
          pdf,
        });
        recipientMailboxes.push(...doc.mailboxes);
        const current = doc;
        const tokenFor = (i: number) =>
          current.tokens.get(current.recipientIds[input.mode === "same-recipient" ? 0 : i])!;
        const raw: string[] = [];
        const complete = async (i: number) => {
          const res = await completeWithToken(ctx.baseUrl, tokenFor(i), current.documentId);
          raw[i] = res.text;
          return { status: res.status, body: res.text };
        };
        const fired =
          input.mode === "sequential-control"
            ? await sequentialCompletions(burst, complete)
            : await fireTogether(burst, complete, {
                warm: async () => {
                  const res = await fetch(`${ctx.baseUrl}/api/auth/csrf`);
                  await res.text();
                },
              });
        const snapshot = await readSnapshot(ctx, current, docDataBefore);
        const classes = fired.requests.map((r) => classifyCompletion(r.status, raw[r.index] ?? ""));
        const trialViolations = checkCompletionTrial({
          mode: input.mode,
          burst,
          classes,
          spreadMs: fired.dispatchSpreadMs,
          spreadLimitMs: spreadLimit,
          snapshot,
        });
        // recordTrial's validate hook is not used: every violation must be its own entry (plan §8.5).
        const record = recordTrial(trial, fired, () => undefined);
        record.oracle = oracleOf(snapshot, countClasses(classes));
        record.invariantViolations = trialViolations;
        record.ok = trialViolations.length === 0;
        if (!record.ok) record.error = trialViolations[0];
        perTrial.push(record);
        spreads.push(fired.dispatchSpreadMs);
        mergeStatusCounts(histogram.statusCounts, record.statusCounts);
        return record;
      } finally {
        if (doc) {
          const removed = doc;
          const status = await deleteEnvelope(ctx.baseUrl, ctx.apiToken, removed.envelopeId).catch(
            () => -1,
          );
          if (status !== 200) violations.push(`TEST BUG: cleanup envelope/delete HTTP ${status}`);
          ctx.envelopeIds = ctx.envelopeIds.filter((id) => id !== removed.envelopeId);
          for (const mb of removed.mailboxes) await ctx.inbucket.purge(mb).catch(() => undefined);
        }
      }
    });
    for (const failed of results.filter(
      (t) => !t.ok && !perTrial.some((p) => p.trial === t.trial),
    )) {
      perTrial.push({
        trial: failed.trial,
        ok: false,
        statuses: [],
        statusCounts: {},
        dispatchSpreadMs: 0,
        oracle: {},
        invariantViolations: [failed.error ?? "TEST BUG: trial failed"],
        error: failed.error,
      });
    }
    histogram.perTrial = perTrial.sort((a, b) => a.trial - b.trial);
    histogram.dispatchSpreadMs = aggregateDispatchSpread(spreads);
    const doubleSealTrials = perTrial.filter((t) => t.oracle.doubleSealed === true).length;
    histogram.oracle = {
      trialsSingleSeal: perTrial.filter((t) => t.oracle.sealJobs === 1).length,
      trialsDoubleSeal: doubleSealTrials,
      sealJobsRetriedTotal: perTrial.reduce((n, t) => n + Number(t.oracle.sealJobsRetried ?? 0), 0),
      signedResponses: perTrial.reduce((n, t) => n + Number(t.oracle.signedResponses ?? 0), 0),
      alreadySignedResponses: perTrial.reduce(
        (n, t) => n + Number(t.oracle.alreadySignedResponses ?? 0),
        0,
      ),
      clientErrorResponses: perTrial.reduce(
        (n, t) => n + Number(t.oracle.clientErrorResponses ?? 0),
        0,
      ),
      serverErrorResponses: perTrial.reduce(
        (n, t) => n + Number(t.oracle.serverErrorResponses ?? 0),
        0,
      ),
    };
    histogram.invariantViolations = [
      ...violations,
      ...perTrial.flatMap((t) => t.invariantViolations),
    ];
    return await finish(ctx, histogram, recipientMailboxes, true, doubleSealTrials);
  } catch (err) {
    histogram.invariantViolations.push(
      `TEST BUG: case aborted: ${(err instanceof Error ? err.message : String(err)).slice(0, 200)}`,
    );
    return await finish(ctx, histogram, recipientMailboxes, false, 0);
  }
}

/** Always runs: endRun, leak counts, verdict, histogram file. */
async function finish(
  ctx: RunContext,
  histogram: RaceHistogram,
  recipientMailboxes: string[],
  ran: boolean,
  doubleSealTrials: number,
): Promise<CaseResult> {
  const cleanup = await endRun(ctx, recipientMailboxes);
  const leak = await leakCounts(ctx, recipientMailboxes);
  histogram.oracle = { ...histogram.oracle, ...leak.values };
  histogram.invariantViolations.push(...cleanup, ...leak.violations);
  histogram.verdict = ran && histogram.invariantViolations.length === 0 ? "pass" : "fail";
  histogram.finishedAt = new Date().toISOString();
  await writeHistogram(histogram);
  const { productViolations, testViolations } = splitViolations(histogram.invariantViolations);
  return { histogram, productViolations, testViolations, doubleSealTrials };
}
```

### 8.6 Specs (skeleton)

`tests/documenso/races/doc-race-001-last-recipients.spec.ts` (new). The 001 case, and the control as an
extra in the same file:

```ts
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import {
  documensoBaseUrlFromEnv,
  documensoDatabaseUrlFromEnv,
  inbucketBaseUrlFromEnv,
  webhookHostFromEnv,
} from "../../../src/documenso/env.ts";
import { runCompletionCase } from "../../../src/documenso/run-case.ts";
import { createReadOnlyPool, closePool } from "../../../src/oracles/pg.ts";
import { raceTrialsFromEnv } from "../../../src/races/env.ts";
import { p6RunPrefix } from "../../../src/races/prefix.ts";

const CASE_ID = "P6-DOC-RACE-001";
const TITLE = "two last recipients complete in parallel";

function caseInput(extra: {
  caseId: string;
  title: string;
  mode: "last-recipients" | "sequential-control";
  trials: number;
}) {
  return {
    baseUrl: documensoBaseUrlFromEnv(),
    inbucketUrl: inbucketBaseUrlFromEnv(),
    runPrefix: p6RunPrefix(),
    pool: createReadOnlyPool(documensoDatabaseUrlFromEnv()),
    webhookHost: webhookHostFromEnv(),
    ...extra,
  };
}

test.describe("P6-DOC-RACE-001 two last recipients", () => {
  const trials = raceTrialsFromEnv();
  test.describe.configure({ timeout: 120_000 + trials * 20_000 });

  test(`${CASE_ID} ${TITLE}`, async () => {
    const input = caseInput({ caseId: CASE_ID, title: TITLE, mode: "last-recipients", trials });
    try {
      const result = await runCompletionCase(input);
      test.info().annotations.push({
        type: "P6-OBS-DOC-002",
        description: `double seal in ${result.doubleSealTrials}/${trials} trials`,
      });
      // Setup, contract, spread, cleanup and leak come first. They are not expected to fail (plan §10).
      expect(result.testViolations, result.testViolations.join("; ")).toEqual([]);
      const raw = JSON.parse(await readFile(`results/races/${CASE_ID}.json`, "utf8"));
      expect(raw.trials).toBe(trials);
      expect(raw.concurrency).toBe(2);
      // PRODUCT BUG P6-OBS-DOC-002 (plan §2.8, §2.10). Remove test.fail() and the expectation below in the
      // same PR that fixes the seal race; a passing run then fails on purpose.
      test.fail();
      expect(
        result.doubleSealTrials,
        `PRODUCT BUG: P6-OBS-DOC-002 double seal in ${result.doubleSealTrials} of ${trials} trials`,
      ).toBe(0);
    } finally {
      await closePool(input.pool);
    }
  });
});

test.describe("Documenso extras (unmapped)", () => {
  const trials = Math.min(raceTrialsFromEnv(), 5);
  test.describe.configure({ timeout: 120_000 + trials * 20_000 });

  test("extra (unmapped): sequential control for P6-DOC-RACE-001", async () => {
    const input = caseInput({
      caseId: "extra-doc-sequential-control",
      title: "extra (unmapped): sequential control for P6-DOC-RACE-001",
      mode: "sequential-control",
      trials,
    });
    try {
      const result = await runCompletionCase(input);
      // A control violation is labelled TEST BUG (control) by construction, so the whole list must be empty.
      expect(
        result.histogram.invariantViolations,
        result.histogram.invariantViolations.join("; "),
      ).toEqual([]);
      expect(result.histogram.verdict).toBe("pass");
    } finally {
      await closePool(input.pool);
    }
  });
});
```

`tests/documenso/races/doc-race-002-double-submit.spec.ts` (new):

```ts
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import {
  documensoBaseUrlFromEnv,
  documensoDatabaseUrlFromEnv,
  inbucketBaseUrlFromEnv,
  webhookHostFromEnv,
} from "../../../src/documenso/env.ts";
import { runCompletionCase } from "../../../src/documenso/run-case.ts";
import { closePool, createReadOnlyPool } from "../../../src/oracles/pg.ts";
import { raceTrialsFromEnv } from "../../../src/races/env.ts";
import { p6RunPrefix } from "../../../src/races/prefix.ts";

const CASE_ID = "P6-DOC-RACE-002";
const TITLE = "same recipient double submit, N=10";

test.describe("P6-DOC-RACE-002 same recipient double submit", () => {
  const trials = raceTrialsFromEnv();
  test.describe.configure({ timeout: 120_000 + trials * 20_000 });

  test(`${CASE_ID} ${TITLE}`, async () => {
    const pool = createReadOnlyPool(documensoDatabaseUrlFromEnv());
    try {
      const result = await runCompletionCase({
        baseUrl: documensoBaseUrlFromEnv(),
        inbucketUrl: inbucketBaseUrlFromEnv(),
        runPrefix: p6RunPrefix(),
        pool,
        webhookHost: webhookHostFromEnv(),
        caseId: CASE_ID,
        title: TITLE,
        mode: "same-recipient",
        trials,
      });
      // Setup and cleanup first, then the product contract (plan §8.4, D16).
      expect(result.testViolations, result.testViolations.join("; ")).toEqual([]);
      const raw = JSON.parse(await readFile(`results/races/${CASE_ID}.json`, "utf8"));
      expect(raw.trials).toBe(trials);
      expect(raw.concurrency).toBe(10);
      expect(result.productViolations, result.productViolations.join(" | ")).toEqual([]);
      expect(result.histogram.verdict).toBe("pass");
    } finally {
      await closePool(pool);
    }
  });
});
```

Notes on the specs:

- Each test builds its own pool (`createReadOnlyPool`) and closes it in `finally`. `closePool` is idempotent.
- `runCompletionCase` never throws for a trial or cleanup problem. It throws only in setup (`startRun`
  or `readFixturePdf`), and then the test fails with the setup message, as Task 6 does.
- The 001 test is green when `test.fail()` is satisfied, that is when the product assertion fails. The
  histogram `verdict` for 001 is `fail` while the bug reproduces; the README says so (§16).
- `npx playwright test --list --project=documenso-race` after the build lists **4 tests in 3 files**
  (self-test, 001, the 001 control, 002).

## 9. Test data, isolation, cleanup and leak check

- **Run prefix.** `p6RunPrefix()` gives `p6-qa-<UTC>-<8 hex>`. `startRun` lower-cases it (see the prefix gotcha,
  §8.5), so every e-mail address and every LIKE pattern uses the lower-case form.
- **Case prefix.** `casePrefix(runPrefix, caseId)` (Medusa helper, lower-cased). Titles are
  `${casePfx} t<trial> <mode>`. Recipient mailboxes are `${casePfx}-t<trial>-r<i>@example.com`, one mailbox per
  recipient per trial (D19). The owner is `${runPrefix}-owner@example.com`, one per case run.
- **Per trial (`finally` in `runCompletionCase`).** The trial's envelope is deleted (`envelope/delete`, expect
  200; a completed envelope is soft-deleted, a pending one hard-deleted), its recipient mailboxes are purged, and
  the envelope id leaves `ctx.envelopeIds`. A failure in the delete is a `TEST BUG: cleanup envelope/delete`.
- **Per run (`endRun`, always, from `finish`).** Sweep any live envelope, then `deleteWebhook`, `deleteApiToken`,
  purge the owner mailbox, `deleteAccount` (last: it re-owns completed envelopes, §2.11), `receiver.close()`.
  Each step is best effort; a failure is `TEST BUG: cleanup <step> failed: <message ≤ 200 chars>`.
- **Leak check after cleanup (`leakCounts`).** Every value must be 0:

  | Count               | Query                                                                         |
  | ------------------- | ----------------------------------------------------------------------------- |
  | `leakUsers`         | Task 6 `leakCheck`: `"User"` where email LIKE the run prefix                  |
  | `leakWebhooks`      | Task 6 `leakCheck`: `"Webhook"` for the run's team                            |
  | `leakApiTokens`     | Task 6 `leakCheck`: `"ApiToken"` for the run's team                           |
  | `leakMails`         | messages still in the recipient mailboxes after purge (list lengths summed)   |
  | `leakEnvelopesLive` | `LIVE_ENVELOPE_LEAK_SQL`: title LIKE the run prefix and `"deletedAt" IS NULL` |

  `softDeletedEnvelopes` is reported, never asserted (D24).

- **Why titles, not team or user.** After `deleteAccount` the completed envelopes belong to the `deleted-account`
  service user (§2.11). A leak count by team or user would report zero for envelopes that still exist.
- **Serial database.** `DocumentData` counts are per-trial deltas. They are valid only when nothing else writes to
  the Documenso database during the run (D25). CI runs one job with `workers: 1` and a fresh database. Locally,
  run no other Documenso work while the race runs.
- **Volume.** Each completed document leaves about 300 KB per `DocumentData` row (2 rows sequential, 4 for a double
  seal). That is an estimate from the probe's 306 892-character sealed data. A full local run (50 + 50 + 5 trials)
  adds on the order of 100 MB to the Documenso Postgres volume. `down:documenso` keeps the volume (Task 6 §2.9),
  and the run prefix keeps runs apart.

## 10. Known-bug handling and labels (`test.fail()` only for `P6-OBS-DOC-002`)

| Observation                                                                                                                    | Label                                              | Evidence to paste                                                |
| ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- | ---------------------------------------------------------------- |
| Completion response 5xx                                                                                                        | **PRODUCT BUG**                                    | status, body summary (no token)                                  |
| Completion response 4xx (in 002 this would break D16)                                                                          | **PRODUCT BUG**                                    | status, body summary                                             |
| Completion response not `SIGNED` / `ALREADY_SIGNED` on a 200                                                                   | **PRODUCT BUG**                                    | body summary                                                     |
| Seal jobs ≠ 1, a seal job not COMPLETED, DOCUMENT_COMPLETED rows ≠ 1 (001 and 002)                                             | **PRODUCT BUG** (001: this is `P6-OBS-DOC-002`)    | counts, job statuses, `retried`                                  |
| `DocumentData` delta ≠ 2                                                                                                       | **PRODUCT BUG**                                    | delta, seal job count                                            |
| Completed-email count per recipient ≠ 1, or completed-email jobs ≠ 1                                                           | **PRODUCT BUG**                                    | counts per mailbox                                               |
| Webhook deliveries ≠ 1, `WebhookCall` rows ≠ 1, row not SUCCESS 200                                                            | **PRODUCT BUG**                                    | counts, row status and code, `isDeepStrictEqual` result if added |
| Zero deliveries and `FAILED` with `responseCode` 0                                                                             | **ENV**                                            | `NEXT_PRIVATE_WEBHOOK_SSRF_BYPASS_HOSTS` or the hosts entry      |
| 429 anywhere                                                                                                                   | **ENV**                                            | `DANGEROUS_BYPASS_RATE_LIMITS` not reaching the app              |
| Setup call not 200 (`envelope/create`, `recipient/create-many`, `field/create-many`, `distribute`, `field.signFieldWithToken`) | **TEST BUG** (5xx on any of them: **PRODUCT BUG**) | call name, status                                                |
| Fixture PDF missing                                                                                                            | **ENV**                                            | the path from `fixturePdfPath()`                                 |
| Spread ≥ `RACE_MAX_SPREAD_MS`                                                                                                  | **TEST BUG**                                       | `dispatchSpreadMs`                                               |
| Cleanup step failed, leak ≠ 0, histogram not written                                                                           | **TEST BUG**                                       | step name, count                                                 |
| Sequential control (extra) violated                                                                                            | **TEST BUG (control)**                             | the violation line; a repro is needed before any product label   |
| Stack down, Node < 24, OOM, Docker or disk                                                                                     | **ENV**                                            | last 40 lines of `documenso-web.log` and the step log            |
| Inbucket list or message shape differs (Task 6 D14)                                                                            | **ENV**                                            | the `ENV: Inbucket API drift` message                            |

**The `test.fail()` rules (001 only, D17).**

- The product assertion (`expect(result.doubleSealTrials).toBe(0)`) comes right after `test.fail()`. Everything
  above it is setup and must hold: the trial count matches the environment, the testViolations list is empty
  (spread, cleanup, leak, ENV, TEST BUG), and the raw histogram file has the expected `trials` and `concurrency`.
- The product assertion fails while the bug reproduces. With 5 trials on a PR the chance of zero reproductions
  is effectively zero (40/40 in the probe), so the PR run stays green.
- If the bug stops reproducing, the assertion passes, `test.fail()` turns that into a red test, and the PR that
  fixes the seal race must remove `test.fail()` and the expectation in the same change. That is the intended signal.
- 002 has no `test.fail()`. Its product violations are plain assertions.

## 11. CI (`.github/workflows/perf.yml`, job `documenso-smoke` only)

Triggers and concurrency are unchanged (`pull_request`, `push` to `main`, `workflow_dispatch`, the nightly
schedule). Job `documenso-smoke` keeps its env, its checkout and build steps, and its `harness up`, k6 and
`down` steps. Replace the step `Race self-test (documenso-race, 3 trials)` and the two artefact steps around
it with the following, in this order: the race step, the guard, the histogram upload, the log upload.

```yaml
- name: Documenso races (documenso-race)
  id: documenso_races
  if: ${{ steps.documenso_up.outcome == 'success' }}
  working-directory: ${{ env.P6_WORKING_DIRECTORY }}
  timeout-minutes: ${{ github.event_name == 'pull_request' && 15 || 30 }}
  env:
    # Plan D22: about 5 trials on PRs, the full count (50) on main, nightly and workflow_dispatch.
    RACE_TRIALS: ${{ github.event_name == 'pull_request' && '5' || '50' }}
    RACE_MAX_SPREAD_MS: "20"
  run: |
    set -euo pipefail
    echo "### Documenso race trials: ${RACE_TRIALS}" >> "$GITHUB_STEP_SUMMARY"
    status=0
    npm run race:documenso || status=$?
    for f in results/races/P6-DOC-RACE-001.json results/races/P6-DOC-RACE-002.json results/races/extra-doc-sequential-control.json; do
      if [ -f "$f" ]; then
        node -e 'const h=require(process.argv[1]);console.log(`- ${h.caseId}: verdict ${h.verdict}, trials ${h.trials}, violations ${h.invariantViolations.length}, double-seal trials ${h.oracle.trialsDoubleSeal ?? "n/a"}`)' "$PWD/$f" >> "$GITHUB_STEP_SUMMARY"
      fi
    done
    exit "$status"

# Plan D27, risk R7: the web log and the race histograms are scanned before anything is uploaded.
- name: Check Documenso artefacts for tokens
  id: web_log_check
  if: ${{ always() }}
  working-directory: ${{ env.P6_WORKING_DIRECTORY }}
  run: |
    set -euo pipefail
    pattern='api_[A-Za-z0-9]{8,}|Bearer |sessionId|/verify-email/[A-Za-z0-9_-]+|/sign/[A-Za-z0-9_-]{10,}'
    log=node_modules/qa-portfolio-harness/.harness/documenso-web.log
    if [ -f "$log" ] && grep -qE "$pattern" "$log"; then
      echo "::error::documenso-web.log contains a token pattern; not uploading"
      exit 1
    fi
    if [ -d results/races ] && grep -rqE "$pattern" results/races; then
      echo "::error::race histograms contain a token pattern; not uploading"
      exit 1
    fi

- uses: actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2
  if: ${{ always() && steps.web_log_check.outcome == 'success' }}
  with:
    name: race-histograms-documenso
    path: ${{ env.P6_WORKING_DIRECTORY }}/results/races/
    if-no-files-found: warn
    retention-days: 14
```

The web-log upload (`documenso-web-log`) stays as it is in the file today, with `if: ${{ always() && steps.web_log_check.outcome == 'success' }}`, and keeps its place after the histogram upload. The old step `Check Documenso web log for tokens` is replaced by the guard above; no second guard is added.

Estimated CI time (VM numbers from the probe; to be replaced by the first GitHub Actions runs, median of at
least 3, and never published from here):

- PR (5 trials each): races about 1 min (001 ≈ 19 s, 002 ≈ 14 s, control ≈ 20 s, self-test ≈ 10 s), so the
  job is about 4 min with a warm build cache and about 8 min cold.
- `main`, nightly, `workflow_dispatch` (50 trials each): 001 ≈ 50 × 3.7 s ≈ 3.1 min, 002 ≈ 50 × 2.7 s ≈ 2.3 min,
  control and self-test ≈ 0.8 min, so about 6 min of races on top of the same install and `up`, about 10 min warm
  and 13 min cold. The job timeout (45 min) and the step timeouts (15 and 30 min) leave room for a runner that is
  twice as slow.

## 12. Environment changes

Nothing new is needed. Every name this task reads already exists: `RACE_TRIALS`, `RACE_MAX_SPREAD_MS`,
`PRODUCTS_ROOT`, `DOCUMENSO_BASE_URL`, `DOCUMENSO_DB_URL`, `INBUCKET_BASE_URL`, `P6_WEBHOOK_HOST`,
`DANGEROUS_BYPASS_RATE_LIMITS`, `NEXT_PRIVATE_WEBHOOK_SSRF_BYPASS_HOSTS` (Task 6 §13).

### 12.1 New environment variables

None. `.env.example` is unchanged.

### 12.2 Network domains

Nothing new. The same list as Task 6 §13.2.

### 12.3 Setup steps

Nothing new beyond Task 6 §13.3 (Node 24 at `/opt/node24`, the hosts entry, `bash scripts/bootstrap.sh documenso`).

### 12.4 Cursor cloud

- **Automatic from the repo:** nothing. No Dockerfile or `environment.json` change.
- **Pasted into Cursor settings:** nothing.

### 12.5 Claude Code cloud

- **Automatic from the repo:** nothing. No `session-start.sh` change.
- **Pasted into the environment settings:** nothing.

## 13. Build steps (repo root; on any differing output: stop and report, paste it)

Do not start until Jayami approves this plan. Never `git add -A`. Never print secrets. Always finish with
`npm run down:documenso`. Run `export PATH="/usr/local/bin:$PATH"` first (AGENTS.md).

### Step 0. Branch, plan doc, machine prerequisites

```bash
export PATH="/usr/local/bin:$PATH"
git fetch origin main plan/2026-10-20-p6-phase1
git switch -c feat/2026-10-22-p6-doc-races origin/main
git checkout origin/plan/2026-10-20-p6-phase1 -- docs/plans/2026-10-21-p6-phase1-task7-doc-races.md
git status --short            # A  docs/plans/2026-10-21-p6-phase1-task7-doc-races.md (only)
git commit -m "docs(plans): add task 7 doc races plan"
npm ci && npm run check       # Prettier clean, typecheck 0, 4 script(s) ok, # tests 181, # fail 0
bash scripts/bootstrap.sh documenso                  # already cloned f4105e47… or cloned; npm ci under Node v24.21.0
getent hosts p6-webhook.test                         # 127.0.0.1  p6-webhook.test
```

### Step 1. `src/documenso/payloads.ts` and its unit test

Write §8.1 exactly. Run `npm run test:unit`: `# tests 181` plus the new `it` blocks, `# fail 0`.
Commit 1 (§15).

### Step 2. `src/documenso/api.ts` and its unit test

Write §8.2 exactly, including `expectOk`. Run `npm run test:unit`: the fake-server tests pass. Commit 2.

### Step 3. `src/documenso/invariants.ts` and its unit test

Write §8.4 exactly. `npm run test:unit` must show one `it` for every pass and fail branch listed in §8.4.
Commit 3.

### Step 4. `src/documenso/oracle.ts` additions and the oracle test

Add the §8.3 constants and functions after the Task 6 code, and the `createInbucketClient` import. Extend
`tests/unit/documenso-oracle.test.ts` as §8.3 says. `npm run test:unit` and `npm run typecheck` must pass.
Commit 4.

### Step 5. `src/documenso/run-case.ts`

Write §8.5 exactly. No unit test: the functions are I/O, and every pure piece they call is tested in Steps
1–4. `npm run typecheck` exits 0. Commit 5.

### Step 6. Specs

Write the two spec files from §8.6, and run:

```bash
npx playwright test --list --project=documenso-race     # 4 tests in 3 files
npm run typecheck                                       # exit 0
npm run up:documenso                                    # exit 0 (about 25 s warm)
RACE_TRIALS=5 RACE_MAX_SPREAD_MS=20 npm run race:documenso
node -e 'for (const f of ["P6-DOC-RACE-001","P6-DOC-RACE-002","extra-doc-sequential-control"]) { const h = require("./results/races/" + f + ".json"); console.log(h.caseId, h.verdict, h.trials, h.invariantViolations.length, h.oracle.trialsDoubleSeal ?? "-") }'
RACE_TRIALS=5 RACE_MAX_SPREAD_MS=20 npm run race:documenso   # second run, same result
npm run down:documenso && npm run down:documenso             # both exit 0
```

Expected: `4 passed` both runs (the self-test, 001 with `test.fail()` satisfied, 002, the control).
The histogram lines: `P6-DOC-RACE-001 fail 5 <n> 5` (the verdict is `fail` because the bug reproduces;
the Playwright test is green), `P6-DOC-RACE-002 pass 5 0 -`, `extra-doc-sequential-control pass 5 0 -`.
Commit 6.

### Step 7. CI

Apply §11 to `.github/workflows/perf.yml`. Then:

```bash
npx --yes prettier --check .github/workflows/perf.yml
git diff origin/main -- .github/workflows/perf.yml      # only the documenso-smoke race step, guard and uploads change
```

Commit 7.

### Step 8. README

Add the subsection of §16 after "Run Documenso". `npm run check` (`# fail 0`). Commit 8.

## 14. Verification gate (hard gate before any implementation push; paste real output)

| Check                                                           | Must show                                                                                                                                  |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run check`                                                 | Prettier clean, typecheck 0, `4 script(s) ok.`, `# tests` = 181 + new, `# fail 0`                                                          |
| `npx playwright test --list --project=documenso-race`           | `4 tests in 3 files`                                                                                                                       |
| `RACE_TRIALS=5 RACE_MAX_SPREAD_MS=20 npm run race:documenso` ×2 | `4 passed` both times; histogram lines as in Step 6; `leakEnvelopesLive` 0 and the leak counts 0 in each histogram                         |
| `RACE_TRIALS=20 … npm run race:documenso` (once, shape only)    | the same outcome as the 20-trial probe: 001 `trialsDoubleSeal` 20, 002 `trialsDoubleSeal` 0                                                |
| `npm run down:documenso` ×2                                     | exit 0 both; `:3001` closed                                                                                                                |
| CI on the PR                                                    | `documenso-smoke` green; `race-histograms-documenso` has the three JSON files; `web_log_check` green; `medusa-smoke` and `cal-smoke` green |
| CI on `main` after merge (`workflow_dispatch`)                  | full count (50) in the step summary; job time recorded; not published                                                                      |

## 15. Commit plan (Conventional, lowercase subjects, explicit paths, never `git add -A`)

0. `docs(plans): add task 7 doc races plan`: the plan doc (from the plan branch).
1. `feat(documenso): add completion request bodies`: `src/documenso/payloads.ts`, `tests/unit/documenso-payloads.test.ts`.
2. `feat(documenso): add completion api helpers`: `src/documenso/api.ts`, `tests/unit/documenso-api.test.ts`.
3. `feat(documenso): add completion invariants`: `src/documenso/invariants.ts`, `tests/unit/documenso-invariants.test.ts`.
4. `feat(documenso): add completion oracle reads`: `src/documenso/oracle.ts`, `tests/unit/documenso-oracle.test.ts`.
5. `feat(documenso): add completion race runner`: `src/documenso/run-case.ts`.
6. `test(documenso): add doc race 001, 002 and control specs`: `tests/documenso/races/doc-race-001-last-recipients.spec.ts`, `tests/documenso/races/doc-race-002-double-submit.spec.ts`.
7. `ci(documenso): run completion races in documenso-smoke`: `.github/workflows/perf.yml`.
8. `docs(documenso): document completion races`: `README.md`.

Environment identity; no Co-Authored-By, "Generated with" or session lines. `git status --short` before each commit lists only that commit's paths; nothing under `products/`.

## 16. Docs (README "Documenso completion races")

- What the two cases prove, in one sentence each, and the expected outcome of `P6-DOC-RACE-001` (it fails
  with `test.fail()` while `P6-OBS-DOC-002` reproduces).
- The histogram verdict versus the Playwright result for 001: `fail` in the JSON and green in the test run.
- Trial counts: 5 on PRs, 50 on `main`, nightly and manual runs (D22). Nothing else is set by hand.
- The serial-database requirement (§9) and the volume note (§9).
- The label table (§10), summarised to the four labels.
- Known product findings: `P6-OBS-DOC-001` (Task 6) and `P6-OBS-DOC-002` (this task, proposed), with
  links to §2.8 and §2.10 of this plan.
- No timings. Published numbers come only from GitHub Actions runs.

## 17. Will NOT do

- No fix to the seal race or to any Documenso code; no edit to the fork, the harness or `qa-portfolio-harness`.
- No `P6-DOC-RACE-003`, no reject, cancel or delete race (§5), no 2FA, no dictated signer.
- No seeded users, no pasted `DOCUMENSO_API_TOKEN`, no tokens via SQL, no SQL writes.
- No change to `runTrials`, `fireTogether`, `src/races/*`, `src/oracles/pg.ts`, `medusa-smoke` or `cal-smoke`.
- No retries, no `workers` above 1, no browser, no page objects, no UI.
- No published timings; no `test.fail()` outside `P6-DOC-RACE-001`.
- No "one 2xx and nine 4xx" oracle unless Open question 1 is answered that way.

## 18. Risks and unknowns

- **R1 Timing-dependent double seal.** Reproduced 40/40, but it depends on the two completions committing
  before either read. A slower CI runner may reproduce it less, and `test.fail()` then turns green into red (by
  design, §10). Mitigation: the PR run has 5 trials, and the full count runs on `main`.
- **R2 Global `DocumentData` count.** The delta is valid only with no other writer (D25). Mitigation: one job,
  `workers: 1`, fresh database in CI; a README note for local runs.
- **R3 Mailbox names.** Unique per trial and per recipient, so counts cannot cross trials. A repeated address
  across runs would break this. The run prefix and the trial number make it unique.
- **R4 Webhook deliveries from earlier trials.** Filtered by `payload.envelopeId`, and each trial has its own
  envelope, so a late delivery from an earlier trial cannot be counted in a later one.
- **R5 Soft-deleted envelopes and `DocumentData` residue** keep growing in the local volume (§9). CI is a fresh
  database each run; locally the volume is kept by design (Task 6 §2.9).
- **R6 Account deletion re-owns completed envelopes** (§2.11). Mitigation: titles, not owners, in every leak count.
- **R7 The web log and the histograms could one day hold a token.** The guard blocks the upload (§11).
- **R8 Trial time at 50.** About 6 min of races on this VM; a slower runner may take twice that. The timeouts
  in §11 allow it.
- **R9 The roadmap's "one 2xx, nine 4xx" is wrong for this product.** Changed in D16; Open question 1 asks for
  approval.
- **R10 A label mistake.** A product bug reported as a test bug (or the reverse) hides a finding. Mitigation: the
  labels in §10 are enforced by the `PRODUCT BUG` prefix, and every test-side label carries its own prefix.
- **R11 Seal retries add time.** The retry path is about 250 ms slower at p50 (648 ms against 393 ms). The 20 s
  settle timeout (D23) covers it with a wide margin.
- **R12 The fixture PDF comes from the fork checkout**, through `PRODUCTS_ROOT` (D21). A moved or renamed asset
  in the fork fails as `ENV: fork fixture missing`, not as a product bug.

## 19. Decisions (2026-10-21; numbering continues from Task 6's D15)

- **D16 DOC-RACE-002 oracle follows the observed contract.** Every completion answers 200. Exactly one response
  is `SIGNED` and the other nine are `ALREADY_SIGNED`; no 4xx is expected; any 5xx, 4xx or other body is a
  PRODUCT BUG. Standard: assert what the product promises (idempotent completion returns 200), not an assumed
  error shape. Rejected: "one 2xx and nine 4xx" from the roadmap (the product never returns a 4xx here; the
  probe shows 200 in every trial).
- **D17 `P6-DOC-RACE-001` uses `test.fail()` with `P6-OBS-DOC-002`.** The product assertion is "no trial
  double-seals", placed after the setup assertions. Standard: a proven product bug is recorded as an expected
  failure with evidence from repeated runs (roadmap, master plan §1). Rejected: a red test on `main` (it would
  block every PR); skipping the case (it would hide the finding).
- **D18 Seal count and sealed-PDF count.** Seal jobs are counted by `jobId` and the legacy document id.
  DOCUMENT_COMPLETED audit rows per envelope count committed seal runs. The sealed-PDF count is the per-trial
  `DocumentData` delta, expected 2 (original + one sealed). Rejected: counting sealed rows through the item (always
  one, which hides the double seal); counting by e-mail subject (the roadmap's own warning).
- **D19 Completed e-mails are counted per recipient mailbox.** Each trial's recipient mailboxes are unique, so a
  count per mailbox is a count per document. The roadmap's "exactly 1 completed email for this document" means
  one per recipient (2 for two recipients). Rejected: a global count by subject.
- **D20 Webhooks are counted by `payload.envelopeId`.** `payload.id` is the legacy number, and matching it would
  mix documents with the same legacy id across runs.
- **D21 Completion through the signing page's own procedures.** `field.signFieldWithToken` and
  `recipient.completeDocumentWithToken`, anonymous, with the recipient token from `distribute` (`signingUrl`).
  The fixture PDF is read from the fork checkout, found through `PRODUCTS_ROOT` as the harness does. Standard: test
  the same surface the product's own UI uses, with no UI and no SQL writes. Rejected: a P6-owned PDF copy (a binary
  in the repo, and the fork is the source of truth); `envelope.field.sign` (does not exist, §2.12).
- **D22 Trial counts.** The DOC cases take `RACE_TRIALS` as given, with no cap: 5 on PRs, 50 on `main`, nightly
  and `workflow_dispatch` (roadmap D2; master plan §1). The control runs `min(RACE_TRIALS, 5)`. Rejected: keeping 3
  on `main` (below master plan N≥50).
- **D23 `waitForStable` limits.** Seal and email jobs: wait up to 20 s until at least one job exists and every job
  is COMPLETED or FAILED. Audit, item and `DocumentData` reads come only after that. Completed e-mails: up to 10 s,
  stable for 3 reads 300 ms apart. Webhook calls: Task 6's `readWebhookCalls` (15 s). Rationale: the probe's worst
  seal was 937 ms, its worst e-mail job 410 ms, its worst webhook job 42 ms, so the limits are more than 10× the
  worst case. Rejected: counting at the first row (a second seal can land after the first is counted).
- **D24 Cleanup order and leak keys.** Envelope delete first, the account last. Leak counts use title prefix and
  live rows. Soft-deleted envelopes and `DocumentData` residue are reported, not asserted, because the API cannot
  remove them. Rejected: team or user keys (completed envelopes are re-owned at account deletion).
- **D25 Serial database for the `DocumentData` delta.** One Documenso job per run, `workers: 1`. Documented in the
  README.
- **D26 The sequential control is an extra in this task.** It shows that the duplication needs concurrency, and it
  catches a harness false positive. A failing control is a `TEST BUG (control)`. Rejected: leaving it out (then the
  double seal could be a harness artefact and nothing would show it).
- **D27 Guard before upload, for histograms too.** The token-shape guard scans the web log and `results/races/`,
  and both uploads wait for it. The uploads run `always()` after the guard, so a failed race still uploads its
  evidence.
- **D28 Finding label.** `P6-OBS-DOC-002`, PRODUCT BUG, medium, proposed. It follows the `P6-OBS-*` finding pattern
  of Tasks 5 and 6; it is not a case ID, and no case ID is invented (Open question 2).
- **D29 Task 6 wording corrected here, not edited.** `envelope.field.sign` becomes `field.signFieldWithToken`
  (§2.12). The Task 6 file is not changed in this plan (Open question 8).

## 20. Open questions for Jayami

1. **Approve D16?** The roadmap says "one 2xx and nine 4xx". The product returns 200 for all ten (one `SIGNED`,
   nine `ALREADY_SIGNED`) in all 20 probe trials, and that is its documented idempotent behaviour. Recommendation:
   yes. The case then asserts the real contract and still catches any 4xx or 5xx.
2. **Approve the finding `P6-OBS-DOC-002`, severity medium, and `test.fail()` on `P6-DOC-RACE-001` (D17)?**
   Medium because the envelope ends COMPLETED with one sealed PDF, and the damage is duplicate e-mails, duplicate
   webhooks and duplicate seal work. Say if you would rate it high: that changes only the label text.
3. **Trial counts (D22):** 5 on PRs and 50 on `main`, nightly and manual runs, as the roadmap says. Or do you want
   the master plan's N≥50 on PRs too (about 3 more minutes per PR run)? Recommendation: keep 5 on PRs.
4. **Residue (D24, R5):** accept soft-deleted envelopes and `DocumentData` rows as product residue that is reported,
   not asserted? The API cannot remove them, so the only alternative is a direct database clean-up, which the
   read-only oracle rule forbids. Recommendation: yes.
5. **Upstream issue draft for the double seal**, in the style of Task 5's Appendix A (you file it; P6 does not)?
   Recommendation: yes, after this plan is approved.
6. **The sequential control (D26) as an extra in this task?** Recommendation: yes; it is five trials on PRs and
   costs about 20 s.
7. **Per-recipient reading of "exactly 1 completed email" (D19)?** The roadmap's wording could also mean one per
   document. Recommendation: per recipient, as the probe shows every recipient receives the completed mail.
8. **Fix the Task 6 wording (`envelope.field.sign`, §2.12) in this build's first commit, or leave it to the Task 8
   closeout?** Recommendation: fix it now, as a one-line change to Task 6 §2.7 on the plan branch.
