# P6 Phase 1 Task 6: Documenso stack in P6 (plan only)

This is the implementation plan a weaker model will build from. Do not write code until the maintainer
approves this document.

Structure and depth follow
[2026-10-20-p6-phase1-task3-cal-stack.md](2026-10-20-p6-phase1-task3-cal-stack.md) and
[docs/reference/p1-plan-example-medusa.md](../reference/p1-plan-example-medusa.md). P1
UI-assertion and page-object rules do **not** apply. P6 asserts through HTTP and a read-only
database oracle.

The source of this task is [2026-10-20-p6-phase1-roadmap.md](2026-10-20-p6-phase1-roadmap.md),
section "Task 6: Documenso stack in P6".

## Context

- Repo: [Jayami123/k6-load-concurrency-suite](https://github.com/Jayami123/k6-load-concurrency-suite)
  (P6). Plan branch **`plan/2026-10-20-p6-phase1`** at `06e0344` (main `6d73fd3`, PR #14 Task 5,
  merged in). Written there only; no PR.
- Build branch (later): **`feat/2026-10-21-p6-documenso-stack`** cut from `origin/main`. Its first
  commit brings this doc in with
  `git checkout origin/plan/2026-10-20-p6-phase1 -- docs/plans/2026-10-20-p6-phase1-task6-documenso-stack.md`.
- Harness `qa-portfolio-harness#v0.2.11`: adapter
  `node_modules/qa-portfolio-harness/src/adapters/documenso.adapter.ts`, env helpers
  `documenso-env.ts`, compose `docker/documenso.compose.yml`. Never edit the harness or the fork;
  `scripts/harness.mjs` owns start/stop.
- Fork: `Jayami123/documenso` @ **`f4105e47eba56f5d8d7e70dd516a8fcc0c870d7c`** (`DOCUMENSO_REF` in
  `scripts/bootstrap.sh`), `@documenso/root@2.19.0`, `engines: node >=24.0.0, npm >=11.17.0`,
  Remix + Hono server, Prisma, Postgres 15.
- This task maps **no** case ID. It adds one unmapped self-test (`documenso-self-test`). Mapped
  Documenso cases start in Task 7 (`P6-DOC-RACE-001`, `P6-DOC-RACE-002`).
- Probe status: done once on 2026-10-20 in a Claude Code cloud session (§2). Probe scripts lived
  only in the session scratchpad and imported the real `src/oracles/pg.ts`,
  `src/races/fire-together.ts` and `src/races/prefix.ts`. Nothing was written to the repo, harness
  or fork. Documenso was stopped with `harness.mjs down documenso` (twice, idempotent).
- Review answers (2026-10-20) are applied; §20 lists them. Harness changes the answers defer are
  collected in §21 (harness v0.3.0 follow-ups).

## 1. Header

- Probe date 2026-10-20. VM: 4 vCPU, 16093 MB RAM, Docker 29.9.1. `PRODUCTS_ROOT=/home/user/products`.
- **Node 24 is required** (fork `engines`, harness `assertDocumensoNodeVersion`). The VM had Node
  22.23.3 (`/usr/local/bin`) and 20/21/22 under `/opt` only. The probe installed **Node v24.21.0**
  (2026-09-07, LTS "Krypton", npm 11.19.0) from `nodejs.org` into `/home/user/tools/node24`,
  verified with `SHASUMS256.txt` (`node-v24.21.0-linux-x64.tar.xz: OK`). v24.22.0 (2026-10-14) was
  skipped as too new.
- Bootstrap: `BOOTSTRAP_SKIP_INSTALL=1 bash scripts/bootstrap.sh documenso` cloned the pin
  (`[bootstrap] cloned f4105e47…`); `npm ci` ran by hand under Node 24 (bootstrap does not install
  Documenso yet; this task adds it).
- Baseline on the plan branch: `npm run check` green, `# tests 131`, `# pass 131`, `# fail 0`.
- The seed creates `example@documenso.com` and `admin@documenso.com` with fixture passwords from
  the fork's seed file. **No plan, test, log or report copies them; P6 never uses them** (D3).
- Timings here prove the stack works. They are never published (AGENTS.md); published numbers come
  only from GitHub Actions (median of ≥ 3 runs).

## 2. Probe findings (required; no guessed values)

### 2.1 Summary

| #   | Question            | Observed                                                                                                                                                                                                                                                                                                                                                                                                  |
| --- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | Install             | `npm ci --no-audit --no-fund` under Node 24.21.0: **68 s**, exit 0, 2053 packages, `node_modules` 2.2 GB. No blocked host.                                                                                                                                                                                                                                                                                |
| P1  | Cold `up:documenso` | **266 s**, exit 0, returns by itself. Phases: compose up (Postgres 15 + Inbucket image pulls), `prisma:generate`, `prisma:migrate-deploy`, `prisma:seed`, `translate:compile`, Vite client build **55.3 s**, SSR build **34.4 s**, `build:server` (rollup) **49.5 s**, `npm run start`, health 200.                                                                                                       |
| P1  | Cold peak memory    | **4690 MB** used (whole VM, `free -m` every 5 s) at +206 s (Vite SSR build). Baseline 640 MB. No OOM, no swap needed.                                                                                                                                                                                                                                                                                     |
| P1  | Warm `up`           | **25 s** and **24 s** (two runs): "seed user … already present; skipped prisma:seed", "build matches HEAD f4105e47…; skipping the build". Peak 1551 MB. A second `up` while running: "Documenso already healthy at …/signin (HTTP 200)", exit 0.                                                                                                                                                          |
| P1  | `down`              | Exit 0 in **1 s**, twice in a row: "Documenso web stopped and compose stack torn down." No `build/server/main.js` process left, `:3001` closed, no container. Volume `qa-harness-documenso_documenso_harness_pg` kept.                                                                                                                                                                                    |
| P2  | API token           | **Secret-free per-run flow works** (§2.3): csrf → `POST /api/auth/email-password/signup` 201 → confirmation email in Inbucket (257 ms) → `POST …/verify-email` 200 `VERIFIED` + `sessionId` cookie → `organisation.getMany` → `team.find` → `apiToken.create` 200. ≈ 0.9 s. Token works on API v1 and v2 (200); a wrong token → 401.                                                                      |
| P3  | Rate limits         | Harness v0.2.11 passes `DANGEROUS_BYPASS_RATE_LIMITS=true` through when it is set (`buildDocumensoAppEnv`). Without it, 20 parallel logins → **10 × 429**; with it → **0 × 429** (20/20 reach the handler). The bypass short-circuits both the per-org limits and the global per-IP limiter.                                                                                                              |
| P4  | Signing cert        | `assertDocumensoSigningCert` requires `<fork>/apps/remix/example/cert.p12` (tracked in the fork). Harness sets `NEXT_PRIVATE_SIGNING_TRANSPORT=local`, `NEXT_PRIVATE_SIGNING_LOCAL_FILE_PATH=<absolute path>`, `NEXT_PRIVATE_SIGNING_PASSPHRASE=` (empty). PKCS#12, CN=Documenso, valid to 2036. Nothing generated or committed. A document sealed with it (§2.7).                                        |
| P5  | Inbucket            | Web/API on **127.0.0.1:9003**, SMTP 127.0.0.1:2525. `GET /api/v1/mailbox/<local-part>` → list; `GET /api/v1/mailbox/<name>/<id>` → message with `header` and `body.{text,html}`; `DELETE /api/v1/mailbox/<name>` → purge (200). Document emails carry **`X-Documenso-Envelope-Id`** (§2.5).                                                                                                               |
| P6  | Webhooks            | Create-time schema refuses `127.0.0.1`/`localhost` URLs. Delivery-time guard resolves the host and refuses private IPs **unless the host is in `NEXT_PRIVATE_WEBHOOK_SSRF_BYPASS_HOSTS`**. Working setup: `/etc/hosts` `127.0.0.1 p6-webhook.test` + bypass list `p6-webhook.test` → delivered in 45 ms, `WebhookCall` `SUCCESS` 200. Same receiver under a non-listed name → `FAILED`, `responseCode` 0. |
| P7  | Background jobs     | `NEXT_PRIVATE_JOBS_PROVIDER=local`: jobs run **inside the web process** (no worker). `BackgroundJob` + `BackgroundJobTask`. One document end to end: `internal.seal-document` **995 ms** (submit → done; task 488 ms), Envelope `COMPLETED` 971 ms after the last signature, `send.document.completed.emails` 223 ms.                                                                                     |
| P8  | Postgres            | `postgres://documenso:password@127.0.0.1:5451/documenso` (harness default; fork placeholder, not a secret). PostgreSQL 15.19, `TimeZone` `Etc/UTC`. `default_transaction_read_only=on` accepted; `INSERT INTO "Webhook"` → **SQLSTATE 25006**. Tables in §2.8.                                                                                                                                            |
| —   | Health burst        | 20 gated `GET /api/auth/csrf`: 20 × 200, spread 0.90–1.29 ms, slowest 16 ms (3 rounds). `GET /signin`: 20 × 200, spread 1.92–2.71 ms, slowest 215 ms.                                                                                                                                                                                                                                                     |
| —   | Product finding     | A wrong password on `POST /api/auth/email-password/authorize` returns **HTTP 500** `{"code":"INVALID_CREDENTIALS"}` (sequential and 20/20 parallel). A wrong CSRF token also returns 500. PRODUCT BUG candidate (§2.11), out of this task's scope.                                                                                                                                                        |

### 2.2 Bring-up (exact)

```bash
export PATH="/home/user/tools/node24/bin:$PATH"     # probe location; the plan uses /opt/node24 (§13)
BOOTSTRAP_SKIP_INSTALL=1 bash scripts/bootstrap.sh documenso
(cd /home/user/products/documenso && npm ci --no-audit --no-fund)          # 68 s
DANGEROUS_BYPASS_RATE_LIMITS=true NEXT_PRIVATE_WEBHOOK_SSRF_BYPASS_HOSTS=p6-webhook.test \
  node scripts/harness.mjs up documenso                                     # cold 266 s, warm 24–25 s
node scripts/harness.mjs down documenso                                      # 1 s
```

- `up()` (harness) asserts Node ≥ 24 and the cert, starts compose (Postgres on `127.0.0.1:5451`, Inbucket SMTP on `127.0.0.1:2525`), migrates, seeds once, builds once
  per fork SHA (`apps/remix/build/harness-build.json`), starts `npm run start -w @documenso/remix`
  **detached** with its pid in a pid file, waits for `/signin` and `/api/auth/csrf` = 200, and
  **returns**. Unlike Cal (Task 3 H2/H3), no P6 process-group bridge is needed.
- The adapter runs `npm` from `PATH` for every step, and the web process inherits
  `{ ...process.env, ...appEnv }` (`spawn-detached.ts`). So the **whole process tree** must see Node
  24 first on `PATH`, and P6 can pass extra app env (rate-limit bypass, SSRF bypass host) through the
  environment of `harness.mjs` without touching the harness or the fork.
- Web log: `node_modules/qa-portfolio-harness/.harness/documenso-web.log` (inside P6's
  `node_modules`, same place as `cal-web.log`).
- The fork's `.env` is copied from `.env.example` by the adapter when missing (gitignored in the
  fork); harness values override it.

### 2.3 API token without pasted secrets (P2)

Request sequence (one cookie jar per user; `<prefix>` = lowercased `p6RunPrefix()`):

