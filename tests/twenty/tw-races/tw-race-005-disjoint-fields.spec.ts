import { expect, test } from "@playwright/test";
import { fireTogether } from "../../../src/races/fire-together.ts";
import { companyRowsByPrefix } from "../../../src/twenty/oracle.ts";
import { createCompany, destroyCompany, patchCompany, restCall } from "../../../src/twenty/api.ts";
import { assertBothKept, assertNo5xx, overlapped } from "../../../src/twenty/invariants.ts";
import { companyName } from "../../../src/twenty/payloads.ts";
import { runTwentyTrials, setupTwentyContext } from "../../../src/twenty/run-case.ts";
import { guards } from "./guards.ts";

test.describe.configure({ timeout: 600_000 });

test("P6-TW-RACE-005: PATCH of name and PATCH of employees on one company both persist", async () => {
  const ctx = await setupTwentyContext();
  const { histogram, trials } = await runTwentyTrials({
    caseId: "P6-TW-RACE-005",
    title: "disjoint-field PATCHes on one company",
    concurrency: 2,
    attempt: async (trial) => {
      const id = (await createCompany(ctx.base, ctx.auth, companyName(ctx.prefix, trial, "dis")))
        .id!;
      const name = companyName(ctx.prefix, trial, "X");
      const employees = 100 + trial;
      const fired = await fireTogether(2, async (i) => {
        const r = await patchCompany(ctx.base, ctx.auth, id, i === 0 ? { name } : { employees });
        return { status: r.status, body: r.text };
      });
      const got = (await restCall(ctx.base, ctx.auth, "GET", `/companies/${id}`)).json as {
        data?: { company?: { name?: string | null; employees?: number | null } };
      } | null;
      await destroyCompany(ctx.base, ctx.auth, id);
      return {
        requests: fired.requests,
        oracle: {
          name: got?.data?.company?.name ?? null,
          employees: got?.data?.company?.employees ?? null,
          wantName: name,
          wantEmployees: employees,
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
      () =>
        assertBothKept(
          { name: o.name as string | null, employees: o.employees as number | null },
          { name: o.wantName as string, employees: o.wantEmployees as number },
        ),
      `trial ${t.trial}`,
    ).not.toThrow();
  }
});
