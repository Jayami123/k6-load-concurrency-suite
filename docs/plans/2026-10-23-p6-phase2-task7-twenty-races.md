# P6 Phase 2 Task 7: Twenty races (build plan)

Branch `feat/2026-10-23-p6-twenty-races` from `origin/main` `9b38d4f`. The plan is the first commit on that branch and is also on
`plan/2026-10-23-p6-twenty-races` (rule B10). No PR for the plan. Roadmap: [2026-10-22-p6-phase2-roadmap.md](2026-10-22-p6-phase2-roadmap.md)
§Task 7. Previous task's plan: [2026-10-23-p6-phase2-task6-twenty-stack.md](2026-10-23-p6-phase2-task6-twenty-stack.md).

Probe date: 2026-10-23 (cloud VM, Docker 29.9.2, Node 22.23.3, 4 vCPU, 16 GB). Probe scripts are outside the repo, in
`/tmp/claude-0/-home-user-k6-load-concurrency-suite/e4242cd7-a280-5705-8f36-d93a8b862529/scratchpad/probe/` (`probe7.mjs` is the
final version, `probe7-run1-INVALID.mjs` is the first run that the helper bug invalidated, `probe2.mjs` the optional cases,
`malformed.sh` the P6-OBS-TW-001 repro; outputs `*.out` and `*.json` next to them, and `exit-codes.txt` for every exit code).

## 0. Status

Version 2 of this plan (2026-10-23), after the owner's decisions on version 1 (d82d3eb). The build follows §7 on the feature branch.

### 0.1 Owner decisions applied in this version

- **Labels.** `P6-TW-RACE-004` is **PRODUCT BUG** (50 of 50 parallel redemptions succeeded, §3.7). The spec runs all trials, asserts the
  guards (setup, overlap), then calls `test.fail()` and asserts exactly one. `P6-OBS-TW-001` is **PRODUCT BUG** (§3.9); `docs/BACKLOG.md` is
  updated with the evidence and a follow-up task. No test is added for P6-OBS-TW-001 in this task (it is not a race).
- **CI.** `twenty-smoke` is unchanged (smoke and self-test only). A new job `twenty-races` runs the race specs (§8). Its timeout comes from
  the worst-case budget in §8.3 (pull counted at its 6-minute cap, not the measured pull time). Options (a) raise the smoke timeout and (c)
  cut the full count are removed.
- **Q4** keep `-002` and `-003`. **Q5** throwaway members stay; the run reports their count by prefix. **Q6** `destroyTask` as proposed,
  checked in step 9. **Q7** the scan adds the reset-link pattern and the invite-link pattern (§8.2). **Q8** probe scripts stay outside the
  repo (session scratchpad, not committed).
