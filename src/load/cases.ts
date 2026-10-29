import { spawn, type ChildProcess } from "node:child_process";
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
import { kneeStage } from "./knee/stage.ts";
import { spikeStage } from "./spike/stage.ts";
import { MIN_WINDOW_REQUESTS } from "./recovery.ts";
import { limiterContractStage } from "./spike/limiter-stage.ts";
import { calCleanup, calSetup } from "./products/cal.ts";
import { docKneeDefaultsFor, kneePlanFor, medKneeDefaultsFor } from "./knee/plan-input.ts";
import { stockForKnee } from "./knee/med-stock.ts";
import { readSmokeReference } from "./smoke-baseline.ts";
import { documensoCleanup, documensoSetup, makeDocumensoSetup } from "./products/documenso.ts";
import { pipelineStage, webhookRetryStage } from "./pipeline-stage.ts";
import { makeMedusaSetup, medusaCleanup, medusaSetup } from "./products/medusa.ts";
import { twentyCleanup, twentySetup } from "./products/twenty.ts";
import { TW_LOAD_004 } from "../twenty/lost-update-case.ts";
import { BOUNDARY_STAGES, RESET_TOKEN_STAGES } from "./products/twenty-reset-token.ts";
import {
  fairness009Reconcile,
  limiterPreflight,
  rateLimit006Reconcile,
} from "../twenty/rate-limit-oracle.ts";
import {
  cancelRaceStage,
  ledgerStage,
  KNOWN_LEAK_ID,
  makeInvariantSetup,
  splitStage,
} from "./med/invariant-stages.ts";
import { conservationStage, makeConservationStage } from "./med-conservation.ts";
import { composeStages, reconcileStage, summaryCounter } from "./reconcile/index.ts";
import { calBurstStage, calStaleStage } from "./cal/invariant-stages.ts";
import { exactlyOnceStage } from "./doc/exactly-once-stage.ts";
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
import type { LoadCase, LoadContext, SpikeRunSpec, Stage, StageResult } from "./types.ts";

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

/** P6-DOC-LOAD-003: exactly-once under load (plan Phase 4b task 9). The sequential stream at the steady rate (2 per second, 50 % of
 * the committed Documenso lower bound 4) and the concurrent pair stream at rate × pairShare, in addition. The reconcile stage is the
 * audit, then the exactly-once verdict (src/load/doc/exactly-once-stage.ts); the pairs are counted under P6-OBS-DOC-002 by pair key. */
