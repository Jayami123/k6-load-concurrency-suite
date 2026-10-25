import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { describe, it } from "node:test";
import { readPointsGz, readPointsGzStream } from "../../src/load/chart/k6-points.ts";

function point(metric: string, time: string, value: number): string {
  return JSON.stringify({ type: "Point", metric, data: { time, value, tags: {} } });
}

describe("k6 points streaming reader", () => {
  it("equals the synchronous reader on a fixture", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "points-"));
    try {
      const lines = [
        point("http_reqs", "2026-10-25T10:00:00.100Z", 1),
        point("http_req_duration", "2026-10-25T10:00:00.200Z", 120),
        point("http_req_duration", "2026-10-25T10:00:00.300Z", 80),
        point("vus", "2026-10-25T10:00:00.400Z", 3),
        point("http_reqs", "2026-10-25T10:00:01.050Z", 1),
        point("http_req_duration", "2026-10-25T10:00:01.060Z", 300),
      ].join("\n");
      const file = path.join(dir, "k6-main.json.gz");
      writeFileSync(file, gzipSync(lines));
      assert.deepEqual(await readPointsGzStream(file), readPointsGz(file));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("handles a file larger than one read chunk", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "points-"));
    try {
      const base = Date.parse("2026-10-25T10:00:00.000Z");
      const lines: string[] = [];
      for (let i = 0; i < 200_000; i++) {
        const time = new Date(base + i).toISOString();
        lines.push(point("http_req_duration", time, i % 500));
        lines.push(point("http_reqs", time, 1));
      }
      const file = path.join(dir, "big.json.gz");
      writeFileSync(file, gzipSync(lines.join("\n")));
      const streamed = await readPointsGzStream(file);
      assert.equal(streamed.length, 200);
      assert.deepEqual(streamed, readPointsGz(file));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
