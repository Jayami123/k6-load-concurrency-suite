import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { aggregatePoints, nearestRankP95, readPointsGz } from "../../src/load/chart/k6-points.ts";

const point = (metric: string, time: string, value = 1) =>
  JSON.stringify({ type: "Point", metric, data: { time, value, tags: {} } });

describe("k6 points", () => {
  it("bins requests per second", () => {
    const lines = [
      point("http_reqs", "2026-10-24T01:00:00.100Z"),
      point("http_reqs", "2026-10-24T01:00:00.900Z"),
      point("http_reqs", "2026-10-24T01:00:01.000Z"),
    ];
    const bins = aggregatePoints(lines);
    assert.deepEqual(
      bins.map((b) => b.requests),
      [2, 1],
    );
  });

  it("p95 is the nearest-rank value", () => {
    assert.equal(nearestRankP95(Array.from({ length: 20 }, (_, i) => i + 1)), 19);
  });

  it("other metrics are ignored", () => {
    const bins = aggregatePoints([point("checks", "2026-10-24T01:00:00.000Z")]);
    assert.equal(bins.length, 0);
  });

  it("reads a gzip stream", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "p6-points-"));
    const file = path.join(dir, "k6-open.json.gz");
    writeFileSync(file, gzipSync(point("http_reqs", "2026-10-24T01:00:00.000Z")));
    assert.equal(readPointsGz(file)[0]?.requests, 1);
  });
});
