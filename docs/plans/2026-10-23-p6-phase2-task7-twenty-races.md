# P6 Phase 2 Task 7: Twenty races (build plan)

Branch `feat/2026-10-23-p6-twenty-races` from `origin/main` `9b38d4f`. The plan is the first commit on that branch and is also on
`plan/2026-10-23-p6-twenty-races` (rule B10). No PR for the plan. Roadmap: [2026-10-22-p6-phase2-roadmap.md](2026-10-22-p6-phase2-roadmap.md)
§Task 7. Previous task's plan: [2026-10-23-p6-phase2-task6-twenty-stack.md](2026-10-23-p6-phase2-task6-twenty-stack.md).

Probe date: 2026-10-23 (cloud VM, Docker 29.9.2, Node 22.23.3, 4 vCPU, 16 GB). Probe scripts are outside the repo, in
`/tmp/claude-0/-home-user-k6-load-concurrency-suite/e4242cd7-a280-5705-8f36-d93a8b862529/scratchpad/probe/` (`probe7.mjs` is the
final version, `probe7-run1-INVALID.mjs` is the first run that the helper bug invalidated, `probe2.mjs` the optional cases,
`malformed.sh` the P6-OBS-TW-001 repro; outputs `*.out` and `*.json` next to them, and `exit-codes.txt` for every exit code).

## 0. Status: stopped for the owner's review (no build yet)

Rule B10 and the owner's instructions stop this task before the build, for **two** reasons, and both are real:

1. **P6-OBS-TW-001 reproduced** (§3.5). The owner's instruction: "If it reproduces, stop for the owner's review before the build."
   The label is the owner's. This plan records the evidence and the proposed outcome (**reproduced**); it adds no `test.fail()`,
   no label, and does not change the `docs/BACKLOG.md` status.
2. **The task changes a CI workflow** (`.github/workflows/perf.yml`, the `twenty-smoke` job: race step timeout, the token-scan
   patterns, and the job timeout decision in §8). Rule B10 names this as a stop.

A third finding is not a stop trigger but needs the owner's decision before the build (§12, Q1): the probe reproduces a
**more than one success** result on the parallel reset-token redemption (`P6-TW-RACE-004`) in 5 of 5 trials (10 of 10 requests
succeed every time). Under rule 13 this stays SUSPECTED until repeated full-count CI runs reproduce it. This plan does not label it.

Once the owner approves §12 (Q1 to Q4 at least), the build follows §7 step by step on the feature branch.

## 1. Goal, scope and the cases covered

- **Goal (roadmap).** Prove that concurrent edits never corrupt a Twenty record, and that a reset token admits one redemption.
- **Cases (roadmap table).**
  - Required: `P6-TW-RACE-001` (P0, two PATCH on one company name), `P6-TW-RACE-004` (P0, N=10 parallel redemptions of one reset
    token), `P6-TW-RACE-005` (accepted extra, disjoint-field PATCHes), `P6-TW-RACE-006` (accepted extra, sequential replay after
    a success).
  - Optional, **included because the probe shows each is cheap** (roadmap rule: setup through the same API client, one oracle
    query, under about a day): `P6-TW-RACE-002` (kanban position, two PATCHes of `position` on one task) and `P6-TW-RACE-003`
    (concurrent merge of the same pair with `mergeCompanies`). Proposed in §4 D1; the owner can drop them (Q4).
- **What it proves / transfers (roadmap).** Token single use (a one-time password-reset or payment-approval token in finance; a
  one-time consent or record-access link in healthcare) and write integrity under concurrent edits (two clerks editing one
  account or one patient record).
- **In scope.**
  - `src/twenty/mailpit.ts` (NEW), `src/twenty/api.ts` (NEW), `src/twenty/payloads.ts` (NEW), `src/twenty/invariants.ts` (NEW),
    `src/twenty/run-case.ts` (NEW), `src/twenty/oracle.ts` (CHANGED: three read-only queries), `src/twenty/env.ts` (CHANGED: Mailpit URL).
  - Six specs under `tests/twenty/races/` (NEW), matching unit tests under `tests/unit/` (NEW).
  - `.github/workflows/perf.yml` (CHANGED, `twenty-smoke` race step and token-scan patterns; owner review, §8), `README.md`
    ("Twenty races" section, no timing claims), `docs/BACKLOG.md` (entries only; no status change).
- **Out of scope.** Changes to the harness or its pin; `scripts/evidence-token-scan.mjs` (X6 is still a proposal); the Medusa,
  Cal and Documenso jobs; any `test.fail()` or product label (owner decision, Q1); API-key limiter tests (Task 6 X4).

## 2. Assumptions the build depends on

