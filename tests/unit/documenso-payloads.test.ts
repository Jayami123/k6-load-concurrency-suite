import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  completeBody,
  documentTitle,
  legacyDocumentId,
  recipientBodies,
  recipientEmail,
  signFieldBody,
  signatureFieldBodies,
  signingTokenFromUrl,
} from "../../src/documenso/payloads.ts";

const CASE_PREFIX = "p6-qa-x-p6-doc-race-001";

describe("documenso payloads", () => {
  it("builds a lower-case recipient mailbox per trial and index", () => {
    assert.equal(recipientEmail(CASE_PREFIX, 3, 1), `${CASE_PREFIX}-t3-r1@example.com`);
  });

  it("a rerun gets its own mailbox and title, attempt 1 keeps today's names", () => {
    assert.equal(recipientEmail(CASE_PREFIX, 3, 1, 1), `${CASE_PREFIX}-t3-r1@example.com`);
    assert.equal(recipientEmail(CASE_PREFIX, 3, 1, 2), `${CASE_PREFIX}-t3a2-r1@example.com`);
    assert.equal(
      recipientBodies(CASE_PREFIX, 3, 2, 2)[0]?.email,
      `${CASE_PREFIX}-t3a2-r0@example.com`,
    );
    assert.equal(documentTitle(CASE_PREFIX, 4, "two-last", 3), `${CASE_PREFIX} t4a3 two-last`);
  });

  it("rejects a recipient count below one", () => {
    assert.throws(() => recipientBodies(CASE_PREFIX, 0, 0), /TEST BUG/);
  });

  it("returns one SIGNER body per recipient with distinct emails", () => {
    const bodies = recipientBodies(CASE_PREFIX, 0, 2);
    assert.equal(bodies.length, 2);
    assert.equal(new Set(bodies.map((body) => body.email)).size, 2);
    assert.ok(bodies.every((body) => body.role === "SIGNER"));
  });

  it("prefixes the document title with the case prefix", () => {
    assert.equal(documentTitle(CASE_PREFIX, 4, "two-last"), `${CASE_PREFIX} t4 two-last`);
  });

  it("places signature fields at percent positions up to 100", () => {
    const fields = signatureFieldBodies({ envelopeItemId: "item_1", recipientIds: [7, 8] });
    assert.deepEqual(
      fields.map((field) => field.positionY),
      [10, 30],
    );
    assert.ok(fields.every((field) => (field.positionY as number) <= 100));
  });

  it("refuses more recipients than the field layout fits", () => {
    assert.throws(
      () =>
        signatureFieldBodies({
          envelopeItemId: "item_1",
          recipientIds: [1, 2, 3, 4, 5, 6],
        }),
      /TEST BUG/,
    );
  });

  it("reads the legacy document id from secondaryId", () => {
    assert.equal(legacyDocumentId("document_1018"), 1018);
    assert.throws(() => legacyDocumentId("envelope_abc"), /TEST BUG/);
  });

  it("takes the signing token from the last path segment", () => {
    assert.equal(signingTokenFromUrl("http://127.0.0.1:3001/sign/abc_DEF-1"), "abc_DEF-1");
    assert.throws(() => signingTokenFromUrl("http://127.0.0.1:3001/other/abc"), /TEST BUG/);
  });

  it("builds the sign-field and complete bodies", () => {
    assert.deepEqual(signFieldBody("t", 5, "v"), {
      token: "t",
      fieldId: 5,
      value: "v",
      isBase64: false,
    });
    assert.deepEqual(completeBody("t", 9), { token: "t", documentId: 9 });
  });
});
