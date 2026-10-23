# P6 Phase 2 Task 5: `P6-OBS-DOC-001` Documenso sign-in error contract (build plan)

Roadmap: [2026-10-22-p6-phase2-roadmap.md](2026-10-22-p6-phase2-roadmap.md) §Task 5.
Previous task: [2026-10-23-p6-phase2-task4-cal-state-races.md](2026-10-23-p6-phase2-task4-cal-state-races.md) (merged in PR #39).
Rules: [docs/agent-rules.md](../agent-rules.md). Branch for the build: `test/2026-10-23-p6-doc-obs-001`.
This plan lives on `plan/2026-10-23-p6-doc-obs-001` (rule 10). Nothing is built until the owner reviews it,
because this task changes `.github/workflows/perf.yml` and adds `test.fail()` for a product finding (rule 10).

## 0. Status and owner gate

- **Stop point.** Owner review is required before step 1 (CI workflow change; `test.fail()` on a finding).
- **Owner answers.** None were given in this session. Every "proposed answer" below is ours, not the owner's (rule 20e).
- **Open decisions** are in §12. The three that block the build are Q2 (the label), Q3 (400 or 403) and Q5 (memory on CI).

## 1. Goal, scope and the cases covered

- **Goal.** Turn the README-only finding into CI evidence. A wrong password on
  `POST /api/auth/email-password/authorize` must return exactly **401**. A bad CSRF token must return
  **400 or 403**. Neither may return 5xx (roadmap D8). The two negative assertions are `test.fail()` until
  upstream fixes the handler, so CI stays green while the bug is real and turns red once it is fixed.
- **Case.** `P6-OBS-DOC-001` (low). Not a race. Roadmap D7: its own Playwright project `documenso-api`, no browser.
- **What it proves.** Error-contract correctness on sign-in: a client can tell "bad credentials" from
  "server fault". Retry and lockout rules in finance and healthcare portals depend on that.
- **In scope.** One spec with three tests, one pure helper module, one unit-test file, one Playwright project,
  one npm script, one CI step in `documenso-smoke`, one README row, and the upstream issue draft (Appendix A).
- **Out of scope.** The wrong-TOTP branch (P1 `P7-OBS-DOC-2FA-003`, already recorded upstream of this repo),
  any fork change, any harness change, filing the upstream issue (the owner files it).

## 2. Assumptions the build depends on (each one probed in §3)

| #   | Assumption                                                                                               | Probe result                                                                                                                         |
| --- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| A1  | The setup path works: csrf → signup 201 → confirmation mail → verify-email 200 `VERIFIED`                | Confirmed (§3.2)                                                                                                                     |
| A2  | A correct sign-in succeeds with **201** (not 200) and sets a `sessionId` cookie                          | Confirmed: 201, empty body, `Set-Cookie: sessionId` (§3.2). The roadmap said "success"; the real code is 201 (§10, contradiction C1) |
| A3  | A wrong password returns **500** `INVALID_CREDENTIALS` at the fork pin (the bug reproduces)              | Confirmed 5/5 sequential and 20/20 parallel (§3.2, §3.3)                                                                             |
| A4  | A bad CSRF value returns **500** `INVALID_REQUEST` (the CSRF branch, line 94)                            | Confirmed 3/3, plus no cookie (§3.2)                                                                                                 |
| A5  | The per-IP login limiter does not 429 this test                                                          | Confirmed: 0 × 429 in 20 parallel with the harness env (§3.3). The spec sends 3 sign-ins per run, well under 10 per 15 min anyway    |
| A6  | No response body from these calls carries a token or a password (5xx bodies carry only `code`/`message`) | Confirmed for the 5xx bodies. **Not true for the validation 400** (it echoes input, §3.2). The spec never triggers validation (§6.4) |
| A7  | Sign-in logs do not put a session or CSRF value in the web log (CI token scan)                           | Confirmed: web log 34 lines, 0 scan-pattern hits, 0 probe-secret hits (§3.4)                                                         |
| A8  | Upstream `main` still has the same handler (the finding is not fixed upstream)                           | Confirmed at `documenso/documenso` `8707e33c` (2026-10-22) (§3.5)                                                                    |
| A9  | The CSRF fetch route `/api/auth/csrf` is what the k6 smoke uses                                          | Confirmed: `k6/smoke/documenso-health.js` line 14 uses it; probe got 200 (§3.2)                                                      |
| A10 | Cleanup of the throwaway user works with the sign-in session                                             | **Not probed.** `deleteAccount` (src/documenso/account.ts L243) takes a session and calls `profile.deleteAccount`. Open Q4           |

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
| Start, attempt 3                   | `NODE_OPTIONS=--max-old-space-size=6144 npm run up:documenso`                                     | 0    | Typecheck and Vite build passed; `/signin` answered 200.                                                                                                                                                        |
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
| 5   | `POST /api/auth/email-password/verify-email`                          | 200          | `{"state":"VERIFIED"}`                                                                                                                       | 27                       | `sessionId`      | Setup (A1)                                                                              |
| 6   | `POST …/authorize` correct password, valid CSRF                       | **201**      | empty, `text/plain`                                                                                                                          | 315                      | `sessionId`      | Setup assertion (A2): success is **201**                                                |
| 7   | `POST …/authorize` wrong password #1–#5 (valid length, valid CSRF)    | **500**      | `{"code":"INVALID_CREDENTIALS","message":"Invalid email or password"}`                                                                       | 293–311                  | —                | Bug reproduces (A3). Slow: the bcrypt compare runs (line 120)                           |
| 8   | `…/authorize` unknown email, same wrong password                      | **500**      | `{"code":"INVALID_CREDENTIALS",…}` (same message)                                                                                            | 5                        | —                | User-not-found branch (line 115), no bcrypt, same body. No account enumeration by body  |
| 9   | `…/authorize` bad CSRF value #1–#3 (cookie present, body token bogus) | **500**      | `{"code":"INVALID_REQUEST","message":"Invalid CSRF token"}`                                                                                  | 2–3                      | —                | Bug reproduces (A4), line 94                                                            |
| 10  | `…/authorize` no CSRF cookie, body token set                          | **500**      | `{"code":"INVALID_REQUEST",…}`                                                                                                               | 3                        | —                | Same branch (`!csrfCookieToken`)                                                        |
| 11  | `…/authorize` body without `csrfToken`                                | **400**      | zod issues `[{"code":"invalid_type","path":["csrfToken"],"message":"Required"}]` **and `data` echoing the submitted `email` and `password`** | 3                        | —                | Schema validation runs first. **The 400 body echoes input (see R4, Q7)**                |
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
  prove the bug under the CI image's memory or CPU (not measured on GitHub; rule 15: no published timings).
- **Does not prove:** cleanup of the throwaway user (A10).

### 3.4 Web log (`node_modules/qa-portfolio-harness/.harness/documenso-web.log`, after the probe, before stop)

- 34 lines.
- CI token-scan pattern (`perf.yml` "Check Documenso artefacts for tokens"): `api_…`, `Bearer `, `sessionId`,
  `/verify-email/…`, `/sign/…`: **0 matches**.
- Probe passwords (`Probe-…`, `Wrong-Passw0rd-probe`): **0 matches**. Only one `authorize` line appears.

### 3.5 Upstream re-check (read-only, rule of roadmap Task 5)

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
  issues (no read access beyond the clone). Open Q6.

## 4. Design and decisions

Each decision gives its reason. Routine ones are decided here; the owner is asked only about the label, the
memory limit and cleanup (§12).

- **D1. Own Playwright project `documenso-api`, testDir `tests/documenso/api/`, no browser** (roadmap D7).
  Reason: a non-race test does not belong in `documenso-race`; the API project avoids a browser install.
- **D2. Setup is a `beforeAll` that signs up, verifies and signs in once** (roadmap Task 5 scope). Reason: if
  setup fails, `beforeAll` fails the run as a real failure. It is never an expected failure.
- **D3. A real test asserts the correct sign-in is 201 with `sessionId`.** Reason: it proves the account and
  password path work, so a later negative result cannot be a setup error.
- **D4. Each negative test: request → guard → `test.fail()` → product assertion.** Reason (Phase 1 D17 pattern):
  `test.fail()` turns any failure into a pass, so every failure before the product assertion must still be
  red. The guard is `classifySignin(status, text).kind` must be `bad-credentials` (wrong password) or
  `bad-csrf` (bad CSRF). A wrong password that **succeeds** (kind `success`) fails the guard, so it is red,
  never an expected failure. That is the important security case.
- **D5. Wrong password = 401 exactly; bad CSRF = 400 or 403; never 5xx for either** (roadmap D8). Reason: the
  roadmap agreed these expectations; the probe shows 500 for both.
- **D6. A fresh cookie jar and a fresh CSRF per attempt** (what a browser does). Reason: the CSRF check compares
  the body value to the cookie (line 93), so a shared jar would test something else.
- **D7. No response body in any assertion message or console line.** Reason: the 400 validation body echoes input (§3.2
  rows 11–12); the CI artefacts are scanned, and the spec must never add a secret to them. Only status, `code`
  and a fixed label are printed.
- **D8. Passwords and emails.** The password comes from `generatePassword()` (length above 25, in memory,
  per run). The wrong password is `${password}-wrong` (valid length, never a validation case). The email is
  `${p6RunPrefix()}-signin@example.com` (lowercase), so the run prefix isolates the row. Reason: the roadmap
  bans reusing seed passwords; the prefix matches the rest of P6.
- **D9. Helpers in a new module `src/documenso/signin.ts` (NEW), not in `account.ts`.** Reason: the existing
  `signUpVerifiedUser` returns no password, so the correct sign-in cannot be tested through it. Changing its
  return type would touch the Phase 1 and Phase 2 specs (roadmap D1 says reuse as-is). We reuse `CookieJar`,
  `generatePassword`, `createInbucketClient`, `mailboxName`, `verifyEmailToken` and the env getters.
- **D10. Pure helpers `signinPayload` and `classifySignin` are unit tested** (they are the decision logic).
  Reason: they can be checked without a running product, and the unit tests run on every PR.
- **D11. `npm run test:documenso-api`** (roadmap naming). Reason: matches `race:documenso`; keeps the CI step one line.
- **D12. CI: one step in `documenso-smoke`, after the k6 upload and before the races, on every event.** Reason:
  roadmap "CI change"; no trial count (no statistics here). It runs only when `documenso_up` succeeded, like the
  other steps. The job already has the env (`DANGEROUS_BYPASS_RATE_LIMITS`, `DOCUMENSO_BASE_URL`, `INBUCKET_BASE_URL`).
- **D13. The CI step fails the job directly** (no `|| status=$?`). Reason: a regression in these tests is a real
  failure. The race steps use `|| status=$?` only because they write histograms first.
- **D14. Label.** The test annotation says `P6-OBS-DOC-001`, severity low, and `status: SUSPECTED until two full
CI runs reproduce it` (rule 13). The README row keeps "PRODUCT BUG (probe + code path)" as it is today.
  Reason: rule 13. Open Q2 asks the owner to confirm this.
- **D15. Cleanup.** The throwaway user stays in the local database under its run prefix. Reason: A10 is
  unproven; the proposed cleanup (`deleteAccount({jar})` after the tests) is a build-step probe (step 2). If
  it needs a password or fails, the row stays and the closeout names it (Q4).
- **D16. The upstream issue draft is Appendix A.** The owner files it. Reason: roadmap Task 9 says the owner files.

## 5. Files

| Path                                                    | Status | Purpose                                                                                                                                      |
| ------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/documenso/signin.ts`                               | NEW    | `signinPayload`, `classifySignin` (pure); `freshCsrf`, `signinAttempt`, `createVerifiedPasswordUser` (HTTP)                                  |
| `tests/unit/documenso-signin.test.ts`                   | NEW    | Unit tests for the two pure helpers (7 tests)                                                                                                |
| `tests/documenso/api/doc-obs-001-signin-errors.spec.ts` | NEW    | The spec: setup, one real test, two `test.fail()` tests                                                                                      |
| `playwright.config.ts`                                  | edit   | Add project `documenso-api` (`testDir: "tests/documenso/api"`, `use.baseURL: documensoBaseUrlFromEnv()`)                                     |
| `package.json`                                          | edit   | Add script `"test:documenso-api": "playwright test --project=documenso-api"`                                                                 |
| `.github/workflows/perf.yml`                            | edit   | One step in `documenso-smoke`, after the k6 summary upload (line 1126) and before "Documenso races (documenso-race)" (line 1128)             |
| `README.md`                                             | edit   | "Known product bugs" row `P6-OBS-DOC-001`: test link and CI run link (run link at closeout, §14); a short "Documenso sign-in errors" section |
| `docs/plans/2026-10-23-p6-phase2-task5-doc-obs-001.md`  | NEW    | This plan; closeout notes at the end (§14)                                                                                                   |

Existing names used (grep-checked in §13): `CookieJar`, `generatePassword` (`src/documenso/account.ts`);
`createInbucketClient`, `mailboxName`, `verifyEmailToken` (`src/documenso/inbucket.ts`);
`documensoBaseUrlFromEnv`, `inbucketBaseUrlFromEnv` (`src/documenso/env.ts`); `p6RunPrefix` (`src/races/prefix.ts`).

## 6. Code skeletons (each new function and test)

Skeletons are the shape to write, with real names. Keep the repo's style (double quotes, semicolons, 2-space indent,
`.ts` extensions in imports). Run `npx prettier --write` on each new file before the step's commit.

### 6.1 `src/documenso/signin.ts` (NEW, step 1 for the pure part; step 2 for the HTTP part)

```ts
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
 * Pure. 201/200 is success. A known `code` wins over the status: INVALID_CREDENTIALS is bad-credentials
 * (even though the status is 500 today), INVALID_REQUEST is bad-csrf. A zod `error` array is validation.
 * Anything else is server-error. The body is parsed and never returned.
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

/** GET /api/auth/csrf with a fresh jar; returns the jar (csrfToken cookie set) and the token. */
export async function freshCsrf(baseUrl: string): Promise<CsrfSession> {
  const jar = new CookieJar();
  const res = await fetch(`${baseUrl}/api/auth/csrf`);
  jar.absorb(res);
  const body = (await res.json()) as { csrfToken?: unknown };
  if (res.status !== 200 || typeof body.csrfToken !== "string") {
    throw new Error(`PRODUCT BUG: csrf HTTP ${res.status}`);
  }
  return { jar, token: body.csrfToken };
}

export type SigninAttempt = { status: number; text: string; ms: number; setCookieNames: string[] };

/** One sign-in as the browser sends it. `session.token` goes in the body (a bogus value is a bad-CSRF probe). */
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
  const text = await res.text();
  return {
    status: res.status,
    text,
    ms: performance.now() - started,
    setCookieNames: res.headers.getSetCookie().map((c) => c.split("=", 1)[0] ?? ""),
  };
}

