import assert from "node:assert/strict";
import { describe, it } from "node:test";
import pg from "pg";
import {
  assertSelectOnly,
  closePool,
  createReadOnlyPool,
  waitForStable,
} from "../../src/oracles/pg.ts";

describe("assertSelectOnly", () => {
  it("allows SELECT", () => {
    assertSelectOnly("SELECT 1");
    assertSelectOnly("  select 1");
    assertSelectOnly("SELECT 1;");
  });

  it("rejects non-SELECT", () => {
    assert.throws(() => assertSelectOnly('INSERT INTO "order" VALUES (1)'), /SELECT-only/);
    assert.throws(() => assertSelectOnly('SELECT 1; DELETE FROM "order"'), /SELECT-only/);
  });
});

describe("createReadOnlyPool", () => {
  it("passes read-only GUC in pool options", () => {
    const Original = pg.Pool;
    let captured: ConstructorParameters<typeof pg.Pool>[0] | undefined;
    (pg as { Pool: typeof pg.Pool }).Pool = function FakePool(
      config?: ConstructorParameters<typeof pg.Pool>[0],
    ) {
      captured = config;
      return { end: async () => {} } as pg.Pool;
    } as unknown as typeof pg.Pool;

    try {
      createReadOnlyPool("postgres://example");
      assert.equal(captured?.options, "-c default_transaction_read_only=on");
    } finally {
      (pg as { Pool: typeof pg.Pool }).Pool = Original;
    }
  });

  it("takes a pool size, and keeps 5 when none is given", () => {
    const Original = pg.Pool;
    const sizes: Array<number | undefined> = [];
    (pg as { Pool: typeof pg.Pool }).Pool = function FakePool(
      config?: ConstructorParameters<typeof pg.Pool>[0],
    ) {
      sizes.push(config?.max);
      return {} as pg.Pool;
    } as unknown as typeof pg.Pool;
    try {
      createReadOnlyPool("postgres://example", { max: 1 });
      createReadOnlyPool("postgres://example");
      assert.deepEqual(sizes, [1, 5]);
    } finally {
      (pg as { Pool: typeof pg.Pool }).Pool = Original;
    }
  });
});

describe("closePool", () => {
  it("ends exactly once", async () => {
    let endCount = 0;
    const pool = {
      end: async () => {
        endCount += 1;
      },
    } as pg.Pool;

    await closePool(pool);
    await closePool(pool);
    assert.equal(endCount, 1);
  });

  it("tolerates undefined", async () => {
    await closePool(undefined);
  });
});

describe("waitForStable", () => {
  it("returns when values repeat", async () => {
    let n = 0;
    const value = await waitForStable(
      async () => {
        n += 1;
        if (n === 1) return 1;
        return 2;
      },
      { intervalMs: 1, stableReads: 2, timeoutMs: 500 },
    );
    assert.equal(value, 2);
  });

  it("times out when values never stabilize", async () => {
    await assert.rejects(
      () =>
        waitForStable(async () => Math.random(), {
          intervalMs: 1,
          stableReads: 2,
          timeoutMs: 30,
        }),
      /TEST BUG: waitForStable timed out/,
    );
  });

  it("does not accept an empty stable read when accept requires rows", async () => {
    const reads: Array<Array<number>> = [[], [7], [7]];
    let n = 0;
    const value = await waitForStable(async () => reads[Math.min(n++, reads.length - 1)] ?? [], {
      intervalMs: 1,
      timeoutMs: 500,
      accept: (rows) => rows.length > 0,
    });
    assert.deepEqual(value, [7]);
    assert.equal(n, 3);
  });

  it("returns the last read after a timeout when returnOnTimeout is set", async () => {
    const value = await waitForStable(async () => [] as number[], {
      intervalMs: 1,
      timeoutMs: 30,
      accept: (rows) => rows.length > 0,
      returnOnTimeout: true,
    });
    assert.deepEqual(value, []);
  });

  it("still throws on timeout when returnOnTimeout is not set and accept rejects", async () => {
    await assert.rejects(
      () =>
        waitForStable(async () => [] as number[], {
          intervalMs: 1,
          timeoutMs: 30,
          accept: (rows) => rows.length > 0,
        }),
      /TEST BUG: waitForStable timed out/,
    );
  });
});

describe("selectRowsOn", () => {
  it("runs a select on one client and refuses a write before it reaches the client", async () => {
    const { selectRowsOn } = await import("../../src/oracles/pg.ts");
    const seen: string[] = [];
    const client = {
      query: async (sql: string) => (seen.push(sql), { rows: [{ n: 1 }] }),
    } as never;
    assert.deepEqual(await selectRowsOn(client, "SELECT 1 AS n"), [{ n: 1 }]);
    await assert.rejects(selectRowsOn(client, "DELETE FROM x"), /not SELECT-only/);
    assert.deepEqual(seen, ["SELECT 1 AS n"]);
  });
});
