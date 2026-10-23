import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  inviteFrom,
  latestMessageFor,
  resetTokenFrom,
  waitForMessage,
  type MailpitSummary,
} from "../../src/twenty/mailpit.ts";

const TOKEN = "a".repeat(64);
const list: MailpitSummary[] = [
  { ID: "new", Subject: "Action Needed to Reset Password", To: [{ Address: "m@apple.dev" }] },
  { ID: "old", Subject: "Join your team on Twenty", To: [{ Address: "m@apple.dev" }] },
];

describe("twenty mailpit reader", () => {
  it("latestMessageFor returns the newest match for the address, and null when the address has no mail", () => {
    assert.equal(latestMessageFor(list, "m@apple.dev", /password/i)?.ID, "new");
    assert.equal(latestMessageFor(list, "other@apple.dev", /.*/), null);
  });

  it("latestMessageFor skips a message whose subject does not match, and returns null when none matches", () => {
    assert.equal(latestMessageFor(list, "m@apple.dev", /join/i)?.ID, "old");
    assert.equal(latestMessageFor(list.slice(0, 1), "m@apple.dev", /join/i), null);
  });

  it("resetTokenFrom returns the 64-hex value, and null when the body has none", () => {
    assert.equal(resetTokenFrom({ Text: `link ${TOKEN} end`, HTML: "" }), TOKEN);
    assert.equal(resetTokenFrom({ Text: "no token here", HTML: "" }), null);
  });

  it("inviteFrom returns the workspace hash and the inviteToken, and null without an invite link", () => {
    const body = `http://127.0.0.1:3002/invite/apple.dev-invite-hash?inviteToken=${TOKEN}&email=m%40apple.dev`;
    assert.deepEqual(inviteFrom({ Text: body, HTML: "" }), {
      workspaceInviteHash: "apple.dev-invite-hash",
      personalToken: TOKEN,
    });
    assert.equal(inviteFrom({ Text: "https://twenty.com/", HTML: "" }), null);
  });

  it("waitForMessage polls until the message arrives, then returns it", async () => {
    const calls: string[] = [];
    let listed = 0;
    const fakeFetch = (async (url: string) => {
      calls.push(url);
      if (url.endsWith("/api/v1/messages")) {
        listed += 1;
        return new Response(JSON.stringify({ messages: listed < 2 ? [] : list }));
      }
      return new Response(
        JSON.stringify({ ID: "new", Subject: "x", To: [], Text: TOKEN, HTML: "" }),
      );
    }) as typeof fetch;
    const msg = await waitForMessage({
      mailpitUrl: "http://127.0.0.1:8025",
      address: "m@apple.dev",
      subject: /password/i,
      intervalMs: 1,
      fetchImpl: fakeFetch,
    });
    assert.equal(msg.Text, TOKEN);
    assert.equal(calls.filter((u) => u.endsWith("/api/v1/messages")).length, 2);
  });

  it("waitForMessage throws a TEST BUG when no mail arrives within the wait", async () => {
    const empty = (async () => new Response(JSON.stringify({ messages: [] }))) as typeof fetch;
    await assert.rejects(
      waitForMessage({
        mailpitUrl: "http://127.0.0.1:8025",
        address: "m@apple.dev",
        subject: /password/i,
        timeoutMs: 1,
        intervalMs: 1,
        fetchImpl: empty,
      }),
      /TEST BUG/,
    );
  });
});