/**
 * Setup: csrf → signup (201) → confirmation mail → verify-email (VERIFIED). Returns nothing; the password
 * is the one the caller generated, so the caller can sign in with it. Throws PRODUCT BUG or TEST BUG labels.
 */
export async function createVerifiedPasswordUser(
  baseUrl: string,
  inbucketBaseUrl: string,
  email: string,
  password: string,
): Promise<void> {
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
  const verifyBody = (await verify.json().catch(() => ({}))) as { state?: unknown };
  if (verify.status !== 200 || verifyBody.state !== "VERIFIED") {
    throw new Error(`PRODUCT BUG: verify-email HTTP ${verify.status}`);
  }
}
```

Notes for the junior engineer:

- `generatePassword` is imported only so the spec can use it. Remove it from this file's import if the TypeScript
  check reports it unused (`noUnusedLocals` is on).
- `createVerifiedPasswordUser` throws labels with `PRODUCT BUG:` only for product status codes. A missing mail
  or link is also a product symptom in this flow (the confirmation mail is sent by the product); it is labelled
  `PRODUCT BUG` the same way `signUpVerifiedUser` does. Keep the messages free of the body.

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
import { generatePassword } from "../../../src/documenso/account.ts";
import { documensoBaseUrlFromEnv, inbucketBaseUrlFromEnv } from "../../../src/documenso/env.ts";
import {
  classifySignin,
  createVerifiedPasswordUser,
  freshCsrf,
  signinAttempt,
} from "../../../src/documenso/signin.ts";
import { p6RunPrefix } from "../../../src/races/prefix.ts";

const BASE = documensoBaseUrlFromEnv();
const INBUCKET = inbucketBaseUrlFromEnv();
const email = `${p6RunPrefix()}-signin@example.com`.toLowerCase();
const password = generatePassword();
// Valid length and shape, never equal to the real password. Short passwords are a validation case (400).
const wrongPassword = `${password}-wrong`;

test.beforeAll(async () => {
  // Setup failures are real failures here: beforeAll is never an expected failure.
  await createVerifiedPasswordUser(BASE, INBUCKET, email, password);
});

test("setup: a correct sign-in is 201 and sets sessionId", async () => {
  const session = await freshCsrf(BASE);
  const r = await signinAttempt(BASE, session, { email, password });
  expect(r.status, "correct password").toBe(201);
  expect(r.setCookieNames, "session cookie").toContain("sessionId");
});

test("P6-OBS-DOC-001: wrong password is 401, never 5xx", async () => {
  const session = await freshCsrf(BASE);
  const r = await signinAttempt(BASE, session, { email, password: wrongPassword });
  // Guard, before test.fail(): a wrong password that succeeds must go red, never pass as expected.
  expect(classifySignin(r.status, r.text).kind, "guard: known credentials contract").toBe(
    "bad-credentials",
  );
  test.info().annotations.push({
    type: "known-bug",
    description:
      "P6-OBS-DOC-001 (low). Status: SUSPECTED until two full CI runs reproduce it (rule 13)",
  });
  test.fail(); // Known bug at the fork pin. Remove this line when upstream fixes it (see README).
  expect(r.status, "wrong password must be 401 (roadmap D8)").toBe(401);
});

test("P6-OBS-DOC-001: bad CSRF is 400 or 403, never 5xx", async () => {
  const session = await freshCsrf(BASE);
  const bogus = { jar: session.jar, token: "bogus-csrf-value" };
  const r = await signinAttempt(BASE, bogus, { email, password });
  expect(classifySignin(r.status, r.text).kind, "guard: CSRF contract").toBe("bad-csrf");
  test.info().annotations.push({
    type: "known-bug",
    description:
      "P6-OBS-DOC-001 (low). Status: SUSPECTED until two full CI runs reproduce it (rule 13)",
  });
  test.fail(); // Known bug at the fork pin. Remove this line when upstream fixes it.
  expect([400, 403], "bad CSRF must be 400 or 403 (roadmap D8)").toContain(r.status);
});
```

