import { randomBytes } from "node:crypto";
import { createInbucketClient, mailboxName, verifyEmailToken } from "./inbucket.ts";

/** Cookies from Set-Cookie headers; the last value per name wins. Never logged. */
export class CookieJar {
  private cookies = new Map<string, string>();

  absorb(res: Response): void {
    for (const line of res.headers.getSetCookie()) {
      const pair = line.split(";", 1)[0] ?? "";
      const eq = pair.indexOf("=");
      if (eq > 0) this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1));
    }
  }

  header(): string {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  has(name: string): boolean {
    return this.cookies.has(name);
  }
}

/** Per run, in memory only. Length above 25 satisfies ZPasswordSchema's case rules. */
export function generatePassword(): string {
  return `P6-${randomBytes(18).toString("base64url")}!a1`;
}

export function trpcUrl(baseUrl: string, proc: string, input?: unknown): string {
  const base = `${baseUrl}/api/trpc/${proc}`;
  if (input === undefined) return base;
  return `${base}?input=${encodeURIComponent(JSON.stringify({ json: input }))}`;
}

/** Parses `{"result":{"data":{"json":…}}}`. Errors name the procedure, status and code, never the raw body. */
export function parseTrpc<T>(label: string, status: number, text: string): T {
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  const result = (body as { result?: { data?: { json?: T } } } | null)?.result;
  if (status !== 200 || result?.data === undefined) {
    const err = (
      body as { error?: { json?: { message?: unknown; data?: { code?: unknown } } } } | null
    )?.error?.json;
    const code = typeof err?.data?.code === "string" ? ` ${err.data.code}` : "";
    const message = typeof err?.message === "string" ? err.message.slice(0, 200) : "";
    throw new Error(`${label} HTTP ${status}${code}: ${message}`);
  }
  return result.data.json as T;
}

export type DocumensoAccount = {
  email: string;
  teamId: number;
  jar: CookieJar;
  timings: { signupMs: number; confirmMailMs: number; totalMs: number };
};

type Session = { jar: CookieJar; teamId?: number };

function headersFor(s: Session): Record<string, string> {
  const headers: Record<string, string> = { cookie: s.jar.header() };
  if (s.teamId !== undefined) headers["x-team-id"] = String(s.teamId);
  return headers;
}

async function query<T>(baseUrl: string, s: Session, proc: string, input?: unknown): Promise<T> {
  const res = await fetch(trpcUrl(baseUrl, proc, input), { headers: headersFor(s) });
  s.jar.absorb(res);
  return parseTrpc<T>(proc, res.status, await res.text());
}

async function mutate<T>(baseUrl: string, s: Session, proc: string, input?: unknown): Promise<T> {
  const res = await fetch(`${baseUrl}/api/trpc/${proc}`, {
    method: "POST",
    headers: { ...headersFor(s), "content-type": "application/json" },
    body: input === undefined ? undefined : JSON.stringify({ json: input }),
  });
  s.jar.absorb(res);
  return parseTrpc<T>(proc, res.status, await res.text());
}

/**
 * Throws `PRODUCT BUG: verify-email HTTP <status> state <state>` unless the reply is 200 with state
 * VERIFIED. A non-JSON or non-object body counts as state "none"; the body itself is never echoed.
 */
export function checkVerifyEmail(status: number, text: string): void {
  let state: unknown;
  try {
    const parsed: unknown = JSON.parse(text || "{}");
    state =
      typeof parsed === "object" && parsed !== null
        ? (parsed as { state?: unknown }).state
        : undefined;
  } catch {
    state = undefined;
  }
  if (status !== 200 || state !== "VERIFIED") {
    const label = typeof state === "string" ? state.slice(0, 40) : "none";
    throw new Error(`PRODUCT BUG: verify-email HTTP ${status} state ${label}`);
  }
}

