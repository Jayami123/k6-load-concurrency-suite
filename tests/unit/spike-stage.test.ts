import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { describe, it } from "node:test";
import type { LoadCase, LoadContext, SpikeRunSpec } from "../../src/load/types.ts";
import { spikeStage } from "../../src/load/spike/stage.ts";

const T0 = 1_000_000_000_000;
const SPEC: SpikeRunSpec = {
  product: "cal",
  steadyRate: 2,
  spikeRate: 6,
  steadySec: 20,
  spikeSec: 10,
  rampSec: 2,
  watchSec: 20,
  timeUnitSec: 1,
};

/** One points line per request: status tag and duration. `perSecond(s)` gives [status, count] pairs for second s from T0. */
function pointsText(seconds: number, perSecond: (s: number) => Array<[string, number]>): string {
  const lines: string[] = [];
  for (let s = 0; s < seconds; s++)
    for (const [status, count] of perSecond(s))
      for (let i = 0; i < count; i++) {
        const time = new Date(T0 + s * 1000 + i).toISOString();
        lines.push(
          JSON.stringify({
            type: "Point",
            metric: "http_reqs",
            data: { time, value: 1, tags: { status } },
          }),
        );
        lines.push(
          JSON.stringify({
            type: "Point",
            metric: "http_req_duration",
            data: { time, value: 100, tags: {} },
          }),
        );
      }
  return lines.join("\n");
}

/** The run's summary: the origin, the counters the stage reads. */
function summaryJson(over: Record<string, number> = {}): string {
  const counter = (name: string, count: number) => ({ [name]: { count } });
  return JSON.stringify({
    metrics: {
      p6_spike_t0_ms: { value: T0 },
      ...counter("p6_resp_ok", over.ok ?? 0),
      ...counter("p6_resp_5xx", over.r5xx ?? 0),
      ...counter("dropped_iterations", 0),
      ...counter("p6_resp_429", 0),
      ...counter("p6_resp_4xx_body", 0),
      ...counter("p6_resp_4xx_nobody", 0),
      ...counter("p6_resp_transport", 0),
      ...counter("p6_abandoned", 0),
      ...counter("p6_iter_limited", 0),
    },
  });
}

/** A context with one spike run at `dir`. `files` may leave out the summary or points file to test missing input. */
function ctxIn(dir: string, opts: { run?: boolean; spec?: SpikeRunSpec | null } = {}): LoadContext {
  const spec = opts.spec === null ? undefined : (opts.spec ?? SPEC);
  const caseDef = {
    id: "P6-CAL-LOAD-004",
    runs: () => (spec ? [{ label: "main", script: "x.js", env: {}, spike: spec }] : []),
  } as unknown as LoadCase;
  const k6 =
    opts.run === false
      ? []
      : [
          {
            label: "main",
            exitCode: 0,
            summaryPath: path.join(dir, "k6-main-summary.json"),
            pointsPath: path.join(dir, "k6-main.json.gz"),
            stdoutPath: path.join(dir, "k6-main.log"),
            startedAtMs: T0,
            endedAtMs: T0 + 60_000,
            pid: 1,
          },
        ];
  return {
    caseDef,
    runId: "20261026T000000Z-00000000",
    outDir: dir,
    invalid: [],
    k6,
    config: {},
    results: {},
  } as unknown as LoadContext;
}

function fixture(summary: string, points: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), "p6-spike-stage-"));
  writeFileSync(path.join(dir, "k6-main-summary.json"), summary);
  writeFileSync(path.join(dir, "k6-main.json.gz"), gzipSync(points));
  return dir;
}

/** Steady 2 per second, a spike of 6 per second, and a watch: every second answers 200 at 100 ms, 50 requests (a full window). */
const CLEAN = (): Array<[string, number]> => [["200", 50]];

describe("spike stage", () => {
  it("builds its windows from the run's inputs: the recovery follows the marks of the spike", async () => {
    const dir = fixture(
      summaryJson({ ok: 3000 }),
      pointsText(60, () => CLEAN()),
    );
    const r = await spikeStage(ctxIn(dir));
    assert.equal(r.ok, true);
    const report = JSON.parse(readFileSync(path.join(dir, "spike-report-main.json"), "utf8"));
    // The spike ends at 32 s (20 + 2 + 10); the first two windows after it, 40-50 s and 50-60 s, end at 60 s: 28 s.
    assert.equal(report.recoverySec, 28);
    assert.equal(report.verdict, "PASS");
  });

  it("a clean run passes and writes the report and the verdict data", async () => {
    const dir = fixture(
      summaryJson({ ok: 3000 }),
      pointsText(60, () => CLEAN()),
    );
    const r = await spikeStage(ctxIn(dir));
    assert.equal(r.kind, undefined);
    assert.deepEqual(r.reasons, []);
    assert.ok(existsSync(path.join(dir, "spike-report-main.md")));
  });

  it("a 5xx storm in the spike fails the run as a product bug (suspected), not as a pass", async () => {
    const storm = (s: number): Array<[string, number]> =>
      s >= 22 && s < 32
        ? [
            ["200", 50],
            ["500", 50],
          ]
        : CLEAN();
    const dir = fixture(summaryJson({ ok: 2000, r5xx: 500 }), pointsText(60, storm));
    const r = await spikeStage(ctxIn(dir));
    assert.equal(r.ok, false);
    assert.equal(r.kind, "PRODUCT BUG");
    assert.match(r.reasons[0] ?? "", /no 5xx storm/);
  });

  it("missing or malformed input is a TEST BUG, never a pass", async () => {
    const noRun = await spikeStage(
      ctxIn(mkdtempSync(path.join(tmpdir(), "p6-spike-none-")), { run: false }),
    );
    assert.equal(noRun.kind, "TEST BUG");
    assert.equal(noRun.ok, false);

    const noOrigin = fixture(
      JSON.stringify({ metrics: {} }),
      pointsText(60, () => CLEAN()),
    );
    const origin = await spikeStage(ctxIn(noOrigin));
    assert.equal(origin.kind, "TEST BUG");
    assert.match(origin.reasons[0] ?? "", /no spike origin/);

    const malformed = fixture(
      "{not json",
      pointsText(60, () => CLEAN()),
    );
    const bad = await spikeStage(ctxIn(malformed));
    assert.equal(bad.kind, "TEST BUG");
    assert.equal(bad.ok, false);
  });
});
