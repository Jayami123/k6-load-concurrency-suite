import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import {
  assertInbucketList,
  assertInbucketMessage,
  countForEnvelope,
  createInbucketClient,
  envelopeIdOf,
  mailboxName,
  verifyEmailToken,
} from "../../src/documenso/inbucket.ts";

// Shape recorded from Inbucket in plan §2.5.
const listItem = {
  mailbox: "p6-qa-x-owner",
  id: "m1",
  from: "Documenso <noreply@documenso.com>",
  to: ["p6-qa-x-owner@example.com"],
  subject: "Please confirm your email",
  date: "2026-10-20T18:00:00Z",
  "posix-millis": 1792602000000,
  size: 1200,
  seen: false,
};
const message = {
  ...listItem,
  header: { "X-Documenso-Envelope-Id": ["envelope_abc"] },
  body: { text: "Confirm: /verify-email/tok_1", html: "<a>/verify-email/tok_1</a>" },
};

describe("mailboxName", () => {
  it("uses the lowercase local part of the address", () => {
    assert.equal(mailboxName("P6-QA-x@example.com"), "p6-qa-x");
  });

  it("refuses an address with characters Inbucket would not name", () => {
    assert.throws(() => mailboxName("a b@x.test"), /TEST BUG: bad mailbox address/);
  });
});

describe("envelope and token helpers", () => {
  it("reads the canonical envelope header, or null without it", () => {
    assert.equal(
      envelopeIdOf({ header: { "X-Documenso-Envelope-Id": ["envelope_a"] } }),
      "envelope_a",
    );
    assert.equal(envelopeIdOf({ header: {} }), null);
  });

  it("counts messages for one envelope", () => {
    const msgs = [
      { header: { "X-Documenso-Envelope-Id": ["envelope_a"] } },
      { header: { "X-Documenso-Envelope-Id": ["envelope_a"] } },
      { header: { "X-Documenso-Envelope-Id": ["envelope_b"] } },
    ];
    assert.equal(countForEnvelope(msgs, "envelope_a"), 2);
    assert.equal(countForEnvelope([{ header: {} }], "envelope_a"), 0);
  });

  it("extracts a verify-email token from text or html, else null", () => {
    assert.equal(
      verifyEmailToken({ body: { text: "/verify-email/abc_DEF-1", html: "" } }),
      "abc_DEF-1",
    );
    assert.equal(
      verifyEmailToken({ body: { text: "", html: "/verify-email/abc_DEF-1" } }),
      "abc_DEF-1",
    );
    assert.equal(verifyEmailToken({ body: { text: "no link", html: "" } }), null);
  });
});

describe("Inbucket shape guards", () => {
  it("accepts the recorded list shape", () => {
    assert.deepEqual(assertInbucketList([listItem]), [listItem]);
  });

  it("reports API drift as ENV for a wrong list shape", () => {
    assert.throws(
      () => assertInbucketList({}),
      /^Error: ENV: Inbucket API drift: list is not an array/,
    );
    assert.throws(
      () => assertInbucketList([{ ...listItem, id: 7 }]),
      /ENV: Inbucket API drift: list item id is not a string/,
    );
    assert.throws(
      () => assertInbucketList([{ ...listItem, to: "x" }]),
      /ENV: Inbucket API drift: list item to is not an array/,
    );
  });

  it("accepts the recorded message shape and reports a missing body.html as ENV", () => {
    assert.deepEqual(assertInbucketMessage(message), message);
    assert.throws(
      () => assertInbucketMessage({ ...message, body: { text: "t" } }),
      /ENV: Inbucket API drift: message body.text\/html is not a string/,
    );
  });
});

describe("createInbucketClient against a fake Inbucket", () => {
  let server: http.Server;
  let base: string;
  let listCalls = 0;

  before(async () => {
    server = http.createServer((req, res) => {
      const path = (req.url ?? "").split("?")[0];
      if (req.method === "DELETE" && path === "/api/v1/mailbox/p6-qa-x-owner") {
        res.writeHead(200).end();
        return;
      }
      if (path === "/api/v1/mailbox/broken") {
        res.writeHead(500).end("boom");
        return;
      }
      if (path === "/api/v1/mailbox/p6-qa-x-owner") {
        listCalls += 1;
        // First poll is empty; the second poll sees the confirmation email.
        const items = listCalls >= 2 ? [listItem] : [];
        res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(items));
        return;
      }
      if (path === "/api/v1/mailbox/p6-qa-x-owner/m1") {
        res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(message));
        return;
      }
      res.writeHead(404).end();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("lists and gets messages from the mailbox API", async () => {
    const client = createInbucketClient(base);
    listCalls = 2;
    assert.deepEqual(await client.list("p6-qa-x-owner"), [listItem]);
    assert.deepEqual(await client.get("p6-qa-x-owner", "m1"), message);
  });

  it("purges a mailbox and fails as ENV on a non-200 response", async () => {
    const client = createInbucketClient(base);
    await client.purge("p6-qa-x-owner");
    await assert.rejects(client.list("broken"), /ENV: Inbucket list HTTP 500/);
  });

  it("waitFor returns once the mailbox has enough messages", async () => {
    const client = createInbucketClient(base);
    listCalls = 0;
    const items = await client.waitFor("p6-qa-x-owner", {
      min: 1,
      timeoutMs: 5_000,
      intervalMs: 10,
    });
    assert.equal(items.length, 1);
    assert.equal(listCalls, 2);
  });
});
