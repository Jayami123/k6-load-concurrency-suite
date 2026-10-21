import type pg from "pg";
import { selectRows, waitForStable } from "../oracles/pg.ts";
import { createInbucketClient } from "./inbucket.ts";

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

/** Waits for at least one row, then for a stable read. On timeout returns what was read (possibly []). */
export async function readWebhookCalls(
  pool: pg.Pool,
  webhookId: string,
): Promise<WebhookCallRow[]> {
  return waitForStable(() => selectRows<WebhookCallRow>(pool, WEBHOOK_CALLS_SQL, [webhookId]), {
    timeoutMs: 15_000,
    accept: (rows) => rows.length > 0,
    returnOnTimeout: true,
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

export const ENVELOPE_SQL = `SELECT id, "secondaryId", status::text AS status FROM "Envelope" WHERE id = $1`;

/** Seal jobs for one legacy document id. Query on jobId: `name` is the display label. */
export const SEAL_JOBS_SQL = `
SELECT id, status::text AS status, retried
FROM "BackgroundJob"
WHERE "jobId" = 'internal.seal-document' AND payload->>'documentId' = $1
ORDER BY "submittedAt"
`;

/** One completed-email job per seal run; the payload carries the envelope id. */
export const EMAIL_JOBS_SQL = `
SELECT id, status::text AS status
FROM "BackgroundJob"
WHERE "jobId" = 'send.document.completed.emails' AND payload->>'envelopeId' = $1
ORDER BY "submittedAt"
`;

/** Webhook jobs for one legacy document id (the execute-webhook payload nests the document as data.id). */
export const WEBHOOK_JOBS_SQL = `
SELECT id, status::text AS status
FROM "BackgroundJob"
WHERE "jobId" = 'internal.execute-webhook' AND payload->'data'->>'id' = $1
ORDER BY "submittedAt"
`;

/** Seal runs that committed. The seal writes this row inside its own transaction. */
export const DOCUMENT_COMPLETED_AUDIT_SQL = `
SELECT COUNT(*)::int AS n
FROM "DocumentAuditLog"
WHERE "envelopeId" = $1 AND type::text = 'DOCUMENT_COMPLETED'
`;

/** Each item's current DocumentData, and whether it differs from the upload. */
export const ITEM_SEALED_SQL = `
SELECT (dd.data <> dd."initialData") AS sealed
FROM "EnvelopeItem" ei
JOIN "DocumentData" dd ON dd.id = ei."documentDataId"
WHERE ei."envelopeId" = $1
`;

/** Whole-table count. A per-trial delta of this is the sealed-PDF count (plan §2.5, D18). */
export const DOCUMENT_DATA_COUNT_SQL = `SELECT COUNT(*)::int AS n FROM "DocumentData"`;

/** Live envelopes of the run. Soft-deleted completed envelopes do not count. */
export const LIVE_ENVELOPE_LEAK_SQL = `
SELECT COUNT(*)::int AS n
FROM "Envelope"
WHERE title LIKE $1 AND "deletedAt" IS NULL
`;

/** Residue, reported and not asserted (plan §2.11, D24). */
export const SOFT_DELETED_ENVELOPE_SQL = `
SELECT COUNT(*)::int AS n
FROM "Envelope"
WHERE title LIKE $1 AND "deletedAt" IS NOT NULL
`;

/** Envelope status after the seal (Q2 setup: COMPLETED in every trial). */
export async function readEnvelopeStatus(
  pool: pg.Pool,
  envelopeId: string,
): Promise<string | null> {
  const rows = await selectRows<{ status: string }>(pool, ENVELOPE_SQL, [envelopeId]);
  return rows[0]?.status ?? null;
}

export type JobRow = { id: string; status: string; retried?: number };

const TERMINAL_JOB_STATUSES = new Set(["COMPLETED", "FAILED"]);

/**
 * Waits until at least one job exists and every job is terminal (COMPLETED or FAILED). The job state is
 * the signal, not the row count: a seal or email job can exist before it has finished (plan D23).
 * On timeout it returns what it read, and the invariant reports the real count.
 */
export async function readTerminalJobs(
  pool: pg.Pool,
  sql: string,
  param: string,
): Promise<JobRow[]> {
  return waitForStable(() => selectRows<JobRow>(pool, sql, [param]), {
    timeoutMs: 20_000,
    stableReads: 2,
    accept: (rows) => rows.length > 0 && rows.every((r) => TERMINAL_JOB_STATUSES.has(r.status)),
    returnOnTimeout: true,
  });
}

export const readSealJobs = (pool: pg.Pool, documentId: number) =>
  readTerminalJobs(pool, SEAL_JOBS_SQL, String(documentId));

export const readEmailJobs = (pool: pg.Pool, envelopeId: string) =>
  readTerminalJobs(pool, EMAIL_JOBS_SQL, envelopeId);

export const readWebhookJobs = (pool: pg.Pool, documentId: number) =>
  readTerminalJobs(pool, WEBHOOK_JOBS_SQL, String(documentId));

/** Call only after the seal jobs are terminal. A count read earlier can be too low (plan D23). */
export async function readCompletedAudit(pool: pg.Pool, envelopeId: string): Promise<number> {
  const rows = await waitForStable(
    () => selectRows<{ n: number }>(pool, DOCUMENT_COMPLETED_AUDIT_SQL, [envelopeId]),
    { timeoutMs: 10_000, stableReads: 2, accept: (r) => r.length > 0, returnOnTimeout: true },
  );
  return Number(rows[0]?.n ?? 0);
}

export async function readItemSealed(
  pool: pg.Pool,
  envelopeId: string,
): Promise<{ items: number; sealed: number }> {
  const rows = await selectRows<{ sealed: boolean }>(pool, ITEM_SEALED_SQL, [envelopeId]);
  return { items: rows.length, sealed: rows.filter((r) => r.sealed === true).length };
}

export async function docDataCount(pool: pg.Pool): Promise<number> {
  const rows = await selectRows<{ n: number }>(pool, DOCUMENT_DATA_COUNT_SQL);
  return Number(rows[0]?.n ?? 0);
}

export async function liveEnvelopeLeak(pool: pg.Pool, titleLike: string): Promise<number> {
  const rows = await selectRows<{ n: number }>(pool, LIVE_ENVELOPE_LEAK_SQL, [titleLike]);
  return Number(rows[0]?.n ?? 0);
}

export async function softDeletedEnvelopes(pool: pg.Pool, titleLike: string): Promise<number> {
  const rows = await selectRows<{ n: number }>(pool, SOFT_DELETED_ENVELOPE_SQL, [titleLike]);
  return Number(rows[0]?.n ?? 0);
}

/**
 * Counts `Signing Complete!` in one recipient mailbox, after the list is stable. The completed mail has no
 * envelope header, so the count is per mailbox: each trial's mailboxes are its own (plan D19).
 */
export async function readCompletedEmailCount(
  inbucket: ReturnType<typeof createInbucketClient>,
  mailbox: string,
): Promise<number> {
  const subjects = await waitForStable(
    async () => (await inbucket.list(mailbox)).map((m) => m.subject),
    {
      timeoutMs: 10_000,
      intervalMs: 300,
      stableReads: 3,
      accept: (s) => s.length > 0,
      returnOnTimeout: true,
    },
  );
  return subjects.filter((s) => s === "Signing Complete!").length;
}
