import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type pg from "pg";
import { fireTogether, summariseBody } from "../races/fire-together.ts";
import { createHistogram, writeHistogram } from "../races/histogram.ts";
import {
  createRerunRunner,
  spreadPolicyFromEnv,
  sumOracle,
  validAttempts,
} from "../races/rerun-on-spread.ts";
import { runTrials } from "../races/run-trials.ts";
import { recordTrial } from "../races/trial-record.ts";
import type {
  RaceHistogram,
  RaceOracleValue,
  RaceRequestResult,
  RaceAttemptResult,
} from "../races/types.ts";
import { casePrefix, likeLiteralPrefix } from "../medusa/payloads.ts";
import {
  createApiToken,
  createWebhook,
  deleteAccount,
  deleteApiToken,
  deleteWebhook,
  signUpVerifiedUser,
  type DocumensoAccount,
  type DocumensoSession,
} from "./account.ts";
import {
  completeWithToken,
  createEnvelope,
  createRecipients,
  createSignatureFields,
  deleteEnvelope,
  distribute,
  expectOk,
  getEnvelope,
  signFieldWithToken,
} from "./api.ts";
import { createInbucketClient, mailboxName } from "./inbucket.ts";
import {
  legacyDocumentId,
  documentTitle,
  recipientBodies,
  signatureFieldBodies,
  signValue,
} from "./payloads.ts";
import {
  docDataCount,
  leakCheck,
  liveEnvelopeLeak,
  readCompletedAudit,
  readCompletedEmailCount,
  readEmailJobs,
  readEnvelopeStatus,
  readItemSealed,
  readSealJobs,
  readWebhookCalls,
  readWebhookJobs,
  softDeletedEnvelopes,
} from "./oracle.ts";
import {
  checkCompletionTrial,
  classifyCompletion,
  countClasses,
  trialDoubleSealed,
  type CompletionClass,
  type CompletionMode,
  type TrialSnapshot,
} from "./invariants.ts";
import { startWebhookReceiver } from "./webhook-receiver.ts";

export type RunContext = {
  baseUrl: string;
  inbucket: ReturnType<typeof createInbucketClient>;
  runPrefix: string; // lower-case, see the prefix gotcha above
  pool: pg.Pool;
  account: DocumensoAccount;
  apiToken: string;
  apiTokenId: number;
  webhookId: string;
  webhookHost: string;
  receiver: Awaited<ReturnType<typeof startWebhookReceiver>>;
  envelopeIds: string[]; // live envelopes of this run; each trial removes its own, endRun sweeps the rest
};

/** The fork's example PDF, found through PRODUCTS_ROOT (the same root the harness uses). */
export function fixturePdfPath(env: NodeJS.ProcessEnv = process.env): string {
  const root = env.PRODUCTS_ROOT?.trim() || "../products";
  return path.resolve(process.cwd(), root, "documenso", "assets", "example.pdf");
}

export async function readFixturePdf(env: NodeJS.ProcessEnv = process.env): Promise<Uint8Array> {
  const file = fixturePdfPath(env);
  try {
    return await readFile(file);
  } catch {
    throw new Error(`ENV: fork fixture missing at ${file} (run scripts/bootstrap.sh documenso)`);
  }
}

/** The network calls startRun makes. Production uses the real helpers; the unit test replaces them. */
export type StartRunDeps = {
  startReceiver: typeof startWebhookReceiver;
  signUp: typeof signUpVerifiedUser;
  createToken: typeof createApiToken;
  createHook: typeof createWebhook;
  removeAccount: typeof deleteAccount;
  purgeMailbox: (inbucketUrl: string, mailbox: string) => Promise<unknown>;
};

const REAL_START_RUN_DEPS: StartRunDeps = {
  startReceiver: startWebhookReceiver,
  signUp: signUpVerifiedUser,
  createToken: createApiToken,
  createHook: createWebhook,
  removeAccount: deleteAccount,
  purgeMailbox: (inbucketUrl, mailbox) => createInbucketClient(inbucketUrl).purge(mailbox),
};

/**
 * Per-run account, API token, DOCUMENT_COMPLETED webhook and receiver. Throws in setup. On a setup failure
 * after the owner is verified, the owner is deleted and its mailbox purged, best effort; the original error
 * is rethrown whatever the cleanup does.
 */