| #   | Assumption                                                                                                  | Probe result                                                                                                                           |
| --- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | REST `PATCH /rest/companies/{id}` updates a company name with a workspace token                             | **Yes**: 200 (§3.2). Note: the first probe run used POST by mistake (§3.0)                                                             |
| A2  | A PATCH with one field writes only that field                                                               | **Yes**: `name` kept after `employees` PATCH (§3.2)                                                                                    |
| A3  | Two parallel PATCHes of one name end on one of the two values, with no 5xx                                  | **Yes**, 8 of 8 trials: final `RACE-A` or `RACE-B`, both 200 (§3.3)                                                                    |
| A4  | Two parallel PATCHes of different fields on one record both persist                                         | **Yes**, 8 of 8 trials (§3.4)                                                                                                          |
| A5  | A throwaway member can be created through the product API (the reset flow needs a workspace member)         | **Yes, through the invitation flow** (§3.6). `signUp` alone does not (§3.6, source)                                                    |
| A6  | The reset email arrives in Mailpit with a 64-hex token in the body                                          | **Yes** (§3.6)                                                                                                                         |
| A7  | `validatePasswordResetToken` and `updatePasswordViaResetToken` are the redemption path; a replay is refused | **Yes**: replay returns a GraphQL error `Token is invalid`, HTTP 200 (§3.6)                                                            |
| A8  | Ten parallel redemptions of one token: exactly one succeeds (the roadmap's expectation)                     | **No**: 10 of 10 succeed in 5 of 5 trials (§3.7). SUSPECTED, not labelled (§12 Q1)                                                     |
| A9  | Soft delete exists for the cleanup/leak check                                                               | **Partly**: GraphQL `deleteCompany` keeps a row with `deletedAt`; REST `DELETE` leaves no row; `destroyCompany` removes the row (§3.5) |
| A10 | The reset request is rate limited per email (3 per 15 minutes, source `auth.resolver.ts` lines 126–127)     | **Source only**; each trial uses its own member, so one request per email (§4 D7)                                                      |
| A11 | Captcha does not block sign-up or reset in the harness overlay                                              | **Yes**: `signUpInWorkspace` and `emailPasswordResetLink` returned 200 with no token                                                   |
| A12 | The merge of one pair by two parallel `mergeCompanies` calls leaves one live row and returns one survivor   | **Yes**, 5 of 5 trials (§3.8)                                                                                                          |
| A13 | Reads through the read-only pool see the same rows as `docker exec psql` (no stale reads)                   | **Assumed**; checked by hand with one SELECT before step 7 (not a unit test, so not in the count)                                      |

## 3. Probe results (2026-10-23, live app)

### 3.0 Commands, exit codes and the invalid first run

| #   | Command (in this order)                                                            | Exit | Wall time                | What it proves                                                                                                                                                                                |
| --- | ---------------------------------------------------------------------------------- | ---- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `bash scripts/bootstrap.sh twenty`                                                 | 0    | not timed (Task 6: 15 s) | Clone at `TWENTY_REF` present                                                                                                                                                                 |
| 2   | `npm run up:twenty` (first start, images pulled inside `up`)                       | 0    | not timed                | Stack up (`up.log`)                                                                                                                                                                           |
| 3   | `npm run seed:twenty`                                                              | 0    | 80 s                     | Seed works (`created=true`)                                                                                                                                                                   |
| 4   | `probe7.mjs`, first run (module import of the harness package by file path failed) | 1    | —                        | Harness import path wrong; fixed by importing `dist/index.js` (`probe7` run 1 was then run with the POST bug, below)                                                                          |
| 5   | `probe7.mjs` (run 1, **invalid**)                                                  | 0    | —                        | Helper always sent POST when a body existed, so every "PATCH" created a company; `signUp` query had a wrong field. Results of those rows are **discarded**; kept as `probe7-run1-INVALID.out` |
| 6   | `probe7.mjs` (v2, explicit methods)                                                | 0    | —                        | PATCH, DELETE and GraphQL paths correct; `sendInvitations` sent to the wrong endpoint                                                                                                         |
| 7   | `probe7.mjs` (v3)                                                                  | 0    | —                        | `sendInvitations` on `/metadata`; invite link parsed wrongly (path segment used as token)                                                                                                     |
| 8   | `probe7.mjs` (v4)                                                                  | 0    | —                        | Reset flow works end to end; GraphQL destroy and soft-delete counts added                                                                                                                     |
| 9   | `probe7.mjs` (v5)                                                                  | 1    | —                        | Invite mail filter (`/invit/`) did not match the subject                                                                                                                                      |
| 10  | `probe7.mjs` (v6, final)                                                           | 0    | ~2 min                   | All sections, including the 5-trial, 10-way redemption race (`probe7v6.out`)                                                                                                                  |
| 11  | `malformed.sh` (P6-OBS-TW-001, 24 requests, 30 s client timeout)                   | 0    | ~6 min                   | Script exit 0; curl exit 28 on 12 requests (§3.9); `malformed.out`                                                                                                                            |
| 12  | `probe2.mjs` (v1: introspection, position race; merge shape without args)          | 0    | —                        | Merge arguments read from introspection (`probe2.out`)                                                                                                                                        |
| 13  | `probe2.mjs` (v2: merge without `conflictPriorityIndex`)                           | 0    | —                        | Merge rejected: missing `conflictPriorityIndex` (`probe2b.out`)                                                                                                                               |
| 14  | `probe2.mjs` (v3, final)                                                           | 0    | —                        | Position race and merge race (`probe2c.out`)                                                                                                                                                  |
| 15  | `npm run down:twenty`                                                              | 0    | 2 s                      | Stop, no containers left                                                                                                                                                                      |
| 16  | `npm run up:twenty` (second start, for the optional cases)                         | 0    | —                        | Stack up (`up2.log`)                                                                                                                                                                          |
| 17  | `npm run seed:twenty` (second seed)                                                | 0    | —                        | Seed (`seed2.log`)                                                                                                                                                                            |
| 18  | `npm run down:twenty` (second stop)                                                | 0    | —                        | Stop (`down2.log`)                                                                                                                                                                            |
| 19  | `npm run check` on `origin/main` `9b38d4f` (baseline)                              | 0    | 20 s                     | **431** unit tests pass; `check-baseline.log`                                                                                                                                                 |

The invalid run is kept on disk so a later reader can see that its rows were discarded (rule 8 of the Task 6 closeout). Every
number below comes from runs 6 to 14.

### 3.1 Routes, real statuses and bodies (one sample each)

| Request                                                                             | Auth                 | Status | Body (trimmed)                                                                                           | Time          | What it means                                                                  |
| ----------------------------------------------------------------------------------- | -------------------- | ------ | -------------------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------ |
| `POST /metadata` signIn (right password)                                            | none                 | 200    | 2 workspaces: `Apple`, `YCombinator`                                                                     | 234 ms        | Same as Task 6 §3.2                                                            |
| `POST /metadata` `getAuthTokensFromLoginToken` (origin = subdomain)                 | login token          | 200    | workspace token                                                                                          | 143 ms        | The exchange P6 uses (`src/twenty/auth.ts`)                                    |
| `PATCH /rest/companies/{id}` `{name}`                                               | workspace token      | 200    | `data.updateCompany` with `name`                                                                         | 23 ms         | A1: the update route                                                           |
| `PATCH /rest/companies/{id}` `{employees: 7}` then `GET`                            | workspace token      | 200    | `name` unchanged (`A-value`), `employees` 7                                                              | —             | A2: single-field write                                                         |
| `PATCH /rest/companies/{id}` same value                                             | workspace token      | 200    | `data.updateCompany`                                                                                     | —             | Idempotent write, no error                                                     |
| `PATCH /rest/companies/00000000-…`                                                  | workspace token      | 400    | "is not a valid UUID"                                                                                    | —             | Bad id is a 400, not a 404 (the oracle does not rely on it)                    |
| `PATCH /rest/companies/{id}`                                                        | none                 | 403    | "Missing authentication token"                                                                           | —             | Auth enforced                                                                  |
| `POST /graphql` `updateCompany(id, data:{name})`                                    | workspace token      | 200    | `data.updateCompany` with `name`, `updatedAt`                                                            | 22 ms         | GraphQL update works too; the races use REST (§4 D6)                           |
| `DELETE /rest/companies/{id}`                                                       | workspace token      | 200    | `data.deleteCompany` with `id`; **no row left** in the table (two runs)                                  | —             | §3.5: REST delete removes the row                                              |
| `GET /rest/companies/{id}` after REST delete                                        | workspace token      | 404    | "Record not found"                                                                                       | —             | Gone for reads                                                                 |
| `DELETE /rest/companies/{id}/destroy`                                               | workspace token      | 400    | "Valid examples: /rest/companies/id or /rest/companies or /rest/batch/companies"                         | —             | No REST destroy route; use GraphQL                                             |
| `POST /graphql` `destroyCompany(id)`                                                | workspace token      | 200    | `data.destroyCompany` with `id`; row count 0 afterwards                                                  | —             | Hard delete for cleanup (§4 D7)                                                |
| `POST /graphql` `deleteCompany(id)`                                                 | workspace token      | 200    | `data.deleteCompany` with `id`; the row stays with `deletedAt` set (1 of 706 rows)                       | —             | Soft delete through GraphQL (§3.5)                                             |
| `POST /metadata` `sendInvitations(emails)`                                          | workspace token      | 200    | `data.sendInvitations.__typename` = `SendInvitations`                                                    | —             | Invitation mail to Mailpit (subject "Join your team on Twenty")                |
| `POST /metadata` `signUpInWorkspace` (email, password, invite hash, personal token) | none                 | 200    | `data.signUpInWorkspace` (`SignUp`); membership row 1                                                    | 971 ms        | The invited member is created; bcrypt cost dominates                           |
| `POST /metadata` `signUpInWorkspace` with the personal token only                   | none                 | 200    | `errors`: "User does not have access to this workspace" (FORBIDDEN)                                      | 19 ms         | The workspace invite hash is required too                                      |
| `POST /metadata` `emailPasswordResetLink` (member)                                  | none                 | 200    | `data.emailPasswordResetLink.success` = true; mail "Action Needed to Reset Password" with a 64-hex token | 9 ms          | Reset request and mail (A6)                                                    |
| `POST /metadata` `emailPasswordResetLink` (not a member)                            | none                 | 200    | `success` = true, **no mail sent**                                                                       | 8 to 11 ms    | Silent skip for a user with no workspace (source `generatePasswordResetToken`) |
| `POST /metadata` `validatePasswordResetToken`                                       | none (token in args) | 200    | `{id, email, hasPassword: true}`                                                                         | —             | The token is valid before redemption                                           |
| `POST /metadata` `updatePasswordViaResetToken` (first)                              | none (token in args) | 200    | `data.updatePasswordViaResetToken.success` = true                                                        | 122 to 159 ms | The redemption works                                                           |
| `POST /metadata` `updatePasswordViaResetToken` (replay)                             | none (token in args) | 200    | `errors`: "Token is invalid" (FORBIDDEN_EXCEPTION)                                                       | 10 to 13 ms   | A replay is refused with a GraphQL error (HTTP 200)                            |
| `POST /metadata` `validatePasswordResetToken` (invalid token)                       | none                 | 200    | `errors`: "Token is invalid"                                                                             | —             | Invalid token is a GraphQL error, not a 4xx                                    |
| `POST /graphql` `mergeCompanies(ids, conflictPriorityIndex: 0)`                     | workspace token      | 200    | `data.mergeCompanies.id` (the survivor)                                                                  | —             | §3.8                                                                           |
| `POST /graphql` `mergeCompanies` without `conflictPriorityIndex`                    | workspace token      | 200    | `errors`: "Missing required argument: \"conflictPriorityIndex\" (number)"                                | —             | The argument is required                                                       |

Mailpit (port 8025): `GET /api/v1/messages` lists messages newest first with `ID`, `Subject`, `To[].Address`;
`GET /api/v1/message/{ID}` returns `Text` and `HTML`. Both worked.

### 3.2 Update-one: single-field write

Sample (run 6): create company, `PATCH {name: "A-value"}` → 200; `PATCH {employees: 7}` → 200; `GET` → `name` `A-value`,
`employees` 7. The write is one field. So the disjoint-field race has a real oracle (A2).

### 3.3 `P6-TW-RACE-001` characterization (8 trials, two PATCH of `name` in parallel)

| Trial | Status A | Status B | Final name | Trial | Status A | Status B | Final name |
| ----- | -------- | -------- | ---------- | ----- | -------- | -------- | ---------- |
| 1     | 200      | 200      | `RACE-B`   | 5     | 200      | 200      | `RACE-A`   |
| 2     | 200      | 200      | `RACE-B`   | 6     | 200      | 200      | `RACE-A`   |
| 3     | 200      | 200      | `RACE-A`   | 7     | 200      | 200      | `RACE-B`   |
| 4     | 200      | 200      | `RACE-B`   | 8     | 200      | 200      | `RACE-B`   |

Both writes succeed in every trial; the final value is always one of the two (`RACE-A` 3, `RACE-B` 5). No 5xx. **The oracle
holds**: final ∈ {A, B}. The case is a characterization (roadmap Context note 8); it passes.

### 3.4 `P6-TW-RACE-005` (8 trials, `name` PATCH ‖ `employees` PATCH on one company)

Both statuses 200 in all 8 trials; both values kept in 8 of 8 (`name` `X0`…`X7`, `employees` 100…107). **No lost update**
on the REST route. The case passes.

### 3.5 Delete paths (cleanup and the leak check)

| Path                               | Result                                                             | Use in P6                           |
| ---------------------------------- | ------------------------------------------------------------------ | ----------------------------------- |
| REST `DELETE /rest/companies/{id}` | 200, then **0 rows** in `workspace_<id>.company` (two runs)        | Not used (the row is gone)          |
| GraphQL `deleteCompany(id)`        | 200, row kept, `deletedAt` set; 1 of 706 company rows soft-deleted | Not used; proves soft delete exists |
| GraphQL `destroyCompany(id)`       | 200, row count 0                                                   | **Cleanup path** (§4 D7)            |
| REST `…/destroy`                   | 400, no such route                                                 | Not used                            |

Why the REST delete removes the row was not explained by the source read in this probe; the plan does not depend on it (§12 Q6).

### 3.6 Throwaway member, reset request and redemption

- **Invitation flow (works).** `sendInvitations([address])` (`/metadata`, admin session) → mail "Join your team on Twenty" with a
  link `http://127.0.0.1:3002/invite/<workspace invite hash>?inviteToken=<64 hex>&email=<address>`. Then `signUpInWorkspace`
  with `email`, `password`, `workspaceInviteHash` (the path segment) and `workspacePersonalInviteToken` (the query value) → 200,
  one membership row.
- **`signUp` alone (not probed, source read).** `signUp` (`auth.resolver.ts` line 456) creates a user without a workspace. The reset
  path needs a password-auth workspace membership (`resolveTargetWorkspace`), so such a user gets no mail. The probe's run 1 used
  `signUp` with a wrong return field and never reached it; the route is recorded as not probed.
- **Reset request.** Member: 200 and the reset mail (64-hex token). Non-member: 200 and no mail (a silent skip; the response
  does not reveal membership).
- **Redemption (sequential, probe v6).** `validatePasswordResetToken` → 200 with the user id. First `updatePasswordViaResetToken`
  → 200, `success: true`. Replay → 200 with a GraphQL error `Token is invalid` (FORBIDDEN_EXCEPTION). The token row: 1 row,
  `revokedAt` set. **`P6-TW-RACE-006` passes** (sequential control).

### 3.7 `P6-TW-RACE-004`: 10 parallel redemptions, fresh member per trial (5 trials)

| Trial | Statuses | Successes (of 10) | Error messages | Password hash changed | Token rows revoked |
| ----- | -------- | ----------------- | -------------- | --------------------- | ------------------ |
| 1     | 200      | **10**            | none           | yes                   | 1                  |
| 2     | 200      | **10**            | none           | yes                   | 1                  |
| 3     | 200      | **10**            | none           | yes                   | 1                  |
| 4     | 200      | **10**            | none           | yes                   | 1                  |
| 5     | 200      | **10**            | none           | yes                   | 1                  |

**Result: 50 of 50 parallel redemption requests succeed (5 trials × 10).** The roadmap predicted a check-then-act window, and the
source shows it (`updatePasswordViaResetToken` runs `validatePasswordResetToken` (a `findOne` for an unrevoked, unexpired token),
then `updatePassword`, then `invalidatePasswordResetToken` (an unconditional `update`), with no lock). The sequential replay is
refused, so the bug is a race, not a missing check. **Status: SUSPECTED** (rule 13). Not labelled, no `test.fail()` (§12 Q1).

Limits of this sample: five trials, one stack, one Node process. Each request was sent with `Promise.all`; the 200s show that all
ten were accepted. The request start and end times were not recorded in this probe; the build records them (`RaceRequestResult`
has `startedAtMs` and `endedAtMs`) to show the overlap.

### 3.8 `P6-TW-RACE-002` and `-003` (optional cases, cheap)

- **`-002` kanban position (8 trials, two PATCH of `position` on one task).** `PATCH /rest/tasks/{id}` `{position: 10}` ‖
  `{position: 20}`: 200 and 200 in every trial; final `position` 20 in 8 of 8 (the second write won in this run). The oracle
  "final ∈ {10, 20}" holds. Cheap: task create, two PATCH, one GET. The real kanban may send other values (`first`, `last`);
  the probe used numbers (§12 Q4, risk R7).
- **`-003` merge (5 trials, two parallel `mergeCompanies(ids, conflictPriorityIndex: 0)` of one pair).** 200 and 200 in every trial,
  the **same survivor id** in both responses, and **exactly one live row** for the pair in every trial (soft-deleted 0). Cheap:
  two companies, two merges, two counts. The oracle "one live row, one survivor id, both 2xx" holds.

### 3.9 P6-OBS-TW-001 (malformed bodies): the repro (3 runs per request, valid workspace session, 30 s client timeout)

Script: `malformed.sh` (curl; `--max-time 30`; `%{time_starttransfer}` for TTFB). Bodies: (a) empty file, (b) `{}`,
(c) `{"foo":1}`, (d) `{"query":"{ __typename }"}`; all `Content-Type: application/json` with `Authorization: Bearer <workspace token>`.

| Endpoint    | Body (a) empty                                             | Body (b) `{}`                                     | Body (c) `{"foo":1}`                                                                                                   | Body (d) valid                                                            |
| ----------- | ---------------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `/metadata` | **no response** ×3: curl 28 at 30.00 s, 0 bytes, TTFB none | **no response** ×3: curl 28 at 30.00 s, TTFB none | **400** ×3: TTFB 7.2, 4.2, 7.2 ms; body `{"errors":[{"message":"Unexpected parameter \"foo\" in the request body."}]}` | **200** ×3: TTFB 7.4, 5.6, 5.0 ms; body `{"data":{"__typename":"Query"}}` |
| `/graphql`  | **no response** ×3: curl 28 at 30.00 s, 0 bytes, TTFB none | **no response** ×3: curl 28 at 30.00 s, TTFB none | **400** ×3: TTFB 8.8, 5.7, 8.1 ms; same body                                                                           | **200** ×3: TTFB 12.3, 6.3, 5.7 ms; same body                             |

Server log for the window (`docker logs --since 2026-10-23T17:47:50Z qa-harness-twenty-server-1`, the whole run until the capture):
21 lines, none of them from the requests. Two WARN lines at 17:48:10 (`2 workspaces found in database …` and `WARN undefined`), in
the same second as the token exchange and the first request; they cannot be attributed from the log alone, and no line appears in
any later second, including during the 30-second hangs. A first capture with fractional-second `--since`/`--until` returned
0 lines for the same window: Docker in this environment did not accept the nanosecond timestamps. The build uses whole seconds (§4 D12).

**What it proves.** Empty and `{}` bodies get no response at all on both endpoints, in 12 of 12 requests of this run (and in
the three sessions of Task 6 §3.5). `{"foo":1}` and valid bodies answer in under 15 ms. The server logs nothing for the hang.

**What it does not prove.** Why the server hangs (the request handler is not reached, or it awaits something that never returns); the
probe did not attach a debugger. It also does not say whether the hang is a product bug or a harness or proxy artefact; that is the
owner's call.

**Proposed outcome (for the owner's decision; not applied): reproduced.** The evidence is this run plus Task 6 §3.5. Label stays
SUSPECTED until the owner decides (rule 13). No `test.fail()`, no label, no status change in `docs/BACKLOG.md` by this task (owner
instruction; Task 6 D14).

### 3.10 Database facts (read-only pool, schema derivation)

- Workspace schema of `apple`: `workspace_1wgvd1injqtife6y4rvfbu3h5` (derived by `workspaceSchemaName`, the Task 6 base-36 rule).
- `company` has `deletedAt`, `name`, `employees` (and the address and link columns).
- `task` has `position`; `company` and `person` have `position` too (the position columns list in `probe2c.out`).
- `core.appToken` columns: `id, userId, workspaceId, type, value, expiresAt, deletedAt, revokedAt, createdAt, updatedAt, context`.
  The reset token row is `type = 'PASSWORD_RESET_TOKEN'`, `value` = SHA-256 of the token (fork `reset-password.service.ts`).
- `core."user"` has `passwordHash` (quoted identifier in SQL).
- The read-only pool was not used in the probe (the probe used `docker exec psql`, as Task 6). The build checks the pool (§7 step 2).

### 3.11 What the probe proves, and what it does not

- **Proves:** the update routes and their single-field semantics; the parallel name and disjoint-field behaviour (8 trials each); a
  throwaway member can be made through the invitation flow; the reset mail and token; the sequential replay refusal; the 10-way
  redemption race (5 trials, 50 of 50 accepted); the soft and hard delete behaviour; the position and merge races (cheap); and the
  P6-OBS-TW-001 repro (12 of 12 hangs for empty and `{}` bodies).
- **Does not prove:** CI behaviour (runner speed, Docker Hub from GitHub, mail latency on a hosted runner); the kanban UI's own position
  values; the `signUp` route; the reset rate limit (source only); the cause of P6-OBS-TW-001; whether `destroyTask` exists (not probed).

## 4. Design and decisions (each with a reason)

- **D1 Scope: required four plus two optional.** `-001`, `-004`, `-005`, `-006` are required. `-002` and `-003` are included because
  §3.8 shows each is cheap (roadmap rule). Reason: the roadmap says "land if cheap", and the probe shows it is. The owner can drop them (Q4).
- **D2 Throwaway member through the invitation flow.** `sendInvitations` (admin session) then `signUpInWorkspace` with the invite hash and the
  personal token from Mailpit. Reason: `signUp` creates a user with no workspace, and the reset path then sends no mail (§3.6,
  `resolveTargetWorkspace`). The seed admin is never used for a reset (roadmap).
- **D3 Seed users are not reused.** The seed created many Apple members. Reusing one changes shared seed data (passwords) that other
  specs and the owner's manual checks may depend on. Reason: isolation (roadmap data-isolation rule).
- **D4 Reads through the read-only pool, mail through Mailpit's API.** `createReadOnlyPool(twentyDatabaseUrlFromEnv())` and `selectRows`
  for the oracle (the SELECT-only guard in `src/oracles/pg.ts`). Mailpit by `fetch`. Reason: no `docker exec` inside a spec (slower, and
  it needs the Docker socket in CI).
- **D5 Auth: reuse `src/twenty/auth.ts`.** `signInWorkspace` gives the workspace token. Reason: one sign-in path (Task 6 D3). The
  invitation calls use that token. The throwaway member signs in only through `signUpInWorkspace`.
- **D6 Update route: REST `PATCH /rest/companies/{id}`.** Reason: §3.1 (200), and it matches the roadmap's "PATCH" wording. GraphQL is
  used only for `destroyCompany` (cleanup), `mergeCompanies` and the reset mutations, which are GraphQL-only.
- **D7 Cleanup: `destroyCompany` (and `destroyTask`, unverified) for records; no user delete.** Records are destroyed by GraphQL (row
  count 0 after, §3.5). Reason: REST delete hides rows in a way the leak check cannot count (§3.5). Throwaway members stay in the
  stack (no delete API was probed); the leak check counts members by email prefix (Q5). The one-request-per-email rule keeps the reset rate
  limit (3 per 15 minutes per email, source only) out of the way (A10).
- **D8 Secrets.** Reset tokens, invite tokens, invite hashes and the new passwords are generated or read in memory only. The histogram
  stores statuses, counts, and `oracle` values such as successes, final names, `hashChanged` (boolean) and a count of revoked rows. Never a
  token, never a password, never a body with a token. The token scan (§8) gets the reset-link pattern (§8.2).
- **D9 Waits: polling, not fixed sleeps.** Mail is polled every 250 ms for up to 15 s; a message that never comes is a TEST BUG (setup).
  Reason: the probe's fixed 2.5 s and 4 s sleeps were the slowest part of each trial.
- **D10 Status mapping (Task 6 D5 and D14).** 429 is a TEST BUG (never a pass or a race result); 5xx is UNEXPECTED with no label and the
  trial fails; any 2xx or the expected 4xx GraphQL error is recorded as-is.
- **D11 Trials from `RACE_TRIALS`** (roadmap D6): 5 on PRs, 50 on `main`, nightly and dispatch. Each spec has its own warm-up trial
  (`createRerunRunner` → `runner.warmup`), which is not counted.
- **D12 Log window timestamps in whole seconds.** The §3.9 capture showed that `docker logs --since` with fractional seconds returned
  nothing here. The CI capture (existing step) is unchanged; the probe's own capture uses whole seconds.
- **D13 Mailpit URL: `P6_TWENTY_MAILPIT_URL`, default `http://127.0.0.1:8025`,** with the same loopback rule as `twentyBaseUrlFromEnv`
  (cleartext only to loopback). Reason: the credentials are not sent there, but the reset token is, and the rule keeps one standard.
- **D14 Expected verdicts.** `-001`: final ∈ {A, B}, no 5xx. `-002`: final ∈ {10, 20}, no 5xx. `-003`: both 2xx, one survivor id, one live row.
  `-004`: exactly one success in each trial. `-005`: both values kept. `-006`: the replay is refused, the hash is unchanged by the replay, the
  token stays revoked. **`-004` is expected to fail** on the probe's evidence (§3.7); the build does not hide that (rule 12). §12 Q1 decides how
  CI shows it. Until the owner decides, the build stops at step 8.

## 5. Files (exact paths)

| Path                                                     | Status  | Step | Notes                                                                |
| -------------------------------------------------------- | ------- | ---- | -------------------------------------------------------------------- |
| `src/twenty/env.ts`                                      | CHANGED | 1    | `twentyMailpitUrlFromEnv`                                            |
| `tests/unit/twenty-env.test.ts`                          | CHANGED | 1    | +1 test (Mailpit URL rule)                                           |
| `src/twenty/mailpit.ts`                                  | NEW     | 2    | `latestMessageFor`, `resetTokenFrom`, `inviteFrom`, `waitForMessage` |
| `tests/unit/twenty-mailpit.test.ts`                      | NEW     | 2    | 5 tests                                                              |
| `src/twenty/payloads.ts`                                 | NEW     | 3    | names, addresses, passwords (in memory)                              |
| `tests/unit/twenty-payloads.test.ts`                     | NEW     | 3    | 3 tests                                                              |
| `src/twenty/invariants.ts`                               | NEW     | 4    | one `assert…` per oracle rule                                        |
| `tests/unit/twenty-invariants.test.ts`                   | NEW     | 4    | 6 tests                                                              |
| `src/twenty/api.ts`                                      | NEW     | 5    | REST PATCH/POST/GET/DELETE, GraphQL calls, invitation, reset         |
| `tests/unit/twenty-api.test.ts`                          | NEW     | 5    | 3 tests (fake fetch)                                                 |
| `src/twenty/oracle.ts`                                   | CHANGED | 6    | `passwordHashMd5`, `resetTokenCounts`, `companyLiveRows`             |
| `tests/unit/twenty-oracle.test.ts`                       | CHANGED | 6    | +1 test (SELECT-only and schema guard)                               |
| `src/twenty/run-case.ts`                                 | NEW     | 7    | `runTwentyTrials`: warm-up, reruns, histogram in `finally`           |
| `tests/twenty/races/tw-race-001-lost-update.spec.ts`     | NEW     | 7    | §6.8                                                                 |
| `tests/twenty/races/tw-race-005-disjoint-fields.spec.ts` | NEW     | 7    | §6.9                                                                 |
| `tests/twenty/races/tw-race-004-reset-token.spec.ts`     | NEW     | 8    | §6.10                                                                |
| `tests/twenty/races/tw-race-006-reset-replay.spec.ts`    | NEW     | 8    | §6.11                                                                |
| `tests/twenty/races/tw-race-002-kanban-position.spec.ts` | NEW     | 9    | §6.12                                                                |
| `tests/twenty/races/tw-race-003-merge.spec.ts`           | NEW     | 9    | §6.13                                                                |
| `.github/workflows/perf.yml`                             | CHANGED | 10   | race step timeout, token-scan patterns (owner review, §8)            |
| `README.md`                                              | CHANGED | 11   | "Twenty races" section, no timing claims                             |
| `docs/BACKLOG.md`                                        | CHANGED | 11   | new open items only; no status change for P6-OBS-TW-001              |

Unchanged: `src/races/*` (the shared race code), `src/twenty/auth.ts`, `scripts/*`, `package.json` (the `race:twenty` script already
runs every spec in `tests/twenty/races`), `playwright.config.ts` (`twenty-race` project already covers `tests/twenty/races`), the harness pin.

## 6. Code skeletons and tests (each new function and test)

Imports use the repo's `.ts` extension style, as in `src/twenty/oracle.ts`. Type names reused from existing modules are cited, not
re-declared. Each skeleton is what the build writes; the build may add small helpers the skeleton does not show, and then the
plan's counts (§7) still hold.

### 6.1 `src/twenty/env.ts` (CHANGED, step 1) and the test (+1)

```ts
// Added after twentyBaseUrlFromEnv. Same loopback rule: credentials and the reset token are sent to this URL.
export function twentyMailpitUrlFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  const url = strip(val(env, "P6_TWENTY_MAILPIT_URL") ?? "http://127.0.0.1:8025");
  const { protocol, hostname } = new URL(url);
  const loopback = hostname === "127.0.0.1" || hostname === "localhost" || hostname === "[::1]";
  if (protocol === "http:" && !loopback) {
    throw new Error("ENV: P6_TWENTY_MAILPIT_URL must use https:// unless it is a loopback address");
  }
  return url;
}
```

```ts
// tests/unit/twenty-env.test.ts (add to the existing file)
test("twentyMailpitUrlFromEnv: default is the loopback Mailpit port, and a remote http host is refused", () => {
  assert.equal(twentyMailpitUrlFromEnv({}), "http://127.0.0.1:8025");
  assert.throws(
    () => twentyMailpitUrlFromEnv({ P6_TWENTY_MAILPIT_URL: "http://mail.example.test" }),
    /ENV:/,
  );
});
```

### 6.2 `src/twenty/mailpit.ts` (NEW, step 2) and `tests/unit/twenty-mailpit.test.ts` (NEW, 5 tests)

```ts
export interface MailpitSummary {
  ID: string;
  Subject: string;
  To: Array<{ Address: string }>;
}
export interface MailpitMessage extends MailpitSummary {
  Text: string;
  HTML: string;
}

/** Mailpit lists newest first, so the first match is the latest. */
export function latestMessageFor(
  list: MailpitSummary[],
  address: string,
  subject: RegExp,
): MailpitSummary | null {
  return (
    list.find((m) => m.To.some((t) => t.Address === address) && subject.test(m.Subject)) ?? null
  );
}

/** The 64-hex reset token in the body (Task 7 probe §3.6). The value is returned to the caller only, never logged. */
export function resetTokenFrom(msg: Pick<MailpitMessage, "Text" | "HTML">): string | null {
  return `${msg.Text}\n${msg.HTML}`.match(/[0-9a-f]{64}/)?.[0] ?? null;
}

/** The invite link: /invite/<workspace invite hash>?inviteToken=<token>. Hash is the last path segment. */
export function inviteFrom(
  msg: Pick<MailpitMessage, "Text" | "HTML">,
): { workspaceInviteHash: string; personalToken: string } | null {
  const url = `${msg.Text}\n${msg.HTML}`
    .match(/https?:\/\/[^\s"<>]+/g)
    ?.find((u) => /\/invite\//.test(u));
  if (!url) return null;
  const parsed = new URL(url);
  const personalToken = parsed.searchParams.get("inviteToken");
  const workspaceInviteHash = parsed.pathname.split("/").pop() ?? "";
  if (!personalToken || !workspaceInviteHash) return null;
  return { workspaceInviteHash, personalToken };
}

/** Polls the list every intervalMs; a message that never arrives is a setup error (TEST BUG), never a pass. */
export async function waitForMessage(opts: {
  mailpitUrl: string;
  address: string;
  subject: RegExp;
  timeoutMs?: number;
  intervalMs?: number;
  fetchImpl?: typeof fetch;
}): Promise<MailpitMessage> {
  const f = opts.fetchImpl ?? fetch;
  const deadline = Date.now() + (opts.timeoutMs ?? 15_000);
  for (;;) {
    const list = (await (await f(`${opts.mailpitUrl}/api/v1/messages`)).json()) as {
      messages: MailpitSummary[];
    };
    const hit = latestMessageFor(list.messages ?? [], opts.address, opts.subject);
    if (hit) {
      return (await (
        await f(`${opts.mailpitUrl}/api/v1/message/${hit.ID}`)
      ).json()) as MailpitMessage;
    }
    if (Date.now() >= deadline) {
      throw new Error(`TEST BUG: no mail matching ${opts.subject} for the address within the wait`);
    }
    await new Promise((r) => setTimeout(r, opts.intervalMs ?? 250));
  }
}
```

Tests (`tests/unit/twenty-mailpit.test.ts`, `node:test` style as in the other `twenty-*` tests):

1. `latestMessageFor` returns the first (newest) match and `null` when the address has no message.
2. `latestMessageFor` ignores a message whose subject does not match (the invite mail is not a reset mail).
3. `resetTokenFrom` returns the 64-hex value from the body and `null` when the body has none.
4. `inviteFrom` returns the hash (last path segment) and the `inviteToken`; `null` when there is no invite link.
5. `waitForMessage` polls with a fake `fetch` until a match, then returns the message; with `timeoutMs: 1` and no match it throws `TEST BUG`.

### 6.3 `src/twenty/payloads.ts` (NEW, step 3) and `tests/unit/twenty-payloads.test.ts` (NEW, 3 tests)

```ts
import { randomBytes } from "node:crypto";

/** Company names carry the run prefix (src/races/prefix.ts p6RunPrefix) and a side, so a cleanup sweep can find them. */
export function companyName(prefix: string, trial: number, side: string): string {
  return `${prefix}-${trial}-${side}`;
}

/** A throwaway member address under the seed workspace domain (probe §3.6). Prefix first, so the leak check can count it. */
export function throwawayAddress(prefix: string, trial: number): string {
  return `${prefix.toLowerCase()}-t${trial}-${randomBytes(3).toString("hex")}@apple.dev`;
}

/** New password, generated in memory and never printed. Meets the fork's rules (probe: 'P6-…-Pw1!' accepted). */
export function freshPassword(): string {
  return `P6-${randomBytes(9).toString("base64url")}-Pw1!`;
}
```

Tests: (1) `companyName` is stable and contains the prefix and the side; (2) `throwawayAddress` starts with the lower-cased prefix and ends with `@apple.dev` (two calls differ); (3) `freshPassword` is ≥ 16 characters and never equals a second call's result.

### 6.4 `src/twenty/invariants.ts` (NEW, step 4) and `tests/unit/twenty-invariants.test.ts` (NEW, 6 tests)

```ts
/** Final name must equal one of the two values written (P6-TW-RACE-001, probe §3.3). */
export function assertNameIsOneOf(final: string | null, candidates: [string, string]): void {
  if (final === null) throw new Error("TEST BUG: the record is missing after the race");
  if (!candidates.includes(final)) {
    throw new Error(`P6-TW-RACE-001: final name ${final} is neither ${candidates.join(" nor ")}`);
  }
}

/** Exactly one success among the parallel redemptions (P6-TW-RACE-004; the probe fails this, §3.7). */
export function assertExactlyOne(successes: number, label: string): void {
  if (successes !== 1) throw new Error(`${label}: ${successes} successes, expected exactly 1`);
}

/** Both disjoint-field values persist (P6-TW-RACE-005). */
export function assertBothKept(
  got: { name: string | null; employees: number | null },
  want: { name: string; employees: number },
): void {
  if (got.name !== want.name || got.employees !== want.employees) {
    throw new Error(`P6-TW-RACE-005: lost update (name ${got.name}, employees ${got.employees})`);
  }
}

/** A replay after a success is refused with a GraphQL error (P6-TW-RACE-006, probe §3.6). */
export function assertReplayRefused(body: { errors?: Array<{ message: string }> }): void {
  if (!body.errors?.length) throw new Error("P6-TW-RACE-006: replay was accepted");
}

/** One live row for the pair after a merge, and one survivor id in every response (P6-TW-RACE-003). */
export function assertOneSurvivor(liveRows: number, survivorIds: Array<string | null>): void {
  const ids = new Set(survivorIds);
  if (liveRows !== 1 || ids.size !== 1 || ids.has(null)) {
    throw new Error(`P6-TW-RACE-003: ${liveRows} live rows, survivor ids ${[...ids].join(",")}`);
  }
}

/** No 5xx in any response of a trial (the roadmap's "no 5xx" oracle on every case). */
export function assertNo5xx(statuses: Array<number | null>): void {
  const bad = statuses.filter((s) => s === null || s >= 500);
  if (bad.length)
    throw new Error(
      `UNEXPECTED: 5xx or no response: ${bad.join(",")} (no product label; Task 6 D14)`,
    );
}
```

Tests: one per function: (1) name in candidates passes; a third value throws; `null` throws TEST BUG. (2) `assertExactlyOne(1)` passes, `(10)` throws with the count in the message. (3) both values kept pass; one lost throws. (4) replay with errors passes; a body without errors throws. (5) one live row and one survivor passes; two survivor ids throw. (6) `assertNo5xx([200, 409])` passes; `[500]` throws.

### 6.5 `src/twenty/api.ts` (NEW, step 5) and `tests/unit/twenty-api.test.ts` (NEW, 3 tests)

```ts
/** REST call with the workspace token. Returns the status and parsed body; never throws on a status (the caller maps it, D10). */
export async function restCall(
  base: string,
  authorizationHeader: string,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
  fetchImpl: typeof fetch = fetch,
): Promise<{ status: number; json: unknown; text: string }> {
  const res = await fetchImpl(`${base}/rest${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: authorizationHeader },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, json: safeJson(text), text };
}

