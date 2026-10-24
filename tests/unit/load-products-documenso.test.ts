import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type pg from "pg";
import type { RunContext } from "../../src/documenso/run-case.ts";
import {
  DOCUMENSO_SECRET_ENV,
  documensoCleanupWith,
  documensoSetupWith,
  type DocumensoDeps,
} from "../../src/load/products/documenso.ts";
import type { LoadContext } from "../../src/load/types.ts";

function fakeCtx(): LoadContext {
  return {
    caseDef: { id: "P6-DOC-LOAD-001" },
    profile: { rate: 1, durationSec: 30, maxLatencyMs: 3000 },
    runPrefix: "p6-qa-20261024T010203Z-3fa9c0d1",
    config: {},
    secrets: {},
    handles: {},
  } as unknown as LoadContext;
}

function fakeRun(pool: pg.Pool, apiToken: string): RunContext {
  return {
    baseUrl: "http://doc.test",
    runPrefix: "p6-qa-20261024t010203z-3fa9c0d1-p6-doc-load-001",
    pool,
    apiToken,
    envelopeIds: [],
  } as unknown as RunContext;
}

/** A pool that answers the envelope and recipient queries from fixed rows, and records the parameters it was given. */
function fakePool(envelopes: Array<{ id: number }>, recipients: Array<{ email: string }>) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const query = async (sql: string, params: unknown[]) => {
    calls.push({ sql, params });
    if (sql.includes('FROM "Envelope" WHERE title')) return { rows: envelopes };
    if (sql.includes('"Recipient"')) return { rows: recipients };
    return { rows: [] };
  };
  return { pool: { query, end: async () => {} } as unknown as pg.Pool, calls };
}

function deps(overrides: Partial<DocumensoDeps>): DocumensoDeps {
  return {
    openPool: () => fakePool([], []).pool,
    start: async () => fakeRun(fakePool([], []).pool, "dtok"),
    end: async () => [],
    leak: async () => ({ values: {}, violations: [] }),
    ...overrides,
  };
}

describe("documenso product setup and cleanup", () => {
  it("the api token goes to ctx.secrets only, never to ctx.config", async () => {
    const ctx = fakeCtx();
    const out = await documensoSetupWith(ctx, deps({}));
    assert.equal(out.ok, true);
    assert.equal(ctx.secrets.DOCUMENSO_API_TOKEN, "dtok");
    assert.doesNotMatch(JSON.stringify(ctx.config), /dtok/);
  });

  it("the k6 process receives the token by name only (secretEnv)", () => {
    assert.deepEqual(DOCUMENSO_SECRET_ENV, ["DOCUMENSO_API_TOKEN"]);
  });

  it("the cleanup collects the live envelope ids by title prefix before the run ends", async () => {
    const { pool, calls } = fakePool(
      [{ id: 11 }, { id: 12 }],
      [{ email: "p6-doc-r0@example.com" }],
    );
    const ctx = fakeCtx();
    ctx.handles.documensoRun = fakeRun(pool, "dtok");
    let idsAtEnd: string[] = [];
    let mailboxesAtEnd: string[] = [];
    const out = await documensoCleanupWith(
      ctx,
      deps({
        end: async (run, mailboxes) => {
          idsAtEnd = [...run.envelopeIds];
          mailboxesAtEnd = mailboxes;
          return [];
        },
      }),
    );
    assert.equal(out.ok, true);
    assert.deepEqual(idsAtEnd, ["11", "12"]);
    assert.deepEqual(mailboxesAtEnd, ["p6-doc-r0"]);
    const envelopeQuery = calls.find((c) => c.sql.includes('FROM "Envelope" WHERE title'));
    assert.deepEqual(envelopeQuery?.params, ["p6-qa-20261024t010203z-3fa9c0d1-p6-doc-load-001%"]);
  });
});
