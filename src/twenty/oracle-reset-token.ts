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
