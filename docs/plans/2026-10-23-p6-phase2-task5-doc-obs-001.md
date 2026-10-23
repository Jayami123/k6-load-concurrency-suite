# P6 Phase 2 Task 5: `P6-OBS-DOC-001` Documenso sign-in error contract (build plan)

Roadmap: [2026-10-22-p6-phase2-roadmap.md](2026-10-22-p6-phase2-roadmap.md) §Task 5.
Previous task: [2026-10-23-p6-phase2-task4-cal-state-races.md](2026-10-23-p6-phase2-task4-cal-state-races.md) (merged in PR #39).
Rules: [docs/agent-rules.md](../agent-rules.md). Build branch: `test/2026-10-23-p6-doc-obs-001`.
This plan lives on `plan/2026-10-23-p6-doc-obs-001` (rule 10). The owner reviewed it on 2026-10-23 (§0, §12).

## 0. Status and owner gate

- **Owner review: 2026-10-23.** The owner answered Q2–Q8, accepted E2, deferred E1 and E3, and approved build steps 1–4
  on `test/2026-10-23-p6-doc-obs-001` with the fixes in §7 and §0a. The build stops only if a unit count, a control run or the
  cleanup probe differs from this plan (§7).
- **Owner answers** are recorded in §12 with the date. Nothing else in this plan is an owner answer (rule 20e).
- **Label:** `P6-OBS-DOC-001` is **PRODUCT BUG** now (owner answer Q2). This replaces the SUSPECTED wording of the first draft.

### 0a. Owner fixes applied in this revision (2026-10-23)

1. The new CI step runs **after** `Documenso races (documenso-race)` and **before** `Check Documenso artefacts for tokens`,
   with its own `if`, `timeout-minutes: 5` and `P6_PLAYWRIGHT_JSON: results/playwright/documenso-api.json`. (A step without a
   status function gets an implicit `success()`, so a failure before the race step would have skipped the races.)
2. The Playwright JSON is written to its own path. The token scan also greps `results/playwright` (E2 accepted).
   Q1 is answered from reading `scripts/write-ci-job-summary.ts` (§12).
3. `freshCsrf` checks the status before it parses, so a non-JSON error page throws the labelled `PRODUCT BUG` error.
4. Appendix A no longer claims a CI run or the Ubuntu CI image. It says "reproduced in a local run" and that CI run links are added
   at closeout. The 2FA sentence is removed.
5. "Two full CI runs" is removed everywhere. Rule 13's multi-run rule is for statistical races; this finding is deterministic.

## 1. Goal, scope and the cases covered

- **Goal.** Turn the README-only finding into CI evidence. A wrong password on
  `POST /api/auth/email-password/authorize` must return exactly **401**. A bad CSRF token must return
  **400 or 403** (owner Q3, roadmap D8). Neither may return 5xx. The two negative assertions are `test.fail()` until
  upstream fixes the handler, so CI stays green while the bug is real and turns red once it is fixed.
- **Case.** `P6-OBS-DOC-001` (low). Not a race. Roadmap D7: its own Playwright project `documenso-api`, no browser.
- **What it proves.** Error-contract correctness on sign-in: a client can tell "bad credentials" from "server fault".
  Retry and lockout rules in finance and healthcare portals depend on that.
- **In scope.** One spec with three tests and one cleanup, one pure helper module, one unit-test file, one Playwright project,
  one npm script, one CI step plus one token-scan extension in `documenso-smoke`, one README row and section, and the upstream
  issue draft (Appendix A).
- **Out of scope.** The wrong-TOTP branch (P1 `P7-OBS-DOC-2FA-003`), any fork change, any harness change, filing the upstream
  issue (the owner files it, Q6), the validation-echo finding (owner: candidate `P6-OBS-DOC-003` in the owner's backlog, Q7).

## 2. Assumptions the build depends on (each one probed in §3, or in build step 2)

| #   | Assumption                                                                                               | Probe result                                                                                                                                                                                                                      |
| --- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | The setup path works: csrf → signup 201 → confirmation mail → verify-email 200 `VERIFIED`                | Confirmed (§3.2)                                                                                                                                                                                                                  |
| A2  | A correct sign-in succeeds with **201** (not 200) and sets a `sessionId` cookie                          | Confirmed: 201, empty body, `Set-Cookie: sessionId` (§3.2). The roadmap said "success"; the real code is 201 (§10, C1)                                                                                                            |
| A3  | A wrong password returns **500** `INVALID_CREDENTIALS` at the fork pin (the bug reproduces)              | Confirmed 5/5 sequential and 20/20 parallel (§3.2, §3.3)                                                                                                                                                                          |
| A4  | A bad CSRF value returns **500** `INVALID_REQUEST` (the CSRF branch, line 94)                            | Confirmed 3/3, plus no cookie (§3.2)                                                                                                                                                                                              |
| A5  | The per-IP login limiter does not 429 this test                                                          | Confirmed: 0 × 429 in 20 parallel with the harness env (§3.3). The spec sends 3 sign-ins per run, well under 10 per 15 min anyway                                                                                                 |
| A6  | No response body from these calls carries a token or a password (5xx bodies carry only `code`/`message`) | Confirmed for the 5xx bodies. **Not true for the validation 400** (it echoes input, §3.2). The spec never triggers validation (§6.4)                                                                                              |
| A7  | Sign-in logs do not put a session or CSRF value in the web log (CI token scan)                           | Confirmed: web log 34 lines, 0 scan-pattern hits, 0 probe-secret hits (§3.4)                                                                                                                                                      |
| A8  | Upstream `main` still has the same handler (the finding is not fixed upstream)                           | Confirmed at `documenso/documenso` `8707e33c` (2026-10-22) (§3.5)                                                                                                                                                                 |
| A9  | The CSRF fetch route `/api/auth/csrf` is what the k6 smoke uses                                          | Confirmed: `k6/smoke/documenso-health.js` line 14 uses it; probe got 200 (§3.2)                                                                                                                                                   |
| A10 | Cleanup of the throwaway user works with the session the verify-email step returns                       | **Not probed yet.** Build step 2 runs it (§7). `deleteAccount(baseUrl, session: DocumensoSession)` (`src/documenso/account.ts` line 243) calls `profile.deleteAccount`. If it cannot work, the build stops before step 2's commit |

## 3. Probe results (2026-10-23, live app)

The probe ran against a harness-started Documenso at the fork pin `f4105e47` (`DOCUMENSO_REF` in
`scripts/bootstrap.sh`). Probe scripts were kept outside the repo (cloud scratchpad) and are not
committed. Secrets were redacted before printing: csrf values and passwords never appear below.

### 3.1 Commands and exit codes

| Step                               | Command                                                                                           | Exit | Why                                                                                                                                                                                                             |
| ---------------------------------- | ------------------------------------------------------------------------------------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Start, attempt 1                   | `npm run up:documenso`                                                                            | 1    | Fork checkout empty: `Documenso local signing certificate missing at /home/user/products/documenso/apps/remix/example/cert.p12. Run npm ci`. The VM had no fork yet (the environment's setup did not clone it). |
| Fork clone                         | `bash scripts/bootstrap.sh documenso`                                                             | 0    | Cloned `f4105e47` (depth 1) and ran `npm ci` under Node 24.                                                                                                                                                     |
| Start, attempt 2                   | `npm run up:documenso`                                                                            | 1    | JavaScript heap out of memory (about 2 GB, default limit) in `react-router typegen && tsc` of `apps/remix`; npm error code 134. Local VM limit, not a product result. See risk R5.                              |
| Start, attempt 3                   | `NODE_OPTIONS=--max-old-space-size=6144 npm run up:documenso`                                     | 0    | Typecheck and Vite build passed; `/signin` answered 200. The build flags in §7 (`--use-openssl-ca --max-old-space-size=8192`) are the owner's local values, not the ones used for this probe.                   |
| Probe                              | `node probe-doc-obs-001.mjs` (outside the repo; imports the repo's `CookieJar`, Inbucket helpers) | 0    | 16 sign-in-path requests and 20 parallel (§3.2, §3.3).                                                                                                                                                          |
| Web-log scan                       | grep of `node_modules/qa-portfolio-harness/.harness/documenso-web.log` with the CI pattern        | —    | 34 lines; 0 pattern hits; 0 probe-secret hits; 1 `authorize` line (§3.4).                                                                                                                                       |
| Stop                               | `npm run down:documenso`                                                                          | 0    | `Documenso web stopped and compose stack torn down.` `/signin` then returned 000 (expected).                                                                                                                    |
| Baseline check (before any change) | `npm run check`                                                                                   | 0    | 19 s; `# tests 409`, `# pass 409`, `# fail 0`.                                                                                                                                                                  |

### 3.2 Routes, real statuses and bodies (one sample each; timings from the probe run)

| #   | Request                                                               | Real status  | Real body (redacted)                                                                                                                         | ms (run)                 | Set-Cookie names | What it proves                                                                          |
| --- | --------------------------------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ---------------- | --------------------------------------------------------------------------------------- |
| 1   | `GET /signin`                                                         | 200          | empty                                                                                                                                        | 75                       | —                | Web app up (cold first request)                                                         |
| 2   | `GET /api/auth/csrf`                                                  | 200          | `{"csrfToken":"<redacted-csrf>"}`                                                                                                            | 5                        | `csrfToken`      | Fetch route for the CSRF pair (A9)                                                      |
| 3   | `POST /api/auth/email-password/signup`                                | 201          | `OK`                                                                                                                                         | 564                      | —                | Setup (A1)                                                                              |
| 4   | Inbucket mailbox, confirmation mail                                   | —            | link `/verify-email/<token>` found                                                                                                           | 265                      | —                | Setup (A1)                                                                              |
| 5   | `POST /api/auth/email-password/verify-email`                          | 200          | `{"state":"VERIFIED"}`                                                                                                                       | 27                       | `sessionId`      | Setup (A1); this response already signs the user in, so its jar is the cleanup session  |
| 6   | `POST …/authorize` correct password, valid CSRF                       | **201**      | empty, `text/plain`                                                                                                                          | 315                      | `sessionId`      | Setup assertion (A2): success is **201**                                                |
| 7   | `POST …/authorize` wrong password #1–#5 (valid length, valid CSRF)    | **500**      | `{"code":"INVALID_CREDENTIALS","message":"Invalid email or password"}`                                                                       | 293–311                  | —                | Bug reproduces (A3). Slow: the bcrypt compare runs (line 120)                           |
| 8   | `…/authorize` unknown email, same wrong password                      | **500**      | `{"code":"INVALID_CREDENTIALS",…}` (same message)                                                                                            | 5                        | —                | User-not-found branch (line 115), no bcrypt, same body. No account enumeration by body  |
| 9   | `…/authorize` bad CSRF value #1–#3 (cookie present, body token bogus) | **500**      | `{"code":"INVALID_REQUEST","message":"Invalid CSRF token"}`                                                                                  | 2–3                      | —                | Bug reproduces (A4), line 94                                                            |
| 10  | `…/authorize` no CSRF cookie, body token set                          | **500**      | `{"code":"INVALID_REQUEST",…}`                                                                                                               | 3                        | —                | Same branch (`!csrfCookieToken`)                                                        |
| 11  | `…/authorize` body without `csrfToken`                                | **400**      | zod issues `[{"code":"invalid_type","path":["csrfToken"],"message":"Required"}]` **and `data` echoing the submitted `email` and `password`** | 3                        | —                | Schema validation runs first. **The 400 body echoes input (see R4)**                    |
| 12  | `…/authorize` 3-character password                                    | **400**      | zod `too_small` (min 6) **and `data` echoing the submitted `password` and `csrfToken`**                                                      | 2                        | —                | Validation runs before the handler; a password under 6 chars never reaches the 401 path |
| 13  | 20 parallel wrong-password sign-ins (fresh CSRF each)                 | **500 × 20** | all `INVALID_CREDENTIALS`                                                                                                                    | 327–1255 (spread 928 ms) | —                | 0 × 429 with the harness env (A5). Same result as Task 6 §2.4                           |

Notes on the table:

- Row 7 vs row 8 timings show the two branches: bcrypt runs only when the user exists (about 300 ms); the
  unknown-email branch returns in about 5 ms. Both bodies are identical, so the body does not reveal which one ran.
- Rows 11 and 12 are the trap for the test: a validation 400 echoes the submitted password and CSRF value. The
  spec must never send a short password, and must never print a response body into an assertion message.
- Success is 201 with an empty `text/plain` body; there is no JSON to parse on success.

### 3.3 What the probe proves, and what it does not

- **Proves:** the sequential and parallel 500 reproduce at the fork pin; the codes are `INVALID_CREDENTIALS`
  and `INVALID_REQUEST`; the CSRF branch returns 500 with and without a cookie; there is no 429 under the
  harness env; the correct sign-in is 201 with a `sessionId` cookie; the 5xx bodies carry no token.
- **Does not prove:** which of 400 or 403 the CSRF branch is meant to return (no code path in the fork sets a
  status for it: `AppError` on line 94 has no `statusCode`). The test accepts both (D8). The probe does not
  prove the bug on the CI image (not run there yet; rule 15: no published timings).
- **Does not prove:** cleanup of the throwaway user (A10). Build step 2 is the first run of it.

### 3.4 Web log (`node_modules/qa-portfolio-harness/.harness/documenso-web.log`, after the probe, before stop)

- 34 lines.
- CI token-scan pattern (`perf.yml` "Check Documenso artefacts for tokens"): `api_…`, `Bearer `, `sessionId`,
  `/verify-email/…`, `/sign/…`: **0 matches**.
- Probe passwords (`Probe-…`, `Wrong-Passw0rd-probe`): **0 matches**. Only one `authorize` line appears.

### 3.5 Upstream re-check (read-only)

- Checked `documenso/documenso` `main` at **`8707e33c124e4b1a68dde92d5e05178c9aabd0be`** (committed
  2026-10-22 19:26:55 +1100, tag v2.21.1). Read through an anonymous shallow clone the session's git proxy
  serves for public repos (`add_repo` reported read access; nothing was attached, nothing pushed).
- `packages/auth/server/routes/email-password.ts`: the CSRF `throw new AppError(AuthenticationErrorCode.InvalidRequest, …)`
  at lines 93–96 (throw at 94), `InvalidCredentials` at 115 and 132. **Unchanged** from the fork pin.
- `packages/auth/server/index.ts` `auth.onError`: `const statusCode = (err.statusCode || 500)`. **Unchanged.**
- Conclusion: **not fixed upstream at the checked commit.** The finding is current on `main`, not only in the pin.
- Issue template at upstream (`.github/ISSUE_TEMPLATE/bug-report.yml`): fields are "Issue Description",
  "Steps to Reproduce", "Expected Behavior", "Current Behavior", "Screenshots (optional)", OS, Browser,
  Version, and five checkboxes (including "I have searched the existing issues"). We did **not** search upstream
  issues (owner answer Q6: the owner searches at filing time).

## 4. Design and decisions

Each decision gives its reason.

- **D1. Own Playwright project `documenso-api`, testDir `tests/documenso/api/`, no browser** (roadmap D7).
  Reason: a non-race test does not belong in `documenso-race`; the API project avoids a browser install.
- **D2. Setup is a `beforeAll`** that signs up, verifies, then signs in once and stores the result. Reason: if setup
  fails, `beforeAll` fails the run as a real failure. It is never an expected failure.
- **D3. A real test asserts the correct sign-in is 201 with `sessionId`.** It reads the result stored in `beforeAll`.
  Reason: it proves the account and password path work, so a later negative result cannot be a setup error.
- **D4. Each negative test: request → guard → `test.fail()` → product assertion.** Reason (Phase 1 D17 pattern):
  `test.fail()` turns any failure into a pass, so every failure before the product assertion must still be
  red. The guard is `classifySignin(status, text).kind` must be `bad-credentials` (wrong password) or
  `bad-csrf` (bad CSRF). A wrong password that **succeeds** (kind `success`) fails the guard, so it is red,
  never an expected failure. That is the important security case.
- **D5. Wrong password = 401 exactly; bad CSRF = 400 or 403; never 5xx for either** (roadmap D8, owner Q3). Reason: the
  roadmap agreed these expectations; the probe shows 500 for both.
- **D6. A fresh cookie jar and a fresh CSRF per attempt** (what a browser does). Reason: the CSRF check compares
  the body value to the cookie (line 93), so a shared jar would test something else.
- **D7. No response body in any assertion message or console line.** Reason: the 400 validation body echoes input (§3.2
  rows 11–12); the CI artefacts are scanned, and the spec must never add a secret to them. Only status, `code`
  and a fixed label are printed.
- **D8. Passwords and emails.** The password comes from `generatePassword()` (length above 25, in memory, per run).
  The wrong password is `${password}-wrong` (valid length, never a validation case). The email is
  `${runPrefix}-signin@example.com` (lowercase), where `runPrefix = p6RunPrefix()`, so the run prefix isolates the row.
- **D9. Helpers in a new module `src/documenso/signin.ts` (NEW), not in `account.ts`.** Reason: the existing
  `signUpVerifiedUser` returns no password, so the correct sign-in cannot be tested through it. Changing its
  return type would touch other specs. We reuse `CookieJar`, `generatePassword`, `createInbucketClient`, `mailboxName`,
  `verifyEmailToken`, the env getters and the `DocumensoSession` type.
- **D10. Pure helpers `signinPayload` and `classifySignin` are unit tested** (they are the decision logic).
  Reason: they can be checked without a running product, and the unit tests run on every PR.
- **D11. `npm run test:documenso-api`** (roadmap naming). Reason: matches `race:documenso`; keeps the CI step one line.
- **D12. CI: one step in `documenso-smoke`, after the races and before the token scan, on every event** (§0a fix 1).
  It runs only when `documenso_up` succeeded, like the other steps, and it has `timeout-minutes: 5`.
- **D13. The CI step fails the job directly** (no `|| status=$?`). Reason: a regression in these tests is a real
  failure. The race steps use `|| status=$?` only because they write histograms first.
- **D14. Label: PRODUCT BUG (owner Q2).** The test annotation uses type `issue` (PR review, owner: the repo convention for
  `test.fail()` known bugs, used by CAL-001, CAL-002 and DOC-002, and the type `src/ci/playwright-json-summary.ts` reads;
  the first draft used `product-bug`, which the summary does not list) and a description that starts with
  `PRODUCT BUG P6-OBS-DOC-001 (low):` plus the one-line reason. The README keeps PRODUCT BUG. Reason: the code path is
  deterministic (an `AppError` without `statusCode`, mapped to 500 by `onError`), present at the pin and on upstream `main`,
  and reproduced in every probe (5/5, 20/20, 3/3). Rule 13's repeated-run rule is for statistical races.
- **D15. Cleanup is a guard (owner Q4).** An `afterAll` deletes the throwaway user with `deleteAccount(BASE, owner)` using the
  session the verify-email step returned. A failure throws a labelled `CLEANUP:` error (never silent). If `deleteAccount`
  cannot delete the user, the build stops before step 2's commit and reports (§7).
- **D16. The upstream issue draft is Appendix A.** The owner files it (Q6). Reason: roadmap Task 9 says the owner files.

## 5. Files

| Path                                                    | Status | Purpose                                                                                                                                                                                              |
| ------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/documenso/signin.ts`                               | NEW    | `signinPayload`, `classifySignin` (pure); `freshCsrf`, `signinAttempt`, `createVerifiedPasswordUser` (HTTP)                                                                                          |
| `tests/unit/documenso-signin.test.ts`                   | NEW    | Unit tests for the two pure helpers (8 tests)                                                                                                                                                        |
| `tests/documenso/api/doc-obs-001-signin-errors.spec.ts` | NEW    | The spec: `beforeAll` setup, one real test, two `test.fail()` tests, `afterAll` cleanup                                                                                                              |
| `playwright.config.ts`                                  | edit   | Add project `documenso-api` (`testDir: "tests/documenso/api"`, `use.baseURL: documensoBaseUrlFromEnv()`)                                                                                             |
| `package.json`                                          | edit   | Add script `"test:documenso-api": "playwright test --project=documenso-api"`                                                                                                                         |
| `.github/workflows/perf.yml`                            | edit   | (a) One step in `documenso-smoke` after "Documenso races (documenso-race)" (line 1127) and before "Check Documenso artefacts for tokens" (line 1143); (b) token scan also greps `results/playwright` |
| `README.md`                                             | edit   | "Known product bugs" row `P6-OBS-DOC-001` (test link, PRODUCT BUG, run links at closeout); a short "Documenso sign-in errors (Phase 2)" section                                                      |
| `docs/plans/2026-10-23-p6-phase2-task5-doc-obs-001.md`  | NEW    | This plan; owner answers in §12; closeout notes in §14                                                                                                                                               |

Existing names used (grep-checked in §13): `CookieJar`, `generatePassword`, `deleteAccount`, `DocumensoSession` (`src/documenso/account.ts`);
`createInbucketClient`, `mailboxName`, `verifyEmailToken` (`src/documenso/inbucket.ts`);
`documensoBaseUrlFromEnv`, `inbucketBaseUrlFromEnv` (`src/documenso/env.ts`); `p6RunPrefix` (`src/races/prefix.ts`).

## 6. Code skeletons (each new function and test)

Skeletons are the shape to write, with real names. Keep the repo's style (double quotes, semicolons, 2-space indent,
`.ts` extensions in imports). Run `npx prettier --write` on each new file before the step's commit.

### 6.1 `src/documenso/signin.ts` (NEW, step 1 for the pure part; step 2 for the HTTP part)

```ts
import type { DocumensoSession } from "./account.ts";
import { CookieJar, generatePassword } from "./account.ts";
import { createInbucketClient, mailboxName, verifyEmailToken } from "./inbucket.ts";

/** What a sign-in reply means. Never carries the body. */
export type SigninClass =
  "success" | "bad-credentials" | "bad-csrf" | "validation" | "server-error";
export type SigninOutcome = { kind: SigninClass; code: string | null };

/** The three body fields the browser sends. Pure. */
export function signinPayload(input: { email: string; password: string; csrfToken: string }) {
  return { email: input.email, password: input.password, csrfToken: input.csrfToken };
}

/**
 * Pure. 200/201 is always success, whatever the body, so a wrong password that succeeds can never pass the guard.
 * Otherwise a known `code` decides: INVALID_CREDENTIALS is bad-credentials (even though the status is 500 today),
 * INVALID_REQUEST is bad-csrf. A zod `error` array is validation. Anything else is server-error.
 * The body is parsed and never returned.
 */
export function classifySignin(status: number, text: string): SigninOutcome {
  if (status === 200 || status === 201) return { kind: "success", code: null };
  let code: string | null = null;
  let zodIssues = false;
  try {
    const body = JSON.parse(text) as { code?: unknown; error?: unknown };
    if (typeof body.code === "string") code = body.code;
    zodIssues = Array.isArray(body.error);
  } catch {
    // Not JSON: code stays null.
  }
  if (code === "INVALID_CREDENTIALS") return { kind: "bad-credentials", code };
  if (code === "INVALID_REQUEST") return { kind: "bad-csrf", code };
  if (zodIssues) return { kind: "validation", code: null };
  return { kind: "server-error", code };
}

export type CsrfSession = { jar: CookieJar; token: string };

/**
 * GET /api/auth/csrf with a fresh jar. The status is checked before the body is parsed, so a non-JSON error page
 * throws the labelled error and never a bare SyntaxError (owner fix 3).
 */
export async function freshCsrf(baseUrl: string): Promise<CsrfSession> {
  const jar = new CookieJar();
  const res = await fetch(`${baseUrl}/api/auth/csrf`);
  jar.absorb(res);
  const text = await res.text();
  if (res.status !== 200) throw new Error(`PRODUCT BUG: csrf HTTP ${res.status}`);
  let token: unknown;
  try {
    token = (JSON.parse(text) as { csrfToken?: unknown }).csrfToken;
  } catch {
    token = undefined;
  }
  if (typeof token !== "string") throw new Error("PRODUCT BUG: csrf body has no csrfToken");
  return { jar, token };
}

export type SigninAttempt = { status: number; text: string; ms: number; setCookieNames: string[] };

/**
 * One sign-in as the browser sends it. `session.token` goes in the body (a bogus value is a bad-CSRF probe).
 * The reply's cookies are absorbed into the session's jar, so a successful sign-in leaves a usable session.
 */
export async function signinAttempt(
  baseUrl: string,
  session: CsrfSession,
  creds: { email: string; password: string },
): Promise<SigninAttempt> {
  const started = performance.now();
  const res = await fetch(`${baseUrl}/api/auth/email-password/authorize`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: session.jar.header() },
    body: JSON.stringify(signinPayload({ ...creds, csrfToken: session.token })),
  });
  session.jar.absorb(res);
  const text = await res.text();
  return {
    status: res.status,
    text,
    ms: performance.now() - started,
    setCookieNames: res.headers.getSetCookie().map((c) => c.split("=", 1)[0] ?? ""),
  };
}

/**
 * Setup: csrf → signup (201) → confirmation mail → verify-email (VERIFIED). Returns the session that the verify-email
 * reply signed in (its jar holds `sessionId`), so cleanup has a session even if a later sign-in fails.
 * Throws `PRODUCT BUG` or `TEST BUG` labels; messages never carry a body.
 */
export async function createVerifiedPasswordUser(
  baseUrl: string,
  inbucketBaseUrl: string,
  email: string,
  password: string,
): Promise<DocumensoSession> {
  const session = await freshCsrf(baseUrl);
  const signup = await fetch(`${baseUrl}/api/auth/email-password/signup`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: session.jar.header() },
    body: JSON.stringify({ name: "P6 signin probe", email, password }),
  });
  await signup.text();
  if (signup.status !== 201) throw new Error(`PRODUCT BUG: signup HTTP ${signup.status}`);

  const inbucket = createInbucketClient(inbucketBaseUrl);
  const mailbox = mailboxName(email);
  const mails = await inbucket.waitFor(mailbox, { min: 1, timeoutMs: 15_000 });
  const first = mails[0];
  const token = first ? verifyEmailToken(await inbucket.get(mailbox, first.id)) : null;
  if (!token) throw new Error("PRODUCT BUG: no confirmation link in the mailbox");

  const verify = await fetch(`${baseUrl}/api/auth/email-password/verify-email`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: session.jar.header() },
    body: JSON.stringify({ token }),
  });
  session.jar.absorb(verify);
  const verifyBody = (await verify.json().catch(() => ({}))) as { state?: unknown };
  if (verify.status !== 200 || verifyBody.state !== "VERIFIED") {
    throw new Error(`PRODUCT BUG: verify-email HTTP ${verify.status}`);
  }
  return { jar: session.jar };
}
```

Notes for the junior engineer:

- `generatePassword` is imported only if the file uses it. The helpers above do not, so **remove that import** (it is used
  only by the spec). `noUnusedLocals` is on and the typecheck fails otherwise.
- The verify-email reply's `Set-Cookie: sessionId` is the signed-in session. That is why `createVerifiedPasswordUser` returns
  the jar (A10).

### 6.2 `tests/unit/documenso-signin.test.ts` (NEW, step 1)

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifySignin, signinPayload } from "../../src/documenso/signin.ts";

const INVALID_CREDENTIALS = '{"code":"INVALID_CREDENTIALS","message":"Invalid email or password"}';
const INVALID_REQUEST = '{"code":"INVALID_REQUEST","message":"Invalid CSRF token"}';
const ZOD_400 =
  '{"data":{"email":"a@example.com","password":"abc"},"error":[{"code":"too_small","path":["password"],"message":"Must be at least 6 characters in length"}],"success":false}';

describe("signinPayload", () => {
  it("sends exactly email, password and csrfToken", () => {
    assert.deepEqual(signinPayload({ email: "a@example.com", password: "p", csrfToken: "t" }), {
      email: "a@example.com",
      password: "p",
      csrfToken: "t",
    });
  });
});

describe("classifySignin", () => {
  it("201 is success with no code", () => {
    assert.deepEqual(classifySignin(201, ""), { kind: "success", code: null });
  });
  it("500 INVALID_CREDENTIALS is bad-credentials", () => {
    assert.deepEqual(classifySignin(500, INVALID_CREDENTIALS), {
      kind: "bad-credentials",
      code: "INVALID_CREDENTIALS",
    });
  });
  it("500 INVALID_REQUEST is bad-csrf", () => {
    assert.deepEqual(classifySignin(500, INVALID_REQUEST), {
      kind: "bad-csrf",
      code: "INVALID_REQUEST",
    });
  });
  it("400 with a zod issue list is validation", () => {
    assert.deepEqual(classifySignin(400, ZOD_400), { kind: "validation", code: null });
  });
  it("500 with a non-JSON body is server-error with no code", () => {
    assert.deepEqual(classifySignin(500, "<html>boom</html>"), {
      kind: "server-error",
      code: null,
    });
  });
  it("201 with an INVALID_CREDENTIALS body is still success (a success never passes the guard as bad-credentials)", () => {
    assert.deepEqual(classifySignin(201, INVALID_CREDENTIALS), { kind: "success", code: null });
  });
  it("never reports success for 4xx or 5xx", () => {
    for (const status of [400, 401, 403, 500]) {
      assert.notEqual(classifySignin(status, INVALID_CREDENTIALS).kind, "success");
    }
  });
});
```

