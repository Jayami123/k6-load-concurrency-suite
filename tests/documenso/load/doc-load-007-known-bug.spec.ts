import { expect, test } from "@playwright/test";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

// P6-DOC-LOAD-007 reads the newest run that the LOAD step of documenso-smoke wrote (results/load/P6-DOC-LOAD-007/<run>/audit.json).
// The storm checks are hard. The duplicate seal is the known bug P6-OBS-DOC-005 (README, "Known product bugs"): it is an
// expected failure, so the test turns red ("expected to fail but passed") as soon as the product seals each envelope once.

interface Envelope {
  status: string;
  sealJobs: number;
  completedAudit: number;
  signedRecipients: number;
  recipients: number;
  emailsPerRecipient: number[];
}

interface RetryAudit {
  findings: Array<{ check: string; ok: boolean }>;
  envelopes: Envelope[];
}

const CASE_DIR = path.resolve("results/load/P6-DOC-LOAD-007");

function latestAudit(): RetryAudit {
  const runs = readdirSync(CASE_DIR).sort();
  const last = runs.at(-1);
  if (last === undefined) throw new Error(`TEST BUG: no P6-DOC-LOAD-007 run in ${CASE_DIR}`);
  return JSON.parse(readFileSync(path.join(CASE_DIR, last, "audit.json"), "utf8")) as RetryAudit;
}

const audit = latestAudit();
const finding = (check: string) => audit.findings.find((f) => f.check === check);

test("P6-DOC-LOAD-007 storm holds: retries were sent, no 5xx, every envelope COMPLETED", () => {
  expect(finding("storm")?.ok, "storm: at least half of the first requests timed out").toBe(true);
  expect(finding("no-5xx")?.ok, "no attempt answered 5xx").toBe(true);
  expect(finding("document-completed")?.ok, "every envelope is COMPLETED").toBe(true);
  expect(finding("recipients-signed")?.ok, "every recipient signed").toBe(true);
  expect(audit.envelopes.length, "the run has envelopes").toBeGreaterThan(0);
});

test("P6-OBS-DOC-005: each envelope gets exactly one seal job (known bug, strict)", () => {
  expect(audit.envelopes.length, "the run has envelopes").toBeGreaterThan(0);
  // PRODUCT BUG P6-OBS-DOC-005: concurrent retried completions of one recipient enqueue internal.seal-document more than once
  // (suspected: packages/lib/server-only/document/complete-document-with-token.ts, completeDocumentWithToken). Remove this line
  // and the README row when the product seals each envelope once: a passing run then fails on purpose.
  test.fail();
  for (const e of audit.envelopes) {
    expect(e.sealJobs, "seal jobs per envelope (P6-OBS-DOC-005)").toBe(1);
  }
});
