export const EUR_UNIT_PRICE = 1000;

export function productCreateBody(input: {
  title: string;
  handle: string;
  sku: string;
  shippingProfileId: string;
  salesChannelId: string;
}): Record<string, unknown> {
  return {
    title: input.title,
    handle: input.handle,
    status: "published",
    shipping_profile_id: input.shippingProfileId,
    sales_channels: [{ id: input.salesChannelId }],
    options: [{ title: "Default", values: ["Default"] }],
    variants: [
      {
        title: "Default",
        sku: input.sku,
        manage_inventory: true,
        allow_backorder: false,
        options: { Default: "Default" },
        prices: [{ currency_code: "eur", amount: EUR_UNIT_PRICE }],
      },
    ],
  };
}

export const STORE_ADDRESS = {
  first_name: "P6",
  last_name: "QA",
  address_1: "Teststr 1",
  city: "Berlin",
  country_code: "de",
  postal_code: "10115",
} as const;

export function cartCreateBody(regionId: string, email: string, salesChannelId: string) {
  return { region_id: regionId, email, sales_channel_id: salesChannelId };
}

export function lineItemBody(variantId: string, quantity: number) {
  return { variant_id: variantId, quantity };
}

export function paymentSessionBody() {
  return { provider_id: "pp_system_default" };
}

export function prefixedEmail(prefix: string, leaf: string): string {
  return `${prefix.toLowerCase()}-${leaf}@qa.local`;
}

export function prefixedHandle(prefix: string, leaf: string): string {
  return `${prefix.toLowerCase()}-${leaf}`;
}

/**
 * Per-case data prefix: lowercased `${runPrefix}-${caseId}`. Every handle, SKU and email of one
 * case starts with it, so cases never share rows and the leak check only sees its own case.
 * Throws TEST BUG unless the result is [a-z0-9-].
 */
export function casePrefix(runPrefix: string, caseId: string): string {
  const prefix = `${runPrefix}-${caseId}`.toLowerCase();
  if (!/^[a-z0-9-]+$/.test(prefix)) {
    throw new Error(`TEST BUG: case prefix "${prefix}" is not [a-z0-9-]`);
  }
  return prefix;
}

/** Leak SQL LIKE argument for one case. The trailing "-" stops one case id matching another. */
export function caseLeakPattern(runPrefix: string, caseId: string): string {
  return likeLiteralPrefix(`${casePrefix(runPrefix, caseId)}-`);
}

/**
 * Email LIKE argument for the customers of one attempt (`prefixedEmail(dataPrefix, `${attemptLeaf}-c00`)`).
 * Matches that attempt's emails only: the "-c" after the attempt tag stops "t0a1" matching "t0a10".
 */
export function attemptEmailLike(dataPrefix: string, attemptLeaf: string): string {
  return likeLiteralPrefix(`${dataPrefix.toLowerCase()}-${attemptLeaf}-c`);
}

/** Leak SQL LIKE argument. Throws TEST BUG unless prefix is [a-z0-9-]. */
export function likeLiteralPrefix(prefix: string): string {
  if (!/^[a-z0-9-]+$/.test(prefix)) {
    throw new Error("TEST BUG: prefix is not a safe LIKE literal");
  }
  return `${prefix}%`;
}

/** Cart setup must succeed before the race; a failed step would look like a stock loser. */
export function setupStepError(step: string, status: number): string | null {
  return status === 200 ? null : `TEST BUG: cart setup ${step} HTTP ${status}`;
}

/** Leak-gate message for a QA-owned row the cleanup could not remove. Capped at 200 chars. */
export function cleanupFailure(kind: string, key: string, err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return `TEST BUG: ${kind} cleanup failed for ${key}: ${message.slice(0, 200)}`;
}

/** Body of POST /admin/payments/:id/capture. Live (§2.5 P2): { amount } returns 200 on success. */
export function captureBody(amount: number) {
  return { amount };
}

/** Body of POST /admin/payments/:id/refund. Live (§2.5 P2): { amount } returns 200 on success. */
export function refundBody(amount: number) {
  return { amount };
}

/** Promotion code for one attempt. Codes are case sensitive (live, plan §2.2), so always lowercase. */
export function promoCode(prefix: string, leaf: string): string {
  const code = `${prefix.toLowerCase()}-${leaf}-code`;
  if (!/^[a-z0-9-]+$/.test(code)) {
    throw new Error(`TEST BUG: promo code "${code}" is not [a-z0-9-]`);
  }
  return code;
}

/** Body of POST /admin/campaigns with a usage budget. Live: 200; a currency_code on a usage budget is a 400. */
export function campaignCreateBody(identifier: string, limit: number) {
  return { name: identifier, campaign_identifier: identifier, budget: { type: "usage", limit } };
}

/** Body of POST /admin/promotions: 10 % off the order in EUR, active; either a campaign or a usage limit. */
export function promotionCreateBody(code: string, cap: { campaignId: string } | { limit: number }) {
  return {
    code,
    type: "standard",
    status: "active",
    application_method: {
      type: "percentage",
      target_type: "order",
      value: 10,
      currency_code: "eur",
    },
    ...("campaignId" in cap ? { campaign_id: cap.campaignId } : { limit: cap.limit }),
  };
}

/** Body of POST /admin/orders/:id/fulfillments. Live: 200 with the checkout line item id and the stock location. */
export function fulfillmentBody(itemId: string, quantity: number, locationId: string) {
  return { items: [{ id: itemId, quantity }], location_id: locationId };
}