export const DOC_LOAD_003: LoadCase = {
  id: "P6-DOC-LOAD-003",
  telemetry: { product: "documenso" },
  title: "Documenso exactly-once under load, with concurrent pairs",
  product: "documenso",
  label: "functional load, not capacity",
  profiles: {
    pr: { rate: 2, durationSec: 10, maxLatencyMs: 12000 },
    full: { rate: 2, durationSec: 30, maxLatencyMs: 12000 },
  },
  knownBugs: ["P6-OBS-DOC-002"],
  runs: () => [
    {
      label: "main",
      script: "k6/cases/doc-load-003.js",
      env: {},
      secretEnv: ["DOCUMENSO_API_TOKEN"],
    },
  ],
  stages: {
    setup: makeDocumensoSetup({ webhookMode: "ok" }),
    reconcile: composeStages([reconcileStage, exactlyOnceStage]),
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

/**
 * P6-CAL-LOAD-005: the Cal booking knee (plan task 2 §6.5). Held ramping-arrival-rate steps; the knee is the first saturated resource,
 * and the per-intent audit reconciles the bookings. The plan comes from the dispatch inputs; setup reads the slot supply once.
 */
/** The steady slot count of a Cal steady run: 1.05 x rate x duration, one slot per iteration (plan Phase 4 task 5 §6.3). */
function calSteadySlots(ctx: LoadContext): number {
  return Math.ceil(1.05 * ctx.profile.rate * ctx.profile.durationSec);
}

/**
 * P6-CAL-LOAD-003: the Cal steady baseline at half the knee's lower bound (plan Phase 4 task 5). The steady profile is derived from
 * k6/thresholds/knee-bounds.json by withSteadyProfile; pr and full keep a fixed rate for a smoke of the machinery.
 */
export const CAL_LOAD_003: LoadCase = {
  id: "P6-CAL-LOAD-003",
  telemetry: { product: "cal" },
  title: "Cal booking journey steady baseline at half the knee",
  product: "cal",
  label: "steady baseline, environment-bound",
  profiles: {
    pr: { rate: 3, durationSec: 30, maxLatencyMs: 2000 },
    full: { rate: 3, durationSec: 120, maxLatencyMs: 2000 },
  },
  runs: () => [{ label: "main", script: "k6/cases/cal-load-003.js", env: {} }],
  stages: {
    setup: (ctx) => calSetup({ slots: { count: calSteadySlots(ctx) } })(ctx),
    reconcile: reconcileStage,
    cleanup: calCleanup,
  },
};

export const CAL_LOAD_005: LoadCase = {
  id: "P6-CAL-LOAD-005",
  telemetry: { product: "cal" },
  title: "Cal booking journey knee: held ramping-arrival-rate steps",
  product: "cal",
  label: "knee range, environment-bound",
  profiles: {
    // rate = start rate; durationSec = total planned seconds of the default plan (9 steps x 32 s); maxLatencyMs sizes nothing here
    pr: { rate: 2, durationSec: 96, maxLatencyMs: 2000 }, // 3 steps (2, 4, 6/s) x 12 s hold: a smoke of the machinery
    full: { rate: 2, durationSec: 288, maxLatencyMs: 2000 },
  },
  runs: (ctx) => [
    {
      label: "main",
      script: "k6/cases/cal-load-005.js",
      env: {},
      allowExits: [0, 99],
      knee: { ...kneePlanFor(ctx), smokeP95Ms: ctx.config.smokeP95Ms as number, maxVUs: 160 },
    },
  ],
  stages: {
    setup: calSetup({ knee: true }),
    reconcile: composeStages([kneeStage, reconcileStage]),
    cleanup: calCleanup,
  },
};

/** The Medusa knee's setup: the stock from its plan, and the p95 reference of P6-MED-LOAD-001 (plan task 3 §6.4, §6.5). */
const medKneeProductSetup = makeMedusaSetup({
  stockFor: (_planned, ctx) => stockForKnee(kneePlanFor(ctx, medKneeDefaultsFor)),
});
const medKneeSetup: Stage = async (ctx) => {
  let smokeP95Ms: number;
  try {
    smokeP95Ms = readSmokeReference("P6-MED-LOAD-001");
  } catch {
    return { ok: false, kind: "ENV", reasons: ["ENV: smoke p95 reference unreadable"] };
  }
  const setup = await medKneeProductSetup(ctx);
  if (setup.ok) ctx.config.smokeP95Ms = smokeP95Ms;
  return setup;
};

/**
 * P6-MED-LOAD-004: the Medusa checkout knee (plan task 3 §6.4). The same held-step knee as P6-CAL-LOAD-005, on the checkout journey:
 * the stock covers every order the plan can place, so a stock-out never ends a run.
 */
export const MED_LOAD_004: LoadCase = {
  id: "P6-MED-LOAD-004",
  title: "Medusa checkout journey knee: held ramping-arrival-rate steps",
  product: "medusa",
  label: "knee range, environment-bound",
  profiles: {
    pr: { rate: 0.5, durationSec: 36, maxLatencyMs: 10000 }, // 3 steps (0.5, 1.0, 1.5/s) x 10 s hold + ramps: a smoke of the machinery
    full: { rate: 0.5, durationSec: 256, maxLatencyMs: 10000 }, // 8 steps x 32 s
  },
  telemetry: { product: "medusa" },
  runs: (ctx) => [
    {
      label: "main",
      script: "k6/cases/med-load-004.js",
      env: {},
      allowExits: [0, 99],
      knee: {
        ...kneePlanFor(ctx, medKneeDefaultsFor),
        smokeP95Ms: ctx.config.smokeP95Ms as number,
        maxVUs: 120,
      },
    },
  ],
  stages: {
    setup: medKneeSetup,
    reconcile: composeStages([kneeStage, reconcileStage]),
    cleanup: medusaCleanup,
  },
};

/** The Documenso knee's setup: the p95 reference of P6-DOC-LOAD-001 first, then the product (plan task 4 §6.5). */
const docKneeProductSetup = makeDocumensoSetup({ webhookMode: "ok" });
const docKneeSetup: Stage = async (ctx) => {
  let smokeP95Ms: number;
  try {
    smokeP95Ms = readSmokeReference("P6-DOC-LOAD-001");
  } catch {
    return { ok: false, kind: "ENV", reasons: ["ENV: smoke p95 reference unreadable"] };
  }
  const setup = await docKneeProductSetup(ctx);
  if (setup.ok) ctx.config.smokeP95Ms = smokeP95Ms;
  return setup;
};

/**
 * P6-DOC-LOAD-005: the Documenso signing knee (plan task 4 §6.5). The knee's seal lag is judged on the completed documents, and the
 * unfinished documents per intent. The stage order matters: the pipeline writes the lag table that the knee report carries.
 */
export const DOC_LOAD_005: LoadCase = {
  id: "P6-DOC-LOAD-005",
  title: "Documenso signing journey knee with seal lag per step",
  product: "documenso",
  label: "knee range, environment-bound",
  profiles: {
    // rate = start rate; durationSec = the plan's own schedule: pr 3 steps x (12 s hold + 2 s ramp), full 8 steps x 32 s
    pr: { rate: 1, durationSec: 42, maxLatencyMs: 8000 },
    full: { rate: 1, durationSec: 256, maxLatencyMs: 8000 },
  },
  telemetry: { product: "documenso" },
  runs: (ctx) => [
    {
      label: "main",
      script: "k6/cases/doc-load-005.js",
      env: {},
      secretEnv: ["DOCUMENSO_API_TOKEN"],
      allowExits: [0, 99],
      knee: {
        ...kneePlanFor(ctx, docKneeDefaultsFor),
        smokeP95Ms: ctx.config.smokeP95Ms as number,
        maxVUs: 200,
      },
    },
  ],
  stages: {
    setup: docKneeSetup,
    reconcile: composeStages([reconcileStage, pipelineStage, kneeStage]),
    cleanup: documensoCleanup,
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

/**
 * P6-X-LOAD-021: the breakpoint method's self-test (plan task 1 §6.4, proves P6-RULE-006). Two child stubs of the case, each in
 * its own process group: the burn stub (5 ms of CPU per answer, the knee) and a delay stub (25 ms, the starved generator and the
 * no-knee plan use it too). Three k6 runs: the knee, an under-sized generator, and a plan that never trips.
 */
const KNEE_STUB = "src/load/stub-server.ts";
const knee: { children: ChildProcess[] } = { children: [] };

function kneeHold(profile: string): number {
  return profile === "full" ? 20 : 10;
}

/** Starts one stub as a child in its own process group and reads its port from the first stdout line. */
function startKneeChild(args: string[]): Promise<{ child: ChildProcess; port: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [KNEE_STUB, ...args], {
      detached: true,
      stdio: ["ignore", "pipe", "ignore"],
    });
    knee.children.push(child);
    child.once("error", reject);
    // A stub that exits before printing its port must fail the setup, not leave it waiting for data that never comes.
    child.once("exit", (code) =>
      reject(new Error(`TEST BUG: knee stub exited with ${code} before printing its port`)),
    );
    child.stdout?.once("data", (chunk: Buffer) => {
      const m = /127\.0\.0\.1:(\d+)/.exec(String(chunk));
      if (m) resolve({ child, port: Number(m[1]) });
      else reject(new Error("TEST BUG: knee stub printed no port"));
    });
  });
}

const kneeSetup: Stage = async (ctx) => {
  const burn = await startKneeChild(["0", "0", "0", "1", "5"]);
  const slow = await startKneeChild(["0", "25", "0", "1"]);
  ctx.config.ports = { knee: burn.port, slow: slow.port };
  ctx.handles.appProcess = [{ recordPath: "", pgid: burn.child.pid ?? 0, label: "stub" }];
  return { ok: true, reasons: [] };
};

const kneeCleanup: Stage = async (ctx) => {
  const reasons: string[] = [];
  const ports = (ctx.config.ports ?? {}) as Record<string, number>;
  for (const child of knee.children) {
    if (child.pid !== undefined) {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        // already gone
      }
    }
  }
  // Reap each child, so a stopped stub is not a zombie that still shows in /proc.
  await Promise.all(
    knee.children.map(
      (child) =>
        new Promise<void>((resolve) => {
          if (child.exitCode !== null || child.signalCode !== null) return resolve();
          const timer = setTimeout(resolve, 5000);
          child.once("exit", () => {
            clearTimeout(timer);
            resolve();
          });
        }),
    ),
  );
  for (const child of knee.children) {
    if (child.pid !== undefined && !processGone(child.pid))
      reasons.push(`knee stub pid ${child.pid} still alive after cleanup`);
  }
  for (const port of Object.values(ports)) {
    if (!(await connectRefused(port)))
      reasons.push(`knee stub port ${port} still listening after cleanup`);
  }
  knee.children = [];
  for (const k of ctx.k6) {
    if (!processGone(k.pid)) reasons.push(`k6 ${k.label} (pid ${k.pid}) still alive after the run`);
  }
  return reasons.length === 0
    ? { ok: true, reasons: [] }
    : { ok: false, kind: "TEST BUG", reasons };
};

