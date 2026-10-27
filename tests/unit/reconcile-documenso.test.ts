import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  evaluateDocumensoAudit,
  waitForDrain,
  type DocumensoSnapshot,
} from "../../src/load/reconcile/documenso.ts";

const SCOPE = "p6-qa-20261024t010203z-3fa9c0d1-doc-load-002-%";
const DRAINED = { drained: true, drainMs: 1200 };
const clean = (): DocumensoSnapshot => ({
  envelopes: [
    { status: "COMPLETED", sealJobs: 1, stuckJobs: 0, completedAudit: 1 },
    { status: "COMPLETED", sealJobs: 1, stuckJobs: 0, completedAudit: 1 },
  ],
  clientCompleted: 2,
  sequentialCompletions: false,
});

describe("documenso reconciliation", () => {
  it("a clean snapshot passes", () => {
    const r = evaluateDocumensoAudit(clean(), SCOPE, DRAINED);
    assert.deepEqual(r.violations, []);
    assert.deepEqual(r.knownBugs, {});
  });

  it("a completed envelope with exactly one completion audit row passes sealed-once", () => {
    const r = evaluateDocumensoAudit(clean(), SCOPE, DRAINED);
    assert.equal(r.checks.find((c) => c.name === "sealed-once")?.ok, true);
    assert.deepEqual(r.violations, []);
  });

  for (const completedAudit of [0, 2]) {
    it(`a completed envelope with ${completedAudit} completion audit row(s) is a PRODUCT BUG`, () => {
      const s = clean();
      s.envelopes[0] = { ...s.envelopes[0]!, completedAudit };
      const r = evaluateDocumensoAudit(s, SCOPE, DRAINED);
      assert.equal(r.checks.find((c) => c.name === "sealed-once")?.ok, false);
      assert.ok(
        r.violations.some(
          (v) =>
            v.kind === "PRODUCT BUG" &&
            v.text ===
              `completed envelope with ${completedAudit} completion audit row(s), expected 1`,
        ),
      );
    });
  }

  it("a stuck job after the drain is a PRODUCT BUG", () => {
    const s = clean();
    s.envelopes[0] = { ...s.envelopes[0]!, stuckJobs: 1 };
    const r = evaluateDocumensoAudit(s, SCOPE, { drained: false, drainMs: 30000 });
    assert.ok(r.violations.some((v) => /pending jobs after 30000 ms drain/.test(v.text)));
  });

  it("a double seal is counted under P6-OBS-DOC-002, and is unexpected with sequential completions", () => {
    const s = clean();
    s.envelopes[0] = { ...s.envelopes[0]!, sealJobs: 2 };
    const r = evaluateDocumensoAudit({ ...s, sequentialCompletions: true }, SCOPE, DRAINED);
    assert.equal(r.knownBugs["P6-OBS-DOC-002"], 1);
    assert.deepEqual(r.unexpected, ["double seal with sequential completions"]);
  });

  it("a completed envelope that was never sealed is a PRODUCT BUG", () => {
    const s = clean();
    s.envelopes[1] = { ...s.envelopes[1]!, sealJobs: 0 };
    const r = evaluateDocumensoAudit(s, SCOPE, DRAINED);
    assert.ok(r.violations.some((v) => /completed envelope never sealed/.test(v.text)));
  });

  it("a client count that differs from the completed envelopes is a PRODUCT BUG", () => {
    const r = evaluateDocumensoAudit({ ...clean(), clientCompleted: 3 }, SCOPE, DRAINED);
    assert.ok(
      r.violations.some((v) => /client completed 3 envelopes, the database holds 2/.test(v.text)),
    );
  });

  it("an aborted knee may leave the database ahead of the client by its in-flight iterations", () => {
    const s = { ...clean(), clientCompleted: 1, clientInterrupted: 1 };
    const r = evaluateDocumensoAudit(s, SCOPE, DRAINED);
    assert.equal(r.checks.find((c) => c.name === "client-matches-db")?.ok, true);
    assert.deepEqual(r.violations, []);
  });

  it("the database ahead of the client by more than the in-flight iterations is a PRODUCT BUG", () => {
    const r = evaluateDocumensoAudit(
      { ...clean(), clientCompleted: 0, clientInterrupted: 1 },
      SCOPE,
      DRAINED,
    );
    assert.ok(
      r.violations.some((v) => /client completed 0 envelopes, the database holds 2/.test(v.text)),
    );
  });

  it("the database behind the client is a PRODUCT BUG even when iterations were in flight", () => {
    const r = evaluateDocumensoAudit(
      { ...clean(), clientCompleted: 3, clientInterrupted: 5 },
      SCOPE,
      DRAINED,
    );
    assert.ok(
      r.violations.some((v) => /client completed 3 envelopes, the database holds 2/.test(v.text)),
    );
  });

  it("zero envelopes is a TEST BUG", () => {
    const r = evaluateDocumensoAudit(
      { envelopes: [], sequentialCompletions: false },
      SCOPE,
      DRAINED,
    );
    assert.equal(r.violations[0]!.kind, "TEST BUG");
  });

  it("waitForDrain returns as soon as the count is 0", async () => {
    const out = await waitForDrain(async () => 0, { now: () => 0, sleep: async () => {} });
    assert.equal(out.drained, true);
  });

  it("waitForDrain times out and reports drained false", async () => {
    let t = 0;
    const out = await waitForDrain(async () => 3, {
      timeoutMs: 2000,
      pollMs: 500,
      now: () => t,
      sleep: async (ms) => {
        t += ms;
      },
    });
    assert.equal(out.drained, false);
    assert.ok(out.drainMs >= 2000);
  });
});

