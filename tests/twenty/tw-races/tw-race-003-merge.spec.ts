import { expect, test } from "@playwright/test";
import { fireTogether } from "../../../src/races/fire-together.ts";
import { companyRowsByPrefix, companyLiveRows } from "../../../src/twenty/oracle.ts";
import { createCompany, destroyCompany, mergeCompanies } from "../../../src/twenty/api.ts";
import { assertNo5xx, assertOneSurvivor, overlapped } from "../../../src/twenty/invariants.ts";
import { companyName } from "../../../src/twenty/payloads.ts";
import { runTwentyTrials, setupTwentyContext } from "../../../src/twenty/run-case.ts";
import { guards } from "./guards.ts";

test.describe.configure({ timeout: 600_000 });

test("P6-TW-RACE-003: two parallel merges of one pair leave one live row and one survivor", async () => {
  const ctx = await setupTwentyContext();
  const { histogram, trials } = await runTwentyTrials({
    caseId: "P6-TW-RACE-003",
    title: "concurrent merge of the same company pair",
    concurrency: 2,
    attempt: async (trial) => {
      const a = (await createCompany(ctx.base, ctx.auth, companyName(ctx.prefix, trial, "A"))).id!;
      const b = (await createCompany(ctx.base, ctx.auth, companyName(ctx.prefix, trial, "B"))).id!;
      const survivors: Array<string | null> = [null, null];
      const fired = await fireTogether(2, async (i) => {
        const r = await mergeCompanies(ctx.base, ctx.auth, [a, b]);
        survivors[i] =
          (r.json as { data?: { mergeCompanies?: { id?: string } } } | null)?.data?.mergeCompanies
            ?.id ?? null;
        return { status: r.status, body: r.text };
      });
      const liveRows = await companyLiveRows(ctx.pool, ctx.schema, [a, b]);
      for (const id of new Set(survivors.filter((s): s is string => s !== null))) {
        await destroyCompany(ctx.base, ctx.auth, id);
      }
      await destroyCompany(ctx.base, ctx.auth, a);
      await destroyCompany(ctx.base, ctx.auth, b);
      return {
        requests: fired.requests,
        oracle: {
          liveRows,
          survivors: survivors.map((s) => s ?? "").join(","),
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
    const survivorIds = (o.survivors as string).split(",").map((s) => s || null);
    expect(
      () => assertNo5xx(t.value!.requests!.map((r) => r.status)),
      `trial ${t.trial}`,
    ).not.toThrow();
    expect(
      () => assertOneSurvivor(o.liveRows as number, survivorIds),
      `trial ${t.trial}`,
    ).not.toThrow();
  }
});
