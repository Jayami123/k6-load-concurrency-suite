import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  judgeDocumensoRetries,
  type DocumensoRetryInput,
  type DocumensoRetryRow,
} from "../../src/load/retry-audit/documenso.ts";
import type { RetryCounters } from "../../src/load/retry-validity.ts";

const counters = (over: Partial<RetryCounters> = {}): RetryCounters => ({
  intents: 10,
  attempts: 15,
  firstTimeouts: 5,
  intentsOk: 10,
  retryOk: 0,
  retryConflict: 0,
  retryRedacted400: 0,
  retryRefused: 0,
  retry5xx: 0,
  orderMismatch: 0,
  ...over,
});

const clean = (): DocumensoRetryRow => ({
  status: "COMPLETED",
  sealJobs: 1,
  completedAudit: 1,
  signedRecipients: 2,
  recipients: 2,
  emailsPerRecipient: [1, 1],
});

const docs = (first: Partial<DocumensoRetryRow> = {}): DocumensoRetryRow[] =>
  Array.from({ length: 10 }, (_, k) => (k === 0 ? { ...clean(), ...first } : clean()));

const input = (over: Partial<DocumensoRetryInput> = {}): DocumensoRetryInput => ({
  intents: 10,
  rows: docs(),
  counters: counters(),
  ...over,
});

const failed = (r: ReturnType<typeof judgeDocumensoRetries>) => r.findings.filter((f) => !f.ok);

describe("retry audit: documenso", () => {
  it("one seal, one DOCUMENT_COMPLETED row, every recipient signed and one email each passes", () => {
    const r = judgeDocumensoRetries(input());
    assert.deepEqual(failed(r), []);
    assert.deepEqual(r.knownBugs, {});
  });

  it("a second seal job is a PRODUCT BUG and is counted under P6-OBS-DOC-002", () => {
    const r = judgeDocumensoRetries(input({ rows: docs({ sealJobs: 2 }) }));
    const f = r.findings.find((x) => x.check === "one-seal-per-document");
    assert.equal(f?.ok, false);
    assert.equal(f?.kind, "PRODUCT BUG");
    assert.equal(r.knownBugs["P6-OBS-DOC-002"], 1);
  });

  it("a second completion email for one recipient is a PRODUCT BUG", () => {
    const r = judgeDocumensoRetries(input({ rows: docs({ emailsPerRecipient: [2, 1] }) }));
    const f = r.findings.find((x) => x.check === "one-email-per-recipient");
    assert.equal(f?.ok, false);
    assert.equal(f?.kind, "PRODUCT BUG");
    assert.match(f?.detail ?? "", /^1 recipient\(s\)/);
  });

  it("a recipient that is not signed is a PRODUCT BUG", () => {
    const r = judgeDocumensoRetries(input({ rows: docs({ signedRecipients: 1 }) }));
    const f = r.findings.find((x) => x.check === "recipients-signed");
    assert.equal(f?.ok, false);
    assert.equal(f?.kind, "PRODUCT BUG");
  });

  it("ALREADY_SIGNED answers that the client never saw are allowed", () => {
    const r = judgeDocumensoRetries(input({ counters: counters({ retryConflict: 0 }) }));
    assert.deepEqual(failed(r), []);
  });
});
