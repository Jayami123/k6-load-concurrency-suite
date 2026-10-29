import type pg from "pg";
import { caseDataPrefix } from "../../../k6/lib/pure/prefix.js";
import { createRunApiKeys, revokeRunApiKeys, type RunApiKey } from "../../twenty/api-key.ts";
import { destroyCompany } from "../../twenty/api.ts";
import { signInWorkspace } from "../../twenty/auth.ts";
import {
  twentyBaseUrlFromEnv,
  twentyDatabaseUrlFromEnv,
  twentyEmailFromEnv,
  twentyPasswordFromEnv,
  twentySubdomainFromEnv,
  twentyWorkspaceNameFromEnv,
} from "../../twenty/env.ts";
import { companyRowsByPrefix, resolveWorkspaceSchema } from "../../twenty/oracle.ts";
import { isLimiterProfileName } from "../../twenty/limiter-profile.ts";
import { closePool, createReadOnlyPool, selectRows } from "../../oracles/pg.ts";
import { loadRepoEnv } from "../env.ts";
import type { TwentyAuditConfig } from "../reconcile/twenty.ts";
import type { LoadContext, StageResult } from "../types.ts";

/** How a case authenticates (Twenty plan §2.12, frozen). The foundation signs in with the user token. */
export type TwentyAuth = "userToken" | "apiKey";
export const TWENTY_CASE_AUTH: Record<string, TwentyAuth> = {
  "TW-BG-FOUNDATION": "userToken",
  "P6-TW-LOAD-004": "apiKey",
  "P6-TW-LOAD-006": "apiKey",
  "P6-TW-LOAD-008": "apiKey",
  "P6-TW-LOAD-009": "apiKey",
  "P6-TW-LOAD-010": "apiKey",
};

/** Keys per API-key case (Twenty plan §2.13): one, except -009 (two keys). */
export const TWENTY_CASE_KEYS: Record<string, number> = {
  "P6-TW-LOAD-004": 1,
  "P6-TW-LOAD-006": 1,
  "P6-TW-LOAD-008": 1,
  "P6-TW-LOAD-009": 2,
  "P6-TW-LOAD-010": 1,
};

/** The cases whose result is a rate-limit claim (rule O10): they run only with an API key. */
export const LIMITER_CLAIM_CASES = [
  "P6-TW-LOAD-004",
  "P6-TW-LOAD-006",
  "P6-TW-LOAD-008",
  "P6-TW-LOAD-009",
];

/** The API key lives for two hours, longer than any Phase 5 run (Twenty plan §2.13). */
const KEY_LIFETIME_MS = 2 * 60 * 60 * 1000;

/** The database, sign-in, schema and mutation calls the stages use. The defaults are the real ones; tests pass fakes. */
export interface TwentyDeps {
  openPool: () => pg.Pool;
  signIn: (env: NodeJS.ProcessEnv) => Promise<{ authorizationHeader: string; origin: string }>;
  resolveSchema: (
    pool: pg.Pool,
    subdomain: string,
  ) => Promise<{ workspaceId: string; schema: string }>;
  listPrefixedIds: (pool: pg.Pool, schema: string, prefix: string) => Promise<string[]>;
  /** Destroys each company through the API. Returns the ids that were not removed. */
  destroy: (ids: string[], authorizationHeader: string) => Promise<string[]>;
  leakCount: (pool: pg.Pool, schema: string, prefix: string) => Promise<number>;
  createKeys: (opts: {
    names: string[];
    authorizationHeader: string;
    expiresAt: string;
  }) => Promise<RunApiKey[]>;
  revokeKeys: (opts: { ids: string[]; authorizationHeader: string }) => Promise<void>;
  /** Active run keys (revokedAt is null) whose name starts with the prefix. Must be 0 after cleanup. */
  apiKeyLeakCount: (pool: pg.Pool, prefix: string) => Promise<number>;
}

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * Setup: sign in for the user token, resolve the workspace schema, record the limiter profile and the audit config, and
 * for an API-key case create its seeded keys. Any failure is ENV (the message names no secret).
 */
export async function twentySetupWith(ctx: LoadContext, deps: TwentyDeps): Promise<StageResult> {
  const profile = ctx.env.P6_TWENTY_LIMITER_PROFILE ?? "";
  if (!isLimiterProfileName(profile)) {
    return {
      ok: false,
      kind: "ENV",
      reasons: ["ENV: P6_TWENTY_LIMITER_PROFILE is missing or unknown"],
    };
  }
  const pool = deps.openPool();
  try {
    const { authorizationHeader } = await deps.signIn(ctx.env);
    const { schema } = await deps.resolveSchema(pool, twentySubdomainFromEnv(ctx.env));
    const prefix = caseDataPrefix(ctx.runPrefix, ctx.caseDef.id);
    const auth = TWENTY_CASE_AUTH[ctx.caseDef.id] ?? "userToken";
    const baseUrl = twentyBaseUrlFromEnv(ctx.env);
    const { rate, durationSec, maxLatencyMs } = ctx.profile;
    ctx.config = {
      baseUrl,
      prefix,
      rate,
      durationSec,
      maxLatencyMs,
      audit: { product: "twenty", prefixLike: `${prefix}%`, schema } satisfies TwentyAuditConfig,
    };
    ctx.secrets.TWENTY_TOKEN = authorizationHeader.replace(/^Bearer /, "");
    ctx.handles.twentyPool = pool;
    ctx.handles.twentyAuth = authorizationHeader;
    if (ctx.meta) ctx.meta.limiterProfile = profile;
    if (LIMITER_CLAIM_CASES.includes(ctx.caseDef.id) && auth !== "apiKey") {
      ctx.invalid.push("rate-limit claim without an API key (by design, O10)");
    }
    if (auth === "apiKey") {
      const names = Array.from({ length: TWENTY_CASE_KEYS[ctx.caseDef.id] ?? 1 }, (_, i) => `${prefix}-key-${i}`);
      const keys = await deps.createKeys({
        names,
        authorizationHeader,
        expiresAt: new Date(Date.now() + KEY_LIFETIME_MS).toISOString(),
      });
      ctx.secrets.TWENTY_API_KEYS = JSON.stringify(keys.map((k) => k.token));
      ctx.handles.apiKeyIds = keys.map((k) => k.id);
    }
    return { ok: true, reasons: [] };
  } catch (err) {
    await closePool(pool);
    ctx.handles.twentyPool = undefined;
    return { ok: false, kind: "ENV", reasons: [`twenty setup failed: ${errorMessage(err)}`] };
  }
}

