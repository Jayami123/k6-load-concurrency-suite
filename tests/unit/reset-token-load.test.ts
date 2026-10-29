import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { GraphqlResult } from "../../src/twenty/api.ts";
import { successOf, summariseRedemptions } from "../../src/twenty/reset-token-load.ts";

const token = "f".repeat(64);

/** A GraphQL answer shaped like the reset mutation's, with a token-shaped value inside the body. */
function answer(status: number, json: GraphqlResult["json"]): GraphqlResult {
  return { status, json, text: `${token} ${JSON.stringify(json)}` };
}

const accepted = answer(200, { data: { updatePasswordViaResetToken: { success: true } } });

describe("successOf", () => {
  it("counts only HTTP 200 with no errors and success === true", () => {
    assert.equal(successOf(accepted), true);
    assert.equal(successOf(answer(200, { errors: [{ message: "refused" }], data: null })), false);
    assert.equal(
      successOf(answer(200, { data: { updatePasswordViaResetToken: { success: false } } })),
      false,
    );
    assert.equal(successOf(answer(429, null)), false);
  });
});

describe("summariseRedemptions", () => {
  it("reduces one token's answers to counts and statuses, with no body or token in the result", () => {
    const summary = summariseRedemptions([
      accepted,
      answer(200, { errors: [{ message: "refused" }], data: null }),
      answer(500, null),
    ]);
    assert.deepEqual(summary, { successes: 1, statuses: [200, 200, 500], fiveHundreds: 1 });
    assert.doesNotMatch(JSON.stringify(summary), /[0-9a-f]{64}/);
  });
});
