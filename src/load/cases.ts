import { existsSync, readFileSync } from "node:fs";
import { connect } from "node:net";
import { preAllocatedVUs } from "../../k6/lib/pure/sizing.js";
import { evaluateCoordinatedOmission } from "./co-relations.ts";
import { evaluateOverhead, type OverheadRun } from "./overhead.ts";
import { processGone } from "./runner.ts";
import { parseK6Summary, type K6Summary } from "./summary.ts";
import { startStub } from "./stub-server.ts";
import { calCleanup, calSetup } from "./products/cal.ts";
import { documensoCleanup, documensoSetup } from "./products/documenso.ts";
import { medusaCleanup, medusaSetup } from "./products/medusa.ts";
import { reconcileStage } from "./reconcile/index.ts";
import type { LoadCase, Stage } from "./types.ts";

const SERVICE_MS = 25;
const STALL_MS = 1500;
const PERIOD_MS = 10000;
const SELFTEST = "k6/selftest/coordinated-omission.js";
const TELEMETRY = "k6/selftest/telemetry.js";

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
        script: TELEMETRY,
        env: base,
        maxVUs: 120,
        telemetry: false,
        expectValidity: "VALID" as const,
      },
      {
        label: `with-${i}`,
        script: TELEMETRY,
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
  title: "Cal journey smoke: getSchedule, book",
  product: "cal",
  label: "functional load, not capacity",
  profiles: {
    pr: { rate: 2, durationSec: 10, maxLatencyMs: 1000 },
    full: { rate: 2, durationSec: 30, maxLatencyMs: 1000 },
  },
  runs: () => [{ label: "main", script: "k6/cases/cal-load-001.js", env: {} }],
  stages: { setup: calSetup, reconcile: reconcileStage, cleanup: calCleanup },
};

/** P6-MED-LOAD-001: one checkout per iteration against a stocked variant (plan §6.2). */
export const MED_LOAD_001: LoadCase = {
  id: "P6-MED-LOAD-001",
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

export const CASES: Record<string, LoadCase> = {
  [COOP_LOAD_001.id]: COOP_LOAD_001,
  [VALIDITY_LOAD_004.id]: VALIDITY_LOAD_004,
  [TELEMETRY_LOAD_002.id]: TELEMETRY_LOAD_002,
  [OVERHEAD_LOAD_006.id]: OVERHEAD_LOAD_006,
  [CAL_LOAD_001.id]: CAL_LOAD_001,
  [MED_LOAD_001.id]: MED_LOAD_001,
  [DOC_LOAD_001.id]: DOC_LOAD_001,
};