### 6.3 `playwright.config.ts` project (NEW entry, step 2)

```ts
    {
      name: "documenso-api",
      testDir: "tests/documenso/api",
      retries: 0,
      use: { baseURL: documensoBaseUrlFromEnv() },
    },
```

Place it after `documenso-race`. No `browserName`: the spec uses `fetch` only.

### 6.4 `tests/documenso/api/doc-obs-001-signin-errors.spec.ts` (NEW, step 2)

```ts
import { expect, test } from "@playwright/test";
import {
  deleteAccount,
  generatePassword,
  type DocumensoSession,
} from "../../../src/documenso/account.ts";
import { documensoBaseUrlFromEnv, inbucketBaseUrlFromEnv } from "../../../src/documenso/env.ts";
import {
  classifySignin,
  createVerifiedPasswordUser,
  freshCsrf,
  signinAttempt,
  type SigninAttempt,
} from "../../../src/documenso/signin.ts";
import { p6RunPrefix } from "../../../src/races/prefix.ts";

const BASE = documensoBaseUrlFromEnv();
const INBUCKET = inbucketBaseUrlFromEnv();
const runPrefix = p6RunPrefix();
const email = `${runPrefix}-signin@example.com`.toLowerCase();
const password = generatePassword();
// Valid length and shape, never equal to the real password. Short passwords are a validation case (400).
const wrongPassword = `${password}-wrong`;

let owner: DocumensoSession | undefined;
let correct: SigninAttempt | undefined;

test.beforeAll(async () => {
  // Setup failures are real failures here: beforeAll is never an expected failure.
  owner = await createVerifiedPasswordUser(BASE, INBUCKET, email, password);
  correct = await signinAttempt(BASE, await freshCsrf(BASE), { email, password });
});

test.afterAll(async () => {
  if (!owner) return; // the account was never created
  try {
    await deleteAccount(BASE, owner);
  } catch (err) {
    // Cleanup is a guard, never silent (owner Q4). The message carries no response body.
    throw new Error(
      `CLEANUP: deleteAccount failed for run prefix ${runPrefix}: ${(err as Error).message}`,
    );
  }
});

test("setup: a correct sign-in is 201 and sets sessionId", () => {
  expect(correct?.status, "correct password").toBe(201);
  expect(correct?.setCookieNames, "session cookie").toContain("sessionId");
});

test("P6-OBS-DOC-001: wrong password is 401, never 5xx", async () => {
  const session = await freshCsrf(BASE);
  const r = await signinAttempt(BASE, session, { email, password: wrongPassword });
  // Guard, before test.fail(): a wrong password that succeeds must go red, never pass as expected.
  expect(classifySignin(r.status, r.text).kind, "guard: known credentials contract").toBe(
    "bad-credentials",
  );
  expect(r.setCookieNames, "guard: no session on a rejected sign-in").not.toContain("sessionId");
  test.info().annotations.push({
    type: "issue",
    description:
      "PRODUCT BUG P6-OBS-DOC-001 (low): wrong password returns 500 INVALID_CREDENTIALS, not 401. Cause: AppError without statusCode, onError maps it to 500.",
  });
  test.fail(); // Known bug at the fork pin. Remove this line when upstream fixes it (README).
  expect(r.status, "wrong password must be 401 (roadmap D8)").toBe(401);
});

test("P6-OBS-DOC-001: bad CSRF is 400 or 403, never 5xx", async () => {
  const session = await freshCsrf(BASE);
  const bogus = { jar: session.jar, token: "bogus-csrf-value" };
  const r = await signinAttempt(BASE, bogus, { email, password });
  expect(classifySignin(r.status, r.text).kind, "guard: CSRF contract").toBe("bad-csrf");
  expect(r.setCookieNames, "guard: no session on a rejected sign-in").not.toContain("sessionId");
  test.info().annotations.push({
    type: "issue",
    description:
      "PRODUCT BUG P6-OBS-DOC-001 (low): bad CSRF returns 500 INVALID_REQUEST, not 400 or 403. Cause: AppError without statusCode (line 94), onError maps it to 500.",
  });
  test.fail(); // Known bug at the fork pin. Remove this line when upstream fixes it.
  expect([400, 403], "bad CSRF must be 400 or 403 (roadmap D8)").toContain(r.status);
});
```

