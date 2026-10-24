import http from "k6/http";
import { check } from "k6";
import exec from "k6/execution";
import { Counter } from "k6/metrics";
import { runJourney } from "../lib/pure/journey.js";
import { iterationId } from "../lib/pure/prefix.js";
import { request, retried, retryCounters } from "../lib/http.js";
export const completedCounter = new Counter("p6_docs_completed");
const TOKEN = __ENV.DOCUMENSO_API_TOKEN; // secret: environment only, never the config file, never logged

/** A completion answer that ends a retry: SIGNED (200) or ALREADY_SIGNED (the first completion of the same recipient). */
const signedOrAlready = (/** @type {{ status: number, body: unknown }} */ r) =>
  r.status === 200 || String(r.body).includes("ALREADY_SIGNED");

/**
 * @param {{ baseUrl: string, prefix: string }} cfg
 * @param {string | ArrayBuffer} pdf the fixture, opened once per VU by the case script
 * @param {{ retryPlan?: Array<{ timeoutMs: number, delayMs: number, parallel: number }> }} [opts]
 *   opts.retryPlan (plan task 10 §6.2): each recipient's completeDocumentWithToken is sent through the plan.
 */
export function runDocSign(cfg, pdf, opts = {}) {
  const n = exec.scenario.iterationInTest;
  const A = { authorization: `Bearer ${TOKEN}` },
    J = { ...A, "content-type": "application/json" };
  if (opts.retryPlan) retryCounters.intents.add(1);
  /** @type {(path: string, body: unknown, name: string) => any} */
  const post = (path, body, name) =>
    request("POST", `${cfg.baseUrl}${path}`, name, body, { headers: J });
  const steps = [
    {
      name: "create",
      run: () => {
        const r = http.post(
          `${cfg.baseUrl}/api/v2/envelope/create`,
          {
            payload: JSON.stringify({
              title: `${iterationId(cfg.prefix, n)} journey`,
              type: "DOCUMENT",
            }),
            files: http.file(pdf, "example.pdf", "application/pdf"),
          },
          { headers: A, tags: { name: "POST envelope/create" } },
        );
        return { ok: r.status === 200, data: { envelopeId: r.json("id") } };
      },
    },
    {
      name: "recipients",
      run: (/** @type {Record<string, any>} */ s) => {
        const r = post(
          "/api/v2/envelope/recipient/create-many",
          {
            envelopeId: s.envelopeId,
            data: [0, 1].map((i) => ({
              email: `${iterationId(cfg.prefix, n)}-r${i}@example.com`,
              name: `P6 Signer ${i}`,
              role: "SIGNER",
              accessAuth: [],
              actionAuth: [],
            })),
          },
          "POST recipient/create-many",
        );
        return {
          ok: r.status === 200,
          data: {
            recipientIds: /** @type {Array<{ id: number }>} */ (r.json("data")).map((x) => x.id),
          },
        };
      },
    },
    {
      name: "envelope",
      run: (/** @type {Record<string, any>} */ s) => {
        const r = request(
          "GET",
          `${cfg.baseUrl}/api/v2/envelope/${s.envelopeId}`,
          "GET envelope",
          undefined,
          { headers: A },
        );
        const m = /^document_(\d+)$/.exec(/** @type {string} */ (r.json("secondaryId")));
        return {
          ok: r.status === 200 && Boolean(m),
          data: { itemId: r.json("envelopeItems.0.id"), documentId: Number(m && m[1]) },
        };
      },
    },
    {
      name: "fields",
      run: (/** @type {Record<string, any>} */ s) => {
        const r = post(
          "/api/v2/envelope/field/create-many",
          {
            envelopeId: s.envelopeId,
            data: s.recipientIds.map(
              (/** @type {number} */ recipientId, /** @type {number} */ i) => ({
                recipientId,
                envelopeItemId: s.itemId,
                type: "SIGNATURE",
                page: 1,
                positionX: 10,
                positionY: 10 + i * 20,
                width: 20,
                height: 5,
              }),
            ),
          },
          "POST field/create-many",
        );
        return { ok: r.status === 200, data: { fields: r.json("data") } };
      },
    },
    {
      name: "distribute",
      run: (/** @type {Record<string, any>} */ s) => {
        const r = post(
          "/api/v2/envelope/distribute",
          { envelopeId: s.envelopeId },
          "POST envelope/distribute",
        );
        const tokens = /** @type {Record<string, string>} */ ({});
        const seen = new Set(); // signing tokens already assigned: two recipients never share one
        if (r.status !== 200) return { ok: false, data: { tokens } };
        const recipients = r.json("recipients");
        if (!Array.isArray(recipients)) return { ok: false, data: { tokens } }; // malformed 200: a failed step, not a TypeError
        for (const rc of recipients) {
          const m = /\/sign\/([A-Za-z0-9_-]+)$/.exec(rc?.signingUrl ?? "");
          if (!m || tokens[rc.id] !== undefined || seen.has(m[1]))
            return { ok: false, data: { tokens } }; // unmatched URL, duplicate id or duplicate token
          seen.add(m[1]);
          tokens[rc.id] = /** @type {string} */ (m[1]);
        }
        // exactly the recipients created in the earlier step: no empty, partial, unrelated or extra entry
        const got = Object.keys(tokens).map(Number).sort();
        const want = [...s.recipientIds].sort();
        if (got.length !== want.length || got.some((id, i) => id !== want[i]))
          return { ok: false, data: { tokens } };
        return { ok: true, data: { tokens } };
      },
    },
    {
      name: "sign and complete",
      run: (/** @type {Record<string, any>} */ s) => {
        let ok = true;
        s.recipientIds.forEach((/** @type {number} */ rid, /** @type {number} */ i) => {
          const f = s.fields.find(
            (/** @type {{ recipientId: number }} */ x) => x.recipientId === rid,
          );
          ok =
            post(
              "/api/trpc/field.signFieldWithToken",
              {
                json: {
                  token: s.tokens[rid],
                  fieldId: f.id,
                  value: `P6 Signer ${i}`,
                  isBase64: false,
                },
              },
              "POST signFieldWithToken",
            ).status === 200 && ok;
          if (opts.retryPlan) {
            const out = retried(
              opts.retryPlan,
              "POST",
              `${cfg.baseUrl}/api/trpc/recipient.completeDocumentWithToken`,
              "POST completeDocumentWithToken",
              { json: { token: s.tokens[rid], documentId: s.documentId } },
              { headers: J },
              signedOrAlready,
            );
            ok = out.resolved && ok;
            return;
          }
          ok =
            post(
              "/api/trpc/recipient.completeDocumentWithToken",
              { json: { token: s.tokens[rid], documentId: s.documentId } },
              "POST completeDocumentWithToken",
            ).status === 200 && ok;
        });
        if (ok) completedCounter.add(1);
        if (ok && opts.retryPlan) retryCounters.intentsOk.add(1);
        return { ok };
      },
    },
  ];
  return runJourney({
    steps,
    deps: { check: (nme, ok) => check(null, { [nme]: () => ok }), sleep: () => {}, now: Date.now },
  });
}
