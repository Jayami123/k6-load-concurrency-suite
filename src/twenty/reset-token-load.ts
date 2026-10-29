import type { GraphqlResult } from "./api.ts";
import { redeemResetToken } from "./api.ts";
import { createInvitedMember, requestResetToken } from "./member.ts";
import {
  hashChangedSince,
  snapshotDigest,
  unrevokedRows,
  userIdByEmail,
  type TokenResult,
} from "./oracle-reset-token.ts";
import { freshPassword, throwawayAddress } from "./payloads.ts";
import type { CaseContext } from "./run-case.ts";

export interface ResetTokenRunOpts {
  ctx: CaseContext;
  tokens: number; // one member and one reset token per trial
  redeemsPerToken: number; // N parallel redemptions of the same token
  spreadMs: number; // the trials start this far apart
}

/** Pure. True when one redemption answered HTTP 200 with no GraphQL errors and success === true. */
export function successOf(res: GraphqlResult): boolean {
  const data = res.json?.data as { updatePasswordViaResetToken?: { success?: boolean } } | null;
  return (
    res.status === 200 &&
    !(res.json?.errors && res.json.errors.length > 0) &&
    data?.updatePasswordViaResetToken?.success === true
  );
}

/** Pure. Reduces the redemption answers of one token to the counts the oracle reads. No body leaves this function. */
export function summariseRedemptions(responses: GraphqlResult[]): {
  successes: number;
  statuses: number[];
  fiveHundreds: number;
} {
  return {
    successes: responses.filter(successOf).length,
    statuses: responses.map((r) => r.status),
    fiveHundreds: responses.filter((r) => r.status >= 500).length,
  };
}

/** One trial: a fresh member, one reset request, N parallel redemptions, then the database booleans. The token is not kept. */
export async function runOneToken(opts: ResetTokenRunOpts, trial: number): Promise<TokenResult> {
  const { ctx } = opts;
  const address = throwawayAddress(ctx.prefix, trial);
  await createInvitedMember(ctx, address);
  const userId = await userIdByEmail(ctx.pool, address);
  const digest = await snapshotDigest(ctx.pool, userId);
  const token = await requestResetToken(ctx, address);
  const responses = await Promise.all(
    Array.from({ length: opts.redeemsPerToken }, () =>
      redeemResetToken(ctx.base, token, freshPassword()),
    ),
  );
  const summary = summariseRedemptions(responses);
  return {
    trial,
    successes: summary.successes,
    statuses: summary.statuses,
    fiveHundreds: summary.fiveHundreds,
    hashChanged: await hashChangedSince(ctx.pool, userId, digest),
    unrevokedRows: await unrevokedRows(ctx.pool, userId),
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Runs every trial at its slot over spreadMs. A failed trial throws (a setup error); it is never retried. */
export async function runResetTokenLoad(opts: ResetTokenRunOpts): Promise<TokenResult[]> {
  const started = Date.now();
  const results: TokenResult[] = [];
  for (let trial = 0; trial < opts.tokens; trial++) {
    await sleep(Math.max(0, started + trial * opts.spreadMs - Date.now()));
    results.push(await runOneToken(opts, trial));
  }
  return results;
}
