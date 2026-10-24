import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { evaluateVerdict, runLoad, summaryFor } from "../../src/load/runner.ts";
import { validityStage } from "../../src/load/stages.ts";
import type {
  K6RunResult,
  K6RunSpec,
  LoadCase,
  LoadContext,
  StageSet,
} from "../../src/load/types.ts";

const caseDef = (runs: K6RunSpec[] = []): LoadCase => ({
  id: "P6-X-TEST-001",
  title: "test",
  product: "stub",
  label: "functional load, not capacity",
  profiles: {
    pr: { rate: 1, durationSec: 1, maxLatencyMs: 1 },
    full: { rate: 1, durationSec: 1, maxLatencyMs: 1 },
  },
  runs: () => runs,
});

function ctxWith(over: Partial<LoadContext> = {}, runs: K6RunSpec[] = []): LoadContext {
  const def = caseDef(runs);
  return {
    caseDef: def,
    profileName: "pr",
    profile: def.profiles.pr,
    runId: "20261024T010203Z-3fa9c0d1",
    runPrefix: "p6-qa-20261024T010203Z-3fa9c0d1",
    outDir: tmpdir(),
    env: {},
    config: {},
    k6: [],
    invalid: [],
    results: {},
    ...over,
  };
}

const k6Run = (label: string, exitCode: number): K6RunResult => ({
  label,
  exitCode,
  summaryPath: "",
  pointsPath: "",
  stdoutPath: "",
  startedAtMs: 0,
  endedAtMs: 0,
  pid: 1,
});

describe("load runner", () => {
  it("evaluateVerdict is PASS when every stage is ok", () => {
    const ctx = ctxWith({
      results: { setup: { ok: true, reasons: [] }, k6: { ok: true, reasons: [] } },
    });
    assert.equal(evaluateVerdict(ctx).outcome, "PASS");
  });

  it("evaluateVerdict is FAIL on a k6 exit code that differs from the expected one", () => {
    const ctx = ctxWith({ k6: [k6Run("main", 1)] }, [{ label: "main", script: "s.js", env: {} }]);
    const v = evaluateVerdict(ctx);
    assert.equal(v.outcome, "FAIL");
    assert.match(v.reasons.join(" "), /k6 main exited 1, expected 0/);
  });

  it("evaluateVerdict is FAIL on a PRODUCT BUG even when the run is also INVALID", () => {
    const ctx = ctxWith({
      invalid: ["sampler gap"],
      results: { reconcile: { ok: false, kind: "PRODUCT BUG", reasons: ["oversell"] } },
    });
    assert.equal(evaluateVerdict(ctx).outcome, "FAIL");
  });

  it("evaluateVerdict is INVALID when only invalid reasons exist", () => {
    const ctx = ctxWith({
      invalid: ["sampler gap"],
      results: { setup: { ok: true, reasons: [] } },
    });
    assert.equal(evaluateVerdict(ctx).outcome, "INVALID");
  });

  it("evaluateVerdict is ENV when setup failed", () => {
    const ctx = ctxWith({ results: { setup: { ok: false, kind: "ENV", reasons: ["no stub"] } } });
    assert.equal(evaluateVerdict(ctx).outcome, "ENV");
  });

  it("runs the stages in order, records a throw as TEST BUG and still runs cleanup", async () => {
    const order: string[] = [];
    const rec = (name: string) => async () => {
      order.push(name);
      return { ok: true, reasons: [] };
    };
    const stages: Partial<StageSet> = {
      setup: rec("setup"),
      preflight: rec("preflight"),
      samplerStart: rec("samplerStart"),
      k6: rec("k6"),
      samplerStop: rec("samplerStop"),
      drain: rec("drain"),
      reconcile: async () => {
        order.push("reconcile");
        throw new Error("boom");
      },
      cleanup: rec("cleanup"),
      tokenScan: rec("tokenScan"),
    };
    const outRoot = mkdtempSync(path.join(tmpdir(), "p6-load-runner-"));
    const result = await runLoad(caseDef(), {
      profile: "pr",
      outRoot,
      runId: "run-a",
      stages,
      env: {},
    });
    assert.deepEqual(order, [
      "setup",
      "preflight",
      "samplerStart",
      "k6",
      "samplerStop",
      "drain",
      "reconcile",
      "cleanup",
      "tokenScan",
    ]);
    assert.equal(result.ctx.results.reconcile?.kind, "TEST BUG");
    assert.equal(result.outcome, "FAIL");
    const verdict = JSON.parse(readFileSync(result.verdictPath, "utf8")) as {
      outcome: string;
      schema: number;
    };
    assert.equal(verdict.schema, 1);
    assert.equal(verdict.outcome, "FAIL");
  });

  it("summaryFor marks a truncated k6 summary as unreadable instead of throwing", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "p6-load-summary-"));
    const summaryPath = path.join(dir, "k6-main-summary.json");
    writeFileSync(summaryPath, '{"metrics": {"http_req_dur');
    const k: K6RunResult = {
      label: "main",
      exitCode: 137,
      summaryPath,
      pointsPath: path.join(dir, "k6-main.json.gz"),
      stdoutPath: path.join(dir, "k6-main.log"),
      startedAtMs: 0,
      endedAtMs: 0,
      pid: 0,
    };
    assert.deepEqual(summaryFor(k), { label: "main", exitCode: 137, summary: "unreadable" });
  });
});

describe("load validity wiring", () => {
  const saturatedSummary = {
    metrics: {
      http_reqs: { count: 1032 },
      dropped_iterations: { count: 168 },
      vus: { min: 1, max: 5 },
      vus_max: { value: 5 },
      http_req_duration: { "p(95)": 27, med: 20, max: 60 },
    },
  };
  const writeSummary = (): string => {
    const dir = mkdtempSync(path.join(tmpdir(), "p6-validity-"));
    const file = path.join(dir, "k6-saturated-summary.json");
    writeFileSync(file, JSON.stringify(saturatedSummary));
    return file;
  };
  const k6 = (label: string, summaryPath: string, exitCode = 0): K6RunResult => ({
    label,
    exitCode,
    summaryPath,
    pointsPath: "",
    stdoutPath: "",
    startedAtMs: 0,
    endedAtMs: 0,
    pid: 1,
  });
  const saturatedRun: K6RunSpec = {
    label: "saturated",
    script: "s.js",
    env: {},
    maxVUs: 5,
    expectValidity: "INVALID",
    expectCodes: ["dropped_iterations", "vu_exhausted"],
  };

  it("an expected INVALID run that shows its codes gives PASS, and a run without a summary is skipped", async () => {
    const ctx = ctxWith(
      { k6: [k6("saturated", writeSummary()), k6("ghost", "/nonexistent/summary.json")] },
      [saturatedRun],
    );
    const r = await validityStage(ctx);
    assert.equal(r.ok, true);
    assert.deepEqual(r.data?.judged, ["saturated"]);
    assert.equal(ctx.invalid.length, 0);
    assert.equal(evaluateVerdict(ctx).outcome, "PASS");
  });

  it("an expected INVALID run that does not show a code is a TEST BUG and gives FAIL", async () => {
    const ctx = ctxWith({ k6: [k6("saturated", writeSummary())] }, [
      { ...saturatedRun, expectCodes: ["runner_cpu"] },
    ]);
    const r = await validityStage(ctx);
    assert.equal(r.ok, false);
    assert.equal(r.kind, "TEST BUG");
    assert.match(r.reasons.join(" "), /did not show runner_cpu/);
    assert.equal(evaluateVerdict({ ...ctx, results: { reconcile: r } }).outcome, "FAIL");
  });
});