/** The three knee runs of the self-test (plan §6.4). Each run's `knee` block carries its stub port. */
export const KNEE_RULE_006: LoadCase = {
  id: "P6-X-LOAD-021",
  title:
    "Breakpoint method self-test (proves P6-RULE-006): a CPU-bound stub, a starved generator and a plan without a knee",
  product: "stub",
  label: "knee range, environment-bound",
  profiles: {
    pr: { rate: 60, durationSec: 60, maxLatencyMs: 200 }, // hold 10 s
    full: { rate: 60, durationSec: 110, maxLatencyMs: 200 }, // hold 20 s
  },
  telemetry: { product: "stub" },
  runs: (ctx) => {
    const hold = kneeHold(ctx.profileName);
    const ports = (ctx.config.ports ?? {}) as Record<string, number>;
    return [
      {
        label: "knee",
        script: "k6/selftest/breakpoint-stub.js",
        env: {},
        allowExits: [99],
        expectValidity: "VALID",
        knee: {
          startRate: 151,
          stepRate: 20,
          holdSec: hold,
          rampSec: 2,
          maxSteps: 5,
          smokeP95Ms: 6,
          maxVUs: 80,
          port: ports.knee,
          expect: { firstSaturated: "app_cpu" },
        },
      },
      {
        label: "undersized",
        script: "k6/selftest/breakpoint-stub.js",
        env: {},
        allowExits: [0, 99],
        expectValidity: "INVALID",
        expectCodes: ["dropped_iterations"],
        knee: {
          startRate: 100,
          stepRate: 150,
          holdSec: hold,
          rampSec: 2,
          maxSteps: 3,
          smokeP95Ms: 30,
          maxVUs: 2,
          port: ports.slow,
        },
      },
      {
        label: "norule",
        script: "k6/selftest/breakpoint-stub.js",
        env: {},
        allowExits: [0],
        expectValidity: "INVALID",
        expectCodes: ["no_knee"],
        knee: {
          startRate: 100,
          stepRate: 150,
          holdSec: hold,
          rampSec: 2,
          maxSteps: 3,
          smokeP95Ms: 30,
          maxVUs: 100,
          port: ports.slow,
        },
      },
    ];
  },
  stages: { setup: kneeSetup, reconcile: kneeStage, cleanup: kneeCleanup },
};

