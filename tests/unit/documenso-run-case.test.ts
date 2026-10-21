import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type pg from "pg";
import { CookieJar, type DocumensoSession } from "../../src/documenso/account.ts";
import { mailboxName } from "../../src/documenso/inbucket.ts";
import { startRun, type StartRunDeps } from "../../src/documenso/run-case.ts";

const INPUT = {
  baseUrl: "http://127.0.0.1:1",
  inbucketUrl: "http://127.0.0.1:2",
  runPrefix: "P6-QA-TEST",
  pool: {} as unknown as pg.Pool,
  webhookHost: "p6-webhook.test",
};
const OWNER_MAILBOX = mailboxName("p6-qa-test-owner@example.com");

type Recorded = {
  verified?: DocumensoSession;
  removed: DocumensoSession[];
  purged: string[];
  closed: boolean;
};

/** Fakes for every network call startRun makes. The owner verifies, then the named step fails. */
function fakeDeps(rec: Recorded, fail: { hook?: Error; remove?: Error }): StartRunDeps {
  return {
    startReceiver: async () => ({
      port: 1,
      url: "http://p6-webhook.test:1/hook",
      deliveries: [],
      waitForDeliveries: async () => [],
      close: async () => {
        rec.closed = true;
      },
    }),
    signUp: async (opts) => {
      const session: DocumensoSession = { jar: new CookieJar() };
      rec.verified = session;
      opts.onVerified?.(session);
      return {
        email: opts.email,
        teamId: 1,
        jar: session.jar,
        timings: { signupMs: 0, confirmMailMs: 0, totalMs: 0 },
      };
    },
    createToken: async () => ({ id: 7, token: "fake-token-value" }),
    createHook: async () => {
      if (fail.hook) throw fail.hook;
      return { id: "hook-1" };
    },
    removeAccount: async (_baseUrl, session) => {
      rec.removed.push(session);
      if (fail.remove) throw fail.remove;
    },
    purgeMailbox: async (_url, mailbox) => {
      rec.purged.push(mailbox);
    },
  };
}

const newRecord = (): Recorded => ({ removed: [], purged: [], closed: false });

describe("startRun setup failure", () => {
  it("deletes the verified owner and rethrows the original error when createWebhook fails", async () => {
    const rec = newRecord();
    const original = new Error("PRODUCT BUG: webhook.createWebhook HTTP 500");
    await assert.rejects(
      startRun(INPUT, fakeDeps(rec, { hook: original })),
      (err: unknown) => err === original,
    );
    assert.equal(rec.removed.length, 1);
    assert.equal(rec.removed[0], rec.verified);
    assert.deepEqual(rec.purged, [OWNER_MAILBOX]);
    assert.equal(rec.closed, true);
  });

  it("still rethrows the original error when the owner cleanup fails", async () => {
    const rec = newRecord();
    const original = new Error("PRODUCT BUG: webhook.createWebhook HTTP 500");
    await assert.rejects(
      startRun(INPUT, fakeDeps(rec, { hook: original, remove: new Error("cleanup failed") })),
      (err: unknown) => err === original,
    );
    assert.equal(rec.removed.length, 1);
    assert.deepEqual(rec.purged, [OWNER_MAILBOX]);
    assert.equal(rec.closed, true);
  });
});
