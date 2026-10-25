import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { docIntentOf, docRowsByIntent } from "../../src/load/knee/doc-intents.ts";

const P = "p6-qa-20261025t010203z-3fa9c0d1-doc-knee";

describe("documenso intents", () => {
  it("maps <prefix>-i<n> journey to n and rejects another prefix, another suffix and a non-numeric leaf", () => {
    assert.equal(docIntentOf(P, `${P}-i4 journey`), 4);
    assert.equal(docIntentOf(P, "p6-qa-20261025t010203z-3fa9c0d1-doc-other-i4 journey"), undefined);
    assert.equal(docIntentOf(P, `${P}-i4 other`), undefined);
    assert.equal(docIntentOf(P, `${P}-ix journey`), undefined);
  });

  it("counts envelopes per intent, splits completed from unfinished, and counts a title of no intent as a ghost", () => {
    const rows = [
      { title: `${P}-i1 journey`, completed: true },
      { title: `${P}-i1 journey`, completed: false },
      { title: `${P}-i2 journey`, completed: true },
      { title: "someone else", completed: true },
    ];
    const { rowsByIntent, unfinishedByIntent, ghostRows } = docRowsByIntent(rows, P);
    assert.equal(rowsByIntent.get(1), 2);
    assert.equal(rowsByIntent.get(2), 1);
    assert.equal(unfinishedByIntent.get(1), 1);
    assert.equal(unfinishedByIntent.has(2), false);
    assert.equal(ghostRows, 1);
  });
});
