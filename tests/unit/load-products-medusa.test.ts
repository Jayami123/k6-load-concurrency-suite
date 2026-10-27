import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type pg from "pg";
import { deleteCustomersByPrefix } from "../../src/medusa/admin.ts";
import {
  medusaCleanupWith,
  medusaSetupWith,
  type MedusaDeps,
} from "../../src/load/products/medusa.ts";
import type { LoadContext } from "../../src/load/types.ts";
import { kneePlanFor, medKneeDefaultsFor } from "../../src/load/knee/plan-input.ts";
import { stockForKnee } from "../../src/load/knee/med-stock.ts";

const CATALOG = {
  token: "tok-1",
  publishableKey: "pk_test",
  regionId: "reg_1",
  salesChannelId: "sc_1",
  locationId: "loc_1",
  shippingProfileId: "sp_1",
};

function fakeCtx(): LoadContext {
  return {
    caseDef: { id: "P6-MED-LOAD-001" },
    profile: { rate: 2, durationSec: 30, maxLatencyMs: 4000 },
    runPrefix: "p6-qa-20261024T010203Z-3fa9c0d1",
    config: {},
    secrets: {},
  } as unknown as LoadContext;
}

/** A pool whose order-id query returns the given orders; every other query returns one zero count (no leak). */
function fakePool(orders: Array<{ id: string }>): { pool: pg.Pool; params: unknown[][] } {
  const params: unknown[][] = [];
  const query = async (sql: string, values: unknown[]) => {
    params.push(values);
    if (sql.includes("reservation_item")) return { rows: [] }; // no leaked reservation in these cases
    return { rows: sql.includes('FROM "order"') ? orders : [{ n: 0 }] };
  };
  return { pool: { query, end: async () => {} } as unknown as pg.Pool, params };
}

function deps(overrides: Partial<MedusaDeps>): MedusaDeps {
  return {
    openPool: () => fakePool([]).pool,
    seed: async () => "tok-1",
    catalog: async () => CATALOG,
    stock: async () => ({
      productId: "prod_1",
      variantId: "var_1",
      inventoryItemId: "ii_1",
      title: "t",
    }),
    cancelAndArchive: async () => {},
    deleteProduct: async () => {},
    deleteRunReservation: async () => {},
    deleteCustomersByPrefix: async () => 0,
    ...overrides,
  };
}

