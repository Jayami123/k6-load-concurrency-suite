// The Documenso pipeline stage (plan task 9 §6.3). Reads the run's rows and the receiver's deliveries, joins them per document,
// judges the contract and writes pipeline-lag.json (numbers and ids only). The SQL below is verified only by a live run.
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import type pg from "pg";
import { findHits } from "../../scripts/evidence-token-scan.mjs";
import { documensoDatabaseUrlFromEnv } from "../documenso/env.ts";
import type { RunContext } from "../documenso/run-case.ts";
import { closePool, createReadOnlyPool, selectRows } from "../oracles/pg.ts";
import { waitForDrainPool } from "./reconcile/documenso.ts";
import { expectedEmailsOf, readCompletionEmails, type RecipientRow } from "./pipeline-email.ts";
import { judgeWebhookRetry, type RetryInput } from "./webhook-retry.ts";
import { classifyIntents, type IntentLog } from "./knee/intents.ts";
import { docRowsByIntent } from "./knee/doc-intents.ts";
import { limitedLineMismatch, unfinishedFinding } from "./spike/limited.ts";
import { intentCountersFor, summaryCounter } from "./reconcile/index.ts";
import { kneeWindows } from "./knee/stage.ts";
import { lagByStep, lagMarker, type KneeSealLag } from "./knee/lag-by-step.ts";
import {
  joinStages,
  STAGES,
  summariseLag,
  type LagSummary,
  type StageInput,
} from "./pipeline-lag.ts";
import type { LoadContext, Stage, StageResult } from "./types.ts";

/** The contract of plan §7: every stage within 30 s of the last signature, and the backlog drained within 30 s. */
export const CONTRACT_MS = 30_000;

/** The run's documents: the envelope, its document id, completion time and last signature (from the recipient rows). */
export const PIPELINE_DOCUMENTS_SQL = `
SELECT e.id AS "envelopeId", e."secondaryId" AS "secondaryId", e.title AS "title",
  (EXTRACT(EPOCH FROM e."completedAt") * 1000)::bigint::text AS "completedAtMs",
  (SELECT (EXTRACT(EPOCH FROM MAX(r."signedAt")) * 1000)::bigint::text FROM "Recipient" r WHERE r."envelopeId" = e.id) AS "lastSignedMs"
FROM "Envelope" e
WHERE e.title LIKE $1 AND e."deletedAt" IS NULL`;

/** Seal jobs of the run's documents. */
export const PIPELINE_SEAL_JOBS_SQL = `
SELECT payload->>'documentId' AS "documentId", status::text AS status,
  (EXTRACT(EPOCH FROM "completedAt") * 1000)::bigint::text AS "completedAtMs"
FROM "BackgroundJob"
WHERE "jobId" = 'internal.seal-document'
  AND payload->>'documentId' IN (SELECT substring("secondaryId" FROM 'document_([0-9]+)') FROM "Envelope" WHERE title LIKE $1)`;

/** Webhook jobs of the run's documents. */
export const PIPELINE_WEBHOOK_JOBS_SQL = `
SELECT payload->'data'->>'id' AS "documentId", status::text AS status, retried,
  (EXTRACT(EPOCH FROM "completedAt") * 1000)::bigint::text AS "completedAtMs"
FROM "BackgroundJob"
WHERE "jobId" = 'internal.execute-webhook'
  AND payload->'data'->>'id' IN (SELECT substring("secondaryId" FROM 'document_([0-9]+)') FROM "Envelope" WHERE title LIKE $1)`;

/** Webhook calls of the run's webhook, with the envelope id from the request body. */
export const PIPELINE_WEBHOOK_CALLS_SQL = `
SELECT "requestBody"->'payload'->>'envelopeId' AS "envelopeId", status::text AS status, "responseCode",
  (EXTRACT(EPOCH FROM "createdAt") * 1000)::bigint::text AS "createdAtMs"
FROM "WebhookCall"
WHERE "webhookId" = $1`;

