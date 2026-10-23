import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { lookup } from "node:dns/promises";
import { isDeepStrictEqual } from "node:util";
import { expect, test } from "@playwright/test";
import { fireTogether } from "../../../src/races/fire-together.ts";
import { runTrials } from "../../../src/races/run-trials.ts";
import { createHistogram, writeHistogram } from "../../../src/races/histogram.ts";
import { createRerunRunner, spreadPolicyFromEnv } from "../../../src/races/rerun-on-spread.ts";
import { recordTrial } from "../../../src/races/trial-record.ts";
import { raceTrialsFromEnv } from "../../../src/races/env.ts";
import {
  closePool,
  createReadOnlyPool,
  selectRows,
  waitForStable,
} from "../../../src/oracles/pg.ts";
import {
  documensoBaseUrlFromEnv,
  documensoDatabaseUrlFromEnv,
  inbucketBaseUrlFromEnv,
  webhookHostFromEnv,
} from "../../../src/documenso/env.ts";
import { createInbucketClient, mailboxName } from "../../../src/documenso/inbucket.ts";
import {
  headerSecretCheck,
  startWebhookReceiver,
} from "../../../src/receivers/webhook-receiver.ts";
import {
  createApiToken,
  createWebhook,
  deleteAccount,
  deleteApiToken,
  deleteWebhook,
  signUpVerifiedUser,
  testWebhook,
  type DocumensoAccount,
  type DocumensoSession,
} from "../../../src/documenso/account.ts";
import { leakCheck, readWebhookCalls } from "../../../src/documenso/oracle.ts";
import { casePrefix, likeLiteralPrefix } from "../../../src/medusa/payloads.ts";
import { p6RunPrefix } from "../../../src/races/prefix.ts";

const CASE_ID = "documenso-self-test";
const CONCURRENCY = 20;
// Plan §2.1: the fastest 200 that needs the app and the session layer.
const HEALTH_PATH = "/api/auth/csrf";
const WEBHOOK_EVENT = "DOCUMENT_COMPLETED";

test.describe.configure({ timeout: 120_000 });

test.beforeAll(async () => {
  const host = webhookHostFromEnv();
  const { address } = await lookup(host, { family: 4 }).catch(() => ({ address: "unresolved" }));
  if (address !== "127.0.0.1") {
    throw new Error(
      `ENV: ${host} does not resolve to 127.0.0.1 (got ${address}); add "127.0.0.1 ${host}" to /etc/hosts (plan §13.3)`,
    );
  }
});

/** Plan §9 / §2.8: an INSERT in an explicit transaction must be refused (25006); always ROLLBACK. */
async function readOnlyInsertSqlstate(
  pool: ReturnType<typeof createReadOnlyPool>,
): Promise<string> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    try {
      await client.query('INSERT INTO "Webhook" DEFAULT VALUES');
      return "accepted";
    } catch (err) {
      return err && typeof err === "object" && "code" in err
        ? String((err as { code: unknown }).code)
        : "";
    }
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
}