Rules in this spec, each with its reason:

- **No body in any message.** Assertions print the status and kind only (D7). The response `text` is never passed to `expect`.
- **Only the stated requests.** The spec never sends a password under 6 characters, so validation (400) never runs.
- **Cleanup is a guard (D15).** `afterAll` throws `CLEANUP:` on failure. It does not swallow the error.
- **Control run (step 2):** point the spec at a closed port. `beforeAll` must fail and the run must exit non-zero, with no test
  reported as passed.

### 6.5 `package.json` script (step 2)

```json
    "test:documenso-api": "playwright test --project=documenso-api",
```

Insert it after `"race:documenso"`.

## 7. Build steps (owner-approved 2026-10-23; one commit each)

Each step: make the change, `npx prettier --write <new files>`, `npm run check`, then the unit count check, then
`git add` the exact paths and commit. **Stop and report** (do not commit) if a unit count differs from the table, a control
run does not match, or the cleanup probe fails (owner instruction). Never edit an expected number (rule 11).

Starting point for all steps:

```bash
cd /home/user/k6-load-concurrency-suite
git fetch origin main
git checkout -B test/2026-10-23-p6-doc-obs-001 origin/main   # the build branch starts at origin/main 0728ebe
export PATH="/usr/local/bin:$PATH"
```

