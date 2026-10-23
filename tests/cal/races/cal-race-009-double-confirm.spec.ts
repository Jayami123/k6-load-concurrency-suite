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
// Owner label (O6, 2026-10-23): F-C3 is PRODUCT BUG after three full-count runs; see the known-bug test.
const labelled: readonly string[] = ["F-C3"];
let labelledFound: string[] = [];
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
const TITLE = "confirm || confirm on one PENDING booking → one ACCEPTED, one webhook";

test.describe.serial(`${CASE} Cal confirm vs cancel`, () => {
  test.describe.configure({ timeout: 120_000 + trials * 15_000 });

  test(`${CASE} ${TITLE}`, async () => {
    const result = await runPendingRaceCase({
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
    const { histogram, suspected } = result;
    labelledFound = result.labelled;
    for (const line of suspected) {
      const type = labelledFound.includes(line) ? "product-bug" : "suspected-bug";
      test.info().annotations.push({ type, description: line });
    }
    expect(histogram.invariantViolations, histogram.invariantViolations.join("; ")).toEqual([]);
    expect(histogram.verdict).toBe("pass");
  });

  // PRODUCT BUG F-C3 (double confirm): two confirms on one PENDING booking both succeed and two BOOKING_CREATED webhooks fire.
  // Labelled by the owner (O6, 2026-10-23) after three full-count runs, one attempt each in 50 trials:
  // https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39932990882
  // https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39935674101
  // https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39938126238
  // Trials 50 of 50 per run (150 of 150 attempts). When this test turns red ("expected to fail but passed"), the bug is
  // fixed: remove test.fail() and the label.
  test("P6-CAL-RACE-009 known bug F-C3: two confirms both succeed reproduces", async () => {
    test.fail();
    expect(labelledFound, labelledFound.join("; ")).toEqual([]);
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
