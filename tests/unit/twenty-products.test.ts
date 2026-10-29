import assert from "node:assert/strict";
import type pg from "pg";
import { describe, it } from "node:test";
import { caseDataPrefix } from "../../k6/lib/pure/prefix.js";
import { p6RunPrefix } from "../../src/races/prefix.ts";
import {
  twentyCleanupWith,
  twentySetupWith,
  type TwentyDeps,
} from "../../src/load/products/twenty.ts";
import type { LoadContext } from "../../src/load/types.ts";

const CASE_ID = "TW-BG-FOUNDATION";

/** A minimal LoadContext for the twenty stages. Only the fields the stages read are set. */
function ctxWith(env: NodeJS.ProcessEnv = { P6_TWENTY_LIMITER_PROFILE: "productionLike" }) {
  return {
    caseDef: { id: CASE_ID },
    profile: { rate: 1, durationSec: 30, maxLatencyMs: 4000 },
    runPrefix: p6RunPrefix(),
    outDir: "",
    env,
    config: {},
    secrets: {},
    handles: {},
    k6: [],
    invalid: [],
    results: {},
  } as unknown as LoadContext;
}

/** Fake dependencies: a sign-in that returns a token, a schema, no rows, and a pool that closes cleanly. */
function fakeDeps(over: Partial<TwentyDeps> = {}): TwentyDeps {
  const pool = { end: async () => {} } as unknown as pg.Pool;
  return {
    openPool: () => pool,
    signIn: async () => ({ authorizationHeader: "Bearer tok", origin: "http://127.0.0.1:3002" }),
    resolveSchema: async () => ({ workspaceId: "w", schema: "workspace_abc" }),
    listPrefixedIds: async () => [],
    destroy: async () => [],
    leakCount: async () => 0,
    createKeys: async () => [],
    revokeKeys: async () => {},
    apiKeyLeakCount: async () => 0,
    ...over,
  };
}

describe("twenty products stages", () => {
  it("a missing Twenty env is an ENV failure, not a test failure", async () => {
    const deps = fakeDeps({
      signIn: async () => {
        throw new Error("TEST BUG: TWENTY_EMAIL is not set");
      },
    });
    const result = await twentySetupWith(ctxWith(), deps);
    assert.equal(result.ok, false);
    assert.equal(result.kind, "ENV");
    assert.match(result.reasons[0] ?? "", /^twenty setup failed: TEST BUG: TWENTY_EMAIL/);
  });

  it("a good setup sets the user token and the audit config, with no token in the config", async () => {
    const ctx = ctxWith();
    const result = await twentySetupWith(ctx, fakeDeps());
    assert.equal(result.ok, true);
    assert.equal(ctx.secrets.TWENTY_TOKEN, "tok");
    assert.deepEqual(ctx.config.audit, {
      product: "twenty",
      prefixLike: `${caseDataPrefix(ctx.runPrefix, CASE_ID)}%`,
      schema: "workspace_abc",
    });
    assert.equal(JSON.stringify(ctx.config).includes("tok"), false);
  });

  it("cleanup destroys exactly the prefixed ids", async () => {
    const ctx = ctxWith();
    await twentySetupWith(ctx, fakeDeps());
    const destroyed: Array<[string[], string]> = [];
    const deps = fakeDeps({
      listPrefixedIds: async () => ["id-a", "id-b"],
      destroy: async (ids, auth) => {
        destroyed.push([ids, auth]);
        return [];
      },
    });
    const result = await twentyCleanupWith(ctx, deps);
    assert.equal(result.ok, true);
    assert.deepEqual(destroyed, [[["id-a", "id-b"], "Bearer tok"]]);
  });

  it("a leak count of 1 after cleanup is a TEST BUG", async () => {
    const ctx = ctxWith();
    await twentySetupWith(ctx, fakeDeps());
    const result = await twentyCleanupWith(ctx, fakeDeps({ leakCount: async () => 1 }));
    assert.equal(result.ok, false);
    assert.equal(result.kind, "TEST BUG");
    assert.match(result.reasons[0] ?? "", /1 company row\(s\) left/);
  });

  it("cleanup with no prefixed rows is ok and destroys nothing", async () => {
    const ctx = ctxWith();
    await twentySetupWith(ctx, fakeDeps());
    let destroyCalls = 0;
    const deps = fakeDeps({
      destroy: async () => {
        destroyCalls += 1;
        return [];
      },
    });
    const result = await twentyCleanupWith(ctx, deps);
    assert.deepEqual(result, { ok: true, reasons: [] });
    assert.equal(destroyCalls, 0);
  });
});
