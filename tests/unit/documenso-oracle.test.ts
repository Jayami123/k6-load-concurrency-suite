import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  LEAK_API_TOKENS_SQL,
  LEAK_USERS_SQL,
  LEAK_WEBHOOKS_SQL,
  WEBHOOK_CALLS_SQL,
} from "../../src/documenso/oracle.ts";
import { assertSelectOnly } from "../../src/oracles/pg.ts";

const QUERIES = {
  WEBHOOK_CALLS_SQL,
  LEAK_USERS_SQL,
  LEAK_WEBHOOKS_SQL,
  LEAK_API_TOKENS_SQL,
};

describe("documenso oracle SQL", () => {
  it("every query is SELECT-only", () => {
    for (const sql of Object.values(QUERIES)) {
      assert.doesNotThrow(() => assertSelectOnly(sql));
    }
  });

  it("no select list names a token, password or secret column (D10)", () => {
    for (const [name, sql] of Object.entries(QUERIES)) {
      const selectList = sql.slice(sql.indexOf("SELECT"), sql.indexOf("FROM"));
      assert.doesNotMatch(selectList, /\btoken\b|password|secret/i, name);
    }
  });

  it("quotes the Prisma model names", () => {
    assert.match(WEBHOOK_CALLS_SQL, /FROM "WebhookCall"/);
    assert.match(LEAK_USERS_SQL, /FROM "User"/);
    assert.match(LEAK_WEBHOOKS_SQL, /FROM "Webhook"/);
    assert.match(LEAK_API_TOKENS_SQL, /FROM "ApiToken"/);
  });
});
