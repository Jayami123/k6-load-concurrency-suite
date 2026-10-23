import { expect } from "@playwright/test";
import { signInWorkspace } from "../../../src/twenty/auth.ts";
import {
  twentyBaseUrlFromEnv,
  twentyEmailFromEnv,
  twentyPasswordFromEnv,
  twentyWorkspaceNameFromEnv,
} from "../../../src/twenty/env.ts";
import {
  createPostClient,
  type PostClient,
  type TimedPostResult,
} from "../../../src/twenty/timed-post.ts";

export const ENDPOINTS = ["/metadata", "/graphql"] as const;
export type Endpoint = (typeof ENDPOINTS)[number];

export const VALID_QUERY = '{"query":"{ __typename }"}';
export const UNKNOWN_FIELD_BODY = '{"foo":1}';
/** Guard and resource time limit (plan D4): 66x the largest guard time and 71x the largest valid-query time with hung requests, seen in the probe. */
export const GUARD_MS = 1_000;
/** Client timeout for a request that is expected to hang (brief): a 4xx must arrive before it. */
export const HANG_LIMIT_MS = 5_000;
export const HELD_REQUESTS = 10;
/** Held requests must not end by themselves during a test. */
export const HOLD_TIMEOUT_MS = 30_000;
export const SETTLE_MS = 500;

export interface ObsContext {
  base: string;
  authorization: string; // workspace bearer token, in memory only
}

/** Sign in once per file; one unasserted warm-up query per endpoint (D12). Any failure is a TEST BUG (signInWorkspace throws). */
export async function setupObs(): Promise<ObsContext> {
  const base = twentyBaseUrlFromEnv();
  const session = await signInWorkspace({
    baseUrl: base,
    email: twentyEmailFromEnv(),
    password: twentyPasswordFromEnv(),
    workspaceName: twentyWorkspaceNameFromEnv(),
  });
  const client = createPostClient(base);
  try {
    for (const path of ENDPOINTS) {
      await client.post(path, VALID_QUERY, {
        authorization: session.authorizationHeader,
        timeoutMs: HANG_LIMIT_MS,
      });
    }
  } finally {
    client.destroy();
  }
  return { base, authorization: session.authorizationHeader };
}

/** Guards of every test: the endpoint is healthy for this auth mode. Red on failure, never inside test.fail(). */
export async function assertGuards(
  client: PostClient,
  path: Endpoint,
  authorization: string | undefined,
): Promise<void> {
  const valid = await client.post(path, VALID_QUERY, { authorization, timeoutMs: HANG_LIMIT_MS });
  expect(
    { outcome: valid.outcome, status: valid.status },
    `guard: a valid query on ${path} must answer 200`,
  ).toEqual({ outcome: "response", status: 200 });
  expect(valid.totalMs, `guard: valid query time on ${path}`).toBeLessThan(GUARD_MS);
  const unknown = await client.post(path, UNKNOWN_FIELD_BODY, {
    authorization,
    timeoutMs: HANG_LIMIT_MS,
  });
  expect(
    { outcome: unknown.outcome, status: unknown.status },
    `guard: {"foo":1} on ${path} must answer 400`,
  ).toEqual({ outcome: "response", status: 400 });
  expect(unknown.totalMs, `guard: {"foo":1} time on ${path}`).toBeLessThan(GUARD_MS);
}

/** Guards, then the request under test with the 5 s client timeout. The client is destroyed in finally. */
export async function measureHang(
  base: string,
  path: Endpoint,
  body: string,
  authorization: string | undefined,
): Promise<{ result: TimedPostResult; socketsLeft: number }> {
  const client = createPostClient(base);
  try {
    await assertGuards(client, path, authorization);
    const result = await client.post(path, body, { authorization, timeoutMs: HANG_LIMIT_MS });
    return { result, socketsLeft: client.activeSockets() };
  } finally {
    client.destroy();
  }
}

/** Polls until `cond` holds; a miss is a setup error (TEST BUG), never a pass. */
export async function waitUntil(
  cond: () => boolean,
  what: string,
  timeoutMs = 2_000,
  stepMs = 25,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!cond()) {
    if (Date.now() >= deadline) throw new Error(`TEST BUG: ${what} within ${timeoutMs} ms`);
    await new Promise((r) => setTimeout(r, stepMs));
  }
}
