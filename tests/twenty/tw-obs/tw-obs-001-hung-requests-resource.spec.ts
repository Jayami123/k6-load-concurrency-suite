import { expect, test } from "@playwright/test";
import {
  createPostClient,
  type PostHandle,
  type TimedPostResult,
} from "../../../src/twenty/timed-post.ts";
import {
  assertGuards,
  ENDPOINTS,
  GUARD_MS,
  HANG_LIMIT_MS,
  HELD_REQUESTS,
  HOLD_TIMEOUT_MS,
  SETTLE_MS,
  VALID_QUERY,
  setupObs,
  waitUntil,
  type ObsContext,
} from "./shared.ts";

let ctx: ObsContext;
test.beforeAll(async () => {
  ctx = await setupObs();
});

// A passing test (no test.fail()): the bug does not make hung requests block valid ones (plan §3.3, §3.4).
// The post-abort query is part of this test because it needs the same ten held requests (owner Q6).
for (const path of ENDPOINTS) {
  test(`P6-OBS-TW-001 resource: ${HELD_REQUESTS} hung empty-body requests on ${path} do not stop a valid query (200 under ${GUARD_MS} ms)`, async () => {
    const authorization = ctx.authorization;
    const client = createPostClient(ctx.base);
    const held: PostHandle[] = [];
    let heldInFlight = -1;
    let during: TimedPostResult | undefined;
    let ended: TimedPostResult[] = [];
    let socketsLeft = -1;
    let after: TimedPostResult | undefined;
    try {
      await assertGuards(client, path, authorization); // baseline
      for (let i = 0; i < HELD_REQUESTS; i++) {
        held.push(client.start(path, "", { authorization, timeoutMs: HOLD_TIMEOUT_MS }));
      }
      await waitUntil(
        () => client.activeSockets() === HELD_REQUESTS,
        "all held requests in flight",
      );
      await new Promise((r) => setTimeout(r, SETTLE_MS));
      heldInFlight = client.activeSockets();
      during = await client.post(path, VALID_QUERY, { authorization, timeoutMs: HANG_LIMIT_MS });
      for (const h of held) h.abort(); // release the hung requests
      ended = await Promise.all(held.map((h) => h.result));
      socketsLeft = client.activeSockets();
      after = await client.post(path, VALID_QUERY, { authorization, timeoutMs: HANG_LIMIT_MS });
    } finally {
      for (const h of held) h.abort(); // safety net if anything above threw (abort is idempotent)
      client.destroy();
    }

    expect(heldInFlight, "all held requests were still in flight").toBe(HELD_REQUESTS);
    expect(
      { outcome: during?.outcome, status: during?.status },
      "valid query while the requests were hung",
    ).toEqual({ outcome: "response", status: 200 });
    expect(during?.totalMs, "valid query time while hung").toBeLessThan(GUARD_MS);
    expect(
      ended.map((r) => r.outcome),
      "every held request stayed hung until our abort (none answered, none closed by the server)",
    ).toEqual(Array(HELD_REQUESTS).fill("aborted"));
    expect(socketsLeft, "leak check: sockets in flight after the abort").toBe(0);
    expect(
      { outcome: after?.outcome, status: after?.status },
      "valid query after the abort",
    ).toEqual({ outcome: "response", status: 200 });
    expect(after?.totalMs, "valid query time after the abort").toBeLessThan(GUARD_MS);
  });
}