Rules in this spec, each with its reason:

- **No body in any message.** Assertions print the status and kind only (D7). The response `text` is never passed to `expect` as a message.
- **Only the stated requests.** The spec never sends a password under 6 characters, so validation (400) never runs.
- **No cleanup yet.** D15: cleanup is decided after step 2's probe (Q4). If `deleteAccount({ jar })` works, add it to an `afterAll` that does not throw on failure.
- **Control run (step 2 verification):** point the spec at a closed port. `beforeAll` must fail and the run must exit non-zero. A `test.fail()` test must never report as passed in that run.

### 6.5 `package.json` script (step 2)

```json
    "test:documenso-api": "playwright test --project=documenso-api",
```

Insert it after `"race:documenso"`.

## 7. Build steps (run only after the owner reviews this plan; one commit each)

Each step: make the change, `npx prettier --write <new files>`, `npm run check`, then the unit count check, then
`git add` the exact paths and commit. If a count differs from the table, stop and explain (rule 11). Never edit an expected number.

Starting point for all steps:

```bash
cd /home/user/k6-load-concurrency-suite
git fetch origin main
git checkout test/2026-10-23-p6-doc-obs-001
git merge --ff-only origin/main   # no-op on the first step; the branch starts at origin/main 0728ebe
export PATH="/usr/local/bin:$PATH"
```

