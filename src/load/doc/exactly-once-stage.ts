// The exactly-once stage of P6-DOC-LOAD-003 (plan Phase 4b task 9 §6.4, §7). Reads the run's rows and completion emails, joins them
// with the k6 P6_DOC lines (buildExactlyOnceInput), classifies (classifyExactlyOnce) and writes exactly-once.json (numbers and ids
// only). The SQL is the pipeline check's and is verified only by a live run (the documenso-invariants job).
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type pg from "pg";
import { documensoDatabaseUrlFromEnv } from "../../documenso/env.ts";
import { mailboxName } from "../../documenso/inbucket.ts";
import { DOCUMENT_COMPLETED_AUDIT_SQL } from "../../documenso/oracle.ts";
import type { RunContext } from "../../documenso/run-case.ts";
import { closePool, createReadOnlyPool, selectRows } from "../../oracles/pg.ts";
import { markedLines } from "../cal/invariant-stages.ts";
import { completionTokenOf, type RecipientRow } from "../pipeline-email.ts";
import {
  PIPELINE_DOCUMENTS_SQL,
  PIPELINE_RECIPIENTS_SQL,
  PIPELINE_SEAL_JOBS_SQL,
  PIPELINE_WEBHOOK_CALLS_SQL,
} from "../pipeline-stage.ts";
import { summaryCounter } from "../reconcile/index.ts";
import type { LoadContext, Stage, StageResult } from "../types.ts";
import {
  buildExactlyOnceInput,
  exactlyOnceVerdictOf,
  type DocRows,
  type IterationLine,
} from "./exactly-once-input.ts";

/** The document id of an envelope's secondary id (`document_<n>`), or null for any other shape. */
const docIdOf = (secondaryId: string): number | null => {
  const m = /^document_(\d+)$/.exec(secondaryId);
  return m ? Number(m[1]) : null;
};

/**
 * Reads one DocRows per document of the run: seal jobs, audit rows, webhook calls and the completion-email tokens. Also counts the
 * calls on the run's webhook that name no run document (a null or foreign envelope id): each is an unexplained side effect.
 */
export async function readDocRows(
  pool: pg.Pool,
  run: RunContext,
  prefixLike: string,
): Promise<{ docs: DocRows[]; unmatchedWebhookCalls: number }> {
  const envelopes = await selectRows<{ envelopeId: string; secondaryId: string }>(
    pool,
    PIPELINE_DOCUMENTS_SQL,
    [prefixLike],
  );
  const seals = await selectRows<{ documentId: string; status: string }>(
    pool,
    PIPELINE_SEAL_JOBS_SQL,
    [prefixLike],
  );
  const calls = await selectRows<{ envelopeId: string | null; status: string }>(
    pool,
    PIPELINE_WEBHOOK_CALLS_SQL,
    [run.webhookId],
  );
  const recipients = await selectRows<RecipientRow>(pool, PIPELINE_RECIPIENTS_SQL, [prefixLike]);

  const sealsOf = new Map<string, string[]>();
  for (const s of seals)
    sealsOf.set(s.documentId, [...(sealsOf.get(s.documentId) ?? []), s.status]);
  const callsOf = new Map<string, Array<{ envelopeId: string | null; status: string }>>();
  const runEnvelopes = new Set(envelopes.map((e) => e.envelopeId));
  let unmatchedWebhookCalls = 0;
  for (const c of calls) {
    if (c.envelopeId === null || !runEnvelopes.has(c.envelopeId)) {
      unmatchedWebhookCalls++;
      continue;
    }
    callsOf.set(c.envelopeId, [...(callsOf.get(c.envelopeId) ?? []), c]);
  }
  const recipientsOf = new Map<string, number>();
  const envelopeOfToken = new Map<string, string>();
  for (const r of recipients) {
    recipientsOf.set(r.envelopeId, (recipientsOf.get(r.envelopeId) ?? 0) + 1);
    envelopeOfToken.set(r.token, r.envelopeId);
  }

  // Completion emails: one per recipient, joined by the token of the completion link. Tokens are used in memory only.
  const inbucket = run.inbucket;
  const matched = new Map<string, string[]>();
  const mailboxes = [...new Set(recipients.map((r) => mailboxName(r.email)))];
  for (const mailbox of mailboxes) {
    for (const item of await inbucket.list(mailbox)) {
      const message = await inbucket.get(mailbox, item.id);
      const token = completionTokenOf(message.body);
      const envelopeId = token === undefined ? undefined : envelopeOfToken.get(token);
      if (token === undefined || envelopeId === undefined) continue;
      matched.set(envelopeId, [...(matched.get(envelopeId) ?? []), token]);
    }
  }

  const out: DocRows[] = [];
  for (const e of envelopes) {
    const documentId = docIdOf(e.secondaryId);
    if (documentId === null) continue; // not a document: the line check reports the missing row
    const audit = await selectRows<{ n: number }>(pool, DOCUMENT_COMPLETED_AUDIT_SQL, [
      e.envelopeId,
    ]);
    const own = callsOf.get(e.envelopeId) ?? [];
    out.push({
      envelopeId: e.envelopeId,
      documentId,
      recipients: recipientsOf.get(e.envelopeId) ?? 0,
      sealStatuses: sealsOf.get(String(documentId)) ?? [],
      audit: Number(audit[0]?.n ?? 0),
      webhookEnvelopeIds: own.map((c) => c.envelopeId),
      webhookStatuses: own.map((c) => c.status),
      matchedTokens: matched.get(e.envelopeId) ?? [],
    });
  }
  return { docs: out, unmatchedWebhookCalls };
}

