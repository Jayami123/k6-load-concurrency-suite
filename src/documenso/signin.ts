import type { DocumensoSession } from "./account.ts";
import { CookieJar } from "./account.ts";
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

/**
 * GET /api/auth/csrf with a fresh jar. The status is checked before the body is parsed, so a non-JSON error page
 * throws the labelled error and never a bare SyntaxError.
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
