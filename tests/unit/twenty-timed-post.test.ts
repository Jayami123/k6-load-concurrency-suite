import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, it } from "node:test";
import { classify, createPostClient, type PostClient } from "../../src/twenty/timed-post.ts";

const servers: http.Server[] = [];
const clients: PostClient[] = [];

async function listen(handler: http.RequestListener): Promise<string> {
  const server = http.createServer(handler);
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
function clientFor(url: string): PostClient {
  const c = createPostClient(url);
  clients.push(c);
  return c;
}
const silent: http.RequestListener = () => {}; // reads the request, never answers
const answer =
  (status: number, body = "{}"): http.RequestListener =>
  (_req, res) => {
    res.statusCode = status;
    res.end(body);
  };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Records the headers and the body bytes of the last request, then answers 200. */
function recorder(): {
  handler: http.RequestListener;
  seen: { headers: http.IncomingHttpHeaders; body: string };
} {
  const seen = { headers: {} as http.IncomingHttpHeaders, body: "" };
  const handler: http.RequestListener = (req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      seen.headers = req.headers;
      seen.body = Buffer.concat(chunks).toString("utf8");
      res.statusCode = 200;
      res.end("{}");
    });
  };
  return { handler, seen };
}

afterEach(() => {
  for (const c of clients.splice(0)) c.destroy();
  for (const s of servers.splice(0)) {
    s.closeAllConnections();
    s.close();
  }
});

describe("classify", () => {
  it("maps a client timeout to hang", () => {
    assert.equal(classify({ outcome: "timeout", status: null }), "hang");
  });

  it("maps a 4xx response to client-error", () => {
    assert.equal(classify({ outcome: "response", status: 400 }), "client-error");
    assert.equal(classify({ outcome: "response", status: 499 }), "client-error");
  });

  it("maps a 5xx response to server-error", () => {
    assert.equal(classify({ outcome: "response", status: 500 }), "server-error");
  });

  it("maps a 2xx response to ok", () => {
    assert.equal(classify({ outcome: "response", status: 200 }), "ok");
  });

  it("maps a transport error and a caller abort to error", () => {
    assert.equal(classify({ outcome: "error", status: null }), "error");
    assert.equal(classify({ outcome: "aborted", status: null }), "error");
  });
});

describe("createPostClient", () => {
  it("reports the status and the timings of a normal response", async () => {
    const c = clientFor(await listen(answer(400)));
    const r = await c.post("/x", "{}", { timeoutMs: 1000 });
    assert.equal(r.outcome, "response");
    assert.equal(r.status, 400);
    assert.equal(typeof r.ttfbMs, "number");
    assert.ok(r.ttfbMs! <= r.totalMs);
    assert.equal(r.error, undefined);
  });

  it("sends the Authorization header when one is given", async () => {
    const { handler, seen } = recorder();
    const c = clientFor(await listen(handler));
    await c.post("/x", "{}", { timeoutMs: 1000, authorization: "Bearer t" });
    assert.equal(seen.headers.authorization, "Bearer t");
  });

  it("omits the Authorization header when none is given", async () => {
    const { handler, seen } = recorder();
    const c = clientFor(await listen(handler));
    await c.post("/x", "{}", { timeoutMs: 1000 });
    assert.equal(seen.headers.authorization, undefined);
  });

  it("sends an empty body as Content-Length 0 with no body bytes", async () => {
    const { handler, seen } = recorder();
    const c = clientFor(await listen(handler));
    await c.post("/x", "", { timeoutMs: 1000 });
    assert.equal(seen.headers["content-length"], "0");
    assert.equal(seen.body, "");
  });

  it("delivers a non-empty body intact with a JSON content type", async () => {
    const { handler, seen } = recorder();
    const c = clientFor(await listen(handler));
    await c.post("/x", '{"foo":1}', { timeoutMs: 1000 });
    assert.equal(seen.body, '{"foo":1}');
    assert.equal(seen.headers["content-type"], "application/json");
    assert.equal(seen.headers["content-length"], "9");
  });

  it("ends a silent server as timeout, without throwing", async () => {
    const c = clientFor(await listen(silent));
    const r = await c.post("/x", "", { timeoutMs: 150 });
    assert.equal(r.outcome, "timeout");
    assert.equal(r.status, null);
    assert.equal(r.ttfbMs, null);
    assert.ok(r.totalMs >= 140 && r.totalMs < 1000, `totalMs ${r.totalMs}`);
  });

  it("ends an in-flight request as aborted when abort() is called", async () => {
    const c = clientFor(await listen(silent));
    const h = c.start("/x", "", { timeoutMs: 5000 });
    await wait(50);
    h.abort();
    const r = await h.result;
    assert.equal(r.outcome, "aborted");
    assert.ok(r.totalMs < 1000, `totalMs ${r.totalMs}`);
  });

  it("treats abort() after the request ended as a no-op", async () => {
    const c = clientFor(await listen(answer(200)));
    const h = c.start("/x", "{}", { timeoutMs: 1000 });
    const first = await h.result;
    h.abort();
    assert.equal(first.outcome, "response");
    const again = await c.post("/x", "{}", { timeoutMs: 1000 });
    assert.equal(again.outcome, "response");
  });

  it("ends a server that closes the socket without answering as error with the transport message", async () => {
    const c = clientFor(
      await listen((req) => {
        req.socket.destroy();
      }),
    );
    const r = await c.post("/x", "", { timeoutMs: 1000 });
    assert.equal(r.outcome, "error");
    assert.equal(r.status, null);
    assert.equal(typeof r.error, "string");
  });

  it("counts the requests still in flight in activeSockets", async () => {
    const c = clientFor(await listen(silent));
    for (let i = 0; i < 3; i++) c.start("/x", "", { timeoutMs: 5000 });
    await wait(100);
    assert.equal(c.activeSockets(), 3);
  });

  it("has no active socket right after the held requests are aborted", async () => {
    const c = clientFor(await listen(silent));
    const held = Array.from({ length: 3 }, () => c.start("/x", "", { timeoutMs: 5000 }));
    await wait(50);
    for (const h of held) h.abort();
    const ended = await Promise.all(held.map((h) => h.result));
    assert.deepEqual(
      ended.map((r) => r.outcome),
      ["aborted", "aborted", "aborted"],
    );
    assert.equal(c.activeSockets(), 0);
  });

  it("has no active socket right after a request timed out", async () => {
    const c = clientFor(await listen(silent));
    const r = await c.post("/x", "", { timeoutMs: 100 });
    assert.equal(r.outcome, "timeout");
    assert.equal(c.activeSockets(), 0);
  });

  it("ends requests still in flight on destroy() and leaves no socket", async () => {
    const c = clientFor(await listen(silent));
    const held = [c.start("/x", "", { timeoutMs: 5000 }), c.start("/x", "", { timeoutMs: 5000 })];
    await wait(80);
    c.destroy();
    const ended = await Promise.all(held.map((h) => h.result));
    assert.deepEqual(
      ended.map((r) => r.outcome),
      ["error", "error"],
    );
    assert.equal(c.activeSockets(), 0);
  });
});
