import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildBand,
  parseBaselineBand,
  runValues,
  windowP95s,
  type RunFolder,
} from "../../src/load/baseline-band.ts";
import type { SecondBin } from "../../src/load/chart/k6-points.ts";
import type { RunMeta } from "../../src/load/types.ts";

function bins(perSecond: number, p95Ms: number, seconds: number): SecondBin[] {
  return Array.from({ length: seconds }, (_, s) => ({
    t: 1_000_000 + s * 1000,
    requests: perSecond,
    p95Ms,
  }));
}

function folder(runId: string, p95: number, over: { validity?: string } = {}): RunFolder {
  return {
    verdict: {
      runId,
      outcome: "PASS",
      validity: { verdict: over.validity ?? "VALID" },
    } as RunFolder["verdict"],
    meta: {
      schema: 1,
      caseId: "P6-CAL-LOAD-003",
      runId,
      profile: "steady",
      rate: 3,
      durationSec: 120,
      environment: {
        kind: "github-actions",
        event: "workflow_dispatch",
        ref: "main",
        runUrl: `https://github.com/o/r/actions/runs/${runId}`,
        runnerImage: "ubuntu24",
        imageVersion: "20261023.334.3",
        nproc: 4,
      },
      software: { products: { cal: "x" } },
    } as unknown as RunMeta,
    summary: {
      metrics: {
        http_req_duration: { values: { med: p95 / 2, "p(95)": p95, "p(99)": p95 * 1.3 } },
        http_req_failed: { values: { rate: 0 } },
        http_reqs: { values: { rate: 3 } },
      },
    },
    bins: bins(5, p95, 130),
  };
}

describe("baseline band", () => {
  it("takes the run-level values from the k6 summary", () => {
    const v = runValues(folder("7001", 200));
    assert.deepEqual(v, {
      runId: "7001",
      p50Ms: 100,
      p95Ms: 200,
      p99Ms: 260,
      errorRate: 0,
      requestsPerSec: 3,
    });
  });

  it("drops a 10-second window with fewer than 40 requests", () => {
    // First window 10 s x 5 requests = 50 (kept); second window 10 s x 3 = 30 (dropped).
    const series = [...bins(5, 180, 10), ...bins(3, 300, 10)].map((b, i) => ({
      ...b,
      t: 1_000_000 + i * 1000,
    }));
    assert.deepEqual(windowP95s(series, 0, 20), [180]);
  });

  it("keeps the minimum, the median and the maximum of each metric over the runs", () => {
    const band = buildBand({
      release: "p6-phase4a",
      caseId: "P6-CAL-LOAD-003",
      folders: [folder("7101", 180), folder("7102", 200), folder("7103", 240)],
    });
    assert.deepEqual(band.metrics.p95Ms, { min: 180, median: 200, max: 240, n: 3 });
    assert.equal(band.n, 3);
    assert.deepEqual(band.runIds, ["7101", "7102", "7103"]);
  });

  it("leaves an INVALID run out of the band and lists it nowhere in the values", () => {
    const band = buildBand({
      release: "p6-phase4a",
      caseId: "P6-CAL-LOAD-003",
      folders: [
        folder("7201", 180),
        folder("7202", 200),
        folder("7203", 240),
        folder("7204", 900, { validity: "INVALID" }),
      ],
    });
    assert.equal(band.n, 3);
    assert.deepEqual(band.runIds, ["7201", "7202", "7203"]);
    assert.equal(band.metrics.p95Ms.max, 240);
  });

  it("needs three VALID runs", () => {
    assert.throws(
      () =>
        buildBand({
          release: "p6-phase4a",
          caseId: "P6-CAL-LOAD-003",
          folders: [folder("7301", 180), folder("7302", 200)],
        }),
      /P6-CAL-LOAD-003: 2 VALID steady run\(s\), need at least 3/,
    );
  });

  it("refuses two runs that share a run id", () => {
    assert.throws(
      () =>
        buildBand({
          release: "p6-phase4a",
          caseId: "P6-CAL-LOAD-003",
          folders: [folder("7401", 180), folder("7401", 200), folder("7402", 240)],
        }),
      /duplicate GitHub Actions run id/,
    );
  });
});

describe("baseline band file", () => {
  it("rejects a product with fewer than three run ids or ids out of order", () => {
    const band = { min: 1, median: 2, max: 3, n: 3 };
    const product = {
      caseId: "P6-CAL-LOAD-003",
      profile: "steady",
      rate: 3,
      durationSec: 120,
      n: 3,
      runIds: ["7001", "7002", "7003"],
      environment: "ubuntu24 20261023.334.3, 4 vCPU",
      environments: {},
      notes: [],
      metrics: { p50Ms: band, p95Ms: band, p99Ms: band, errorRate: band, requestsPerSec: band },
      windowP95: { ...band, windows: 5 },
    };
    const file = { schema: 1, metric: "steady baseline band", products: { cal: product } };
    assert.doesNotThrow(() => parseBaselineBand(file));
    assert.throws(
      () => parseBaselineBand({ ...file, products: { cal: { ...product, n: 2 } } }),
      /has n 2 for 3 run ids/,
    );
    assert.throws(
      () =>
        parseBaselineBand({
          ...file,
          products: { cal: { ...product, runIds: ["7002", "7001", "7003"] } },
        }),
      /not strictly ascending/,
    );
  });
});
