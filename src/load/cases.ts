import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import path from "node:path";
import { findHits } from "../../scripts/evidence-token-scan.mjs";
import { preAllocatedVUs } from "../../k6/lib/pure/sizing.js";
import { evaluateCoordinatedOmission } from "./co-relations.ts";
import { evaluateOverhead, type OverheadRun } from "./overhead.ts";
import { processGone } from "./runner.ts";
import { parseK6Summary, type K6Summary } from "./summary.ts";
import { startStub } from "./stub-server.ts";
import { calCleanup, calSetup } from "./products/cal.ts";
import { documensoCleanup, documensoSetup, makeDocumensoSetup } from "./products/documenso.ts";
import { pipelineStage, webhookRetryStage } from "./pipeline-stage.ts";
import { makeMedusaSetup, medusaCleanup, medusaSetup } from "./products/medusa.ts";
import { conservationStage } from "./med-conservation.ts";
import { composeStages, reconcileStage, summaryCounter } from "./reconcile/index.ts";
import {
  judgeCalLinkJoin,
  judgeCalRetries,
  readCalLinkJoin,
  readCalRetryAudit,
} from "./retry-audit/cal.ts";
import { attendeeEmail } from "../../k6/lib/pure/prefix.js";
import { judgeDocumensoRetries, readDocumensoRetryRows } from "./retry-audit/documenso.ts";
import { judgeMedusaRetries, readMedusaRetryAudit } from "./retry-audit/medusa.ts";
import { judgeKnownBugGate } from "./known-bug-gate.ts";
import type { RetryCounters, RetryJudgement } from "./retry-validity.ts";
import { calDatabaseUrlFromEnv, medusaDatabaseUrlFromEnv } from "../races/env.ts";
import { documensoDatabaseUrlFromEnv } from "../documenso/env.ts";
import type { RunContext } from "../documenso/run-case.ts";
import { closePool, createReadOnlyPool } from "../oracles/pg.ts";
import type { LoadCase, LoadContext, Stage, StageResult } from "./types.ts";

const SERVICE_MS = 25;
const STALL_MS = 1500;
const PERIOD_MS = 10000;
const SELFTEST = "k6/selftest/coordinated-omission.js";
const TELEMETRY = "k6/selftest/telemetry.js";
const OVERHEAD = "k6/selftest/sampler-overhead.js";

let stub: { port: number; close(): Promise<void> } | undefined;

function connectRefused(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host: "127.0.0.1", port });
    socket.once("connect", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => resolve(true));
  });
}

function readSummary(
  ctx: { k6: Array<{ label: string; summaryPath: string }> },
  label: string,
): K6Summary {
  const run = ctx.k6.find((k) => k.label === label);
  if (!run || !existsSync(run.summaryPath)) throw new Error(`no k6 summary for run ${label}`);
  return parseK6Summary(JSON.parse(readFileSync(run.summaryPath, "utf8")));
}

const setup: Stage = async (ctx) => {
  stub = await startStub({
    port: 0,
    serviceMs: SERVICE_MS,
    stallMs: STALL_MS,
    periodMs: PERIOD_MS,
  });
  ctx.config.port = stub.port;
  ctx.config.serviceMs = SERVICE_MS;
  return { ok: true, reasons: [] };
};

/** Relations R1 to R6 on the three summaries of the same stub in the same job. A broken relation is a TEST BUG (plan §7). */
const reconcile: Stage = async (ctx) => {
  const open = readSummary(ctx, "open");
  const closed = readSummary(ctx, "closed");
  const undersized = readSummary(ctx, "undersized");
  const violations = evaluateCoordinatedOmission({
    open: { requests: open.requests, dropped: open.dropped, p95Ms: open.p95Ms },
    closed: { requests: closed.requests, dropped: closed.dropped, p95Ms: closed.p95Ms },
    undersized: {
      requests: undersized.requests,
      dropped: undersized.dropped,
      p95Ms: undersized.p95Ms,
    },
    rate: ctx.profile.rate,
    durationSec: ctx.profile.durationSec,
    serviceMs: Number(ctx.config.serviceMs),
  });
  if (violations.length > 0) return { ok: false, kind: "TEST BUG", reasons: violations };
  return { ok: true, reasons: [], data: { relations: "R1 to R6 pass" } };
};