/** Completion email jobs of the run's envelopes. */
export const PIPELINE_EMAIL_JOBS_SQL = `
SELECT payload->>'envelopeId' AS "envelopeId", status::text AS status,
  (EXTRACT(EPOCH FROM "completedAt") * 1000)::bigint::text AS "completedAtMs"
FROM "BackgroundJob"
WHERE "jobId" = 'send.document.completed.emails'
  AND payload->>'envelopeId' IN (SELECT id FROM "Envelope" WHERE title LIKE $1)`;

/** The run's recipients: the token of each signing link (the join key of the completion emails) and the mailbox address. */
export const PIPELINE_RECIPIENTS_SQL = `
SELECT r.token AS token, r."envelopeId" AS "envelopeId", r.email AS email
FROM "Recipient" r
JOIN "Envelope" e ON e.id = r."envelopeId"
WHERE e.title LIKE $1 AND e."deletedAt" IS NULL`;

const num = (v: string | null | undefined): number | null =>
  v === null || v === undefined ? null : Number(v);
const docIdOf = (secondaryId: string): number | null => {
  const m = /^document_(\d+)$/.exec(secondaryId);
  return m ? Number(m[1]) : null;
};

/** Reads the run's rows and joins them into the StageInput. Emails are matched by the token of their completion link (pipeline-email.ts). */
export async function readPipelineInput(
  pool: pg.Pool,
  run: RunContext,
  prefixLike: string,
): Promise<{
  input: StageInput;
  expectedEmails: Map<string, number>;
  titles: Array<{ title: string; completed: boolean }>;
}> {
  const docs = await selectRows<{
    envelopeId: string;
    secondaryId: string;
    title: string;
    completedAtMs: string | null;
    lastSignedMs: string | null;
  }>(pool, PIPELINE_DOCUMENTS_SQL, [prefixLike]);
  const documents = docs.map((d) => ({
    documentId: docIdOf(d.secondaryId) ?? -1,
    envelopeId: d.envelopeId,
    completedAtMs: num(d.completedAtMs),
    lastSignedMs: num(d.lastSignedMs),
  }));
  const docOfEnvelope = new Map(documents.map((d) => [d.envelopeId, d.documentId]));
  const seals = await selectRows<{
    documentId: string;
    status: string;
    completedAtMs: string | null;
  }>(pool, PIPELINE_SEAL_JOBS_SQL, [prefixLike]);
  const hooks = await selectRows<{
    documentId: string;
    status: string;
    retried: number;
    completedAtMs: string | null;
  }>(pool, PIPELINE_WEBHOOK_JOBS_SQL, [prefixLike]);
  const calls = await selectRows<{
    envelopeId: string;
    status: string;
    responseCode: number | null;
    createdAtMs: string;
  }>(pool, PIPELINE_WEBHOOK_CALLS_SQL, [run.webhookId]);
  const emailJobs = await selectRows<{
    envelopeId: string;
    status: string;
    completedAtMs: string | null;
  }>(pool, PIPELINE_EMAIL_JOBS_SQL, [prefixLike]);
  const recipients = await selectRows<RecipientRow>(pool, PIPELINE_RECIPIENTS_SQL, [prefixLike]);
  const emails = await readCompletionEmails(run.inbucket, recipients);
  const input: StageInput = {
    documents,
    sealJobs: seals.map((s) => ({
      documentId: Number(s.documentId),
      status: s.status,
      completedAtMs: num(s.completedAtMs),
    })),
    webhookJobs: hooks.map((h) => ({
      documentId: Number(h.documentId),
      status: h.status,
      retried: h.retried,
      completedAtMs: num(h.completedAtMs),
    })),
    webhookCalls: calls
      .filter((c) => docOfEnvelope.has(c.envelopeId))
      .map((c) => ({
        documentId: docOfEnvelope.get(c.envelopeId) ?? -1,
        status: c.status,
        responseCode: c.responseCode,
        createdAtMs: Number(c.createdAtMs),
      })),
    deliveries: run.receiver.deliveries
      .map((d) => ({
        envelopeId: String(
          (d.body as { payload?: { envelopeId?: unknown } } | null)?.payload?.envelopeId ?? "",
        ),
        receivedAtMs: d.receivedAt,
        status: d.status ?? 200,
      }))
      .filter((d) => docOfEnvelope.has(d.envelopeId))
      .map((d) => ({
        documentId: docOfEnvelope.get(d.envelopeId) ?? -1,
        receivedAtMs: d.receivedAtMs,
        status: d.status,
      })),
    emailJobs: emailJobs.map((j) => ({
      envelopeId: j.envelopeId,
      status: j.status,
      completedAtMs: num(j.completedAtMs),
    })),
    emails,
  };
  const titles = docs.map((d) => ({ title: d.title, completed: d.completedAtMs !== null }));
  return { input, expectedEmails: expectedEmailsOf(recipients), titles };
}

