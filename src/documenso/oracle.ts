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
