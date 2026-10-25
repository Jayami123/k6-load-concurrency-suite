import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calIntentOf, calRowsByIntent } from "../../src/load/knee/cal-intents.ts";

const P = "p6-qa-20261025t010203z-3fa9c0d1-cal-knee";

describe("cal intents", () => {
  it("reads the intent number from a prefixed attendee email", () => {
    assert.equal(calIntentOf(P, `${P}-i12@example.com`), 12);
  });

  it("an email of another prefix has no intent", () => {
    assert.equal(
      calIntentOf(P, "p6-qa-20261025t010203z-3fa9c0d1-cal-other-i1@example.com"),
      undefined,
    );
  });

  it("a prefix that is only the start of a longer one has no intent", () => {
    assert.equal(calIntentOf("p6-x-cal", "p6-x-cal-2-i1@example.com"), undefined);
  });

  it("a non-whole intent has no intent", () => {
    assert.equal(calIntentOf(P, `${P}-i1.5@example.com`), undefined);
    assert.equal(calIntentOf(P, `${P}-ix@example.com`), undefined);
    assert.equal(calIntentOf(P, `${P}-i@example.com`), undefined);
  });

  it("another domain has no intent", () => {
    assert.equal(calIntentOf(P, `${P}-i3@example.org`), undefined);
  });

  it("counts rows per intent", () => {
    const rows = [
      { id: 1, email: `${P}-i1@example.com` },
      { id: 2, email: `${P}-i1@example.com` },
      { id: 3, email: `${P}-i2@example.com` },
    ];
    const { rowsByIntent, ghostRows } = calRowsByIntent(rows, P);
    assert.deepEqual(
      [...rowsByIntent],
      [
        [1, 2],
        [2, 1],
      ],
    );
    assert.equal(ghostRows, 0);
  });

  it("one booking with two attendee rows of one intent is one row", () => {
    const rows = [
      { id: 7, email: `${P}-i4@example.com` },
      { id: 7, email: `${P}-i4@example.com` },
    ];
    assert.deepEqual([...calRowsByIntent(rows, P).rowsByIntent], [[4, 1]]);
  });

  it("a booking whose email maps to no intent is one ghost row", () => {
    const rows = [
      { id: 9, email: "someone@example.com" },
      { id: 9, email: "other@example.com" },
    ];
    const { rowsByIntent, ghostRows } = calRowsByIntent(rows, P);
    assert.equal(rowsByIntent.size, 0);
    assert.equal(ghostRows, 1);
  });

  it("no rows give an empty map and no ghosts", () => {
    const { rowsByIntent, ghostRows } = calRowsByIntent([], P);
    assert.equal(rowsByIntent.size, 0);
    assert.equal(ghostRows, 0);
  });
});