Local Documenso runs use the owner's flags (CI leaves `NODE_OPTIONS` unset; see R5):

```bash
export NODE_OPTIONS="--use-openssl-ca --max-old-space-size=8192"
```

### Step 1: pure helpers and unit tests

- Files: `src/documenso/signin.ts` (§6.1, the whole file, including the HTTP functions; they compile but are not called until
  step 2) and `tests/unit/documenso-signin.test.ts` (§6.2).
- Commands:
  ```bash
  npx prettier --write src/documenso/signin.ts tests/unit/documenso-signin.test.ts
  npm run check
  git add src/documenso/signin.ts tests/unit/documenso-signin.test.ts
  git commit -m "test(documenso): add the sign-in error classifier for P6-OBS-DOC-001"
  ```
- Expected `npm run check` tail: `# tests 417`, `# pass 417`, `# fail 0`, exit 0.
- **Unit-test count after step 1: 417** (409 + 8; the eighth test was added in the PR review, see §14).

### Step 2: the Playwright project, the script and the spec (with the cleanup probe)

- Files: `playwright.config.ts` (§6.3), `package.json` (§6.5), `tests/documenso/api/doc-obs-001-signin-errors.spec.ts` (§6.4).
- List check (no product yet):
  ```bash
  npx playwright test --list --project=documenso-api
  ```
  Expected last line: `Total: 3 tests in 1 file`.
