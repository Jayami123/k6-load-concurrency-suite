import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DB_SIZE_SQL, dbGrowthPerUnit } from "../../src/load/soak/db-growth.ts";

describe("soak database growth", () => {
  it("reads the size of the current database with pg_database_size", () => {
    assert.match(DB_SIZE_SQL, /pg_database_size\(current_database\(\)\)/);
  });

  it("divides the byte change by the units of work", () => {
    const r = dbGrowthPerUnit(1_000, 5_000, 4);
    assert.equal(r.reason, "ok");
    assert.equal(r.bytesPerUnit, 1_000);
  });

  it("gives no rate when there are no units of work", () => {
    const r = dbGrowthPerUnit(1_000, 5_000, 0);
    assert.equal(r.reason, "no units");
    assert.equal(r.bytesPerUnit, null);
  });
});