/**
 * The spike rates (plan Phase 4 task 6 §6.4, §6.5): steady = 50 % and spike = 150 % of the knee's lower bound, rounded down to 0.1, from
 * k6/thresholds/knee-bounds.json (Cal 8, Medusa 1.5). The Documenso rates are the limiter's own: 100 tRPC calls per minute over 4 calls
 * per document. A unit test re-derives the bound rates from the file. The Documenso spike is 1.0 docs/s (owner decision, PR #84): the
 * limiter counts 4 token-keyed calls per document, so 1.0 x 30 s x 4 = 120 calls in the spike window, at least the limit (0.6 gives 72).
 */
export const SPIKE_RATES = {
  cal: { steadyRate: 4, spikeRate: 12 },
  medusa: { steadyRate: 0.7, spikeRate: 2.2 },
  documenso: { steadyRate: 0.2, spikeRate: 1.0 },
} as const;

/**
 * Token-keyed tRPC calls per Documenso document, the calls the limiter counts. Measured on run a7968c28 (1.0 docs/s): every one of its
 * 48 429s was signFieldWithToken or completeDocumentWithToken, two of each per document. The other five journey calls were never refused.
 */
export const DOC_LIMITED_CALLS_PER_DOCUMENT = 4;
/** The tRPC limiter's limit per minute (src/load/spike/limiter-contract.ts, the trpc route). */
export const DOC_TRPC_LIMIT_PER_MIN = 100;

/** The spike of a run: 60 s steady, 30 s spike, 120 s watch on full; 10 s and 20 s on pr (a smoke of the machinery). */
/** Measured Documenso journey requests per iteration (run 3afbe358: 344 requests over 38 iterations): 9.05. */
export const DOC_REQUESTS_PER_ITERATION = 9.05;
/** The limiter's fixed window, one minute. */
export const DOC_LIMITER_WINDOW_SEC = 60;
/** The quiet phase after the spike: no requests, so the limiter window has fully reset before the post-spike windows start. */
export const DOC_QUIET_SEC = 60;

/**
 * The Documenso recovery window in seconds: ceil(MIN_WINDOW_REQUESTS / requests per second), plus 25 %, rounded up (owner decision, PR #84 follow-up).
 * At 0.2 docs/s x 9.05 = 1.81 requests per second: ceil(40 / 1.81) = 23 s, x 1.25 = 28.75, so 29 s.
 */
export function documensoWindowSec(steadyRate: number = SPIKE_RATES.documenso.steadyRate): number {
  const requestsPerSec = steadyRate * DOC_REQUESTS_PER_ITERATION;
  return Math.ceil(Math.ceil(MIN_WINDOW_REQUESTS / requestsPerSec) * 1.25);
}

export function spikeSpec(
  ctx: LoadContext,
  product: keyof typeof SPIKE_RATES,
  timeUnitSec: number,
): SpikeRunSpec {
  const pr = ctx.profileName === "pr";
  if (product === "documenso") {
    const windowSec = documensoWindowSec();
    // Two full windows of steady: window 0 is the warm-up, window 1 the reference. Two full windows of watch after the quiet phase.
    return {
      product,
      ...SPIKE_RATES[product],
      steadySec: pr ? 2 * windowSec : 60,
      spikeSec: 30,
      rampSec: 2,
      quietSec: DOC_QUIET_SEC,
      watchSec: pr ? 2 * windowSec : 120,
      windowSec,
      alignToMinute: true,
      timeUnitSec,
    };
  }
  return {
    product,
    ...SPIKE_RATES[product],
    steadySec: pr ? 10 : 60,
    spikeSec: 30,
    rampSec: 2,
    watchSec: pr ? 20 : 120,
    timeUnitSec,
  };
}

/** Iterations the spike schedules: the steady and watch holds, the spike hold, and the two ramps at the mean of their rates. */
function plannedIterations(s: SpikeRunSpec): number {
  return (
    s.steadyRate * (s.steadySec + s.watchSec) +
    s.spikeRate * s.spikeSec +
    (s.steadyRate + s.spikeRate) * s.rampSec
  );
}

/** The Cal slot supply of a spike run: 1.05 x the planned iterations, one slot per iteration (as the steady case). */
function calSpikeSlots(ctx: LoadContext): number {
  return Math.ceil(1.05 * plannedIterations(spikeSpec(ctx, "cal", 1)));
}

/** P6-CAL-LOAD-004: the Cal booking spike at 150 % of the knee (characterisation: the product queues, it does not refuse). */
export const CAL_LOAD_004: LoadCase = {
  id: "P6-CAL-LOAD-004",
  telemetry: { product: "cal" },
  title: "Cal booking journey spike at 150 % of the knee: characterisation",
  product: "cal",
  label: "spike characterisation, environment-bound",
  profiles: {
    pr: { rate: SPIKE_RATES.cal.steadyRate, durationSec: 64, maxLatencyMs: 2000 },
    full: { rate: SPIKE_RATES.cal.steadyRate, durationSec: 214, maxLatencyMs: 2000 },
  },
  runs: (ctx) => [
    {
      label: "main",
      script: "k6/cases/cal-load-004.js",
      env: {},
      allowExits: [0],
      spike: spikeSpec(ctx, "cal", 1),
    },
  ],
  stages: {
    setup: (ctx) => calSetup({ slots: { count: calSpikeSlots(ctx) } })(ctx),
    reconcile: composeStages([spikeStage, reconcileStage]),
    cleanup: calCleanup,
  },
};

