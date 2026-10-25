import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { kneeStage } from "../../src/load/knee/stage.ts";
import type { KneePlanSpec, LoadContext } from "../../src/load/types.ts";

const T0 = 1_792_801_000_000;
const PLAN: KneePlanSpec & {
  smokeP95Ms: number;
  maxVUs: number;
  expect?: { firstSaturated?: string };
} = {
  startRate: 2,
  stepRate: 2,
  holdSec: 10,
  rampSec: 2,
  maxSteps: 3,
  smokeP95Ms: 10,
  maxVUs: 80,
};

/** A summary with three steps: 20, 40 and 60 planned iterations; the p95 of the last step trips a limit of 100 ms when p95 is 500. */
function summary(p95Step2: number) {
  const step = (i: number, started: number, p95: number) => ({
    [`p6_step_started{step:${i}}`]: { count: started },
    [`http_reqs{step:${i}}`]: { count: started },
    [`http_req_duration{step:${i}}`]: { "p(95)": p95 },
    [`p6_nonconflict_error{step:${i}}`]: { passes: 0, fails: started, rate: 0 },
  });
  return {
    metrics: {
      ...step(0, 20, 20),
      ...step(1, 40, 30),
      ...step(2, 60, p95Step2),
      p6_knee_t0_ms: { value: T0 },
    },
  };
}

/** A minimal context: one knee run whose files live in a fresh directory. */
function ctxWith(opts: {
  dir: string;
  summary: unknown;
  exitCode: number;
  plan?: typeof PLAN;
  runId?: string;
}): LoadContext {
  const summaryPath = path.join(opts.dir, "k6-knee-summary.json");
  writeFileSync(summaryPath, JSON.stringify(opts.summary));
  const spec = { label: "knee", script: "x.js", env: {}, knee: opts.plan ?? PLAN };
  return {
    caseDef: { id: "P6-X-LOAD-021", runs: () => [spec] },
    k6: [{ label: "knee", exitCode: opts.exitCode, summaryPath }],
    outDir: opts.dir,
    runId: opts.runId ?? "20261025T120000Z-3fa9c0d1",
    invalid: [],
    meta: undefined,
  } as unknown as LoadContext;
}

describe("knee stage", () => {
  it("a stop writes the knee report as json and md", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "knee-stage-"));
    try {
      const ctx = ctxWith({ dir, summary: summary(500), exitCode: 99 });
      const r = await kneeStage(ctx);
      assert.equal(r.ok, true, r.reasons.join("; "));
      const json = JSON.parse(readFileSync(path.join(dir, "knee-report-knee.json"), "utf8")) as {
        verdict: string;
        range: { lowerRate: number; upperRate: number };
      };
      assert.equal(json.verdict, "KNEE");
      assert.deepEqual([json.range.lowerRate, json.range.upperRate], [4, 6]);
      assert.match(
        readFileSync(path.join(dir, "knee-report-knee.md"), "utf8"),
        /Knee range: between 4 and 6/,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("a self-test expectation that the run does not meet is a TEST BUG that names both values", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "knee-stage-"));
    try {
      const plan = { ...PLAN, expect: { firstSaturated: "app_cpu" } };
      const r = await kneeStage(ctxWith({ dir, summary: summary(500), exitCode: 99, plan }));
      assert.equal(r.ok, false);
      assert.equal(r.kind, "TEST BUG");
      assert.match(r.reasons.join(" "), /first saturated none_observed, expected app_cpu/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("exit 99 with no stop step is a TEST BUG", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "knee-stage-"));
    try {
      const r = await kneeStage(ctxWith({ dir, summary: summary(20), exitCode: 99 }));
      assert.equal(r.ok, false);
      assert.equal(r.kind, "TEST BUG");
      assert.match(
        r.reasons.join(" "),
        /stopped \(exit 99\) but the post-run rule found no stop step/,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("a token-like value is not kept: the report files are removed and the stage is a TEST BUG", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "knee-stage-"));
    try {
      mkdirSync(path.join(dir, "sub"), { recursive: true });
      const token = `gh${"p"}_${"a".repeat(36)}`;
      const r = await kneeStage(
        ctxWith({ dir, summary: summary(500), exitCode: 99, runId: token }),
      );
      assert.equal(r.ok, false);
      assert.equal(r.kind, "TEST BUG");
      assert.equal(existsSync(path.join(dir, "knee-report-knee.json")), false);
      assert.equal(existsSync(path.join(dir, "knee-report-knee.md")), false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
