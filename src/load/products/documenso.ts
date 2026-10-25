import type pg from "pg";
import { failFirstPerEvent, type Responder } from "../../receivers/webhook-receiver.ts";
import { caseDataPrefix } from "../../../k6/lib/pure/prefix.js";
import {
  documensoBaseUrlFromEnv,
  documensoDatabaseUrlFromEnv,
  inbucketBaseUrlFromEnv,
  webhookHostFromEnv,
} from "../../documenso/env.ts";
import {
  endRun,
  fixturePdfPath,
  leakCounts,
  startRun,
  type RunContext,
} from "../../documenso/run-case.ts";
import { likeLiteralPrefix } from "../../medusa/payloads.ts";
import { closePool, createReadOnlyPool, selectRows } from "../../oracles/pg.ts";
import { loadRepoEnv } from "../env.ts";
import type { LoadContext, StageResult } from "../types.ts";

/** Environment names the k6 process receives: the token only, never a config file. */
export const DOCUMENSO_SECRET_ENV = ["DOCUMENSO_API_TOKEN"];

export interface DocumensoDeps {
  openPool: () => pg.Pool;
  start: (input: {
    baseUrl: string;
    inbucketUrl: string;
    runPrefix: string;
    pool: pg.Pool;
    webhookHost: string;
    respond?: Responder;
  }) => Promise<RunContext>;
  end: (ctx: RunContext, mailboxes: string[]) => Promise<string[]>;
  leak: (
    ctx: RunContext,
    mailboxes: string[],
  ) => Promise<{ values: Record<string, number>; violations: string[] }>;
}

const defaultDeps: DocumensoDeps = {
  openPool: () => createReadOnlyPool(documensoDatabaseUrlFromEnv()),
  start: (input) => startRun(input),
  end: endRun,
  leak: leakCounts,
};

const message = (err: unknown): string =>
  (err instanceof Error ? err.message : String(err)).slice(0, 200);

/** The per-run account, API token, webhook and receiver. The token goes to ctx.secrets; the run stays in ctx.handles. */
/** "ok": the receiver answers 200 (P6-DOC-LOAD-001, -002). "fail-first": 500 for the first delivery of each event (P6-DOC-LOAD-008). */
export type WebhookMode = "ok" | "fail-first";

const responderFor = (mode: WebhookMode): Responder | undefined =>
  mode === "fail-first"
    ? failFirstPerEvent(
        (d) => `${d.event}:${String((d.body as { payload?: { id?: unknown } } | null)?.payload?.id ?? "")}`,
      )
    : undefined;

export async function documensoSetupWith(
  ctx: LoadContext,
  deps: DocumensoDeps,
  webhookMode: WebhookMode = "ok",
): Promise<StageResult> {
  loadRepoEnv();
  const pool = deps.openPool();
  try {
    const dataPrefix = caseDataPrefix(ctx.runPrefix, ctx.caseDef.id);
    const { rate, durationSec, maxLatencyMs } = ctx.profile;
    const run = await deps.start({
      baseUrl: documensoBaseUrlFromEnv(),
      inbucketUrl: inbucketBaseUrlFromEnv(),
      runPrefix: dataPrefix,
      pool,
      webhookHost: webhookHostFromEnv(),
      respond: responderFor(webhookMode),
    });
    ctx.handles.documensoRun = run;
    ctx.secrets.DOCUMENSO_API_TOKEN = run.apiToken;
    ctx.config = {
      baseUrl: documensoBaseUrlFromEnv(),
      prefix: dataPrefix,
      pdfPath: fixturePdfPath(),
      rate,
      durationSec,
      maxLatencyMs,
    };
    ctx.config.audit = {
      product: "documenso",
      prefixLike: `${dataPrefix}%`,
      sequentialCompletions: true,
    };
    return { ok: true, reasons: [] };
  } catch (err) {
    await closePool(pool);
    return { ok: false, kind: "TEST BUG", reasons: [`documenso setup failed: ${message(err)}`] };
  }
}

/**
 * Collects the live envelope ids of the run by title prefix (the database, not k6), then ends the run: envelopes, webhook,
 * token, mailboxes, account, receiver. Every failure is a TEST BUG line; the leak counts are read last.
 */
export async function documensoCleanupWith(ctx: LoadContext, deps: DocumensoDeps): Promise<StageResult> {
  const run = ctx.handles.documensoRun as RunContext | undefined;
  if (!run) return { ok: true, reasons: [] }; // setup never created a run: nothing to sweep
  const reasons: string[] = [];
  let mailboxes: string[] = [];
  try {
    const titleLike = likeLiteralPrefix(run.runPrefix);
    const envelopes = await selectRows<{ id: string | number }>(
      run.pool,
      `SELECT id FROM "Envelope" WHERE title LIKE $1 AND "deletedAt" IS NULL`,
      [titleLike],
    );
    run.envelopeIds = envelopes.map((row) => String(row.id));
    const recipients = await selectRows<{ email: string }>(
      run.pool,
      `SELECT DISTINCT r.email FROM "Recipient" r JOIN "Envelope" e ON e.id = r."envelopeId" WHERE e.title LIKE $1`,
      [titleLike],
    );
    mailboxes = recipients.map((row) => row.email.split("@")[0] ?? "");
  } catch (err) {
    // The run still ends: an empty mailbox list lets endRun purge the account, and the failure stays a TEST BUG.
    reasons.push(`TEST BUG: cleanup documenso discovery failed: ${message(err)}`);
  }
  try {
    reasons.push(...(await deps.end(run, mailboxes)));
    reasons.push(...(await deps.leak(run, mailboxes)).violations);
  } catch (err) {
    reasons.push(`TEST BUG: cleanup documenso failed: ${message(err)}`);
  } finally {
    await closePool(run.pool);
  }
  return reasons.length === 0 ? { ok: true, reasons: [] } : { ok: false, kind: "TEST BUG", reasons };
}

/** The setup stage of a Documenso case (plan task 9 §6.5). */
export const makeDocumensoSetup =
  (opts: { webhookMode: WebhookMode }) =>
  (ctx: LoadContext): Promise<StageResult> =>
    documensoSetupWith(ctx, defaultDeps, opts.webhookMode);

export const documensoSetup = makeDocumensoSetup({ webhookMode: "ok" });
export const documensoCleanup = (ctx: LoadContext): Promise<StageResult> =>
  documensoCleanupWith(ctx, defaultDeps);
