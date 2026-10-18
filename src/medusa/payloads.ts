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
