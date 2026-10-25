import type pg from "pg";
import { caseDataPrefix } from "../../../k6/lib/pure/prefix.js";
import {
  cancelAndArchive,
  createStockedVariant,
  deleteCustomersByPrefix,
  deleteProduct,
  loadCatalog,
  seedAndLogin,
  type MedusaCatalog,
} from "../../medusa/admin.ts";
import { LEAK_LIVE_ORDER_IDS_SQL, leakCheck } from "../../medusa/oracle.ts";
import { likeLiteralPrefix, prefixedEmail } from "../../medusa/payloads.ts";
import { completeCart, prepareReadyCart } from "../../medusa/store.ts";
import { closePool, createReadOnlyPool, selectRows } from "../../oracles/pg.ts";
import { medusaBaseUrlFromEnv } from "../../races/env.ts";
import { loadRepoEnv } from "../env.ts";
import { stormTimeoutFor } from "../storm-timeout.ts";
import type { LoadContext, StageResult } from "../types.ts";

/** The product dependencies, injectable so the tests run without a store, a database or an admin token. */
export interface MedusaDeps {
  openPool: () => pg.Pool;
  seed: () => Promise<string>;
  catalog: (token: string) => Promise<MedusaCatalog>;
  stock: typeof createStockedVariant;
  cancelAndArchive: (token: string, orderId: string) => Promise<void>;
  deleteProduct: (token: string, productId: string) => Promise<void>;
  deleteCustomersByPrefix: (token: string, prefix: string) => Promise<number>;
  /** The storm probe's cart and complete calls; the store helpers when absent. */
  prepareCart?: typeof prepareReadyCart;
  complete?: typeof completeCart;
}

const defaultDeps: MedusaDeps = {
  openPool: () => createReadOnlyPool(),
  seed: seedAndLogin,
  catalog: loadCatalog,
  stock: createStockedVariant,
  cancelAndArchive,
  deleteProduct,
  deleteCustomersByPrefix,
};

const message = (err: unknown): string =>
  (err instanceof Error ? err.message : String(err)).slice(0, 200);

/** The order id of a complete response, or undefined when the body is not an order. */
function orderIdOf(body: string): string | undefined {
  try {
    return (JSON.parse(body) as { order?: { id?: string } }).order?.id;
  } catch {
    return undefined;
  }
}

/**
 * The storm timeout of P6-MED-LOAD-006 (plan PRE-1, option 1): completes `carts` throwaway carts one at a time on a probe
 * variant of their own and returns the timeout for the fastest complete. The probe orders get an email outside the case
 * prefix and are cancelled and archived here, so the case variant and the retry audit never count them; the probe product
 * is deleted by the cleanup.
 */
async function measureStormTimeout(
  ctx: LoadContext,
  deps: MedusaDeps,
  token: string,
  catalog: MedusaCatalog,
  dataPrefix: string,
  carts: number,
): Promise<number> {
  const probe = await deps.stock({
    token,
    catalog,
    prefix: dataPrefix,
    leaf: "probe",
    s: carts,
    onCreated: (ids) => {
      ctx.config.probeProductId = ids.productId;
    },
  });
  ctx.config.probeProductId = probe.productId;
  const prepare = deps.prepareCart ?? prepareReadyCart;
  const complete = deps.complete ?? completeCart;
  const times: number[] = [];
  for (let i = 0; i < carts; i++) {
    const cart = await prepare({
      publishableKey: catalog.publishableKey,
      regionId: catalog.regionId,
      salesChannelId: catalog.salesChannelId,
      variantId: probe.variantId,
      email: prefixedEmail(`probe-${ctx.runPrefix}`, String(i)),
      quantity: 1,
    });
    const started = performance.now();
    const res = await complete(catalog.publishableKey, cart.cartId);
    times.push(performance.now() - started);
    const orderId = res.status === 200 ? orderIdOf(res.body) : undefined;
    if (!orderId) throw new Error(`TEST BUG: storm probe complete HTTP ${res.status}`);
    await deps.cancelAndArchive(token, orderId);
  }
  return stormTimeoutFor(Math.min(...times));
}

/**
 * Admin login, catalog, and one stocked variant with S = planned + 20. The admin token goes to ctx.secrets only; the
 * ids of what was created go to ctx.config as soon as they exist, so cleanup finds them after a partial failure.
 */
