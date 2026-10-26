import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MED_SOAK_CONSERVATION_STAGE, MED_SOAK_RECONCILE_STAGES } from "../../src/load/cases.ts";
import { reconcileStage } from "../../src/load/reconcile/index.ts";
import {
  conservationStage,
  judgeConservation,
  type ConservationCounters,
} from "../../src/load/med-conservation.ts";

const STOCK = 1280; // a soak: planned 1260 + 20, never exhausted by design

const counters = (over: Partial<ConservationCounters> = {}): ConservationCounters => ({
  iterations: 1261,
  orders: 1261,
  refusedClean: 0,
  refusedGhost: 0,
  refusedOther: 0,
  failedOther: 0,
  dropped: 0,
  status5xx: 0,
  ...over,
});
const snap = (orderCount: number) => ({
  orderCount,
  orderQty: orderCount,
  reservationQty: orderCount,
  stocked: STOCK,
  reserved: orderCount,
});
const failing = (
  expectStockExhausted: boolean | undefined,
  c: ConservationCounters,
  s: ReturnType<typeof snap>,
) =>
  judgeConservation({
    counters: c,
    snapshot: s,
    stock: STOCK,
    expectStockExhausted,
  }).findings.filter((f) => !f.ok);

describe("medusa soak conservation", () => {
  it("skips only the stock-exhausted check when stock never runs out, and still runs the others", () => {
    assert.deepEqual(failing(false, counters(), snap(1261)), []);
    const oversold = failing(false, counters({ iterations: 1290, orders: 1290 }), snap(1290));
    assert.deepEqual(
      oversold.map((f) => f.check),
      ["orders-le-stock"],
    );
    assert.ok(!oversold.some((f) => f.check === "stock-exhausted"));
  });

  it("keeps the stock-exhausted check by default, so the exhaustion cases still judge it", () => {
    const f = failing(undefined, counters(), snap(1261));
    assert.deepEqual(
      f.map((x) => x.check),
      ["stock-exhausted"],
    );
    assert.equal(f[0]?.kind, "TEST BUG");
  });

  it("composes the reconcile audit, then the soak conservation stage (the default stage is not used)", () => {
    assert.equal(MED_SOAK_RECONCILE_STAGES.length, 2);
    assert.equal(MED_SOAK_RECONCILE_STAGES[0], reconcileStage);
    assert.equal(MED_SOAK_RECONCILE_STAGES[1], MED_SOAK_CONSERVATION_STAGE);
    assert.notEqual(MED_SOAK_CONSERVATION_STAGE, conservationStage);
  });
});