/** Stops the stub, then checks that its port is closed and that no k6 process of the run is alive (plan §8). */
const cleanup: Stage = async (ctx) => {
  const reasons: string[] = [];
  if (stub) {
    const port = stub.port;
    await stub.close();
    stub = undefined;
    if (!(await connectRefused(port)))
      reasons.push(`stub port ${port} still listening after cleanup`);
  }
  for (const k of ctx.k6) {
    if (!processGone(k.pid)) reasons.push(`k6 ${k.label} (pid ${k.pid}) still alive after the run`);
  }
  return reasons.length === 0
    ? { ok: true, reasons: [] }
    : { ok: false, kind: "TEST BUG", reasons };
};

export const COOP_LOAD_001: LoadCase = {
  id: "P6-X-LOAD-001",
  title: "Coordinated-omission self-test: open, closed and under-sized runs against one stub",
  product: "stub",
  label: "functional load, not capacity",
  profiles: {
    pr: { rate: 40, durationSec: 30, maxLatencyMs: 1600 },
    full: { rate: 40, durationSec: 60, maxLatencyMs: 1600 },
  },
  runs: (ctx) => {
    const base = {
      RATE: String(ctx.profile.rate),
      DURATION_SEC: String(ctx.profile.durationSec),
      MAX_LATENCY_MS: String(ctx.profile.maxLatencyMs),
      PORT: String(ctx.config.port),
    };
    const sized = preAllocatedVUs({
      rate: ctx.profile.rate,
      maxLatencyMs: ctx.profile.maxLatencyMs,
    });
    return [
      {
        label: "open",
        script: SELFTEST,
        env: { ...base, MODEL: "open", PRE: String(sized), MAXVUS: String(Math.ceil(sized * 1.5)) },
        maxVUs: Math.ceil(sized * 1.5),
        expectValidity: "VALID",
      },
      // 4 VUs with a 75 ms think time and a 25 ms stub: about 40 iterations/s, the probe rate (closed 1008 vs open 1201).
      { label: "closed", script: SELFTEST, env: { ...base, MODEL: "closed", PRE: "4" } },
      {
        // Under-sized on purpose: the dropped iterations make this run INVALID, which is the relation R6 needs (plan §6.5).
        label: "undersized",
        script: SELFTEST,
        env: { ...base, MODEL: "open", PRE: "5", MAXVUS: "5" },
        maxVUs: 5,
        expectValidity: "INVALID",
        expectCodes: ["dropped_iterations"],
      },
    ];
  },
  stages: { setup, reconcile, cleanup },
};

/** Validity self-test (Task 4, plan §6.8): one normal run must be VALID; one saturated run must be INVALID with the expected codes. */
export const VALIDITY_LOAD_004: LoadCase = {
  id: "P6-X-LOAD-004",
  title:
    "Validity self-test: a normal run is VALID, a saturated run is INVALID with the expected codes",
  product: "stub",
  label: "functional load, not capacity",
  profiles: {
    pr: { rate: 40, durationSec: 30, maxLatencyMs: 1600 },
    full: { rate: 40, durationSec: 60, maxLatencyMs: 1600 },
  },
  runs: (ctx) => {
    const base = {
      RATE: String(ctx.profile.rate),
      DURATION_SEC: String(ctx.profile.durationSec),
      MAX_LATENCY_MS: String(ctx.profile.maxLatencyMs),
      PORT: String(ctx.config.port),
      MODEL: "open",
    };
    const sized = preAllocatedVUs({
      rate: ctx.profile.rate,
      maxLatencyMs: ctx.profile.maxLatencyMs,
    });
    return [
      {
        label: "normal",
        script: SELFTEST,
        env: { ...base, PRE: String(sized), MAXVUS: String(Math.ceil(sized * 1.5)) },
        maxVUs: Math.ceil(sized * 1.5),
        expectValidity: "VALID",
      },
      {
        label: "saturated",
        script: SELFTEST,
        env: { ...base, PRE: "5", MAXVUS: "5" },
        maxVUs: 5,
        expectValidity: "INVALID",
        expectCodes: ["dropped_iterations", "vu_exhausted"],
      },
    ];
  },
  stages: { setup, cleanup },
};