/** P6-MED-LOAD-003: the Medusa checkout spike at 150 % of the knee, with P6-MED-LOAD-010's abandoned carts in the same run. */
export const MED_LOAD_003: LoadCase = {
  id: "P6-MED-LOAD-003",
  telemetry: { product: "medusa" },
  title: "Medusa checkout journey spike at 150 % of the knee, with abandoned carts",
  product: "medusa",
  label: "spike characterisation, environment-bound",
  profiles: {
    pr: { rate: SPIKE_RATES.medusa.steadyRate, durationSec: 64, maxLatencyMs: 8000 },
    full: { rate: SPIKE_RATES.medusa.steadyRate, durationSec: 214, maxLatencyMs: 8000 },
  },
  runs: (ctx) => [
    {
      label: "main",
      script: "k6/cases/med-load-003.js",
      env: {},
      allowExits: [0],
      spike: spikeSpec(ctx, "medusa", 10),
    },
  ],
  stages: {
    setup: makeMedusaSetup({
      stockFor: (_planned, ctx) =>
        Math.ceil(1.2 * plannedIterations(spikeSpec(ctx, "medusa", 10))) + 10,
    }),
    reconcile: composeStages([spikeStage, reconcileStage]),
    cleanup: medusaCleanup,
  },
};

/** The Documenso limiter's one-minute windows reset in about 60 s; 65 s covers it (the same wait as the knee.yml documenso-limiter job). */
const limiterWindowReset: Stage = async () => {
  await new Promise((resolve) => setTimeout(resolve, 65_000));
  return { ok: true, reasons: [] };
};

/**
 * P6-DOC-LOAD-004: the Documenso signing spike at the limiter-bound rates, on the production-like limiter profile (the CI job's
 * environment). Only this case may leave an unfinished document of a limited intent (plan §6.5).
 */
export const DOC_LOAD_004: LoadCase = {
  id: "P6-DOC-LOAD-004",
  telemetry: { product: "documenso" },
  title: "Documenso signing journey spike on the limiter profile",
  product: "documenso",
  label: "limiter contract, environment-bound",
  limitedFailMayLeaveUnfinished: true,
  profiles: {
    pr: { rate: SPIKE_RATES.documenso.steadyRate, durationSec: 64, maxLatencyMs: 8000 },
    full: { rate: SPIKE_RATES.documenso.steadyRate, durationSec: 214, maxLatencyMs: 8000 },
  },
  runs: (ctx) => [
    {
      label: "main",
      script: "k6/cases/doc-load-004.js",
      env: {},
      secretEnv: ["DOCUMENSO_API_TOKEN"],
      allowExits: [0],
      spike: spikeSpec(ctx, "documenso", 10),
    },
  ],
  stages: {
    setup: makeDocumensoSetup({ webhookMode: "ok" }),
    // The pipeline judges the completed documents and the unfinished ones per intent (the spike is knee-mode for the pipeline).
    reconcile: composeStages([reconcileStage, pipelineStage, spikeStage]),
    // The spike exhausts the tRPC window of the minute; the cleanup's own tRPC calls wait for it to reset.
    cleanup: composeStages([limiterWindowReset, documensoCleanup]),
  },
};

/**
 * P6-DOC-LOAD-009: the Documenso limiter contract (plan Phase 4 task 6 §6.5). No k6 process: the stage probes the ten routes of the
 * limiter table once each (max + 1 requests), against the stack the job started (DOCUMENSO_BASE_URL).
 */
export const DOC_LOAD_009: LoadCase = {
  id: "P6-DOC-LOAD-009",
  telemetry: { product: "documenso" },
  title: "Documenso limiter contract on the ten probed routes",
  product: "documenso",
  label: "limiter contract, environment-bound",
  profiles: {
    pr: { rate: 0, durationSec: 60, maxLatencyMs: 8000 },
    full: { rate: 0, durationSec: 120, maxLatencyMs: 8000 },
  },
  runs: () => [],
  stages: {
    reconcile: limiterContractStage,
  },
};

/**
 * The Cal soak's slot pool (plan Phase 4b task 7 §6.3): the iteration i books pool[i mod P] and cancels it, so a slot is free again
 * only after P / rate seconds. The probe of 2026-10-26 showed 50 slots (12.5 s) too few for the warm-up iterations (up to 16 s with the
 * tail), so the pool is 100 (25 s at 4 per second).
 */
export const CAL_SOAK_POOL = 100;

/** P6-CAL-LOAD-008: the Cal booking soak with slot recycling (plan Phase 4b task 7 §6.3). Rate and duration come from withSoakProfile. */
export const CAL_LOAD_008: LoadCase = {
  id: "P6-CAL-LOAD-008",
  telemetry: { product: "cal" },
  title: "Cal booking journey soak with slot recycling",
  product: "cal",
  label: "soak, environment-bound",
  profiles: {
    pr: { rate: 2, durationSec: 30, maxLatencyMs: 2000 },
    full: { rate: 2, durationSec: 120, maxLatencyMs: 2000 },
  },
  runs: () => [{ label: "main", script: "k6/cases/cal-load-008.js", env: {} }],
  stages: {
    // Recycle mode: the audit reads the cancelled rows (plan Phase 4b task 7 §6.3), set after the setup has built the audit config.
    setup: async (ctx) => {
      const result = await calSetup({ slots: { count: CAL_SOAK_POOL } })(ctx);
      if (ctx.config.audit !== undefined)
        (ctx.config.audit as Record<string, unknown>).recycle = true;
      return result;
    },
    reconcile: reconcileStage,
    cleanup: calCleanup,
  },
};

