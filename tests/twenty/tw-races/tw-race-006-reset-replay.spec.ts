import { expect, test } from "@playwright/test";
import { createInvitedMember, requestResetToken } from "../../../src/twenty/member.ts";
import { redeemResetToken } from "../../../src/twenty/api.ts";
import {
  companyRowsByPrefix,
  passwordHashMd5,
  resetTokenCounts,
} from "../../../src/twenty/oracle.ts";
import { assertReplayRefused } from "../../../src/twenty/invariants.ts";
import { freshPassword, throwawayAddress } from "../../../src/twenty/payloads.ts";
import { runTwentyTrials, setupTwentyContext, timed } from "../../../src/twenty/run-case.ts";

test.describe.configure({ timeout: 900_000 });

const succeeded = (json: unknown): boolean =>
  (json as { data?: { updatePasswordViaResetToken?: { success?: boolean } } } | null)?.data
    ?.updatePasswordViaResetToken?.success === true;

test("P6-TW-RACE-006: a replay of a redeemed reset token is refused and changes nothing", async () => {
  const ctx = await setupTwentyContext();
  const { histogram, trials } = await runTwentyTrials({
    caseId: "P6-TW-RACE-006",
    title: "reset token: sequential replay after a success",
    concurrency: 1,
    parallel: false,
    attempt: async (trial) => {
      const addr = throwawayAddress(ctx.prefix, trial);
      await createInvitedMember(ctx, addr);
      const token = await requestResetToken(ctx, addr);
      const hashBefore = await passwordHashMd5(ctx.pool, addr);
      if (hashBefore === null) throw new Error("TEST BUG: no password hash for the member");

      let firstJson: unknown = null;
      let replayJson: unknown = null;
      const first = await timed(0, async () => {
        const r = await redeemResetToken(ctx.base, token, freshPassword());
        firstJson = r.json;
        return { status: r.status, body: r.text };
      });
      const hashAfterFirst = await passwordHashMd5(ctx.pool, addr);
      const replay = await timed(1, async () => {
        const r = await redeemResetToken(ctx.base, token, freshPassword());
        replayJson = r.json;
        return { status: r.status, body: r.text };
      });
      const hashAfterReplay = await passwordHashMd5(ctx.pool, addr);
      const rc = await resetTokenCounts(ctx.pool, addr);
      const replayErrors = (replayJson as { errors?: Array<{ message: string }> } | null)?.errors;
      return {
        requests: [first, replay],
        oracle: {
          firstSuccess: succeeded(firstJson),
          replayMessage: replayErrors?.[0]?.message ?? "",
          hashChangedByReplay: hashAfterFirst !== hashAfterReplay,
          revokedRows: rc.revoked,
          totalTokenRows: rc.total,
        },
      };
    },
    leakCheck: async () => ({
      companyRowsLeft: await companyRowsByPrefix(ctx.pool, ctx.schema, ctx.prefix),
    }),
  });

  // Guards: setup and leak only. The replay is sequential, so there is no overlap to check (D15 applies to parallel cases).
  expect(
    trials.filter((t) => !t.ok).map((t) => `trial ${t.trial}: ${t.error}`),
    "setup or run error in a trial (TEST BUG)",
  ).toEqual([]);
  expect(histogram.oracle.companyRowsLeft, "leak check").toBe(0);

  for (const t of trials) {
    const o = t.value!.oracle;
    expect(o.firstSuccess, `trial ${t.trial}: first redemption`).toBe(true);
    expect(
      () =>
        assertReplayRefused(
          o.replayMessage ? { errors: [{ message: String(o.replayMessage) }] } : {},
        ),
      `trial ${t.trial}`,
    ).not.toThrow();
    expect(o.hashChangedByReplay, `trial ${t.trial}: the replay changed the password`).toBe(false);
    expect(o.revokedRows, `trial ${t.trial}: token rows revoked`).toBe(o.totalTokenRows);
  }
});
