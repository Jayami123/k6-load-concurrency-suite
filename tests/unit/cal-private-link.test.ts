import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { multiplePrivateLinksBody, privateLinkId } from "../../src/cal/private-link.ts";

describe("multiplePrivateLinksBody", () => {
  it("builds the tRPC batch shape for eventTypesHeavy/update", () => {
    const body = multiplePrivateLinksBody(3, [{ link: "p6-x-t1", maxUsageCount: 1 }]);
    assert.deepEqual(body, {
      "0": { json: { id: 3, multiplePrivateLinks: [{ link: "p6-x-t1", maxUsageCount: 1 }] } },
    });
  });
});

describe("privateLinkId", () => {
  it("is lower-case, URL-safe and distinct per trial", () => {
    const a = privateLinkId("P6Cal_Race-006", 1);
    const b = privateLinkId("P6Cal_Race-006", 2);
    assert.match(a, /^[a-z0-9-]+$/);
    assert.notEqual(a, b);
  });
});