| #   | Request                                                                                                                         | Observed                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 1   | `GET /api/auth/csrf`                                                                                                            | 200 `{ csrfToken }`, cookie `csrfToken`                                             |
| 2   | `POST /api/auth/email-password/signup` `{ name, email: "<prefix>-owner@example.com", password: <generated> }`                   | **201** `OK`, 501–565 ms. Queues job `send.signup.confirmation.email` (194–224 ms). |
| 3   | Inbucket `GET /api/v1/mailbox/<prefix>-owner`                                                                                   | 1 message, subject `Please confirm your email`, after **257–263 ms**                |
| 4   | Extract `/verify-email/<token>` from the message body, `POST /api/auth/email-password/verify-email` `{ token }`                 | **200** `{"state":"VERIFIED"}`; sets cookie `sessionId` (the user is signed in)     |
| 5   | `GET /api/trpc/organisation.getMany` (no `input`; the procedure takes void)                                                     | 200, 1 organisation (`id` `org_…`)                                                  |
| 6   | `GET /api/trpc/team.find?input={"json":{"organisationId":…,"query":"","page":1,"perPage":10}}`                                  | 200, 1 team `Personal Team` (numeric `id`)                                          |
| 7   | `POST /api/trpc/apiToken.create` `{"json":{"teamId":…,"tokenName":"<prefix>-token","expirationDate":null}}`, header `x-team-id` | 200 `{ id, token }` (token 20 chars, never printed)                                 |
| 8   | `GET /api/v1/documents?page=1&perPage=1`, `Authorization: Bearer <token>`                                                       | **200** `{"documents":[],"totalPages":0}`; v2 `GET /api/v2/envelope?…` **200**      |

Notes:

- Mount points: email/password routes live under `/api/auth/email-password/*`
  (`packages/auth/server/index.ts`); `POST /api/auth/signup` is 404.
- The fork's own e2e tests create tokens with Prisma (`apiCreateTestContext`); P6 must not
  (no SQL writes, tokens never via SQL). The flow above only uses the product's HTTP API and the
  email the product sends.
- The password is generated per run (`crypto.randomBytes`), held in memory, never printed or
  stored. Without rate-limit bypass, signup is limited to 3 per IP per 3 h (`signupRateLimit`).
- Reuse for P2 Task 4 (D8): the flow needs only `fetch`, `node:crypto` and the Inbucket client.

### 2.4 Rate limits (P3)

`packages/lib/server-only/rate-limit/rate-limit.ts` `check()` returns allowed when
`process.env.DANGEROUS_BYPASS_RATE_LIMITS === 'true'`; `assert-organisation-rates-and-limits.ts`
does the same; the fork's e2e notes it "short-circuits BOTH the per-org assertion and the global IP
limiter". Harness: `buildDocumensoAppEnv` adds `DANGEROUS_BYPASS_RATE_LIMITS: "true"` only when the
harness process has it set to `"true"` (v0.2.6+ behaviour, still present in v0.2.11).

Burst: 20 × `POST /api/auth/email-password/authorize` behind `fireTogether` (one per-run address,
wrong password, valid CSRF). `loginRateLimit` = 10 per 15 min per IP + identifier.