/** csrf → signup (201) → confirmation email → verify-email (VERIFIED) → organisation → team. */
export async function signUpVerifiedUser(opts: {
  baseUrl: string;
  inbucketBaseUrl: string;
  email: string;
  name: string;
}): Promise<DocumensoAccount> {
  const started = Date.now();
  const jar = new CookieJar();

  const csrf = await fetch(`${opts.baseUrl}/api/auth/csrf`);
  jar.absorb(csrf);
  await csrf.text();
  if (csrf.status !== 200) {
    throw new Error(`PRODUCT BUG: csrf HTTP ${csrf.status}`);
  }

  const signupStarted = Date.now();
  const signup = await fetch(`${opts.baseUrl}/api/auth/email-password/signup`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: jar.header() },
    body: JSON.stringify({ name: opts.name, email: opts.email, password: generatePassword() }),
  });
  jar.absorb(signup);
  await signup.text();
  if (signup.status !== 201) {
    throw new Error(`PRODUCT BUG: signup HTTP ${signup.status}`);
  }
  const signupMs = Date.now() - signupStarted;

  const inbucket = createInbucketClient(opts.inbucketBaseUrl);
  const mailbox = mailboxName(opts.email);
  const mailStarted = Date.now();
  const mails = await inbucket.waitFor(mailbox, { min: 1, timeoutMs: 15_000 });
  const first = mails[0];
  if (!first) {
    throw new Error(`PRODUCT BUG: no confirmation email for ${mailbox} in 15000 ms`);
  }
  const token = verifyEmailToken(await inbucket.get(mailbox, first.id));
  if (!token) {
    throw new Error("PRODUCT BUG: confirmation email has no /verify-email/<token> link");
  }
  const confirmMailMs = Date.now() - mailStarted;

  const verify = await fetch(`${opts.baseUrl}/api/auth/email-password/verify-email`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: jar.header() },
    body: JSON.stringify({ token }),
  });
  jar.absorb(verify);
  checkVerifyEmail(verify.status, await verify.text());

  const session: Session = { jar };
  const orgs = await query<Array<{ id: string }>>(opts.baseUrl, session, "organisation.getMany");
  const orgId = orgs[0]?.id;
  if (!orgId) throw new Error("PRODUCT BUG: organisation.getMany returned no organisation");
  const teams = await query<{ data: Array<{ id: number }> }>(opts.baseUrl, session, "team.find", {
    organisationId: orgId,
    query: "",
    page: 1,
    perPage: 10,
  });
  const teamId = teams.data[0]?.id;
  if (typeof teamId !== "number") throw new Error("PRODUCT BUG: team.find returned no team");

  return {
    email: opts.email,
    teamId,
    jar,
    timings: { signupMs, confirmMailMs, totalMs: Date.now() - started },
  };
}

export async function createApiToken(
  baseUrl: string,
  a: DocumensoAccount,
  tokenName: string,
): Promise<{ id: number; token: string }> {
  return mutate(baseUrl, a, "apiToken.create", {
    teamId: a.teamId,
    tokenName,
    expirationDate: null,
  });
}

export async function deleteApiToken(baseUrl: string, a: DocumensoAccount, id: number) {
  await mutate(baseUrl, a, "apiToken.delete", { id, teamId: a.teamId });
}

export async function createWebhook(
  baseUrl: string,
  a: DocumensoAccount,
  input: { webhookUrl: string; eventTriggers: string[]; secret: string | null },
): Promise<{ id: string }> {
  return mutate(baseUrl, a, "webhook.createWebhook", { ...input, enabled: true });
}

/** webhook.testWebhook fans out to every team webhook for the event (plan R6). */
export async function testWebhook(
  baseUrl: string,
  a: DocumensoAccount,
  id: string,
  event: string,
): Promise<void> {
  const res = await mutate<{ success: boolean; error?: string }>(
    baseUrl,
    a,
    "webhook.testWebhook",
    { id, event },
  );
  if (!res.success) {
    throw new Error(
      `PRODUCT BUG: webhook.testWebhook success false: ${(res.error ?? "").slice(0, 200)}`,
    );
  }
}

export async function deleteWebhook(baseUrl: string, a: DocumensoAccount, id: string) {
  await mutate(baseUrl, a, "webhook.deleteWebhook", { id });
}

export async function deleteAccount(baseUrl: string, a: DocumensoAccount) {
  await mutate(baseUrl, a, "profile.deleteAccount");
}
