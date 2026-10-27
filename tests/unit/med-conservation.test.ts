import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findHits } from "../../scripts/evidence-token-scan.mjs";
import {
  conservationCounters,
  failedFindings,
  judgeConservation,
  type ConservationCounters,
} from "../../src/load/med-conservation.ts";

const S = 5;

/** A clean run: 10 iterations, 5 orders (stock 5), 5 clean refusals. */
function clean(over: Partial<ConservationCounters> = {}): ConservationCounters {
  return {
    iterations: 10,
    orders: 5,
    refusedClean: 5,
    refusedGhost: 0,
    refusedOther: 0,
    failedOther: 0,
    dropped: 0,
    status5xx: 0,
    ...over,
  };
}

const snap = (orderCount: number, orderQty: number, reservationQty: number, reserved: number) => ({
  orderCount,
  orderQty,
  liveOrderCount: orderCount,
  liveOrderQty: orderQty,
  canceledOrderCount: 0,
  reservationQty,
  stocked: S,
  reserved,
});

function failing(
  counters: ConservationCounters,
  snapshot: ReturnType<typeof snap>,
  stock = S,
): { check: string; kind?: string }[] {
  return judgeConservation({ counters, snapshot, stock }).findings.filter((f) => !f.ok);
}

describe("medusa conservation judge", () => {
  it("reads the custom counters from the k6 summary layout (metrics.<name>.count)", () => {
    const counters = conservationCounters({
      metrics: {
        iterations: { count: 31 },
        p6_orders: { count: 15 },
        p6_refused_clean: { count: 16 },
        dropped_iterations: { count: 0 },
      },
    });
    assert.equal(counters.iterations, 31);
    assert.equal(counters.orders, 15);
    assert.equal(counters.refusedClean, 16);
  });

  it("a clean run passes every check", () => {
    const out = judgeConservation({ counters: clean(), snapshot: snap(5, 5, 5, 5), stock: S });
    assert.deepEqual(
      out.findings.filter((f) => !f.ok),
      [],
    );
    assert.deepEqual(out.knownBugs, {});
  });

  it("an oversold run is a PRODUCT BUG (orders above S)", () => {
    const counters = clean({ orders: 6, refusedClean: 4 });
    const bad = judgeConservation({ counters, snapshot: snap(6, 6, 6, 6), stock: S }).findings.find(
      (f) => f.check === "orders-le-stock",
    );
    assert.equal(bad?.ok, false);
    assert.equal(bad?.kind, "PRODUCT BUG");
  });

  it("reservation rows that differ from the units sold are a PRODUCT BUG", () => {
    const bad = failing(clean(), snap(5, 5, 4, 5));
    assert.ok(bad.some((f) => f.check === "reservations-match" && f.kind === "PRODUCT BUG"));
  });

  it("reserved that differs from the reservation rows is a PRODUCT BUG", () => {
    const bad = failing(clean(), snap(5, 5, 5, 4));
    assert.ok(bad.some((f) => f.check === "reservations-match" && f.kind === "PRODUCT BUG"));
  });

  it("the client saw an order the database lacks is a PRODUCT BUG", () => {
    const bad = failing(clean({ orders: 6, refusedClean: 4 }), snap(5, 5, 5, 5));
    assert.ok(bad.some((f) => f.check === "client-matches-db" && f.kind === "PRODUCT BUG"));
  });

  it("an order in the database that the client never saw is F-M2, not a violation", () => {
    const counters = clean({ orders: 4, refusedClean: 6 });
    const out = judgeConservation({ counters, snapshot: snap(5, 5, 5, 5), stock: S });
    assert.deepEqual(
      out.findings.filter((f) => !f.ok),
      [],
    );
    assert.equal(out.knownBugs["F-M2"], 1);
  });

  it("a stock that never ran out is a TEST BUG", () => {
    const counters = clean({ iterations: 4, orders: 4, refusedClean: 0 });
    const line = judgeConservation({
      counters,
      snapshot: snap(4, 4, 4, 4),
      stock: S,
    }).findings.find((f) => f.check === "stock-exhausted");
    assert.equal(line?.ok, false);
    assert.equal(line?.kind, "TEST BUG");
  });

  it("unaccounted iterations are a TEST BUG", () => {
    const bad = judgeConservation({
      counters: clean({ refusedClean: 3 }),
      snapshot: snap(5, 5, 5, 5),
      stock: S,
    }).findings.find((f) => f.check === "iterations-accounted");
    assert.equal(bad?.ok, false);
    assert.equal(bad?.kind, "TEST BUG");
  });

  it("an unclassified refusal and a 5xx are PRODUCT BUGs", () => {
    const counters = clean({ refusedClean: 3, refusedOther: 2, status5xx: 1 });
    const bad = failing(counters, snap(5, 5, 5, 5));
    assert.ok(bad.some((f) => f.check === "clean-refusals-only" && f.kind === "PRODUCT BUG"));
  });

  it("an iteration that ended on a later-step 5xx is failedOther, a PRODUCT BUG, and not unaccounted", () => {
    const counters = clean({ refusedClean: 4, failedOther: 1, status5xx: 1 });
    const out = judgeConservation({ counters, snapshot: snap(5, 5, 5, 5), stock: S }).findings;
    assert.equal(out.find((f) => f.check === "iterations-accounted")?.ok, true);
    assert.equal(out.find((f) => f.check === "clean-refusals-only")?.kind, "PRODUCT BUG");
  });

  it("a ghost order above S is still an oversell, and its delta is recorded as F-M2", () => {
    const counters = clean({ orders: 5, refusedGhost: 1, refusedClean: 4 });
    const out = judgeConservation({ counters, snapshot: snap(6, 6, 6, 6), stock: S });
    assert.equal(out.findings.find((f) => f.check === "orders-le-stock")?.kind, "PRODUCT BUG");
    // one database order the client never saw, plus one ghost response
    assert.equal(out.knownBugs["F-M2"], 2);
  });

  it("every detail line passes the token scanner", () => {
    const counters = clean({
      orders: 6,
      refusedClean: 3,
      refusedOther: 1,
      failedOther: 1,
      status5xx: 1,
      dropped: 2,
    });
    const out = judgeConservation({ counters, snapshot: snap(6, 6, 5, 4), stock: S });
    for (const f of out.findings) assert.deepEqual(findHits(f.detail), [], f.detail);
  });

  it("a dropped iteration is INVALID, not a failure: no-drops and an unjudgeable exhaustion are not classified", () => {
    const counters = clean({ iterations: 4, orders: 4, refusedClean: 0, dropped: 2 });
    const out = judgeConservation({ counters, snapshot: snap(4, 4, 4, 4), stock: S });
    assert.equal(out.findings.find((f) => f.check === "no-drops")?.ok, false);
    assert.deepEqual(failedFindings(out.findings, counters), []);
  });

  it("a conservation PRODUCT BUG stays active when iterations were dropped", () => {
    const counters = clean({ dropped: 2 });
    const out = judgeConservation({ counters, snapshot: snap(6, 6, 5, 4), stock: S });
    const failed = failedFindings(out.findings, counters);
    assert.ok(failed.some((f) => f.check === "orders-le-stock" && f.kind === "PRODUCT BUG"));
  });
});