export async function startRun(
  input: {
    baseUrl: string;
    inbucketUrl: string;
    runPrefix: string;
    pool: pg.Pool;
    webhookHost: string;
  },
  deps: StartRunDeps = REAL_START_RUN_DEPS,
): Promise<RunContext> {
  const runPrefix = input.runPrefix.toLowerCase();
  const ownerEmail = `${runPrefix}-owner@example.com`;
  const secret = randomBytes(16).toString("hex");
  const receiver = await deps.startReceiver({
    publicHost: input.webhookHost,
    expectedSecret: secret,
  });
  const inbucket = createInbucketClient(input.inbucketUrl);
  // Filled by signUp's onVerified hook, so a later setup failure can still delete the verified owner.
  const owner: { session?: DocumensoSession } = {};
  try {
    const account = await deps.signUp({
      baseUrl: input.baseUrl,
      inbucketBaseUrl: input.inbucketUrl,
      email: ownerEmail,
      name: "P6 Race Owner",
      onVerified: (session) => {
        owner.session = session;
      },
    });
    const token = await deps.createToken(input.baseUrl, account, `${runPrefix}-token`);
    const hook = await deps.createHook(input.baseUrl, account, {
      webhookUrl: receiver.url,
      eventTriggers: ["DOCUMENT_COMPLETED"],
      secret,
    });
    return {
      baseUrl: input.baseUrl,
      inbucket,
      runPrefix,
      pool: input.pool,
      account,
      apiToken: token.token,
      apiTokenId: token.id,
      webhookId: hook.id,
      webhookHost: input.webhookHost,
      receiver,
      envelopeIds: [],
    };
  } catch (err) {
    // Best effort, in this order. A cleanup failure must not hide the setup error rethrown below.
    if (owner.session) {
      await deps.removeAccount(input.baseUrl, owner.session).catch(() => undefined);
    }
    await deps.purgeMailbox(input.inbucketUrl, mailboxName(ownerEmail)).catch(() => undefined);
    await receiver.close().catch(() => undefined);
    throw err;
  }
}

/**
 * Removes what the run created, in this order (plan §9): any live envelope (completed ones are soft-deleted),
 * the webhook, the API token, the mailboxes, the account (last: it re-owns completed envelopes, §2.11), the
 * receiver. Every failure becomes a TEST BUG line. Nothing here throws.
 */
export async function endRun(ctx: RunContext, recipientMailboxes: string[]): Promise<string[]> {
  const violations: string[] = [];
  const step = async (name: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      violations.push(`TEST BUG: cleanup ${name} failed: ${message.slice(0, 200)}`);
    }
  };
  for (const [i, envelopeId] of ctx.envelopeIds.entries()) {
    await step(`envelope/delete #${i}`, async () => {
      const status = await deleteEnvelope(ctx.baseUrl, ctx.apiToken, envelopeId);
      if (status !== 200) throw new Error(`HTTP ${status}`);
    });
  }
  await step("deleteWebhook", () => deleteWebhook(ctx.baseUrl, ctx.account, ctx.webhookId));
  await step("deleteApiToken", () => deleteApiToken(ctx.baseUrl, ctx.account, ctx.apiTokenId));
  for (const mb of [...recipientMailboxes, mailboxName(ctx.account.email)]) {
    await step(`purge ${mb.slice(0, 40)}`, () => ctx.inbucket.purge(mb));
  }
  await step("deleteAccount", () => deleteAccount(ctx.baseUrl, ctx.account));
  await step("receiverClose", () => ctx.receiver.close());
  return violations;
}

/** Leak counts after endRun. Every count must be 0; `softDeletedEnvelopes` is residue and is only reported. */
export async function leakCounts(
  ctx: RunContext,
  recipientMailboxes: string[],
): Promise<{ values: Record<string, number>; violations: string[] }> {
  const runLike = likeLiteralPrefix(`${ctx.runPrefix}-`);
  let remaining = 0;
  for (const mb of recipientMailboxes) remaining += (await ctx.inbucket.list(mb)).length;
  const base = await leakCheck(ctx.pool, {
    userLikePattern: runLike,
    teamId: ctx.account.teamId,
    mailboxCount: remaining,
  });
  const leakEnvelopesLive = await liveEnvelopeLeak(ctx.pool, runLike);
  const values = {
    ...base.counts,
    leakEnvelopesLive,
    softDeletedEnvelopes: await softDeletedEnvelopes(ctx.pool, runLike),
  };
  const violations = [...base.violations];
  if (leakEnvelopesLive !== 0)
    violations.push(`TEST BUG: leakEnvelopesLive = ${leakEnvelopesLive} after cleanup`);
  return { values, violations };
}