- Live run with the product up:
  ```bash
  npm run up:documenso; echo "UP=$?"
  npm run test:documenso-api; echo "TEST=$?"
  npm run down:documenso; echo "DOWN=$?"
  ```
  Expected: `UP=0`, `TEST=0`, `DOWN=0`. Playwright reports `3 passed`: the two `test.fail()` tests pass while the bug reproduces,
  and the `issue` annotations appear in the list output.
- **Cleanup probe (owner Q4; this is the stop point).** The `afterAll` is the probe. After the run, check that the account is gone:
  a scratch script outside the repo signs in with the same email and password. Expected: `500 INVALID_CREDENTIALS` (the
  user-not-found branch, §3.2 row 8). Record the status. If `deleteAccount` threw (`CLEANUP:` in the output, `TEST` non-zero), or the
  sign-in still succeeds, **stop before committing step 2 and report** (owner instruction).
- Control run (product down, so `DOCUMENSO_BASE_URL` points at a closed port):
  ```bash
  DOCUMENSO_BASE_URL=http://127.0.0.1:3999 npm run test:documenso-api; echo "CONTROL=$?"
  ```
  Expected: `CONTROL` is non-zero, the `beforeAll` error shows a connection refused, and no test reports as passed. Any other
  result is a stop.
- Commands (after the checks above match):
  ```bash
  npx prettier --write tests/documenso/api/doc-obs-001-signin-errors.spec.ts playwright.config.ts package.json
  npm run check
  git add playwright.config.ts package.json tests/documenso/api/doc-obs-001-signin-errors.spec.ts
  git commit -m "test(documenso): add the sign-in error contract spec (P6-OBS-DOC-001)"
  ```
