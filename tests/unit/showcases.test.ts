import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { showcaseNotes } from "../../scripts/dashboard/showcases.ts";

describe("dashboard showcases", () => {
  it("each of the three showcases carries its title and its note", () => {
    const notes = showcaseNotes();
    assert.deepEqual(
      notes.map((n) => n.id),
      ["knee", "soak", "two-instance"],
    );
    for (const n of notes) assert.ok(n.title.length > 0 && n.note.length > 0, n.id);
  });

  it("each note says what it proves", () => {
    for (const n of showcaseNotes()) assert.match(n.note, /proves/, n.id);
  });
});
