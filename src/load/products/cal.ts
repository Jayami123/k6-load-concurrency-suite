import type pg from "pg";
import { caseDataPrefix } from "../../../k6/lib/pure/prefix.js";
import { cancelBooking, getFreeSlots } from "../../cal/api.ts";
import {
  caseLiveBookings,
  leakCheck,
  readHostOverlaps,
  resolveHostSetup,
} from "../../cal/oracle.ts";
import { hostPasswordFromProducts, loginAsHost } from "../../cal/session.ts";
import { privateLinkId, setPrivateLinks, type PrivateLinkInput } from "../../cal/private-link.ts";
import { readEventLinks } from "../../cal/state-oracle.ts";
import { likeLiteralPrefix } from "../../medusa/payloads.ts";
import { closePool, createReadOnlyPool } from "../../oracles/pg.ts";
import { calBaseUrlFromEnv, calDatabaseUrlFromEnv } from "../../races/env.ts";
import {
  freeOfHostBookings,
  pickSlotStarts,
  slotsNeeded,
  supplyWindowDays,
} from "../knee/cal-supply.ts";
import { kneePlanFor } from "../knee/plan-input.ts";
import { readSmokeReference } from "../smoke-baseline.ts";
import { loadRepoEnv } from "../env.ts";
import type { LoadContext, StageResult } from "../types.ts";

/** A link of the event type before the case ran; kept in ctx.handles and put back in cleanup (plan task 10 §6.5). */
export interface PriorLink {
  link: string;
  maxUsageCount: number;
  usageCount: number;
  expiresAt: Date | null;
}

/** The private-link dependencies of the link setup, injectable so the tests need no Cal server. */
export interface CalLinkDeps {
  password: () => string;
  login: (baseUrl: string, password: string) => Promise<string>;
  readLinks: (pool: pg.Pool, eventTypeId: number) => Promise<PriorLink[]>;
  setLinks: (
    baseUrl: string,
    cookie: string,
    eventTypeId: number,
    links: PrivateLinkInput[],
  ) => Promise<void>;
}

/** The product dependencies, injectable so the tests run without a database or a Cal server. */
export interface CalDeps {
  openPool: () => pg.Pool;
  cancel: (uid: string) => Promise<void>;
  links?: CalLinkDeps;
  /** The free slots of a window (the knee's supply read, plan task 2 §6.4). */
  freeSlots?: (fromIso: string, toIso: string, eventTypeId: number) => Promise<string[]>;
  /** The P6-CAL-LOAD-001 p95 reference the knee stops at 10 times (plan task 2 §6.5). */
  smokeP95?: () => number;
}

export interface CalSetupOptions {
  /** Load case -009: one cap-1 private link per intent, set for the run and restored in cleanup. */
  privateLinks?: boolean;
  /** Load case -005: the knee's slot supply, the plan fields and the smoke reference (plan task 2 §6.4). */
  knee?: boolean;
  /** The steady case's slot supply: `count` free slots for the whole run, one per iteration (plan task 5 §6.3). */
  slots?: { count: number };
}

const defaultLinks: CalLinkDeps = {
  password: () => hostPasswordFromProducts(process.env),
  login: (baseUrl, password) => loginAsHost(baseUrl, password),
  readLinks: readEventLinks,
  setLinks: setPrivateLinks,
};

const defaultDeps: CalDeps = {
  openPool: () => createReadOnlyPool(calDatabaseUrlFromEnv()),
  cancel: cancelBooking,
  links: defaultLinks,
  freeSlots: getFreeSlots,
  smokeP95: () => readSmokeReference(),
};

const message = (err: unknown): string =>
  (err instanceof Error ? err.message : String(err)).slice(0, 200);

/**
 * At least 28 days. The plan's probe (§3.1) counted 320 slots in a 28-day window at pro/30min; a shorter window can hold
 * fewer slots than iterations (the first CI run had 54 slots in 9 days and 7 iterations without a slot).
 */
export function calWindowDays(planned: number): number {
  return Math.max(28, Math.ceil(planned / 11.4) + 3);
}

/**
 * Sets one cap-1 link per intent for the actual iteration count, which can exceed rate x duration (planned + 2). The host
 * cookie goes to ctx.secrets only; the link ids are public (they are the ids the booking body carries) and go to ctx.config.
 */
