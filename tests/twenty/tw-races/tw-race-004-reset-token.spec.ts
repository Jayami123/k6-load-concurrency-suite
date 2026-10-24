import { expect, test } from "@playwright/test";
import { createInvitedMember, requestResetToken } from "../../../src/twenty/member.ts";
import { redeemResetToken } from "../../../src/twenty/api.ts";
import { fireTogether } from "../../../src/races/fire-together.ts";
import {
  companyRowsByPrefix,
  memberCountByPrefix,
  passwordHashMd5,
  resetTokenCounts,
} from "../../../src/twenty/oracle.ts";
import { assertExactlyOne, overlapped } from "../../../src/twenty/invariants.ts";
import { freshPassword, throwawayAddress } from "../../../src/twenty/payloads.ts";
import { runTwentyTrials, setupTwentyContext } from "../../../src/twenty/run-case.ts";
import { guards } from "./guards.ts";

test.describe.configure({ timeout: 900_000 });

const succeeded = (json: unknown): boolean =>
  (json as { data?: { updatePasswordViaResetToken?: { success?: boolean } } } | null)?.data
    ?.updatePasswordViaResetToken?.success === true;

// P6-TW-RACE-004 is a PRODUCT BUG (owner label, 2026-10-23). The guards run first and are never inside test.fail().
test("P6-TW-RACE-004 PRODUCT BUG: N=10 parallel redemptions of one reset token must admit exactly one", async () => {
  const ctx = await setupTwentyContext();
  const { histogram, trials } = await runTwentyTrials({
    caseId: "P6-TW-RACE-004",
    title: "reset token: N parallel redemptions",
    concurrency: 10,
    attempt: async (trial) => {
      // Setup (any failure is a TEST BUG and makes the trial a stub).
      const addr = throwawayAddress(ctx.prefix, trial);
      await createInvitedMember(ctx, addr);
      const token = await requestResetToken(ctx, addr);
      const hashBefore = await passwordHashMd5(ctx.pool, addr);
      if (hashBefore === null) throw new Error("TEST BUG: no password hash for the member");

      // The race: 10 requests fired together.
      const success: boolean[] = [];
      const fired = await fireTogether(10, async (i) => {
        const r = await redeemResetToken(ctx.base, token, freshPassword());
        success[i] = succeeded(r.json);
        return { status: r.status, body: r.text };
      });

      const hashAfter = await passwordHashMd5(ctx.pool, addr);
      const rc = await resetTokenCounts(ctx.pool, addr);
      return {
        requests: fired.requests,
        oracle: {
          successes: success.filter(Boolean).length,
          overlapped: overlapped(fired.requests),
          hashChanged: hashBefore !== hashAfter,
          revokedRows: rc.revoked,
          totalTokenRows: rc.total,
        },
      };
    },
    leakCheck: async () => ({
      companyRowsLeft: await companyRowsByPrefix(ctx.pool, ctx.schema, ctx.prefix),
      throwawayMembers: await memberCountByPrefix(ctx.pool, ctx.prefix),
    }),
  });

  // 1. Guards: setup, overlap, leak. A failure here is red, never an expected failure.
  guards(trials, histogram);

  // 2. Label, then the strict assertion. test.fail() is called only after the guards pass.
  test.info().annotations.push({
    type: "issue",
    description:
      "P6-TW-RACE-004: PRODUCT BUG, one reset token is redeemed more than once under concurrency (check-then-act, no lock)",
  });
  test.fail();
  for (const t of trials) {
    expect(() =>
      assertExactlyOne(t.value!.oracle.successes as number, `trial ${t.trial}`),
    ).not.toThrow();
  }
});
