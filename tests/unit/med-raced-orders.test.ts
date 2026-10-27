import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isRacedEmail,
  iterationOfEmail,
  unconfirmedInjections,
} from "../../src/load/med/raced-orders.ts";

describe("medusa raced orders", () => {
  it("reads the iteration index from the run email", () => {
    assert.equal(
      iterationOfEmail("p6-qa-20261027t080000z-abcdef12-p6-med-load-009-i19@qa.local"),
      19,
    );
    assert.equal(iterationOfEmail("p6-qa-run-i-i7@qa.local"), 7);
    assert.equal(iterationOfEmail("someone@example.com"), null);
  });

  it("judges only the iterations a race was injected into", () => {
    const prefix = "p6-qa-20261027t080000z-abcdef12-p6-med-load-009";
    assert.equal(isRacedEmail(`${prefix}-i9@qa.local`), true); // double cancel
    assert.equal(isRacedEmail(`${prefix}-i19@qa.local`), true); // cancel and fulfil
    assert.equal(isRacedEmail(`${prefix}-i8@qa.local`), false);
    assert.equal(isRacedEmail(`${prefix}-i0@qa.local`), false);
    assert.equal(isRacedEmail("someone@example.com"), false);
  });

  it("counts a race-selected order without a sent race as unconfirmed, never negative", () => {
    assert.equal(unconfirmedInjections(5, 5), 0);
    assert.equal(unconfirmedInjections(5, 3), 2); // a completion response was lost twice
    assert.equal(unconfirmedInjections(3, 5), 0);
  });
});
