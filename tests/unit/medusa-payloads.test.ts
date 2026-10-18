import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  likeLiteralPrefix,
  paymentSessionBody,
  prefixedEmail,
  productCreateBody,
} from "../../src/medusa/payloads.ts";

describe("medusa payloads", () => {
  it("product create sets inventory flags and EUR price", () => {
    const body = productCreateBody({
      title: "t",
      handle: "h",
      sku: "sku",
      shippingProfileId: "sp",
      salesChannelId: "sc",
    });
    const variant = (body.variants as Array<Record<string, unknown>>)[0]!;
    assert.equal(variant.manage_inventory, true);
    assert.equal(variant.allow_backorder, false);
    assert.deepEqual((variant.prices as Array<{ currency_code: string }>)[0], {
      currency_code: "eur",
      amount: 1000,
    });
  });

  it("payment session uses pp_system_default", () => {
    assert.deepEqual(paymentSessionBody(), { provider_id: "pp_system_default" });
  });

  it("prefixedEmail lowercases prefix", () => {
    assert.equal(
      prefixedEmail("p6-qa-20261018T143056Z-abcd", "c0"),
      "p6-qa-20261018t143056z-abcd-c0@qa.local",
    );
  });

  it("likeLiteralPrefix appends percent for safe prefix", () => {
    assert.equal(
      likeLiteralPrefix("p6-qa-20261018t143012z-a1b2c3d4"),
      "p6-qa-20261018t143012z-a1b2c3d4%",
    );
  });

  it("likeLiteralPrefix rejects wildcards", () => {
    for (const bad of ["foo_bar", "foo%bar"]) {
      assert.throws(() => likeLiteralPrefix(bad), /TEST BUG/);
    }
  });
});