- **Unit-test count after step 2: 417** (no unit change; Playwright lists 3 tests).

### Step 3: CI step in `documenso-smoke` and the token scan

- File: `.github/workflows/perf.yml`. Two edits.
  - (a) Insert a new step **after** `Documenso races (documenso-race)` (line ~1127, which ends before line 1143) and **before**
    `Check Documenso artefacts for tokens` (line 1143). Use exactly this text, with the same 6-space indentation as the neighbouring
    `- name:` steps:
    ```yaml
    - name: Documenso sign-in error contract (documenso-api)
      id: documenso_api
      if: ${{ !cancelled() && steps.documenso_up.outcome == 'success' }}
      timeout-minutes: 5
      working-directory: ${{ env.P6_WORKING_DIRECTORY }}
      env:
        P6_PLAYWRIGHT_JSON: results/playwright/documenso-api.json
      run: |
        set -euo pipefail
        npm run test:documenso-api
    ```
    (The block above is indented by four extra spaces only because it sits in this list; in the file, `- name:` starts at column 7,
    the same as the other steps.) No `|| status=$?`: a failure fails the job (D13).
  - (b) In `Check Documenso artefacts for tokens`, after the race-histogram check, add the Playwright JSON check (E2, owner-accepted).
    **As merged** (the first draft recursed over all of `results/playwright`; that failed on CI, see §14): the scan reads
    only `suites` and `errors`, because `config.metadata.gitDiff` holds the repo diff. The value-bearing pattern is
    `json_pattern` (cookie values, not the bare word `sessionId`), and `jq` output is captured before `grep -q` so that
    `pipefail` cannot hide a match:
    ```bash
              json_pattern='api_[A-Za-z0-9]{8,}|Bearer |sessionId=[^;[:space:]"]{8,}|/verify-email/[A-Za-z0-9_-]+|/sign/[A-Za-z0-9_-]{10,}'
              for f in results/playwright/*.json; do
                [ -f "$f" ] || continue
                results_json=$(jq -c '{suites, errors}' "$f")
                if grep -qE "$json_pattern" <<<"$results_json"; then
                  echo "::error::$f: test results contain a token pattern; not uploading"
                  exit 1
                fi
              done
    ```
- Commands:
  ```bash
  npm run lint:actions
  npm run check
  git add .github/workflows/perf.yml
  git commit -m "ci(documenso): run the sign-in error contract in documenso-smoke"
  ```
- Expected: `lint:actions` exit 0 (actionlint); `npm run check` tail `# tests 417`, `# pass 417`, `# fail 0`.
- **Unit-test count after step 3: 417.**

### Step 4: README row and section

- File: `README.md`.
  - "Known product bugs" row `P6-OBS-DOC-001`: the Severity column stays "low"; the Upstream column stays "not filed (owner files)";
    the Test column gets `tests/documenso/api/doc-obs-001-signin-errors.spec.ts`: `test.fail()` on both negative tests; the Evidence
    column gets "Probe 2026-10-23 at `f4105e47` and read-only `8707e33c`; CI run links added at closeout". The "What happens" column
    stays as it is.
  - New section "### Documenso sign-in errors (Phase 2)" after the Cal state races section: the plan link, the job
    (`documenso-smoke`), the three tests and what they assert, "PRODUCT BUG (owner Q2)", and "No trial count: the test is
    deterministic and runs on every event".
- Commands:
  ```bash
  npx prettier --write README.md
  npm run check
  git add README.md
  git commit -m "docs(readme): link the P6-OBS-DOC-001 sign-in test"
  ```
- **Unit-test count after step 4: 417.**

### Step 5: push, open the PR, closeout placeholders

- `git push -u origin test/2026-10-23-p6-doc-obs-001`, then open the PR with `gh pr create` (rule 6: one PR per task). Use the
  repo's PR template if one exists. The owner decides the merge. Do not use the GitHub connector to create the PR.
- Read CI once after the push (rule 15). Record the run numbers in §14. Closeout needs **3 CI runs (PR + main)** where both
  negative tests are expected failures (owner Q2). If any run does not reproduce, stop and escalate.
- **Unit-test count: 417.**

## 8. CI changes and the time budget

- **CI change.** One step in `documenso-smoke` (§7 step 3a) and one extra grep in the token scan (§7 step 3b). No change to any other
  job, the trial counts, the evidence release or the harness.
- **What the step costs.** No trials, no reruns. Setup: one signup (about 0.56 s in the probe), one mail wait (about 0.27 s),
  one verify, two sign-ins (about 0.3 s each on the probe VM), one cleanup. Playwright startup with `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`
  (already set in the job). Estimate: under 30 s for the step. The estimate is not measured on GitHub; the first run measures it
  (rule 15).
- **Budget.** The job timeout is 45 min (`documenso-smoke`). The step has its own `timeout-minutes: 5`. The step adds under 1 min
  to a job whose heaviest steps are the Documenso build and the races. We state the budget as "under 1 min added; measured on the
  first CI run" and do not publish it.
- **Full trial count.** Not applicable: one deterministic test, run on every event.

## 9. Risks

- **R1. `test.fail()` passes for the wrong reason.** Mitigation: D4 guard before `test.fail()`; `beforeAll` and the setup test are
  real tests; the step 2 control run. The guard path (a wrong password that succeeds goes red) is covered by the unit tests of
  `classifySignin`, not by a run (owner Q8: no stub server).
- **R2. Upstream fixes the bug.** Then `test.fail()` reports as unexpectedly passed and the job turns red on `main`. That is the
  designed signal: remove `test.fail()` and update the README row in the same change.
- **R3. Sign-in logs leak a session or CSRF value.** Mitigation: the CI token scan (`sessionId`, `Bearer`, `/verify-email/…`)
  runs after the step, and now also covers `results/playwright` (E2). The probe found 0 matches (§3.4).
- **R4. The validation 400 echoes the submitted password and CSRF value (§3.2 rows 11–12).** Not in this task's scope (owner Q7:
  candidate `P6-OBS-DOC-003`, backlog). The spec never triggers validation.
- **R5. Memory on CI.** The owner's answer (Q5): CI leaves `NODE_OPTIONS` unset, so the harness default of 8 GB applies, and
  `documenso-smoke` already builds Documenso green on `main`. Locally the owner's flags are `--use-openssl-ca --max-old-space-size=8192`
  (the probe used 6144 alone, which dropped `--use-openssl-ca`). Not blocking. The first CI run of this step is the check.
- **R6. Fork drift.** The test runs at pin `f4105e47`; upstream `main` is `8707e33c`. The finding is on both. Re-check the lines
  before filing upstream (Appendix A).
- **R7. Cleanup (A10).** Unverified until step 2's probe. If it fails, the build stops (§7).
- **R8. The 400/403 choice.** The test accepts two codes (owner Q3, D8). A fix returning a different code (for example 422) fails
  the test and needs a decision, not a silent change.
- **R9. The rate limiter.** `loginRateLimit` is 10 per 15 min per IP and identifier. The spec makes 3 sign-ins per run with a
  unique identifier, so it is under the limit even without the bypass. The harness sets the bypass anyway.

