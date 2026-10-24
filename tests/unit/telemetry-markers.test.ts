import assert from "node:assert/strict";
import { connect } from "node:net";
import { describe, it } from "node:test";
import {
  judgeSkew,
  offsetsFromSummary,
  startMarkerServer,
} from "../../src/load/telemetry/markers.ts";

describe("telemetry markers", () => {
  it("offsetsFromSummary reads both p6 clock offset metrics", () => {
    const summary = {
      metrics: { p6_clock_offset_start_ms: { avg: 0.5 }, p6_clock_offset_end_ms: { avg: -1.5 } },
    };
    assert.deepEqual(offsetsFromSummary(summary), { startMs: 0.5, endMs: -1.5 });
  });

  it("a missing metric gives no offset", () => {
    assert.deepEqual(offsetsFromSummary({ metrics: {} }), { startMs: undefined, endMs: undefined });
  });

  it("judgeSkew is ok within the limit and reports the worst offset", () => {
    assert.deepEqual(judgeSkew({ startMs: 3, endMs: -5 }, 100), { skewMs: -5, ok: true });
  });

  it("judgeSkew fails beyond the limit", () => {
    assert.equal(judgeSkew({ startMs: 250 }, 100).ok, false);
  });

  it("missing offsets give not measured, not a number", () => {
    assert.deepEqual(judgeSkew({}, 100), {
      skewMs: undefined,
      ok: true,
      reason: "marker not measured",
    });
  });

  it("the marker server answers its clock plus the configured skew", async () => {
    const marker = await startMarkerServer({ skewMs: 5000 });
    try {
      const body = (await (await fetch(marker.url)).json()) as { serverNowMs: number };
      assert.ok(Math.abs(body.serverNowMs - (Date.now() + 5000)) < 1000);
    } finally {
      await marker.close();
    }
  });

  it("the marker server closes its port", async () => {
    const marker = await startMarkerServer();
    const port = Number(new URL(marker.url).port);
    await marker.close();
    const refused = await new Promise<boolean>((resolve) => {
      const socket = connect({ host: "127.0.0.1", port });
      socket.once("connect", () => {
        socket.destroy();
        resolve(false);
      });
      socket.once("error", () => resolve(true));
    });
    assert.equal(refused, true);
  });
});