async function setupPrivateLinks(
  ctx: LoadContext,
  pool: pg.Pool,
  links: CalLinkDeps,
  base: { baseUrl: string; eventTypeId: number; dataPrefix: string; planned: number },
): Promise<void> {
  const cookie = await links.login(base.baseUrl, links.password());
  ctx.secrets.CAL_HOST_COOKIE = cookie;
  const prior = await links.readLinks(pool, base.eventTypeId);
  // The restore sends no expiry (PrivateLinkInput has none), so a time-limited link would lose it: refuse, as run-state-case does.
  if (prior.some((l) => l.expiresAt !== null)) {
    throw new Error("TEST BUG: saved private links have an expiry; the restore would drop it");
  }
  ctx.handles.calPriorLinks = prior;
  const ids = Array.from({ length: base.planned + 2 }, (_, i) =>
    privateLinkId(base.dataPrefix, i),
  );
  await links.setLinks(
    base.baseUrl,
    cookie,
    base.eventTypeId,
    ids.map((link) => ({ link, maxUsageCount: 1 })),
  );
  // Usage of this case's links before the run: the audit's join reads the usage after it (src/load/retry-audit/cal.ts).
  const before = await links.readLinks(pool, base.eventTypeId);
  ctx.handles.calLinkUsageBefore = Object.fromEntries(
    before.filter((l) => ids.includes(l.link)).map((l) => [l.link, l.usageCount]),
  );
  ctx.config.links = ids;
  (ctx.config.audit as Record<string, unknown>).linkLike = likeLiteralPrefix(
    base.dataPrefix.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
  );
}

const DAY_MS = 86_400_000;

/**
 * The knee's slot supply (plan task 2 §6.4): S slots from the free slots of the supply window, one start per iteration, the
 * plan fields, the smoke reference and the 28-day window of each iteration. A short supply throws TEST BUG before any load.
 */
async function setupKneeSupply(
  ctx: LoadContext,
  deps: CalDeps,
  pool: pg.Pool,
  userId: number,
  eventTypeId: number,
): Promise<void> {
  const plan = kneePlanFor(ctx);
  let smokeP95Ms: number;
  try {
    smokeP95Ms = (deps.smokeP95 ?? (() => readSmokeReference()))();
  } catch {
    throw new Error("ENV: smoke p95 reference unreadable");
  }
  const count = slotsNeeded(plan);
  // The same first day as createSlotAllocator: 00:00 UTC of the day after tomorrow.
  const from = Math.floor(Date.now() / DAY_MS) * DAY_MS + 2 * DAY_MS;
  const to = from + supplyWindowDays(count) * DAY_MS;
  ctx.config.slotStarts = pickSlotStarts(
    await freeSupply(deps, pool, userId, eventTypeId, from, to),
    count,
  );
  Object.assign(ctx.config, plan, { windowDays: 28, smokeP95Ms });
}

/**
 * The free slots of the supply window: getSchedule's offers minus every start a host booking overlaps (exact ms, the predicate of
 * HOST_OVERLAP_SQL). getSchedule offers a start whose 30-minute slot is busy against an unrounded booking (seed bookings at
 * 09:01:10), so the offers alone can be refused by the booking path (a 409 in steady).
 */
async function freeSupply(
  deps: CalDeps,
  pool: pg.Pool,
  userId: number,
  eventTypeId: number,
  from: number,
  to: number,
): Promise<string[]> {
  const fromIso = new Date(from).toISOString();
  const toIso = new Date(to).toISOString();
  const offered = await (deps.freeSlots ?? getFreeSlots)(fromIso, toIso, eventTypeId);
  const busy = await readHostOverlaps(pool, userId, fromIso, toIso);
  return freeOfHostBookings(offered, busy);
}

/** The steady case's supply: `count` slots from the free slots of the supply window, the same reads as the knee's (plan task 2 §6.4). */
async function setupSteadySupply(
  ctx: LoadContext,
  deps: CalDeps,
  pool: pg.Pool,
  userId: number,
  eventTypeId: number,
  count: number,
): Promise<void> {
  const from = Math.floor(Date.now() / DAY_MS) * DAY_MS + 2 * DAY_MS;
  const to = from + supplyWindowDays(count) * DAY_MS;
  ctx.config.slotStarts = pickSlotStarts(
    await freeSupply(deps, pool, userId, eventTypeId, from, to),
    count,
  );
  ctx.config.windowDays = 28;
}

