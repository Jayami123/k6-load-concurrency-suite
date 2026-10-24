import assert from "node:assert/strict";
import { connect } from "node:net";
import { describe, it } from "node:test";
import { startStub, stubDelayMs } from "../../src/load/stub-server.ts";

const shape = { serviceMs: 25, stallMs: 1500, periodMs: 10000 };

describe("stub server", () => {
  it("delays inside the stall window until it ends, and only serviceMs outside it", () => {
    assert.equal(stubDelayMs(100, shape), 1425);
    assert.equal(stubDelayMs(5000, shape), 25);
  });

  it("is exactly at the boundary: the stall starts at the period start and ends at stallMs", () => {
    assert.equal(stubDelayMs(0, shape), 1525);
    assert.equal(stubDelayMs(1500, shape), 25);
  });

  it("answers 200 JSON on GET /work", async () => {
    const stub = await startStub({ port: 0, serviceMs: 0, stallMs: 0, periodMs: 1000 });
    try {
      const res = await fetch(`http://127.0.0.1:${stub.port}/work`);
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { ok: true });
    } finally {
      await stub.close();
    }
  });

  it("close frees the port", async () => {
    const stub = await startStub({ port: 0, serviceMs: 0, stallMs: 0, periodMs: 1000 });
    await stub.close();
    const refused = await new Promise<boolean>((resolve) => {
      const socket = connect({ host: "127.0.0.1", port: stub.port });
      socket.once("connect", () => {
        socket.destroy();
        resolve(false);
      });
      socket.once("error", () => resolve(true));
    });
    assert.equal(refused, true);
  });

  it("rejects any host other than 127.0.0.1", async () => {
    await assert.rejects(
      startStub({ port: 0, serviceMs: 0, stallMs: 0, periodMs: 1000, host: "0.0.0.0" }),
      /binds 127.0.0.1 only/,
    );
  });
});