/** The burst and stale target: the last offered slot, which the steady stream never reaches (it books the first `steady` slots). */
function calInvariantSetup(ctx: LoadContext): Promise<StageResult> {
  // k6 numbers iterations across scenarios (iterationInTest), so the target index sits beyond the steady and burst indices: 2 x N + 1 spare.
  return calSetup({ slots: { count: calSteadySlots(ctx) + 2 * 8 + 1 } })(ctx).then((result) => {
    if (result.ok && Array.isArray(ctx.config.slotStarts)) {
      const starts = ctx.config.slotStarts as string[];
      ctx.config.burstSlot = starts[starts.length - 1];
      ctx.config.burstAttempts = 8;
      ctx.config.burstAtSec = ctx.profile.durationSec >= 120 ? 40 : 20;
      ctx.config.polls = 30;
    }
    return result;
  });
}

/** P6-CAL-LOAD-002: one free slot, N simultaneous bookings inside steady load (plan Phase 4b task 8 §6.2). */
export const CAL_LOAD_002: LoadCase = {
  id: "P6-CAL-LOAD-002",
  telemetry: { product: "cal" },
  title: "Cal burst: one free slot, N simultaneous bookings inside steady load",
  product: "cal",
  label: "functional load, not capacity",
  profiles: {
    pr: { rate: 2, durationSec: 60, maxLatencyMs: 2000 },
    full: { rate: 4, durationSec: 120, maxLatencyMs: 2000 },
  },
  runs: () => [{ label: "main", script: "k6/cases/cal-load-002.js", env: {} }],
  stages: {
    setup: calInvariantSetup,
    reconcile: composeStages([reconcileStage, calBurstStage]),
    cleanup: calCleanup,
  },
};

/** P6-CAL-LOAD-006: the stale read after commit under steady load (plan Phase 4b task 8 §6.3). */
export const CAL_LOAD_006: LoadCase = {
  id: "P6-CAL-LOAD-006",
  telemetry: { product: "cal" },
  title: "Cal stale read after commit under steady load",
  product: "cal",
  label: "functional load, not capacity",
  profiles: {
    pr: { rate: 2, durationSec: 60, maxLatencyMs: 2000 },
    full: { rate: 4, durationSec: 120, maxLatencyMs: 2000 },
  },
  runs: () => [{ label: "main", script: "k6/cases/cal-load-006.js", env: {} }],
  stages: {
    setup: calInvariantSetup,
    reconcile: composeStages([reconcileStage, calStaleStage]),
    cleanup: calCleanup,
  },
};

/**
 * The soak's reconcile stages (D-B2): the audit, then the conservation judge with the stock-exhausted check off. The soak's stock is
 * planned + 20 and never runs out by design; every other conservation check still runs. Exported for the test.
 */
export const MED_SOAK_CONSERVATION_STAGE = makeConservationStage({ expectStockExhausted: false });
export const MED_SOAK_RECONCILE_STAGES = [reconcileStage, MED_SOAK_CONSERVATION_STAGE] as const;

/** P6-MED-LOAD-005: the Medusa checkout soak (plan Phase 4b task 7 §6.3). Stock is planned + 20, never planned / 2 (finding M-F1). */
export const MED_LOAD_005: LoadCase = {
  id: "P6-MED-LOAD-005",
  telemetry: { product: "medusa" },
  title: "Medusa checkout soak",
  product: "medusa",
  label: "soak, environment-bound",
  profiles: {
    pr: { rate: 1, durationSec: 10, maxLatencyMs: 5000 },
    full: { rate: 1, durationSec: 30, maxLatencyMs: 5000 },
  },
  runs: () => [{ label: "main", script: "k6/cases/med-load-005.js", env: {} }],
  stages: {
    setup: makeMedusaSetup({ stockFor: (planned) => planned + 20 }),
    reconcile: composeStages([...MED_SOAK_RECONCILE_STAGES]),
    cleanup: medusaCleanup,
  },
};

