import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type pg from "pg";
import type { PrivateLinkInput } from "../../src/cal/private-link.ts";
import {
  calCleanupWith,
  calSetupWith,
  calWindowDays,
  type CalDeps,
  type CalLinkDeps,
} from "../../src/load/products/cal.ts";
import type { LoadContext } from "../../src/load/types.ts";

type Query = (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }>;

/** A pool whose query answers from a script, one result per call. The last result repeats. */
function fakePool(results: unknown[][]): { pool: pg.Pool; sqls: string[] } {
  const sqls: string[] = [];
  let call = 0;
  const query: Query = async (sql) => {
    sqls.push(sql);
    const rows = results[Math.min(call, results.length - 1)] ?? [];
    call += 1;
    return { rows };
  };
  return { pool: { query, end: async () => {} } as unknown as pg.Pool, sqls };
}

const HOST_ROW = {
  userId: 5,
  eventTypeId: 7,
  length: 30,
  seatsPerTimeSlot: null,
  requiresConfirmation: false,
  periodType: "unlimited",
};

function fakeCtx(): LoadContext {
  return {
    caseDef: { id: "P6-CAL-LOAD-001" },
    profile: { rate: 2, durationSec: 30, maxLatencyMs: 1000 },
    runPrefix: "p6-qa-20261024T010203Z-3fa9c0d1",
    config: {},
    secrets: {},
    handles: {},
  } as unknown as LoadContext;
}

describe("cal product setup and cleanup", () => {
  it("window length is at least 28 days, and grows past that with the planned count", () => {
    assert.equal(calWindowDays(0), 28);
    assert.equal(calWindowDays(60), 28);
    assert.equal(calWindowDays(400), 39);
  });

  it("the config holds no secret and the secrets map stays empty", async () => {
    const ctx = fakeCtx();
    const { pool } = fakePool([[HOST_ROW]]);
    const deps: CalDeps = { openPool: () => pool, cancel: async () => {} };
    const out = await calSetupWith(ctx, deps);
    assert.equal(out.ok, true);
    assert.doesNotMatch(JSON.stringify(ctx.config), /token|password|secret/i);
    assert.deepEqual(ctx.secrets, {});
    assert.equal(ctx.config.windowDays, calWindowDays(60));
  });

  it("the cleanup sweeps the uids the database returns, not the uids k6 returned", async () => {
    const booking = (id: number, uid: string) => ({
      id,
      uid,
      status: "accepted",
      start: "2026-12-01 10:00:00.000",
      end: "2026-12-01 10:30:00.000",
    });
    const { pool } = fakePool([[booking(1, "uid-a"), booking(2, "uid-b")], []]);
    const cancelled: string[] = [];
    const out = await calCleanupWith(fakeCtx(), {
      openPool: () => pool,
      cancel: async (uid) => {
        cancelled.push(uid);
      },
    });
    assert.deepEqual(cancelled, ["uid-a", "uid-b"]);
    assert.equal(out.ok, true);
  });

  it("a failed cancel becomes a TEST BUG line and the sweep continues", async () => {
    const booking = (id: number, uid: string) => ({
      id,
      uid,
      status: "accepted",
      start: "2026-12-01 10:00:00.000",
      end: "2026-12-01 10:30:00.000",
    });
    const { pool } = fakePool([[booking(1, "uid-a"), booking(2, "uid-b")], []]);
    const cancelled: string[] = [];
    const out = await calCleanupWith(fakeCtx(), {
      openPool: () => pool,
      cancel: async (uid) => {
        cancelled.push(uid);
        if (uid === "uid-a") throw new Error("cancel refused");
      },
    });
    assert.deepEqual(cancelled, ["uid-a", "uid-b"]);
    assert.equal(out.ok, false);
    assert.equal(out.kind, "TEST BUG");
    assert.deepEqual(out.reasons, ["TEST BUG: cancel booking 1 failed: cancel refused"]);
  });
});

describe("cal private-link setup and restore", () => {
  function linkDeps(over: Partial<CalLinkDeps> = {}): {
    deps: CalLinkDeps;
    set: PrivateLinkInput[][];
  } {
    const set: PrivateLinkInput[][] = [];
    const deps: CalLinkDeps = {
      password: () => "pw-not-logged",
      login: async () => "session=cookie-value-xyz",
      readLinks: async () => [
        { link: "prior-a", maxUsageCount: 3, usageCount: 1, expiresAt: null },
      ],
      setLinks: async (_base, _cookie, _event, links) => {
        set.push(links);
      },
      ...over,
    };
    return { deps, set };
  }

  it("the setup sets planned + 2 cap-1 links with unique lower-case ids", async () => {
    const ctx = fakeCtx(); // rate 2 x 30 s = 60 planned, so 62 links
    const { pool } = fakePool([[HOST_ROW]]);
    const { deps, set } = linkDeps();
    const out = await calSetupWith(
      ctx,
      { openPool: () => pool, cancel: async () => {}, links: deps },
      { privateLinks: true },
    );
    assert.equal(out.ok, true);
    const links = set[0] ?? [];
    assert.equal(links.length, 62);
    assert.ok(links.every((l) => l.maxUsageCount === 1));
    const ids = links.map((l) => l.link);
    assert.equal(new Set(ids).size, 62);
    assert.ok(ids.every((id) => id === id.toLowerCase() && /^[a-z0-9-]+$/.test(id)));
    assert.equal((ctx.config.links as string[]).length, 62);
  });

  it("the host cookie is in ctx.secrets and never in ctx.config", async () => {
    const ctx = fakeCtx();
    const { pool } = fakePool([[HOST_ROW]]);
    const { deps } = linkDeps();
    await calSetupWith(
      ctx,
      { openPool: () => pool, cancel: async () => {}, links: deps },
      { privateLinks: true },
    );
    assert.equal(ctx.secrets.CAL_HOST_COOKIE, "session=cookie-value-xyz");
    assert.doesNotMatch(JSON.stringify(ctx.config), /cookie-value-xyz|pw-not-logged/);
  });

  it("a failed restore of the prior links is a TEST BUG line", async () => {
    const ctx = fakeCtx();
    const { pool } = fakePool([[HOST_ROW], []]); // setup reads the host row; the cleanup queries find nothing
    let calls = 0;
    const { deps } = linkDeps({
      setLinks: async () => {
        calls += 1;
        if (calls === 2) throw new Error("restore refused");
      },
    });
    const dbDeps = { openPool: () => pool, cancel: async () => {}, links: deps };
    await calSetupWith(ctx, dbDeps, { privateLinks: true });
    const out = await calCleanupWith(ctx, dbDeps);
    assert.equal(out.ok, false);
    assert.equal(out.kind, "TEST BUG");
    assert.deepEqual(out.reasons, ["TEST BUG: prior links not restored: restore refused"]);
  });
});
