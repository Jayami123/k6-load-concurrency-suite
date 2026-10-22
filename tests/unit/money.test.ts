import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseWholeAmount } from "../../src/medusa/money.ts";

describe("parseWholeAmount", () => {
  it("accepts a whole amount given as a string", () => {
    assert.equal(parseWholeAmount("1010", "x"), 1010);
  });

  it("accepts a negative whole amount", () => {
    assert.equal(parseWholeAmount("-5", "x"), -5);
  });

  it("accepts zero, a valid state for a payment with no captures", () => {
    assert.equal(parseWholeAmount("0", "x"), 0);
  });

  it("accepts a whole number given as a number", () => {
    assert.equal(parseWholeAmount(505, "x"), 505);
  });

  it("rejects a decimal amount as TEST BUG", () => {
    assert.throws(() => parseWholeAmount("10.5", "x"), /TEST BUG: x is not a whole amount/);
  });

  it("rejects exponent notation, an empty string and a value outside the safe integer range", () => {
    assert.throws(() => parseWholeAmount("1e3", "x"), /TEST BUG/);
    assert.throws(() => parseWholeAmount("", "x"), /TEST BUG/);
    assert.throws(() => parseWholeAmount("9007199254740993", "x"), /safe integer range/);
  });
});
