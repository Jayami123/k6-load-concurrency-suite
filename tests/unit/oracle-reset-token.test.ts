import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  joinTokens,
  publicArtefact,
  publicWording,
  redactForArtefact,
  type TokenResult,
} from "../../src/twenty/oracle-reset-token.ts";

/** A clean result: one accepted redemption, the hash changed, no live row, no server error. */
function clean(trial: number, overrides: Partial<TokenResult> = {}): TokenResult {
  return {
    trial,
    successes: 1,
    statuses: [200, 200, 200],
    fiveHundreds: 0,
    hashChanged: true,
    unrevokedRows: 0,
    ...overrides,
  };
}

describe("joinTokens", () => {
  it("passes when every token is accepted once, the hash changed and no row is left", () => {
    const join = joinTokens([clean(0), clean(1), clean(2)], 3);
    assert.equal(join.verdict, "PASS");
    assert.equal(join.exactlyOne, 3);
    assert.equal(join.findingId, undefined);
  });

  it("suspects a product bug and names the finding ID only when a token has two successes", () => {
    const join = joinTokens([clean(0), clean(1, { successes: 2, statuses: [200, 200, 200] })], 2);
    assert.equal(join.verdict, "PRODUCT_BUG_SUSPECTED");
    assert.equal(join.findingId, "P6-TW-RACE-004");
    assert.equal(
      publicWording(join),
      "PRODUCT BUG (SUSPECTED), matches P6-TW-RACE-004, see private security report",
    );
  });

  it("suspects a product bug on one server error", () => {
    const join = joinTokens(
      [clean(0), clean(1, { statuses: [200, 500, 200], fiveHundreds: 1 })],
      2,
    );
    assert.equal(join.verdict, "PRODUCT_BUG_SUSPECTED");
    assert.equal(join.findingId, undefined);
    assert.equal(publicWording(join), "PRODUCT BUG (SUSPECTED)");
  });

  it("suspects a product bug when a success did not change the hash", () => {
    const join = joinTokens([clean(0, { hashChanged: false }), clean(1)], 2);
    assert.equal(join.verdict, "PRODUCT_BUG_SUSPECTED");
    assert.equal(join.unchangedHash, 1);
  });

  it("suspects a product bug when a live reset-token row is left", () => {
    const join = joinTokens([clean(0, { unrevokedRows: 1 }), clean(1)], 2);
    assert.equal(join.verdict, "PRODUCT_BUG_SUSPECTED");
    assert.equal(join.unrevoked, 1);
  });

  it("throws a TEST BUG when the results do not match the tokens issued, without naming a count", () => {
    assert.throws(
      () => joinTokens([], 5),
      (err: Error) => err.message.startsWith("TEST BUG:") && !/\d/.test(err.message),
    );
  });
});

describe("redactForArtefact", () => {
  it("replaces 64-hex, bcrypt, JWT-shaped and Bearer values and leaves plain text alone", () => {
    const hex = "a".repeat(64);
    const bcrypt = `$2b$12$${"A".repeat(53)}`;
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.c2lnbmF0dXJlMTIz";
    const bearer = "Bearer abcdefghijklmnop.qrst";
    assert.equal(redactForArtefact(hex), "<redacted>");
    assert.equal(redactForArtefact(bcrypt), "<redacted>");
    assert.equal(redactForArtefact(jwt), "<redacted>");
    assert.equal(redactForArtefact(bearer), "<redacted>");
    assert.equal(redactForArtefact("P6-TW-LOAD-005 verdict PASS"), "P6-TW-LOAD-005 verdict PASS");
  });
});

describe("publicArtefact", () => {
  it("keeps the verdict word, validity and environment, and drops every count and stage", () => {
    const doc = publicArtefact(
      {
        caseId: "P6-TW-LOAD-005",
        runId: "20261029T030000Z-abcdef01",
        outcome: "PRODUCT BUG (SUSPECTED)",
        runOutcome: "FAIL",
        validity: "VALID",
        findingId: "P6-TW-RACE-004",
      },
      { environment: { kind: "github-actions", sha: "7cbdfec6f346b43715bc2056932f4fad5886f733" } },
    );
    const keys = Object.keys(doc).sort();
    assert.deepEqual(keys, [
      "caseId",
      "environment",
      "findingId",
      "outcome",
      "runId",
      "runOutcome",
      "validity",
    ]);
    assert.deepEqual(doc.environment, {
      kind: "github-actions",
      sha: "7cbdfec6f346b43715bc2056932f4fad5886f733",
    });
    const text = JSON.stringify(doc);
    for (const banned of ["tokens", "redeemsPerToken", "stages", "successes", "exactlyOne"]) {
      assert.equal(text.includes(banned), false, `no ${banned} in the public artefact`);
    }
  });
});