/** P6-DOC-LOAD-003: the exactly-once verdict of one run (plan §6.4). Writes exactly-once.json and returns the stage result. */
export const exactlyOnceStage: Stage = async (ctx: LoadContext): Promise<StageResult> => {
  const run = ctx.handles.documensoRun as RunContext | undefined;
  const prefixLike = String(
    (ctx.config.audit as { prefixLike?: unknown } | undefined)?.prefixLike ?? "",
  );
  const main = ctx.k6.find((k) => k.label === "main") ?? ctx.k6[0];
  if (!run || !prefixLike || !main)
    return {
      ok: false,
      kind: "TEST BUG",
      reasons: ["TEST BUG: exactly-once stage has no run, prefix or k6 run"],
    };

  const lines = markedLines<IterationLine>(main.stdoutPath, "P6_DOC ");
  const summary = JSON.parse(readFileSync(main.summaryPath, "utf8"));
  const pool = createReadOnlyPool(documensoDatabaseUrlFromEnv());
  try {
    const { docs, unmatchedWebhookCalls } = await readDocRows(pool, run, prefixLike);
    const input = buildExactlyOnceInput({
      docs,
      lines,
      droppedIterations: summaryCounter(summary, "dropped_iterations") ?? 0,
      unmatchedWebhookCalls,
    });
    const verdict = exactlyOnceVerdictOf(input);
    writeFileSync(
      path.join(ctx.outDir, "exactly-once.json"),
      `${JSON.stringify({ ...verdict, sequentialDocsRead: docs.length }, null, 2)}\n`,
    );
    const data = { exactlyOnce: verdict.verdict };
    if (verdict.verdict === "PASS" || verdict.verdict === "PASS (P6-OBS-DOC-002 counted)")
      return { ok: true, reasons: verdict.reasons, data };
    const kind =
      verdict.verdict === "FAIL (PRODUCT BUG)"
        ? "PRODUCT BUG"
        : verdict.verdict === "TEST BUG"
          ? "TEST BUG"
          : "INVALID";
    return { ok: false, kind, reasons: verdict.reasons, data };
  } finally {
    await closePool(pool);
  }
};
