import { expect, test } from "@playwright/test";
import { fireTogether } from "../../../src/races/fire-together.ts";
import { companyRowsByPrefix } from "../../../src/twenty/oracle.ts";
import { createTask, graphqlCall, patchTaskPosition, restCall } from "../../../src/twenty/api.ts";
import { assertNo5xx, overlapped } from "../../../src/twenty/invariants.ts";
import { companyName } from "../../../src/twenty/payloads.ts";
import { runTwentyTrials, setupTwentyContext } from "../../../src/twenty/run-case.ts";
import { guards } from "./guards.ts";

test.describe.configure({ timeout: 600_000 });

// destroyTask is not probed yet (Q6): the cleanup result is recorded and never asserted.
const destroyTask = (base: string, auth: string, id: string) =>
  graphqlCall(
    base,
    "/graphql",
    "mutation D($id: UUID!) { destroyTask(id: $id) { id } }",
    { id },
    auth,
  );

test("P6-TW-RACE-002: two PATCH of one task's position end on one of the two values, no 5xx", async () => {
  const ctx = await setupTwentyContext();
  const { histogram, trials } = await runTwentyTrials({
    caseId: "P6-TW-RACE-002",
    title: "kanban position: two PATCH of one task",
    concurrency: 2,
    attempt: async (trial) => {
      const created = await createTask(ctx.base, ctx.auth, companyName(ctx.prefix, trial, "task"));
      const id = (created.json as { data?: { createTask?: { id?: string } } } | null)?.data
        ?.createTask?.id;
      if (!id) throw new Error("TEST BUG: createTask returned no id");
      const fired = await fireTogether(2, async (i) => {
        const r = await patchTaskPosition(ctx.base, ctx.auth, id, i === 0 ? 10 : 20);
        return { status: r.status, body: r.text };
      });
      const got = (await restCall(ctx.base, ctx.auth, "GET", `/tasks/${id}`)).json as {
        data?: { task?: { position?: number | null } };
      } | null;
      const del = await destroyTask(ctx.base, ctx.auth, id);
      return {
        requests: fired.requests,
        oracle: {
          final: got?.data?.task?.position ?? null,
          overlapped: overlapped(fired.requests),
          taskDestroyed: del.json?.errors === undefined,
        },
      };
    },
    leakCheck: async () => ({
      companyRowsLeft: await companyRowsByPrefix(ctx.pool, ctx.schema, ctx.prefix),
    }),
  });

  guards(trials, histogram);
  for (const t of trials) {
    const final = t.value!.oracle.final as number | null;
    expect(
      () => assertNo5xx(t.value!.requests!.map((r) => r.status)),
      `trial ${t.trial}`,
    ).not.toThrow();
    expect([10, 20], `trial ${t.trial}: final position ${final} is neither 10 nor 20`).toContain(
      final,
    );
  }
});
