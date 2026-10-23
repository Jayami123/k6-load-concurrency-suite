import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_ORDER_CONCURRENCY,
  resolveOrderConcurrency,
} from "../../src/medusa/run-order-case.ts";

describe("order burst concurrency", () => {
  it("the default is 2, the -008 and -009 shape", () => {
    assert.equal(DEFAULT_ORDER_CONCURRENCY, 2);
  });

  it("an omitted concurrency resolves to the default, so -008 and -009 keep their burst", () => {
    assert.equal(resolveOrderConcurrency(undefined), 2);
  });

  it("an explicit 10 is used as given (P6-MED-RACE-013 and -014)", () => {
    assert.equal(resolveOrderConcurrency(10), 10);
  });

  it("zero, negative and fractional values are TEST BUG", () => {
    for (const bad of [0, -1, 2.5, Number.NaN]) {
      assert.throws(() => resolveOrderConcurrency(bad), /TEST BUG: order burst concurrency/);
    }
  });
});
