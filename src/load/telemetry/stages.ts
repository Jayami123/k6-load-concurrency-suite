import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { documensoDatabaseUrlFromEnv } from "../../documenso/env.ts";
import { createReadOnlyPool } from "../../oracles/pg.ts";
import { calDatabaseUrlFromEnv, medusaDatabaseUrlFromEnv } from "../../races/env.ts";
import { twentyDatabaseUrlFromEnv } from "../../twenty/env.ts";
import { READINESS } from "../readiness.ts";
import type {
  K6RunResult,
  K6RunSpec,
  LoadContext,
  LoadProduct,
  Stage,
  TelemetrySummary,
} from "../types.ts";
import { detectCgroup, discoverContainer } from "./cgroup-stats.ts";
import { discoverTwentyContainers } from "./docker-stats.ts";
import { type AppProcess, HARNESS_DIR, resolveAppProcess } from "./proc-group.ts";
import {
  finishRunTelemetry,
  startRunTelemetry,
  type ProductSources,
  type RunTelemetry,
} from "./run.ts";
import type { SamplerOptions } from "./sampler.ts";

/** The product's log file in the harness state directory (counted for error lines, never read back). */
/** An empty name means no log file: the Twenty container logs are captured by the job (Twenty plan §2.8 step 14). */
const LOG_FILES: Record<Exclude<LoadProduct, "stub">, string> = {
  medusa: "medusa-backend.log",
  cal: "cal-web.log",
  documenso: "documenso-web.log",
  twenty: "",
};

/** One handle per case, stored in ctx.handles.telemetry: runAllK6 calls beforeRun and afterRun around each k6 process. */
export interface TelemetryHandle {
  /** Starts the marker and the sampler for a run that wants telemetry; returns the spec with MARKER_URL set. */
  beforeRun(spec: K6RunSpec): Promise<K6RunSpec>;
  /** Stops that run's sampler, writes its files and attaches its summary to the run's own result. */
  afterRun(spec: K6RunSpec, result: K6RunResult): Promise<void>;
  /** Finishes anything still open and closes the database pool. */
  close(): Promise<void>;
  /** Per-run summaries, keyed by K6RunSpec.label. */
  readonly runs: Record<string, TelemetrySummary>;
  /** Write failures (a TEST BUG), one line each. */
  readonly errors: string[];
}

const DATABASE_URL: Record<Exclude<LoadProduct, "stub">, (env: NodeJS.ProcessEnv) => string> = {
  medusa: (env) => medusaDatabaseUrlFromEnv(env),
  cal: (env) => calDatabaseUrlFromEnv(env),
  documenso: (env) => documensoDatabaseUrlFromEnv(env),
  twenty: (env) => twentyDatabaseUrlFromEnv(env),
};

const statfsType = () =>
  new Promise<string>((resolve, reject) =>
    execFile("stat", ["-f", "-c", "%T", "/sys/fs/cgroup"], { encoding: "utf8" }, (err, out) =>
      err ? reject(err) : resolve(out),
    ),
  );

async function orUndefined<T>(fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch {
    return undefined;
  }
}

/**
 * Opens what the sampler reads for one product: a read-only pool of one connection, the database container (found by name, its
 * cgroup kind read once), the log file if it exists, the first readiness URL and the app process record. Every source that cannot be
 * opened is left out and the sampler reports it as absent. Nothing here starts or stops a product.
 */
export async function openSources(
  product: LoadProduct,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ProductSources> {
  if (product === "stub") return { product };
  const sources: ProductSources = { product };
  sources.pool = createReadOnlyPool(DATABASE_URL[product](env), {
    max: 1,
    connectionTimeoutMs: 5000,
    queryTimeoutMs: 5000,
  });
  const found = await orUndefined(() => discoverContainer(product));
  const fs = found ? await orUndefined(statfsType) : undefined;
  if (found && fs) sources.container = { id: found.id, kind: detectCgroup(fs) };
  const logName = LOG_FILES[product];
  const logFile = path.join(HARNESS_DIR, logName);
  if (logName && existsSync(logFile)) sources.logFile = logFile;
  sources.probeUrl = READINESS[product](env)[0];
  sources.appProcess = resolveAppProcess(product);
  if (product === "twenty") {
    const cgroupFs = await orUndefined(statfsType);
    sources.containers =
      (await orUndefined(() =>
        discoverTwentyContainers(undefined, cgroupFs ? detectCgroup(cgroupFs) : "absent"),
      )) ?? [];
  }
  return sources;
}

/** True when a run takes telemetry: its own setting, else the case's. */
export function telemetryWanted(ctx: LoadContext, spec: K6RunSpec): boolean {
  return spec.telemetry ?? Boolean(ctx.caseDef.telemetry);
}

/** The handle for one case. `overrides` reaches the sampler (tests use a fake clock and sleep). */
export function createTelemetry(
  ctx: LoadContext,
  sources: ProductSources,
  overrides: Partial<SamplerOptions> = {},
): TelemetryHandle {
  const open = new Map<string, RunTelemetry>();
  const runs: Record<string, TelemetrySummary> = {};
  const errors: string[] = [];
  return {
    runs,
    errors,
    async beforeRun(spec) {
      if (!telemetryWanted(ctx, spec)) return spec;
      const run = await startRunTelemetry(ctx, spec, sources, overrides);
      open.set(spec.label, run);
      return { ...spec, env: { ...spec.env, MARKER_URL: run.marker.url } };
    },
    async afterRun(spec, result) {
      const run = open.get(spec.label);
      if (!run) return;
      open.delete(spec.label);
      try {
        const summary = await finishRunTelemetry(ctx, run, result);
        result.telemetry = summary;
        runs[spec.label] = summary;
      } catch (err) {
        errors.push(`${spec.label}: ${(err as Error).message}`);
      }
    },
    async close() {
      for (const [label, run] of open) {
        open.delete(label);
        await run.sampler.stop();
        await run.marker.close();
      }
      await sources.pool?.end();
    },
  };
}

/** Opens the sources and stores the handle. A source that cannot be opened is absent, not a failure. */
export const samplerStart: Stage = async (ctx) => {
  const product = ctx.caseDef.telemetry?.product ?? "stub";
  const sources = ctx.caseDef.telemetry ? await openSources(product, ctx.env) : { product };
  // The knee self-test's burn stub is a child process of the case, not a product: its group comes from the setup (plan §6.4).
  const app = ctx.handles.appProcess as AppProcess[] | undefined;
  if (app) sources.appProcess = app;
  ctx.handles.telemetry = createTelemetry(ctx, sources);
  return { ok: true, reasons: [], data: { product } };
};

/** Closes the handle (sampler, marker, pool) and returns the per-run summaries. A failed write is a TEST BUG. */
export const samplerStop: Stage = async (ctx) => {
  const handle = ctx.handles.telemetry as TelemetryHandle | undefined;
  if (!handle) return { ok: true, reasons: [] };
  delete ctx.handles.telemetry;
  await handle.close();
  const data = { runs: handle.runs };
  if (handle.errors.length > 0) {
    return { ok: false, kind: "TEST BUG", reasons: [...handle.errors], data };
  }
  return { ok: true, reasons: [], data };
};