/** GraphQL call that does not throw on `errors`: the caller decides (a replay is an expected error). */
export async function graphqlCall(
  base: string,
  path: "/metadata" | "/graphql",
  query: string,
  variables: Record<string, unknown>,
  authorizationHeader?: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{
  status: number;
  json: { data?: unknown; errors?: Array<{ message: string }> } | null;
  text: string;
}> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authorizationHeader) headers.Authorization = authorizationHeader;
  const res = await fetchImpl(`${base}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables }),
  });
  const text = await res.text();
  return { status: res.status, json: safeJson(text), text };
}

export const createCompany = (base: string, auth: string, name: string) =>
  restCall(base, auth, "POST", "/companies", { name }).then((r) => ({
    ...r,
    id: (r.json as any)?.data?.createCompany?.id as string | undefined,
  }));
export const patchCompany = (
  base: string,
  auth: string,
  id: string,
  data: Record<string, unknown>,
) => restCall(base, auth, "PATCH", `/companies/${id}`, data);
export const destroyCompany = (base: string, auth: string, id: string) =>
  graphqlCall(
    base,
    "/graphql",
    "mutation D($id: UUID!) { destroyCompany(id: $id) { id } }",
    { id },
    auth,
  );
export const createTask = (base: string, auth: string, title: string) =>
  restCall(base, auth, "POST", "/tasks", { title });
export const patchTaskPosition = (base: string, auth: string, id: string, position: number) =>
  restCall(base, auth, "PATCH", `/tasks/${id}`, { position });
export const mergeCompanies = (base: string, auth: string, ids: string[]) =>
  graphqlCall(
    base,
    "/graphql",
    "mutation M($ids: [UUID!]!) { mergeCompanies(ids: $ids, conflictPriorityIndex: 0) { id } }",
    { ids },
    auth,
  );
export const sendInvitation = (base: string, auth: string, email: string) =>
  graphqlCall(
    base,
    "/metadata",
    "mutation I($emails: [String!]!) { sendInvitations(emails: $emails) { __typename } }",
    { emails: [email] },
    auth,
  );
export const signUpFromInvite = (
  base: string,
  email: string,
  password: string,
  invite: { workspaceInviteHash: string; personalToken: string },
) =>
  graphqlCall(
    base,
    "/metadata",
    "mutation S($email: String!, $password: String!, $h: String, $tok: String) { signUpInWorkspace(email: $email, password: $password, workspaceInviteHash: $h, workspacePersonalInviteToken: $tok) { __typename } }",
    { email, password, h: invite.workspaceInviteHash, tok: invite.personalToken },
  );
export const requestPasswordReset = (base: string, email: string, workspaceId: string) =>
  graphqlCall(
    base,
    "/metadata",
    "mutation R($email: String!, $wsid: UUID) { emailPasswordResetLink(email: $email, workspaceId: $wsid) { success } }",
    { email, wsid: workspaceId },
  );
export const redeemResetToken = (base: string, token: string, newPassword: string) =>
  graphqlCall(
    base,
    "/metadata",
    "mutation U($t: String!, $p: String!) { updatePasswordViaResetToken(passwordResetToken: $t, newPassword: $p) { success } }",
    { t: token, p: newPassword },
  );

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
```

Note for the build: the skeleton uses `as any` for brevity; the build types the response (`CreateCompanyResponse`) to keep `npm run typecheck` strict.

Tests (`tests/unit/twenty-api.test.ts`, fake `fetch`):

1. `restCall` sends the method, the `Authorization` header and the JSON body (`PATCH` with `{name}`).
2. `restCall` returns a 429 (or 500) as a status, does not throw.
3. `graphqlCall` returns the `errors` array for a replay-style refusal and does not throw; `signUpFromInvite` sends `workspaceInviteHash` and `workspacePersonalInviteToken`.

### 6.6 `src/twenty/oracle.ts` (CHANGED, step 6) and `tests/unit/twenty-oracle.test.ts` (CHANGED, +1)

```ts
// Each query goes through selectRows (SELECT-only guard, src/oracles/pg.ts). The schema is checked before it is put into SQL.
const SCHEMA_RE = /^workspace_[a-z0-9]+$/;

export async function passwordHashMd5(pool: pg.Pool, email: string): Promise<string | null> {
  const rows = await selectRows<{ h: string | null }>(
    pool,
    `SELECT md5("passwordHash") AS h FROM core."user" WHERE email = $1`,
    [email],
  );
  return rows[0]?.h ?? null;
}

export async function resetTokenCounts(
  pool: pg.Pool,
  email: string,
): Promise<{ total: number; revoked: number }> {
  const rows = await selectRows<{ total: string; revoked: string }>(
    pool,
    `SELECT count(*) AS total, count(*) FILTER (WHERE t."revokedAt" IS NOT NULL) AS revoked
       FROM core."appToken" t JOIN core."user" u ON u.id = t."userId"
      WHERE u.email = $1 AND t.type = 'PASSWORD_RESET_TOKEN'`,
    [email],
  );
  return { total: Number(rows[0]?.total ?? 0), revoked: Number(rows[0]?.revoked ?? 0) };
}

export async function companyLiveRows(
  pool: pg.Pool,
  schema: string,
  ids: string[],
): Promise<number> {
  if (!SCHEMA_RE.test(schema)) throw new Error("TEST BUG: schema name is not a workspace schema");
  const rows = await selectRows<{ n: string }>(
    pool,
    `SELECT count(*) AS n FROM "${schema}".company WHERE id = ANY($1::uuid[]) AND "deletedAt" IS NULL`,
    [ids],
  );
  return Number(rows[0]?.n ?? 0);
}
```

Test (+1): `companyLiveRows` throws `TEST BUG` for a schema that is not `workspace_<id>` (no pool needed: the check runs first), and the three SQL strings pass `assertSelectOnly` (the existing guard, exported from `src/oracles/pg.ts`).

### 6.7 `src/twenty/run-case.ts` (NEW, step 7)

```ts
import type { RaceHistogram, RaceAttemptResult } from "../races/types.ts";
import { createHistogram, writeHistogram } from "../races/histogram.ts";
import { createRerunRunner, spreadPolicyFromEnv } from "../races/rerun-on-spread.ts";
import { runTrials } from "../races/run-trials.ts";
import { fireTogether } from "../races/fire-together.ts";
import { recordTrial } from "../races/trial-record.ts";
import { raceTrialsFromEnv } from "../races/env.ts";

/**
 * One case: warm-up, then N trials through the rerun runner. The histogram is written in `finally` (the Documenso shape).
 * `trialBody` returns the oracle values of one attempt; `check` throws on a violation (recorded, then the case fails).
 */
export async function runTwentyTrials(opts: {
  caseId: string;
  title: string;
  concurrency: number;
  burst: (trial: number) => Promise<{
    requests: Parameters<typeof recordTrial>[1]["requests"];
    oracle: Record<string, number | string | boolean | null>;
  }>;
  check: (oracle: Record<string, number | string | boolean | null>, requests: unknown[]) => void;
  warm?: () => Promise<unknown>;
}): Promise<RaceHistogram> {
  const trials = raceTrialsFromEnv();
  const histogram = createHistogram({
    caseId: opts.caseId,
    title: opts.title,
    product: "twenty",
    concurrency: opts.concurrency,
    trials,
  });
  try {
    const runner = createRerunRunner(spreadPolicyFromEnv(), trials);
    await runner.warmup(() => attemptOnce(0));
    await runTrials(trials, (trial) => runner.runTrial(trial, () => attemptOnce(trial)));
    runner.applyTo(histogram);
    return histogram;
  } finally {
    await writeHistogram(histogram);
  }

  async function attemptOnce(trial: number): Promise<RaceAttemptResult> {
    const { requests, oracle } = await opts.burst(trial);
    const fired = { requests, dispatchSpreadMs: 0 };
    return recordTrial(trial, fired, () => opts.check(oracle, requests));
  }
}
```

(The build fills `dispatchSpreadMs` from `fireTogether`'s result instead of `0`: the skeleton keeps `fireTogether` out for brevity. `fireTogether(n, makeRequest)` returns `{requests, dispatchSpreadMs}`.)

### 6.8 `tests/twenty/races/tw-race-001-lost-update.spec.ts` (NEW, step 7)

```ts
import { expect, test } from "@playwright/test";
import { runTwentyTrials } from "../../../src/twenty/run-case.ts";
import { createCompany, patchCompany, restCall } from "../../../src/twenty/api.ts";
import { assertNameIsOneOf, assertNo5xx } from "../../../src/twenty/invariants.ts";
import { companyName } from "../../../src/twenty/payloads.ts";
import { signInWorkspace } from "../../../src/twenty/auth.ts";
import {
  twentyBaseUrlFromEnv,
  twentyEmailFromEnv,
  twentyPasswordFromEnv,
  twentyWorkspaceNameFromEnv,
} from "../../../src/twenty/env.ts";
import { p6RunPrefix } from "../../../src/races/prefix.ts";

test.describe.configure({ timeout: 600_000 });

test("P6-TW-RACE-001: two PATCH of one company name end on one of the two values, no 5xx", async () => {
  const base = twentyBaseUrlFromEnv();
  const prefix = p6RunPrefix();
  const session = await signInWorkspace({
    baseUrl: base,
    email: twentyEmailFromEnv(),
    password: twentyPasswordFromEnv(),
    workspaceName: twentyWorkspaceNameFromEnv(),
  });
  const histogram = await runTwentyTrials({
    caseId: "P6-TW-RACE-001",
    title: "two PATCH of one company name",
    concurrency: 2,
    burst: async (trial) => {
      const id = (await createCompany(
        base,
        session.authorizationHeader,
        companyName(prefix, trial, "rec"),
      ).then((r) => r.id))!;
      const A = `${prefix}-${trial}-A`,
        B = `${prefix}-${trial}-B`;
      // Fire both PATCH at once (fireTogether in the real code; Promise.all in this skeleton).
      const [ra, rb] = await Promise.all([
        patchCompany(base, session.authorizationHeader, id, { name: A }),
        patchCompany(base, session.authorizationHeader, id, { name: B }),
      ]);
      const final = (await restCall(base, session.authorizationHeader, "GET", `/companies/${id}`))
        .json as any;
      return {
        requests: [ra, rb].map((r, index) => ({
          index,
          status: r.status,
          bodySummary: "",
          startedAtMs: 0,
          endedAtMs: 0,
        })),
        oracle: { finalName: final?.data?.company?.name ?? null, A, B, id },
      };
    },
    check: (oracle, requests) => {
      assertNo5xx((requests as Array<{ status: number }>).map((r) => r.status));
      assertNameIsOneOf(oracle.finalName as string | null, [
        oracle.A as string,
        oracle.B as string,
      ]);
    },
  });
  expect(histogram.invariantViolations, "P6-TW-RACE-001 violations").toEqual([]);
});
```

(The skeleton drops `runTwentyTrials`' return details for brevity. The `id` and the names are real: §3.3.)

### 6.9 `tests/twenty/races/tw-race-005-disjoint-fields.spec.ts` (NEW, step 7)

Same shape as §6.8. `burst` fires `patchCompany(... { name: X })` and `patchCompany(... { employees: N })` together and reads the record back; `check` calls `assertBothKept(got, want)` and `assertNo5xx`. Expected: 8 of 8 kept (§3.4).

### 6.10 `tests/twenty/races/tw-race-004-reset-token.spec.ts` (NEW, step 8)

```ts
// Expected to FAIL on the probe's evidence (§3.7). The assertion stays strict: no test.fail() until the owner decides (§12 Q1).
test("P6-TW-RACE-004: N=10 parallel redemptions of one reset token: exactly one success", async () => {
  const base = twentyBaseUrlFromEnv();
  const pool = createReadOnlyPool(twentyDatabaseUrlFromEnv());
  const prefix = p6RunPrefix();
  const histogram = await runTwentyTrials({
    caseId: "P6-TW-RACE-004",
    title: "reset token: N parallel redemptions",
    concurrency: 10,
    burst: async (trial) => {
      const addr = throwawayAddress(prefix, trial);
      const member = await createMember(base, addr); // sendInvitation + waitForMessage + signUpFromInvite (§6.5)
      await requestPasswordReset(base, addr, workspaceId); // one request per email (D7)
      const mail = await waitForMessage({ mailpitUrl, address: addr, subject: /reset/i });
      const token = resetTokenFrom(mail)!;
      const before = await passwordHashMd5(pool, addr);
      const fired = await fireTogether(10, () =>
        redeemResetToken(base, token, freshPassword()).then((r) => ({
          status: r.status,
          body: r.text,
        })),
      );
      const successes = fired.requests.filter(
        (r) => r.status === 200 && r.bodySummary.includes('"success":true'),
      ).length;
      return {
        requests: fired.requests,
        oracle: {
          successes,
          hashChanged: before !== (await passwordHashMd5(pool, addr)),
          revoked: (await resetTokenCounts(pool, addr)).revoked,
        },
      };
    },
    check: (oracle) => assertExactlyOne(oracle.successes as number, "P6-TW-RACE-004"),
  });
  expect(histogram.invariantViolations).toEqual([]);
});
```

(The build fills `createMember` and `workspaceId` from §6.5 and the `core.workspace` lookup. The `successes` count reads the response body, which the skeleton reads from `bodySummary`; the build reads the parsed body.)

### 6.11 `tests/twenty/races/tw-race-006-reset-replay.spec.ts` (NEW, step 8)

Same member and token setup as §6.10, then one redemption (`expect` 200 with `success: true`), then one replay. Oracle: `assertReplayRefused(replayBody)`, the password hash after the replay equals the hash after the first redemption (`passwordHashMd5`), and `resetTokenCounts(...).revoked` is 1. Expected: pass (§3.6).

### 6.12 `tests/twenty/races/tw-race-002-kanban-position.spec.ts` (NEW, step 9)

Same shape as §6.8 with `createTask` and `patchTaskPosition(base, auth, id, 10)` ‖ `patchTaskPosition(base, auth, id, 20)`; oracle `final` from `GET /rest/tasks/{id}`; `check`: final ∈ {10, 20} and no 5xx. Expected: pass (§3.8). Cleanup: `destroyTask` (not probed, §12 Q6).

### 6.13 `tests/twenty/races/tw-race-003-merge.spec.ts` (NEW, step 9)

Per trial: two companies (`companyName` with sides `A` and `B`), `fireTogether(2, () => mergeCompanies(base, auth, [a, b]))`, the survivor ids from the bodies (`data.mergeCompanies.id`), and `companyLiveRows(pool, schema, [a, b])`. `check`: `assertOneSurvivor(liveRows, survivorIds)` and no 5xx. Expected: pass (§3.8).

## 7. Build steps (one commit each)

Every step: `npm run check` must exit 0, and `npm run test:unit` must print the count in the table. If the count differs, stop and explain
(rule 11). The unit count starts at **431** (§3.0 row 19).

| Step | Commit subject (Conventional Commits, lowercase)                       | Files (`git add` paths)                                                                                                                  | Unit count after |
| ---- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| 0    | `docs(plans): add the phase 2 task 7 twenty-races plan` (this plan)    | `docs/plans/2026-10-23-p6-phase2-task7-twenty-races.md`                                                                                  | 431              |
| 1    | `feat(twenty): add the Mailpit URL rule`                               | `src/twenty/env.ts`, `tests/unit/twenty-env.test.ts`                                                                                     | 432              |
| 2    | `feat(twenty): add the Mailpit reader for reset and invite mail`       | `src/twenty/mailpit.ts`, `tests/unit/twenty-mailpit.test.ts`                                                                             | 437              |
| 3    | `feat(twenty): add race payload helpers`                               | `src/twenty/payloads.ts`, `tests/unit/twenty-payloads.test.ts`                                                                           | 440              |
| 4    | `feat(twenty): add the race invariants`                                | `src/twenty/invariants.ts`, `tests/unit/twenty-invariants.test.ts`                                                                       | 446              |
| 5    | `feat(twenty): add the REST and GraphQL race calls`                    | `src/twenty/api.ts`, `tests/unit/twenty-api.test.ts`                                                                                     | 449              |
| 6    | `feat(twenty): add the reset, merge and member read queries`           | `src/twenty/oracle.ts`, `tests/unit/twenty-oracle.test.ts`                                                                               | 450              |
| 7    | `test(twenty): add the name, disjoint-field races and the case runner` | `src/twenty/run-case.ts`, `tests/twenty/races/tw-race-001-lost-update.spec.ts`, `tests/twenty/races/tw-race-005-disjoint-fields.spec.ts` | 450              |
| 8    | `test(twenty): add the reset-token races` (`-004` strict, see §12 Q1)  | `tests/twenty/races/tw-race-004-reset-token.spec.ts`, `tests/twenty/races/tw-race-006-reset-replay.spec.ts`                              | 450              |
| 9    | `test(twenty): add the kanban position and merge races`                | `tests/twenty/races/tw-race-002-kanban-position.spec.ts`, `tests/twenty/races/tw-race-003-merge.spec.ts`                                 | 450              |
| 10   | `ci(perf): add the twenty race timeout and reset-link token scan`      | `.github/workflows/perf.yml` (**stop for owner review first, §0**)                                                                       | 450              |
| 11   | `docs(readme): describe the twenty races`                              | `README.md`, `docs/BACKLOG.md`                                                                                                           | 450              |

Commands for every step (exact, from the repo root):

```bash
export PATH="/usr/local/bin:$PATH"            # Node 22.23 first (AGENTS.md)
git add <files from the table>                 # never git add -A or git add .
git commit -m "<subject from the table>"       # no attribution lines (repo rule A3)
npm run test:unit                              # expected: "# pass <count in the table>" and "# fail 0"
npm run check                                  # expected: exit 0; prints the unit count above
```

Expected output of `npm run test:unit` after step 1: `# tests 432`, `# pass 432`, `# fail 0`. Each later step follows the table.

Playwright specs need the stack (steps 7 to 9, and the CI run): `npm run up:twenty && npm run seed:twenty && RACE_TRIALS=5 npm run race:twenty`,
then `npm run down:twenty`. Expected with the probe's evidence: step 7 passes (`-001`, `-005`); step 8 **`-004` fails** (§3.7), `-006` passes;
step 9 passes. The build stops at step 8 for the decision in §12 Q1 before pushing a red step. Playwright tests do not enter the unit count.

Unit count after each step is what this table says: 432, 437, 440, 446, 449, 450, then unchanged.

## 8. CI changes and the time budget at full trial count

### 8.1 What changes (owner review, §0)

1. `twenty-smoke` race step (`Twenty self-test (twenty-race)`): `timeout-minutes` from 5 to 9 (the step now runs four more specs).
   `RACE_TRIALS` unchanged (5 on PRs, 50 otherwise, roadmap D6).
2. Token scan (`Check Twenty artefacts for tokens`): the value patterns gain two reset-link patterns (§8.2).
3. Job `timeout-minutes` stays 20 in this plan; the budget (§8.3) shows it is short of the 10-minute margin, so the owner decides (Q2).
4. No change to other jobs, the pins, the harness, or `scripts/evidence-token-scan.mjs`.

### 8.2 Token-scan change (skeleton)

In `.github/workflows/perf.yml`, the `value` variable of step `Check Twenty artefacts for tokens` (current line 1421) gains two alternatives:

```bash
value='Bearer [A-Za-z0-9._~+/=-]{16,}|eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}|reset-password/[0-9a-f]{64}|passwordResetToken"?[:=] ?"?[0-9a-f]{64}'
```

Why not a bare 64-hex pattern: the Twenty image digest (`sha256:01fb6d…`, Task 6 §3.9) is 64 hex, so a bare pattern would flag the logs
on every run. The two patterns above name the reset link and the token field.

### 8.3 Time budget at full trial count (`RACE_TRIALS=50`, worst case, estimates unless marked)

| Part                                            | Time (worst)           | Source                                                                                                               |
| ----------------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Checkout, setup-node, `npm ci`, setup-k6        | 1.5 min                | Task 6 §8.3 estimate                                                                                                 |
| Bootstrap clone                                 | 0.25 min               | Task 6 measured 15 s                                                                                                 |
| Pull (retry, 3 tries)                           | 0.57 min               | Task 6 measured 34 s; the step cap is 14 min (not in the sum, Task 6 §8.4)                                           |
| First boot                                      | 3.05 min               | Task 6 measured 183 s (worst)                                                                                        |
| Seed                                            | 1.28 min               | Task 6 measured 77 s (worst); this probe 80 s                                                                        |
| Self-test (existing, 50 trials)                 | 1.0 min                | Task 6 estimate                                                                                                      |
| `-001`, `-002`, `-003`, `-005` (50 trials each) | 0.5 min each = 2.0 min | **estimate** (probe: one trial of two PATCH plus a GET is tens of ms; the warm-up and the rerun runner add overhead) |
| `-004` (50 trials, one sign-up each)            | 1.5 min                | **estimate**: one `signUpInWorkspace` at 971 ms (probe) dominates, plus mail polls and 10 parallel redemptions       |
| `-006` (50 trials, one sign-up each)            | 1.5 min                | **estimate**, same as `-004`                                                                                         |
| k6 smoke                                        | 0.5 min                | Task 6 estimate                                                                                                      |
| Token scan, job summary                         | 0.5 min                | Task 6 estimate                                                                                                      |
| Capture logs, artefact uploads (2)              | 0.3 min                | Task 6 estimates                                                                                                     |
| Down with volumes                               | 0.05 min               | Task 6 measured 3 s (worst); this probe 2 s                                                                          |
| **Worst case, measured-plus-estimate**          | **14.0 min**           | sum of the rows above                                                                                                |

**Margin: 20 − 14.0 = 6.0 min.** That is below the 10-minute margin the owner set (Task 6 §8.3, O5). The timeout is **not** raised here
(the owner's rule: never raised to fit). Options for the owner (Q2):

- (a) **Job timeout 24 minutes** (proposed): margin 10.0 min. The first CI run measures the real rows and the owner can lower it.
- (b) Move the four new races to their own job: each job pays the boot (about 6.1 min) again, so the sum grows; not proposed.
- (c) Cut the full count for `-004` and `-006` below 50: a change to roadmap D6, not proposed.

**Step caps are not the job time** (Task 6 §8.3). The race step at 9 minutes is the cap for 50 trials (estimate 5.0 min, so the cap has margin).
On PRs (5 trials) the race step is about 0.5 min.

### 8.4 Step timeouts (new or changed rows only)

| Step                              | timeout-minutes | Reason                                                            |
| --------------------------------- | --------------- | ----------------------------------------------------------------- |
| Twenty self-test (twenty-race)    | 9               | 5.0 min estimate at 50 trials; cap leaves 4 min for a slow runner |
| Check Twenty artefacts for tokens | 3 (unchanged)   | grep only; the two new patterns add no real cost                  |

## 9. Test strategy (what each layer proves)

- **Unit (`tests/unit/twenty-*.test.ts`):** the Mailpit parser and poller, the payload helpers, each invariant, the REST and GraphQL call
  wrappers (with fake `fetch`), the oracle SQL guard and the schema check, and the Mailpit URL rule. These run on every `npm run check`.
- **Playwright races (`tests/twenty/races/*.spec.ts`):** the four required cases plus two optional ones, against the live stack. They run on
  `main`, nightly and dispatch with 50 trials; PRs use 5 (roadmap D6).
- **Not covered:** a 429 on the reset request (the rate limit is source-only, A10); the kanban UI's own position values (§12 R7); the `signUp`
  route; a real mail delay on a hosted runner (polled with a 15 s cap).

## 10. Test strategy notes (what this does not prove)

- The races prove behaviour on one stack with one Node process. They do not measure contention on a multi-core runner.
- A PASS of `-001`, `-005`, `-006` (and of `-002`, `-003`) is a characterization of the observed behaviour, not a proof of absence of a bug.
- `-004` is a SUSPECTED finding with five trials of evidence in the probe. Only repeated full-count CI runs can turn it into PRODUCT BUG (rule 13).

## 11. Risks

| #   | Risk                                                                           | Likelihood | Mitigation in this plan                                                            |
| --- | ------------------------------------------------------------------------------ | ---------- | ---------------------------------------------------------------------------------- |
| R1  | `-004` red in CI until the owner decides (SUSPECTED, 10 of 10 in probe)        | **High**   | Strict assertion kept; §12 Q1; no `test.fail()` without a label                    |
| R2  | Job timeout short at full count (margin 6.0 min against 10 required)           | High       | §8.3 options; the owner decides (Q2)                                               |
| R3  | Mail delay on a hosted runner (invite and reset mail)                          | Medium     | Poll every 250 ms for 15 s; a miss is TEST BUG, never a pass (D9)                  |
| R4  | Reset token leaks into a container log or a histogram                          | Low        | D8: no token in histograms; scan pattern for reset links (§8.2)                    |
| R5  | Throwaway members accumulate on a local stack                                  | Medium     | Prefix on every address; the CI stack is removed with volumes; Q5                  |
| R6  | Captcha enabled in a future overlay blocks sign-up and reset                   | Low        | A11 holds for this pin; a 4xx from a guard would be a setup error (TEST BUG)       |
| R7  | The kanban UI sends position values the API race does not model                | Medium     | §3.8 limit; the spec is named "position", the claim is API-level only              |
| R8  | `destroyTask` does not exist; task rows stay after a run                       | Medium     | Q6: verified in step 9 before use; if absent, rows stay and the leak check says so |
| R9  | P6-OBS-TW-001 hangs the Node client (30 s per request, `headersTimeout` 300 s) | Known      | No malformed bodies in the races; the probe's curl timeouts are 30 s               |

## 12. Contradictions with the roadmap, proposed extras, open questions

### 12.1 Contradictions with the roadmap

- **C1 Throwaway user path.** The roadmap lists "signup, invite, or the seed's other users". Probed: `signUp` alone gives no reset mail (source: a
  workspace membership is required; probe: a non-member reset is silently skipped). **Invite is the path** (D2). The seed's other users are
  rejected (D3).
- **C2 "Done when" for `-004`.** The roadmap says "pass or record a proven bug with `test.fail()`". The probe's evidence is SUSPECTED, not
  PROVEN (rule 13), and the owner's instruction for this task is no `test.fail()`. So `-004` cannot be closed by this task; it needs the owner's
  decision (Q1).
- **C3 Step cap.** The roadmap says nothing about the step cap; the existing race step cap is 5 minutes and the 50-trial race is estimated at
  5.0 minutes. The cap changes to 9 (§8.4).
- **C4 Probe item "PATCH writes only that field" (roadmap §Task 7 probe list).** Confirmed (§3.2).
- **C5 `-006` replay wording.** The roadmap says "refused with a clean 4xx or GraphQL error". Probed: GraphQL error with HTTP 200 (§3.6). The oracle
  accepts a GraphQL error and checks for `errors` (not for the status), so the plan matches the probe, not the 4xx wording.
- **C6 `-002` and `-003` scope.** Roadmap: "only if the probe shows each is cheap". Probed: both cheap (§3.8). Included (D1), not "Later".

### 12.2 Proposed extras (out of scope until the owner accepts them)

- **X1** A reset-request flood test: a fourth request for one email inside 15 minutes is refused (source `auth.resolver.ts` lines 126–127; not probed).
- **X2** The same merge race for people (`mergePeople`, the same argument shape as `mergeCompanies`).
- **X3** Pin the reset-token scan as a shared pattern in `scripts/evidence-token-scan.mjs` (X6 of Task 6).
- **X4** A separate `twenty-races` CI job (only if §8.3 option (b) is chosen).

### 12.3 Open questions (each with the proposed answer; none is answered by the owner yet, rule 20 (e))

- **Q1 How does CI show `P6-TW-RACE-004` while it is SUSPECTED?** Options: (a) keep the strict assertion on PRs and main, so the step is red until the owner labels the finding; (b) `test.fail()` now, which the owner's instruction forbids; (c) keep the assertion, record an `issue` annotation with the ID and status SUSPECTED (Task 6 D14), and let the first full-count run decide. **Proposed: (c)**, with the strict assertion, so the failing step shows the trial data and no test is weakened. The owner decides whether a red step may stay red on `main` until the label. Until then the build stops at step 8.
- **Q2 Job timeout.** **Proposed: 24 minutes** (margin 10.0 min, §8.3 option (a)). The owner decides.
- **Q3 Race step cap.** **Proposed: 9 minutes** (§8.4). Not a timeout raise to fit: it is the cap for the step.
- **Q4 Keep `-002` and `-003` in this task?** **Proposed: yes** (cheap, §3.8). If the owner says no, the two specs move to "Later" with the probe reason.
- **Q5 Throwaway members in a local stack.** **Proposed:** leave them (no delete API probed); the leak check counts members by email prefix and reports the count, not an assertion.
- **Q6 `destroyTask`.** **Proposed:** verify in step 9 with one call; if it is absent, leave the task rows (prefixed) and say so in the histogram's notes.
- **Q7 Token scan pattern.** **Proposed:** the two patterns in §8.2; a bare 64-hex pattern is rejected (digests).
- **Q8 Where the probe scripts live.** They stay outside the repo (scratchpad) as the owner asked; the plan cites every number. The repo keeps no probe code.

### 12.4 Risks the owner should weigh (in addition to §11)

- R1 and R2 are the two that change what the owner decides. Everything else is handled in the build.

## 13. Self-check (rule 20)

- **(a) Roadmap "Done when".** `-001`, `-004`, `-005`, `-006`: **`-001` and `-005` and `-006` probed as passing; `-004` probed as failing (SUSPECTED), so the "Done when" is a gap until Q1**. `-002`, `-003`: **landed in step 9 (D1)** or listed under "Later" with the reason if Q4 says no. Histograms uploaded after the token scan: unchanged step order (existing). Leak check by prefix: D7 and Q5. `npm run check` green: §3.0 row 19 (431, exit 0). CI on `main`: pending (the build). The rest of the "Done when" list is the build's job.
- **(b) Names and paths grep-checked.** Existing and confirmed: `src/twenty/auth.ts` (`signInWorkspace`, `currentUserEmail`, `originFor`, `pickWorkspace`, `graphqlData`), `src/twenty/env.ts` (`twentyBaseUrlFromEnv`, `twentyDatabaseUrlFromEnv`, `twentyEmailFromEnv`, `twentyPasswordFromEnv`, `twentyWorkspaceNameFromEnv`), `src/twenty/oracle.ts` (`workspaceSchemaName`, `resolveWorkspaceSchema`, `readOnlyWriteSqlstate`), `src/oracles/pg.ts` (`createReadOnlyPool`, `selectRows`, `waitForStable`, `closePool`, `assertSelectOnly`), `src/races/fire-together.ts` (`fireTogether`, `summariseBody`), `src/races/run-trials.ts` (`runTrials`), `src/races/trial-record.ts` (`recordTrial`), `src/races/rerun-on-spread.ts` (`createRerunRunner`, `spreadPolicyFromEnv`), `src/races/histogram.ts` (`createHistogram`, `writeHistogram`), `src/races/env.ts` (`raceTrialsFromEnv`), `src/races/prefix.ts` (`p6RunPrefix`), `src/races/types.ts` (`RaceHistogram`, `RaceAttemptResult`, `RaceRequestResult`, `RaceProduct` includes `"twenty"`), `tests/twenty/races/twenty-self-test.spec.ts`, `playwright.config.ts` (`twenty-race` project), `.github/workflows/perf.yml` (`twenty-smoke`, the race step at lines 1391–1402, the token scan at lines 1414 onward), `docs/BACKLOG.md`. **NEW** (marked in §5 and §6): `src/twenty/mailpit.ts`, `src/twenty/api.ts`, `src/twenty/payloads.ts`, `src/twenty/invariants.ts`, `src/twenty/run-case.ts`, the six specs, the new unit files, `twentyMailpitUrlFromEnv`, `passwordHashMd5`, `resetTokenCounts`, `companyLiveRows`. Fork names: `updatePasswordViaResetToken`, `validatePasswordResetToken`, `emailPasswordResetLink`, `signUpInWorkspace`, `sendInvitations`, `mergeCompanies`, `destroyCompany`, `deleteCompany`, `updateCompany`, `updateTask` (the update mutation name in the probe's REST response).
- **(c) CI estimate.** §8.3: worst 14.0 min against 20 min, margin 6.0 min, below the owner's 10 min. Decision in Q2. Values match across §3.0, §8.3 and §8.4 (the race rows are the same numbers).
- **(d) Skeletons and commands.** Every new function has a skeleton (§6.1 to §6.13); every build step has `git add` paths, the commit subject, the commands and the expected output (§7). The `as any` in §6.5 is marked for the build to type.
- **(e) Owner answers.** Only the owner's instructions of this session are used: the stops, the no-`test.fail()` and no-label rules, the BACKLOG status not changed, the pull-retry and the Task 6 conventions that the roadmap carries. **No answer to Q1 to Q8 is recorded**; each is a proposal.

## 14. Closeout notes (fill in before the PR merges)

- **Merge SHA:** _pending_ (the build PR; no PR for this plan).
- **CI runs:** _pending_. The plan commit does not run the Twenty job on `main`; the build's first CI run is on its PR.
- **Probe findings (not labels):**
  - `P6-OBS-TW-001` reproduced again: 12 of 12 hangs for empty and `{}` bodies on both endpoints, 3 runs each; `{"foo":1}` and valid bodies answer in under 15 ms (§3.9). Proposed outcome: reproduced. Owner decides.
  - SUSPECTED: `P6-TW-RACE-004` shows more than one success on parallel reset-token redemption, 50 of 50 accepted in 5 trials (§3.7). Owner decides how CI shows it (Q1).
  - The race pair `-001` and `-005` and the optional `-002`, `-003` show no bug in 8 or 5 trials each (§3.3, §3.4, §3.8).
  - REST `DELETE` removes the company row (two runs); GraphQL `deleteCompany` soft-deletes; `destroyCompany` removes the row (§3.5). The plan cleans up with `destroyCompany`.
- **Deviations from the roadmap:** the throwaway member comes from the invitation flow (C1); `-002` and `-003` are included (C6); the races use REST PATCH (D6).
- **Deviations from the plan's own process:**
  - The first probe run was invalid (helper sent POST for PATCH and a wrong return field in `signUp`); its rows are discarded and the run is kept on disk (§3.0 row 5).
  - Two further probe runs failed on a wrong endpoint (`sendInvitations` on `/graphql`, should be `/metadata`) and a wrong mail filter. Both fixed; each run is in §3.0.
  - The first `docker logs` capture (fractional-second timestamps) returned 0 lines; re-captured with whole seconds (§3.9, D12).
  - The plan commit goes to two refs (`feat/…` and `plan/…`), as Task 6 did (rule B10).
- **Environment note.** The session's system instructions name the branch `claude/awesome-noether-tu22g0` for development. The owner's instruction and repo rule A1 require `feat/2026-10-23-p6-twenty-races`. The feature branch is used; the `claude/` branch is not pushed to.
- **Rule slips:** none recorded. The stop rule is applied (§0). No `test.fail()`, no product label, no BACKLOG status change, no probe data in the repo.
