import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, it } from "node:test";
import { completeCart, pickInstance } from "../../src/medusa/store.ts";
import { medusaSecondBaseUrlFromEnv } from "../../src/races/env.ts";

type Seen = { path: string; key: string | undefined };

function recordingServer(seen: Seen[]): Server {
  return createServer((req, res) => {
    seen.push({
      path: req.url ?? "",
      key: req.headers["x-publishable-api-key"] as string | undefined,
    });
    res.writeHead(200, { "content-type": "application/json" });
    res.end("{}");
  });
}

function listen(server: Server): Promise<string> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    });
  });
}

describe("medusa store base URL", () => {
  it("completeCart posts to the given base URL", async () => {
    const seen: Seen[] = [];
    const server = recordingServer(seen);
    const base = await listen(server);
    try {
      const res = await completeCart("pk_test", "cart_1", base);
      assert.equal(res.status, 200);
      assert.deepEqual(seen, [{ path: "/store/carts/cart_1/complete", key: "pk_test" }]);
    } finally {
      server.close();
    }
  });

  it("completeCart falls back to MEDUSA_BASE_URL", async () => {
    const seen: Seen[] = [];
    const server = recordingServer(seen);
    const base = await listen(server);
    process.env.MEDUSA_BASE_URL = base;
    try {
      await completeCart("pk_test", "cart_2");
      assert.deepEqual(seen, [{ path: "/store/carts/cart_2/complete", key: "pk_test" }]);
    } finally {
      delete process.env.MEDUSA_BASE_URL;
      server.close();
    }
  });

  it("pickInstance sends even requests to the first URL and odd requests to MEDUSA_SECOND_BASE_URL", async () => {
    const seenA: Seen[] = [];
    const seenB: Seen[] = [];
    const serverA = recordingServer(seenA);
    const serverB = recordingServer(seenB);
    const baseA = await listen(serverA);
    const baseB = await listen(serverB);
    process.env.MEDUSA_SECOND_BASE_URL = baseB;
    try {
      const instances = [baseA, medusaSecondBaseUrlFromEnv()!];
      for (let i = 0; i < 4; i++) {
        await completeCart("pk_test", `cart_${i}`, pickInstance(instances, i));
      }
      assert.deepEqual(
        seenA.map((s) => s.path),
        ["/store/carts/cart_0/complete", "/store/carts/cart_2/complete"],
      );
      assert.deepEqual(
        seenB.map((s) => s.path),
        ["/store/carts/cart_1/complete", "/store/carts/cart_3/complete"],
      );
      assert.throws(() => pickInstance([], 0), /TEST BUG/);
    } finally {
      delete process.env.MEDUSA_SECOND_BASE_URL;
      serverA.close();
      serverB.close();
    }
  });
});
