import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  failFirstPerEvent,
  headerSecretCheck,
  startWebhookReceiver,
  type WebhookDelivery,
} from "../../src/receivers/webhook-receiver.ts";

const deliveryOf = (event: string): WebhookDelivery => ({
  receivedAt: 0,
  path: "/hook",
  host: "h",
  event,
  body: { event },
  secretMatches: true,
});

async function post(url: string): Promise<{ status: number; body: string }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ event: "DOCUMENT_COMPLETED" }),
  });
  return { status: res.status, body: await res.text() };
}

describe("webhook receiver responder", () => {
  it('with no responder the answer stays 200 with body {"ok":true} and the delivery records status 200', async () => {
    const rx = await startWebhookReceiver({
      publicHost: "127.0.0.1",
      check: headerSecretCheck("x", null),
    });
    try {
      const out = await post(`http://127.0.0.1:${rx.port}/hook`);
      assert.equal(out.status, 200);
      assert.equal(out.body, '{"ok":true}');
      assert.equal(rx.deliveries[0]?.status, 200);
    } finally {
      await rx.close();
    }
  });

  it("the responder's status is sent and recorded", async () => {
    const rx = await startWebhookReceiver({
      publicHost: "127.0.0.1",
      check: headerSecretCheck("x", null),
      respond: () => 503,
    });
    try {
      const out = await post(`http://127.0.0.1:${rx.port}/hook`);
      assert.equal(out.status, 503);
      assert.equal(out.body, '{"ok":false}');
      assert.equal(rx.deliveries[0]?.status, 503);
    } finally {
      await rx.close();
    }
  });

  it("failFirstPerEvent answers 500 for the first delivery of each event key and 200 afterwards", () => {
    const respond = failFirstPerEvent((d) => String(d.event));
    assert.equal(respond(deliveryOf("A"), 0), 500);
    assert.equal(respond(deliveryOf("A"), 1), 200);
    assert.equal(respond(deliveryOf("B"), 2), 500);
    assert.equal(respond(deliveryOf("A"), 3), 200);
  });
});