export interface PipelineVerdict {
  ok: boolean;
  kind?: "PRODUCT BUG" | "TEST BUG";
  reasons: string[];
  summary: LagSummary;
  knownBugs: Record<string, number>;
}

/** Pure. Missing or duplicated stages (except the known double seal, counted), lags over the contract, and an undrained backlog are PRODUCT BUGs. */
export function evaluatePipeline(
  input: StageInput,
  drain: { drained: boolean; drainMs: number },
  contractMs = CONTRACT_MS,
  expectedEmails?: Map<string, number>,
): PipelineVerdict {
  if (input.documents.length === 0)
    return {
      ok: false,
      kind: "TEST BUG",
      reasons: ["TEST BUG: no documents of the run found (join key or scope)"],
      summary: summariseLag(joinStages(input), contractMs),
      knownBugs: {},
    };
  return judgePipeline(input, drain, contractMs, expectedEmails);
}

/** The judgement of the documents given; the caller decides whether zero documents is a TEST BUG. */
function judgePipeline(
  input: StageInput,
  drain: { drained: boolean; drainMs: number },
  contractMs: number,
  expectedEmails?: Map<string, number>,
): PipelineVerdict {
  const summary = summariseLag(joinStages(input), contractMs);
  const reasons: string[] = [];
  const knownBugs: Record<string, number> = {};
  for (const stage of STAGES) {
    if (stage === "email") continue; // judged below, per recipient
    if (summary.missing[stage] > 0)
      reasons.push(
        `PRODUCT BUG: ${stage} missing for ${summary.missing[stage]} of ${summary.documents} documents`,
      );
  }
  if ((summary.duplicated.seal ?? 0) > 0)
    knownBugs["P6-OBS-DOC-002"] = summary.duplicated.seal ?? 0;
  for (const key of ["webhookJob", "receiverOk", "emailJob"] as const) {
    if ((summary.duplicated[key] ?? 0) > 0)
      reasons.push(`PRODUCT BUG: ${key} duplicated for ${summary.duplicated[key] ?? 0} documents`);
  }
  if (expectedEmails) {
    // One completion email per recipient: fewer is a missing email, more is a duplicated one.
    const got = new Map<string, number>();
    for (const e of input.emails) got.set(e.envelopeId, (got.get(e.envelopeId) ?? 0) + 1);
    let missing = 0;
    let duplicated = 0;
    for (const doc of input.documents) {
      const want = expectedEmails.get(doc.envelopeId) ?? 0;
      const have = got.get(doc.envelopeId) ?? 0;
      if (have < want) missing += 1;
      else if (have > want) duplicated += 1;
    }
    if (missing > 0)
      reasons.push(`PRODUCT BUG: email missing for ${missing} of ${summary.documents} documents`);
    if (duplicated > 0) reasons.push(`PRODUCT BUG: email duplicated for ${duplicated} documents`);
  }
  if (summary.overContract > 0)
    reasons.push(
      `PRODUCT BUG: ${summary.overContract} stage lags over the ${contractMs} ms contract`,
    );
  if (!drain.drained) reasons.push(`PRODUCT BUG: backlog not drained after ${drain.drainMs} ms`);
  return {
    ok: reasons.length === 0,
    kind: reasons.length ? "PRODUCT BUG" : undefined,
    reasons,
    summary,
    knownBugs,
  };
}

/** A knee run's intents for the unfinished documents (plan task 4 §6.4): every envelope of the run, its title and whether it completed. */
export interface KneeDocuments {
  prefix: string;
  started: number;
  interrupted: number;
  log: IntentLog;
  rows: Array<{ title: string; completed: boolean }>;
  /** Only P6-DOC-LOAD-004 (plan §6.5): a limited fail intent may leave one unfinished envelope. */
  exemptLimited?: boolean;
  /** The k6 counter of iterations that saw a 429; its mismatch with the limited lines is a TEST BUG. */
  limitedCounter?: number;
}

