import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type pg from "pg";
import { assertSelectOnly } from "../../src/oracles/pg.ts";
import {
  LEAK_CUSTOMERS_SQL,
  LEAK_LIVE_ORDERS_SQL,
  LEAK_LIVE_RESERVATIONS_SQL,
  LEAK_PRODUCTS_SQL,
  leakCheck,
} from "../../src/medusa/oracle.ts";

/** Fake pool: answers each leak query with the count given for its SQL. */
function fakePool(counts: Map<string, number>, seen: Array<[string, unknown[]]>): pg.Pool {
  return {
    query: async (sql: string, params: unknown[]) => {
      seen.push([sql, params]);
      return { rows: [{ n: counts.get(sql) ?? 0 }] };
    },
  } as unknown as pg.Pool;
}

const pattern = "p6-qa-x-extra-s1-n2-%";

describe("leakCheck", () => {
  it("customer SQL is select-only and soft-delete aware", () => {
    assertSelectOnly(LEAK_CUSTOMERS_SQL);
    assert.match(LEAK_CUSTOMERS_SQL, /FROM customer\s+WHERE email LIKE \$1 AND deleted_at IS NULL/);
  });

  it("clean case has no violations and queries customers with the case pattern", async () => {
    const seen: Array<[string, unknown[]]> = [];
    const v = await leakCheck(fakePool(new Map(), seen), pattern, ["inv_1"]);
    assert.deepEqual(v, []);
    assert.ok(seen.some(([sql, params]) => sql === LEAK_CUSTOMERS_SQL && params[0] === pattern));
  });

  it("leftover customers fail the case as a TEST BUG", async () => {
    const v = await leakCheck(fakePool(new Map([[LEAK_CUSTOMERS_SQL, 2]]), []), pattern, []);
    assert.deepEqual(v, [`TEST BUG: leak customers email LIKE ${pattern}`]);
  });

  it("still flags products, orders and reservations", async () => {
    const counts = new Map([
      [LEAK_PRODUCTS_SQL, 1],
      [LEAK_LIVE_ORDERS_SQL, 1],
      [LEAK_LIVE_RESERVATIONS_SQL, 1],
    ]);
    const v = await leakCheck(fakePool(counts, []), pattern, ["inv_1"]);
    assert.equal(v.length, 3);
    assert.ok(v.some((x) => x.includes("leak products")));
    assert.ok(v.some((x) => x.includes("leak live orders")));
    assert.ok(v.some((x) => x.includes("inv_1")));
  });
});
