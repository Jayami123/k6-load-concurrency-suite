import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const readme = readFileSync("README.md", "utf8");

describe("README rules (P6-RULE-003)", () => {
  it("every occurrence of the word capacity is part of the phrase not capacity", () => {
    const bare = readme.match(/(?<!not )\bcapacity\b/gi) ?? [];
    assert.deepEqual(bare, []);
  });

  it("every line of a Phase 3 results table links to a run-meta file (when the section exists)", () => {
    const start = readme.indexOf("## Phase 3 results");
    if (start === -1) return;
    const section = readme.slice(start).split(/\n## /)[0] ?? "";
    for (const line of section.split("\n").filter((l) => l.startsWith("|") && !/^\|\s*-/.test(l))) {
      assert.match(line, /run-meta/, `results row without run-meta: ${line.slice(0, 80)}`);
    }
  });
});