test("documenso self-test (unmapped): health burst, oracle, one email, one webhook", async () => {
  const trials = raceTrialsFromEnv();
  const base = documensoBaseUrlFromEnv();
  const inbucket = createInbucketClient(inbucketBaseUrlFromEnv());
  const webhookHost = webhookHostFromEnv();
  const pool = createReadOnlyPool(documensoDatabaseUrlFromEnv());
  const prefix = casePrefix(p6RunPrefix(), CASE_ID);
  const email = `${prefix}-owner@example.com`;
  const mailbox = mailboxName(email);
  const histogram = createHistogram({
    caseId: CASE_ID,
    title: "documenso self-test (unmapped)",
    product: "documenso",
    concurrency: CONCURRENCY,
    trials,
  });

  let account: DocumensoAccount | null = null;
  // Holds the session as soon as verify-email succeeds, so cleanup can delete the user even if a
  // later organisation or team lookup fails (the account object is only built after both).
  const verified: { session?: DocumensoSession } = {};
  let tokenId: number | null = null;
  let webhookId: string | null = null;
  let receiver: Awaited<ReturnType<typeof startWebhookReceiver>> | null = null;
  const cleanupViolations: string[] = [];
  let passed = false;
  let trialsOk = false;

  try {
    // 1. Health burst: every trial fires 20 gated GET /api/auth/csrf at once.
    const runner = createRerunRunner(spreadPolicyFromEnv(), trials);
    // One burst = fire, record, validate. Trial index 0 is the warm-up (left out of every verdict and count).
    const burst = async (trial: number) => {
      const fired = await fireTogether(
        CONCURRENCY,
        async () => {
          const res = await fetch(`${base}${HEALTH_PATH}`);
          return { status: res.status, body: await res.text() };
        },
        {
          warm: async () => {
            const res = await fetch(`${base}${HEALTH_PATH}`);
            await res.text();
          },
        },
      );

      // Record first so perTrial and statusCounts keep the real statuses even when validation fails.
      const record = recordTrial(trial, fired, () => {
        for (const req of fired.requests) {
          if (req.status !== 200) {
            throw new Error(
              `PRODUCT BUG: GET ${HEALTH_PATH} HTTP ${req.status} ${req.bodySummary}`,
            );
          }
        }
      });

      return record;
    };
    await runner.warmup(() => burst(0));
    const trialResults = await runTrials(trials, (trial) =>
      runner.runTrial(trial, () => burst(trial)),
    );

    runner.applyTo(histogram);
    trialsOk = trialResults.every((t) => t.ok);

    // 2. Oracle: the read-only pool answers, and refuses a write with SQLSTATE 25006.
    const stableOne = await waitForStable(() =>
      selectRows<{ ok: number | string }>(pool, "SELECT 1 AS ok"),
    );
    histogram.oracle.selectOne = stableOne[0]?.ok ?? null;
    expect(Number(stableOne[0]?.ok)).toBe(1);

    const sqlstate = await readOnlyInsertSqlstate(pool);
    histogram.oracle.readOnlySqlstate = sqlstate;
    expect(sqlstate, `TEST BUG: expected SQLSTATE 25006, got ${sqlstate || "no code"}`).toBe(
      "25006",
    );

    // 3. One per-run user through signup and email verification; exactly one confirmation mail.
    account = await signUpVerifiedUser({
      baseUrl: base,
      inbucketBaseUrl: inbucketBaseUrlFromEnv(),
      email,
      onVerified: (session) => {
        verified.session = session;
      },
      name: "P6 Owner",
    });
    const confirmations = await inbucket.list(mailbox);
    histogram.oracle.confirmationEmails = confirmations.length;
    expect(confirmations.length, "PRODUCT BUG: confirmation email count is not 1").toBe(1);

    // 4. API token minted through the product's own API, then used on API v1.
    const mintStarted = Date.now();
    const token = await createApiToken(base, account, `${prefix}-token`);
    histogram.oracle.mintMs = Date.now() - mintStarted;
    tokenId = token.id;
    const apiRes = await fetch(`${base}/api/v1/documents?page=1&perPage=1`, {
      headers: { authorization: `Bearer ${token.token}` },
    });
    await apiRes.text();
    histogram.oracle.apiV1Status = apiRes.status;
    expect(apiRes.status, `PRODUCT BUG: GET /api/v1/documents HTTP ${apiRes.status}`).toBe(200);

    // 5. One webhook: testWebhook must deliver once, signed, and leave one SUCCESS WebhookCall.
    const secret = randomBytes(16).toString("hex");
    receiver = await startWebhookReceiver({
      publicHost: webhookHost,
      check: headerSecretCheck("x-documenso-secret", secret),
    });
    const hook = await createWebhook(base, account, {
      webhookUrl: receiver.url,
      eventTriggers: [WEBHOOK_EVENT],
      secret,
    });
    webhookId = hook.id;
    const fireStarted = Date.now();
    await testWebhook(base, account, hook.id, WEBHOOK_EVENT);
    const deliveries = await receiver.waitForDeliveries(1, 10_000);
    const rows = await readWebhookCalls(pool, hook.id);
    const delivery = deliveries[0];
    const row = rows[0];

    histogram.oracle.webhookDeliveries = deliveries.length;
    histogram.oracle.deliveryMs = delivery ? delivery.receivedAt - fireStarted : null;
    histogram.oracle.webhookSecretMatches = delivery?.secretMatches ?? false;
    histogram.oracle.webhookCallRows = rows.length;
    histogram.oracle.webhookCallStatus = row?.status ?? null;
    histogram.oracle.webhookCallResponseCode = row?.responseCode ?? null;
    histogram.oracle.webhookBodyMatches = Boolean(
      delivery && row && isDeepStrictEqual(row.requestBody, delivery.body),
    );

    if (deliveries.length === 0 && row?.status === "FAILED" && row.responseCode === 0) {
      throw new Error(
        `ENV: webhook blocked; NEXT_PRIVATE_WEBHOOK_SSRF_BYPASS_HOSTS must list ${webhookHost}`,
      );
    }
    expect(deliveries.length, "PRODUCT BUG: webhook delivery count is not 1").toBe(1);
    expect(delivery?.secretMatches, "PRODUCT BUG: webhook secret header does not match").toBe(true);
    expect(delivery?.event).toBe(WEBHOOK_EVENT);
    expect(rows.length, "PRODUCT BUG: WebhookCall row count is not 1").toBe(1);
    expect(row?.status, "PRODUCT BUG: WebhookCall status is not SUCCESS").toBe("SUCCESS");
    expect(row?.responseCode, "PRODUCT BUG: WebhookCall responseCode is not 200").toBe(200);
    expect(new URL(row?.url ?? "").hostname).toBe(webhookHost);
    expect(
      isDeepStrictEqual(row?.requestBody, delivery?.body),
      "PRODUCT BUG: WebhookCall.requestBody differs from the delivered body",
    ).toBe(true);

    expect(trialsOk).toBe(true);
    passed = true;
  } finally {
    // Cleanup: each step best effort; a failure is a TEST BUG and makes the run fail.
    const step = async (name: string, fn: () => Promise<unknown>) => {
      try {
        await fn();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        cleanupViolations.push(`TEST BUG: cleanup ${name} failed: ${message.slice(0, 200)}`);
      }
    };
    if (account && webhookId !== null) {
      const acc = account;
      const id = webhookId;
      await step("deleteWebhook", () => deleteWebhook(base, acc, id));
    }
    if (account && tokenId !== null) {
      const acc = account;
      const id = tokenId;
      await step("deleteApiToken", () => deleteApiToken(base, acc, id));
    }
    const owner = account ?? verified.session;
    if (owner) {
      await step("deleteAccount", () => deleteAccount(base, owner));
    }
    await step("purgeMailbox", () => inbucket.purge(mailbox));
    const mailboxCount = await inbucket.list(mailbox).then(
      (items) => items.length,
      () => -1,
    );
    if (receiver) {
      const r = receiver;
      await step("receiverClose", () => r.close());
    }

    try {
      const leak = await leakCheck(pool, {
        userLikePattern: likeLiteralPrefix(`${prefix}-`),
        teamId: account?.teamId ?? null,
        mailboxCount,
      });
      Object.assign(histogram.oracle, leak.counts);
      histogram.invariantViolations.push(...leak.violations);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      cleanupViolations.push(`TEST BUG: leak check failed: ${message.slice(0, 200)}`);
    }
    histogram.invariantViolations.push(...cleanupViolations);

    histogram.verdict =
      passed && trialsOk && histogram.invariantViolations.length === 0 ? "pass" : "fail";
    histogram.finishedAt = new Date().toISOString();
    try {
      await writeHistogram(histogram);
    } finally {
      await closePool(pool);
    }
  }

  expect(histogram.invariantViolations, histogram.invariantViolations.join("; ")).toEqual([]);

  const raw = JSON.parse(await readFile("results/races/documenso-self-test.json", "utf8"));
  expect(raw.caseId).toBe(CASE_ID);
  expect(raw.title).toBe("documenso self-test (unmapped)");
  expect(raw.product).toBe("documenso");
  expect(raw.verdict).toBe("pass");
  expect(raw.trialsRequested).toBe(trials);
  expect(raw.concurrency).toBe(CONCURRENCY);
  expect(raw.oracle.readOnlySqlstate).toBe("25006");
  expect(raw.oracle.leakUsers).toBe(0);
  expect(raw.oracle.leakWebhooks).toBe(0);
  expect(raw.oracle.leakApiTokens).toBe(0);
  expect(raw.oracle.leakMails).toBe(0);
});
