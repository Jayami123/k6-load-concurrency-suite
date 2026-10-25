import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { medIntentOf, medRowsByIntent } from "../../src/load/knee/med-intents.ts";

const P = "p6-qa-20261025t010203z-3fa9c0d1-med-knee";

describe("medusa intents", () => {
  it("maps <prefix>-i<n>@qa.local to n and rejects another prefix, another domain and a non-numeric leaf", () => {
    assert.equal(medIntentOf(P, `${P}-i7@qa.local`), 7);
    assert.equal(
      medIntentOf(P, "p6-qa-20261025t010203z-3fa9c0d1-med-other-i7@qa.local"),
      undefined,
    );
    assert.equal(medIntentOf(P, `${P}-i7@example.com`), undefined);
    assert.equal(medIntentOf(P, `${P}-ix@qa.local`), undefined);
  });

  it("counts orders per intent, counts an order of no intent as a ghost, and counts two orders of one intent as 2", () => {
    const rows = [
      { id: "o1", email: `${P}-i1@qa.local` },
      { id: "o2", email: `${P}-i1@qa.local` },
      { id: "o3", email: `${P}-i2@qa.local` },
      { id: "o4", email: "someone@qa.local" },
    ];
    const { rowsByIntent, ghostRows } = medRowsByIntent(rows, P);
    assert.equal(rowsByIntent.get(1), 2);
    assert.equal(rowsByIntent.get(2), 1);
    assert.equal(ghostRows, 1);
  });
});
