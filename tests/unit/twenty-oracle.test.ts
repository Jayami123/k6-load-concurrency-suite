// tests/unit/twenty-oracle.test.ts (NEW, step 3)
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type pg from "pg";
import { resolveWorkspaceSchema, workspaceSchemaName } from "../../src/twenty/oracle.ts";

const APPLE = "20202020-1c25-4d02-bf25-6aeccf7ea419";
const YC = "3b8e6458-5fc1-4e63-8563-008ccddaa6db";

function fakePool(rows: unknown[]): pg.Pool {
  return { query: async () => ({ rows }) } as unknown as pg.Pool;
}

describe("twenty oracle", () => {
  it("maps the two live workspace ids to the schema names the server created", () => {
    assert.equal(workspaceSchemaName(APPLE), "workspace_1wgvd1injqtife6y4rvfbu3h5");
    assert.equal(workspaceSchemaName(YC), "workspace_3ixj3i1a5avy16ptijtb3lae3");
  });

  it("refuses a value that is not a UUID", () => {
    assert.throws(() => workspaceSchemaName("apple"), /TEST BUG/);
  });

  it("resolves the schema from exactly one row and fails on zero or two", async () => {
    const one = await resolveWorkspaceSchema(fakePool([{ id: APPLE }]), "apple");
    assert.deepEqual(one, { workspaceId: APPLE, schema: "workspace_1wgvd1injqtife6y4rvfbu3h5" });
    await assert.rejects(resolveWorkspaceSchema(fakePool([]), "apple"), /TEST BUG/);
    await assert.rejects(
      resolveWorkspaceSchema(fakePool([{ id: APPLE }, { id: YC }]), "apple"),
      /TEST BUG/,
    );
  });
});
