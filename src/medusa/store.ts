import { medusaBaseUrlFromEnv } from "../races/env.ts";
import {
  STORE_ADDRESS,
  cartCreateBody,
  lineItemBody,
  paymentSessionBody,
  setupStepError,
} from "./payloads.ts";

async function storeRaw(
  path: string,
  publishableKey: string,
  init?: { method?: string; body?: unknown },
): Promise<{ status: number; text: string }> {
  const base = medusaBaseUrlFromEnv();
  const res = await fetch(`${base}/store${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "x-publishable-api-key": publishableKey,
    },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  return { status: res.status, text: await res.text() };
}

function throwIfSetupFailed(step: string, status: number): void {
  const error = setupStepError(step, status);
  if (error) throw new Error(error);
}

async function storeJson(
  path: string,
  publishableKey: string,
  init?: { method?: string; body?: unknown },
): Promise<{ status: number; text: string; json: unknown }> {
  const res = await storeRaw(path, publishableKey, init);
  const text = res.text;
  let json: unknown = {};
  if (text) {
    try {
      json = JSON.parse(text) as unknown;
    } catch {
      json = {};
    }
  }
  if (res.status >= 500) {
    throw new Error(`PRODUCT BUG: store ${path} HTTP ${res.status}`);
  }
  return { status: res.status, text, json };
}

export async function prepareReadyCart(input: {
  publishableKey: string;
  regionId: string;
  salesChannelId: string;
  variantId: string;
  email: string;
  quantity: number;
}): Promise<{
  cartId: string;
  lineItemStatus: number;
  lineItemType: string | null;
  lineItemMessage: string | null;
}> {
  const create = await storeJson("/carts", input.publishableKey, {
    method: "POST",
    body: cartCreateBody(input.regionId, input.email, input.salesChannelId),
  });
  if (create.status !== 200) {
    throw new Error(`TEST BUG: POST /store/carts HTTP ${create.status}`);
  }
  const cartId = (create.json as { cart?: { id?: string } }).cart?.id;
  if (!cartId) {
    throw new Error("TEST BUG: cart id missing");
  }

  const line = await storeJson(`/carts/${cartId}/line-items`, input.publishableKey, {
    method: "POST",
    body: lineItemBody(input.variantId, input.quantity),
  });
  const lineJson = line.json as { type?: string; message?: string };
  const lineItemType = line.status !== 200 ? (lineJson.type ?? null) : null;
  const lineItemMessage = line.status !== 200 ? (lineJson.message ?? null) : null;

  if (line.status === 200) {
    const update = await storeJson(`/carts/${cartId}`, input.publishableKey, {
      method: "POST",
      body: {
        email: input.email,
        shipping_address: STORE_ADDRESS,
        billing_address: STORE_ADDRESS,
      },
    });
    throwIfSetupFailed("POST /store/carts/:id", update.status);

    const shipping = await storeJson(`/shipping-options?cart_id=${cartId}`, input.publishableKey);
    throwIfSetupFailed("GET /store/shipping-options", shipping.status);
    const options =
      (shipping.json as { shipping_options?: Array<{ id?: string; name?: string }> })
        .shipping_options ?? [];
    const standard = options.find((o) => o.name === "Standard Shipping");
    if (!standard?.id) {
      throw new Error("TEST BUG: Standard Shipping option not found");
    }
    const method = await storeJson(`/carts/${cartId}/shipping-methods`, input.publishableKey, {
      method: "POST",
      body: { option_id: standard.id },
    });
    throwIfSetupFailed("POST /store/carts/:id/shipping-methods", method.status);

    const payCol = await storeJson("/payment-collections", input.publishableKey, {
      method: "POST",
      body: { cart_id: cartId },
    });
    throwIfSetupFailed("POST /store/payment-collections", payCol.status);
    const payColId = (payCol.json as { payment_collection?: { id?: string } }).payment_collection
      ?.id;
    if (!payColId) {
      throw new Error("TEST BUG: payment_collection id missing");
    }
    const session = await storeJson(
      `/payment-collections/${payColId}/payment-sessions`,
      input.publishableKey,
      { method: "POST", body: paymentSessionBody() },
    );
    throwIfSetupFailed("POST /store/payment-collections/:id/payment-sessions", session.status);
  }

  return {
    cartId,
    lineItemStatus: line.status,
    lineItemType,
    lineItemMessage,
  };
}

export async function prepareReadyCarts(
  n: number,
  makeInput: (i: number) => Parameters<typeof prepareReadyCart>[0],
) {
  return Promise.all(Array.from({ length: n }, (_, i) => prepareReadyCart(makeInput(i))));
}

/** Raced call: never throws on 5xx so the histogram records the real status and body. */
export async function completeCart(publishableKey: string, cartId: string) {
  const res = await storeRaw(`/carts/${cartId}/complete`, publishableKey, { method: "POST" });
  return { status: res.status, body: res.text };
}
