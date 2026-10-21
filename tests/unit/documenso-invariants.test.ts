import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  checkCompletionTrial,
  checkDoc001Trial,
  checkDoc002Trial,
  checkSequentialControl,
  classifyCompletion,
  countClasses,
  trialDoubleSealed,
  type CompletionClass,
  type TrialInput,
  type TrialSnapshot,
} from "../../src/documenso/invariants.ts";

const SIGNED_200 = '{"result":{"data":{"json":{"status":"SIGNED"}}}}';
const ALREADY_200 = '{"result":{"data":{"json":{"status":"ALREADY_SIGNED"}}}}';

function passing(overrides: Partial<TrialSnapshot> = {}): TrialSnapshot {
  return {
    sealJobs: [{ status: "COMPLETED", retried: 0 }],
    emailJobs: [{ status: "COMPLETED" }],
    webhookJobs: [{ status: "COMPLETED" }],
    completedAuditRows: 1,
    itemDocs: 1,
    itemsSealed: 1,
    docDataDelta: 2,
    completedEmails: [1, 1],
    webhookDeliveries: 1,
    webhookCallRows: [{ status: "SUCCESS", responseCode: 200 }],
    envelopeStatus: "COMPLETED",
    webhookHost: "p6-webhook.test",
    ...overrides,
  };
}

function input(
  classes: CompletionClass[],
  snapshot: TrialSnapshot,
  overrides: Partial<TrialInput> = {},
): TrialInput {
  return {
    mode: "last-recipients",
    burst: 2,
    classes,
    spreadMs: 0.4,
    spreadLimitMs: 20,
    snapshot,
    ...overrides,
  };
}

const DOC001_CLASSES: CompletionClass[] = ["SIGNED", "SIGNED"];
const DOC002_CLASSES: CompletionClass[] = [
  "SIGNED",
  ...Array.from({ length: 9 }, (): CompletionClass => "ALREADY_SIGNED"),
];

