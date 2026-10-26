import { getAdapter } from "qa-portfolio-harness";
import {
  medusaBaseUrlFromEnv,
  medusaAdminEmailFromEnv,
  medusaAdminPasswordFromEnv,
} from "../races/env.ts";
import {
  adminLoginFailure,
  medusaAdminPasswordFile,
  resolveAdminPassword,
} from "./admin-password.ts";
import {
  campaignCreateBody,
  captureBody,
  fulfillmentBody,
  productCreateBody,
  prefixedHandle,
  promotionCreateBody,
  refundBody,
} from "./payloads.ts";

export interface MedusaCatalog {
  token: string;
  publishableKey: string;
  regionId: string;
  salesChannelId: string;
  locationId: string;
  shippingProfileId: string;
}

type JsonResult = { status: number; json: unknown };

async function adminJson(
  path: string,
  token: string,
  init?: { method?: string; body?: unknown },
): Promise<JsonResult> {
  const base = medusaBaseUrlFromEnv();
  const res = await fetch(`${base}/admin${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  let json: unknown = {};
  if (text) {
    try {
      json = JSON.parse(text) as unknown;
    } catch {
      json = { raw: text.slice(0, 200) };
    }
  }
  if (res.status === 401) {
    throw new Error(`TEST BUG: admin ${path} HTTP 401 (check MEDUSA_ADMIN_EMAIL/PASSWORD)`);
  }
  if (res.status >= 500) {
    throw new Error(`PRODUCT BUG: admin ${path} HTTP ${res.status}`);
  }
  return { status: res.status, json };
}

function pickName<T extends { name?: string; id?: string }>(
  rows: T[],
  name: string,
  label: string,
): T {
  const found = rows.find((r) => r.name === name);
  if (!found?.id) {
    throw new Error(`TEST BUG: ${label} "${name}" not found`);
  }
  return found;
}

export async function seedAndLogin(): Promise<string> {
  const file = medusaAdminPasswordFile();
  const credential = resolveAdminPassword(file, process.env.MEDUSA_ADMIN_PASSWORD);
  const { password } = credential;
  // The harness reads its config on the first getAdapter call, so the credentials must be in the environment before it.
  process.env.MEDUSA_ADMIN_PASSWORD = password;
  process.env.MEDUSA_ADMIN_EMAIL ??= "admin@qa.local";
  const adapter = getAdapter("medusa");
  await adapter.seed();
  const email = medusaAdminEmailFromEnv();
  const res = await fetch(`${medusaBaseUrlFromEnv()}/auth/user/emailpass`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ email, password: medusaAdminPasswordFromEnv() }),
  });
  if (res.status === 401) throw new Error(adminLoginFailure(res.status, file, credential));
  const json = (await res.json()) as { token?: string };
  if (res.status !== 200 || !json.token) {
    throw new Error(`TEST BUG: POST /auth/user/emailpass HTTP ${res.status}`);
  }
  return json.token;
}

export async function loadCatalog(token: string): Promise<MedusaCatalog> {
  const keysRes = await adminJson("/api-keys?limit=50&fields=*sales_channels", token);
  const keys =
    (
      keysRes.json as {
        api_keys?: Array<{ type?: string; revoked_at?: string | null; token?: string }>;
      }
    ).api_keys ?? [];
  const publishable = keys.find((k) => k.type === "publishable" && k.revoked_at == null);
  if (!publishable?.token) {
    throw new Error("TEST BUG: publishable API key not found");
  }

  const regionsRes = await adminJson("/regions?limit=50&fields=*payment_providers", token);
  const regions =
    (regionsRes.json as { regions?: Array<{ id?: string; name?: string; currency_code?: string }> })
      .regions ?? [];
  const europe = regions.find((r) => r.name === "Europe" && r.currency_code === "eur");
  if (!europe?.id) {
    throw new Error("TEST BUG: Europe region not found");
  }

  const scRes = await adminJson("/sales-channels?limit=20", token);
  const channels =
    (scRes.json as { sales_channels?: Array<{ id?: string; name?: string }> }).sales_channels ?? [];
  const salesChannel = pickName(channels, "Default Sales Channel", "sales channel");

  const locRes = await adminJson("/stock-locations?limit=50&fields=*sales_channels", token);
  const locations =
    (locRes.json as { stock_locations?: Array<{ id?: string; name?: string }> }).stock_locations ??
    [];
  const location = pickName(locations, "European Warehouse", "stock location");

  const profRes = await adminJson("/shipping-profiles?limit=20", token);
  const profiles =
    (profRes.json as { shipping_profiles?: Array<{ id?: string; name?: string }> })
      .shipping_profiles ?? [];
  const profile = pickName(profiles, "Default Shipping Profile", "shipping profile");

  return {
    token,
    publishableKey: publishable.token,
    regionId: europe.id,
    salesChannelId: salesChannel.id!,
    locationId: location.id!,
    shippingProfileId: profile.id!,
  };
}

export async function createStockedVariant(input: {
  token: string;
  catalog: MedusaCatalog;
  prefix: string;
  leaf: string;
  s: number;
  /** Called as soon as each id exists, so cleanup learns it even if a later step throws. */
  onCreated?: (ids: { productId?: string; inventoryItemId?: string }) => void;
}): Promise<{ productId: string; variantId: string; inventoryItemId: string; title: string }> {
  const handle = prefixedHandle(input.prefix, input.leaf);
  const sku = `${handle}-sku`;
  const title = `${handle}-oversell`;
  const createRes = await adminJson("/products", input.token, {
    method: "POST",
    body: productCreateBody({
      title,
      handle,
      sku,
      shippingProfileId: input.catalog.shippingProfileId,
      salesChannelId: input.catalog.salesChannelId,
    }),
  });
  if (createRes.status !== 200) {
    throw new Error(`TEST BUG: POST /admin/products HTTP ${createRes.status}`);
  }
  const product = (createRes.json as { product?: { id?: string } }).product;
  if (!product?.id) {
    throw new Error("TEST BUG: product id missing from create response");
  }
  input.onCreated?.({ productId: product.id });

  const detailRes = await adminJson(
    `/products/${product.id}?fields=*variants,*variants.inventory_items`,
    input.token,
  );
  const variants = (
    detailRes.json as {
      product?: {
        variants?: Array<{ id?: string; inventory_items?: Array<{ inventory_item_id?: string }> }>;
      };
    }
  ).product?.variants;
  const variantId = variants?.[0]?.id;
  const inventoryItemId = variants?.[0]?.inventory_items?.[0]?.inventory_item_id;
  if (inventoryItemId) {
    input.onCreated?.({ inventoryItemId });
  }
  if (!variantId || !inventoryItemId) {
    throw new Error("TEST BUG: variant or inventory_item_id missing");
  }

  const levelRes = await adminJson(
    `/inventory-items/${inventoryItemId}/location-levels`,
    input.token,
    {
      method: "POST",
      body: { location_id: input.catalog.locationId, stocked_quantity: input.s },
    },
  );
  if (levelRes.status !== 200) {
    throw new Error(`TEST BUG: POST location-levels HTTP ${levelRes.status}`);
  }

  return { productId: product.id, variantId, inventoryItemId, title };
}

export async function cancelAndArchive(token: string, orderId: string): Promise<void> {
  const cancel = await adminJson(`/orders/${orderId}/cancel`, token, { method: "POST", body: {} });
  if (cancel.status !== 200 && cancel.status !== 400) {
    throw new Error(`TEST BUG: cancel order ${orderId} HTTP ${cancel.status}`);
  }
  const archive = await adminJson(`/orders/${orderId}/archive`, token, {
    method: "POST",
    body: {},
  });
  if (archive.status !== 200) {
    throw new Error(`TEST BUG: archive order ${orderId} HTTP ${archive.status}`);
  }
}

export async function deleteProduct(token: string, productId: string): Promise<void> {
  const res = await adminJson(`/products/${productId}`, token, { method: "DELETE" });
  if (res.status !== 200) {
    throw new Error(`TEST BUG: DELETE product ${productId} HTTP ${res.status}`);
  }
}

export async function deleteCustomersByEmail(token: string, email: string): Promise<void> {
  const list = await adminJson(`/customers?q=${encodeURIComponent(email)}&limit=5`, token);
  const customers =
    (list.json as { customers?: Array<{ id?: string; email?: string }> }).customers ?? [];
  for (const customer of customers) {
    if (customer.email?.toLowerCase() === email.toLowerCase() && customer.id) {
      const del = await adminJson(`/customers/${customer.id}`, token, { method: "DELETE" });
      if (del.status !== 200) {
        throw new Error(`TEST BUG: DELETE customer ${customer.id} HTTP ${del.status}`);
      }
    }
  }
}

export type MoneyResult = { status: number; body: string };

/**
 * Raced or cleanup POST: never throws on 4xx or 5xx, so fireTogether records the real status and body.
 * The admin base path is the same as adminJson's.
 */
async function rawPost(path: string, token: string, body: unknown): Promise<MoneyResult> {
  const res = await fetch(`${medusaBaseUrlFromEnv()}/admin${path}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.text() };
}