## 10. Contradictions with the roadmap

- **C1.** Roadmap Task 5 says "one **correct** sign-in returning success". The real success status is **201** with an empty body,
  not 200. The plan asserts 201. The roadmap meant "success"; the code says 201. Not a scope change.
- **C2.** Roadmap D8 and Task 5 say "the Task 5 plan records which one the probe sees" (400 or 403). The probe sees **500
  `INVALID_REQUEST`** for the CSRF branch, so neither code is observed. The plan records that and keeps D8 (accept both, owner Q3).
- **C3.** Roadmap Task 5 scope says to use the `src/documenso/account.ts` signup path for the throwaway user. That path returns
  no password (`signUpVerifiedUser`), so it cannot be used for a correct sign-in. D9 adds a helper instead of changing the
  shared function. A deviation from the wording, not from the intent.
- **C4.** Roadmap: "README row links the test and run". The run link cannot exist before the first CI run, so the README row
  gets the run links at closeout (§14). An ordering point, not a scope change.
- **C5.** Roadmap §Task 5 "Files likely touched" lists `perf.yml`; that is the CI change in step 3, which triggered the owner
  review (rule 10). Stated, not hidden.
- **C6.** The user's instruction for the plan said "commit the plan on the `test/...` branch"; rule 10 says the plan goes on a
  `plan/...` branch. The plan is on `plan/2026-10-23-p6-doc-obs-001`; the build is on `test/2026-10-23-p6-doc-obs-001`, as instructed.
- **C7.** Roadmap Task 5 says "label the finding"; the first draft of this plan said SUSPECTED. The owner answer (Q2) makes it
  PRODUCT BUG, the label the roadmap's own rules use for a deterministic code path. Recorded in §0 and D14.

## 11. Proposed extras

- **E1. Validation 400 echoes secrets (candidate `P6-OBS-DOC-003`).** Not in this task (owner Q7: backlog).
- **E2. Scan the Playwright JSON too.** Accepted by the owner. Built in step 3b.
- **E3. Stub control for the guard path.** Not in this task (owner Q8).

## 12. Owner answers (2026-10-23)

The owner reviewed plan `213189c` on 2026-10-23 and gave these answers in this session. Each is applied in the sections named.

- **Q1. Does the new spec feed the CI job summary?** Answer: the summary reads the new JSON. The summary script
  (`scripts/write-ci-job-summary.ts`) reads every JSON file in `results/playwright` (line 34) and merges them into the Playwright
  table (line 46). Our file is `results/playwright/documenso-api.json`, so it appears in the table. Verified by reading the script,
  not by a run; the first CI run shows it. (Applied: §0a 2, §7 step 3.)
- **Q2. Label: PRODUCT BUG now, not SUSPECTED.** Reason (owner): deterministic code path (`AppError` without `statusCode`,
  `onError` maps it to 500), present at the fork pin and upstream `8707e33c`, reproduced 5/5, 20/20 and 3/3. Rule 13's multi-run rule
  is for statistical races. Annotation: type `product-bug`, text "PRODUCT BUG P6-OBS-DOC-001 (low): …" with a one-line reason
  (Medusa `-008` pattern). README keeps PRODUCT BUG. **Closeout must list 3 CI runs (PR + main) where both negative tests are
  expected failures; if any run does not reproduce, stop and escalate.** (Applied: D14, §6.4, §7 step 5, §14.)
- **Q3. 400 or 403.** Answer: accept both (roadmap D8). (Applied: D5, §6.4.)
- **Q4. Cleanup.** Answer: run the `deleteAccount` probe in step 2. `deleteAccount` takes a `DocumensoSession`, not a bare jar.
  If it works, add an `afterAll` that deletes the user and **throws a labelled error** on failure. If it cannot work, stop and
  report before committing step 2. (Applied: D15, §6.4, §7 step 2.)
- **Q5. Memory on CI.** Answer: not a blocker. On the CI runner `NODE_OPTIONS` is unset, so the harness 8 GB default applies, and
  `documenso-smoke` already builds Documenso green on `main` (owner statement; not re-checked by us). Locally use
  `NODE_OPTIONS="--use-openssl-ca --max-old-space-size=8192"`. (Applied: R5, §7.)