- **Spec location.** The new specs live in `tests/twenty/tw-races/` with their own Playwright project `twenty-tw-races` (script
  `race:twenty-tw`). Reason: `race:twenty` runs `tests/twenty/races/` for the smoke job, so placing the races there would add them to
  `twenty-smoke`, which the owner wants unchanged. This is a deviation from the roadmap's file list (§12.1 C7).

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
  - Six specs under `tests/twenty/tw-races/` (NEW) with Playwright project `twenty-tw-races`, matching unit tests under `tests/unit/` (NEW).
  - `.github/workflows/perf.yml` (CHANGED: new job `twenty-races`; `twenty-smoke` is not touched), `README.md`
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
| A8  | Ten parallel redemptions of one token: exactly one succeeds (the roadmap's expectation)                     | **No**: 10 of 10 succeed in 5 of 5 trials (§3.7). Owner label: PRODUCT BUG                                                             |
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
refused, so the bug is a race, not a missing check. **Owner label: PRODUCT BUG** (2026-10-23 owner decision). The spec asserts the guards, then `test.fail()`, then exactly one (§6.10).

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

**Owner label: PRODUCT BUG** (2026-10-23 owner decision). The evidence is this run plus Task 6 §3.5. No `test.fail()` in this task
(it is not a race). `docs/BACKLOG.md` is updated from SUSPECTED to PRODUCT BUG with this evidence, and a follow-up task is listed there (§12.2 X7).

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
- **D14 Expected verdicts.** `-001`: final ∈ {A, B}, no 5xx. `-002`: final ∈ {10, 20}, no 5xx. `-003`: both 2xx, one survivor id, one live
  row. `-005`: both values kept. `-006`: the replay is refused, the hash is unchanged by the replay, the token stays revoked. **`-004` is
  PRODUCT BUG** (owner, 2026-10-23): its spec asserts the guards, then `test.fail()`, then exactly one success per trial (§6.10). If a fix
  lands, the test turns red as "unexpectedly passed", which is intended.
- **D15 Overlap guard on every parallel case.** Every burst uses `fireTogether`; a trial counts only when the requests overlapped (latest start
  before earliest end). Reason: a trial that did not overlap cannot show a race, so a pass would be a false pass. Applied to all parallel cases,
  not only `-004` (the owner's rule for `-004`, extended).
- **D16 Leak check.** After each case, companies whose name starts with the run prefix must number 0 (destroyed by the cleanup in each
  burst). Throwaway members are counted by prefix and reported (Q5), not asserted.

## 5. Files (exact paths)

| Path                                                        | Status  | Step | Notes                                                                                                  |
| ----------------------------------------------------------- | ------- | ---- | ------------------------------------------------------------------------------------------------------ |
| `src/twenty/env.ts`                                         | CHANGED | 1    | `twentyMailpitUrlFromEnv`                                                                              |
| `tests/unit/twenty-env.test.ts`                             | CHANGED | 1    | +1 test (Mailpit URL rule)                                                                             |
| `src/twenty/mailpit.ts`                                     | NEW     | 2    | `latestMessageFor`, `resetTokenFrom`, `inviteFrom`, `waitForMessage`                                   |
| `tests/unit/twenty-mailpit.test.ts`                         | NEW     | 2    | 5 tests                                                                                                |
| `src/twenty/payloads.ts`                                    | NEW     | 3    | names, addresses, passwords (in memory)                                                                |
| `tests/unit/twenty-payloads.test.ts`                        | NEW     | 3    | 3 tests                                                                                                |
| `src/twenty/invariants.ts`                                  | NEW     | 4    | one `assert…` per oracle rule, and `overlapped`                                                        |
| `tests/unit/twenty-invariants.test.ts`                      | NEW     | 4    | 7 tests                                                                                                |
| `src/twenty/api.ts`                                         | NEW     | 5    | REST PATCH/POST/GET/DELETE, GraphQL calls, invitation, reset                                           |
| `tests/unit/twenty-api.test.ts`                             | NEW     | 5    | 3 tests (fake fetch)                                                                                   |
| `src/twenty/oracle.ts`                                      | CHANGED | 6    | `passwordHashMd5`, `resetTokenCounts`, `companyLiveRows`, `companyRowsByPrefix`, `memberCountByPrefix` |
| `tests/unit/twenty-oracle.test.ts`                          | CHANGED | 6    | +1 test (SELECT-only and schema guard)                                                                 |
| `src/twenty/member.ts`                                      | NEW     | 7    | `createInvitedMember`, `requestResetToken` (setup, TEST BUG on failure)                                |
| `src/twenty/run-case.ts`                                    | NEW     | 7    | `setupTwentyContext`, `timed`, `runTwentyTrials`                                                       |
| `playwright.config.ts`                                      | CHANGED | 7    | project `twenty-tw-races`, testDir `tests/twenty/tw-races`                                             |
| `package.json`                                              | CHANGED | 7    | script `race:twenty-tw`                                                                                |
| `tests/twenty/tw-races/tw-race-001-lost-update.spec.ts`     | NEW     | 7    | §6.9                                                                                                   |
| `tests/twenty/tw-races/tw-race-005-disjoint-fields.spec.ts` | NEW     | 7    | §6.9                                                                                                   |
| `tests/twenty/tw-races/tw-race-004-reset-token.spec.ts`     | NEW     | 8    | §6.10 (PRODUCT BUG)                                                                                    |
| `tests/twenty/tw-races/tw-race-006-reset-replay.spec.ts`    | NEW     | 8    | §6.11                                                                                                  |
| `tests/twenty/tw-races/tw-race-002-kanban-position.spec.ts` | NEW     | 9    | §6.12                                                                                                  |
| `tests/twenty/tw-races/tw-race-003-merge.spec.ts`           | NEW     | 9    | §6.13                                                                                                  |
| `.github/workflows/perf.yml`                                | CHANGED | 10   | new job `twenty-races` (§8); `twenty-smoke` untouched                                                  |
| `README.md`                                                 | CHANGED | 11   | "Twenty races" section, no timing claims                                                               |
| `docs/BACKLOG.md`                                           | CHANGED | 11   | P6-OBS-TW-001 to PRODUCT BUG; follow-up task (§12.2 X7)                                                |

Unchanged: `src/races/*` (the shared race code; `dispatchSpreadMs`, `fireTogether`, `recordTrial`, `createRerunRunner` are used as they are),
`src/twenty/auth.ts`, `scripts/*`, `scripts/ci/compose-pull.sh` (used as it is), `tests/twenty/races/` (the smoke self-test), the harness pin.

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

### 6.6a Additions to §6.4 and §6.6 (NEW functions, step 4 and step 6)

```ts
// src/twenty/invariants.ts (step 4): pure; the spec decides what to do with the answer.
export function overlapped(
  requests: Array<Pick<RaceRequestResult, "startedAtMs" | "endedAtMs">>,
): boolean {
  if (requests.length < 2) return false;
  return (
    Math.max(...requests.map((r) => r.startedAtMs)) < Math.min(...requests.map((r) => r.endedAtMs))
  );
}
```

```ts
// src/twenty/oracle.ts (step 6): each query through selectRows (SELECT only); the schema is checked first.
export async function companyRowsByPrefix(
  pool: pg.Pool,
  schema: string,
  prefix: string,
): Promise<number> {
  if (!SCHEMA_RE.test(schema)) throw new Error("TEST BUG: schema name is not a workspace schema");
  const rows = await selectRows<{ n: string }>(
    pool,
    `SELECT count(*) AS n FROM "${schema}".company WHERE name LIKE $1`,
    [`${prefix}%`],
  );
  return Number(rows[0]?.n ?? 0);
}
export async function memberCountByPrefix(pool: pg.Pool, prefix: string): Promise<number> {
  const rows = await selectRows<{ n: string }>(
    pool,
    `SELECT count(*) AS n FROM core."user" WHERE email LIKE $1`,
    [`${prefix.toLowerCase()}%`],
  );
  return Number(rows[0]?.n ?? 0);
}
```

Test (step 6, the one new test): the three interpolated SQL strings (`companyLiveRows`, `companyRowsByPrefix`, and a schema that is not `workspace_<id>`)
throw `TEST BUG` before any query; the SQL texts pass `assertSelectOnly`.

### 6.7 `src/twenty/member.ts` (NEW, step 7; no unit test: covered by the specs)

```ts
export interface CaseContext {
  base: string;
  mailpitUrl: string;
  auth: string; // workspace bearer token (signInWorkspace)
  workspaceId: string;
  schema: string; // workspace_<base36>, resolved from core.workspace
  pool: pg.Pool; // read-only oracle pool
  prefix: string; // p6RunPrefix()
}

/** Invite a fresh address, read the invite mail, sign up through it. Every failure is a setup error (TEST BUG). */
export async function createInvitedMember(
  ctx: CaseContext,
  address: string,
): Promise<{ address: string; password: string }> {
  const inv = await sendInvitation(ctx.base, ctx.auth, address);
  if (inv.status !== 200 || inv.json?.errors)
    throw new Error(`TEST BUG: sendInvitations HTTP ${inv.status}`);
  const invite = inviteFrom(
    await waitForMessage({ mailpitUrl: ctx.mailpitUrl, address, subject: /join|invit/i }),
  );
  if (!invite) throw new Error("TEST BUG: no invite link in the invite mail");
  const password = freshPassword();
  const su = await signUpFromInvite(ctx.base, address, password, invite);
  if (su.status !== 200 || su.json?.errors)
    throw new Error(`TEST BUG: signUpInWorkspace HTTP ${su.status}`);
  return { address, password };
}

/** Request a reset for a member and return the 64-hex token from the reset mail. */
export async function requestResetToken(ctx: CaseContext, address: string): Promise<string> {
  const rq = await requestPasswordReset(ctx.base, address, ctx.workspaceId);
  if (rq.status !== 200 || rq.json?.errors)
    throw new Error(`TEST BUG: emailPasswordResetLink HTTP ${rq.status}`);
  const token = resetTokenFrom(
    await waitForMessage({ mailpitUrl: ctx.mailpitUrl, address, subject: /password/i }),
  );
  if (!token) throw new Error("TEST BUG: no reset token in the reset mail");
  return token; // in memory only; never logged, never in a histogram (D8)
}
```

Error messages carry the status only, never a body, a token or a password.

### 6.8 `src/twenty/run-case.ts` (NEW, step 7)

```ts
export async function setupTwentyContext(): Promise<CaseContext> {
  const base = twentyBaseUrlFromEnv();
  const pool = createReadOnlyPool(twentyDatabaseUrlFromEnv());
  const session = await signInWorkspace({
    baseUrl: base,
    email: twentyEmailFromEnv(),
    password: twentyPasswordFromEnv(),
    workspaceName: twentyWorkspaceNameFromEnv(),
  });
  const ws = await resolveWorkspaceSchema(pool, twentySubdomainFromEnv());
  return {
    base,
    mailpitUrl: twentyMailpitUrlFromEnv(),
    auth: session.authorizationHeader,
    workspaceId: ws.workspaceId,
    schema: ws.schema,
    pool,
    prefix: p6RunPrefix(),
  };
}

/** One request with its start and end time (sequential calls). Same fields as fireTogether records. */
export async function timed(
  index: number,
  fn: () => Promise<{ status: number; body: string }>,
): Promise<RaceRequestResult> {
  const startedAtMs = performance.now();
  try {
    const { status, body } = await fn();
    return {
      index,
      status,
      bodySummary: summariseBody(status, body),
      startedAtMs,
      endedAtMs: performance.now(),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      index,
      status: null,
      bodySummary: summariseBody(null, message),
      startedAtMs,
      endedAtMs: performance.now(),
      error: message,
    };
  }
}

/**
 * Warm-up, then N trials through the rerun runner (the self-test shape). `attempt` may throw: a setup error is a stub, and the
 * spec's first guard fails on it. `leakCheck` runs before the histogram is written; its values join the histogram oracle.
 */
export async function runTwentyTrials(opts: {
  caseId: string;
  title: string;
  concurrency: number;
  attempt: (
    trial: number,
  ) => Promise<{ requests: RaceRequestResult[]; oracle: Record<string, RaceOracleValue> }>;
  leakCheck?: () => Promise<Record<string, RaceOracleValue>>;
}): Promise<{
  histogram: RaceHistogram;
  trials: Array<{ trial: number; ok: boolean; value?: RaceAttemptResult; error?: string }>;
}> {
  const trials = raceTrialsFromEnv();
  const histogram = createHistogram({
    caseId: opts.caseId,
    title: opts.title,
    product: "twenty",
    concurrency: opts.concurrency,
    trials,
  });
  try {
    const burst = async (trial: number): Promise<RaceAttemptResult> => {
      const { requests, oracle } = await opts.attempt(trial);
      const record = recordTrial(
        trial,
        { requests, dispatchSpreadMs: dispatchSpreadMs(requests.map((r) => r.startedAtMs)) },
        () => {},
      );
      record.oracle = oracle;
      return record;
    };
    const runner = createRerunRunner(spreadPolicyFromEnv(), trials);
    await runner.warmup(() => burst(0));
    const results = await runTrials(trials, (trial) => runner.runTrial(trial, () => burst(trial)));
    runner.applyTo(histogram);
    if (opts.leakCheck) Object.assign(histogram.oracle, await opts.leakCheck());
    return { histogram, trials: results };
  } finally {
    await writeHistogram(histogram);
  }
}
```

Playwright project (step 7): in `playwright.config.ts` add `{ name: "twenty-tw-races", testDir: "tests/twenty/tw-races", retries: 0, use: { baseURL: twentyBaseUrlFromEnv() } }`;
in `package.json` add `"race:twenty-tw": "playwright test --project=twenty-tw-races"`.

### 6.9 Specs `-001` and `-005` (NEW, step 7): the common shape

Every spec: `setupTwentyContext()`; `runTwentyTrials`; then the guards (every trial ok, every burst overlapped, leak count 0); then the
per-trial oracle assertions. Skeleton for `-001` (`tests/twenty/tw-races/tw-race-001-lost-update.spec.ts`):

```ts
test("P6-TW-RACE-001: two PATCH of one company name end on one of the two values, no 5xx", async () => {
  const ctx = await setupTwentyContext();
  const { histogram, trials } = await runTwentyTrials({
    caseId: "P6-TW-RACE-001",
    title: "two PATCH of one company name",
    concurrency: 2,
    attempt: async (trial) => {
      const id = (await createCompany(ctx.base, ctx.auth, companyName(ctx.prefix, trial, "rec")))
        .id!;
      const A = companyName(ctx.prefix, trial, "A"),
        B = companyName(ctx.prefix, trial, "B");
      const fired = await fireTogether(2, async (i) => {
        const r = await patchCompany(ctx.base, ctx.auth, id, { name: i === 0 ? A : B });
        return { status: r.status, body: r.text };
      });
      const final = (await restCall(ctx.base, ctx.auth, "GET", `/companies/${id}`)).json as any;
      await destroyCompany(ctx.base, ctx.auth, id);
      return {
        requests: fired.requests,
        oracle: {
          final: final?.data?.company?.name ?? null,
          A,
          B,
          overlapped: overlapped(fired.requests),
        },
      };
    },
    leakCheck: async () => ({
      companyRowsLeft: await companyRowsByPrefix(ctx.pool, ctx.schema, ctx.prefix),
    }),
  });
  guards(trials, histogram); // every trial ok, every burst overlapped, companyRowsLeft === 0 (shared helper, see below)
  for (const t of trials) {
    const o = t.value!.oracle;
    assertNo5xx(t.value!.statuses);
    assertNameIsOneOf(o.final as string | null, [o.A as string, o.B as string]);
  }
});
```

`guards(trials, histogram)` is a helper in `run-case.ts`: `expect` that every trial is ok (message: the first trial error), every
`oracle.overlapped === true`, and `oracle.companyRowsLeft === 0`. The `-005` spec is the same with `fireTogether` of `name` and
`employees` PATCHes and `assertBothKept`; expected 8 of 8 kept (§3.4).

### 6.10 `tests/twenty/tw-races/tw-race-004-reset-token.spec.ts` (NEW, step 8): PRODUCT BUG

Trial: fresh member, reset token, sequential reads of the hash, then 10 parallel redemptions with `fireTogether`.

```ts
// P6-TW-RACE-004 is a PRODUCT BUG (owner label, 2026-10-23). The guards run first and are never inside test.fail().
test("P6-TW-RACE-004 PRODUCT BUG: N=10 parallel redemptions of one reset token must admit exactly one", async () => {
  const ctx = await setupTwentyContext();
  const { histogram, trials } = await runTwentyTrials({
    caseId: "P6-TW-RACE-004",
    title: "reset token: N parallel redemptions",
    concurrency: 10,
    attempt: async (trial) => {
      const addr = throwawayAddress(ctx.prefix, trial);
      const member = await createInvitedMember(ctx, addr); // setup (TEST BUG on failure)
      const token = await requestResetToken(ctx, addr); // setup
      const hashBefore = await passwordHashMd5(ctx.pool, addr); // setup: must be non-null
      if (hashBefore === null) throw new Error("TEST BUG: no password hash for the member");
      const success: boolean[] = [];
      const fired = await fireTogether(10, async (i) => {
        const r = await redeemResetToken(ctx.base, token, freshPassword());
        success[i] = r.json?.data?.updatePasswordViaResetToken?.success === true;
        return { status: r.status, body: r.text };
      });
      const hashAfter = await passwordHashMd5(ctx.pool, addr);
      const rc = await resetTokenCounts(ctx.pool, addr);
      return {
        requests: fired.requests,
        oracle: {
          successes: success.filter(Boolean).length,
          overlapped: overlapped(fired.requests),
          hashChanged: hashBefore !== hashAfter,
          revokedRows: rc.revoked,
          totalTokenRows: rc.total,
        },
      };
    },
    leakCheck: async () => ({
      companyRowsLeft: await companyRowsByPrefix(ctx.pool, ctx.schema, ctx.prefix),
      throwawayMembers: await memberCountByPrefix(ctx.pool, ctx.prefix),
    }),
  });

  // 1. Guards: setup, overlap, leak. A failure here is red, never a PRODUCT BUG pass.
  guards(trials, histogram);

  // 2. Label, then the strict assertion. test.fail() is called only after the guards pass.
  test.info().annotations.push({
    type: "issue",
    description:
      "P6-TW-RACE-004 PRODUCT BUG: one reset token is redeemed more than once under concurrency (check-then-act, no lock)",
  });
  test.fail();
  for (const t of trials) {
    expect(
      t.value!.oracle.successes,
      `trial ${t.trial}: successes of 10 parallel redemptions`,
    ).toBe(1);
  }
});
```

Behaviour: expected result on the probe's evidence is 10 successes in every trial, so the strict loop fails and the test is green as an
expected failure. If the product fixes the race, the loop passes and Playwright reports the test as unexpectedly passed (red), as the owner
wants. `throwawayMembers` is the count by prefix (Q5), reported not asserted.

### 6.11 `tests/twenty/tw-races/tw-race-006-reset-replay.spec.ts` (NEW, step 8)

Setup as in §6.10. Then `timed(0, redeem)` (success expected), `timed(1, redeem)` (replay). Oracle: `firstSuccess`, `replayRefused`
(from `assertReplayRefused` on the parsed body), `hashChangedByReplay` (hash after the replay ≠ hash after the first redemption), `revokedRows`
equal to `totalTokenRows`. `check`: `firstSuccess` true, `replayRefused` true, `hashChangedByReplay` false, `revokedRows === totalTokenRows`. Expected: pass (§3.6). No overlap guard (sequential by design).

### 6.12 `tests/twenty/tw-races/tw-race-002-kanban-position.spec.ts` (NEW, step 9)

Same shape as §6.9: `createTask`, then `fireTogether(2)` of `patchTaskPosition(…, 10)` and `(…, 20)`, read back, then cleanup with
`destroyTask` (a GraphQL mutation not probed yet, Q6: step 9 checks it with one call first). Oracle `final`; check `final ∈ {10, 20}`.
If `destroyTask` does not exist, the spec records `taskRowsLeft` (a count of tasks by title prefix) and reports it; no assertion on it.

### 6.13 `tests/twenty/tw-races/tw-race-003-merge.spec.ts` (NEW, step 9)

Per trial: two companies (sides `A` and `B`), `fireTogether(2, …mergeCompanies(ctx.base, ctx.auth, [a, b]))`, survivor ids from
`data.mergeCompanies.id` in the bodies, `companyLiveRows(ctx.pool, ctx.schema, [a, b])`, then `destroyCompany` on the survivor (cleanup).
Check: `assertOneSurvivor(liveRows, survivorIds)` and no 5xx.

## 7. Build steps (one commit each)

Each step: `npm run check` exits 0 and `npm run test:unit` prints the count below. A different count means stop and explain (rule 11).
Starting count: **431** (§3.0 row 19). Playwright specs do not enter the unit count.

| Step | Commit subject (Conventional Commits, lowercase)                                        | Files (`git add` paths)                                                                                                                                                                                        | Unit count after |
| ---- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| 0a   | `docs(plans): record the owner decisions for the task 7 plan` (this version)            | `docs/plans/2026-10-23-p6-phase2-task7-twenty-races.md`                                                                                                                                                        | 431              |
| 1    | `feat(twenty): add the Mailpit URL rule`                                                | `src/twenty/env.ts`, `tests/unit/twenty-env.test.ts`                                                                                                                                                           | 432              |
| 2    | `feat(twenty): add the Mailpit reader for reset and invite mail`                        | `src/twenty/mailpit.ts`, `tests/unit/twenty-mailpit.test.ts`                                                                                                                                                   | 437              |
| 3    | `feat(twenty): add race payload helpers`                                                | `src/twenty/payloads.ts`, `tests/unit/twenty-payloads.test.ts`                                                                                                                                                 | 440              |
| 4    | `feat(twenty): add the race invariants and the overlap check`                           | `src/twenty/invariants.ts`, `tests/unit/twenty-invariants.test.ts`                                                                                                                                             | 447              |
| 5    | `feat(twenty): add the REST and GraphQL race calls`                                     | `src/twenty/api.ts`, `tests/unit/twenty-api.test.ts`                                                                                                                                                           | 450              |
| 6    | `feat(twenty): add the reset, merge and leak-check queries`                             | `src/twenty/oracle.ts`, `tests/unit/twenty-oracle.test.ts`                                                                                                                                                     | 451              |
| 7    | `test(twenty): add the case runner, member setup and the name and disjoint-field races` | `src/twenty/member.ts`, `src/twenty/run-case.ts`, `playwright.config.ts`, `package.json`, `tests/twenty/tw-races/tw-race-001-lost-update.spec.ts`, `tests/twenty/tw-races/tw-race-005-disjoint-fields.spec.ts` | 451              |
| 8    | `test(twenty): add the reset-token races (004 as PRODUCT BUG, 006)`                     | `tests/twenty/tw-races/tw-race-004-reset-token.spec.ts`, `tests/twenty/tw-races/tw-race-006-reset-replay.spec.ts`                                                                                              | 451              |
| 9    | `test(twenty): add the kanban position and merge races`                                 | `tests/twenty/tw-races/tw-race-002-kanban-position.spec.ts`, `tests/twenty/tw-races/tw-race-003-merge.spec.ts`                                                                                                 | 451              |
| 10   | `ci(perf): add the twenty-races job`                                                    | `.github/workflows/perf.yml`                                                                                                                                                                                   | 451              |
| 11   | `docs(backlog): record P6-OBS-TW-001 as a product bug and describe the twenty races`    | `docs/BACKLOG.md`, `README.md`                                                                                                                                                                                 | 451              |

Commands for every step (repo root):

```bash
export PATH="/usr/local/bin:$PATH"           # Node 22.23 first (AGENTS.md)
npx prettier --write <the files of the step>  # Markdown, YAML and TypeScript must pass format:check
git add <files from the table>                # never git add -A or git add .
git commit -m "<subject from the table>"      # no attribution lines (repo rule A3)
npm run test:unit                             # expected: "# tests <count>", "# pass <count>", "# fail 0"
npm run check                                 # expected: exit 0
```

Playwright checks, from step 7 on (local, proof only; the stack is started and stopped with the owner's scripts):

```bash
npm run up:twenty                             # expected exit 0
npm run seed:twenty                           # expected exit 0
RACE_TRIALS=5 npm run race:twenty-tw          # expected: 001, 005 pass (step 7); 004 passes as expected-fail (step 8); 006, 002, 003 pass
npm run down:twenty                           # expected exit 0
```

After step 11: one local full-count run (`RACE_TRIALS=50`) to see the cloud-VM timings; they are proof only and are not published.

## 8. CI changes and the time budget

### 8.1 What changes

1. A new job `twenty-races` in `.github/workflows/perf.yml`, placed after `twenty-smoke`. It follows the `cal-state-races` pattern: its own
   checkout, `TWENTY_REF` check, `bootstrap.sh twenty`, the shared pull script (`scripts/ci/compose-pull.sh`, merged in PR #45), `up`, `seed`,
   the race step, log capture, the token scan, the job summary, uploads, and `down` with `always()` and volumes removed (`TWENTY_DOWN_VOLUMES=1`).
2. `twenty-smoke` is unchanged: same timeout (20), same steps, and `race:twenty` still runs only `tests/twenty/races/` (the self-test).
3. The token scan gains two patterns in the new job only (§8.2).

### 8.2 Token-scan patterns (new job)

The new job's scan step uses the value pattern below (the smoke job keeps its own pattern unchanged):

```bash
value='Bearer [A-Za-z0-9._~+/=-]{16,}|eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}|reset-password/[0-9a-f]{64}|passwordResetToken"?[:=] ?"?[0-9a-f]{64}|inviteToken=[0-9a-f]{64}'
```

Why not a bare 64-hex pattern: the Twenty image digest (`sha256:01fb6d…`, Task 6 §3.9) is 64 hex, so a bare pattern would flag every run.

### 8.3 Job skeleton and time budget (worst case)

```yaml
twenty-races:
  name: twenty-races
  runs-on: ubuntu-24.04
  timeout-minutes: 33 # worst-case budget below: 22.63 min, margin 10.37 min (>= 10)
  env: # same env block as twenty-smoke (P6 paths, TWENTY_REF, TWENTY_BASE_URL, P6_TWENTY_DATABASE_URL, TWENTY_DOWN_VOLUMES=1)
    ...
  steps:
    - checkout (timeout 5); verify TWENTY_REF (2); setup-node (5); npm ci (10)
    - bootstrap (10): bash scripts/bootstrap.sh twenty
    - pull (6): compose-pull.sh -p qa-harness-twenty ... # id: twenty_pull
    - up (12): npm run up:twenty # if pull succeeded
    - seed (10): npm run seed:twenty
    - race (9): RACE_TRIALS=5 on PR, 50 otherwise; npm run race:twenty-tw # if seed succeeded
    - capture logs (2), token scan (3), job summary (2), upload histograms (5), upload container log (5)
    - down (5): npm run down:twenty # if: always()
```

Worst-case budget, every row in minutes. Rows marked **estimate** are not measured; the pull row is at its cap, as the owner asked.

| Part                                          | Worst case | Source                                                                                                        |
| --------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------- |
| Checkout, verify, setup-node, `npm ci`        | 1.50       | **estimate** (Task 6 table: 16 s measured for the same steps on the Documenso job)                            |
| Bootstrap clone                               | 0.25       | measured 15 s (Task 6)                                                                                        |
| Pull (`compose-pull.sh`, 3 tries)             | **6.00**   | **the step cap, not measured** (owner: the cap, 6 min; the script's own worst is 100 s × 3 + 45 s = 5.75 min) |
| First boot (`up`)                             | 3.05       | measured worst 183 s (Task 6)                                                                                 |
| Seed                                          | 1.28       | measured worst 77 s (Task 6); 80 s in this probe                                                              |
| Race step at 50 trials                        | **9.00**   | **the step cap** (owner: the race step gets 9). Estimate of the work: 5.0 min (§8.4)                          |
| Capture logs                                  | 0.10       | estimate (`docker compose logs`, Task 6 measured nothing for this step)                                       |
| Token scan                                    | 0.50       | **estimate**                                                                                                  |
| Job summary                                   | 0.50       | **estimate**                                                                                                  |
| Upload histograms and container log (2 steps) | 0.40       | **estimate**: 0.2 min each, small files                                                                       |
| Down with volumes                             | 0.05       | measured 2 to 3 s (Task 6); 2 s here                                                                          |
| **Worst-case total**                          | **22.63**  | sum of the rows                                                                                               |

**Timeout: 33 minutes.** Margin: 33 − 22.63 = **10.37 min** (at least the 10 minutes the owner set). Choosing a new job's timeout is not a
raise of `twenty-smoke`, which stays at 20.

Measured-and-estimated expectation, for comparison only (not the budget): pull at its measured 0.57 min and the race at its estimate of 5.0
min give about 13.2 min. Record the first `main` run's real rows in §16 (closeout) before deciding anything else.

### 8.4 Race step estimate (not the budget)

| Case                           | Trials (main) | Estimate per trial                                                                                    | Estimate total         |
| ------------------------------ | ------------- | ----------------------------------------------------------------------------------------------------- | ---------------------- |
| `-001`, `-002`, `-003`, `-005` | 50 each       | tens of ms (two PATCH and a GET, or two merges and two counts) plus the warm-up                       | 0.5 min each = 2.0 min |
| `-004`, `-006`                 | 50 each       | one `signUpInWorkspace` (971 ms measured, bcrypt) plus invite and reset mail polls and the redemption | 1.5 min each = 3.0 min |
| **Race total**                 |               |                                                                                                       | **5.0 min (estimate)** |

On PRs the race uses 5 trials, so the step is about 0.5 min.

### 8.5 Step timeouts (new job)

| Step                              | timeout-minutes | Reason                               |
| --------------------------------- | --------------- | ------------------------------------ |
| Checkout (`actions/checkout`)     | 5               | small repository                     |
| Verify TWENTY_REF                 | 2               | grep only                            |
| setup-node, npm ci                | 5, 10           | as `twenty-smoke`                    |
| Bootstrap                         | 10              | clone measured 15 s                  |
| Pull                              | 6               | the shared script's cap (owner)      |
| Start (up)                        | 12              | measured 106 to 183 s                |
| Seed                              | 10              | measured 70 to 80 s                  |
| Race                              | 9               | owner; estimate 5.0 min at 50 trials |
| Capture logs, token scan, summary | 2, 3, 2         | as `twenty-smoke`                    |
| Uploads (2)                       | 5 each          | as `twenty-smoke`                    |
| Down                              | 5               | measured 2 to 3 s                    |

Step caps add up to more than the job timeout; that is deliberate (a step that hits its cap has failed). The job timeout comes from the budget (§8.3).

### 8.6 Closeout values to fill in from the first `main` run

Measured row by row (pull, first boot, seed, race at 50 trials, total job time), with the run id. Until then §8.3 is the budget, and the estimates
in §8.4 are not published numbers.

## 9. Test strategy (what each layer proves)

- **Unit (`tests/unit/twenty-*.test.ts`):** the Mailpit parser and poller, the payload helpers, each invariant, the REST and GraphQL call
  wrappers (with fake `fetch`), the oracle SQL guard and the schema check, and the Mailpit URL rule. These run on every `npm run check`.
- **Playwright races (`tests/twenty/tw-races/*.spec.ts`):** the four required cases plus two optional ones, against the live stack. They run on
  `main`, nightly and dispatch with 50 trials; PRs use 5 (roadmap D6).
- **Not covered:** a 429 on the reset request (the rate limit is source-only, A10); the kanban UI's own position values (§12 R7); the `signUp`
  route; a real mail delay on a hosted runner (polled with a 15 s cap).

## 10. Test strategy notes (what this does not prove)

- The races prove behaviour on one stack with one Node process. They do not measure contention on a multi-core runner.
- A PASS of `-001`, `-005`, `-006` (and of `-002`, `-003`) is a characterization of the observed behaviour, not a proof of absence of a bug.
- `-004` is labelled PRODUCT BUG by the owner (2026-10-23). The spec's expected failure is the evidence; a fix turns the test red as unexpectedly passed.

## 11. Risks

| #   | Risk                                                                                | Likelihood | Mitigation in this plan                                                            |
| --- | ----------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------- |
| R1  | `-004` is an expected failure until the product fixes it (PRODUCT BUG, owner label) | Known      | `test.fail()` after the guards; a fix shows as unexpectedly passed (§6.10)         |
| R2  | Job timeout short at full count (margin 6.0 min against 10 required)                | High       | §8.3 options; the owner decides (Q2)                                               |
| R3  | Mail delay on a hosted runner (invite and reset mail)                               | Medium     | Poll every 250 ms for 15 s; a miss is TEST BUG, never a pass (D9)                  |
| R4  | Reset token leaks into a container log or a histogram                               | Low        | D8: no token in histograms; scan pattern for reset links (§8.2)                    |
| R5  | Throwaway members accumulate on a local stack                                       | Medium     | Prefix on every address; the CI stack is removed with volumes; Q5                  |
| R6  | Captcha enabled in a future overlay blocks sign-up and reset                        | Low        | A11 holds for this pin; a 4xx from a guard would be a setup error (TEST BUG)       |
| R7  | The kanban UI sends position values the API race does not model                     | Medium     | §3.8 limit; the spec is named "position", the claim is API-level only              |
| R8  | `destroyTask` does not exist; task rows stay after a run                            | Medium     | Q6: verified in step 9 before use; if absent, rows stay and the leak check says so |
| R9  | P6-OBS-TW-001 hangs the Node client (30 s per request, `headersTimeout` 300 s)      | Known      | No malformed bodies in the races; the probe's curl timeouts are 30 s               |

## 12. Contradictions with the roadmap, proposed extras, open questions

### 12.1 Contradictions with the roadmap

- **C1 Throwaway user path.** Roadmap: "signup, invite, or the seed's other users". Probed: `signUp` alone gives no reset mail; invite is the path (D2).
- **C2 "Done when" for `-004`.** Roadmap: "pass or record a proven bug with `test.fail()`". Owner label: PRODUCT BUG (2026-10-23). The spec does
  `test.fail()` after the guards (§6.10). Closed by the owner's decision.
- **C3 Step cap.** The race step's cap is 9 minutes in the new job (owner); not a change to `twenty-smoke`.
- **C4 PATCH writes only that field.** Confirmed (§3.2).
- **C5 `-006` replay wording.** Roadmap: "a clean 4xx or GraphQL error". Probed: GraphQL error with HTTP 200 (§3.6); the oracle checks `errors`.
- **C6 `-002` and `-003`.** Roadmap: "only if cheap". Probed cheap (§3.8); included (owner Q4).
- **C7 File locations.** Roadmap: `tests/twenty/races/tw-race-*.spec.ts`. Now `tests/twenty/tw-races/` with project `twenty-tw-races`, so
  `twenty-smoke`'s `race:twenty` keeps running only the self-test (owner: smoke unchanged). Reason in §0.1.
- **C8 P6-OBS-TW-001.** Roadmap: "label and test.fail() follow the Phase 2 convention". Owner label: PRODUCT BUG, with no test in this task
  (not a race); the follow-up is in BACKLOG (X7).

### 12.2 Proposed extras (out of scope until the owner accepts them)

- **X1** A reset-request flood test (a fourth request for one email inside 15 minutes is refused; source `auth.resolver.ts` lines 126–127; not probed).
- **X2** The merge race for people (`mergePeople`).
- **X3** The reset-link and invite-link scan patterns in `scripts/evidence-token-scan.mjs` (Task 6 X6).
- **X7 (BACKLOG follow-up, not built here)** P6-OBS-TW-001 guarded spec: (a) guards: a valid query gets 200 and `{"foo":1}` gets 400, both
  within a few hundred milliseconds; (b) then `test.fail()` and expect `{}` to get a 400 within a **5-second** client timeout, never 30 s;
  (c) a probe of the same requests without auth; (d) a P6-style check that N parallel empty-body requests do not stop a valid request from
  answering. Added to `docs/BACKLOG.md` in step 11.

### 12.3 Owner decisions (2026-10-23), recorded

- Q1 `-004`: **PRODUCT BUG**, guards then `test.fail()` then strict (§6.10).
- Q2 Job timeout: **new job at 33 minutes from the worst-case budget** (§8.3); `twenty-smoke` stays at 20; options (a) and (c) removed.
- Q3 Race step cap: **9 minutes**.
- Q4 `-002` and `-003`: **kept**.
- Q5 Throwaway members: **left in place**; the run reports the count by prefix (`throwawayMembers`).
- Q6 `destroyTask`: **as proposed**: checked in step 9; if absent, the spec reports the task rows and does not assert on them.
- Q7 Scan patterns: **as proposed, plus `inviteToken=[0-9a-f]{64}`** (§8.2).
- Q8 Probe scripts: **outside the repo**; cited as "session scratchpad, not committed".

### 12.4 Risks the owner should weigh

- R1 is closed by the label: `-004` is a known bug, so its job stays red as an expected failure (green test). A fix turns it red as "unexpectedly passed".
- R2 is closed by the budget: the new job's margin is 10.37 min at worst case; the first `main` run's real numbers go in §8.6.

## 13. Self-check (rule 20)

- **(a) Roadmap "Done when".** `-001`, `-005`, `-006`, `-002`, `-003`: passing in the build. `-004`: PRODUCT BUG, expected failure recorded
  with `test.fail()`, repeated-run evidence in the histograms (the full-count main run). Histograms uploaded after the token scan: unchanged step order.
  Leak check by prefix: D16 (asserted: 0 company rows; members reported). `npm run check` green: each step. README: step 11.
- **(b) Names and paths.** Existing and grep-checked: `scripts/ci/compose-pull.sh` (X5), `src/races/fire-together.ts` (`fireTogether`,
  `dispatchSpreadMs`, `summariseBody`), `src/races/run-trials.ts` (`runTrials`), `src/races/trial-record.ts` (`recordTrial`), `src/races/rerun-on-spread.ts`
  (`createRerunRunner`, `spreadPolicyFromEnv`, runner `warmup`, `runTrial`, `applyTo`), `src/races/histogram.ts` (`createHistogram`, `writeHistogram`),
  `src/races/env.ts` (`raceTrialsFromEnv`), `src/races/prefix.ts` (`p6RunPrefix`), `src/races/types.ts` (`RaceAttemptResult` with `oracle`, `requests`;
  `RaceRequestResult` with `startedAtMs` and `endedAtMs`), `src/oracles/pg.ts` (`createReadOnlyPool`, `selectRows`, `assertSelectOnly`), `src/twenty/auth.ts`
  (`signInWorkspace`), `src/twenty/env.ts`, `src/twenty/oracle.ts` (`resolveWorkspaceSchema`), `src/twenty/api.ts` (step 5), `src/twenty/mailpit.ts` (step 2),
  `.github/workflows/perf.yml` (`cal-state-races`, `twenty-smoke`). **NEW:** `src/twenty/member.ts`, `src/twenty/run-case.ts`, the six specs. Fork
  mutation names used are those probed in §3.1, plus `destroyTask` (to be checked in step 9).
- **(c) CI estimate.** §8.3: worst case 22.63 min, timeout 33, margin 10.37 min. Pull at its cap, race at its cap; estimates marked.
- **(d) Skeletons and commands.** Each new function has a skeleton (§6.6a to §6.13); each step has the `git add` paths, the commit subject, the
  commands and the expected output (§7). Known gaps: `src/twenty/mailpit.ts`, `payloads.ts`, `invariants.ts`, `api.ts` skeletons are in v1 §6.2–§6.5
  and carried unchanged, with `overlapped` added (§6.6a).
- **(e) Owner answers.** Only the decisions in §0.1 and §12.3 are recorded. Anything else is a plan decision, marked as such.

## 14. Closeout notes (fill in before the PR merges)

- **Merge SHA:** _pending_ (the build PR; this plan has no PR).
- **CI runs:** _pending_. The first `main` run of `twenty-races` gives the measured rows for §8.6.
- **Findings (owner labels):**
  - `P6-TW-RACE-004`: **PRODUCT BUG** (50 of 50 parallel redemptions accepted in the probe, §3.7). Expected failure recorded with `test.fail()`.
  - `P6-OBS-TW-001`: **PRODUCT BUG** (12 of 12 hangs for empty and `{}` bodies on both endpoints, §3.9). BACKLOG updated; follow-up X7.
  - `-001`, `-005`, `-006`, `-002`, `-003`: no bug in the probe (§3.3, §3.4, §3.6, §3.8).
- **Deviations from the plan's first version:** spec location `tests/twenty/tw-races/` with project `twenty-tw-races` (§0.1); the job is new,
  `twenty-smoke` unchanged; the guards run before `test.fail()` (owner); the overlap guard applies to every parallel case (D15).
- **Environment note.** The session's instructions name `claude/awesome-noether-tu22g0`; the feature branch `feat/2026-10-23-p6-twenty-races`
  is used (repo rule A1). No attribution lines on commits (repo rule A3).
- **Rule slips:** none recorded so far.