### Step 1: pure helpers and unit tests

- Files: `src/documenso/signin.ts` (the pure functions and the HTTP functions from §6.1; HTTP functions compile but are
  not called until step 2), `tests/unit/documenso-signin.test.ts` (§6.2).
- Commands:
  ```bash
  npm run check
  git add src/documenso/signin.ts tests/unit/documenso-signin.test.ts
  git commit -m "test(documenso): add the sign-in error classifier for P6-OBS-DOC-001"
  ```
- Expected `npm run check` tail: `# tests 416`, `# pass 416`, `# fail 0`, exit 0.
- **Unit-test count after step 1: 416** (409 + 7).

### Step 2: the Playwright project, the script and the spec

- Files: `playwright.config.ts` (§6.3), `package.json` (§6.5), `tests/documenso/api/doc-obs-001-signin-errors.spec.ts` (§6.4).
- Commands (list only; no product yet):
  ```bash
  npx playwright test --list --project=documenso-api
  ```
  Expected last line: `Total: 3 tests in 1 file`.
- Then the live run (product up; the Node heap flag is the local VM fix from §3.1):
  ```bash
  NODE_OPTIONS=--max-old-space-size=6144 npm run up:documenso; echo "UP=$?"
  npm run test:documenso-api; echo "TEST=$?"
  npm run down:documenso; echo "DOWN=$?"
  ```
  Expected: `UP=0`, `TEST=0`, `DOWN=0`. Playwright output shows `3 passed` (the two `test.fail()` tests count as
  passed while the bug reproduces; the list reporter shows them with the known-bug annotation).