- **Q6. Upstream issue search.** Answer: the owner searches upstream issues at filing time (Task 9). (Applied: §3.5, Appendix A.)
- **Q7. Validation echo.** Answer: out of scope; recorded in the owner's backlog as candidate `P6-OBS-DOC-003`. (Applied: §1, R4.)
- **Q8. Stub server.** Answer: no stub server; the `classifySignin` unit tests cover the guard decision. (Applied: R1.)
- **E2. Accepted** (CI fix in §0a 2 and §7 step 3b). **E1 and E3: not in this task.**
- **PR review round (owner, 2026-10-23, PR #41 at `2174fce`).**
  1. Revert the `classifySignin` reorder from `2174fce` (security reason): a 200 or 201 must stay success whatever the body,
     so a wrong password that succeeds cannot pass the guard as bad-credentials. The doc comment states the rule.
  2. Pin it with a unit test: `classifySignin(201, INVALID_CREDENTIALS)` is `success`. The count becomes 417.
  3. Both negative tests assert, before `test.fail()`, that no `sessionId` cookie was set by the rejected sign-in.
  4. Annotation type `issue` (was `product-bug`), with the description still starting `PRODUCT BUG P6-OBS-DOC-001 (low):`.
  5. The JSON scan reads `suites` and `errors` only (§14).
  6. `npm run check` green at 417; prettier on the changed files; commit `test(documenso)`.

## 13. Self-check (rule 20)

- **(a) Roadmap "Done when".** (1) Test runs in CI on PR and `main`: met by step 3 (every event). (2) Setup assertions pass: met
  by `beforeAll` and the setup test (step 2). (3) Two negative assertions fail as expected under `test.fail()`: met by the probe
  (500 on both) and the step 2 run. (4) README row links the test and run: **gap until closeout** (C4): the run links come from the
  CI runs in step 5. (5) Upstream draft ready: met (Appendix A). (6) `npm run check` green: met for the baseline (§3.1) and required
  for every step.
- **(b) Names grep-checked.** `CookieJar`, `generatePassword`, `deleteAccount`, `DocumensoSession` in `src/documenso/account.ts`
  (`deleteAccount` at line 243); `createInbucketClient`, `mailboxName`, `verifyEmailToken` in `src/documenso/inbucket.ts`;
  `documensoBaseUrlFromEnv`, `inbucketBaseUrlFromEnv` in `src/documenso/env.ts`; `p6RunPrefix` in `src/races/prefix.ts` (imported by the
  self-test spec); `documenso-race` project in `playwright.config.ts`; `documenso-smoke` job, the races step (line 1127), the token-scan
  step (line 1143) in `.github/workflows/perf.yml`; the `product-bug` annotation pattern in
  `tests/medusa/races/med-race-008-double-cancel.spec.ts` (line 51); `scripts/write-ci-job-summary.ts` lines 34–46. New files are
  marked NEW in §5.
- **(c) CI estimate.** §8: no trials, no reruns; setup and cleanup included; the step has `timeout-minutes: 5`; the job timeout is
  45 min.
- **(d) Skeletons and commands.** Every new function and test has a skeleton (§6); every step has exact `git add` paths, the commit
  command and the expected `npm run check` output (§7).
- **(e) Owner answers.** Recorded in §12 with the date 2026-10-23. No answer is recorded beyond what the owner gave.

## 14. Closeout notes (fill in before the PR merges)

- **Merge SHA:** `92a9a93` (merge commit of PR #41, merged 2026-10-23 as a merge commit at the reviewed head `b0937e0`).
- **CI runs (3 required, PR + main, both negative tests expected failures): met.**
  1. PR #41, head `4671661`: `documenso-smoke` success; 3 passed, both negative tests expected failures.
  2. PR #41, head `b0937e0`: `documenso-smoke` success; same result.
  3. `main`, run [39961527451](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39961527451), attempt 2:
     `documenso-smoke` success ([job](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39961527451/job/120451886357));
     3 passed, both negative tests expected failures.
     Attempt 1 of the same `main` run failed in `documenso-smoke` and `cal-smoke` at `Start … (harness up)`: Docker registry
     pull of `postgres` returned `500 Internal Server Error`, before any test body ran. Attempt 2 re-ran only the failed jobs
     (repo flake rule); both passed. The other `main` jobs passed in attempt 1.
- **README run links:** met (the `P6-OBS-DOC-001` row links the three runs above).
- **Findings:**
  - Cleanup probe (owner Q4): passed. `deleteAccount` ran in `afterAll` and removed the throwaway user (the row count for
    `%-signin@example.com` returned to 0 after the run). A positive control (one created user, counted, then deleted through
    `deleteAccount`) showed the count sees users, so the 0 is not a false negative. A sign-in check was not used: the spec's
    password is not kept after the run.
  - Summary (Q1): the job summary counts `documenso-api.json` and lists `P6-OBS-DOC-001` under known product bugs (checked by a
    local render of the same script at `b0937e0`; the CI summary page is not readable from here). Cosmetic: each line shows the
    whole annotation description, not a short ID.
- **Deviations from this plan:** the plan branch (C6); the local heap flags (§3.1, R5); _add more as they happen_
  - **E2 scan false positives (three CI runs on PR #41; the first fix was incomplete).**
    1. Head `688e3df`: the JSON scan (E2, owner-accepted) failed on the bare word `sessionId`, which appears in the setup test
       title. The tests passed (3 passed; both `test.fail()` tests expected failures). The owner's fix (`55edc8f`) narrowed the
       JSON scan to `sessionId=[^;[:space:]"]{8,}`, with the other patterns unchanged, and proved the narrowing locally.
    2. Head `55edc8f`: the scan failed again, on a different match. A value-free diagnostic (`f624147`, then `a143094`,
       which print only the JSON key path and string length, never the matched text) found the match in
       `config.metadata.gitDiff`: Playwright writes the repo's git diff into the JSON on CI (about 50 KB, so each file is
       about 320 KB, against 15 KB locally). The diff contains this workflow's own scan patterns (`Bearer `, `sessionId`), so
       the scan matched its own source text, not test output. Local runs have no `gitDiff`, which is why they never matched.
    3. Fix (`4671661`): the JSON scan reads only `suites` and `errors` (`jq -c '{suites, errors}'`, captured into a variable
       before `grep -q`, so `pipefail` cannot turn a SIGPIPE into a silent pass). The value-bearing pattern is unchanged, and
       the web-log and race-histogram scans are unchanged. Tested locally on four scratch cases: repro JSON (pass), a bearer
       string in `config` only (pass), a bearer string in a test title (fail), a cookie value in `errors` (fail).
       Scope change, for the owner to confirm: the JSON scan no longer reads `config`, so a secret that reached the git diff
       would not trip it. Test output is still scanned. The race and web-log scans are unchanged.
       Result: `documenso-smoke` success on `4671661`; the steps `Documenso races`, `Documenso sign-in error contract
(documenso-api)`, `Check Documenso artefacts for tokens`, `Job summary` and `Stop Documenso` all succeeded.
       Q1 finding: the job summary counts `documenso-api.json` (its tests are in the totals), but it does not list
       `P6-OBS-DOC-001` as a known bug. `src/ci/playwright-json-summary.ts` takes known bugs only from annotations of type
       `issue` (`ISSUE_ANNOTATION_TYPE`), and our spec uses type `product-bug`. Proposed fix: change the type to `issue` (test
       change, owner decision). The summary check here was a local render of the same script from the repro JSON, not the CI
       page.

  - **PR review round (owner, 2026-10-23, §12).** (a) The `classifySignin` reorder from `2174fce` (a CodeRabbit outside-diff
    comment, valid as a consistency fix) was reverted in the `b0937e0` commit: a 201 with an error-code body must stay
    success, so the guard cannot pass a successful wrong password as bad-credentials. (b) Unit-test count 416 → 417: the new
    test pins that rule. (c) Both negative tests assert no `sessionId` cookie before `test.fail()`. (d) Annotation type
    `product-bug` → `issue`, so the job summary lists `P6-OBS-DOC-001` as a known bug. (e) The JSON scan reads only `suites`
    and `errors`, and skips `config`, because Playwright writes the repo's git diff into `config.metadata.gitDiff` on CI
    (about 50 KB, with this workflow's own scan patterns in it). Accepted by the owner. Test output is still scanned.
  - **CI and summary, head `b0937e0` (2026-10-23).** `documenso-smoke` success (all six steps, including the sign-in step, the
    token scan and the job summary). The job summary check was a local render of the same script from a local run of the spec
    at this head (the CI summary page is not readable from here): it counts `documenso-api.json` (1 passed, 2 expected
    failures) and lists both `P6-OBS-DOC-001` tests under "Known product bugs still reproducing". Cosmetic gap: each line shows
    the whole annotation description (`PRODUCT BUG P6-OBS-DOC-001 (low)`) rather than a short ID, because
    `issueIdFromDescription` takes the text before the colon. Not changed here; owner decision.

## Appendix A. Draft upstream issue for `P6-OBS-DOC-001` (for the owner to file; not filed by P6)

Template: `documenso/documenso` `.github/ISSUE_TEMPLATE/bug-report.yml` (checked at `8707e33c`). The owner searches existing issues
before filing (Q6).

> **Issue Description.** Wrong credentials and an invalid CSRF token on `POST /api/auth/email-password/authorize` return
> HTTP 500 instead of a 4xx status. A client cannot tell "bad password" from "server fault" by status code.
>
> **Steps to Reproduce.**
>
> 1. `GET /api/auth/csrf` and keep the `csrfToken` cookie and value.
> 2. `POST /api/auth/email-password/authorize` with a verified account's email, a wrong password of 6 or more characters, and the CSRF value.
> 3. Observe the status. Repeat step 2 with a bogus `csrfToken` value.
>
> **Expected Behavior.** Wrong password: 401. Invalid CSRF token: 400 or 403. Neither is a 5xx.
>
> **Current Behavior.** Wrong password: 500 `{"code":"INVALID_CREDENTIALS","message":"Invalid email or password"}`. Bogus CSRF: 500
> `{"code":"INVALID_REQUEST","message":"Invalid CSRF token"}`. Cause: in `packages/auth/server/routes/email-password.ts` the handler
> throws `AppError`s without a `statusCode` (lines 94, 115, 132), and `auth.onError` in `packages/auth/server/index.ts` maps a missing
> `statusCode` to 500.
>
> **Checked at** `8707e33c124e4b1a68dde92d5e05178c9aabd0be` (main). Reproduced in a local run at fork pin `f4105e47`: 5 of 5 sequential
> and 20 of 20 parallel wrong-password attempts; 3 of 3 bad-CSRF attempts. CI run links are added at closeout.
>
> **Screenshots (optional).** Not applicable (HTTP only).
>
> **OS / Browser / Version.** Linux cloud VM for the local run; no browser (HTTP calls); version: main at the commit above.
>
> **Checkboxes.** Owner to check "searched the existing issues" after the search (Q6).
