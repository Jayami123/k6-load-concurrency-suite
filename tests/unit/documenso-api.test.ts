import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import http from "node:http";
import type { AddressInfo } from "node:net";
import {
  completeWithToken,
  createEnvelope,
  createRecipients,
  deleteEnvelope,
  distribute,
  expectOk,
  signFieldWithToken,
} from "../../src/documenso/api.ts";

type Recorded = { method: string; path: string; body: string; hasCookie: boolean };

type Route = { status: number; body: string };

const routes = new Map<string, Route>();
const recorded: Recorded[] = [];
let server: http.Server;
let baseUrl = "";

function route(path: string, status: number, body: string): void {
  routes.set(path, { status, body });
}

before(async () => {
  server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const path = req.url ?? "";
      recorded.push({
        method: req.method ?? "",
        path,
        body: Buffer.concat(chunks).toString("utf8"),
        hasCookie: req.headers.cookie !== undefined,
      });
      const hit = routes.get(path) ?? { status: 404, body: "{}" };
      res.writeHead(hit.status, { "content-type": "application/json" });
      res.end(hit.body);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("documenso api helpers", () => {
  it("createEnvelope returns the envelope id", async () => {
    route("/api/v2/envelope/create", 200, '{"id":"envelope_x"}');
    const id = await createEnvelope(baseUrl, "tok", "title", new Uint8Array([1, 2, 3]));
    assert.equal(id, "envelope_x");
  });

  it("createRecipients returns numeric ids and never echoes a token", async () => {
    route(
      "/api/v2/envelope/recipient/create-many",
      200,
      '{"data":[{"id":5,"token":"secret-token-5"},{"id":6,"token":"secret-token-6"}]}',
    );
    const ids = await createRecipients(baseUrl, "tok", "envelope_x", [{}, {}]);
    assert.deepEqual(ids, [5, 6]);
  });

  it("keeps recipient tokens out of shape-error messages", async () => {
    route(
      "/api/v2/envelope/recipient/create-many",
      200,
      '{"data":[{"id":"not-a-number","token":"secret-token-9"}]}',
    );
    await assert.rejects(createRecipients(baseUrl, "tok", "envelope_x", [{}]), (err: Error) => {
      assert.ok(err.message.startsWith("TEST BUG:"));
      assert.ok(!err.message.includes("secret-token"));
      return true;
    });
  });

  it("distribute keys signing tokens by recipient id", async () => {
    route(
      "/api/v2/envelope/distribute",
      200,
      '{"recipients":[{"id":6,"signingUrl":"http://x/sign/tok6"},{"id":5,"signingUrl":"http://x/sign/tok5"}]}',
    );
    const tokens = await distribute(baseUrl, "tok", "envelope_x");
    assert.equal(tokens.get(5), "tok5");
    assert.equal(tokens.get(6), "tok6");
  });

  it("maps a 500 to PRODUCT BUG without echoing the body", async () => {
    route("/api/v2/envelope/create", 500, "leaked-body");
    const pdf = new Uint8Array([1]);
    await assert.rejects(createEnvelope(baseUrl, "tok", "t", pdf), (err: Error) => {
      assert.ok(err.message.startsWith("PRODUCT BUG: envelope/create HTTP 500"));
      assert.ok(!err.message.includes("leaked-body"));
      return true;
    });
  });

  it("maps a 400 to TEST BUG and a 429 to ENV", () => {
    assert.throws(() => expectOk("probe", { status: 400, text: "", ms: 0 }), /^Error: TEST BUG:/);
    assert.throws(() => expectOk("probe", { status: 429, text: "", ms: 0 }), /^Error: ENV:/);
    assert.doesNotThrow(() => expectOk("probe", { status: 200, text: "", ms: 0 }));
  });

  it("sends the sign-field tRPC body with the recipient token only", async () => {
    route("/api/trpc/field.signFieldWithToken", 200, '{"result":{"data":{"json":{}}}}');
    await signFieldWithToken(baseUrl, "t", 9, "v");
    const last = recorded.at(-1);
    assert.equal(last?.path, "/api/trpc/field.signFieldWithToken");
    assert.deepEqual(JSON.parse(last?.body ?? "{}"), {
      json: { token: "t", fieldId: 9, value: "v", isBase64: false },
    });
  });

  it("posts completion without a cookie or API token", async () => {
    route("/api/trpc/recipient.completeDocumentWithToken", 200, "{}");
    const res = await completeWithToken(baseUrl, "t", 42);
    assert.equal(res.status, 200);
    const last = recorded.at(-1);
    assert.equal(last?.path, "/api/trpc/recipient.completeDocumentWithToken");
    assert.deepEqual(JSON.parse(last?.body ?? "{}"), {
      json: { token: "t", documentId: 42 },
    });
    assert.equal(last?.hasCookie, false);
  });

  it("deleteEnvelope posts the envelope id and returns the status", async () => {
    route("/api/v2/envelope/delete", 200, '{"success":true}');
    const status = await deleteEnvelope(baseUrl, "tok", "envelope_x");
    assert.equal(status, 200);
    const last = recorded.at(-1);
    assert.equal(last?.method, "POST");
    assert.deepEqual(JSON.parse(last?.body ?? "{}"), { envelopeId: "envelope_x" });
  });
});