/**
 * Pure. Judges the unfinished envelopes of a knee run per intent (plan task 4 §6.4 step 2): an envelope of no started intent is a
 * ghost; two envelopes of one intent a duplicate; an unfinished envelope of an `ok` or a `fail` intent a PRODUCT BUG; only an
 * indeterminate intent may leave one, and at most `interrupted` of those (more is a TEST BUG).
 */
export function judgeUnfinished(k: KneeDocuments): { reasons: string[]; indeterminate: number } {
  const { rowsByIntent, unfinishedByIntent, ghostRows } = docRowsByIntent(k.rows, k.prefix);
  const reasons: string[] = [];
  let ghosts = ghostRows;
  for (const [intent, rows] of rowsByIntent) {
    if (intent < 0 || intent >= k.started) ghosts += rows;
    else if (rows > 1)
      reasons.push(`PRODUCT BUG: intent ${intent} has ${rows} envelopes (duplicate document)`);
  }
  if (ghosts > 0)
    reasons.push(`PRODUCT BUG: ${ghosts} envelope(s) map to no started intent (ghost document)`);
  const classes = classifyIntents(k.log, k.started);
  const ok = new Set(classes.ok);
  const fail = new Set(classes.fail);
  let indeterminate = 0;
  if (k.limitedCounter !== undefined) {
    const mismatch = limitedLineMismatch(k.log.limitedLines ?? 0, k.limitedCounter);
    if (mismatch) reasons.push(mismatch);
  }
  const record = (intent: number, unfinished: number) => ({
    intent,
    outcome: ok.has(intent) ? ("ok" as const) : fail.has(intent) ? ("fail" as const) : undefined,
    limited: k.log.limited?.has(intent) === true,
    envelopes: [
      ...Array.from({ length: unfinished }, () => ({ status: "PENDING" })),
      ...Array.from({ length: (rowsByIntent.get(intent) ?? 0) - unfinished }, () => ({
        status: "COMPLETED",
      })),
    ],
  });
  if (k.exemptLimited === true) {
    // The exact exemption of Task 6 §6.5, applied to every limited intent (including one with no unfinished envelope).
    for (const intent of k.log.limited ?? []) {
      if (intent < 0 || intent >= k.started) continue;
      const finding = unfinishedFinding(record(intent, unfinishedByIntent.get(intent) ?? 0));
      if (finding) reasons.push(`PRODUCT BUG: ${finding}`);
    }
  }
  for (const [intent, unfinished] of unfinishedByIntent) {
    if (intent < 0 || intent >= k.started) continue; // counted as ghosts above
    if (k.exemptLimited === true && k.log.limited?.has(intent)) {
      const finding = unfinishedFinding(record(intent, unfinished));
      if (finding) reasons.push(`PRODUCT BUG: ${finding}`);
      continue;
    }
    if (ok.has(intent))
      reasons.push(
        `PRODUCT BUG: intent ${intent} was told ok and has ${unfinished} unfinished envelope(s)`,
      );
    else if (fail.has(intent))
      reasons.push(
        `PRODUCT BUG: intent ${intent} was told fail and has ${unfinished} unfinished envelope(s)`,
      );
    else indeterminate += unfinished;
  }
  if (indeterminate > k.interrupted)
    reasons.push(
      `TEST BUG: ${indeterminate} unfinished envelope(s) of indeterminate intents, more than the ${k.interrupted} interrupted`,
    );
  return { reasons, indeterminate };
}

/**
 * Pure. The knee's judgement: the unfinished documents are taken out of the stage input and judged per intent; the completed
 * documents are judged as in any run (evaluatePipeline). Without `knee` this is evaluatePipeline.
 */