export async function medusaSetupWith(
  ctx: LoadContext,
  deps: MedusaDeps,
  stockFor: (planned: number) => number = (planned) => planned + 20,
  stormProbeCarts?: number,
): Promise<StageResult> {
  loadRepoEnv();
  try {
    const dataPrefix = caseDataPrefix(ctx.runPrefix, ctx.caseDef.id);
    const { rate, durationSec, maxLatencyMs } = ctx.profile;
    const planned = Math.round(rate * durationSec);
    const s = stockFor(planned);
    const token = await deps.seed();
    ctx.secrets.MEDUSA_ADMIN_TOKEN = token;
    const catalog = await deps.catalog(token);
    const stocked = await deps.stock({
      token,
      catalog,
      prefix: dataPrefix,
      leaf: "load",
      s,
      onCreated: (ids) => {
        ctx.config.productId = ids.productId;
        ctx.config.inventoryItemId = ids.inventoryItemId;
      },
    });
    ctx.config = {
      baseUrl: medusaBaseUrlFromEnv(),
      publishableKey: catalog.publishableKey,
      regionId: catalog.regionId,
      salesChannelId: catalog.salesChannelId,
      variantId: stocked.variantId,
      prefix: dataPrefix,
      rate,
      durationSec,
      maxLatencyMs,
      productId: stocked.productId,
      inventoryItemId: stocked.inventoryItemId,
      stock: s,
    };
    ctx.config.audit = {
      product: "medusa",
      prefixLike: likeLiteralPrefix(dataPrefix),
      variantId: stocked.variantId,
      inventoryItemId: stocked.inventoryItemId,
      locationId: catalog.locationId,
      stock: s,
    };
    if (stormProbeCarts !== undefined) {
      ctx.config.stormTimeoutMs = await measureStormTimeout(
        ctx,
        deps,
        token,
        catalog,
        dataPrefix,
        stormProbeCarts,
      );
    }
    return { ok: true, reasons: [] };
  } catch (err) {
    return { ok: false, kind: "TEST BUG", reasons: [`medusa setup failed: ${message(err)}`] };
  }
}

/**
 * Sweeps by the prefix, from the database and the admin API: the live orders (cancel and archive each), the product, the
 * customers. Every failure is a TEST BUG line and the sweep goes on; the leak check runs last.
 */
export async function medusaCleanupWith(ctx: LoadContext, deps: MedusaDeps): Promise<StageResult> {
  const reasons: string[] = [];
  const pool = deps.openPool();
  try {
    const dataPrefix = caseDataPrefix(ctx.runPrefix, ctx.caseDef.id);
    const likePrefix = likeLiteralPrefix(dataPrefix);
    const token = ctx.secrets.MEDUSA_ADMIN_TOKEN;
    if (!token) throw new Error("no admin token: setup did not run");
    const orders = await selectRows<{ id: string }>(pool, LEAK_LIVE_ORDER_IDS_SQL, [likePrefix]);
    for (const order of orders) {
      try {
        await deps.cancelAndArchive(token, order.id);
      } catch (err) {
        reasons.push(`TEST BUG: cleanup order ${order.id} failed: ${message(err)}`);
      }
    }
    const productId = ctx.config.productId;
    if (typeof productId === "string") {
      try {
        await deps.deleteProduct(token, productId);
      } catch (err) {
        reasons.push(`TEST BUG: cleanup product failed: ${message(err)}`);
      }
    }
    try {
      await deps.deleteCustomersByPrefix(token, dataPrefix);
    } catch (err) {
      reasons.push(`TEST BUG: cleanup customers failed: ${message(err)}`);
    }
    const probeProductId = ctx.config.probeProductId;
    if (typeof probeProductId === "string") {
      try {
        await deps.deleteProduct(token, probeProductId);
      } catch (err) {
        reasons.push(`TEST BUG: cleanup probe product failed: ${message(err)}`);
      }
    }
    const inventoryItemId = ctx.config.inventoryItemId;
    reasons.push(
      ...(await leakCheck(pool, likePrefix, typeof inventoryItemId === "string" ? [inventoryItemId] : [])),
    );
  } catch (err) {
    reasons.push(`TEST BUG: medusa cleanup failed: ${message(err)}`);
  } finally {
    await closePool(pool);
  }
  return reasons.length === 0 ? { ok: true, reasons: [] } : { ok: false, kind: "TEST BUG", reasons };
}

/** The stock rule is the case's: P6-MED-LOAD-001 keeps planned + 20 (Task 7); P6-MED-LOAD-002 sells out (Task 8). */
export const makeMedusaSetup =
  (opts: { stockFor: (planned: number) => number; stormProbeCarts?: number }) =>
  (ctx: LoadContext): Promise<StageResult> =>
    medusaSetupWith(ctx, defaultDeps, opts.stockFor, opts.stormProbeCarts);

export const medusaSetup = makeMedusaSetup({ stockFor: (planned) => planned + 20 });
export const medusaCleanup = (ctx: LoadContext): Promise<StageResult> =>
  medusaCleanupWith(ctx, defaultDeps);
