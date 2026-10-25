import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { medusaSetupWith, type MedusaDeps } from "../../src/load/products/medusa.ts";
import { judgeStorm, STORM_SHARE } from "../../src/load/retry-validity.ts";
import type { LoadContext } from "../../src/load/types.ts";

/** The setup of P6-MED-LOAD-006 with a fake clock: each complete call takes exactly the given ms, so m is the minimum of them. */
async function stormTimeoutFor(completeMs: number[]): Promise<{ timeout: number; min: number }> {
  let clock = 0;
  let call = 0;
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
      clock += completeMs[call++]!;
      return { status: 200, body: JSON.stringify({ order: { id: `ord_${call}` } }) };
    },
    now: () => clock,
  };
  const setup = await medusaSetupWith(ctx, deps, (planned) => planned + 20, completeMs.length);
  assert.equal(setup.ok, true, setup.reasons.join("; "));
  return {
    timeout: (ctx.config as { stormTimeoutMs: number }).stormTimeoutMs,
    min: (ctx.config as { stormMinCompleteMs: number }).stormMinCompleteMs,
  };
}

describe("P6-MED-LOAD-006 storm configuration (regression, plan PRE-1)", () => {
  it("the storm timeout is exactly a quarter of the fastest probe complete, clamped to 5..100 ms", async () => {
    const cases: Array<{ complete: number[]; min: number; timeout: number }> = [
      { complete: [120, 91, 150], min: 91, timeout: 22 }, // the measured runner value: floor(91 / 4)
      { complete: [100, 200, 300], min: 100, timeout: 25 }, // exact quarter
      { complete: [103.9, 110, 140], min: 103.9, timeout: 25 }, // rounded down, not up
      { complete: [399, 500, 600], min: 399, timeout: 99 }, // just under the top clamp
      { complete: [400, 400, 400], min: 400, timeout: 100 }, // the top clamp edge
      { complete: [2000, 3000, 4000], min: 2000, timeout: 100 }, // above the top clamp
      { complete: [20, 30, 40], min: 20, timeout: 5 }, // the bottom clamp edge: floor(20 / 4) = 5
      { complete: [4, 8, 9], min: 4, timeout: 5 }, // below the bottom clamp
    ];
    for (const c of cases) {
      const got = await stormTimeoutFor(c.complete);
      assert.deepEqual(
        got,
        { timeout: c.timeout, min: c.min },
        `complete ${c.complete.join("/")} ms`,
      );
    }
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