export type TrialDoc = {
  envelopeId: string;
  documentId: number;
  recipientIds: number[];
  tokens: Map<number, string>;
  mailboxes: string[];
};

/** Creates a document with `count` recipients, one signature field each, distributes it and signs every field. */
export async function prepareDocument(
  ctx: RunContext,
  opts: {
    casePfx: string;
    trial: number;
    attempt: number;
    count: number;
    label: string;
    pdf: Uint8Array;
  },
): Promise<TrialDoc> {
  const title = documentTitle(opts.casePfx, opts.trial, opts.label, opts.attempt);
  const envelopeId = await createEnvelope(ctx.baseUrl, ctx.apiToken, title, opts.pdf);
  ctx.envelopeIds.push(envelopeId); // registered before the rest, so endRun deletes it if a later step fails
  const bodies = recipientBodies(opts.casePfx, opts.trial, opts.count, opts.attempt);
  const recipientIds = await createRecipients(ctx.baseUrl, ctx.apiToken, envelopeId, bodies);
  const env = await getEnvelope(ctx.baseUrl, ctx.apiToken, envelopeId);
  const fields = await createSignatureFields(
    ctx.baseUrl,
    ctx.apiToken,
    envelopeId,
    signatureFieldBodies({ envelopeItemId: env.itemId, recipientIds }),
  );
  const tokens = await distribute(ctx.baseUrl, ctx.apiToken, envelopeId);
  for (const [index, recipientId] of recipientIds.entries()) {
    const field = fields.find((f) => f.recipientId === recipientId);
    const token = tokens.get(recipientId);
    if (!field || !token) throw new Error("TEST BUG: recipient has no field or no signing token");
    expectOk(
      "field.signFieldWithToken",
      await signFieldWithToken(ctx.baseUrl, token, field.id, signValue(index)),
    );
  }
  return {
    envelopeId,
    documentId: legacyDocumentId(env.secondaryId),
    recipientIds,
    tokens,
    mailboxes: bodies.map((b) => mailboxName(b.email)),
  };
}

function payloadEnvelopeId(body: unknown): string | null {
  const id = (body as { payload?: { envelopeId?: unknown } } | null)?.payload?.envelopeId;
  return typeof id === "string" ? id : null;
}

/** Reads every per-trial oracle after the seal, email and webhook jobs are terminal (plan D23). */
export async function readSnapshot(
  ctx: RunContext,
  doc: TrialDoc,
  docDataBefore: number,
): Promise<TrialSnapshot> {
  const sealJobs = await readSealJobs(ctx.pool, doc.documentId);
  const emailJobs = await readEmailJobs(ctx.pool, doc.envelopeId);
  const webhookJobs = await readWebhookJobs(ctx.pool, doc.documentId);
  const completedAuditRows = await readCompletedAudit(ctx.pool, doc.envelopeId);
  const items = await readItemSealed(ctx.pool, doc.envelopeId);
  const envelopeStatus = await readEnvelopeStatus(ctx.pool, doc.envelopeId);
  const docDataDelta = (await docDataCount(ctx.pool)) - docDataBefore;
  const completedEmails: number[] = [];
  for (const mb of doc.mailboxes)
    completedEmails.push(await readCompletedEmailCount(ctx.inbucket, mb));
  const deliveries = ctx.receiver.deliveries.filter(
    (d) => payloadEnvelopeId(d.body) === doc.envelopeId,
  );
  const calls = await readWebhookCalls(ctx.pool, ctx.webhookId);
  const webhookCallRows = calls
    .filter(
      (c) =>
        payloadEnvelopeId(c.requestBody) === doc.envelopeId && c.event === "DOCUMENT_COMPLETED",
    )
    .map((c) => ({ status: c.status, responseCode: c.responseCode }));
  return {
    sealJobs,
    emailJobs,
    webhookJobs,
    completedAuditRows,
    itemDocs: items.items,
    itemsSealed: items.sealed,
    docDataDelta,
    completedEmails,
    webhookDeliveries: deliveries.length,
    webhookCallRows,
    envelopeStatus,
    webhookHost: ctx.webhookHost,
  };
}