- Control run (product down, so `DOCUMENSO_BASE_URL` points at a closed port):
  ```bash
  DOCUMENSO_BASE_URL=http://127.0.0.1:3999 npm run test:documenso-api; echo "CONTROL=$?"
  ```
  Expected: `CONTROL` is non-zero, the `beforeAll` error shows a connection refused, and no test reports as passed.
- Cleanup probe (A10, Q4): after the setup test, call `deleteAccount({ jar })` once in a scratch script outside the repo and record its status. Do not commit that probe.
- Commands:
  ```bash
  npm run check
  git add playwright.config.ts package.json tests/documenso/api/doc-obs-001-signin-errors.spec.ts
  git commit -m "test(documenso): add the sign-in error contract spec (P6-OBS-DOC-001)"
  ```
- **Unit-test count after step 2: 416** (no unit change; Playwright counts 3 tests in the list).

### Step 3: CI step in `documenso-smoke`

- File: `.github/workflows/perf.yml`. Insert after the `Upload k6 summary` step (`k6-summary-documenso-health`, line ~1120–1126), before `Documenso races (documenso-race)`:
  ```yaml
  - name: Documenso sign-in error contract (documenso-api)
    id: documenso_api
    if: ${{ steps.documenso_up.outcome == 'success' }}
    working-directory: ${{ env.P6_WORKING_DIRECTORY }}
    run: |
      set -euo pipefail
      npm run test:documenso-api
  ```
  Indentation: match the neighbouring `- name:` steps exactly (6 spaces before `- name`).