/** Telemetry self-test (Task 5, plan §6.6): a normal run is VALID; a forced stall is a telemetry gap; a skewed marker is clock_skew. */
export const TELEMETRY_LOAD_002: LoadCase = {
  id: "P6-X-LOAD-002",
  title: "Telemetry self-test: outside-only sampler, clock markers, a forced gap and a forced skew",
  product: "stub",
  label: "functional load, not capacity",
  profiles: {
    pr: { rate: 40, durationSec: 30, maxLatencyMs: 1600 },
    full: { rate: 40, durationSec: 60, maxLatencyMs: 1600 },
  },
  telemetry: { product: "stub" },
  runs: (ctx) => {
    const base = {
      RATE: String(ctx.profile.rate),
      DURATION_SEC: String(ctx.profile.durationSec),
      MAX_LATENCY_MS: String(ctx.profile.maxLatencyMs),
      PORT: String(ctx.config.port),
      PRE: "80",
      MAXVUS: "120",
    };
    return [
      { label: "normal", script: TELEMETRY, env: base, maxVUs: 120, expectValidity: "VALID" },
      {
        label: "forcedGap",
        script: TELEMETRY,
        env: base,
        maxVUs: 120,
        injectGapMs: 3500,
        expectValidity: "INVALID",
        expectCodes: ["telemetry_gap"],
      },
      {
        label: "forcedSkew",
        script: TELEMETRY,
        env: base,
        maxVUs: 120,
        markerSkewMs: 2500,
        expectValidity: "INVALID",
        expectCodes: ["clock_skew"],
      },
    ];
  },
  stages: { setup, cleanup },
};

/** Sampler overhead (Task 5, plan §6.7): four runs without the sampler and four with it; the medians must stay within the margins. */
export const OVERHEAD_LOAD_006: LoadCase = {
  id: "P6-X-LOAD-006",
  title:
    "Sampler overhead: the runs with the sampler stay within the margins of the runs without it",
  product: "stub",
  label: "functional load, not capacity",
  profiles: {
    pr: { rate: 40, durationSec: 20, maxLatencyMs: 1600 },
    full: { rate: 40, durationSec: 30, maxLatencyMs: 1600 },
  },
  runs: (ctx) => {
    const base = {
      RATE: String(ctx.profile.rate),
      DURATION_SEC: String(ctx.profile.durationSec),
      MAX_LATENCY_MS: String(ctx.profile.maxLatencyMs),
      PORT: String(ctx.config.port),
      MODEL: "open",
      PRE: "80",
      MAXVUS: "120",
    };
    return [1, 2, 3, 4].flatMap((i) => [
      {
        label: `without-${i}`,
        script: OVERHEAD,
        env: base,
        maxVUs: 120,
        telemetry: false,
        expectValidity: "VALID" as const,
      },
      {
        label: `with-${i}`,
        script: OVERHEAD,
        env: base,
        maxVUs: 120,
        telemetry: true,
        expectValidity: "VALID" as const,
      },
    ]);
  },
  stages: {
    setup,
    cleanup,
    reconcile: async (ctx) => {
      const read = (label: string): OverheadRun => {
        const run = ctx.k6.find((k) => k.label === label);
        if (!run || !existsSync(run.summaryPath)) throw new Error(`no k6 summary for run ${label}`);
        const s = parseK6Summary(JSON.parse(readFileSync(run.summaryPath, "utf8")));
        return { requests: s.requests, p95Ms: s.p95Ms, dropped: s.dropped };
      };
      const without = [1, 2, 3, 4].map((i) => read(`without-${i}`));
      const withRuns = [1, 2, 3, 4].map((i) => read(`with-${i}`));
      const violations = evaluateOverhead(without, withRuns);
      if (violations.length > 0) return { ok: false, kind: "TEST BUG", reasons: violations };
      return { ok: true, reasons: [], data: { relations: "overhead within margins" } };
    },
  },
};

/** P6-CAL-LOAD-001: one booking per iteration, the slot index from the global iteration counter (plan §6.3). */
export const CAL_LOAD_001: LoadCase = {
  id: "P6-CAL-LOAD-001",
  telemetry: { product: "cal" },
  title: "Cal journey smoke: getSchedule, book",
  product: "cal",
  label: "functional load, not capacity",
  profiles: {
    pr: { rate: 2, durationSec: 10, maxLatencyMs: 1000 },
    full: { rate: 2, durationSec: 30, maxLatencyMs: 1000 },
  },
  runs: () => [{ label: "main", script: "k6/cases/cal-load-001.js", env: {} }],
  stages: { setup: calSetup({}), reconcile: reconcileStage, cleanup: calCleanup },
};