/** Sequential control: the same completions, one after another, with a 300 ms gap. */
export async function sequentialCompletions(
  n: number,
  complete: (i: number) => Promise<{ status: number | null; body: string }>,
): Promise<{ requests: RaceRequestResult[]; dispatchSpreadMs: number }> {
  const requests: RaceRequestResult[] = [];
  for (let i = 0; i < n; i++) {
    const { status, body } = await complete(i);
    requests.push({
      index: i,
      status,
      bodySummary: summariseBody(status, body),
      startedAtMs: 0,
      endedAtMs: 0,
    });
    await new Promise((r) => setTimeout(r, 300));
  }
  return { requests, dispatchSpreadMs: 0 };
}

function oracleOf(
  s: TrialSnapshot,
  c: Record<CompletionClass, number>,
): Record<string, RaceOracleValue> {
  return {
    sealJobs: s.sealJobs.length,
    sealJobsRetried: s.sealJobs.filter((j) => (j.retried ?? 0) > 0).length,
    completedAuditRows: s.completedAuditRows,
    sealedItemDocs: s.itemsSealed,
    docDataDelta: s.docDataDelta,
    emailJobs: s.emailJobs.length,
    completedEmailsMin: Math.min(...s.completedEmails),
    completedEmailsMax: Math.max(...s.completedEmails),
    webhookDeliveries: s.webhookDeliveries,
    webhookCallRows: s.webhookCallRows.length,
    signedResponses: c.SIGNED,
    alreadySignedResponses: c.ALREADY_SIGNED,
    clientErrorResponses: c["client-error"],
    serverErrorResponses: c["server-error"],
    doubleSealed: trialDoubleSealed(s),
    envelopeCompletedTrials: s.envelopeStatus === "COMPLETED" ? 1 : 0,
  };
}

export type CaseResult = {
  histogram: RaceHistogram;
  productViolations: string[]; // every "PRODUCT BUG: …" line, across trials
  testViolations: string[]; // everything else: TEST BUG, ENV, TEST BUG (control)
  doubleSealTrials: number; // attempts (valid and invalid) that sealed twice (D3)
  attempts: number; // every burst that was fired: valid trials plus invalid attempts
};

const splitViolations = (all: string[]) => ({
  productViolations: all.filter((v) => v.startsWith("PRODUCT BUG")),
  testViolations: all.filter((v) => !v.startsWith("PRODUCT BUG")),
});