- Commands:
  ```bash
  npm run lint:actions
  npm run check
  git add .github/workflows/perf.yml
  git commit -m "ci(documenso): run the sign-in error contract in documenso-smoke"
  ```
- Expected: `lint:actions` exit 0 (actionlint); `npm run check` tail `# tests 416`, `# pass 416`, `# fail 0`.
- **Unit-test count after step 3: 416.**

### Step 4: README row and section

- File: `README.md`.
  - "Known product bugs" row `P6-OBS-DOC-001`: upstream column stays "not filed (owner files, Appendix A)"; the
    "Test" column gets `tests/documenso/api/doc-obs-001-signin-errors.spec.ts`: `test.fail()` on both negative
    tests; the "Evidence" column gets "Probe 2026-10-23 (`8707e33c` read-only, fork `f4105e47`); CI run link added at closeout".
  - New section "### Documenso sign-in errors (Phase 2)" after the Cal state races section: the plan link, the
    job (`documenso-smoke`), the three tests and what they assert, and "No trial count: the test is deterministic
    and runs on every event".
- Commands:
  ```bash
  npx prettier --write README.md
  npm run check
  git add README.md
  git commit -m "docs(readme): link the P6-OBS-DOC-001 sign-in test"
  ```
- **Unit-test count after step 4: 416.**

### Step 5: closeout notes and PR

- Fill §14 (merge SHA, the CI run numbers, findings, deviations, rule slips) when the CI run is green on `main`.
- Open the PR from `test/2026-10-23-p6-doc-obs-001` (rule 6, one PR per task). Use `gh pr create`; use the PR template
  if the repo has one. The owner decides the merge.
- **Unit-test count: 416.**

## 8. CI changes and the time budget

- **CI change.** One step in `documenso-smoke` (§7 step 3). No change to any other job, the trial counts, the token-scan
  pattern, the evidence release or the harness.
- **What the step costs.** No trials, no reruns. Setup: one signup (about 0.56 s in the probe), one mail wait (about 0.27 s),
  one verify, three sign-ins (about 0.3 s each on the probe VM). Playwright startup with `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`
  (already set in the job). Estimate: under 30 s for the step. The estimate is not measured on GitHub; the first run
  measures it (rule 15).
- **Budget.** The job timeout is 45 min (`documenso-smoke`). The step adds well under 1 min to a job whose heaviest step is the
  Documenso build and the races. It does not change the total enough to threaten the timeout. We state the budget as
  "under 1 min added; measured on the first CI run" and do not publish it.
- **Full trial count.** Not applicable: one deterministic test, run on every event.

## 9. Risks