/**
 * Cleanup: revoke the run's keys, sweep every company with the prefix (live and soft-deleted) through the API, then count
 * what is left. Any leftover row or active key is a TEST BUG (rule O7). A setup that never ran has nothing to clean.
 */
export async function twentyCleanupWith(ctx: LoadContext, deps: TwentyDeps): Promise<StageResult> {
  const pool = ctx.handles.twentyPool as pg.Pool | undefined;
  const auth = ctx.handles.twentyAuth as string | undefined;
  const audit = ctx.config.audit as TwentyAuditConfig | undefined;
  if (!pool || !auth || !audit) return { ok: true, reasons: [], data: { skipped: "setup did not run" } };
  const { prefixLike, schema } = audit;
  const prefix = prefixLike.replace(/%$/, "");
  const reasons: string[] = [];
  try {
    const keyIds = (ctx.handles.apiKeyIds as string[] | undefined) ?? [];
    if (keyIds.length > 0) {
      await deps.revokeKeys({ ids: keyIds, authorizationHeader: auth });
    }
    const ids = await deps.listPrefixedIds(pool, schema, prefix);
    if (ids.length > 0) {
      const failed = await deps.destroy(ids, auth);
      if (failed.length > 0) reasons.push(`TEST BUG: ${failed.length} company deletion(s) failed`);
    }
    const leak = await deps.leakCount(pool, schema, prefix);
    if (leak !== 0) reasons.push(`TEST BUG: ${leak} company row(s) left after cleanup`);
    const keyLeak = await deps.apiKeyLeakCount(pool, prefix);
    if (keyLeak !== 0) reasons.push(`TEST BUG: ${keyLeak} run API key(s) still active`);
  } catch (err) {
    reasons.push(`TEST BUG: twenty cleanup failed: ${errorMessage(err)}`);
  } finally {
    await closePool(pool);
    ctx.handles.twentyPool = undefined;
  }
  return reasons.length > 0 ? { ok: false, kind: "TEST BUG", reasons } : { ok: true, reasons: [] };
}

/** The default dependencies: the harness's public dev credentials, the read-only oracle pool, and the product's API. */
export const defaultTwentyDeps: TwentyDeps = {
  openPool: () => createReadOnlyPool(twentyDatabaseUrlFromEnv(), { max: 1 }),
  signIn: (env) =>
    signInWorkspace({
      baseUrl: twentyBaseUrlFromEnv(env),
      email: twentyEmailFromEnv(env),
      password: twentyPasswordFromEnv(env),
      workspaceName: twentyWorkspaceNameFromEnv(env),
    }),
  resolveSchema: (pool, subdomain) => resolveWorkspaceSchema(pool, subdomain),
  listPrefixedIds: async (pool, schema, prefix) =>
    (
      await selectRows<{ id: string }>(
        pool,
        `SELECT id FROM "${schema}".company WHERE name LIKE $1`,
        [`${prefix}%`],
      )
    ).map((r) => r.id),
  destroy: async (ids, auth) => {
    const base = twentyBaseUrlFromEnv();
    const failed: string[] = [];
    for (const id of ids) {
      const res = await destroyCompany(base, auth, id);
      if (res.status !== 200 || (res.json?.errors?.length ?? 0) > 0) failed.push(id);
    }
    return failed;
  },
  leakCount: (pool, schema, prefix) => companyRowsByPrefix(pool, schema, prefix),
  createKeys: ({ names, authorizationHeader, expiresAt }) =>
    createRunApiKeys({
      baseUrl: twentyBaseUrlFromEnv(),
      authorizationHeader,
      names,
      expiresAt,
    }),
  revokeKeys: ({ ids, authorizationHeader }) =>
    revokeRunApiKeys({ baseUrl: twentyBaseUrlFromEnv(), authorizationHeader, ids }),
  apiKeyLeakCount: async (pool, prefix) => {
    const rows = await selectRows<{ n: string }>(
      pool,
      `SELECT count(*) AS n FROM core."apiKey" WHERE name LIKE $1 AND "revokedAt" IS NULL`,
      [`${prefix}%`],
    );
    return Number(rows[0]?.n ?? 0);
  },
};

/** The stage set's entry points: the repo env is loaded first, then the default dependencies are used. */
export const twentySetup = (ctx: LoadContext) => {
  loadRepoEnv();
  return twentySetupWith(ctx, defaultTwentyDeps);
};
export const twentyCleanup = (ctx: LoadContext) => {
  loadRepoEnv();
  return twentyCleanupWith(ctx, defaultTwentyDeps);
};
