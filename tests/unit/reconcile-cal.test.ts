import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateCalAudit, type CalSnapshot } from "../../src/load/reconcile/cal.ts";

const clean: CalSnapshot = { liveBookings: 5, nonAccepted: 0, overlapPairs: 0, clientAccepted: 5 };
const SCOPE = "p6-qa-20261024t010203z-3fa9c0d1-cal-load-001-%";

describe("cal reconciliation", () => {
  it("a clean snapshot passes with no violations and no known bugs", () => {
    const r = evaluateCalAudit(clean, SCOPE);
    assert.deepEqual(r.violations, []);
    assert.deepEqual(r.knownBugs, {});
    assert.equal(
      r.checks.every((c) => c.ok),
      true,
    );
  });

  it("an overlap pair is counted under P6-OBS-CAL-002, not a violation", () => {
    const r = evaluateCalAudit({ ...clean, overlapPairs: 2 }, SCOPE);
    assert.equal(r.knownBugs["P6-OBS-CAL-002"], 2);
    assert.deepEqual(r.violations, []);
  });

  it("the client told 5 ACCEPTED while the database holds 4 is a PRODUCT BUG", () => {
    const r = evaluateCalAudit({ ...clean, liveBookings: 4, clientAccepted: 5 }, SCOPE);
    assert.ok(
      r.violations.some((v) =>
        /client was told ACCEPTED for 5 bookings, the database holds 4/.test(v.text),
      ),
    );
  });

  it("the database holding more than the client was told is also a PRODUCT BUG", () => {
    const r = evaluateCalAudit({ ...clean, liveBookings: 6, clientAccepted: 5 }, SCOPE);
    assert.equal(r.violations.length >= 1, true);
    assert.equal(r.violations[0]!.kind, "PRODUCT BUG");
  });

  it("zero bookings is a TEST BUG (the scope saw nothing)", () => {
    const r = evaluateCalAudit({ liveBookings: 0, nonAccepted: 0, overlapPairs: 0 }, SCOPE);
    assert.equal(r.violations[0]!.kind, "TEST BUG");
    assert.match(r.violations[0]!.text, /scope LIKE/);
  });

  it("a booking that is not accepted is a PRODUCT BUG", () => {
    const r = evaluateCalAudit({ ...clean, nonAccepted: 1 }, SCOPE);
    assert.ok(r.violations.some((v) => /pending or in another live state/.test(v.text)));
  });

  it("the checks come in the fixed order", () => {
    const r = evaluateCalAudit(clean, SCOPE);
    assert.deepEqual(
      r.checks.map((c) => c.name),
      ["rows", "accepted-only", "client-matches-db", "no-overlap"],
    );
  });
});

describe("cal audit reader", () => {
  it("counts live rows, non-accepted rows and overlap pairs from the database", async () => {
    const { readCalSnapshot } = await import("../../src/load/reconcile/cal.ts");
    const pool = {
      query: async (sql: string) => {
        if (sql.includes("OVERLAP") || sql.includes('a."startTime" < b."endTime"'))
          return { rows: [{ aId: 1 }] };
        return {
          rows: [
            { id: 1, uid: "u1", status: "accepted", start: "x", end: "y" },
            { id: 2, uid: "u2", status: "pending", start: "x", end: "y" },
          ],
        };
      },
    } as unknown as import("pg").Pool;
    const s = await readCalSnapshot(
      pool,
      { product: "cal", userId: 5, eventTypeId: 7, prefixLike: "p%" },
      2,
    );
    assert.deepEqual(s, { liveBookings: 2, nonAccepted: 1, overlapPairs: 1, clientAccepted: 2 });
  });

  it("the cal audit SQL passes assertSelectOnly", async () => {
    const { assertSelectOnly } = await import("../../src/oracles/pg.ts");
    const { CASE_LIVE_BOOKINGS_SQL, OVERLAP_PAIRS_SQL } = await import("../../src/cal/oracle.ts");
    assert.doesNotThrow(() => assertSelectOnly(CASE_LIVE_BOOKINGS_SQL));
    assert.doesNotThrow(() => assertSelectOnly(OVERLAP_PAIRS_SQL));
  });
});

describe("cal reconciliation per intent (knee runs)", () => {
  const counters = {
    started: 2,
    interrupted: 0,
    log: {
      outcomes: new Map([
        [0, { outcome: "ok" as const, net: false, ghost: false }],
        [1, { outcome: "ok" as const, net: false, ghost: false }],
      ]),
      duplicateLines: [],
      beyondStarted: [],
    },
  };

  it("an ok intent without a row is a PRODUCT BUG; the client count check does not run", () => {
    const s = {
      liveBookings: 1,
      nonAccepted: 0,
      overlapPairs: 0,
      clientAccepted: 2,
      intents: { counters, rowsByIntent: new Map([[0, 1]]), ghostRows: 0 },
    };
    const r = evaluateCalAudit(s, SCOPE);
    assert.ok(r.violations.some((v) => /intent 1 was told ok but has no row/.test(v.text)));
    assert.equal(
      r.checks.some((c) => c.name === "client-matches-db"),
      false,
    );
    assert.equal(
      r.checks.some((c) => c.name === "per-intent"),
      true,
    );
  });
});