- **R1. `test.fail()` passes for the wrong reason.** Mitigation: D4 guard before `test.fail()`; the `beforeAll` is a
  real test; the step 2 control run. The guard path (a wrong password that succeeds goes red) is covered by reading the
  code, not by a run. Open Q8 asks whether to add a stub-server control.
- **R2. Upstream fixes the bug.** Then `test.fail()` reports as unexpectedly passed, the job turns red on `main`. That is the
  designed signal: remove `test.fail()` and the README row in the same change (Phase 1 rule).
- **R3. Sign-in logs leak a session or CSRF value.** Mitigation: the CI token scan (`sessionId`, `Bearer`, `/verify-email/…`)
  runs after the step. The probe found 0 matches (§3.4). Risk stays if upstream changes its logging.
- **R4. The validation 400 echoes the submitted password and CSRF value (new finding, §3.2 rows 11–12).** Not in this task's
  scope. The spec never triggers validation (§6.4). Q7 asks the owner whether to propose it as a new finding ID.
- **R5. Local VM memory.** The `up:documenso` build ran out of the default Node heap (about 2 GB) on the cloud VM and passed with
  `NODE_OPTIONS=--max-old-space-size=6144`. The CI runner's memory and its default heap are not checked here. If the
  CI build fails the same way, the fix is a harness or environment change (owner decision, Q5), not a P6 change.
- **R6. Fork drift.** The test runs at pin `f4105e47`; upstream `main` is `8707e33c`. The finding is on both. Re-check the lines
  before filing upstream (Appendix A).
- **R7. Cleanup (A10).** Unverified. The throwaway user stays in the local DB under its run prefix until Q4 is answered.
- **R8. The 400/403 choice.** The test accepts two codes (D8). A fix returning a different code (for example 422) fails
  the test and needs a decision, not a silent change.
- **R9. The rate limiter.** `loginRateLimit` is 10 per 15 min per IP and identifier. The spec makes 3 sign-ins per run with
  a unique identifier, so it is under the limit even without the bypass. The harness sets the bypass anyway.

## 10. Contradictions with the roadmap

- **C1.** Roadmap Task 5 says "one **correct** sign-in returning success". The real success status is **201** with an empty body,
  not 200. The plan asserts 201. Our reading: the roadmap meant "success", the code says 201. Not a scope change.
- **C2.** Roadmap D8 and Task 5 say "the Task 5 plan records which one the probe sees" (400 or 403). The probe sees **500
  `INVALID_REQUEST`** for the CSRF branch, so neither code is observed. The plan records that and keeps D8 (accept both).
- **C3.** Roadmap Task 5 scope says to use the `src/documenso/account.ts` signup path for the throwaway user. That path returns
  no password (`signUpVerifiedUser`), so it cannot be used for a correct sign-in. D9 adds a helper instead of changing the
  shared function. A deviation from the wording, not from the intent.
- **C4.** Roadmap: "README row links the test and run". The run link cannot exist before the first CI run, so the row
  gets the run link at closeout (§14, step 4 note). This is an ordering point, not a scope change.
- **C5.** Roadmap §Task 5 "Files likely touched" lists `perf.yml`; that is the CI change in step 3, which triggers the
  owner review (rule 10). Stated, not hidden.
- **C6.** The user's instruction for this run said "create the branch `test/...` and commit the plan on it"; rule 10 says the
  plan goes on a `plan/...` branch. We follow rule 10 for the plan (`plan/2026-10-23-p6-doc-obs-001`) and use the `test/...`
  branch for the build. The test branch has no commit until step 1.

## 11. Proposed extras (out of scope until the owner accepts them)

- **E1. Validation 400 echoes secrets (proposed ID `P6-OBS-DOC-003`).** `POST …/authorize` with a short password or a
  missing `csrfToken` returns the submitted `email`, `password` and `csrfToken` in the 400 body (§3.2 rows 11–12). Severity
  to decide (medium if the password is echoed to any client that can send a request, low otherwise). A test would assert no
  echo; it needs a product decision first. Not labelled, not tested here.
- **E2. Scan the Playwright JSON too.** The CI token scan covers the web log and the race histograms, not `results/playwright`.
  This step writes only list output, so nothing new is stored; the extra makes the scan cover future JSON.
- **E3. Stub control for the guard path.** A small local server that answers `authorize` with 201 would show the wrong-password
  test goes red when a wrong password succeeds. It proves D4 by running, not by reading.

## 12. Open questions (with our proposed answers; none answered by the owner)

