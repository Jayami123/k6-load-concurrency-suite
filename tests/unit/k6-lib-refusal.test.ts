import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyRefusal } from "../../k6/lib/pure/refusal.js";

describe("k6 lib refusal classifier", () => {
  it("a non-JSON 500 body (type and message undefined) gives other and does not throw", () => {
    assert.equal(classifyRefusal(500, undefined, undefined), "other");
  });

  it("a 200 order reply is an order", () => {
    assert.equal(classifyRefusal(200, "order", undefined), "order");
  });

  it("a sold-out refusal at the line item is clean", () => {
    assert.equal(
      classifyRefusal(
        400,
        "not_allowed",
        "Not enough stock available for item iitem_1 at location sloc_1",
      ),
      "clean",
    );
  });

  it("a 400 not_allowed that only mentions inventory is not a clean refusal", () => {
    assert.equal(classifyRefusal(400, "not_allowed", "Inventory location missing"), "other");
  });

  it("a sold-out refusal at complete is clean", () => {
    assert.equal(
      classifyRefusal(400, "not_allowed", "Insufficient inventory for variant variant_1"),
      "clean",
    );
  });

  it("the ghost message (F-M2) is ghost, not clean", () => {
    assert.equal(
      classifyRefusal(
        400,
        "not_allowed",
        'Updating Status from "archived" to "canceled" is not allowed',
      ),
      "ghost",
    );
  });

  it("an unknown 400 is other", () => {
    assert.equal(classifyRefusal(400, "invalid_data", "region missing"), "other");
  });

  it("a 500 is other, whatever its body says", () => {
    assert.equal(classifyRefusal(500, "order", "Not enough stock"), "other");
  });
});
