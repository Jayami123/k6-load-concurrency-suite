import type pg from "pg";
import { caseDataPrefix } from "../../../k6/lib/pure/prefix.js";
import {
  cancelAndArchive,
  createStockedVariant,
  deleteCustomersByPrefix,
  deleteProduct,
  deleteRunReservation,
  loadCatalog,
  seedAndLogin,
  type MedusaCatalog,
} from "../../medusa/admin.ts";
import { LEAK_LIVE_ORDER_IDS_SQL, RUN_RESERVATIONS_SQL, leakCheck } from "../../medusa/oracle.ts";
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
  deleteRunReservation: (token: string, reservationId: string) => Promise<void>;
  deleteCustomersByPrefix: (token: string, prefix: string) => Promise<number>;
  /** The storm probe's cart and complete calls; the store helpers when absent. */
  prepareCart?: typeof prepareReadyCart;
  complete?: typeof completeCart;
  /** The clock of the storm probe, in ms; performance.now when absent. A test injects a fixed clock. */
  now?: () => number;
}

const defaultDeps: MedusaDeps = {
  openPool: () => createReadOnlyPool(),
  seed: seedAndLogin,
  catalog: loadCatalog,
  stock: createStockedVariant,
  cancelAndArchive,
  deleteProduct,
  deleteRunReservation,
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
 * The storm probe of P6-MED-LOAD-006 (plan PRE-1, option 1): completes `carts` throwaway carts one at a time on a probe
 * variant of their own and returns the fastest complete in ms; the setup turns it into the storm timeout. The probe orders get an email outside the case
 * prefix and are cancelled and archived here, so the case variant and the retry audit never count them; the probe product
 * is deleted by the cleanup.
 */
async function measureStormMinComplete(
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
      // createStockedVariant calls this twice (product, then inventory item): a call without a product id must not erase it.
      if (ids.productId !== undefined) ctx.config.probeProductId = ids.productId;
    },
  });
  ctx.config.probeProductId = probe.productId;
  const prepare = deps.prepareCart ?? prepareReadyCart;
  const complete = deps.complete ?? completeCart;
  const times: number[] = [];
  // Order ids not yet cancelled: a failed cancel leaves its id here, and the cleanup sweeps it by id.
  const pending: string[] = [];
  ctx.config.probeOrderIds = pending;
  for (let i = 0; i < carts; i++) {
    const cart = await prepare({
      publishableKey: catalog.publishableKey,
      regionId: catalog.regionId,
      salesChannelId: catalog.salesChannelId,
      variantId: probe.variantId,
      email: prefixedEmail(`probe-${ctx.runPrefix}`, String(i)),
      quantity: 1,
    });
    const now = deps.now ?? (() => performance.now());
    const started = now();
    const res = await complete(catalog.publishableKey, cart.cartId);
    times.push(now() - started);
    const orderId = res.status === 200 ? orderIdOf(res.body) : undefined;
    if (!orderId) throw new Error(`TEST BUG: storm probe complete HTTP ${res.status}`);
    pending.push(orderId);
    await deps.cancelAndArchive(token, orderId);
    pending.splice(pending.indexOf(orderId), 1);
  }
  return Math.min(...times);
}

/**
 * Admin login, catalog, and one stocked variant with S = planned + 20. The admin token goes to ctx.secrets only; the
 * ids of what was created go to ctx.config as soon as they exist, so cleanup finds them after a partial failure.
 */
export async function medusaSetupWith(
  ctx: LoadContext,
  deps: MedusaDeps,
  stockFor: (planned: number, ctx: LoadContext) => number = (planned) => planned + 20,
  stormProbeCarts?: number,
): Promise<StageResult> {
  loadRepoEnv();
  try {
    const dataPrefix = caseDataPrefix(ctx.runPrefix, ctx.caseDef.id);
    const { rate, durationSec, maxLatencyMs } = ctx.profile;
    const planned = Math.round(rate * durationSec);
    const s = stockFor(planned, ctx);
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
        // Called once per id: a call without an id leaves the recorded one alone, so cleanup never loses a product.
        if (ids.productId !== undefined) ctx.config.productId = ids.productId;
        if (ids.inventoryItemId !== undefined) ctx.config.inventoryItemId = ids.inventoryItemId;
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
      ...(ctx.profile.timeUnitSec !== undefined ? { timeUnitSec: ctx.profile.timeUnitSec } : {}),
      productId: stocked.productId,
      inventoryItemId: stocked.inventoryItemId,
      stock: s,
    };
    ctx.config.audit = {
      product: "medusa",
      prefixLike: likeLiteralPrefix(dataPrefix),
      prefix: dataPrefix,
      variantId: stocked.variantId,
      inventoryItemId: stocked.inventoryItemId,
      locationId: catalog.locationId,
      stock: s,
    };
    if (stormProbeCarts !== undefined) {
      const minCompleteMs = await measureStormMinComplete(
        ctx,
        deps,
        token,
        catalog,
        dataPrefix,
        stormProbeCarts,
      );
      ctx.config.stormMinCompleteMs = minCompleteMs;
      ctx.config.stormTimeoutMs = stormTimeoutFor(minCompleteMs);
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
    // Medusa refuses to delete a product whose inventory item still holds reservations. The leaked ones of this run's orders
    // are recorded first (a PRODUCT BUG reason), then deleted one by one through the admin API, and only then the product.
    const inventory = ctx.config.inventoryItemId;
    if (typeof inventory === "string") {
      const leaked = await selectRows<{ id: string; order_id: string }>(pool, RUN_RESERVATIONS_SQL, [
        inventory,
        likePrefix,
      ]);
      if (leaked.length > 0) {
        reasons.push(
          `PRODUCT BUG: ${leaked.length} reservation(s) of this run's orders held the inventory item at cleanup: ${leaked.map((r) => r.id).join(", ")}`,
        );
        for (const r of leaked) {
          try {
            await deps.deleteRunReservation(token, r.id);
          } catch (err) {
            reasons.push(`TEST BUG: cleanup reservation ${r.id} failed: ${message(err)}`);
          }
        }
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
    const probeOrderIds = (ctx.config.probeOrderIds as string[] | undefined) ?? [];
    for (const orderId of probeOrderIds) {
      try {
        await deps.cancelAndArchive(token, orderId);
      } catch (err) {
        reasons.push(`TEST BUG: cleanup probe order ${orderId} failed: ${message(err)}`);
      }
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
  if (reasons.length === 0) return { ok: true, reasons: [] };
  // a leak is a product finding; a failed cleanup call is a TEST BUG and outranks it
  const kind = reasons.some((r) => r.startsWith("TEST BUG")) ? "TEST BUG" : "PRODUCT BUG";
  return { ok: false, kind, reasons };
}

/**
 * The stock rule is the case's: P6-MED-LOAD-001 keeps planned + 20 (Task 7); P6-MED-LOAD-002 sells out (Task 8); a knee case
 * sizes it from its plan through the context (plan task 3 §6.4).
 */
export const makeMedusaSetup =
  (opts: { stockFor: (planned: number, ctx: LoadContext) => number; stormProbeCarts?: number }) =>
  (ctx: LoadContext): Promise<StageResult> =>
    medusaSetupWith(ctx, defaultDeps, opts.stockFor, opts.stormProbeCarts);

export const medusaSetup = makeMedusaSetup({ stockFor: (planned) => planned + 20 });
export const medusaCleanup = (ctx: LoadContext): Promise<StageResult> =>
  medusaCleanupWith(ctx, defaultDeps);