/** P6-MED-LOAD-001: one checkout per iteration against a stocked variant (plan §6.2). */
export const MED_LOAD_001: LoadCase = {
  id: "P6-MED-LOAD-001",
  telemetry: { product: "medusa" },
  title: "Medusa journey smoke: browse, cart, checkout",
  product: "medusa",
  label: "functional load, not capacity",
  profiles: {
    pr: { rate: 1, durationSec: 10, maxLatencyMs: 4000 },
    full: { rate: 1, durationSec: 30, maxLatencyMs: 4000 },
  },
  runs: () => [{ label: "main", script: "k6/cases/med-load-001.js", env: {} }],
  stages: { setup: medusaSetup, reconcile: reconcileStage, cleanup: medusaCleanup },
};

/** P6-DOC-LOAD-001: create, distribute, both recipients sign, the envelope completes once (plan §6.4). */
export const DOC_LOAD_001: LoadCase = {
  id: "P6-DOC-LOAD-001",
  telemetry: { product: "documenso" },
  title: "Documenso journey smoke: create, distribute, sign",
  product: "documenso",
  label: "functional load, not capacity",
  profiles: {
    pr: { rate: 1, durationSec: 10, maxLatencyMs: 3000 },
    full: { rate: 1, durationSec: 30, maxLatencyMs: 3000 },
  },
  runs: () => [
    {
      label: "main",
      script: "k6/cases/doc-load-001.js",
      env: {},
      secretEnv: ["DOCUMENSO_API_TOKEN"],
    },
  ],
  stages: { setup: documensoSetup, reconcile: reconcileStage, cleanup: documensoCleanup },
};

/** P6-MED-LOAD-002: a stream of checkouts against stock S = ceil(planned / 2), so the stock runs out (plan task 8 §6.4).
 * The reconcile stage is the post-load audit followed by the conservation judge. */
export const MED_LOAD_002: LoadCase = {
  id: "P6-MED-LOAD-002",
  telemetry: { product: "medusa" },
  title: "Inventory conservation under constant-arrival checkouts",
  product: "medusa",
  label: "functional load, not capacity",
  profiles: {
    pr: { rate: 1, durationSec: 10, maxLatencyMs: 4000 },
    full: { rate: 1, durationSec: 30, maxLatencyMs: 4000 },
  },
  runs: () => [{ label: "main", script: "k6/cases/med-load-002.js", env: {} }],
  stages: {
    setup: makeMedusaSetup({ stockFor: (planned) => Math.ceil(planned / 2) }),
    reconcile: composeStages([reconcileStage, conservationStage]),
    cleanup: medusaCleanup,
  },
};

/** P6-DOC-LOAD-002: the pipeline lag at a steady rate; every stage exactly once, within the contract (plan task 9 §6.5). */
export const DOC_LOAD_002: LoadCase = {
  id: "P6-DOC-LOAD-002",
  telemetry: { product: "documenso" },
  title: "Documenso pipeline lag at a steady rate",
  product: "documenso",
  label: "functional load, not capacity",
  profiles: {
    pr: { rate: 1, durationSec: 10, maxLatencyMs: 3000 },
    full: { rate: 1, durationSec: 30, maxLatencyMs: 3000 },
  },
  runs: () => [
    {
      label: "main",
      script: "k6/cases/doc-load-002.js",
      env: {},
      secretEnv: ["DOCUMENSO_API_TOKEN"],
    },
  ],
  stages: {
    setup: makeDocumensoSetup({ webhookMode: "ok" }),
    reconcile: composeStages([reconcileStage, pipelineStage]),
    cleanup: documensoCleanup,
  },
};

