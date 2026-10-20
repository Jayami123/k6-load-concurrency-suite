import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseDelivery, startWebhookReceiver } from "../../src/documenso/webhook-receiver.ts";

const base = { path: "/hook", receivedAt: 1, expectedSecret: "s" };

describe("parseDelivery", () => {
  it("matches the expected secret and reads the event", () => {
    const d = parseDelivery({
      ...base,
      headers: { host: "p6-webhook.test:1", "x-documenso-secret": "s" },
      rawBody: '{"event":"DOCUMENT_COMPLETED","payload":{}}',
    });
    assert.equal(d.secretMatches, true);
    assert.equal(d.event, "DOCUMENT_COMPLETED");
    assert.equal(d.host, "p6-webhook.test:1");
  });

  it("reports a wrong or missing secret without storing it", () => {
    const wrong = parseDelivery({
      ...base,
      headers: { "x-documenso-secret": "nope" },
      rawBody: "{}",
    });
    const missing = parseDelivery({ ...base, headers: {}, rawBody: "{}" });
    assert.equal(wrong.secretMatches, false);
    assert.equal(missing.secretMatches, false);
    assert.equal(JSON.stringify(wrong).includes("nope"), false);
  });

  it("keeps a non-JSON body as null with no event", () => {
    const d = parseDelivery({ ...base, headers: {}, rawBody: "not json" });
    assert.equal(d.body, null);
    assert.equal(d.event, null);
  });
});

describe("startWebhookReceiver", () => {
  it("is addressed by the public host and records a real POST", async () => {
    const receiver = await startWebhookReceiver({
      publicHost: "p6-webhook.test",
      expectedSecret: "s",
    });
    try {
      assert.match(receiver.url, /^http:\/\/p6-webhook\.test:\d+\/hook$/);
      const res = await fetch(`http://127.0.0.1:${receiver.port}/hook`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-documenso-secret": "s" },
        body: JSON.stringify({ event: "DOCUMENT_COMPLETED" }),
      });
      assert.equal(res.status, 200);
      assert.equal(await res.text(), '{"ok":true}');
      const [delivery] = await receiver.waitForDeliveries(1, 2_000);
      assert.equal(receiver.deliveries.length, 1);
      assert.equal(delivery?.event, "DOCUMENT_COMPLETED");
      assert.equal(delivery?.secretMatches, true);
    } finally {
      await receiver.close();
    }
  });
});