describe("medusa product setup and cleanup", () => {
  it("the stock is planned + 20", async () => {
    const seen: number[] = [];
    const ctx = fakeCtx();
    const out = await medusaSetupWith(
      ctx,
      deps({
        stock: async (input) => {
          seen.push(input.s);
          return { productId: "prod_1", variantId: "var_1", inventoryItemId: "ii_1", title: "t" };
        },
      }),
    );
    assert.equal(out.ok, true);
    assert.deepEqual(seen, [80]);
    assert.equal(ctx.config.variantId, "var_1");
  });

  it("stockFor decides the variant\'s stock and ctx.config.stock", async () => {
    const seen: number[] = [];
    const ctx = fakeCtx();
    const out = await medusaSetupWith(
      ctx,
      deps({
        stock: async (input) => {
          seen.push(input.s);
          return { productId: "prod_1", variantId: "var_1", inventoryItemId: "ii_1", title: "t" };
        },
      }),
      (planned) => Math.ceil(planned / 2),
    );
    assert.equal(out.ok, true);
    assert.deepEqual(seen, [30]);
    assert.equal(ctx.config.stock, 30);
  });

  it("the customer sweep pages and deletes only emails that start with the prefix", async () => {
    const prefix = "p6-qa-x-";
    // 5 emails contain the prefix but do not start with it (kept); 110 start with it (deleted); 10 are unrelated (never listed).
    const customers: Array<{ id: string; email: string }> = [
      ...Array.from({ length: 5 }, (_, i) => ({
        id: `old-${i}`,
        email: `old-${prefix}${i}@y.test`,
      })),
      ...Array.from({ length: 110 }, (_, i) => ({ id: `new-${i}`, email: `${prefix}${i}@y.test` })),
      ...Array.from({ length: 10 }, (_, i) => ({ id: `other-${i}`, email: `other${i}@y.test` })),
    ];
    const original = globalThis.fetch;
    const requests: string[] = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      requests.push(`${init?.method ?? "GET"} ${url}`);
      if ((init?.method ?? "GET") === "DELETE") {
        const id = url.split("/").pop() ?? "";
        const at = customers.findIndex((c) => c.id === id);
        if (at >= 0) customers.splice(at, 1);
        return new Response("{}", { status: 200 });
      }
      const q = decodeURIComponent(new URL(url).searchParams.get("q") ?? "");
      const offset = Number(new URL(url).searchParams.get("offset") ?? 0);
      const matches = customers.filter((c) => c.email.includes(q));
      return new Response(JSON.stringify({ customers: matches.slice(offset, offset + 100) }), {
        status: 200,
      });
    }) as typeof fetch;
    try {
      const deleted = await deleteCustomersByPrefix("tok", prefix);
      assert.equal(deleted, 110);
      assert.equal(customers.length, 15);
      assert.ok(customers.every((c) => !c.email.startsWith(prefix)));
      assert.ok(
        requests.some((r) => r.includes("offset=5")),
        "the second page starts past the kept customers",
      );
    } finally {
      globalThis.fetch = original;
    }
  });

  it("the live orders are swept by the email prefix", async () => {
    const { pool, params } = fakePool([{ id: "order_1" }, { id: "order_2" }]);
    const cancelled: Array<[string, string]> = [];
    const ctx = fakeCtx();
    ctx.secrets.MEDUSA_ADMIN_TOKEN = "tok-1";
    ctx.config.productId = "prod_1";
    ctx.config.inventoryItemId = "ii_1";
    const out = await medusaCleanupWith(
      ctx,
      deps({
        openPool: () => pool,
        cancelAndArchive: async (token, id) => {
          cancelled.push([token, id]);
        },
      }),
    );
    assert.deepEqual(cancelled, [
      ["tok-1", "order_1"],
      ["tok-1", "order_2"],
    ]);
    assert.ok(
      params.some((p) => p[0] === "p6-qa-20261024t010203z-3fa9c0d1-p6-med-load-001%"),
      "the order query uses the case prefix as an email LIKE pattern",
    );
    assert.equal(out.ok, true);
  });

  it("the admin token goes to ctx.secrets and never to ctx.config", async () => {
    const ctx = fakeCtx();
    const out = await medusaSetupWith(ctx, deps({}));
    assert.equal(out.ok, true);
    assert.equal(ctx.secrets.MEDUSA_ADMIN_TOKEN, "tok-1");
    assert.doesNotMatch(JSON.stringify(ctx.config), /tok-1/);
  });

  it("a failed delete becomes a TEST BUG line and the sweep goes on", async () => {
    const ctx = fakeCtx();
    ctx.secrets.MEDUSA_ADMIN_TOKEN = "tok-1";
    ctx.config.productId = "prod_1";
    let customersSwept = false;
    const out = await medusaCleanupWith(
      ctx,
      deps({
        openPool: () => fakePool([]).pool,
        deleteProduct: async () => {
          throw new Error("boom");
        },
        deleteCustomersByPrefix: async () => {
          customersSwept = true;
          return 0;
        },
      }),
    );
    assert.equal(out.ok, false);
    assert.equal(out.kind, "TEST BUG");
    assert.deepEqual(out.reasons, ["TEST BUG: cleanup product failed: boom"]);
    assert.equal(customersSwept, true);
  });

  it("a later failure keeps the product id the first stock callback recorded, so cleanup can delete it", async () => {
    const ctx = fakeCtx();
    const result = await medusaSetupWith(
      ctx,
      deps({
        stock: async (input) => {
          // createStockedVariant calls onCreated twice: once with the product id, once with the inventory item id.
          input.onCreated?.({ productId: "prod_9" });
          input.onCreated?.({ inventoryItemId: "ii_9" });
          throw new Error("TEST BUG: location level step failed");
        },
      }),
    );
    assert.equal(result.ok, false);
    assert.equal(ctx.config.productId, "prod_9");
  });
});

describe("medusa knee stock from the context", () => {
  it("stockFor receives the context, and a knee sizes the stock from its plan (622 for the default plan)", async () => {
    const seen: number[] = [];
    const ctx = { ...fakeCtx(), profileName: "full", env: {} } as unknown as LoadContext;
    const out = await medusaSetupWith(
      ctx,
      deps({
        stock: async (input) => {
          seen.push(input.s);
          return { productId: "prod_1", variantId: "var_1", inventoryItemId: "ii_1", title: "t" };
        },
      }),
      (_planned, c) => stockForKnee(kneePlanFor(c, medKneeDefaultsFor)),
    );
    assert.equal(out.ok, true);
    assert.deepEqual(seen, [622]);
    assert.equal(ctx.config.stock, 622);
  });

  it("the old callers still get planned + 20 and any other rule of planned alone", async () => {
    const seen: number[] = [];
    const ctx = fakeCtx();
    await medusaSetupWith(
      ctx,
      deps({
        stock: async (input) => {
          seen.push(input.s);
          return { productId: "prod_1", variantId: "var_1", inventoryItemId: "ii_1", title: "t" };
        },
      }),
      (planned) => Math.ceil(planned / 2),
    );
    assert.deepEqual(seen, [30]);
  });
});
