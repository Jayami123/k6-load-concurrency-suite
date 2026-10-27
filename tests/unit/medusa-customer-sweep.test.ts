import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sweepCustomersByPrefix, type CustomerRow } from "../../src/medusa/customer-sweep.ts";

/** A server that lists its current rows from an offset, and drops a row when it is deleted, as the admin API does. */
function fakeServer(rows: CustomerRow[]) {
  const removed: string[] = [];
  return {
    removed,
    port: {
      list: async (offset: number, limit: number) => rows.slice(offset, offset + limit),
      remove: async (id: string) => {
        const at = rows.findIndex((r) => r.id === id);
        assert.notEqual(at, -1, `removing unknown ${id}`);
        rows.splice(at, 1);
        removed.push(id);
      },
    },
  };
}

const matching = (n: number): CustomerRow[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `c${i}`,
    email: `p6-qa-run-x-i${i}@example.com`,
  }));

describe("medusa customer sweep", () => {
  it("deletes more than 2000 matching customers, past the old 20-page cap, and leaves none", async () => {
    const rows = matching(2500);
    const server = fakeServer(rows);
    const deleted = await sweepCustomersByPrefix(server.port, "p6-qa-run-x");
    assert.equal(deleted, 2500);
    assert.equal(rows.length, 0);
  });

  it("keeps non-matching customers and moves the offset only past them", async () => {
    const mixed: CustomerRow[] = [];
    for (let i = 0; i < 250; i += 1) {
      mixed.push({ id: `m${i}`, email: `p6-qa-run-x-i${i}@example.com` });
      mixed.push({ id: `k${i}`, email: `someone-${i}@example.com` });
    }
    const server = fakeServer(mixed);
    const deleted = await sweepCustomersByPrefix(server.port, "p6-qa-run-x");
    assert.equal(deleted, 250);
    assert.equal(
      mixed.every((r) => r.id?.startsWith("k")),
      true,
    );
  });

  it("throws a TEST BUG when the page bound is reached with matches still listed", async () => {
    const rows = matching(10);
    const server = fakeServer(rows);
    await assert.rejects(
      sweepCustomersByPrefix(server.port, "p6-qa-run-x", { pageSize: 2, maxPages: 2 }),
      /TEST BUG: customer sweep stopped after 2 pages/,
    );
  });
});
