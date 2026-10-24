import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { checkReadiness, raceLeakFindings, READINESS } from "../../src/load/readiness.ts";

const respond = (status: number) => (async () => new Response(null, { status })) as typeof fetch;

describe("load readiness", () => {
  it("200 on every URL is ok", async () => {
    assert.deepEqual(await checkReadiness(["http://a/health"], { fetchFn: respond(200) }), {
      ok: true,
      failures: [],
    });
  });

  it("a non-200 answer fails with the status", async () => {
    const out = await checkReadiness(["http://a/health"], { fetchFn: respond(503) });
    assert.deepEqual(out, { ok: false, failures: ["http://a/health HTTP 503"] });
  });

  it("a timeout fails with the error name", async () => {
    const timeout = (async () => {
      throw Object.assign(new Error("slow"), { name: "TimeoutError" });
    }) as typeof fetch;
    const out = await checkReadiness(["http://a/health"], { fetchFn: timeout, timeoutMs: 10 });
    assert.equal(out.ok, false);
    assert.match(out.failures[0]!, /TimeoutError/);
  });

  it("Documenso needs both URLs", () => {
    assert.equal(READINESS.documenso({}).length, 2);
    assert.match(READINESS.documenso({})[1]!, /\/api\/auth\/csrf$/);
  });

  it("raceLeakFindings finds a leak line", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "p6-races-"));
    writeFileSync(
      path.join(dir, "h.json"),
      JSON.stringify({ invariantViolations: ["leak: 2 rows remain"] }),
    );
    assert.deepEqual(raceLeakFindings(dir), ["h.json: leak: 2 rows remain"]);
  });

  it("raceLeakFindings ignores a clean histogram directory and a missing one", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "p6-races-"));
    mkdirSync(path.join(dir, "empty"));
    writeFileSync(path.join(dir, "clean.json"), JSON.stringify({ invariantViolations: [] }));
    assert.deepEqual(raceLeakFindings(dir), []);
    assert.deepEqual(raceLeakFindings(path.join(dir, "missing")), []);
  });
});
