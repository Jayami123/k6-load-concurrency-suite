// The Documenso limiter contract (P6-DOC-LOAD-009, Phase 4 Task 6 §6.5 and §3.4). Pure: the responses of one route come from the case's
// runner. Every route answers its first `max` requests without 429, and request max + 1 is a 429 with the body of its family and the
// headers of the limiter. Pre-limit statuses are recorded, not asserted; a 5xx among them is counted under its suspected id.

export interface LimiterRoute {
  id: string;
  method: "GET" | "POST";
  path: string;
  family: "A" | "B"; // the body family of the 429 (§3.4)
  max: number; // the limit in the window the probe measured
  preLimitId?: string; // the suspected PRODUCT BUG id of a 5xx before the limit (§3.4)
}

/** The ten routes the probe measured (§3.4). The auth routes sit under /api/auth/email-password (packages/auth/server/routes/email-password.ts). */
export const ROUTES: LimiterRoute[] = [
  { id: "trpc", method: "GET", path: "/api/trpc/p6.probe", family: "A", max: 100 },
  { id: "v2", method: "GET", path: "/api/v2/envelope/p6probe", family: "A", max: 1000 },
  { id: "v1", method: "GET", path: "/api/v1/documents", family: "A", max: 1000 },
  { id: "upload", method: "POST", path: "/api/files/upload-pdf", family: "A", max: 20 },
  { id: "ai", method: "POST", path: "/api/ai/p6", family: "A", max: 3 },
  {
    id: "authorize",
    method: "POST",
    path: "/api/auth/email-password/authorize",
    family: "B",
    max: 10,
    preLimitId: "P6-OBS-DOC-001",
  },
  {
    id: "forgot-password",
    method: "POST",
    path: "/api/auth/email-password/forgot-password",
    family: "B",
    max: 3,
  },
  {
    id: "resend-verify-email",
    method: "POST",
    path: "/api/auth/email-password/resend-verify-email",
    family: "B",
    max: 3,
  },
  {
    id: "verify-email",
    method: "POST",
    path: "/api/auth/email-password/verify-email",
    family: "B",
    max: 5,
  },
  {
    id: "reset-password",
    method: "POST",
    path: "/api/auth/email-password/reset-password",
    family: "B",
    max: 5,
    preLimitId: "P6-OBS-DOC-006",
  },
];

/** Routes the probe did not measure, with the reason. They are listed in the report as not asserted, never claimed. */
export const UNPROBED: Array<{ id: string; reason: string }> = [
  { id: "signup", reason: "3 per 3 hours; the runner's own setup uses it once" },
  { id: "update-password", reason: "needs a session" },
  { id: "passkey", reason: "needs a credential" },
  { id: "request-2fa-email", reason: "tRPC, needs a session" },
  { id: "link-org-account", reason: "tRPC, needs a session and an organisation" },
  { id: "report-sender", reason: "needs a state the harness does not provide" },
  { id: "sync-subscription", reason: "needs billing state" },
];

export const BODY_A = '{"error":"Too many requests, please try again later."}';
export const BODY_B = '{"code":"UNKNOWN_ERROR","message":"","statusCode":429}';

export interface Observation {
  status: number;
  contentType?: string;
  body: string;
  headers: Record<string, string>; // lower-case names
}

export interface RouteJudgement {
  route: string;
  verdict: "PASS" | "PRODUCT BUG (SUSPECTED)" | "TEST BUG";
  findings: string[];
  preLimit5xx: Record<string, number>; // suspected id -> count of 5xx before the limit (recorded, not failing)
}

/** Judges one route from its answers in order. nowSec is the epoch second the reset header must lie after. */
export function judgeRoute(
  route: LimiterRoute,
  obs: Observation[],
  nowSec: number,
): RouteJudgement {
  if (obs.length < route.max + 1)
    return {
      route: route.id,
      verdict: "TEST BUG",
      findings: [`only ${obs.length} answers, need ${route.max + 1} (lost requests)`],
      preLimit5xx: {},
    };
  const pre = obs.slice(0, route.max);
  const post = obs[route.max] as Observation;
  const findings: string[] = [];
  const preLimit5xx: Record<string, number> = {};
  const fivexx = pre.filter((o) => o.status >= 500).length;
  if (fivexx > 0 && route.preLimitId) preLimit5xx[route.preLimitId] = fivexx;
  const early = pre.findIndex((o) => o.status === 429);
  if (early !== -1) findings.push(`429 at answer ${early + 1}, before the limit of ${route.max}`);
  if (post.status !== 429) findings.push(`answer ${route.max + 1} is ${post.status}, not 429`);
  if (post.contentType !== "application/json")
    findings.push(`content-type ${post.contentType ?? "missing"}`);
  const want = route.family === "A" ? BODY_A : BODY_B;
  if (post.body !== want) findings.push(`body is not the family ${route.family} body`);
  const h = post.headers;
  if (!/^\d+$/.test(h["retry-after"] ?? "") || Number(h["retry-after"]) < 1)
    findings.push(`Retry-After ${h["retry-after"] ?? "missing"} is not an integer of at least 1`);
  if (h["x-ratelimit-limit"] !== String(route.max))
    findings.push(`X-RateLimit-Limit ${h["x-ratelimit-limit"] ?? "missing"} is not ${route.max}`);
  if (h["x-ratelimit-remaining"] !== "0")
    findings.push(`X-RateLimit-Remaining ${h["x-ratelimit-remaining"] ?? "missing"} is not 0`);
  if (!(Number(h["x-ratelimit-reset"]) > nowSec))
    findings.push(
      `X-RateLimit-Reset ${h["x-ratelimit-reset"] ?? "missing"} is not an epoch second in the future`,
    );
  return {
    route: route.id,
    verdict: findings.length === 0 ? "PASS" : "PRODUCT BUG (SUSPECTED)",
    findings,
    preLimit5xx,
  };
}