export function capturePayment(token: string, paymentId: string, amount: number) {
  return rawPost(`/payments/${paymentId}/capture`, token, captureBody(amount));
}

export function refundPayment(token: string, paymentId: string, amount: number) {
  return rawPost(`/payments/${paymentId}/refund`, token, refundBody(amount));
}

/**
 * Confirms the pending order change of an order (live, §2.5b candidate A: 200, pending to confirmed).
 * Called only when the database shows a pending change.
 */
export function confirmPendingOrderChange(token: string, orderId: string) {
  return rawPost(`/order-edits/${orderId}/confirm`, token, {});
}

export async function createCampaign(
  token: string,
  identifier: string,
  limit: number,
): Promise<string> {
  const res = await adminJson("/campaigns", token, {
    method: "POST",
    body: campaignCreateBody(identifier, limit),
  });
  const id = (res.json as { campaign?: { id?: string } }).campaign?.id;
  if (res.status !== 200 || !id) {
    throw new Error(`TEST BUG: POST /admin/campaigns HTTP ${res.status}`);
  }
  return id;
}

export async function createPromotion(
  token: string,
  code: string,
  cap: { campaignId: string } | { limit: number },
): Promise<string> {
  const res = await adminJson("/promotions", token, {
    method: "POST",
    body: promotionCreateBody(code, cap),
  });
  const id = (res.json as { promotion?: { id?: string } }).promotion?.id;
  if (res.status !== 200 || !id) {
    throw new Error(`TEST BUG: POST /admin/promotions HTTP ${res.status}`);
  }
  return id;
}

