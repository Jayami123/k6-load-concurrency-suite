import { randomBytes } from "node:crypto";
import { test, expect } from "@playwright/test";
import { createSlotAllocator } from "../../../src/cal/api.ts";
import { hostPasswordFromProducts, loginAsHost } from "../../../src/cal/session.ts";
import { resolveConfirmSetup } from "../../../src/cal/state-oracle.ts";
import {
  runPendingRaceCase,
  subscribeWebhook,
  unsubscribeWebhook,
} from "../../../src/cal/run-state-case.ts";
import {
  hmacSignatureCheck,
  startWebhookReceiver,
} from "../../../src/receivers/webhook-receiver.ts";
import { webhookHostFromEnv } from "../../../src/documenso/env.ts";
import { closePool, createReadOnlyPool } from "../../../src/oracles/pg.ts";
import {
  calBaseUrlFromEnv,
  calDatabaseUrlFromEnv,
  raceTrialsFromEnv,
} from "../../../src/races/env.ts";
import { p6RunPrefix } from "../../../src/races/prefix.ts";
import { readFile } from "node:fs/promises";

const trials = raceTrialsFromEnv();
const runPrefix = p6RunPrefix();
const pool = createReadOnlyPool(calDatabaseUrlFromEnv());
// Owner labels go here after 3 full-count CI runs (D-C7, O6). Empty until then.
const labelled: readonly string[] = [];
const secret = randomBytes(16).toString("hex"); // per run, never printed (the receiver verifies the HMAC)
const base = calBaseUrlFromEnv();
let setup: Awaited<ReturnType<typeof resolveConfirmSetup>>;
let slots: ReturnType<typeof createSlotAllocator>;
let cookie: string;
let receiver: Awaited<ReturnType<typeof startWebhookReceiver>>;
let webhookId: string;

test.beforeAll(async () => {
  setup = await resolveConfirmSetup(pool); // TEST BUG if the seed changed
  slots = createSlotAllocator(setup.eventTypeId, {
    pool,
    userId: setup.userId,
    slug: "tennis-class",
    minutes: 60,
  });
  cookie = await loginAsHost(base, hostPasswordFromProducts());
  receiver = await startWebhookReceiver({
    publicHost: webhookHostFromEnv(),
    check: hmacSignatureCheck(secret),
  });
  webhookId = await subscribeWebhook(base, cookie, setup.eventTypeId, receiver.url, secret);
});
test.afterAll(async () => {
  if (webhookId) await unsubscribeWebhook(base, cookie, webhookId);
  await receiver?.close();
  await closePool(pool);
});

const CASE = "P6-CAL-RACE-009";
const TITLE =
  "confirm || confirm on one PENDING booking → one ACCEPTED, one webhook (SUSPECTED F-C3 recorded)";

test.describe.serial(`${CASE} Cal confirm vs cancel`, () => {
  test.describe.configure({ timeout: 120_000 + trials * 15_000 });

  test(`${CASE} ${TITLE}`, async () => {
    const { histogram, suspected } = await runPendingRaceCase({
      pool,
      setup,
      slots,
      receiver,
      cookie,
      runPrefix,
      caseId: CASE,
      title: TITLE,
      mode: "confirm-confirm",
      trials,
      labelled,
    });
    for (const line of suspected) {
      test.info().annotations.push({ type: "suspected-bug", description: line });
    }
    expect(histogram.invariantViolations, histogram.invariantViolations.join("; ")).toEqual([]);
    expect(histogram.verdict).toBe("pass");
  });

  test(`${CASE} histogram artefact`, async () => {
    const raw = JSON.parse(await readFile(`results/races/${CASE}.json`, "utf8"));
    expect(raw.caseId).toBe(CASE);
    expect(raw.product).toBe("cal");
    expect(raw.trialsRequested).toBe(trials);
    expect(raw.trials).toHaveLength(trials);
    expect(raw.oracle.emailObservable).toBe(false); // D9: the email gap is recorded, not asserted
    expect(raw.verdict).toBe("pass");
  });
});
