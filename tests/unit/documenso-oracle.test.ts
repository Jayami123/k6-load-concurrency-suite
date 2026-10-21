import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DOCUMENT_COMPLETED_AUDIT_SQL,
  DOCUMENT_DATA_COUNT_SQL,
  EMAIL_JOBS_SQL,
  ENVELOPE_SQL,
  ITEM_SEALED_SQL,
  LEAK_API_TOKENS_SQL,
  LEAK_USERS_SQL,
  LEAK_WEBHOOKS_SQL,
  LIVE_ENVELOPE_LEAK_SQL,
  SEAL_JOBS_SQL,
  SOFT_DELETED_ENVELOPE_SQL,
  WEBHOOK_CALLS_SQL,
  WEBHOOK_JOBS_SQL,
} from "../../src/documenso/oracle.ts";
import { assertSelectOnly } from "../../src/oracles/pg.ts";

const QUERIES = {
  WEBHOOK_CALLS_SQL,
  LEAK_USERS_SQL,
  LEAK_WEBHOOKS_SQL,
  LEAK_API_TOKENS_SQL,
  ENVELOPE_SQL,
  SEAL_JOBS_SQL,
  EMAIL_JOBS_SQL,
  WEBHOOK_JOBS_SQL,
  DOCUMENT_COMPLETED_AUDIT_SQL,
  ITEM_SEALED_SQL,
  DOCUMENT_DATA_COUNT_SQL,
  LIVE_ENVELOPE_LEAK_SQL,
  SOFT_DELETED_ENVELOPE_SQL,
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
    assert.match(DOCUMENT_COMPLETED_AUDIT_SQL, /FROM "DocumentAuditLog"/);
    assert.match(ITEM_SEALED_SQL, /FROM "EnvelopeItem"/);
  });

  it("job queries filter on jobId, not on the display name", () => {
    assert.match(SEAL_JOBS_SQL, /"jobId" = 'internal\.seal-document'/);
    assert.match(EMAIL_JOBS_SQL, /"jobId" = 'send\.document\.completed\.emails'/);
    assert.match(WEBHOOK_JOBS_SQL, /"jobId" = 'internal\.execute-webhook'/);
    assert.doesNotMatch(SEAL_JOBS_SQL, /\bname\b/);
  });

  it("the live-envelope leak count ignores soft-deleted rows", () => {
    assert.match(LIVE_ENVELOPE_LEAK_SQL, /"deletedAt" IS NULL/);
    assert.match(SOFT_DELETED_ENVELOPE_SQL, /"deletedAt" IS NOT NULL/);
  });

  it("the envelope status read selects no token column", () => {
    assert.doesNotMatch(ENVELOPE_SQL, /\btoken\b/i);
    assert.match(DOCUMENT_DATA_COUNT_SQL, /FROM "DocumentData"/);
  });
});
