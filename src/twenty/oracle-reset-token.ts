import type pg from "pg";
import { selectRows } from "../oracles/pg.ts";

/** The finding ID a multi-success result is named by. The public wording carries this ID only, never a count (Q-DISCLOSE). */
export const FINDING_ID = "P6-TW-RACE-004";

/** What one token's redemptions showed. Booleans and counts only: no token, hash or response body (D8). */
export interface TokenResult {
  trial: number; // 0-based token index
  successes: number; // 200 responses with success === true
  statuses: number[]; // one per redemption, no bodies
  fiveHundreds: number; // statuses >= 500
  hashChanged: boolean; // from hashChangedSince(), boolean only
  unrevokedRows: number; // live reset-token rows for the user
}

export type TokenVerdict = "PASS" | "PRODUCT_BUG_SUSPECTED" | "INCONCLUSIVE";

/** Internal join of every token result. The counts stay in verdict.json (private); the public artefact keeps none of them. */
export interface TokenJoin {
  tokens: number;
  exactlyOne: number;
  multiSuccess: number; // tokens with successes > 1
  zeroSuccess: number; // tokens with no accepted redemption
  fiveHundreds: number;
  unchangedHash: number;
  unrevoked: number;
  limited429: number; // tokens whose redemptions saw a 429 (the token path must stay under the limit)
  verdict: TokenVerdict;
  verdictReason: string; // generic; the finding ID only when multiSuccess > 0
  findingId?: string;
}

/** The public verdict words. The multi-success wording names the finding ID and nothing else (Q-DISCLOSE). */
export const VERDICT_WORD: Record<TokenVerdict, string> = {
  PASS: "PASS",
  PRODUCT_BUG_SUSPECTED: "PRODUCT BUG (SUSPECTED)",
  INCONCLUSIVE: "INCONCLUSIVE",
};

/**
 * Pure. Joins the per-token results into one verdict. PASS needs every token accepted exactly once, a changed hash, no
 * server error, and no live reset-token row left. Any other result is PRODUCT_BUG_SUSPECTED. Zero tokens is INCONCLUSIVE.
 * A result count that differs from the tokens issued is a TEST BUG (the message names no count).
 */
export function joinTokens(results: TokenResult[], expectedTokens: number): TokenJoin {
  if (results.length !== expectedTokens) {
    throw new Error("TEST BUG: token results do not match the tokens issued");
  }
  const count = (pred: (r: TokenResult) => boolean) => results.filter(pred).length;
  const base = {
    tokens: expectedTokens,
    exactlyOne: count((r) => r.successes === 1),
    multiSuccess: count((r) => r.successes > 1),
    zeroSuccess: count((r) => r.successes === 0),
    fiveHundreds: count((r) => r.fiveHundreds > 0),
    unchangedHash: count((r) => !r.hashChanged),
    unrevoked: count((r) => r.unrevokedRows > 0),
    limited429: count((r) => r.statuses.includes(429)),
  };
  if (expectedTokens === 0) {
    return { ...base, verdict: "INCONCLUSIVE", verdictReason: "no token was issued" };
  }
  if (base.multiSuccess > 0) {
    return {
      ...base,
      verdict: "PRODUCT_BUG_SUSPECTED",
      verdictReason: "a token was accepted more than once",
      findingId: FINDING_ID,
    };
  }
  if (base.fiveHundreds > 0) {
    return {
      ...base,
      verdict: "PRODUCT_BUG_SUSPECTED",
      verdictReason: "server error on the redemption path",
    };
  }
  if (base.unchangedHash > 0) {
    return {
      ...base,
      verdict: "PRODUCT_BUG_SUSPECTED",
      verdictReason: "a redemption was accepted but the stored hash did not change",
    };
  }
  if (base.unrevoked > 0) {
    return {
      ...base,
      verdict: "PRODUCT_BUG_SUSPECTED",
      verdictReason: "a reset token stayed live after the redemptions",
    };
  }
  if (base.zeroSuccess > 0) {
    return {
      ...base,
      verdict: "PRODUCT_BUG_SUSPECTED",
      verdictReason: "a token was never accepted",
    };
  }
  return { ...base, verdict: "PASS", verdictReason: "every token was accepted exactly once" };
}

/** Pure. The public line of a join: the verdict word, plus the finding ID when a multi-success result exists. */
export function publicWording(join: TokenJoin): string {
  if (join.verdict !== "PRODUCT_BUG_SUSPECTED") return VERDICT_WORD[join.verdict];
  if (join.findingId) {
    return `${VERDICT_WORD.PRODUCT_BUG_SUSPECTED}, matches ${join.findingId}, see private security report`;
  }
  return VERDICT_WORD.PRODUCT_BUG_SUSPECTED;
}