| Server env                          | Statuses                                                                                              | Spread  |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------- | ------- |
| bypass **unset** (warm up #1)       | **10 × 429** `{"code":"UNKNOWN_ERROR","message":"","statusCode":429}`, 10 × 500 `INVALID_CREDENTIALS` | 3.56 ms |
| `DANGEROUS_BYPASS_RATE_LIMITS=true` | **0 × 429**, 20 × 500 `INVALID_CREDENTIALS`                                                           | 4.11 ms |

### 2.5 Inbucket (P5)

- Image `inbucket/inbucket` (unpinned in the harness compose; probe pulled digest
  `sha256:48063d73…`, created 2026-10-10). Env: `INBUCKET_STORAGE_MAILBOXMSGCAP=300`,
  `INBUCKET_STORAGE_RETENTIONPERIOD=72h`.
- Mailbox name = the **local part** of the recipient address (`p6-qa-…-owner` for
  `p6-qa-…-owner@example.com`).
- List item keys: `mailbox, id, from, to, subject, date, posix-millis, size, seen`. Message adds
  `header` (map of string arrays) and `body.text`, `body.html`.
- Per-document counting: the signing-request email has header
  `X-Documenso-Envelope-Id: envelope_…` (plus `X-Documenso-Sender-User-Id`, `X-Documenso-Team-Id`);
  the "Signing Complete!" email does **not**. So Task 7 counts per document by **one unique
  recipient address per document** (its mailbox), and uses the header where present as a second
  check. Never by subject.
- One completed document produced: signer mailbox 2 (`Please sign this document`,
  `Signing Complete!`), owner mailbox 3 (confirmation, `P6 Signer has signed "…"`,
  `Signing Complete!`).

### 2.6 Webhooks (P6)

Two guards in the fork:

1. Create/edit: `ZWebhookUrlSchema` refines `!isPrivateUrl(url)` — literal `localhost`, `127.*`,
   `10.*`, `192.168.*`, `169.254.*`, IPv6 private/loopback. Any IP-literal or `localhost` URL is
   refused with `400 "Webhook URL cannot point to a private or loopback address"`. A hostname is not
   checked here.
2. Delivery (`execute-webhook-call.ts` → `assertNotPrivateUrl`): resolves the hostname and refuses
   private addresses, **unless** the hostname is in `NEXT_PRIVATE_WEBHOOK_SSRF_BYPASS_HOSTS`
   (comma-separated, read once at module load, so a change needs a restart).

| Receiver URL (receiver bound on 127.0.0.1)                       | Create | Delivery                                                                                     |
| ---------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------- |
| `http://127.0.0.1:<port>/hook`                                   | 400    | —                                                                                            |
| `http://p6-webhook.test:<port>/hook` (hosts entry + bypass list) | 200    | delivered **45 ms** after `webhook.testWebhook`; `WebhookCall` `SUCCESS`, `responseCode` 200 |
| `http://p6-other.test:<port>/hook` (hosts entry, not in list)    | 200    | not delivered; `WebhookCall` `FAILED`, `responseCode` 0 (retried, 4 rows); job `FAILED`      |

- `lvh.me` (public wildcard DNS) does not resolve in this sandbox (`ENOTFOUND`); a hosts entry is
  deterministic and needs no third-party DNS.
- Delivery request: `POST`, headers include `content-type` and `x-documenso-secret` (equals the
  webhook's `secret`). Body `{ event, payload, createdAt, webhookEndpoint }`.
- **`WebhookCall.requestBody` deep-equals the delivered body** (`isDeepStrictEqual` true);
  `responseBody` stores the receiver's reply (`{"ok":true}`); `webhookEndpoint` = `WebhookCall.url`.
- `webhook.testWebhook` triggers **every** webhook of the team for that event, not only the one
  given; per-run users have their own team, so runs do not cross.
- A real document produced `DOCUMENT_SENT` then `DOCUMENT_COMPLETED`, both `SUCCESS` 200.

| Table         | Columns                                                                                                                                                                                                        |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WebhookCall` | `id` text, `status` WebhookCallStatus (SUCCESS, FAILED), `url`, `requestBody` jsonb, `responseCode` int, `responseHeaders` jsonb, `responseBody` jsonb, `createdAt`, `webhookId`, `event` WebhookTriggerEvents |
| `Webhook`     | `id`, `webhookUrl`, `eventTriggers` (array), `secret`, `enabled`, `createdAt`, `updatedAt`, `userId`, `teamId`                                                                                                 |

### 2.7 Background jobs and seal (P7)

One document through the HTTP API (API token from §2.3, v2 `POST /api/v2/envelope/create`
multipart with `assets/example.pdf` 39 842 bytes and one SIGNER + SIGNATURE field;
`POST /api/v2/envelope/distribute`; recipient token from `GET /api/v2/envelope/<id>`, never SQL;
tRPC `field.signFieldWithToken` then `recipient.completeDocumentWithToken`; the procedure is on the `field` router, not `envelope.field`, plan 2026-10-21 Task 7 §2.12):

| Step                                       | Observed                                                                      |
| ------------------------------------------ | ----------------------------------------------------------------------------- |
| `envelope/create`                          | 200 `{ id: "envelope_…" }`, 165 ms                                            |
| `envelope/distribute`                      | 200, 218 ms; signer invite in Inbucket ≤ 4 ms after                           |
| `recipient.completeDocumentWithToken`      | 200 `{"status":"SIGNED"}`, 447 ms                                             |
| `Envelope.status` → `COMPLETED`            | **971 ms** after the complete call                                            |
| `internal.seal-document` job               | `COMPLETED`, **995 ms** submit → done, task `seal-document` 488 ms, 0 retries |
| `DocumentData` after seal                  | `BYTES_64`, `data <> initialData` (sealed), 296 564 chars                     |
| `send.document.completed.emails`           | `COMPLETED`, 223 ms                                                           |
| whole lifecycle (create → completed + 3 s) | 4.4 s                                                                         |

| Table               | Columns                                                                                                                                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BackgroundJob`     | `id`, `status` BackgroundJobStatus (PENDING, PROCESSING, COMPLETED, FAILED), `retried`, `maxRetries`, `jobId`, `name`, `version`, `submittedAt`, `lastRetriedAt`, `completedAt`, `updatedAt`, `payload` jsonb |
| `BackgroundJobTask` | `id`, `status`, `result`, `retried`, `maxRetries`, `createdAt`, `updatedAt`, `jobId`, `completedAt`, `name`                                                                                                   |

Cron jobs registered at start: seal sweep, expire sweep, reminder sweep
and rate-limit cleanup every 15 min, email domain sync hourly, seat drift daily.

### 2.8 Postgres oracle (P8)

`createReadOnlyPool("postgres://documenso:password@127.0.0.1:5451/documenso")`: `SELECT 1` → 1,
`default_transaction_read_only` = `on`, `TimeZone` `Etc/UTC`, PostgreSQL 15.19. An `INSERT` into `"Webhook"` → SQLSTATE `25006` (cannot execute INSERT in a
read-only transaction).

Tables (`public`, matching the probe's filter): `ApiToken`, `BackgroundJob`, `BackgroundJobTask`,
`DocumentAuditLog`, `DocumentData`, `DocumentMeta`, `DocumentShareLink`, `Envelope`,
`EnvelopeAttachment`, `EnvelopeItem`, `Field`, `Organisation`, `Recipient`, `Signature`, `Team`,
`User`, `Webhook`, `WebhookCall`. Documents are **`Envelope`** rows
(`type` `DOCUMENT`/`TEMPLATE`, `status` `"DocumentStatus"` DRAFT/PENDING/COMPLETED/REJECTED/CANCELLED,
`secondaryId` `document_<n>`), files via `EnvelopeItem.documentDataId` → `DocumentData`, recipients in
`Recipient` (`envelopeId`, `signingStatus`, `sendStatus`). `ApiToken` and `Recipient` have a
`token` column: **the oracle never selects it** (D10).

### 2.9 Cleanup and leak (live)

Through the API, as the per-run user: `webhook.deleteWebhook` 200, `apiToken.getMany` +
`apiToken.delete` 200 (the token then gets 401), `profile.deleteAccount` 200, Inbucket
`DELETE /api/v1/mailbox/<name>` 200; **67 ms** in total. Leak query after: `User` with the prefix 0,
`Webhook` for the team 0, `ApiToken` for the team 0, `Team` row 0, mailbox 0. Users from earlier
probe runs whose passwords were discarded stay in the local volume, isolated by prefix (CI starts
with a fresh database).

### 2.10 Web log safety

The CI job uploads `documenso-web.log`. After all probes it held **no** `api_…` tokens, `Bearer`,
`"password"`, `sessionId`, `/verify-email/<token>`, `/sign/<token>` or `x-documenso-secret`; only
request paths/procedure names. The plan still adds a guard step before upload (D12).

### 2.11 Findings to record (not fixed here)

- **`P6-OBS-DOC-001` — PRODUCT BUG, severity low (README only, no test in this task).**
  `POST /api/auth/email-password/authorize` answers a wrong password (and a wrong CSRF token) with
  **HTTP 500** `{"code":"INVALID_CREDENTIALS",…}` / `{"code":"INVALID_REQUEST",…}` instead of 401
  (credentials) / 400 or 403 (CSRF). Reproduced sequentially and 20/20 in parallel (§2.4).
  - Cause: in the `/authorize` handler (`packages/auth/server/routes/email-password.ts`) every error
    is an `AppError` without `statusCode` — line 94 `InvalidRequest` (CSRF), lines 115 and 132
    `InvalidCredentials`, line 156 `InvalidTwoFactorCode` — and `auth.onError`
    (`packages/auth/server/index.ts`) returns `err.statusCode || 500`.
  - **Cross-reference P1:** the same handler and the same root cause are already recorded in P1 as
    [`P7-OBS-DOC-2FA-003`](https://github.com/Jayami123/playwright-e2e-ci-framework/blob/main/docs/observations/documenso-2fa-known-issues.md) (test `P1-DOC-2FA-004`: wrong TOTP on the same `/authorize` →
    500 `INVALID_TWO_FACTOR_CODE`), at the same fork pin `f4105e47` (P1 `e2e.yml` `DOCUMENSO_REF`).
    P1's `P7-OBS-DOC-2FA-004` (disable 2FA with a wrong code → 500) is the same `onError` default on
    another route. `P6-OBS-DOC-001` adds the password and CSRF branches of that handler, which P1
    does not cover; one upstream fix (give these `AppError`s a 4xx `statusCode`, or map
    `AuthenticationErrorCode` to 4xx in `onError`) closes all three.
- **Harness notes (record; do not fix here):** H1 the Inbucket image is unpinned (`latest`); H2
  Documenso needs Node 24 while Medusa/Cal run on 22.23 in the same VM; H3 `authenticate()` still
  asks for a pasted `DOCUMENSO_API_TOKEN` — §2.3 is the scripted alternative. H1 and H3 are harness
  v0.3.0 follow-ups (§21); H2 is handled in P6 by D1.

## 3. Resolved decisions

Lead with the industry-standard approach, then the alternative and its tradeoff.

- **D1 Node 24 side by side, selected per product.** Install Node v24.21.0 at `/opt/node24` next to
  the existing 22.23 in `/usr/local/bin` (AGENTS.md keeps 22.23 first for Medusa/Cal). `harness.mjs`
  runs Documenso under Node 24: if the current Node is ≥ 24 it runs as today; else, if
  `${DOCUMENSO_NODE_HOME:-/opt/node24}/bin/node` exists, it spawns `up.mjs`/`down.mjs` with that
  binary and that `bin` dir first on the child's `PATH`; else it exits 1 with an `ENV:` line.
  `bootstrap.sh documenso` uses the same rule for `npm ci`. In CI, only the `documenso-smoke` job
  runs `actions/setup-node` with `node-version: "24.21.0"`; `medusa-smoke` and `cal-smoke` keep
  `node-version-file: .nvmrc` (22) unchanged (confirmed, answer 2). Standard: a pinned toolchain per product, like `nvm use` in a monorepo.
  Rejected: Node 24 for everything (Medusa/Cal are proven on 22.23 only); asking the operator to
  `export PATH` (easy to forget, and AGENTS.md says the opposite).
- **D2 Test-environment switches through env, not the fork.** `DANGEROUS_BYPASS_RATE_LIMITS=true`
  (harness passes it through) and `NEXT_PRIVATE_WEBHOOK_SSRF_BYPASS_HOSTS=p6-webhook.test` (inherited
  by the web process). `harness.mjs` sets both as defaults for `documenso` when unset (like
  `MEDUSA_SKIP_STOREFRONT`); CI also sets them in job env. Standard: functional/race tests run with
  limiters off; otherwise a race measures 429s (§2.4). Rejected: editing the fork's `.env` (fork
  edit), keeping limits on (20-burst gets 10 × 429).
- **D3 Auth = per-run user via signup + email verification + `apiToken.create`** (§2.3). Secret-free:
  the password is generated per run in memory; the token lives in memory only; both are deleted at
  the end (`apiToken.delete`, `profile.deleteAccount`). Rejected: seeded users (fixture passwords
  would have to be read from the fork or pasted; shared state across runs); a pasted
  `DOCUMENSO_API_TOKEN` (manual, long-lived, the harness TODO); creating tokens with SQL (forbidden).
- **D4 Webhook receiver = in-process HTTP server on 127.0.0.1, addressed as `p6-webhook.test`.**
  `/etc/hosts` maps `127.0.0.1 p6-webhook.test` (RFC 6761 reserved `.test`). The name passes the
  create-time check (not an IP), and the bypass list lets delivery through. Standard: a stable
  hostname for a local service plus an explicit SSRF allowlist entry, instead of turning SSRF
  protection off. Rejected: `lvh.me`/`nip.io` (third-party DNS; does not resolve here); a public
  tunnel (network dependency, exposes the runner); a Docker-network receiver (more moving parts).
  Confirmed (answer 3): the allowlist holds exactly one host, `p6-webhook.test`.
- **D5 Email capture = Inbucket HTTP API** at `INBUCKET_BASE_URL` (default
  `http://127.0.0.1:9003`). Count by unique recipient address (mailbox) and, for document emails, by
  `X-Documenso-Envelope-Id`. Purge each used mailbox in cleanup. Rejected: subject matching
  (shared subjects across documents).
- **D6 Background jobs need no worker.** `NEXT_PRIVATE_JOBS_PROVIDER=local` (harness) runs jobs in the
  web process; the self-test proves it through webhook delivery (`internal.execute-webhook`).
  `waitForStable` reads for async rows.
- **D7 Self-test = health burst + oracle + one email + one webhook matched to its `WebhookCall`.**
  Per trial (`RACE_TRIALS`, CI 3): 20 gated `GET /api/auth/csrf` (all 200, spread below the limit).
  Once per run: `SELECT 1`, `INSERT` → 25006, per-run user (confirmation email count = 1), API token
  proven on `GET /api/v1/documents` = 200, webhook `DOCUMENT_COMPLETED` via `webhook.testWebhook` →
  exactly one delivery with matching secret → exactly one `WebhookCall` row `SUCCESS`/200 whose
  `requestBody` deep-equals the delivery. Rejected: a full sealed document (Task 7's job; 4.4 s and a
  PDF per run); `/signin` as the burst URL (215 ms vs 16 ms, no extra signal).
- **D8 Reusable account module.** `src/documenso/account.ts` imports only `node:crypto`,
  `src/documenso/inbucket.ts` and `fetch`, so P2 Task 4 can copy it unchanged (or import it if P6 is
  published as a dependency later). Decided (answer 6): P2 Task 4 **copies** `account.ts` and
  `inbucket.ts`; moving the flow into the harness `authenticate()` is a v0.3.0 follow-up (§21).
- **D9 Env getters in `src/documenso/env.ts`** (roadmap names it), not in `src/races/env.ts`. Defaults
  are the harness defaults (`127.0.0.1` only). The DB URL resolves `P6_DOCUMENSO_DATABASE_URL` →
  `DOCUMENSO_DB_URL` → `postgres://documenso:password@127.0.0.1:5451/documenso` (the harness
  compose's local placeholder, not a secret).
- **D10 Oracle reads never select token or password columns** (`ApiToken.token`,
  `Recipient.token`, `User.password`). Leak queries count rows only.
- **D11 Reuse framework as-is.** `fireTogether`, `runTrials`, `recordTrial`, histogram helpers,
  `createReadOnlyPool`/`selectRows`/`waitForStable`, `p6RunPrefix`, `casePrefix`/`likeLiteralPrefix`
  (`src/medusa/payloads.ts`, as Task 4 does). No change to `runTrials` or `fireTogether`.
- **D12 CI job `documenso-smoke` is independent** of `medusa-smoke` and `cal-smoke` (no `needs`).
  Uploads `race-histograms-documenso` (`!cancelled() && up success`) and `documenso-web-log`
  (`if: always()`), after a guard step that fails the job if the log contains an `api_` token
  pattern. Caches: npm (`setup-node`), fork build `apps/remix/build` keyed on `DOCUMENSO_REF` +
  `h0.2.11`, saved on `main` pushes only.
- **D13 No `test.fail()`.** The self-test must be green; a red result is labelled PRODUCT / TEST / ENV
  with evidence (§11).
- **D14 Inbucket `latest` is accepted; API drift is ENV** (answer 7). The client validates the
  shapes recorded in §2.5 (`assertInbucketList`, `assertInbucketMessage`) and throws
  `ENV: Inbucket API drift: …` when a field is missing or has another type, so a changed image never
  reads as a missing email (PRODUCT BUG). Pinning the image by digest is a harness v0.3.0 follow-up
  (§21).
- **D15 Documenso is installed on demand** (answer 4): `bash scripts/bootstrap.sh documenso` once per
  machine or session. Cursor's `install` stays Medusa-only.

## 4. Goal and scope

**In:** Documenso install in `bootstrap.sh` (Node 24); `harness.mjs` Node 24 selection + env defaults;
`src/documenso/{env,inbucket,webhook-receiver,account,oracle}.ts`; `scripts/lib/documenso-node.mjs`;
unit tests first; `package.json` scripts; `k6/smoke/documenso-health.js`; Playwright project
`documenso-race`; `tests/documenso/races/documenso-self-test.spec.ts`; CI job `documenso-smoke`;
`.cursor/*`, `.claude/hooks/session-start.sh`, `AGENTS.md`; README "Run Documenso";
`.env.example` names.

**Out:** documents, signing, sealing, races (Task 7); the 500-on-login finding beyond recording it;
harness or fork edits; changes to `medusa-smoke`/`cal-smoke`; seed users; `test.fail()`.

## 5. Test-case mapping

| Name                           | File                                                | Project          | Histogram `caseId`    | Oracle                                                                                                                                 |
| ------------------------------ | --------------------------------------------------- | ---------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| documenso self-test (unmapped) | `tests/documenso/races/documenso-self-test.spec.ts` | `documenso-race` | `documenso-self-test` | `SELECT 1`; INSERT → 25006; confirmation emails = 1; API v1 200; deliveries = 1; `WebhookCall` = 1 `SUCCESS` 200, body equal; leak = 0 |

## 6. Extra risky checks (inside this task)

1. `up:documenso` twice: second prints `Documenso already healthy` and exits 0.
2. `down:documenso` twice: exit 0 both; no `build/server/main.js` process; `:3001` closed.
3. Running `up:documenso` under Node 22 with no Node 24 available exits 1 with
   `ENV: Documenso needs Node 24` (D1), before any compose call.
4. Webhook host missing from `/etc/hosts` → self-test fails in `beforeAll` with
   `ENV: p6-webhook.test does not resolve to 127.0.0.1`.
5. `medusa-smoke` and `cal-smoke` sections of `perf.yml` byte-for-byte unchanged.

## 7. Architecture (every file touched, one responsibility each)

| File                                                | Change | Responsibility                                                                     |
| --------------------------------------------------- | ------ | ---------------------------------------------------------------------------------- |
| `scripts/lib/documenso-node.mjs`                    | new    | Pure `chooseDocumensoNode({ currentVersion, home, exists })`                       |
| `scripts/harness.mjs`                               | edit   | Documenso: env defaults (D2), Node 24 selection (D1); Medusa/Cal paths unchanged   |
| `scripts/bootstrap.sh`                              | edit   | `install_documenso_deps` (npm ci under Node 24)                                    |
| `src/documenso/env.ts`                              | new    | Getters: base URL, DB URL, Inbucket URL, webhook host                              |
| `src/documenso/inbucket.ts`                         | new    | Mailbox naming, list/get/purge/wait, envelope-id counting, verify-token extraction |
| `src/documenso/webhook-receiver.ts`                 | new    | `parseDelivery` (pure), `startWebhookReceiver` (127.0.0.1 server)                  |
| `src/documenso/account.ts`                          | new    | Cookie jar, tRPC helpers, signup+verify, team, API token, webhook, cleanup         |
| `src/documenso/oracle.ts`                           | new    | SQL constants, `readWebhookCalls`, `leakCheck`                                     |
| `tests/unit/documenso-node.test.ts`                 | new    | Node selection                                                                     |
| `tests/unit/documenso-env.test.ts`                  | new    | Getters                                                                            |
| `tests/unit/documenso-inbucket.test.ts`             | new    | Pure Inbucket helpers + client against a fake HTTP server                          |
| `tests/unit/webhook-receiver.test.ts`               | new    | `parseDelivery` + a real POST to the receiver                                      |
| `tests/unit/documenso-account.test.ts`              | new    | tRPC URL/parse helpers, cookie jar, password generator                             |
| `tests/unit/documenso-oracle.test.ts`               | new    | SQL is SELECT-only and never names token/password columns                          |
| `package.json`                                      | edit   | `up:documenso`, `down:documenso`, `smoke:documenso`, `race:documenso`              |
| `k6/smoke/documenso-health.js`                      | new    | k6 `GET /signin` + `GET /api/auth/csrf`                                            |
| `playwright.config.ts`                              | edit   | Project `documenso-race`                                                           |
| `tests/documenso/races/documenso-self-test.spec.ts` | new    | Self-test (D7)                                                                     |
| `.github/workflows/perf.yml`                        | edit   | `DOCUMENSO_REF` env, job `documenso-smoke`                                         |
| `.cursor/Dockerfile`, `.cursor/environment.json`    | edit   | Node 24 at `/opt/node24`; hosts entry on start (§13)                               |
| `.claude/hooks/session-start.sh`                    | edit   | Hosts entry; Node 24 presence hint (§13)                                           |
| `AGENTS.md`                                         | edit   | Documenso lines for both clouds                                                    |
| `README.md`, `.env.example`                         | edit   | "Run Documenso"; env names                                                         |

Unchanged: `src/races/*`, `src/oracles/pg.ts`, `src/cal/*`, `src/medusa/*`, harness, fork,
`medusa-smoke`, `cal-smoke`.

## 8. Histogram fields for the self-test

```ts
createHistogram({
  caseId: "documenso-self-test",
  title: "documenso self-test (unmapped)",
  product: "documenso",
  concurrency: 20,
  trials, // RACE_TRIALS
});
```

Histogram `oracle`: `selectOne` (1),
`readOnlySqlstate` (`"25006"`), `confirmationEmails` (1), `apiV1Status` (200), `webhookDeliveries`
(1), `webhookSecretMatches` (true), `webhookCallRows` (1), `webhookCallStatus` (`"SUCCESS"`),
`webhookCallResponseCode` (200), `webhookBodyMatches` (true), `deliveryMs`, `mintMs`,
`leakUsers`/`leakWebhooks`/`leakApiTokens`/`leakMails` (0). No emails, tokens, cookies or secrets.
`verdict: "pass"` only if every trial is 20 × 200 under the spread limit and every oracle value
matches.

## 9. Oracle design (exact SQL)

`src/documenso/oracle.ts` (every query through `selectRows`):

```ts
import type pg from "pg";
import { selectRows, waitForStable } from "../oracles/pg.ts";

export const WEBHOOK_CALLS_SQL = `
SELECT id, status::text AS status, event::text AS event, url, "responseCode", "requestBody"
FROM "WebhookCall"
WHERE "webhookId" = $1
ORDER BY "createdAt"
`;

export const LEAK_USERS_SQL = `SELECT COUNT(*)::int AS n FROM "User" WHERE email LIKE $1`;
export const LEAK_WEBHOOKS_SQL = `SELECT COUNT(*)::int AS n FROM "Webhook" WHERE "teamId" = $1`;
export const LEAK_API_TOKENS_SQL = `SELECT COUNT(*)::int AS n FROM "ApiToken" WHERE "teamId" = $1`;

export type WebhookCallRow = {
  id: string;
  status: string;
  event: string;
  url: string;
  responseCode: number | null;
  requestBody: unknown;
};

export async function readWebhookCalls(
  pool: pg.Pool,
  webhookId: string,
): Promise<WebhookCallRow[]> {
  return waitForStable(() => selectRows<WebhookCallRow>(pool, WEBHOOK_CALLS_SQL, [webhookId]), {
    timeoutMs: 15_000,
  });
}

/** [] when the run left nothing behind; else TEST BUG lines with counts only. */
export async function leakCheck(
  pool: pg.Pool,
  input: { userLikePattern: string; teamId: number | null; mailboxCount: number },
): Promise<{ violations: string[]; counts: Record<string, number> }> {
  const n = async (sql: string, p: unknown[]) =>
    Number((await selectRows<{ n: number }>(pool, sql, p))[0]?.n ?? 0);
  const counts = {
    leakUsers: await n(LEAK_USERS_SQL, [input.userLikePattern]),
    leakWebhooks: input.teamId === null ? 0 : await n(LEAK_WEBHOOKS_SQL, [input.teamId]),
    leakApiTokens: input.teamId === null ? 0 : await n(LEAK_API_TOKENS_SQL, [input.teamId]),
    leakMails: input.mailboxCount,
  };
  const violations = Object.entries(counts)
    .filter(([, v]) => v !== 0)
    .map(([k, v]) => `TEST BUG: ${k} = ${v} after cleanup`);
  return { violations, counts };
}
```

`"User"`, `"Webhook"`, `"ApiToken"`, `"WebhookCall"` are double-quoted (Prisma model names). No query
selects `token`, `password` or `secret` (unit-tested, D10).

## 10. Test data, isolation, cleanup and leak check

- Run prefix `p6RunPrefix()`; case prefix `casePrefix(runPrefix, "documenso-self-test")` (lowercase,
  `[a-z0-9-]`). Owner email `${casePrefix}-owner@example.com` (signup accepted `example.com`).
  User LIKE pattern `likeLiteralPrefix(\`${casePrefix}-\`)`.
- One user, one team, one API token, one webhook per run. The webhook secret is
  `randomBytes(16).toString("hex")`, in memory only; the receiver reports only `secretMatches`.
- Cleanup in `finally` (each step best effort, failures pushed as
  `TEST BUG: cleanup <step> failed: <message ≤ 200 chars>`): `deleteWebhook`, `deleteApiToken`,
  `deleteAccount`, `inbucket.purge(mailbox)`, `receiver.close()`.
- Leak check after cleanup: users/webhooks/tokens/mails = 0 (§9). Any non-zero → `TEST BUG`,
  `verdict: "fail"`.
- Locally the Postgres volume survives `down` (harness keeps it); the prefix keeps runs apart. CI is
  always fresh.

## 11. Known-bug handling and labels (no `test.fail()` in this task)

| Observation                                                                   | Label                                                                       | Evidence to paste                                                       |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Health burst not all 200 after `up` reported ready                            | **PRODUCT BUG**                                                             | status + first 200 chars of body                                        |
| Signup ≠ 201, verify ≠ `VERIFIED`, token create ≠ 200, API v1 ≠ 200           | **PRODUCT BUG**                                                             | status + body summary (no token, no password)                           |
| Confirmation email count ≠ 1 within 15 s                                      | **PRODUCT BUG** (or ENV if Inbucket is down: `GET /api/v1/mailbox/x` ≠ 200) | mailbox list length, Inbucket status                                    |
| Webhook delivered 0 times and `WebhookCall` `FAILED` with `responseCode` 0    | **ENV**                                                                     | `NEXT_PRIVATE_WEBHOOK_SSRF_BYPASS_HOSTS` missing or hosts entry missing |
| Delivered ≠ 1, secret mismatch, rows ≠ 1, row not `SUCCESS`/200, body differs | **PRODUCT BUG**                                                             | counts, row status/code, `isDeepStrictEqual` result                     |
| 429 anywhere                                                                  | **ENV**                                                                     | `DANGEROUS_BYPASS_RATE_LIMITS` not reaching the app                     |
| Spread ≥ `RACE_MAX_SPREAD_MS`                                                 | **TEST BUG**                                                                | `dispatchSpreadMs`                                                      |
| INSERT not 25006; leak ≠ 0; cleanup step failed                               | **TEST BUG**                                                                | SQLSTATE / counts / step                                                |
| `up` exit 1, Node < 24, OOM, blocked host, Docker/disk                        | **ENV**                                                                     | last 40 lines of `documenso-web.log` and the step log                   |
| `ENV: Inbucket API drift: …` (list/message shape differs from §2.5)           | **ENV**                                                                     | the drift message (field name + type), Inbucket image digest            |

`P6-OBS-DOC-001` (500 on a wrong password, §2.11) is recorded in README only; the self-test does not
log in with a password, so it does not hit it.

## 12. CI (`.github/workflows/perf.yml`)

Top-level `env`: add `DOCUMENSO_REF: f4105e47eba56f5d8d7e70dd516a8fcc0c870d7c` (comment: same SHA as
`scripts/bootstrap.sh`). New job after `cal-smoke`; do not touch the other jobs. Reuse the exact
action SHAs already in the file.

```yaml
documenso-smoke:
  name: documenso-smoke
  runs-on: ubuntu-24.04
  timeout-minutes: 45
  env:
    P6_WORKING_DIRECTORY: p6
    PRODUCTS_ROOT: ${{ github.workspace }}/products
    DOCUMENSO_CHECKOUT_PATH: products/documenso
    DOCUMENSO_BASE_URL: http://127.0.0.1:3001
    # Harness compose's local placeholder credentials. Not a secret.
    DOCUMENSO_DB_URL: postgres://documenso:password@127.0.0.1:5451/documenso
    INBUCKET_BASE_URL: http://127.0.0.1:9003
    P6_WEBHOOK_HOST: p6-webhook.test
    # Test environment: limiters off (harness passes it through), SSRF allowlist for the receiver.
    DANGEROUS_BYPASS_RATE_LIMITS: "true"
    NEXT_PRIVATE_WEBHOOK_SSRF_BYPASS_HOSTS: p6-webhook.test
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: "1"
  steps:
    # 1 checkout P6 into p6 (persist-credentials: false)
    # 2 "Checkout Documenso fork": repository Jayami123/documenso, ref ${{ env.DOCUMENSO_REF }},
    #   path ${{ env.DOCUMENSO_CHECKOUT_PATH }}, persist-credentials: false
    # 3 "Verify Documenso fork HEAD" (same shell as the Cal step, DOCUMENSO_* names)
    # 4 "Verify DOCUMENSO_REF matches bootstrap.sh":
    #   grep -q "^DOCUMENSO_REF=\"${DOCUMENSO_REF}\"$" "${P6_WORKING_DIRECTORY}/scripts/bootstrap.sh"
    # 5 actions/setup-node: node-version "24.21.0" (this job only; the other jobs keep .nvmrc), cache npm,
    #   cache-dependency-path: |
    #     p6/package-lock.json
    #     products/documenso/package-lock.json
    # 6 "Install P6 dependencies": npm ci in p6
    # 7 grafana/setup-k6-action with K6_VERSION
    # 8 "Install Documenso dependencies": npm ci --no-audit --no-fund in the fork
    # 9 "Prepare harness roots": in p6, BOOTSTRAP_SKIP_INSTALL=1 bash scripts/bootstrap.sh documenso
    # 10 "Map the webhook host": echo "127.0.0.1 ${P6_WEBHOOK_HOST}" | sudo tee -a /etc/hosts;
    #    getent hosts "${P6_WEBHOOK_HOST}" | grep -q '^127\.0\.0\.1 '
    # 11 "Restore Documenso build cache" (id documenso_build): path products/documenso/apps/remix/build,
    #    key ${{ runner.os }}-documenso-build-${{ env.DOCUMENSO_REF }}-h0.2.11
    # 12 "Start Documenso (harness up)" (id documenso_up): SECONDS=0; npm run up:documenso;
    #    echo "### Documenso harness up: ${SECONDS} s" >> "$GITHUB_STEP_SUMMARY"
    # 13 "k6 smoke (GET /signin, /api/auth/csrf)" if up success: npm run smoke:documenso
    # 14 upload results/documenso-health-summary.json as k6-summary-documenso-health
    #    (!cancelled() && up success)
    # 15 "Race self-test (documenso-race, 3 trials)" if up success, env RACE_TRIALS "3",
    #    RACE_MAX_SPREAD_MS "20": npm run race:documenso
    # 16 upload p6/results/races/ as race-histograms-documenso (!cancelled() && up success)
    # 17 "Check Documenso web log for tokens" (id web_log_check), if: always():
    #    log=p6/node_modules/qa-portfolio-harness/.harness/documenso-web.log;
    #    if [ -f "$log" ] && grep -qE 'api_[A-Za-z0-9]{8,}' "$log"; then
    #      echo "::error::documenso-web.log contains an API token pattern; not uploading"; exit 1; fi
    # 18 upload that log as documenso-web-log, if: ${{ always() && steps.web_log_check.outcome == 'success' }},
    #    if-no-files-found: warn, retention-days 14
    # 19 "Stop Documenso (harness down)" if: always(): npm run down:documenso || true
    # 20 "Save Documenso build cache": github.event_name == 'push' && github.ref == 'refs/heads/main'
    #    && cache miss && hashFiles('products/documenso/apps/remix/build/harness-build.json') != '',
    #    continue-on-error: true
```

The `race-histograms-documenso` artefact holds `documenso-self-test.json`. No swap step (cold peak
4.7 GB of the runner's 16 GB). Estimated CI time (VM numbers, to be replaced by the first run): cold
≈ 2 min install + ≈ 4.5 min `up`; warm (build cache) ≈ 2 min install + ≈ 30 s `up`; self-test ≈ 10 s.

## 13. Environment changes

Every change below is needed by the build or the self-test. Nothing in this list is a secret.

### 13.1 New environment variables (names go in `.env.example`, values never committed)

| Name                                                                       | Who reads it             | Default when unset                                       | Set where                       |
| -------------------------------------------------------------------------- | ------------------------ | -------------------------------------------------------- | ------------------------------- |
| `DOCUMENSO_BASE_URL`                                                       | harness + P6             | `http://127.0.0.1:3001`                                  | optional                        |
| `DOCUMENSO_DB_URL`                                                         | harness + P6             | `postgres://documenso:password@127.0.0.1:5451/documenso` | optional (CI job env)           |
| `P6_DOCUMENSO_DATABASE_URL`                                                | P6 oracle only           | → `DOCUMENSO_DB_URL`                                     | optional                        |
| `INBUCKET_BASE_URL`                                                        | P6                       | `http://127.0.0.1:9003`                                  | optional (CI job env)           |
| `P6_WEBHOOK_HOST`                                                          | P6                       | `p6-webhook.test`                                        | optional (CI job env)           |
| `DANGEROUS_BYPASS_RATE_LIMITS`                                             | harness → app            | `true` for documenso (`harness.mjs` default)             | CI job env; local default       |
| `NEXT_PRIVATE_WEBHOOK_SSRF_BYPASS_HOSTS`                                   | app                      | `p6-webhook.test` for documenso (`harness.mjs` default)  | CI job env; local default       |
| `DOCUMENSO_NODE_HOME`                                                      | `harness.mjs`, bootstrap | `/opt/node24`                                            | only if Node 24 lives elsewhere |
| `DOCUMENSO_WEB_REBUILD`, `DOCUMENSO_WEB_BUILD_MS`, `DOCUMENSO_WEB_WAIT_MS` | harness                  | harness defaults (no rebuild, 45 min, 10 min)            | optional knobs, documented only |

`DOCUMENSO_API_TOKEN` (harness name) is **not** used by P6 and is not added: tokens are minted per
run (D3).

### 13.2 Network domains

All of these were reachable in the probe session. If an environment uses a limited network policy,
allow them:

| Domain                                                                       | Why                                       |
| ---------------------------------------------------------------------------- | ----------------------------------------- |
| `nodejs.org`                                                                 | Node v24.21.0 tarball + `SHASUMS256.txt`  |
| `registry.npmjs.org`                                                         | `npm ci` in the fork (2053 packages)      |
| `github.com`, `codeload.github.com`                                          | fork clone by `bootstrap.sh`              |
| `registry-1.docker.io`, `auth.docker.io`, `production.cloudflare.docker.com` | images `postgres:15`, `inbucket/inbucket` |

GitHub Actions runners need no change.

### 13.3 Setup steps (what must exist on a machine)

1. Node v24.21.0 at `/opt/node24` (side by side with 22.23 in `/usr/local/bin`).
2. Hosts entry `127.0.0.1 p6-webhook.test` in `/etc/hosts`.
3. Documenso fork + deps: `bash scripts/bootstrap.sh documenso` (once per machine/session; it clones
   and runs `npm ci` under Node 24 via D1). Nothing under `products/` is committed.

Shared install snippet (Node 24, idempotent, verified):

```bash
if [ ! -x /opt/node24/bin/node ]; then
  v=v24.21.0; tmp="$(mktemp -d)"
  curl -fsSL -o "$tmp/node.tar.xz" "https://nodejs.org/dist/$v/node-$v-linux-x64.tar.xz"
  curl -fsSL -o "$tmp/SHASUMS256.txt" "https://nodejs.org/dist/$v/SHASUMS256.txt"
  (cd "$tmp" && grep " node-$v-linux-x64.tar.xz\$" SHASUMS256.txt | sed "s#node-$v-linux-x64.tar.xz#node.tar.xz#" | sha256sum -c -)
  sudo mkdir -p /opt/node24 && sudo tar -xJf "$tmp/node.tar.xz" -C /opt/node24 --strip-components=1
  rm -rf "$tmp"
fi
/opt/node24/bin/node -v   # v24.21.0
```

Hosts entry snippet (idempotent):

```bash
grep -qE '^127\.0\.0\.1[[:space:]]+p6-webhook\.test$' /etc/hosts || echo '127.0.0.1 p6-webhook.test' | sudo tee -a /etc/hosts >/dev/null
```

### 13.4 Cursor cloud (`.cursor/environment.json` + `.cursor/Dockerfile`)

**Automatic from the repo (the build commits these):**

- `.cursor/Dockerfile`: after the Node 22 block, add a Node 24 block that installs v24.21.0 into
  `/opt/node24` with the SHA256 check (same commands as §13.3 in one `RUN`; the version comes from an `ARG` named
  `DOCUMENSO_NODE_VERSION`, default 24.21.0; `node_arch` comes from `dpkg --print-architecture`,
  like the Node 22 block). `/usr/local/bin` keeps Node 22.23 first. Cursor rebuilds the image when the Dockerfile
  changes.
- `.cursor/environment.json` `start`: `"sudo service docker start && (grep -qE '^127\\.0\\.0\\.1[[:space:]]+p6-webhook\\.test$' /etc/hosts || echo '127.0.0.1 p6-webhook.test' | sudo tee -a /etc/hosts >/dev/null)"`.
  The hosts entry goes in `start`, not in the Dockerfile, because a container's `/etc/hosts` is
  rewritten at container start.
- `.cursor/environment.json` `install`: unchanged (`npm ci && bash scripts/bootstrap.sh medusa`).
  Documenso is installed on demand with `bash scripts/bootstrap.sh documenso` (2.2 GB, ~70 s;
  decided, answer 4).
- `AGENTS.md` (Cursor section): "Documenso needs Node 24; `npm run up:documenso` and
  `bootstrap.sh documenso` pick `/opt/node24` themselves. Keep `/usr/local/bin` first."

**Pasted in Cursor settings:** nothing (no secrets, no env vars). If the Cursor environment
restricts network access, allow the §13.2 domains there.

### 13.5 Claude Code cloud

**Automatic from the repo (the build commits these):**

- `.claude/hooks/session-start.sh` (cloud sessions only): after the Docker block, add the hosts-entry
  snippet (§13.3; the hook already uses `sudo` for `dockerd`), and if `/opt/node24/bin/node` is
  missing, print this one line to stderr:

  ```text
  P6: Node 24 missing at /opt/node24; add the Node 24 snippet to the environment's setup script (docs/plans/2026-10-20-p6-phase1-task6-documenso-stack.md §13.5)
  ```

  It keeps writing `export PATH="/usr/local/bin:$PATH"` to `$CLAUDE_ENV_FILE`.

- `AGENTS.md` (Claude section): same Documenso line as Cursor.

**Pasted into the environment settings** (cloud environment menu in the session title bar → Edit):

1. **Setup script**: append this snippet **verbatim** (decided, answer 5). It runs when each new
   session starts, is idempotent, verifies the tarball against `SHASUMS256.txt`, works as root or with
   `sudo`, and never changes `PATH` (Node 22.23 stays first). On a failed download it prints one
   `P6:` line and lets the rest of the setup continue; the Documenso commands then report `ENV:`.
   Do not add `bootstrap.sh documenso` there (on demand, answer 4).

   ```bash
   # --- P6 Task 6: Node 24 for Documenso (side by side; /usr/local/bin keeps Node 22.23 first) ---
   P6_NODE24_VERSION=v24.21.0
   if [ "$(/opt/node24/bin/node -v 2>/dev/null)" != "$P6_NODE24_VERSION" ]; then
     P6_SUDO=""; [ "$(id -u)" -eq 0 ] || P6_SUDO="sudo"
     p6_tmp="$(mktemp -d)"
     p6_tar="node-$P6_NODE24_VERSION-linux-x64.tar.xz"
     curl -fsSL --retry 3 -o "$p6_tmp/$p6_tar" "https://nodejs.org/dist/$P6_NODE24_VERSION/$p6_tar" &&
       curl -fsSL --retry 3 -o "$p6_tmp/SHASUMS256.txt" "https://nodejs.org/dist/$P6_NODE24_VERSION/SHASUMS256.txt" &&
       (cd "$p6_tmp" && grep " $p6_tar\$" SHASUMS256.txt | sha256sum -c -) &&
       $P6_SUDO rm -rf /opt/node24 &&
       $P6_SUDO mkdir -p /opt/node24 &&
       $P6_SUDO tar -xJf "$p6_tmp/$p6_tar" -C /opt/node24 --strip-components=1 ||
       echo "P6: Node 24 install failed; Documenso commands will report ENV until it is fixed" >&2
     rm -rf "$p6_tmp"
   fi
   /opt/node24/bin/node -v 2>/dev/null || echo "P6: /opt/node24/bin/node missing" >&2
   ```

   Tested in the probe session (2026-10-20), as root with no `/opt/node24`: first run
   `node-v24.21.0-linux-x64.tar.xz: OK`, `v24.21.0`, 4.6 s; second run `v24.21.0`, 0.01 s (no
   download); `/usr/local/bin/node -v` still `v22.23.3` and first on `PATH`.

2. **Network access**: if the level is "Limited", add the §13.2 domains under Allowed domains, with
   "Allow package managers" left ticked. (This session reached all of them.)
3. **Environment variables / secrets**: none.

## 14. Risks and unknowns

- **R1 Unpinned Inbucket image** (H1): a new `latest` could change the API. Accepted (answer 7):
  `assertInbucketList`/`assertInbucketMessage` turn a shape change into `ENV: Inbucket API drift`
  (D14). Pin by digest in harness v0.3.0 (§21).
- **R2 Node 24 drift**: Cursor/Claude images could ship a different Node 24; the pin is explicit
  (`v24.21.0` + SHA256).
- **R3 Hosts entry missing** (fresh container, hook not run): self-test `beforeAll` fails as ENV with
  the exact fix.
- **R4 Build memory/time on Actions**: cold peak 4.7 GB of 16 GB here; build cache keyed on the SHA.
- **R5 Local DB volume** keeps probe and earlier-run users (isolated by prefix). Leak check is per
  run.
- **R6 `webhook.testWebhook` fans out to all team webhooks** for the event: one webhook per run's
  own team (D7).
- **R7 Web log could one day log a token**: guard step blocks the upload (D12).
- **R8 CI DNS**: `/etc/hosts` is honoured by Node's `dns.lookup` (getaddrinfo) used by Documenso's
  guard and by `fetch`; verified locally, to be confirmed on the first CI run.

## 15. Build steps (repo root; on any differing output: stop and report, paste it)

Do not start until the maintainer approves this plan. Never `git add -A`. Never print secrets. Always finish
with `npm run down:documenso`. Run `export PATH="/usr/local/bin:$PATH"` first (AGENTS.md); the
Documenso commands pick Node 24 themselves (D1).

### Step 0. Branch, plan doc, machine prerequisites

```bash
export PATH="/usr/local/bin:$PATH"
git fetch origin main plan/2026-10-20-p6-phase1
git switch -c feat/2026-10-21-p6-documenso-stack origin/main
git checkout origin/plan/2026-10-20-p6-phase1 -- docs/plans/2026-10-20-p6-phase1-task6-documenso-stack.md
git status --short     # A  docs/plans/2026-10-20-p6-phase1-task6-documenso-stack.md (only)
git commit -m "docs(plans): add task 6 documenso stack plan"
npm ci && npm run check                    # # tests 131 (or main's count), # fail 0
/opt/node24/bin/node -v                    # v24.21.0 (else run the §13.3 snippet once)
getent hosts p6-webhook.test               # 127.0.0.1  p6-webhook.test (else the §13.3 snippet)
```

### Step 1. Node 24 selection + bootstrap (no product start)

`scripts/lib/documenso-node.mjs`:

```js
// Pure: decides which Node runs the Documenso harness commands (plan D1).
/**
 * @param {{ currentVersion: string, home: string, exists: (p: string) => boolean }} input
 * @returns {{ kind: "current" } | { kind: "home", node: string, binDir: string } | { kind: "missing", message: string }}
 */
export function chooseDocumensoNode({ currentVersion, home, exists }) {
  const major = Number(String(currentVersion).replace(/^v/, "").split(".")[0]);
  if (Number.isInteger(major) && major >= 24) return { kind: "current" };
  const binDir = `${home.replace(/\/$/, "")}/bin`;
  const node = `${binDir}/node`;
  if (exists(node)) return { kind: "home", node, binDir };
  return {
    kind: "missing",
    message:
      `ENV: Documenso needs Node 24; active Node is v${String(currentVersion).replace(/^v/, "")} ` +
      `and ${node} does not exist. Install Node v24.21.0 at /opt/node24 (plan §13.3) or set DOCUMENSO_NODE_HOME.`,
  };
}
```

`scripts/harness.mjs` (Medusa/Cal behaviour unchanged): import `chooseDocumensoNode`; after the
`MEDUSA_SKIP_STOREFRONT` default add

```js
if (product === "documenso") {
  // Test environment (plan D2): limiters off, SSRF allowlist for the P6 webhook receiver.
  process.env.DANGEROUS_BYPASS_RATE_LIMITS ||= "true";
  process.env.NEXT_PRIVATE_WEBHOOK_SSRF_BYPASS_HOSTS ||= "p6-webhook.test";
}
```

and replace the final `spawnSync(process.execPath, [script, product], …)` with

```js
let nodeBin = process.execPath;
let childEnv = process.env;
if (product === "documenso") {
  const choice = chooseDocumensoNode({
    currentVersion: process.versions.node,
    home: process.env.DOCUMENSO_NODE_HOME || "/opt/node24",
    exists: existsSync,
  });
  if (choice.kind === "missing") {
    console.error(choice.message);
    process.exit(1);
  }
  if (choice.kind === "home") {
    nodeBin = choice.node;
    childEnv = {
      ...process.env,
      PATH: `${choice.binDir}${path.delimiter}${process.env.PATH ?? ""}`,
    };
  }
}
const result = spawnSync(nodeBin, [script, product], {
  cwd: repoRoot,
  stdio: "inherit",
  env: childEnv,
});
```

(Keep the `LONG_RUNNING` Cal branch before it exactly as it is.)

`scripts/bootstrap.sh`: add after `install_cal_deps`:

```bash
install_documenso_deps() {
  local dest="$1"
  if [ "${BOOTSTRAP_SKIP_INSTALL:-0}" = "1" ]; then
    log "BOOTSTRAP_SKIP_INSTALL=1; skipping Documenso npm ci."
    return
  fi
  local node_home="${DOCUMENSO_NODE_HOME:-/opt/node24}" path_prefix=""
  local major
  major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
  if [ "$major" -lt 24 ]; then
    if [ ! -x "$node_home/bin/node" ]; then
      log "ERROR Documenso needs Node 24; install it at /opt/node24 (plan §13.3) or set DOCUMENSO_NODE_HOME."
      exit 1
    fi
    path_prefix="$node_home/bin:"
  fi
  log "npm ci in $dest (Node $(PATH="${path_prefix}$PATH" node -v))"
  (cd "$dest" && PATH="${path_prefix}$PATH" npm ci --no-audit --no-fund)
}
```

and in the `case` in `main()`: `documenso) install_documenso_deps "$dest" ;;`.

`tests/unit/documenso-node.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
// @ts-expect-error -- plain .mjs module without types
import { chooseDocumensoNode } from "../../scripts/lib/documenso-node.mjs";

describe("chooseDocumensoNode", () => {
  it("uses the current Node when it is 24 or newer", () => {
    assert.deepEqual(
      chooseDocumensoNode({ currentVersion: "24.21.0", home: "/opt/node24", exists: () => false }),
      { kind: "current" },
    );
  });
  it("switches to the home binary under Node 22", () => {
    assert.deepEqual(
      chooseDocumensoNode({ currentVersion: "22.23.3", home: "/opt/node24/", exists: () => true }),
      {
        kind: "home",
        node: "/opt/node24/bin/node",
        binDir: "/opt/node24/bin",
      },
    );
  });
  it("reports an ENV error when no Node 24 exists", () => {
    const r = chooseDocumensoNode({
      currentVersion: "22.23.3",
      home: "/opt/node24",
      exists: () => false,
    });
    assert.equal(r.kind, "missing");
    assert.match(r.message, /^ENV: Documenso needs Node 24/);
  });
});
```

(If `tsc` with `allowJs` false rejects the import, add a `scripts/lib/documenso-node.d.mts` with the
types instead of `@ts-expect-error`; keep `tsconfig.races.json` unchanged otherwise.)

Run: `bash -n scripts/bootstrap.sh && echo syntax-ok`; `npm run test:unit` (131 + 3); then
`bash scripts/bootstrap.sh documenso` → `already cloned (f4105e47…)` or `cloned f4105e47…`, then
`npm ci in … (Node v24.21.0)` and `added 2053 packages`. Commits 1–2 (§17).

### Step 2. `src/documenso/env.ts` + tests

```ts
const strip = (u: string) => u.replace(/\/$/, "");
const val = (env: NodeJS.ProcessEnv, name: string) => env[name]?.trim() || undefined;

export function documensoBaseUrlFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  return strip(val(env, "DOCUMENSO_BASE_URL") ?? "http://127.0.0.1:3001");
}

export function documensoDatabaseUrlFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  return (
    val(env, "P6_DOCUMENSO_DATABASE_URL") ??
    val(env, "DOCUMENSO_DB_URL") ??
    // Harness compose's local placeholder (docker/documenso.compose.yml). Not a secret.
    "postgres://documenso:password@127.0.0.1:5451/documenso"
  );
}

export function inbucketBaseUrlFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  return strip(val(env, "INBUCKET_BASE_URL") ?? "http://127.0.0.1:9003");
}

/** A hostname (not an IP, not localhost): Documenso's create-time check refuses those (plan §2.6). */
export function webhookHostFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  const host = (val(env, "P6_WEBHOOK_HOST") ?? "p6-webhook.test").toLowerCase();
  if (
    !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ||
    /^\d+(\.\d+){3}$/.test(host) ||
    host === "localhost"
  ) {
    throw new Error(
      `TEST BUG: P6_WEBHOOK_HOST must be a dotted hostname, not an IP or localhost (got ${host})`,
    );
  }
  return host;
}
```

`tests/unit/documenso-env.test.ts`: defaults (`http://127.0.0.1:3001`, the placeholder DB URL,
`http://127.0.0.1:9003`, `p6-webhook.test`); trailing slash stripped; blank values fall back;
precedence `P6_DOCUMENSO_DATABASE_URL` > `DOCUMENSO_DB_URL`; `webhookHostFromEnv` throws `TEST BUG`
for `127.0.0.1`, `localhost`, `nodots`; lowercases `P6-Webhook.TEST`. Run `npm run test:unit`.
Commit 3.

### Step 3. Inbucket client + webhook receiver + tests

`src/documenso/inbucket.ts`:

```ts
export type InbucketSummary = {
  mailbox: string;
  id: string;
  from: string;
  to: string[];
  subject: string;
  date: string;
  size: number;
  seen: boolean;
};
export type InbucketMessage = InbucketSummary & {
  header: Record<string, string[]>;
  body: { text: string; html: string };
};

/** Inbucket's default mailbox name is the local part of the address (plan §2.5). */
export function mailboxName(address: string): string {
  const local = address.split("@")[0]?.toLowerCase() ?? "";
  if (!/^[a-z0-9._+-]+$/.test(local)) throw new Error(`TEST BUG: bad mailbox address ${address}`);
  return local;
}

export function envelopeIdOf(msg: Pick<InbucketMessage, "header">): string | null {
  return msg.header["X-Documenso-Envelope-Id"]?.[0] ?? null;
}

export function countForEnvelope(
  msgs: Array<Pick<InbucketMessage, "header">>,
  envelopeId: string,
): number {
  return msgs.filter((m) => envelopeIdOf(m) === envelopeId).length;
}

export function verifyEmailToken(msg: Pick<InbucketMessage, "body">): string | null {
  return (
    `${msg.body.text}\n${msg.body.html}`.match(/\/verify-email\/([A-Za-z0-9_-]+)/)?.[1] ?? null
  );
}

const drift = (what: string): never => {
  throw new Error(`ENV: Inbucket API drift: ${what} (image is unpinned latest; plan D14)`);
};

/** Validates the list shape recorded in plan §2.5; anything else is ENV, never a missing email. */
export function assertInbucketList(value: unknown): InbucketSummary[] {
  if (!Array.isArray(value)) drift("list is not an array");
  for (const item of value as Array<Record<string, unknown>>) {
    if (typeof item?.id !== "string") drift("list item id is not a string");
    if (typeof item.subject !== "string") drift("list item subject is not a string");
    if (!Array.isArray(item.to)) drift("list item to is not an array");
  }
  return value as InbucketSummary[];
}

export function assertInbucketMessage(value: unknown): InbucketMessage {
  const m = value as Record<string, unknown> | null;
  if (typeof m?.id !== "string") drift("message id is not a string");
  if (typeof m!.header !== "object" || m!.header === null) drift("message header is not an object");
  const body = m!.body as Record<string, unknown> | undefined;
  if (typeof body?.text !== "string" || typeof body.html !== "string") {
    drift("message body.text/html is not a string");
  }
  return value as InbucketMessage;
}

export function createInbucketClient(baseUrl: string) {
  const url = (mailbox: string, id?: string) =>
    `${baseUrl}/api/v1/mailbox/${encodeURIComponent(mailbox)}${id ? `/${encodeURIComponent(id)}` : ""}`;
  const json = async <T>(res: Response, what: string): Promise<T> => {
    const text = await res.text();
    if (res.status !== 200) throw new Error(`ENV: Inbucket ${what} HTTP ${res.status}`);
    return JSON.parse(text) as T;
  };
  return {
    list: async (mailbox: string) =>
      assertInbucketList(await json<unknown>(await fetch(url(mailbox)), "list")),
    get: async (mailbox: string, id: string) =>
      assertInbucketMessage(await json<unknown>(await fetch(url(mailbox, id)), "get")),
    purge: async (mailbox: string) => {
      const res = await fetch(url(mailbox), { method: "DELETE" });
      await res.text();
      if (res.status !== 200) throw new Error(`ENV: Inbucket purge HTTP ${res.status}`);
    },
    /** Polls until at least `min` messages exist; throws after `timeoutMs`. */
    async waitFor(
      mailbox: string,
      opts: { min?: number; timeoutMs?: number; intervalMs?: number } = {},
    ) {
      const { min = 1, timeoutMs = 15_000, intervalMs = 250 } = opts;
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const items = await this.list(mailbox);
        if (items.length >= min) return items;
        if (Date.now() > deadline) return items;
        await new Promise((r) => setTimeout(r, intervalMs));
      }
    },
  };
}
```

(`waitFor` returns what it has at the deadline; the caller asserts the count, so a missing email is
reported with the real number.)

`src/documenso/webhook-receiver.ts`:

```ts
import http, { type IncomingHttpHeaders } from "node:http";

export type WebhookDelivery = {
  receivedAt: number;
  path: string;
  host: string;
  event: string | null;
  body: unknown;
  secretMatches: boolean;
};

/** Pure. Never returns or logs the secret; only whether it matched. */
export function parseDelivery(input: {
  headers: IncomingHttpHeaders;
  rawBody: string;
  expectedSecret: string | null;
  receivedAt: number;
  path: string;
}): WebhookDelivery {
  let body: unknown = null;
  try {
    body = JSON.parse(input.rawBody);
  } catch {
    body = null;
  }
  const event =
    body && typeof body === "object" && typeof (body as { event?: unknown }).event === "string"
      ? (body as { event: string }).event
      : null;
  const got = input.headers["x-documenso-secret"];
  return {
    receivedAt: input.receivedAt,
    path: input.path,
    host: String(input.headers.host ?? ""),
    event,
    body,
    secretMatches: input.expectedSecret === null ? got === undefined : got === input.expectedSecret,
  };
}

export async function startWebhookReceiver(opts: {
  publicHost: string;
  expectedSecret: string | null;
}) {
  const deliveries: WebhookDelivery[] = [];
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c: Buffer) => (raw += c.toString("utf8")));
    req.on("end", () => {
      deliveries.push(
        parseDelivery({
          headers: req.headers,
          rawBody: raw,
          expectedSecret: opts.expectedSecret,
          receivedAt: Date.now(),
          path: req.url ?? "",
        }),
      );
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end('{"ok":true}');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const port = (server.address() as { port: number }).port;
  return {
    port,
    url: `http://${opts.publicHost}:${port}/hook`,
    deliveries,
    async waitForDeliveries(n: number, timeoutMs = 10_000): Promise<WebhookDelivery[]> {
      const deadline = Date.now() + timeoutMs;
      while (deliveries.length < n && Date.now() < deadline)
        await new Promise((r) => setTimeout(r, 100));
      return [...deliveries];
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
```

`tests/unit/documenso-inbucket.test.ts`: `mailboxName("P6-QA-x@example.com")` → `p6-qa-x`, throws on
`"a b@x"`; `envelopeIdOf` reads the canonical header and returns `null` without it;
`countForEnvelope` over three messages (two with `envelope_a`, one without) → 2;
`verifyEmailToken` finds `abc_DEF-1` in text or html, `null` otherwise; the client against a
`node:http` fake on `127.0.0.1:0` (`GET` list → array, `GET` message, `DELETE` → 200, `waitFor`
returns after the 2nd poll when the fake adds a message; a 500 → `ENV:`);
`assertInbucketList` accepts the §2.5 sample and throws `ENV: Inbucket API drift` for `{}`, for an
item without `id`, and for `to: "x"`; `assertInbucketMessage` throws the same for a missing
`body.html` and accepts the §2.5 sample.

`tests/unit/webhook-receiver.test.ts`: `parseDelivery` with matching / wrong / missing secret,
non-JSON body (`body null`, `event null`); `startWebhookReceiver` with `publicHost`
`p6-webhook.test` and `expectedSecret` `s` → `url` matches `^http://p6-webhook\.test:\d+/hook$`; a `fetch` POST to
`http://127.0.0.1:<port>/hook` with header `x-documenso-secret: s` and
`{"event":"DOCUMENT_COMPLETED"}` → response 200 `{"ok":true}`, one delivery with
`event === "DOCUMENT_COMPLETED"`, `secretMatches === true`; `close()` resolves.

Run `npm run test:unit`. Commit 4.

### Step 4. Account + oracle + tests

`src/documenso/account.ts` (signatures and behaviour; follow §2.3 exactly):

```ts
import { randomBytes } from "node:crypto";
import { createInbucketClient, mailboxName, verifyEmailToken } from "./inbucket.ts";

export class CookieJar {
  private cookies = new Map<string, string>();
  absorb(res: Response): void; // every Set-Cookie name=value
  header(): string; // "a=1; b=2"
  has(name: string): boolean;
}

/** 24+ chars, upper, lower, digit, symbol; per run, in memory only. */
export function generatePassword(): string {
  return `P6-${randomBytes(18).toString("base64url")}!a1`;
}

export function trpcUrl(baseUrl: string, proc: string, input?: unknown): string; // GET form; no ?input when undefined
/** Parses `{"result":{"data":{"json":…}}}`; on `{"error":…}` throws `Error("<label> HTTP <status> <code>: <message ≤ 200>")`. */
export function parseTrpc<T>(label: string, status: number, text: string): T;

export type DocumensoAccount = {
  email: string;
  teamId: number;
  jar: CookieJar;
  timings: { signupMs: number; confirmMailMs: number; totalMs: number };
};

/** csrf → signup (201) → confirmation email → verify-email (VERIFIED) → organisation.getMany → team.find. */
export async function signUpVerifiedUser(opts: {
  baseUrl: string;
  inbucketBaseUrl: string;
  email: string;
  name: string;
}): Promise<DocumensoAccount>;

export async function createApiToken(
  baseUrl: string,
  a: DocumensoAccount,
  tokenName: string,
): Promise<{ id: number; token: string }>;
export async function deleteApiToken(
  baseUrl: string,
  a: DocumensoAccount,
  id: number,
): Promise<void>;
export async function createWebhook(
  baseUrl: string,
  a: DocumensoAccount,
  input: { webhookUrl: string; eventTriggers: string[]; secret: string | null },
): Promise<{ id: string }>;
export async function testWebhook(
  baseUrl: string,
  a: DocumensoAccount,
  id: string,
  event: string,
): Promise<void>; // expects success:true
export async function deleteWebhook(
  baseUrl: string,
  a: DocumensoAccount,
  id: string,
): Promise<void>;
export async function deleteAccount(baseUrl: string, a: DocumensoAccount): Promise<void>; // profile.deleteAccount
```

Rules: every authenticated call sends `Cookie: jar.header()` and `x-team-id: <teamId>`; mutations
are `POST /api/trpc/<proc>` with body `{"json": input}`; queries are `GET` (`trpcUrl`). Error
messages never include the password, the token or the cookie. `signUpVerifiedUser` throws
`PRODUCT BUG: signup HTTP <s>` / `PRODUCT BUG: no confirmation email for <mailbox> in 15000 ms` /
`PRODUCT BUG: verify-email state <state>` as appropriate.

`src/documenso/oracle.ts`: §9.

`tests/unit/documenso-account.test.ts`: `generatePassword()` length ≥ 24, two calls differ, matches
`/[A-Z]/`, `/[a-z]/`, `/\d/`, `/[^A-Za-z0-9]/`; the two `trpcUrl` cases below; `parseTrpc` returns `json` on success, throws with code + message
(not the raw body) on error; `CookieJar` keeps the last value per name across two responses.

```ts
assert.equal(
  trpcUrl("http://127.0.0.1:3001", "team.find", { a: 1 }),
  "http://127.0.0.1:3001/api/trpc/team.find?input=%7B%22json%22%3A%7B%22a%22%3A1%7D%7D",
);
assert.equal(
  trpcUrl("http://127.0.0.1:3001", "organisation.getMany"),
  "http://127.0.0.1:3001/api/trpc/organisation.getMany",
);
```

`tests/unit/documenso-oracle.test.ts`: each SQL constant passes `assertSelectOnly`; none matches
`/\btoken\b|password|secret/i` in the select list; `"WebhookCall"`, `"User"` quoted.

Run `npm run test:unit` (131 + all new `it` blocks, `# fail 0`). Commit 5.

### Step 5. Scripts, k6 smoke, Playwright project

`package.json` `scripts` (keep the rest):

```json
"up:documenso": "node scripts/harness.mjs up documenso",
"down:documenso": "node scripts/harness.mjs down documenso",
"smoke:documenso": "k6 run --summary-export results/documenso-health-summary.json k6/smoke/documenso-health.js",
"race:documenso": "playwright test --project=documenso-race",
```

`k6/smoke/documenso-health.js`:

```js
// Phase 1 Task 6 smoke: proves k6 can reach a harness-started Documenso. Not a performance number.
import http from "k6/http";
import { check } from "k6";

const BASE_URL = (__ENV.DOCUMENSO_BASE_URL || "http://127.0.0.1:3001").replace(/\/$/, "");

export const options = {
  vus: 1,
  iterations: 5,
  thresholds: { http_req_failed: ["rate==0"], checks: ["rate==1"] },
};

export default function () {
  const signin = http.get(`${BASE_URL}/signin`, { tags: { name: "GET /signin" } });
  check(signin, { "GET /signin is 200": (r) => r.status === 200 });
  const csrf = http.get(`${BASE_URL}/api/auth/csrf`, { tags: { name: "GET /api/auth/csrf" } });
  check(csrf, { "GET /api/auth/csrf is 200": (r) => r.status === 200 });
}
```

`playwright.config.ts`: import `documensoBaseUrlFromEnv` from `./src/documenso/env.ts` and add after
`cal-race`:

```ts
    {
      name: "documenso-race",
      testDir: "tests/documenso/races",
      retries: 0,
      use: { baseURL: documensoBaseUrlFromEnv() },
    },
```

Live check:

```bash
SECONDS=0; npm run up:documenso; echo "exit=$? wall=${SECONDS}s"    # cold ≈ 4.5 min, warm ≈ 25 s
npm run up:documenso | tail -2                                     # "Documenso already healthy …", exit 0
npm run smoke:documenso                                            # checks 100.00%, http_req_failed 0.00%
npm run k6:inspect                                                 # 4 script(s) ok.
```

Commit 6 (scripts and k6 only; the spec follows).

### Step 6. Self-test

`tests/documenso/races/documenso-self-test.spec.ts` — copy the trial loop, `recordTrial`,
failed-trial records, histogram writing and the read-only INSERT probe from
`tests/cal/races/cal-self-test.spec.ts`; differences:

```ts
import { lookup } from "node:dns/promises";
import { randomBytes } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
// … same race/histogram/env/pg imports as the Cal self-test …
import {
  documensoBaseUrlFromEnv,
  documensoDatabaseUrlFromEnv,
  inbucketBaseUrlFromEnv,
  webhookHostFromEnv,
} from "../../../src/documenso/env.ts";
import { createInbucketClient, mailboxName } from "../../../src/documenso/inbucket.ts";
import { startWebhookReceiver } from "../../../src/documenso/webhook-receiver.ts";
import {
  createApiToken,
  createWebhook,
  deleteAccount,
  deleteApiToken,
  deleteWebhook,
  signUpVerifiedUser,
  testWebhook,
} from "../../../src/documenso/account.ts";
import { leakCheck, readWebhookCalls } from "../../../src/documenso/oracle.ts";
import { casePrefix, likeLiteralPrefix } from "../../../src/medusa/payloads.ts";
import { p6RunPrefix } from "../../../src/races/prefix.ts";

const CASE_ID = "documenso-self-test";
const CONCURRENCY = 20;
const HEALTH_PATH = "/api/auth/csrf"; // §2.1 health burst: fastest 200 that needs the app + DB session layer

test.describe.configure({ timeout: 120_000 });

test.beforeAll(async () => {
  const host = webhookHostFromEnv();
  const { address } = await lookup(host, { family: 4 }).catch(() => ({ address: "unresolved" }));
  if (address !== "127.0.0.1") {
    throw new Error(
      `ENV: ${host} does not resolve to 127.0.0.1 (got ${address}); add "127.0.0.1 ${host}" to /etc/hosts (plan §13.3)`,
    );
  }
});

test("documenso self-test (unmapped): health burst, oracle, one email, one webhook", async () => {
  // histogram created before try (product "documenso", caseId CASE_ID, concurrency 20, trials RACE_TRIALS)
  // 1. trials: fireTogether(20, GET HEALTH_PATH, warm same URL) → every 200, spread < limit (PRODUCT/TEST BUG strings as Cal)
  // 2. oracle: SELECT 1 via waitForStable; INSERT INTO "Webhook" … → SQLSTATE 25006
  // 3. account: email = `${casePrefix(p6RunPrefix(), CASE_ID)}-owner@example.com`;
  //    signUpVerifiedUser → inbucket.list(mailboxName(email)) length === 1 → histogram.oracle.confirmationEmails
  // 4. token: createApiToken → GET /api/v1/documents?page=1&perPage=1 with Bearer → 200 (apiV1Status)
  // 5. webhook: secret = randomBytes(16).toString("hex"); receiver = startWebhookReceiver({ publicHost: webhookHostFromEnv(), expectedSecret: secret });
  //    createWebhook({ webhookUrl: receiver.url, eventTriggers: ["DOCUMENT_COMPLETED"], secret });
  //    testWebhook(id, "DOCUMENT_COMPLETED"); deliveries = await receiver.waitForDeliveries(1, 10_000);
  //    rows = await readWebhookCalls(pool, id);
  //    expect deliveries.length === 1, deliveries[0].secretMatches, deliveries[0].event === "DOCUMENT_COMPLETED",
  //    rows.length === 1, rows[0].status === "SUCCESS", rows[0].responseCode === 200,
  //    new URL(rows[0].url).hostname === webhookHostFromEnv(), isDeepStrictEqual(rows[0].requestBody, deliveries[0].body)
  //    (0 deliveries + a FAILED row with responseCode 0 → "ENV: webhook blocked; NEXT_PRIVATE_WEBHOOK_SSRF_BYPASS_HOSTS must list <host>")
  // 6. finally (always): deleteWebhook, deleteApiToken, deleteAccount, inbucket.purge(mailbox), receiver.close();
  //    each failure → `TEST BUG: cleanup <step> failed: <msg>`; then leakCheck({ userLikePattern: likeLiteralPrefix(`${prefix}-`), teamId, mailboxCount })
  // 7. finally: histogram.finishedAt, writeHistogram, closePool
  // after: read results/races/documenso-self-test.json → caseId, product "documenso", verdict "pass", trials, oracle.readOnlySqlstate "25006"
});
```

Fill every comment with real code in the Cal self-test style; keep the order: setup assertions
(steps 1–4) before the webhook assertions, and cleanup + leak check in `finally`.

Then (Documenso still up from Step 5):

```bash
npx playwright test --list --project=documenso-race   # 1 test in 1 file
npm run typecheck                                      # exit 0
RACE_TRIALS=3 RACE_MAX_SPREAD_MS=20 npm run race:documenso
node -e 'const h=require("./results/races/documenso-self-test.json");console.log(h.verdict,h.statusCounts,h.oracle)'
RACE_TRIALS=3 RACE_MAX_SPREAD_MS=20 npm run race:documenso    # second run: still 1 passed, leak 0
npm run down:documenso && npm run down:documenso                # both exit 0
```

Expected: `1 passed` twice;
`pass { '200': 60 } { selectOne: 1, readOnlySqlstate: '25006', confirmationEmails: 1, apiV1Status: 200, webhookDeliveries: 1, webhookSecretMatches: true, webhookCallRows: 1, webhookCallStatus: 'SUCCESS', webhookCallResponseCode: 200, webhookBodyMatches: true, …, leakUsers: 0, leakWebhooks: 0, leakApiTokens: 0, leakMails: 0 }`.
Commit 7.

### Step 7. CI job

Add §12 to `.github/workflows/perf.yml` (steps written out in full, same style as `cal-smoke`).
Validate: `npx --yes prettier --check .github/workflows/perf.yml`;
`git diff origin/main -- .github/workflows/perf.yml` shows only the `DOCUMENSO_REF` line and the new
job. Commit 8.

### Step 8. Environment files, AGENTS.md, README, `.env.example`

Apply §13.4 and §13.5 (`.cursor/Dockerfile`, `.cursor/environment.json`,
`.claude/hooks/session-start.sh`, `AGENTS.md`). `bash -n .claude/hooks/session-start.sh`. README
"## Run Documenso" after "Run Cal" (§18). `.env.example` names from §13.1 with one comment each.
Commits 9–10.

## 16. Verification gate (hard gate before any implementation push; paste real output)

| Check                                                                          | Must show                                                                                                                                             |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`                                                                | Prettier OK, typecheck 0, `4 script(s) ok.`, `# tests` = 131 + new, `# fail 0`                                                                        |
| `bash scripts/bootstrap.sh documenso`                                          | pinned SHA; `npm ci in … (Node v24.21.0)`; `[bootstrap] done`                                                                                         |
| `npm run up:documenso` ×2                                                      | exit 0; second "Documenso already healthy"                                                                                                            |
| `npm run smoke:documenso`                                                      | checks 100 %, exit 0                                                                                                                                  |
| `RACE_TRIALS=3 RACE_MAX_SPREAD_MS=20 npm run race:documenso` ×2                | `1 passed` both; `verdict: "pass"`; all oracle values as in Step 6; leak 0                                                                            |
| `npm run down:documenso` ×2 + `ps`/port                                        | exit 0 both; no `build/server/main.js`; `:3001` closed                                                                                                |
| Node 22 without `/opt/node24` (temporarily `DOCUMENSO_NODE_HOME=/nonexistent`) | `ENV: Documenso needs Node 24 …`, exit 1, no compose call                                                                                             |
| CI on the PR                                                                   | `documenso-smoke` green; artefacts `race-histograms-documenso`, `documenso-web-log`, `k6-summary-documenso-health`; `medusa-smoke`, `cal-smoke` green |
| CI on `main` after merge                                                       | `documenso-smoke` green once; build cache saved                                                                                                       |

## 17. Commit plan (Conventional, lowercase subjects, explicit paths, never `git add -A`)

0. `docs(plans): add task 6 documenso stack plan` — the plan doc (from the plan branch)
1. `feat(harness): pick node 24 and test env for documenso` — `scripts/lib/documenso-node.mjs`,
   `scripts/harness.mjs`, `tests/unit/documenso-node.test.ts`
2. `build(documenso): install fork deps in bootstrap` — `scripts/bootstrap.sh`
3. `feat(documenso): add env getters` — `src/documenso/env.ts`, `tests/unit/documenso-env.test.ts`
4. `feat(documenso): add inbucket client and webhook receiver` — `src/documenso/inbucket.ts`,
   `src/documenso/webhook-receiver.ts`, `tests/unit/documenso-inbucket.test.ts`,
   `tests/unit/webhook-receiver.test.ts`
5. `feat(documenso): add per-run account, api token and oracle helpers` — `src/documenso/account.ts`,
   `src/documenso/oracle.ts`, `tests/unit/documenso-account.test.ts`, `tests/unit/documenso-oracle.test.ts`
6. `test(documenso): add k6 smoke and race scripts` — `package.json`, `k6/smoke/documenso-health.js`,
   `playwright.config.ts`
7. `test(documenso): add documenso self-test` — `tests/documenso/races/documenso-self-test.spec.ts`
8. `ci(documenso): add documenso-smoke job` — `.github/workflows/perf.yml`
9. `chore(env): add node 24 and webhook host for cloud agents` — `.cursor/Dockerfile`,
   `.cursor/environment.json`, `.claude/hooks/session-start.sh`, `AGENTS.md`
10. `docs(documenso): document running documenso` — `README.md`, `.env.example`

Environment identity; no Co-Authored-By, "Generated with" or session lines. `git status --short`
before each commit lists only that commit's paths; nothing under `products/`; `.env` stays ignored.

## 18. Docs (README "Run Documenso")

- Needs Docker, Node 24 at `/opt/node24` (the commands find it; `/usr/local/bin` stays first), the
  hosts entry `127.0.0.1 p6-webhook.test`.
- `bash scripts/bootstrap.sh documenso` → `npm run up:documenso` (first run builds, later runs reuse
  the build) → `npm run smoke:documenso` → `RACE_TRIALS=3 npm run race:documenso` →
  `npm run down:documenso` (always).
- The self-test signs up a throwaway user per run (password generated in memory), mints an API
  token through Documenso's own API, captures the confirmation email in Inbucket, and receives one
  webhook; everything is deleted at the end.
- Test environment: `DANGEROUS_BYPASS_RATE_LIMITS=true` and
  `NEXT_PRIVATE_WEBHOOK_SSRF_BYPASS_HOSTS=p6-webhook.test` are set by `scripts/harness.mjs`.
- Label table (§11).
- Known product finding **`P6-OBS-DOC-001`** (low): a wrong password or CSRF token on
  `POST /api/auth/email-password/authorize` returns HTTP 500 instead of 4xx; same handler and root
  cause as P1 `P7-OBS-DOC-2FA-003` (wrong TOTP → 500), linked to P1's
  `docs/observations/documenso-2fa-known-issues.md`. README only, no test.
- No timings.

## 19. Will NOT do

- No documents, signing, seal assertions or races (Task 7)
- No harness or fork edits; no fork `.env` edits; no `next`/`npm run start` by hand
- No seeded users or their passwords; no pasted `DOCUMENSO_API_TOKEN`; no tokens via SQL; no SQL
  writes
- No turning SSRF protection off (allowlist one hostname only)
- No changes to `medusa-smoke`, `cal-smoke`, `runTrials`, `fireTogether`, `src/oracles/pg.ts`
- No committed secrets, `.env`, certs or anything under `products/`
- No published timings; no `test.fail()`, retries, `workers` > 1, browsers or page objects

## 20. Answers from the maintainer (2026-10-20)

1. **Finding:** record **`P6-OBS-DOC-001`**, severity low, README only, no test. P1 checked first:
   the same `/authorize` handler and root cause are P1 `P7-OBS-DOC-2FA-003` (wrong TOTP → 500);
   cross-referenced in §2.11 and §18.
2. **Node 24:** side by side at `/opt/node24` with the `DOCUMENSO_NODE_HOME` override (D1). In CI,
   `actions/setup-node` with Node 24.21.0 is scoped to `documenso-smoke` only (§12 step 5).
3. **Webhook host:** `p6-webhook.test` via `/etc/hosts` plus the single-host
   `NEXT_PRIVATE_WEBHOOK_SSRF_BYPASS_HOSTS=p6-webhook.test` (D2, D4).
4. **Documenso install:** on demand with `bash scripts/bootstrap.sh documenso` (D15, §13.4).
5. **Node 24 in Claude cloud:** from the environment setup script (snippet verbatim in §13.5,
   tested); the session-start hook prints a hint when `/opt/node24/bin/node` is missing.
6. **P2 Task 4:** copies `src/documenso/account.ts` and `src/documenso/inbucket.ts` (D8); the
   harness `authenticate()` move is a v0.3.0 follow-up (§21).
7. **Inbucket:** accept `latest`; the self-test labels API drift as ENV (D14, §11); digest pin is a
   v0.3.0 follow-up (§21).

No open questions remain. Building waits on approval of this plan; the build branch is
`feat/2026-10-21-p6-documenso-stack` from `origin/main` (§15 Step 0).

## 21. Follow-ups for qa-portfolio-harness v0.3.0 (not this task)

1. **Move the per-run account and API-token flow into the Documenso adapter's `authenticate()`**
   (replaces the `DOCUMENSO_API_TOKEN` TODO; §2.3 is the tested sequence). After the release, P6 and
   P2 import it from the harness and delete their copies of `account.ts`/`inbucket.ts`.
2. **Pin `inbucket/inbucket` by digest** in `docker/documenso.compose.yml` (probe digest
   `sha256:48063d73…`, created 2026-10-10). After the release, `assertInbucketList` stays as a cheap
   guard.
3. (From Task 3, still open) Cal `up` returns when healthy, `down` stops the web, seed check uses
   `users`, no seed credentials in logs.