export function evaluatePipelineKnee(
  input: StageInput,
  drain: { drained: boolean; drainMs: number },
  knee: KneeDocuments | undefined,
  contractMs = CONTRACT_MS,
  expectedEmails?: Map<string, number>,
): PipelineVerdict {
  if (!knee) return evaluatePipeline(input, drain, contractMs, expectedEmails);
  const completed = input.documents.filter((d) => d.completedAtMs !== null);
  const ids = new Set(completed.map((d) => d.envelopeId));
  const completedEmails = expectedEmails
    ? new Map([...expectedEmails].filter(([envelopeId]) => ids.has(envelopeId)))
    : undefined;
  // Every document unfinished (all exempt): judged by judgeUnfinished alone, not as "no documents of the run".
  const judge =
    completed.length === 0 && input.documents.length > 0 ? judgePipeline : evaluatePipeline;
  const verdict = judge({ ...input, documents: completed }, drain, contractMs, completedEmails);
  const judged = judgeUnfinished(knee);
  const reasons = [...verdict.reasons, ...judged.reasons];
  return {
    ok: reasons.length === 0,
    kind:
      reasons.length === 0
        ? undefined
        : reasons.some((r) => r.startsWith("PRODUCT BUG"))
          ? "PRODUCT BUG"
          : "TEST BUG",
    reasons,
    summary: verdict.summary,
    knownBugs: verdict.knownBugs,
  };
}

export interface PipelineDeps {
  openPool: () => pg.Pool;
  readInput: (
    pool: pg.Pool,
    run: RunContext,
    prefixLike: string,
  ) => Promise<{
    input: StageInput;
    expectedEmails: Map<string, number>;
    titles?: Array<{ title: string; completed: boolean }>;
  }>;
  drain: (pool: pg.Pool, prefixLike: string) => Promise<{ drained: boolean; drainMs: number }>;
}

const defaultDeps: PipelineDeps = {
  openPool: () => createReadOnlyPool(documensoDatabaseUrlFromEnv()),
  readInput: readPipelineInput,
  drain: (pool, prefixLike) => waitForDrainPool(pool, prefixLike, CONTRACT_MS),
};

/** The pipeline stage. Writes pipeline-lag.json only after a token scan; the file holds numbers and counts only. */
export function makePipelineStage(deps: PipelineDeps = defaultDeps): Stage {
  return async (ctx: LoadContext): Promise<StageResult> => {
    const run = ctx.handles.documensoRun as RunContext | undefined;
    const prefixLike = String(
      (ctx.config.audit as { prefixLike?: unknown } | undefined)?.prefixLike ?? "",
    );
    if (!run || !prefixLike)
      return {
        ok: false,
        kind: "TEST BUG",
        reasons: ["TEST BUG: pipeline stage has no run or prefix"],
      };
    const pool = deps.openPool();
    try {
      const drain = await deps.drain(pool, prefixLike);
      const { input, expectedEmails, titles } = await deps.readInput(pool, run, prefixLike);
      // A knee run judges the unfinished documents per intent (plan task 4 §6.4); a Phase 3 run is judged as before.
      // A knee or a spike run judges the unfinished documents per intent (plan task 4 §6.4; Task 6 §6.5).
      const isKnee = ctx.caseDef?.runs?.(ctx)?.some((r) => r.knee || r.spike) === true;
      const main = isKnee ? (ctx.k6.find((k) => k.label === "main") ?? ctx.k6[0]) : undefined;
      const summary = main ? JSON.parse(readFileSync(main.summaryPath, "utf8")) : undefined;
      const counters = isKnee ? await intentCountersFor(ctx, summary) : undefined;
      const knee =
        counters && titles
          ? {
              prefix: prefixLike.replace(/%$/, ""),
              started: counters.started,
              interrupted: counters.interrupted,
              log: counters.log,
              rows: titles,
              exemptLimited: ctx.caseDef.limitedFailMayLeaveUnfinished === true,
              limitedCounter: summary ? summaryCounter(summary, "p6_iter_limited") : undefined,
            }
          : undefined;
      const verdict = evaluatePipelineKnee(input, drain, knee, CONTRACT_MS, expectedEmails);
      // The seal lag per hold window (plan task 4 §6.3): completed documents bucketed by their last signature.
      let kneeLag: KneeSealLag | undefined;
      if (knee && summary) {
        const spec = ctx.caseDef.runs(ctx).find((r) => r.knee)?.knee;
        const completedDocs = input.documents.filter((d) => d.completedAtMs !== null);
        const joined = joinStages({ ...input, documents: completedDocs }).map((d, i) => ({
          ...d,
          lastSignedMs: completedDocs[i]?.lastSignedMs ?? null,
        }));
        const byStep = lagByStep(joined, spec ? kneeWindows(summary, spec) : []);
        kneeLag = {
          byStep,
          lagMarker: lagMarker(byStep),
          unfinishedIndeterminate: judgeUnfinished(knee).indeterminate,
        };
      }
      const doc = {
        knee: kneeLag,
        schema: 1,
        contractMs: CONTRACT_MS,
        drained: drain.drained,
        drainMs: drain.drainMs,
        documents: verdict.summary.documents,
        missing: verdict.summary.missing,
        duplicated: verdict.summary.duplicated,
        p50: verdict.summary.p50,
        p95: verdict.summary.p95,
        max: verdict.summary.max,
        overContract: verdict.summary.overContract,
        knownBugs: verdict.knownBugs,
        emails: {
          expected: [...expectedEmails.values()].reduce((a, b) => a + b, 0),
          matched: input.emails.length,
        },
      };
      const text = JSON.stringify(doc, null, 2);
      const file = path.join(ctx.outDir, "pipeline-lag.json");
      if (findHits(text).length > 0) {
        rmSync(file, { force: true });
        return {
          ok: false,
          kind: "TEST BUG",
          reasons: ["pipeline-lag.json matched a token pattern; not kept"],
        };
      }
      writeFileSync(file, `${text}\n`);
      return {
        ok: verdict.ok,
        kind: verdict.kind,
        reasons: verdict.reasons,
        data: { pipeline: doc, pipelineFile: "pipeline-lag.json" },
      };
    } finally {
      await closePool(pool);
    }
  };
}