- **Q1. Should the new spec feed the CI job summary?** Proposed: no. The summary reads the race JSON files only; the new step
  prints list output. Reason: a non-race test does not need the race table.
- **Q2. Label (blocks the build).** This task adds `test.fail()` for `P6-OBS-DOC-001`, which the README already lists as
  "PRODUCT BUG (probe + code path)". Rule 13 says SUSPECTED until repeated full-count CI runs reproduce it. Proposed: the
  annotation says SUSPECTED (D14); the README keeps its current wording until two CI runs reproduce it; then PRODUCT BUG.
- **Q3. 400 or 403 (blocks the build only if the owner wants one code).** Proposed: accept both (D8, agreed roadmap).
- **Q4. Cleanup of the throwaway user (step 2).** Proposed: try `deleteAccount({ jar })` in an `afterAll` in step 2; if it
  needs a password or fails, leave the row (run prefix) and say so at closeout.
- **Q5. Memory on CI (blocks step 3's first run).** Proposed: merge step 3 and watch the first run. If the Documenso build hits
  the heap limit on CI, the owner decides whether to change the harness or the environment (not a P6 change).
- **Q6. Upstream issue search.** Proposed: the owner searches `documenso/documenso` issues for "email-password authorize 500"
  before filing (the template asks for it). We could not search from this session (out-of-scope read only).
- **Q7. Validation echo (E1).** Proposed: the owner decides whether to create `P6-OBS-DOC-003`. Not in this task.
- **Q8. Stub control (E3).** Proposed: not in this task; add it if the owner wants the guard path proved by running.

## 13. Self-check (rule 20)

- **(a) Roadmap "Done when".** (1) Test runs on PR and `main`: met by step 3 (every event). (2) Setup assertions pass: met
  by the `beforeAll` and the setup test (step 2). (3) Two negative assertions fail as expected under `test.fail()`: met
  by the probe (500 on both) and the step 2 run. (4) README row links the test and run: **gap** for the run link until the
  first green run (C4, Q6 ordering); listed. (5) Upstream draft ready: met (Appendix A). (6) `npm run check` green: met for
  the baseline (§3.1) and required for every step.
- **(b) Names grep-checked.** `CookieJar`, `generatePassword` in `src/documenso/account.ts`; `createInbucketClient`,
  `mailboxName`, `verifyEmailToken` in `src/documenso/inbucket.ts`; `documensoBaseUrlFromEnv`, `inbucketBaseUrlFromEnv` in
  `src/documenso/env.ts`; `p6RunPrefix` in `src/races/prefix.ts` (imported by the self-test spec); `documenso-race` project in
  `playwright.config.ts`; `documenso-smoke` job and the "Upload k6 summary" step in `.github/workflows/perf.yml` (lines
  ~1009 and ~1119–1126). New files are marked NEW in §5.
- **(c) CI estimate.** §8: no trials, no reruns; setup included; under 45-min job timeout with more than 10 min margin
  (the step is under 1 min).
- **(d) Skeletons and commands.** Every new function and test has a skeleton (§6); every step has exact `git add` paths,
  the commit command and the expected `npm run check` output (§7).
- **(e) Owner answers.** None recorded. Every answer in §12 is a proposal.

## 14. Closeout notes (fill in before the PR merges)

- **Merge SHA:** _pending_
- **CI runs:** _pending_ (first green run on `main` with the step; link for the README row)
- **Findings:** _pending_
- **Deviations from this plan:** the plan branch (C6); the local heap flag (§3.1); _add more as they happen_
- **Rule slips:** _pending_ (none recorded so far)

## Appendix A. Draft upstream issue for `P6-OBS-DOC-001` (for the owner to file; not filed by P6)

Template: `documenso/documenso` `.github/ISSUE_TEMPLATE/bug-report.yml` (checked at `8707e33c`). Search existing issues first (Q6).

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
> `statusCode` to 500. The same mapping affects the 2FA code path on the same route.
>
> **Checked at** `8707e33c124e4b1a68dde92d5e05178c9aabd0be` (main). Reproduced at `f4105e47` in our CI; 20 of 20 parallel attempts.
>
> **Screenshots.** Not applicable (HTTP only).
>
> **OS / Browser / Version.** Ubuntu 24.04 (CI image); no browser (HTTP calls); version: main at the commit above.
>
> **Checkboxes.** Owner to check "searched existing issues" after Q6.