/** P6-DOC-LOAD-008: the receiver answers 500 to the first delivery of each event; Documenso must retry it (plan task 9 §3.5). */
export const DOC_LOAD_008: LoadCase = {
  id: "P6-DOC-LOAD-008",
  telemetry: { product: "documenso" },
  title: "Documenso webhook retry after one 500",
  product: "documenso",
  label: "functional load, not capacity",
  profiles: {
    pr: { rate: 1, durationSec: 10, maxLatencyMs: 3000 },
    full: { rate: 1, durationSec: 30, maxLatencyMs: 3000 },
  },
  runs: () => [
    {
      label: "main",
      script: "k6/cases/doc-load-008.js",
      env: {},
      secretEnv: ["DOCUMENSO_API_TOKEN"],
    },
  ],
  stages: {
    setup: makeDocumensoSetup({ webhookMode: "fail-first" }),
    reconcile: composeStages([reconcileStage, webhookRetryStage]),
    cleanup: documensoCleanup,
  },
};

/** The retry audit file of a retry case. The reconcile stage of the same case writes audit.json, so the two never share a file. */
export const RETRY_AUDIT_FILE = "retry-audit.json";

/** The journey counters of the main run (plan task 10 §6.2), read from its summary export. A counter the run never bumped is 0. */
export function retryCountersOf(ctx: LoadContext): RetryCounters {
  const run = ctx.k6.find((k) => k.label === "main");
  if (!run || !existsSync(run.summaryPath)) throw new Error("no k6 summary for run main");
  const summary: unknown = JSON.parse(readFileSync(run.summaryPath, "utf8"));
  const c = (name: string) => summaryCounter(summary, name) ?? 0;
  return {
    intents: c("p6_intents"),
    intentsOk: c("p6_intents_ok"),
    attempts: c("p6_attempts"),
    firstTimeouts: c("p6_first_timeouts"),
    retryOk: c("p6_retry_ok"),
    retryConflict: c("p6_retry_conflict"),
    retryRedacted400: c("p6_retry_redacted400"),
    retryRefused: c("p6_retry_refused"),
    retry5xx: c("p6_retry_5xx"),
    orderMismatch: c("p6_retry_order_mismatch"),
  };
}

/**
 * Writes retry-audit.json (counts, ids and check names only) after a token scan. The reconcile audit keeps audit.json. Returns a failing result when the scan matched, so the
 * caller returns it; undefined when the file was written.
 */
function writeRetryAudit(
  ctx: LoadContext,
  j: RetryJudgement,
  extra: Record<string, unknown> = {},
): StageResult | undefined {
  const text = JSON.stringify({ schema: 1, caseId: ctx.caseDef.id, ...extra, ...j }, null, 2);
  const file = path.join(ctx.outDir, RETRY_AUDIT_FILE);
  if (findHits(text).length > 0) {
    rmSync(file, { force: true });
    return {
      ok: false,
      kind: "TEST BUG",
      reasons: ["retry-audit.json matched a token pattern; not kept"],
    };
  }
  writeFileSync(file, `${text}\n`);
  return undefined;
}

/**
 * Turns a judgement into a stage result: a failing finding fails the stage with its own kind; a counted known bug is a reason,
 * never a failure. Used by the Cal stage.
 */
function retryStageResult(
  ctx: LoadContext,
  j: RetryJudgement,
  extra: Record<string, unknown> = {},
): StageResult {
  const written = writeRetryAudit(ctx, j, extra);
  if (written !== undefined) return written;
  const failing = j.findings.filter((f) => !f.ok);
  const reasons = [
    ...failing.map((f) => `${f.kind ?? "TEST BUG"}: ${f.check}: ${f.detail}`),
    ...Object.entries(j.knownBugs).map(
      ([id, n]) => `known bug ${id}: ${n} (counted, not a failure)`,
    ),
  ];
  const kind = failing.some((f) => f.kind === "PRODUCT BUG")
    ? "PRODUCT BUG"
    : failing.length > 0
      ? "TEST BUG"
      : undefined;
  return {
    ok: failing.length === 0,
    kind,
    reasons,
    data: { audit: RETRY_AUDIT_FILE, checks: j.findings.length, failing: failing.length },
  };
}

