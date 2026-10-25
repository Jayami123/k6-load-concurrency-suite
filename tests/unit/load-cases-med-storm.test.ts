import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { medusaSetupWith, type MedusaDeps } from "../../src/load/products/medusa.ts";
import { judgeStorm, STORM_SHARE } from "../../src/load/retry-validity.ts";
import type { LoadContext } from "../../src/load/types.ts";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("P6-MED-LOAD-006 storm configuration (regression, plan PRE-1)", () => {
  it("the setup measures the storm timeout, the judge still refuses a 3-of-30 storm, and the script reads the key", async () => {
    const ctx = {
      caseDef: { id: "P6-MED-LOAD-006" },
      profile: { rate: 1, durationSec: 10, maxLatencyMs: 6000 },
      runPrefix: "p6-qa-20261025T090121Z-c53f65ef",
      config: {},
      secrets: {},
    } as unknown as LoadContext;
    const deps: MedusaDeps = {
      openPool: () => {
        throw new Error("not used");
      },
      seed: async () => "tok-1",
      catalog: async () => ({
        token: "tok-1",
        publishableKey: "pk_test",
        regionId: "reg_1",
        salesChannelId: "sc_1",
        locationId: "loc_1",
        shippingProfileId: "sp_1",
      }),
      stock: async (input) => {
        input.onCreated?.({ productId: `prod_${input.leaf}` });
        return {
          productId: `prod_${input.leaf}`,
          variantId: `var_${input.leaf}`,
          inventoryItemId: "ii_1",
          title: "t",
        };
      },
      cancelAndArchive: async () => {},
      deleteProduct: async () => {},
      deleteCustomersByPrefix: async () => 0,
      prepareCart: async () => ({
        cartId: "cart_1",
        lineItemStatus: 200,
        lineItemType: null,
        lineItemMessage: null,
      }),
      complete: async () => {
        await sleep(100);
        return { status: 200, body: JSON.stringify({ order: { id: "ord_1" } }) };
      },
    };

    const setup = await medusaSetupWith(ctx, deps, (planned) => planned + 20, 3);
    assert.equal(setup.ok, true, setup.reasons.join("; "));
    assert.equal(ctx.config.stock, 30, "the case stock is planned + 20, unchanged by the probe");
    const timeout = ctx.config.stormTimeoutMs as number;
    assert.ok(timeout >= 25 && timeout <= 30, `a quarter of a ~100 ms complete, got ${timeout}`);

    assert.equal(STORM_SHARE, 0.5);
    assert.equal(judgeStorm({ intents: 30, firstTimeouts: 3, retries: 3 }).ok, false);

    const script = readFileSync("k6/cases/med-load-006.js", "utf8");
    assert.match(script, /stormTimeoutMs: cfg\.stormTimeoutMs \?\? 100,/);
    const example = JSON.parse(
      readFileSync("k6/cases/med-load-006.example.json", "utf8"),
    ) as Record<string, unknown>;
    assert.equal(example.stormTimeoutMs, 100);
  });
});
