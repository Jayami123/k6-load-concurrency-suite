import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { judgeValidity } from "../../src/load/validity.ts";
import { parseK6Summary } from "../../src/load/summary.ts";
import { createTelemetry, samplerStop } from "../../src/load/telemetry/stages.ts";
import type { ProductSources } from "../../src/load/telemetry/run.ts";
import type {
  K6RunResult,
  K6RunSpec,
  LoadCase,
  LoadContext,
  LoadProfile,
} from "../../src/load/types.ts";

const profile: LoadProfile = { rate: 40, durationSec: 30, maxLatencyMs: 1600 };

function ctxFor(outDir: string, spec: K6RunSpec): LoadContext {
  const caseDef: LoadCase = {
    id: "P6-X-LOAD-002",
    title: "telemetry",
    product: "stub",
    label: "functional load, not capacity",
    profiles: { pr: profile, full: profile },
    runs: () => [spec],
    telemetry: { product: "stub" },
  };
  return {
    caseDef,
    profileName: "pr",
    profile,
    runId: "20261024T010203Z-3fa9c0d1",
    runPrefix: "p6-qa-20261024T010203Z-3fa9c0d1",
    outDir,
    env: {},
    config: {},
    handles: {},
    k6: [],
    invalid: [],
    results: {},
  };
}

/** A fake clock that moves only when the sampler sleeps, and yields to the event loop on every sleep (a synchronous sleep would starve it). */
function fakeClock() {
  let t = 0;
  return {
    now: () => t,
    sleep: (ms: number) =>
      new Promise<void>((resolve) => {
        t += ms;
        setImmediate(resolve);
      }),
  };
}

const ticks = (n: number) =>
  (async () => {
    for (let i = 0; i < n; i += 1) await new Promise((resolve) => setImmediate(resolve));
  })();

describe("telemetry stages", () => {
  it("the run summary carries the gap and feeds judgeValidity as INVALID telemetry_gap", async () => {
    const outDir = mkdtempSync(path.join(tmpdir(), "telemetry-stages-"));
    const spec: K6RunSpec = {
      label: "forcedGap",
      script: "k6/selftest/coordinated-omission.js",
      env: {},
      injectGapMs: 3500,
    };
    const ctx = ctxFor(outDir, spec);
    const sources: ProductSources = { product: "stub" };
    const clock = fakeClock();
    const handle = createTelemetry(ctx, sources, { now: clock.now, sleep: clock.sleep });
    const runSpec = await handle.beforeRun(spec);
    assert.match(runSpec.env.MARKER_URL ?? "", /^http:\/\/127\.0\.0\.1:\d+\/clock$/);

    const result: K6RunResult = {
      label: spec.label,
      exitCode: 0,
      summaryPath: path.join(outDir, "missing-summary.json"),
      pointsPath: path.join(outDir, "missing-points.json.gz"),
      stdoutPath: "",
      startedAtMs: 0,
      endedAtMs: 0,
      pid: 0,
    };
    await ticks(60);
    await handle.afterRun(spec, result);

    const summary = result.telemetry;
    assert.ok(summary, "afterRun attaches the run's own summary");
    assert.equal(handle.runs[spec.label], summary);
    assert.ok(summary.gaps.length >= 1, "the injected stall shows as a gap");
    assert.match(summary.gaps[0] ?? "", /^\d+ ms at \+\d+ ms$/);

    const verdict = judgeValidity({
      summary: parseK6Summary({}),
      maxVUs: 120,
      nproc: 4,
      telemetry: { gaps: summary.gaps, skewMs: summary.skewMs, skewLimitMs: summary.skewLimitMs },
    });
    assert.equal(verdict.verdict, "INVALID");
    assert.ok(verdict.reasons.some((r) => r.code === "telemetry_gap"));
    await handle.close();
  });

  it("closing the handle stops the marker, ends the pool and clears ctx.handles", async () => {
    const outDir = mkdtempSync(path.join(tmpdir(), "telemetry-stages-"));
    const spec: K6RunSpec = { label: "normal", script: "k6/selftest/telemetry.js", env: {} };
    const ctx = ctxFor(outDir, spec);
    let ended = false;
    // A pool whose connect fails: the db source is absent for every sample, which the sampler records as an error, not a crash.
    const pool = {
      connect: async () => {
        throw new Error("no database in this test");
      },
      end: async () => {
        ended = true;
      },
    };
    const clock = fakeClock();
    const handle = createTelemetry(
      ctx,
      { product: "stub", pool: pool as unknown as ProductSources["pool"] },
      { now: clock.now, sleep: clock.sleep },
    );
    ctx.handles.telemetry = handle;
    const runSpec = await handle.beforeRun(spec);
    const url = runSpec.env.MARKER_URL ?? "";
    await ticks(5);
    await handle.close();

    assert.equal(ended, true, "the pool is ended");
    await assert.rejects(fetch(url), "the marker port no longer answers");

    const stopped = await samplerStop(ctx);
    assert.equal(stopped.ok, true);
    assert.equal(ctx.handles.telemetry, undefined, "the handle is removed from ctx.handles");
    assert.deepEqual(handle.errors, [], "a failed database read is absent, not a write error");
  });
});