describe("documenso invariants", () => {
  it("classifies a 200 SIGNED body", () => {
    assert.equal(classifyCompletion(200, SIGNED_200), "SIGNED");
  });

  it("classifies a 200 ALREADY_SIGNED body", () => {
    assert.equal(classifyCompletion(200, ALREADY_200), "ALREADY_SIGNED");
  });

  it("classifies a 200 with another status as other", () => {
    assert.equal(
      classifyCompletion(200, '{"result":{"data":{"json":{"status":"WAITING"}}}}'),
      "other",
    );
  });

  it("classifies a 200 with a non-JSON body as other", () => {
    assert.equal(classifyCompletion(200, "<html>"), "other");
  });

  it("classifies 400, 404 and 429 as client errors", () => {
    for (const status of [400, 404, 429]) {
      assert.equal(classifyCompletion(status, ""), "client-error");
    }
  });

  it("classifies 500 as a server error", () => {
    assert.equal(classifyCompletion(500, ""), "server-error");
  });

  it("classifies a non-200, non-error status as other", () => {
    assert.equal(classifyCompletion(302, ""), "other");
  });

  it("classifies a null status as other", () => {
    assert.equal(classifyCompletion(null, ""), "other");
  });

  it("counts every class, including a mixed list", () => {
    const counts = countClasses(["SIGNED", "ALREADY_SIGNED", "ALREADY_SIGNED", "client-error"]);
    assert.equal(counts.SIGNED, 1);
    assert.equal(counts.ALREADY_SIGNED, 2);
    assert.equal(counts["client-error"], 1);
    assert.equal(counts["server-error"], 0);
    assert.equal(counts.other, 0);
    const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
    assert.equal(total, 4);
  });

  it("reports no violations for a passing 001 trial", () => {
    assert.deepEqual(checkDoc001Trial(input(DOC001_CLASSES, passing())), []);
  });

  it("reports the double seal in 001 with each product label", () => {
    const snap = passing({
      sealJobs: [
        { status: "COMPLETED", retried: 0 },
        { status: "COMPLETED", retried: 1 },
      ],
      emailJobs: [{ status: "COMPLETED" }, { status: "COMPLETED" }],
      completedAuditRows: 2,
      docDataDelta: 4,
      completedEmails: [2, 2],
      webhookDeliveries: 2,
      webhookCallRows: [
        { status: "SUCCESS", responseCode: 200 },
        { status: "SUCCESS", responseCode: 200 },
      ],
    });
    const v = checkDoc001Trial(input(DOC001_CLASSES, snap));
    assert.ok(v.includes("PRODUCT BUG: seal jobs 2, expected 1"));
    assert.ok(v.includes("PRODUCT BUG: DOCUMENT_COMPLETED rows 2, expected 1"));
    assert.ok(v.includes("PRODUCT BUG: DocumentData delta 4, expected 2 (original + one sealed)"));
    assert.ok(v.includes("PRODUCT BUG: Signing Complete! for recipient 0 x2, expected 1"));
    assert.ok(v.includes("PRODUCT BUG: DOCUMENT_COMPLETED deliveries 2, expected 1"));
  });

  it("flags a seal job that is not COMPLETED", () => {
    const snap = passing({ sealJobs: [{ status: "FAILED", retried: 0 }] });
    assert.ok(
      checkDoc001Trial(input(DOC001_CLASSES, snap)).includes("PRODUCT BUG: seal job not COMPLETED"),
    );
  });

  it("flags 5xx and 4xx completion responses", () => {
    const v5 = checkDoc001Trial(input(["SIGNED", "server-error"], passing()));
    assert.ok(v5.includes("PRODUCT BUG: completion HTTP 5xx x1"));
    const v4 = checkDoc002Trial(
      input(
        [
          "SIGNED",
          "client-error",
          ...Array.from({ length: 8 }, (): CompletionClass => "ALREADY_SIGNED"),
        ],
        passing({ completedEmails: [1] }),
        { mode: "same-recipient", burst: 10 },
      ),
    );
    assert.ok(v4.includes("PRODUCT BUG: completion HTTP 4xx x1"));
  });

  it("flags a spread at or above the limit as a test bug", () => {
    const v = checkDoc001Trial(
      input(DOC001_CLASSES, passing(), { spreadMs: 20, spreadLimitMs: 20 }),
    );
    assert.ok(v.includes("TEST BUG: dispatchSpreadMs 20 >= 20"));
  });

  it("flags sealed items that are not 1 of 1", () => {
    const v = checkDoc001Trial(input(DOC001_CLASSES, passing({ itemsSealed: 0 })));
    assert.ok(v.includes("PRODUCT BUG: sealed items 0 of 1, expected 1 of 1"));
  });

  it("flags a WebhookCall row that is not SUCCESS 200", () => {
    const snap = passing({ webhookCallRows: [{ status: "FAILED", responseCode: 500 }] });
    assert.ok(
      checkDoc001Trial(input(DOC001_CLASSES, snap)).includes(
        "PRODUCT BUG: WebhookCall not SUCCESS 200",
      ),
    );
  });

  it("labels a blocked webhook as ENV with the host to allow", () => {
    const snap = passing({
      webhookDeliveries: 0,
      webhookCallRows: [{ status: "FAILED", responseCode: 0 }],
    });
    const v = checkDoc001Trial(input(DOC001_CLASSES, snap));
    assert.ok(
      v.includes(
        "ENV: webhook blocked; NEXT_PRIVATE_WEBHOOK_SSRF_BYPASS_HOSTS must list p6-webhook.test",
      ),
    );
  });

  it("reports no violations for a passing 002 trial", () => {
    const snap = passing({ completedEmails: [1] });
    const v = checkDoc002Trial(input(DOC002_CLASSES, snap, { mode: "same-recipient", burst: 10 }));
    assert.deepEqual(v, []);
  });

  it("flags two SIGNED bodies in 002 as a product bug", () => {
    const classes: CompletionClass[] = [
      "SIGNED",
      "SIGNED",
      ...Array.from({ length: 8 }, (): CompletionClass => "ALREADY_SIGNED"),
    ];
    const v = checkDoc002Trial(
      input(classes, passing({ completedEmails: [1] }), { mode: "same-recipient", burst: 10 }),
    );
    assert.ok(v.includes("PRODUCT BUG: SIGNED responses 2, expected 1"));
  });

  it("prefixes every control violation with TEST BUG (control)", () => {
    const snap = passing({
      sealJobs: [
        { status: "COMPLETED", retried: 0 },
        { status: "COMPLETED", retried: 0 },
      ],
      completedAuditRows: 2,
      docDataDelta: 4,
      completedEmails: [2, 2],
      webhookDeliveries: 2,
    });
    const v = checkSequentialControl(input(DOC001_CLASSES, snap, { mode: "sequential-control" }));
    assert.ok(v.length > 0);
    assert.ok(
      v.every((line) => line.startsWith("TEST BUG (control):") || line.startsWith("TEST BUG:")),
    );
    assert.ok(!v.some((line) => line.startsWith("PRODUCT BUG")));
  });

  it("flags a non-COMPLETED envelope as a product bug", () => {
    const v = checkDoc001Trial(input(DOC001_CLASSES, passing({ envelopeStatus: "PENDING" })));
    assert.ok(v.includes("PRODUCT BUG: envelope status PENDING, expected COMPLETED"));
  });

  it("detects a double seal by seal jobs or audit rows only", () => {
    assert.equal(
      trialDoubleSealed(
        passing({
          sealJobs: [
            { status: "COMPLETED", retried: 0 },
            { status: "COMPLETED", retried: 1 },
          ],
        }),
      ),
      true,
    );
    assert.equal(trialDoubleSealed(passing({ completedAuditRows: 2 })), true);
    assert.equal(trialDoubleSealed(passing()), false);
  });
});