/** Resolves the host and event type from the database and writes the case config. Never writes a secret. */
export async function calSetupWith(
  ctx: LoadContext,
  deps: CalDeps,
  opts: CalSetupOptions = {},
): Promise<StageResult> {
  loadRepoEnv();
  const pool = deps.openPool();
  try {
    const { userId, eventTypeId } = await resolveHostSetup(pool);
    const dataPrefix = caseDataPrefix(ctx.runPrefix, ctx.caseDef.id);
    const { rate, durationSec, maxLatencyMs } = ctx.profile;
    const planned = Math.round(rate * durationSec);
    const baseUrl = calBaseUrlFromEnv();
    ctx.config = {
      baseUrl,
      eventTypeId,
      eventTypeSlug: "30min",
      host: "pro",
      prefix: dataPrefix,
      windowDays: calWindowDays(planned),
      rate,
      durationSec,
      maxLatencyMs,
      ...(ctx.profile.timeUnitSec !== undefined ? { timeUnitSec: ctx.profile.timeUnitSec } : {}),
    };
    ctx.config.audit = {
      product: "cal",
      userId,
      eventTypeId,
      prefixLike: likeLiteralPrefix(dataPrefix),
      prefix: dataPrefix,
    };
    if (opts.knee === true) {
      await setupKneeSupply(ctx, deps, pool, userId, eventTypeId);
    }
    if (opts.slots !== undefined) {
      await setupSteadySupply(ctx, deps, pool, userId, eventTypeId, opts.slots.count);
    }
    if (opts.privateLinks === true) {
      await setupPrivateLinks(ctx, pool, deps.links ?? defaultLinks, {
        baseUrl,
        eventTypeId,
        dataPrefix,
        planned,
      });
    }
    return { ok: true, reasons: [] };
  } catch (err) {
    const text = message(err);
    return text.startsWith("ENV:")
      ? { ok: false, kind: "ENV", reasons: [text] }
      : { ok: false, kind: "TEST BUG", reasons: [`cal setup failed: ${text}`] };
  } finally {
    await closePool(pool);
  }
}

/**
 * Cancels every live booking of the case, found by the database (never by the uids k6 returned: a client that timed out
 * never learns its uid). A failed cancel is a TEST BUG line and the sweep continues; the leak check runs last.
 * When the setup saved prior links, they are put back last; a failed restore is a TEST BUG line (the event type is shared).
 */
export async function calCleanupWith(ctx: LoadContext, deps: CalDeps): Promise<StageResult> {
  const reasons: string[] = [];
  // The pool opens inside the try: a failure here must not skip the prior-link restore below.
  let pool: pg.Pool | undefined;
  try {
    pool = deps.openPool();
    const prefixLike = likeLiteralPrefix(caseDataPrefix(ctx.runPrefix, ctx.caseDef.id));
    const rows = await caseLiveBookings(pool, prefixLike);
    for (const row of rows) {
      try {
        await deps.cancel(row.uid);
      } catch (err) {
        reasons.push(`TEST BUG: cancel booking ${row.id} failed: ${message(err)}`);
      }
    }
    reasons.push(...(await leakCheck(pool, prefixLike)));
  } catch (err) {
    reasons.push(`TEST BUG: cal cleanup failed: ${message(err)}`);
  } finally {
    await closePool(pool);
  }
  const prior = ctx.handles.calPriorLinks as PriorLink[] | undefined;
  if (prior !== undefined) {
    try {
      const cookie = ctx.secrets.CAL_HOST_COOKIE;
      if (cookie === undefined) throw new Error("no host session cookie in the run");
      await (deps.links ?? defaultLinks).setLinks(
        String(ctx.config.baseUrl),
        cookie,
        Number(ctx.config.eventTypeId),
        prior.map((l) => ({ link: l.link, maxUsageCount: l.maxUsageCount, usageCount: l.usageCount })),
      );
    } catch (err) {
      reasons.push(`TEST BUG: prior links not restored: ${message(err)}`);
    }
  }
  return reasons.length === 0
    ? { ok: true, reasons: [] }
    : { ok: false, kind: "TEST BUG", reasons };
}

/** The setup stage of a Cal case. `calSetup({})` is the plain case; `calSetup({ privateLinks: true })` is -009. */
export const calSetup =
  (opts: CalSetupOptions = {}) =>
  (ctx: LoadContext): Promise<StageResult> =>
    calSetupWith(ctx, defaultDeps, opts);
export const calCleanup = (ctx: LoadContext): Promise<StageResult> =>
  calCleanupWith(ctx, defaultDeps);