describe("documenso audit reader", () => {
  const fake = (routes: Array<[string, unknown[]]>) =>
    ({
      query: async (sql: string) => {
        for (const [key, rows] of routes) if (sql.includes(key)) return { rows };
        return { rows: [] as unknown[] };
      },
    }) as unknown as import("pg").Pool;

  it("reads one row per envelope and evaluates a sealed, drained run as clean", async () => {
    const d = await import("../../src/load/reconcile/documenso.ts");
    const o = await import("../../src/documenso/oracle.ts");
    const pool = fake([
      [d.ENVELOPES_BY_TITLE_SQL, [{ id: "e1", secondaryId: "document_11", status: "COMPLETED" }]],
      [o.SEAL_JOBS_SQL, [{ id: 1, status: "COMPLETED", retried: 0 }]],
      [d.STUCK_JOBS_FOR_DOCUMENT_SQL, [{ n: 0 }]],
      [o.DOCUMENT_COMPLETED_AUDIT_SQL, [{ n: 1 }]],
      [d.STUCK_JOBS_FOR_RUN_SQL, [{ n: 0 }]],
    ]);
    const cfg = { product: "documenso" as const, prefixLike: "p%", sequentialCompletions: true };
    const snap = await d.readDocumensoSnapshot(pool, cfg, 1);
    assert.deepEqual(snap.envelopes, [
      { status: "COMPLETED", sealJobs: 1, stuckJobs: 0, completedAudit: 1 },
    ]);
    const drain = await d.waitForDrainPool(pool, cfg.prefixLike, 1000);
    assert.equal(drain.drained, true);
    assert.deepEqual(d.evaluateDocumensoAudit(snap, cfg.prefixLike, drain).violations, []);
  });

  it("the documenso audit SQL passes assertSelectOnly", async () => {
    const { assertSelectOnly } = await import("../../src/oracles/pg.ts");
    const d = await import("../../src/load/reconcile/documenso.ts");
    for (const sql of [
      d.ENVELOPES_BY_TITLE_SQL,
      d.STUCK_JOBS_FOR_RUN_SQL,
      d.STUCK_JOBS_FOR_DOCUMENT_SQL,
    ]) {
      assert.doesNotThrow(() => assertSelectOnly(sql));
    }
  });
});

describe("documenso reconciliation: declared known bug P6-OBS-DOC-005", () => {
  const retry = (): DocumensoSnapshot => ({
    envelopes: [
      { status: "COMPLETED", sealJobs: 2, stuckJobs: 0, completedAudit: 2 },
      { status: "COMPLETED", sealJobs: 2, stuckJobs: 0, completedAudit: 2 },
    ],
    clientCompleted: 2,
    sequentialCompletions: true,
  });

  it("duplicate seals and completion rows are counted under the declared bug, not violations or unexpected", () => {
    const r = evaluateDocumensoAudit(retry(), SCOPE, DRAINED, ["P6-OBS-DOC-005"]);
    assert.deepEqual(r.violations, []);
    assert.deepEqual(r.unexpected, []);
    assert.ok((r.knownBugs["P6-OBS-DOC-005"] ?? 0) > 0);
  });

  it("without the declaration the same duplicates are violations and unexpected", () => {
    const r = evaluateDocumensoAudit(retry(), SCOPE, DRAINED, []);
    assert.ok(r.violations.length > 0);
    assert.ok(r.unexpected.length > 0);
  });

  it("a completed envelope with no completion row stays a violation even when the bug is declared", () => {
    const s = retry();
    s.envelopes[0] = { status: "COMPLETED", sealJobs: 1, stuckJobs: 0, completedAudit: 0 };
    const r = evaluateDocumensoAudit(s, SCOPE, DRAINED, ["P6-OBS-DOC-005"]);
    assert.ok(r.violations.some((v) => v.text.includes("completion audit row")));
  });
  it("a concurrent pair race declared as P6-OBS-DOC-002 counts its double seal and audit rows as known, not violations", () => {
    const s = clean();
    s.envelopes[0] = { ...s.envelopes[0]!, sealJobs: 2, completedAudit: 2 };
    const r = evaluateDocumensoAudit({ ...s, sequentialCompletions: true }, SCOPE, DRAINED, [
      "P6-OBS-DOC-002",
    ]);
    assert.deepEqual(r.violations, []);
    assert.deepEqual(r.unexpected, []);
    assert.ok((r.knownBugs["P6-OBS-DOC-002"] ?? 0) > 0);
    assert.equal(r.checks.find((c) => c.name === "sealed-once")?.ok, true);
  });

  it("a pair race with three completion audit rows is a PRODUCT BUG even under the pair race declaration", () => {
    const s = clean();
    s.envelopes[0] = { ...s.envelopes[0]!, sealJobs: 2, completedAudit: 3 };
    const r = evaluateDocumensoAudit(s, SCOPE, DRAINED, ["P6-OBS-DOC-002"]);
    assert.ok(r.violations.some((v) => v.kind === "PRODUCT BUG"));
    assert.equal(r.checks.find((c) => c.name === "sealed-once")?.ok, false);
  });

  it("a completed envelope with no completion audit row is still a PRODUCT BUG under the pair race declaration", () => {
    const s = clean();
    s.envelopes[0] = { ...s.envelopes[0]!, completedAudit: 0 };
    const r = evaluateDocumensoAudit(s, SCOPE, DRAINED, ["P6-OBS-DOC-002"]);
    assert.ok(
      r.violations.some(
        (v) =>
          v.kind === "PRODUCT BUG" &&
          v.text === "completed envelope with 0 completion audit row(s), expected 1",
      ),
    );
    assert.equal(r.checks.find((c) => c.name === "sealed-once")?.ok, false);
  });
});