/** P6-DOC-LOAD-006: the Documenso signing soak (plan Phase 4b task 7 §6.3). Rate and duration come from withSoakProfile. */
export const DOC_LOAD_006: LoadCase = {
  id: "P6-DOC-LOAD-006",
  telemetry: { product: "documenso" },
  title: "Documenso signing soak",
  product: "documenso",
  label: "soak, environment-bound",
  profiles: {
    pr: { rate: 1, durationSec: 10, maxLatencyMs: 12000 },
    full: { rate: 1, durationSec: 30, maxLatencyMs: 12000 },
  },
  runs: () => [
    {
      label: "main",
      script: "k6/cases/doc-load-006.js",
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

/** P6-MED-LOAD-007: two-instance conservation under steady load (plan Phase 4b task 10 §6.2). The second backend is the harness's MEDUSA_SECOND_BASE_URL. */
export const MED_LOAD_007: LoadCase = {
  id: "P6-MED-LOAD-007",
  telemetry: { product: "medusa" },
  title: "Medusa two-instance conservation under steady load",
  product: "medusa",
  label: "functional load, not capacity",
  profiles: {
    // rate is per second: 0.7 is written as 7 per 10 s (openModelScenario). 7 here offered ten times the planned load (run 40476542059).
    pr: { rate: 0.7, timeUnitSec: 10, durationSec: 10, maxLatencyMs: 5000 },
    full: { rate: 0.7, timeUnitSec: 10, durationSec: 120, maxLatencyMs: 5000 },
  },
  runs: () => [{ label: "main", script: "k6/cases/med-load-007.js", env: {} }],
  stages: {
    setup: makeInvariantSetup({ promo: false }),
    reconcile: composeStages([reconcileStage, splitStage]),
    cleanup: medusaCleanup,
  },
};

/** P6-MED-LOAD-008: the promo ledger under steady load (plan Phase 4b task 10 §6.3). Gift-card clause stays PENDING (D34). */
export const MED_LOAD_008: LoadCase = {
  id: "P6-MED-LOAD-008",
  telemetry: { product: "medusa" },
  title: "Medusa promo ledger under steady load",
  product: "medusa",
  label: "functional load, not capacity",
  profiles: {
    pr: { rate: 0.7, timeUnitSec: 10, durationSec: 10, maxLatencyMs: 5000 },
    full: { rate: 0.7, timeUnitSec: 10, durationSec: 120, maxLatencyMs: 5000 },
  },
  runs: () => [{ label: "main", script: "k6/cases/med-load-008.js", env: {} }],
  stages: {
    setup: makeInvariantSetup({ promo: true }),
    reconcile: composeStages([reconcileStage, ledgerStage]),
    cleanup: medusaCleanup,
  },
};

/** P6-MED-LOAD-009: double cancel and cancel-vs-fulfil inside steady load (plan Phase 4b task 10 §6.4). The admin token is a secret env. */
export const MED_LOAD_009: LoadCase = {
  id: "P6-MED-LOAD-009",
  telemetry: { product: "medusa" },
  title: "Medusa double cancel and cancel-vs-fulfil under steady load",
  product: "medusa",
  label: "functional load, not capacity",
  profiles: {
    pr: { rate: 0.7, timeUnitSec: 10, durationSec: 10, maxLatencyMs: 5000 },
    full: { rate: 0.7, timeUnitSec: 10, durationSec: 120, maxLatencyMs: 5000 },
  },
  runs: () => [
    {
      label: "main",
      script: "k6/cases/med-load-009.js",
      env: {},
      secretEnv: ["MEDUSA_ADMIN_TOKEN"],
    },
  ],
  stages: {
    setup: makeInvariantSetup({ promo: false, knownLeakId: KNOWN_LEAK_ID }),
    reconcile: composeStages([reconcileStage, cancelRaceStage]),
    cleanup: medusaCleanup,
  },
};

/** TW-BG-FOUNDATION (Twenty plan §2.4, Q3): the background journey through the runner, user-token auth (§2.12). Not a P6 case. */
export const TW_BG_FOUNDATION: LoadCase = {
  id: "TW-BG-FOUNDATION",
  title: "Twenty background journey (foundation)",
  product: "twenty",
  label: "functional load, not capacity",
  telemetry: { product: "twenty" },
  profiles: {
    pr: { rate: 1, durationSec: 30, maxLatencyMs: 4000 },
    full: { rate: 2, durationSec: 120, maxLatencyMs: 4000 },
  },
  runs: (ctx) =>
    ctx.invalid.length > 0
      ? []
      : [
          {
            label: "main",
            script: "k6/cases/tw-background.js",
            env: {},
            secretEnv: ["TWENTY_TOKEN"],
          },
        ],
  stages: { setup: twentySetup, reconcile: reconcileStage, cleanup: twentyCleanup },
};

/**
 * P6-TW-LOAD-005 (Task 5): a one-time reset token is redeemed in parallel while steady background load runs. Nightly and dispatch
 * only (twenty-load.yml). The result is named by its verdict word and finding ID only (Q-DISCLOSE).
 */
export const TW_LOAD_005: LoadCase = {
  id: "P6-TW-LOAD-005",
  title: "Twenty one-time reset token under load",
  product: "twenty",
  label: "functional load, not capacity",
  telemetry: { product: "twenty" },
  profiles: {
    pr: { rate: 1, durationSec: 60, maxLatencyMs: 4000 },
    full: { rate: 1, durationSec: 300, maxLatencyMs: 4000 },
  },
  runs: (ctx) =>
    ctx.invalid.length > 0
      ? []
      : [
          {
            label: "main",
            script: "k6/cases/tw-load-005.js",
            env: {},
            secretEnv: ["TWENTY_TOKEN"],
          },
        ],
  stages: RESET_TOKEN_STAGES,
};

/**
 * P6-TW-LOAD-011 (Task 5, accepted extra): the expiry boundary. Token A is redeemed 15 s before its expiry, token B 15 s after.
 * It is not gated in the registry: run-load refuses gated cases, so its gate (an expiry above 15 min) is checked when the
 * case runs, and the case reports NOT RUN when the gate is closed.
 */
export const TW_LOAD_011: LoadCase = {
  ...TW_LOAD_005,
  id: "P6-TW-LOAD-011",
  title: "Twenty reset token expiry boundary",
  profiles: {
    pr: { rate: 1, durationSec: 330, maxLatencyMs: 4000 },
    full: { rate: 1, durationSec: 330, maxLatencyMs: 4000 },
  },
  stages: BOUNDARY_STAGES,
};

/** P6-TW-LOAD-010 (gated, Twenty plan §12): registered, never run until its gate opens. Profiles are placeholders until then. */
export const TW_LOAD_010: LoadCase = {
  ...TW_BG_FOUNDATION,
  id: "P6-TW-LOAD-010",
  title: "Twenty worker queue drain (gated)",
  gated: true,
  runs: () => [],
};

/** P6-TW-LOAD-008 (gated, Twenty plan §12): registered, never run until its gate opens. Profiles are placeholders until then. */
export const TW_LOAD_008: LoadCase = {
  ...TW_BG_FOUNDATION,
  id: "P6-TW-LOAD-008",
  title: "Twenty API knee (gated)",
  gated: true,
  runs: () => [],
};

/**
 * P6-TW-LOAD-006 (Twenty plan, rate-limit contract): one API key on the production-like profile (image defaults). The phases
 * live in k6/cases/tw-load-006.js; the profile fields are informational. No PR run (roadmap line 459): the weekly job only.
 */
export const TW_LOAD_006: LoadCase = {
  id: "P6-TW-LOAD-006",
  title: "Twenty rate-limit contract (production-like profile)",
  product: "twenty",
  label: "functional load, not capacity",
  telemetry: { product: "twenty" },
  profiles: {
    pr: { rate: 1, durationSec: 540, maxLatencyMs: 4000 },
    full: { rate: 1, durationSec: 540, maxLatencyMs: 4000 },
  },
  runs: (ctx) =>
    ctx.invalid.length > 0
      ? []
      : [
          {
            label: "main",
            script: "k6/cases/tw-load-006.js",
            env: {},
            secretEnv: ["TWENTY_API_KEYS"],
          },
        ],
  stages: {
    setup: twentySetup,
    preflight: limiterPreflight,
    reconcile: rateLimit006Reconcile,
    cleanup: twentyCleanup,
  },
};

/**
 * P6-TW-LOAD-009 (Twenty plan, limiter fairness, the accepted extra): key F floods and key L asks at a low rate, both on the
 * production-like profile. The expected verdict at image defaults is FINDING (cross-key starvation). It runs (not gated): its
 * gate, per token or workspace, is met (Twenty plan, gate section).
 */
export const TW_LOAD_009: LoadCase = {
  ...TW_LOAD_006,
  id: "P6-TW-LOAD-009",
  title: "Twenty limiter fairness across keys (cross-key)",
  profiles: {
    pr: { rate: 1, durationSec: 120, maxLatencyMs: 4000 },
    full: { rate: 1, durationSec: 120, maxLatencyMs: 4000 },
  },
  runs: (ctx) =>
    ctx.invalid.length > 0
      ? []
      : [
          {
            label: "main",
            script: "k6/cases/tw-load-009.js",
            env: {},
            secretEnv: ["TWENTY_API_KEYS"],
          },
        ],
  stages: {
    setup: twentySetup,
    preflight: limiterPreflight,
    reconcile: fairness009Reconcile,
    cleanup: twentyCleanup,
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
  [DOC_LOAD_003.id]: DOC_LOAD_003,
  [DOC_LOAD_008.id]: DOC_LOAD_008,
  [CAL_LOAD_007.id]: CAL_LOAD_007,
  [CAL_LOAD_009.id]: CAL_LOAD_009,
  [CAL_LOAD_008.id]: CAL_LOAD_008,
  [CAL_LOAD_002.id]: CAL_LOAD_002,
  [CAL_LOAD_006.id]: CAL_LOAD_006,
  [MED_LOAD_005.id]: MED_LOAD_005,
  [MED_LOAD_007.id]: MED_LOAD_007,
  [MED_LOAD_008.id]: MED_LOAD_008,
  [MED_LOAD_009.id]: MED_LOAD_009,
  [DOC_LOAD_006.id]: DOC_LOAD_006,
  [CAL_LOAD_005.id]: CAL_LOAD_005,
  [CAL_LOAD_004.id]: CAL_LOAD_004,
  [MED_LOAD_003.id]: MED_LOAD_003,
  [DOC_LOAD_004.id]: DOC_LOAD_004,
  [DOC_LOAD_009.id]: DOC_LOAD_009,
  [CAL_LOAD_003.id]: CAL_LOAD_003,
  [DOC_LOAD_005.id]: DOC_LOAD_005,
  [MED_LOAD_004.id]: MED_LOAD_004,
  [MED_LOAD_006.id]: MED_LOAD_006,
  [DOC_LOAD_007.id]: DOC_LOAD_007,
  [KNEE_RULE_006.id]: KNEE_RULE_006,
  [TW_BG_FOUNDATION.id]: TW_BG_FOUNDATION,
  [TW_LOAD_008.id]: TW_LOAD_008,
  [TW_LOAD_010.id]: TW_LOAD_010,
  [TW_LOAD_004.id]: TW_LOAD_004,
  [TW_LOAD_005.id]: TW_LOAD_005,
  [TW_LOAD_011.id]: TW_LOAD_011,
  [TW_LOAD_006.id]: TW_LOAD_006,
  [TW_LOAD_009.id]: TW_LOAD_009,
};