export async function runCompletionCase(input: {
  baseUrl: string;
  inbucketUrl: string;
  runPrefix: string;
  pool: pg.Pool;
  webhookHost: string;
  caseId: string;
  title: string;
  mode: CompletionMode;
  trials: number;
}): Promise<CaseResult> {
  const burst = input.mode === "same-recipient" ? 10 : 2;
  const recipientCount = input.mode === "same-recipient" ? 1 : 2;
  const casePfx = casePrefix(input.runPrefix, input.caseId);
  const pdf = await readFixturePdf();
  const docDataAtStart = await docDataCount(input.pool); // residue baseline (Q4)
  const ctx = await startRun(input);
  const histogram = createHistogram({
    caseId: input.caseId,
    title: input.title,
    product: "documenso",
    concurrency: burst,
    trials: input.trials,
  });
  const runner = createRerunRunner(spreadPolicyFromEnv(), input.trials);
  const violations: string[] = [];
  const recipientMailboxes: string[] = [];
  try {
    const runAttempt = async (trial: number, attempt: number): Promise<RaceAttemptResult> => {
      // Re-read at the start of every attempt: DocumentData rows survive envelope/delete, so an invalid
      // attempt's rows must be in this baseline, never in the next attempt's delta (phase 2 task 1 plan, D18).
      const docDataBefore = await docDataCount(ctx.pool);
      let doc: TrialDoc | null = null;
      try {
        doc = await prepareDocument(ctx, {
          casePfx,
          trial,
          attempt,
          count: recipientCount,
          label: input.mode,
          pdf,
        });
        recipientMailboxes.push(...doc.mailboxes);
        const current = doc;
        const tokenFor = (i: number) =>
          current.tokens.get(current.recipientIds[input.mode === "same-recipient" ? 0 : i]!)!;
        const raw: string[] = [];
        const complete = async (i: number) => {
          const res = await completeWithToken(ctx.baseUrl, tokenFor(i), current.documentId);
          raw[i] = res.text;
          return { status: res.status, body: res.text };
        };
        const fired =
          input.mode === "sequential-control"
            ? await sequentialCompletions(burst, complete)
            : await fireTogether(burst, complete, {
                warm: async () => {
                  const res = await fetch(`${ctx.baseUrl}/api/auth/csrf`);
                  await res.text();
                },
              });
        const snapshot = await readSnapshot(ctx, current, docDataBefore);
        const classes = fired.requests.map((r) => classifyCompletion(r.status, raw[r.index] ?? ""));
        const trialViolations = checkCompletionTrial({
          mode: input.mode,
          burst,
          classes,
          snapshot,
        });
        // recordTrial's validate hook is not used: every violation must be its own entry (plan §8.5).
        const record = recordTrial(trial, fired, () => undefined);
        record.oracle = oracleOf(snapshot, countClasses(classes));
        record.invariantViolations = trialViolations;
        record.ok = trialViolations.length === 0;
        if (!record.ok) record.error = trialViolations[0];
        return record;
      } finally {
        if (doc) {
          const removed = doc;
          const status = await deleteEnvelope(ctx.baseUrl, ctx.apiToken, removed.envelopeId).catch(
            () => -1,
          );
          if (status !== 200) violations.push(`TEST BUG: cleanup envelope/delete HTTP ${status}`);
          ctx.envelopeIds = ctx.envelopeIds.filter((id) => id !== removed.envelopeId);
          for (const mb of removed.mailboxes) await ctx.inbucket.purge(mb).catch(() => undefined);
        }
      }
    };

    // The sequential control fires no concurrent burst, so there is nothing to warm up.
    if (input.mode !== "sequential-control") {
      await runner.warmup((attempt) => runAttempt(0, attempt));
    }
    await runTrials(input.trials, (trial) =>
      runner.runTrial(trial, (attempt) => runAttempt(trial, attempt)),
    );
    runner.applyTo(histogram);
    const all = runner.attempts;
    const valid = validAttempts(all);
    const doubleSealTrials = all.filter((t) => t.oracle.doubleSealed === true).length;
    // Rates and setup counts use valid attempts (D4). Bug and error counters use every attempt (D3).
    histogram.oracle = {
      trialsSingleSeal: valid.filter((t) => t.oracle.sealJobs === 1).length,
      trialsDoubleSeal: doubleSealTrials,
      sealJobsRetriedTotal: sumOracle(all, "sealJobsRetried"),
      signedResponses: sumOracle(valid, "signedResponses"),
      alreadySignedResponses: sumOracle(valid, "alreadySignedResponses"),
      clientErrorResponses: sumOracle(all, "clientErrorResponses"),
      envelopeCompletedTrials: sumOracle(valid, "envelopeCompletedTrials"),
      serverErrorResponses: sumOracle(all, "serverErrorResponses"),
    };
    histogram.invariantViolations.push(
      ...violations,
      ...histogram.attempts.flatMap((t) => t.invariantViolations),
    );
    return await finish(
      ctx,
      histogram,
      recipientMailboxes,
      true,
      doubleSealTrials,
      docDataAtStart,
      all.length,
    );
  } catch (err) {
    histogram.invariantViolations.push(
      `TEST BUG: case aborted: ${(err instanceof Error ? err.message : String(err)).slice(0, 200)}`,
    );
    return await finish(ctx, histogram, recipientMailboxes, false, 0, docDataAtStart);
  }
}

/** Always runs: endRun, leak counts, verdict, histogram file. */
async function finish(
  ctx: RunContext,
  histogram: RaceHistogram,
  recipientMailboxes: string[],
  ran: boolean,
  doubleSealTrials: number,
  docDataAtStart: number,
  attempts = 0,
): Promise<CaseResult> {
  const cleanup = await endRun(ctx, recipientMailboxes);
  const leak = await leakCounts(ctx, recipientMailboxes);
  // Residue is reported, never asserted and never cleaned via SQL (Q4).
  const documentDataResidue = (await docDataCount(ctx.pool)) - docDataAtStart;
  histogram.oracle = { ...histogram.oracle, ...leak.values, documentDataResidue };
  histogram.invariantViolations.push(...cleanup, ...leak.violations);
  histogram.verdict = ran && histogram.invariantViolations.length === 0 ? "pass" : "fail";
  histogram.finishedAt = new Date().toISOString();
  await writeHistogram(histogram);
  const { productViolations, testViolations } = splitViolations(histogram.invariantViolations);
  return { histogram, productViolations, testViolations, doubleSealTrials, attempts };
}
