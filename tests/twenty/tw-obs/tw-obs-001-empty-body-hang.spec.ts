import { expect, test } from "@playwright/test";
import { classify } from "../../../src/twenty/timed-post.ts";
import { ENDPOINTS, HANG_LIMIT_MS, measureHang, setupObs, type ObsContext } from "./shared.ts";

const BODIES = [
  { name: "an empty body", body: "" },
  { name: "{}", body: "{}" },
] as const;
const MODES = [
  { name: "authenticated", withAuth: true },
  { name: "without Authorization", withAuth: false },
] as const;

let ctx: ObsContext;
test.beforeAll(async () => {
  ctx = await setupObs();
});

// P6-OBS-TW-001 is a PRODUCT BUG (owner label, 2026-10-23, docs/BACKLOG.md). The unauthenticated tests are the same bug with a
// wider precondition (owner-confirmed). The strict assertion accepts any 4xx, not only 400: the bug is the missing answer, and any
// 4xx (400, 411, 422) ends the hang and is a valid fix.
for (const mode of MODES) {
  for (const path of ENDPOINTS) {
    for (const { name, body } of BODIES) {
      test(`P6-OBS-TW-001 PRODUCT BUG: POST ${path} with ${name} (${mode.name}) gets a 4xx within ${HANG_LIMIT_MS / 1000} s, never a hang`, async () => {
        const authorization = mode.withAuth ? ctx.authorization : undefined;

        // 1. Guards (inside measureHang) and the request under test. The client is destroyed in finally.
        const { result, socketsLeft } = await measureHang(ctx.base, path, body, authorization);

        // 2. Checks that stay red. A 5xx, a connection error or a 2xx is a different finding, not this bug.
        expect(socketsLeft, "leak check: sockets still in flight after the request ended").toBe(0);
        expect(
          ["hang", "client-error"],
          `neither a hang nor a 4xx (outcome ${result.outcome}, status ${result.status}): not P6-OBS-TW-001`,
        ).toContain(classify(result));

        // 3. Label, then the strict assertion. test.fail() is called only after steps 1 and 2 passed.
        test.info().annotations.push({
          type: "issue",
          description: `P6-OBS-TW-001: PRODUCT BUG${mode.withAuth ? "" : " (no Authorization header)"}, POST ${path} with ${name} gets no response (hang), expected a 4xx`,
        });
        test.fail();
        expect(classify(result), `a 4xx within ${HANG_LIMIT_MS} ms (got ${result.outcome})`).toBe(
          "client-error",
        );
        expect(result.totalMs).toBeLessThan(HANG_LIMIT_MS);
      });
    }
  }
}