/** The fields the public artefact keeps. Every count, token, hash and stage detail stays out of this type. */
export interface PublicVerdict {
  caseId: string;
  runId: string;
  outcome: string; // the verdict word
  runOutcome: string; // the runner's PASS, FAIL, INVALID or ENV
  validity: "VALID" | "INVALID";
  findingId?: string;
}

export interface PublicRunMeta {
  environment: { kind: string; sha?: string };
}

/**
 * Pure. The only artefact content that may be uploaded: the verdict word, the finding ID (when present), validity and the
 * environment kind and SHA. Every count is dropped by construction (Q-DISCLOSE).
 */
export function publicArtefact(verdict: PublicVerdict, runMeta: PublicRunMeta) {
  return {
    caseId: verdict.caseId,
    runId: verdict.runId,
    outcome: verdict.outcome,
    runOutcome: verdict.runOutcome,
    validity: verdict.validity,
    ...(verdict.findingId ? { findingId: verdict.findingId } : {}),
    environment: {
      kind: runMeta.environment.kind,
      ...(runMeta.environment.sha ? { sha: runMeta.environment.sha } : {}),
    },
  };
}

/** Token-shaped text: 64 hex, bcrypt hashes, JWT-shaped strings and "Bearer <value>". Each becomes "<redacted>". */
const REDACT_PATTERNS: RegExp[] = [
  /\b[0-9a-f]{64}\b/gi,
  /\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}/g,
  /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  /Bearer\s+[A-Za-z0-9._~+/=-]+/g,
];

/** Pure. Replaces token-shaped text; plain text passes unchanged. */
export function redactForArtefact(text: string): string {
  return REDACT_PATTERNS.reduce((out, pattern) => out.replace(pattern, "<redacted>"), text);
}

/** SQL text only. One boolean: the stored hash differs from the digest passed in. IS DISTINCT FROM keeps a NULL digest honest. */
export function hashChangedSql(): string {
  return `SELECT (md5("passwordHash") IS DISTINCT FROM $2) AS changed FROM core."user" WHERE id = $1`;
}

/** Read-only. The user row id of one member, which must exist exactly once. */
export async function userIdByEmail(pool: pg.Pool, email: string): Promise<string> {
  const rows = await selectRows<{ id: string }>(
    pool,
    `SELECT id FROM core."user" WHERE email = $1`,
    [email],
  );
  if (rows.length !== 1) throw new Error("TEST BUG: member row not found exactly once");
  return rows[0]!.id;
}

/** Read-only. The md5 of the stored hash, taken before the redemptions. The digest stays in memory and is never logged. */
export async function snapshotDigest(pool: pg.Pool, userId: string): Promise<string | null> {
  const rows = await selectRows<{ h: string | null }>(
    pool,
    `SELECT md5("passwordHash") AS h FROM core."user" WHERE id = $1`,
    [userId],
  );
  return rows[0]?.h ?? null;
}

/** Read-only. True when the stored hash differs from the digest. Returns the boolean only, never the hash. */
export async function hashChangedSince(
  pool: pg.Pool,
  userId: string,
  digest: string | null,
): Promise<boolean> {
  const rows = await selectRows<{ changed: boolean }>(pool, hashChangedSql(), [userId, digest]);
  return rows[0]?.changed === true;
}

/** Read-only. Live (not revoked, not expired) reset-token rows of one user. */
export async function unrevokedRows(pool: pg.Pool, userId: string): Promise<number> {
  const rows = await selectRows<{ n: string }>(
    pool,
    `SELECT count(*) AS n FROM core."appToken"
      WHERE "userId" = $1 AND type = 'PASSWORD_RESET_TOKEN'
        AND "revokedAt" IS NULL AND "expiresAt" > now()`,
    [userId],
  );
  return Number(rows[0]?.n ?? 0);
}

/** Read-only. The newest reset-token window of one user, in epoch milliseconds (the DB clock). */
export async function resetTokenWindow(
  pool: pg.Pool,
  userId: string,
): Promise<{ createdAtMs: number; expiresAtMs: number }> {
  const rows = await selectRows<{ createdAtMs: string; expiresAtMs: string }>(
    pool,
    `SELECT extract(epoch FROM "createdAt") * 1000 AS "createdAtMs",
            extract(epoch FROM "expiresAt") * 1000 AS "expiresAtMs"
       FROM core."appToken"
      WHERE "userId" = $1 AND type = 'PASSWORD_RESET_TOKEN'
      ORDER BY "createdAt" DESC LIMIT 1`,
    [userId],
  );
  const row = rows[0];
  if (!row) throw new Error("TEST BUG: no reset token row for the member");
  return { createdAtMs: Number(row.createdAtMs), expiresAtMs: Number(row.expiresAtMs) };
}
