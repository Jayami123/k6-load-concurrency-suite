import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { auditToStageResult, composeStages } from "../../src/load/reconcile/index.ts";
import type { AuditResult } from "../../src/load/reconcile/types.ts";
import type { LoadContext, Stage } from "../../src/load/types.ts";

const ctx = {} as LoadContext;
const audit = (over: Partial<AuditResult> = {}): AuditResult => ({
  schema: 1,
  product: "cal",
  prefixLike: "p6-x%",
  rowsSeen: 3,
  checks: [{ name: "rows", ok: true, detail: "3" }],
  violations: [],
  knownBugs: {},
  unexpected: [],
  pending: [],
  leak: [],
  ...over,
});

describe("reconcile index", () => {
  it("composeStages runs the stages in order and merges their data", async () => {
    const order: string[] = [];
    const a: Stage = async () => {
      order.push("a");
      return { ok: true, reasons: [], data: { x: 1 } };
    };
    const b: Stage = async () => {
      order.push("b");
      return { ok: true, reasons: [], data: { y: 2 } };
    };
    const r = await composeStages([a, b])(ctx);
    assert.deepEqual(order, ["a", "b"]);
    assert.deepEqual(r.data, { x: 1, y: 2 });
  });

  it("composeStages keeps going after a not-ok stage and reports the first failure kind", async () => {
    let ran = false;
    const bad: Stage = async () => ({ ok: false, kind: "TEST BUG", reasons: ["first"] });
    const worse: Stage = async () => ({ ok: false, kind: "PRODUCT BUG", reasons: ["second"] });
    const after: Stage = async () => {
      ran = true;
      return { ok: true, reasons: [] };
    };
    const r = await composeStages([bad, worse, after])(ctx);
    assert.equal(ran, true);
    assert.equal(r.ok, false);
    assert.equal(r.kind, "TEST BUG");
  });

  it("a PRODUCT BUG violation maps to kind PRODUCT BUG and ok false", () => {
    const r = auditToStageResult(
      audit({ violations: [{ kind: "PRODUCT BUG", text: "oversold" }] }),
    );
    assert.equal(r.ok, false);
    assert.equal(r.kind, "PRODUCT BUG");
    assert.match(r.reasons[0]!, /^PRODUCT BUG: oversold$/);
  });

  it("a TEST BUG violation maps to kind TEST BUG", () => {
    const r = auditToStageResult(audit({ violations: [{ kind: "TEST BUG", text: "no orders" }] }));
    assert.equal(r.kind, "TEST BUG");
  });

  it("a known bug is counted in the reasons and does not fail the run", () => {
    const r = auditToStageResult(audit({ knownBugs: { "P6-OBS-CAL-002": 2 } }));
    assert.equal(r.ok, true);
    assert.match(r.reasons.join(" "), /known bug P6-OBS-CAL-002: 2 \(counted, not a failure\)/);
  });

  it("an unexpected known bug fails the run as PRODUCT BUG", () => {
    const r = auditToStageResult(
      audit({ unexpected: ["double seal with sequential completions"] }),
    );
    assert.equal(r.ok, false);
    assert.equal(r.kind, "PRODUCT BUG");
  });
});

describe("audit stage", () => {
  const ctxWith = (audit: unknown, outDir: string) =>
    ({
      config: audit === undefined ? {} : { audit },
      k6: [],
      outDir,
    }) as unknown as LoadContext;

  it("a case with no audit config is skipped", async () => {
    const { makeReconcileStage } = await import("../../src/load/reconcile/index.ts");
    const stage = makeReconcileStage({
      openPool: () => ({}) as never,
      reconcile: async () => {
        throw new Error("no");
      },
    });
    const r = await stage(ctxWith(undefined, "/tmp/none"));
    assert.equal(r.ok, true);
    assert.equal((r.data as { skipped?: string }).skipped, "case has no product audit (stub)");
  });

  it("a clean audit writes audit.json and passes", async () => {
    const { makeReconcileStage } = await import("../../src/load/reconcile/index.ts");
    const { mkdtempSync, readFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const path = await import("node:path");
    const dir = mkdtempSync(path.join(tmpdir(), "audit-"));
    const clean: AuditResult = {
      schema: 1,
      product: "cal",
      prefixLike: "p%",
      rowsSeen: 2,
      checks: [{ name: "rows", ok: true, detail: "2 live booking(s)" }],
      violations: [],
      knownBugs: {},
      unexpected: [],
      pending: [],
      leak: [],
    };
    const stage = makeReconcileStage({
      openPool: () => ({ end: async () => {} }) as never,
      reconcile: async () => clean,
    });
    const ctx = ctxWith({ product: "cal", userId: 1, eventTypeId: 2, prefixLike: "p%" }, dir);
    const r = await stage(ctx);
    assert.equal(r.ok, true);
    assert.equal((r.data as { audit?: string }).audit, "audit.json");
    assert.equal(JSON.parse(readFileSync(path.join(dir, "audit.json"), "utf8")).product, "cal");
  });

  it("an audit whose detail matches a token pattern is refused and not kept", async () => {
    const { makeReconcileStage } = await import("../../src/load/reconcile/index.ts");
    const { mkdtempSync, existsSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const path = await import("node:path");
    const dir = mkdtempSync(path.join(tmpdir(), "audit-"));
    const leaky: AuditResult = {
      schema: 1,
      product: "cal",
      prefixLike: "p%",
      rowsSeen: 1,
      checks: [{ name: "rows", ok: true, detail: "ghp_" + "a".repeat(36) }],
      violations: [],
      knownBugs: {},
      unexpected: [],
      pending: [],
      leak: [],
    };
    const stage = makeReconcileStage({
      openPool: () => ({ end: async () => {} }) as never,
      reconcile: async () => leaky,
    });
    const r = await stage(
      ctxWith({ product: "cal", userId: 1, eventTypeId: 2, prefixLike: "p%" }, dir),
    );
    assert.equal(r.ok, false);
    assert.equal(r.kind, "TEST BUG");
    assert.equal(existsSync(path.join(dir, "audit.json")), false);
  });
});
