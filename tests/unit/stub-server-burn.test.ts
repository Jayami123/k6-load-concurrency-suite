import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { startStub, stubDelayMs } from "../../src/load/stub-server.ts";

describe("stub server burn mode", () => {
  it("a 5 ms burn makes three sequential answers take at least 15 ms in total", async () => {
    const stub = await startStub({
      port: 0,
      serviceMs: 0,
      stallMs: 0,
      periodMs: 10_000,
      burnMs: 5,
    });
    try {
      const started = performance.now();
      for (let i = 0; i < 3; i++) {
        const res = await fetch(`http://127.0.0.1:${stub.port}/work`);
        assert.equal(res.status, 200);
        await res.text();
      }
      assert.ok(performance.now() - started >= 15, "each answer spins 5 ms first");
    } finally {
      await stub.close();
    }
  });

  it("without a burn the delay is the stall plus the service time, unchanged", () => {
    const o = { serviceMs: 25, stallMs: 1500, periodMs: 10_000 };
    assert.equal(stubDelayMs(0, o), 1525);
    assert.equal(stubDelayMs(5_000, o), 25);
  });
});
