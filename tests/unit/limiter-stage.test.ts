import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import type { LoadCase, LoadContext } from "../../src/load/types.ts";
import { limiterContractStage } from "../../src/load/spike/limiter-stage.ts";
import { BODY_A, BODY_B, ROUTES } from "../../src/load/spike/limiter-contract.ts";

/** A local stand-in for the Documenso limiter: answers `max` requests per route with 200 and then 429 of the route's family. */
function limiterServer(opts: { neverLimit?: string } = {}): Server {
  const counts = new Map<string, number>();
  return createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    const route = ROUTES.find((r) => r.path === url.pathname && r.method === req.method);
    let n = 0;
    req.resume();
    req.on("end", () => {
      if (!route) return res.writeHead(404).end("{}");
      n = (counts.get(route.id) ?? 0) + 1;
      counts.set(route.id, n);
      const limited = n > route.max && route.id !== opts.neverLimit;
      if (!limited) {
        res.writeHead(200, { "content-type": "application/json" });
        return res.end("{}");
      }
      const now = Math.floor(Date.now() / 1000);
      res.writeHead(429, {
        "content-type": "application/json",
        "retry-after": "19",
        "x-ratelimit-limit": String(route.max),
        "x-ratelimit-remaining": "0",
        "x-ratelimit-reset": String(now + 19),
      });
      res.end(route.family === "A" ? BODY_A : BODY_B);
    });
  });
}

function ctxIn(dir: string): LoadContext {
  const caseDef = { id: "P6-DOC-LOAD-009", runs: () => [] } as unknown as LoadCase;
  return {
    caseDef,
    runId: "20261026T000000Z-00000000",
    outDir: dir,
    invalid: [],
    k6: [],
    config: {},
    results: {},
  } as unknown as LoadContext;
}

let server: Server;
let base: string;
let saved: string | undefined;

before(async () => {
  saved = process.env.DOCUMENSO_BASE_URL;
  server = limiterServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});

after(async () => {
  if (saved === undefined) delete process.env.DOCUMENSO_BASE_URL;
  else process.env.DOCUMENSO_BASE_URL = saved;
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("limiter contract stage", () => {
  it("a limiter that answers as the contract says passes every route and writes the report", async () => {
    process.env.DOCUMENSO_BASE_URL = base;
    const dir = mkdtempSync(path.join(tmpdir(), "p6-limiter-pass-"));
    const r = await limiterContractStage(ctxIn(dir));
    assert.equal(r.ok, true, r.reasons.join("; "));
    assert.equal(r.kind, undefined);
    const report = JSON.parse(readFileSync(path.join(dir, "limiter-contract.json"), "utf8"));
    assert.equal(report.routes.length, ROUTES.length);
    assert.ok(report.routes.every((j: { verdict: string }) => j.verdict === "PASS"));
    assert.ok(existsSync(path.join(dir, "limiter-contract.md")));
  });

  it("a route that never limits fails the contract as a product bug (suspected), not as a pass", async () => {
    const never = limiterServer({ neverLimit: "trpc" });
    await new Promise<void>((resolve) => never.listen(0, "127.0.0.1", () => resolve()));
    const addr = never.address();
    process.env.DOCUMENSO_BASE_URL = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
    try {
      const dir = mkdtempSync(path.join(tmpdir(), "p6-limiter-fail-"));
      const r = await limiterContractStage(ctxIn(dir));
      assert.equal(r.ok, false);
      assert.equal(r.kind, "PRODUCT BUG");
      assert.match(r.reasons.join("; "), /trpc: [1-9]\d* finding/);
    } finally {
      await new Promise<void>((resolve) => never.close(() => resolve()));
    }
  });

  it("a missing or unreachable stack is ENV or TEST BUG, never a pass", async () => {
    delete process.env.DOCUMENSO_BASE_URL;
    const none = await limiterContractStage(
      ctxIn(mkdtempSync(path.join(tmpdir(), "p6-limiter-env-"))),
    );
    assert.equal(none.kind, "ENV");
    assert.equal(none.ok, false);

    process.env.DOCUMENSO_BASE_URL = "http://127.0.0.1:1";
    const down = await limiterContractStage(
      ctxIn(mkdtempSync(path.join(tmpdir(), "p6-limiter-down-"))),
    );
    assert.equal(down.kind, "TEST BUG");
    assert.equal(down.ok, false);
    assert.match(down.reasons[0] ?? "", /limiter probe failed/);
  });
});
