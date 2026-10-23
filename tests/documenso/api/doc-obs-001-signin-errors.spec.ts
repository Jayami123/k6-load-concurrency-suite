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
      "P6-OBS-DOC-001: PRODUCT BUG (low), wrong password returns 500 INVALID_CREDENTIALS, not 401. Cause: AppError without statusCode, onError maps it to 500.",
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
      "P6-OBS-DOC-001: PRODUCT BUG (low), bad CSRF returns 500 INVALID_REQUEST, not 400 or 403. Cause: AppError without statusCode (line 94), onError maps it to 500.",
  });
  test.fail(); // Known bug at the fork pin. Remove this line when upstream fixes it.
  expect([400, 403], "bad CSRF must be 400 or 403 (roadmap D8)").toContain(r.status);
});
