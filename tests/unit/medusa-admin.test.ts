import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  cancelOrder,
  createCampaign,
  createStockedVariant,
  type MedusaCatalog,
} from "../../src/medusa/admin.ts";

const catalog: MedusaCatalog = {
  token: "t",
  publishableKey: "pk",
  regionId: "reg",
  salesChannelId: "sc",
  locationId: "loc",
  shippingProfileId: "sp",
};

const realFetch = globalThis.fetch;

/** Stub fetch: answers by "METHOD path" (query string dropped); anything else is a 404. */
function stubFetch(routes: Record<string, { status: number; body: unknown }>): void {
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const path = new URL(String(url)).pathname;
    const route = routes[`${init?.method ?? "GET"} ${path}`] ?? { status: 404, body: {} };
    return new Response(JSON.stringify(route.body), { status: route.status });
  }) as typeof fetch;
}

const created = { status: 200, body: { product: { id: "prod_1" } } };
const detail = {
  status: 200,
  body: {
    product: { variants: [{ id: "var_1", inventory_items: [{ inventory_item_id: "inv_1" }] }] },
  },
};

describe("createStockedVariant reports ids before later steps can throw", () => {
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("product id reaches cleanup when the detail GET fails", async () => {
    stubFetch({
      "POST /admin/products": created,
      "GET /admin/products/prod_1": { status: 500, body: {} },
    });
    const seen: Array<{ productId?: string; inventoryItemId?: string }> = [];
    await assert.rejects(
      createStockedVariant({
        token: "t",
        catalog,
        prefix: "p6-qa-x-case",
        leaf: "t1-product",
        s: 5,
        onCreated: (ids) => seen.push(ids),
      }),
      /PRODUCT BUG/,
    );
    assert.deepEqual(seen, [{ productId: "prod_1" }]);
  });

  it("product and inventory ids reach cleanup when setting stock fails", async () => {
    stubFetch({
      "POST /admin/products": created,
      "GET /admin/products/prod_1": detail,
      "POST /admin/inventory-items/inv_1/location-levels": { status: 400, body: {} },
    });
    const seen: Array<{ productId?: string; inventoryItemId?: string }> = [];
    await assert.rejects(
      createStockedVariant({
        token: "t",
        catalog,
        prefix: "p6-qa-x-case",
        leaf: "t1-product",
        s: 5,
        onCreated: (ids) => seen.push(ids),
      }),
      /TEST BUG: POST location-levels HTTP 400/,
    );
    assert.deepEqual(seen, [{ productId: "prod_1" }, { inventoryItemId: "inv_1" }]);
  });

  it("no callback when product create itself fails", async () => {
    stubFetch({ "POST /admin/products": { status: 400, body: {} } });
    const seen: unknown[] = [];
    await assert.rejects(
      createStockedVariant({
        token: "t",
        catalog,
        prefix: "p6-qa-x-case",
        leaf: "t1-product",
        s: 5,
        onCreated: (ids) => seen.push(ids),
      }),
      /TEST BUG: POST \/admin\/products HTTP 400/,
    );
    assert.deepEqual(seen, []);
  });
});

describe("promotion and order-state admin calls", () => {
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("createCampaign returns the campaign id on 200", async () => {
    stubFetch({
      "POST /admin/campaigns": { status: 200, body: { campaign: { id: "procamp_1" } } },
    });
    assert.equal(await createCampaign("t", "id", 3), "procamp_1");
  });

  it("createCampaign throws a TEST BUG on 400", async () => {
    stubFetch({ "POST /admin/campaigns": { status: 400, body: { message: "bad" } } });
    await assert.rejects(
      createCampaign("t", "id", 3),
      /TEST BUG: POST \/admin\/campaigns HTTP 400/,
    );
  });

  it("cancelOrder resolves a 400 instead of throwing", async () => {
    stubFetch({ "POST /admin/orders/o1/cancel": { status: 400, body: { message: "x" } } });
    const res = await cancelOrder("t", "o1");
    assert.equal(res.status, 400);
    assert.match(res.body, /"message":"x"/);
  });
});
