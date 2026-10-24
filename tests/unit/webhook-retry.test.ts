import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { judgeWebhookRetry, type RetryInput } from "../../src/load/webhook-retry.ts";

/** Two events, each: 500 then 200 delivery, a FAILED and a SUCCESS call, one COMPLETED job with retried 1. */
function clean(): RetryInput {
  const keys = ["A", "B"];
  return {
    events: 2,
    deliveries: keys.flatMap((k) => [
      { eventKey: k, status: 500 },
      { eventKey: k, status: 200 },
    ]),
    calls: keys.flatMap((k) => [
      { eventKey: k, status: "FAILED", responseCode: 500 },
      { eventKey: k, status: "SUCCESS", responseCode: 200 },
    ]),
    jobs: keys.map((k) => ({ eventKey: k, status: "COMPLETED", retried: 1 })),
    completedEnvelopes: 2,
    documents: 2,
  };
}

const failedChecks = (i: RetryInput) =>
  judgeWebhookRetry(i)
    .findings.filter((f) => !f.ok)
    .map((f) => f.check);

describe("webhook retry judge", () => {
  it("the clean fail-first run passes", () => {
    assert.equal(judgeWebhookRetry(clean()).ok, true);
  });

  it("no retry at all fails the deliveries check", () => {
    const i = clean();
    i.deliveries = [
      { eventKey: "A", status: 200 },
      { eventKey: "B", status: 200 },
    ];
    assert.ok(failedChecks(i).includes("deliveries"));
  });

  it("a second 500 fails the deliveries check", () => {
    const i = clean();
    i.deliveries = [
      { eventKey: "A", status: 500 },
      { eventKey: "A", status: 500 },
      { eventKey: "A", status: 200 },
      { eventKey: "B", status: 500 },
      { eventKey: "B", status: 200 },
    ];
    assert.ok(failedChecks(i).includes("deliveries"));
  });

  it("a duplicate 200 fails the deliveries check", () => {
    const i = clean();
    i.deliveries = [
      { eventKey: "A", status: 500 },
      { eventKey: "A", status: 200 },
      { eventKey: "A", status: 200 },
      { eventKey: "B", status: 500 },
      { eventKey: "B", status: 200 },
    ];
    assert.ok(failedChecks(i).includes("deliveries"));
  });

  it("a job that was not retried exactly once fails the job check", () => {
    const i = clean();
    i.jobs[0] = { eventKey: "A", status: "COMPLETED", retried: 2 };
    assert.ok(failedChecks(i).includes("job"));
  });

  it("an envelope that is not COMPLETED fails the envelopes check", () => {
    const i = clean();
    i.completedEnvelopes = 1;
    assert.ok(failedChecks(i).includes("envelopes"));
  });
});