export async function deletePromotion(token: string, id: string): Promise<void> {
  const res = await adminJson(`/promotions/${id}`, token, { method: "DELETE" });
  if (res.status !== 200) {
    throw new Error(`TEST BUG: DELETE promotion ${id} HTTP ${res.status}`);
  }
}

/** The campaign's budget row stays after the delete (live, plan §2.1 Q7); that is expected. */
export async function deleteCampaign(token: string, id: string): Promise<void> {
  const res = await adminJson(`/campaigns/${id}`, token, { method: "DELETE" });
  if (res.status !== 200) {
    throw new Error(`TEST BUG: DELETE campaign ${id} HTTP ${res.status}`);
  }
}

/** Raced. */
export function cancelOrder(token: string, orderId: string) {
  return rawPost(`/orders/${orderId}/cancel`, token, {});
}

/** Raced. */
export function createFulfillment(
  token: string,
  orderId: string,
  itemId: string,
  locationId: string,
) {
  return rawPost(`/orders/${orderId}/fulfillments`, token, fulfillmentBody(itemId, 1, locationId));
}

export function cancelFulfillment(token: string, orderId: string, fulfillmentId: string) {
  return rawPost(`/orders/${orderId}/fulfillments/${fulfillmentId}/cancel`, token, {});
}

export async function archiveOrder(token: string, orderId: string): Promise<void> {
  const res = await adminJson(`/orders/${orderId}/archive`, token, { method: "POST", body: {} });
  if (res.status !== 200) {
    throw new Error(`TEST BUG: archive order ${orderId} HTTP ${res.status}`);
  }
}

/** Returns the status (live 200). The caller decides what a non-200 means. */
export async function deleteReservation(token: string, id: string): Promise<number> {
  const res = await adminJson(`/reservations/${id}`, token, { method: "DELETE" });
  return res.status;
}

/**
 * Deletes every customer whose email starts with the prefix. The search (`q`) matches more than the prefix, so the email
 * test is the filter. Pages of 100; the offset advances only past the customers kept, because a delete shifts the page.
 * Returns the number deleted.
 */
export async function deleteCustomersByPrefix(token: string, prefix: string): Promise<number> {
  const wanted = prefix.toLowerCase();
  let deleted = 0;
  let offset = 0;
  for (let page = 0; page < 20; page += 1) {
    const list = await adminJson(
      `/customers?q=${encodeURIComponent(prefix)}&limit=100&offset=${offset}`,
      token,
    );
    if (list.status !== 200) throw new Error(`TEST BUG: list customers HTTP ${list.status}`);
    const customers =
      (list.json as { customers?: Array<{ id?: string; email?: string }> }).customers ?? [];
    if (customers.length === 0) break;
    let kept = 0;
    for (const customer of customers) {
      if (customer.id && customer.email?.toLowerCase().startsWith(wanted)) {
        const del = await adminJson(`/customers/${customer.id}`, token, { method: "DELETE" });
        if (del.status !== 200) throw new Error(`TEST BUG: DELETE customer HTTP ${del.status}`);
        deleted += 1;
      } else {
        kept += 1;
      }
    }
    if (customers.length < 100) break;
    offset += kept;
  }
  return deleted;
}
