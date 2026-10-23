import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  attemptEmailLike,
  campaignCreateBody,
  captureBody,
  caseLeakPattern,
  fulfillmentBody,
  promoCode,
  promotionCreateBody,
  refundBody,
  casePrefix,
  cleanupFailure,
  likeLiteralPrefix,
  paymentSessionBody,
  prefixedEmail,
  prefixedHandle,
  productCreateBody,
  setupStepError,
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

  it("setupStepError passes 200 and names the step otherwise", () => {
    assert.equal(setupStepError("POST /store/carts/:id", 200), null);
    assert.equal(
      setupStepError("POST /store/carts/:id/shipping-methods", 400),
      "TEST BUG: cart setup POST /store/carts/:id/shipping-methods HTTP 400",
    );
  });

  it("casePrefix is case-scoped, lowercased and a safe LIKE literal", () => {
    const run = "p6-qa-20261018T143056Z-0a1b2c3d";
    const ids = [
      "P6-MED-RACE-001",
      "extra-s1-n2",
      "extra-s0-n5",
      "extra-mixed-qty",
      "extra-same-cart",
    ];
    const prefixes = ids.map((id) => casePrefix(run, id));
    assert.equal(prefixes[0], "p6-qa-20261018t143056z-0a1b2c3d-p6-med-race-001");
    assert.equal(new Set(prefixes).size, ids.length);
    for (const prefix of prefixes) {
      assert.match(prefix, /^[a-z0-9-]+$/);
      assert.equal(likeLiteralPrefix(prefix), `${prefix}%`);
    }
  });

  it("casePrefix rejects a case id with LIKE wildcards or spaces", () => {
    assert.throws(() => casePrefix("p6-qa-x", "extra_s1"), /TEST BUG/);
    assert.throws(() => casePrefix("p6-qa-x", "extra 50%"), /TEST BUG/);
  });

  it("caseLeakPattern only matches its own case", () => {
    const run = "p6-qa-20261018T143056Z-0a1b2c3d";
    const pattern = caseLeakPattern(run, "extra-s1-n2");
    assert.equal(pattern, "p6-qa-20261018t143056z-0a1b2c3d-extra-s1-n2-%");
    const own = prefixedHandle(casePrefix(run, "extra-s1-n2"), "t1-product");
    const other = prefixedHandle(casePrefix(run, "extra-s0-n5"), "t1-product");
    const likeStart = pattern.slice(0, -1);
    assert.ok(own.startsWith(likeStart));
    assert.ok(!other.startsWith(likeStart));
  });

  it("cleanupFailure names the row and the error as a TEST BUG", () => {
    assert.equal(
      cleanupFailure("customer", "p6-qa-x-case-t1-c00@qa.local", new Error("HTTP 400")),
      "TEST BUG: customer cleanup failed for p6-qa-x-case-t1-c00@qa.local: HTTP 400",
    );
    const long = cleanupFailure("customer", "a@qa.local", "x".repeat(300));
    assert.equal(long, `TEST BUG: customer cleanup failed for a@qa.local: ${"x".repeat(200)}`);
  });

  it("captureBody carries only the amount", () => {
    assert.deepEqual(captureBody(1010), { amount: 1010 });
  });

  it("refundBody carries only the amount", () => {
    assert.deepEqual(refundBody(505), { amount: 505 });
  });

  it("promoCode is the lowercase case prefix, the leaf and -code", () => {
    assert.equal(
      promoCode("P6-QA-X-P6-MED-RACE-005", "t01a1"),
      "p6-qa-x-p6-med-race-005-t01a1-code",
    );
  });

  it("promoCode throws a TEST BUG for a character outside [a-z0-9-]", () => {
    assert.throws(() => promoCode("p6-qa-x", "t1_a"), /TEST BUG: promo code/);
  });

  it("campaignCreateBody has a usage budget and no currency", () => {
    assert.deepEqual(campaignCreateBody("id", 3), {
      name: "id",
      campaign_identifier: "id",
      budget: { type: "usage", limit: 3 },
    });
  });

  it("promotionCreateBody carries either a usage limit or a campaign id", () => {
    const limited: Record<string, unknown> = promotionCreateBody("c", { limit: 3 });
    assert.equal(limited.limit, 3);
    assert.equal("campaign_id" in limited, false);
    const budgeted: Record<string, unknown> = promotionCreateBody("c", { campaignId: "camp" });
    assert.equal(budgeted.campaign_id, "camp");
    assert.equal("limit" in budgeted, false);
  });

  it("fulfillmentBody names one item and the stock location", () => {
    assert.deepEqual(fulfillmentBody("li", 1, "loc"), {
      items: [{ id: "li", quantity: 1 }],
      location_id: "loc",
    });
  });
});

describe("attemptEmailLike (F-M5 sweep)", () => {
  it("matches the emails of one attempt and no other attempt", () => {
    const pattern = attemptEmailLike("P6-RUN-MED-001", "t0a1");
    assert.equal(pattern, "p6-run-med-001-t0a1-c%");
    const email = prefixedEmail("P6-RUN-MED-001", "t0a1-c00");
    assert.equal(email.startsWith(pattern.slice(0, -1)), true);
    assert.equal(
      prefixedEmail("P6-RUN-MED-001", "t0a10-c00").startsWith(pattern.slice(0, -1)),
      false,
    );
  });
});