/** The retry audit of the Cal cases (-007 and -009: the link audit runs only when the audit config names a link prefix). */
const calRetryStage: Stage = async (ctx) => {
  const audit = ctx.config.audit as { prefixLike: string; eventTypeId: number; linkLike?: string };
  const counters = retryCountersOf(ctx);
  const pool = createReadOnlyPool(calDatabaseUrlFromEnv());
  try {
    const input = await readCalRetryAudit(pool, audit);
    const j = judgeCalRetries({ intents: counters.intents, ...input, counters });
    let extra: Record<string, unknown> = {};
    if (audit.linkLike !== undefined) {
      // Intent n is attendee i<n>, booked with links[n]: join each intent's bookings to its link's usage, before and after.
      const linkIds = (ctx.config.links as string[] | undefined) ?? [];
      const before = (ctx.handles.calLinkUsageBefore as Record<string, number> | undefined) ?? {};
      const prefix = String(ctx.config.prefix);
      // setup makes planned + 2 links; only the intents that ran (p6_intents) have a booking to join, the rest are unused by design
      const intents = linkIds.slice(0, counters.intents).map((link, n) => ({
        n,
        email: attendeeEmail(prefix, `i${n}`),
        link,
        usageBefore: before[link] ?? 0,
      }));
      const joined = await readCalLinkJoin(pool, { ...audit, linkLike: audit.linkLike }, intents);
      const join = judgeCalLinkJoin(joined);
      j.findings.push(...join.findings);
      extra = { linkJoin: join.rows };
    }
    return retryStageResult(ctx, j, extra);
  } finally {
    await closePool(pool);
  }
};

/** The retry audit of the Medusa case: one order and one payment per intent, stock once per order. */
const medusaRetryStage: Stage = async (ctx) => {
  const audit = ctx.config.audit as {
    prefixLike: string;
    variantId: string;
    inventoryItemId: string;
    locationId: string;
  };
  const counters = retryCountersOf(ctx);
  const pool = createReadOnlyPool(medusaDatabaseUrlFromEnv());
  try {
    const input = await readMedusaRetryAudit(pool, audit);
    return retryStageResult(
      ctx,
      judgeMedusaRetries({ intents: counters.intents, ...input, counters }),
    );
  } finally {
    await closePool(pool);
  }
};

/**
 * The retry audit of the Documenso case. Its verdict is the known-bug gate (src/load/known-bug-gate.ts): the declared bug
 * P6-OBS-DOC-005 is KNOWN BUG when observed; a missing observation, any other violation, a missing storm check or a missing
 * audit fails. The completion emails are read from the run's Inbucket client.
 */
const documensoRetryStage: Stage = async (ctx) => {
  const run = ctx.handles.documensoRun as RunContext | undefined;
  if (!run) return { ok: false, kind: "TEST BUG", reasons: ["documenso run handle is missing"] };
  const audit = ctx.config.audit as { prefixLike: string };
  const counters = retryCountersOf(ctx);
  const pool = createReadOnlyPool(documensoDatabaseUrlFromEnv());
  try {
    const rows = await readDocumensoRetryRows(pool, audit, run.inbucket);
    const j = judgeDocumensoRetries({ intents: counters.intents, rows, counters });
    const written = writeRetryAudit(ctx, j, {
      // per envelope, counts only (no ids)
      envelopes: rows.map(
        ({
          status,
          sealJobs,
          completedAudit,
          signedRecipients,
          recipients,
          emailsPerRecipient,
        }) => ({
          status,
          sealJobs,
          completedAudit,
          signedRecipients,
          recipients,
          emailsPerRecipient,
        }),
      ),
    });
    if (written !== undefined) return written;
    const gate = judgeKnownBugGate({
      declared: ctx.caseDef.knownBugs ?? [],
      checks: j.findings.map((f) => ({ name: f.check, ok: f.ok, kind: f.kind, detail: f.detail })),
      hasAudit: true,
    });
    return {
      ok: gate.ok,
      kind: gate.kind,
      reasons: gate.reasons,
      data: { audit: RETRY_AUDIT_FILE, observed: gate.observed },
    };
  } finally {
    await closePool(pool);
  }
};

/** P6-CAL-LOAD-007: a booking retried after a short client timeout; one accepted booking per intent (plan task 10 §6.6). */
export const CAL_LOAD_007: LoadCase = {
  id: "P6-CAL-LOAD-007",
  telemetry: { product: "cal" },
  title: "Cal booking retried after a short client timeout",
  product: "cal",
  label: "functional load, not capacity",
  profiles: {
    pr: { rate: 1, durationSec: 10, maxLatencyMs: 2000 },
    full: { rate: 1, durationSec: 30, maxLatencyMs: 2000 },
  },
  runs: () => [{ label: "main", script: "k6/cases/cal-load-007.js", env: {} }],
  stages: {
    setup: calSetup({}),
    reconcile: composeStages([reconcileStage, calRetryStage]),
    cleanup: calCleanup,
  },
};