export const pipelineStage: Stage = makePipelineStage();
export const readPipelineFile = (dir: string) =>
  JSON.parse(readFileSync(path.join(dir, "pipeline-lag.json"), "utf8"));

/** Maps the pipeline rows to the webhook-retry judge's input (one event per document, keyed by document id). */
export function retryInputOf(input: StageInput): RetryInput {
  return {
    events: input.documents.length,
    deliveries: input.deliveries.map((d) => ({ eventKey: String(d.documentId), status: d.status })),
    calls: input.webhookCalls.map((c) => ({
      eventKey: String(c.documentId),
      status: c.status,
      responseCode: c.responseCode,
    })),
    jobs: input.webhookJobs.map((j) => ({
      eventKey: String(j.documentId),
      status: j.status,
      retried: j.retried,
    })),
    completedEnvelopes: input.documents.filter((d) => d.completedAtMs !== null).length,
    documents: input.documents.length,
  };
}

/** The webhook-retry stage of P6-DOC-LOAD-008: judges each event's delivery, call and job (plan task 9 §6.4). */
export function makeWebhookRetryStage(
  deps: Pick<PipelineDeps, "openPool" | "readInput"> = defaultDeps,
): Stage {
  return async (ctx: LoadContext): Promise<StageResult> => {
    const run = ctx.handles.documensoRun as RunContext | undefined;
    const prefixLike = String(
      (ctx.config.audit as { prefixLike?: unknown } | undefined)?.prefixLike ?? "",
    );
    if (!run || !prefixLike)
      return {
        ok: false,
        kind: "TEST BUG",
        reasons: ["TEST BUG: webhook retry stage has no run or prefix"],
      };
    const pool = deps.openPool();
    try {
      const { input } = await deps.readInput(pool, run, prefixLike);
      const verdict = judgeWebhookRetry(retryInputOf(input));
      const failed = verdict.findings.filter((f) => !f.ok);
      return {
        ok: verdict.ok,
        kind: verdict.ok ? undefined : "PRODUCT BUG",
        reasons: failed.map((f) => `PRODUCT BUG: ${f.check}: ${f.detail}`),
        data: {
          webhookRetry: verdict.findings.map((f) => ({
            check: f.check,
            ok: f.ok,
            detail: f.detail,
          })),
        },
      };
    } finally {
      await closePool(pool);
    }
  };
}

export const webhookRetryStage: Stage = makeWebhookRetryStage();
