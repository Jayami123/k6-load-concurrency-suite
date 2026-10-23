import { expect, test } from "@playwright/test";
import { fireTogether } from "../../../src/races/fire-together.ts";
import { companyRowsByPrefix } from "../../../src/twenty/oracle.ts";
import { createCompany, destroyCompany, patchCompany, restCall } from "../../../src/twenty/api.ts";
import { assertNameIsOneOf, assertNo5xx, overlapped } from "../../../src/twenty/invariants.ts";
import { companyName } from "../../../src/twenty/payloads.ts";
import { runTwentyTrials, setupTwentyContext } from "../../../src/twenty/run-case.ts";
import { guards } from "./guards.ts";

test.describe.configure({ timeout: 600_000 });

test("P6-TW-RACE-001: two PATCH of one company name end on one of the two values, no 5xx", async () => {
  const ctx = await setupTwentyContext();
  const { histogram, trials } = await runTwentyTrials({
    caseId: "P6-TW-RACE-001",
    title: "two PATCH of one company name",
    concurrency: 2,
    attempt: async (trial) => {
      const id = (await createCompany(ctx.base, ctx.auth, companyName(ctx.prefix, trial, "rec")))
        .id!;
      const A = companyName(ctx.prefix, trial, "A");
      const B = companyName(ctx.prefix, trial, "B");
      const fired = await fireTogether(2, async (i) => {
        const r = await patchCompany(ctx.base, ctx.auth, id, { name: i === 0 ? A : B });
        return { status: r.status, body: r.text };
      });
      const got = (await restCall(ctx.base, ctx.auth, "GET", `/companies/${id}`)).json as {
        data?: { company?: { name?: string } };
      } | null;
      await destroyCompany(ctx.base, ctx.auth, id);
      return {
        requests: fired.requests,
        oracle: {
          final: got?.data?.company?.name ?? null,
          A,
          B,
          overlapped: overlapped(fired.requests),
        },
      };
    },
    leakCheck: async () => ({
      companyRowsLeft: await companyRowsByPrefix(ctx.pool, ctx.schema, ctx.prefix),
    }),
  });

  guards(trials, histogram);
  for (const t of trials) {
    const o = t.value!.oracle;
    expect(
      () => assertNo5xx(t.value!.requests!.map((r) => r.status)),
      `trial ${t.trial}`,
    ).not.toThrow();
    expect(
      () => assertNameIsOneOf(o.final as string | null, [o.A as string, o.B as string]),
      `trial ${t.trial}`,
    ).not.toThrow();
  }
});