/** P6-CAL-LOAD-009: the same retries with one cap-1 private link per intent (plan task 10 §6.5, §6.6). */
export const CAL_LOAD_009: LoadCase = {
  id: "P6-CAL-LOAD-009",
  telemetry: { product: "cal" },
  title: "Cal private link retried after a short client timeout",
  product: "cal",
  label: "functional load, not capacity",
  profiles: {
    pr: { rate: 1, durationSec: 10, maxLatencyMs: 2000 },
    full: { rate: 1, durationSec: 30, maxLatencyMs: 2000 },
  },
  runs: () => [{ label: "main", script: "k6/cases/cal-load-009.js", env: {}, secretEnv: [] }],
  stages: {
    setup: calSetup({ privateLinks: true }),
    reconcile: composeStages([reconcileStage, calRetryStage]),
    cleanup: calCleanup,
  },
};

/** P6-MED-LOAD-006: the complete request retried after a 100 ms timeout; one order, one payment, stock once (plan task 10 §6.6). */
export const MED_LOAD_006: LoadCase = {
  id: "P6-MED-LOAD-006",
  telemetry: { product: "medusa" },
  title: "Medusa complete retried after a short client timeout",
  product: "medusa",
  label: "functional load, not capacity",
  profiles: {
    // 6000 ms, not 4000: the measured slowest iteration on the VM was 5.7 s (the probe's 4 s pre-allocated 5 VUs and dropped one arrival).
    pr: { rate: 1, durationSec: 10, maxLatencyMs: 6000 },
    full: { rate: 1, durationSec: 30, maxLatencyMs: 6000 },
  },
  runs: () => [{ label: "main", script: "k6/cases/med-load-006.js", env: {} }],
  stages: {
    setup: makeMedusaSetup({ stockFor: (planned) => planned + 20, stormProbeCarts: 3 }),
    reconcile: composeStages([reconcileStage, medusaRetryStage]),
    cleanup: medusaCleanup,
  },
};

/** P6-DOC-LOAD-007: completeDocumentWithToken retried in parallel after a short timeout; one seal, one email set (plan task 10 §6.6). */
export const DOC_LOAD_007: LoadCase = {
  id: "P6-DOC-LOAD-007",
  telemetry: { product: "documenso" },
  title: "Documenso completion retried in parallel after a short client timeout",
  product: "documenso",
  label: "functional load, not capacity",
  profiles: {
    pr: { rate: 1, durationSec: 10, maxLatencyMs: 3000 },
    full: { rate: 1, durationSec: 30, maxLatencyMs: 3000 },
  },
  knownBugs: ["P6-OBS-DOC-005"],
  runs: () => [
    {
      label: "main",
      script: "k6/cases/doc-load-007.js",
      env: {},
      secretEnv: ["DOCUMENSO_API_TOKEN"],
    },
  ],
  stages: {
    setup: makeDocumensoSetup({ webhookMode: "ok" }),
    reconcile: composeStages([reconcileStage, documensoRetryStage]),
    cleanup: documensoCleanup,
  },
};

export const CASES: Record<string, LoadCase> = {
  [COOP_LOAD_001.id]: COOP_LOAD_001,
  [VALIDITY_LOAD_004.id]: VALIDITY_LOAD_004,
  [TELEMETRY_LOAD_002.id]: TELEMETRY_LOAD_002,
  [OVERHEAD_LOAD_006.id]: OVERHEAD_LOAD_006,
  [CAL_LOAD_001.id]: CAL_LOAD_001,
  [MED_LOAD_001.id]: MED_LOAD_001,
  [DOC_LOAD_001.id]: DOC_LOAD_001,
  [MED_LOAD_002.id]: MED_LOAD_002,
  [DOC_LOAD_002.id]: DOC_LOAD_002,
  [DOC_LOAD_008.id]: DOC_LOAD_008,
  [CAL_LOAD_007.id]: CAL_LOAD_007,
  [CAL_LOAD_009.id]: CAL_LOAD_009,
  [MED_LOAD_006.id]: MED_LOAD_006,
  [DOC_LOAD_007.id]: DOC_LOAD_007,
};
