import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { functional, isLimiterProfileName } from "../../src/twenty/limiter-profile.ts";

// The workflow has no YAML parser in this repo, so these checks read its text: job ids, the limiter value and the markers.
const text = readFileSync(".github/workflows/twenty-load.yml", "utf8");
const lines = text.split("\n");

/** The job ids: keys at two-space indent under the top-level `jobs:` block. */
function jobIds(): string[] {
  const start = lines.indexOf("jobs:");
  const ids: string[] = [];
  for (const line of lines.slice(start + 1)) {
    // Column-0 comments are the task markers, which sit between the jobs; they do not end the job list.
    if (/^\S/.test(line) && !line.startsWith("#")) break;
    const match = /^ {2}([A-Za-z0-9_-]+):\s*(#.*)?$/.exec(line);
    if (match?.[1]) ids.push(match[1]);
  }
  return ids;
}

describe("twenty load workflow", () => {
  it("has exactly the foundation, task 4 and task 5 jobs", () => {
    assert.deepEqual(jobIds(), [
      "twenty-load-foundation",
      "task4-lost-update",
      "task5-reset-token",
    ]);
  });

  it("runs the functional limiter profile in 3b", () => {
    const match = /^ {6}P6_TWENTY_LIMITER_PROFILE: (\S+)/m.exec(text);
    assert.ok(match?.[1], "P6_TWENTY_LIMITER_PROFILE is set in the job env");
    assert.equal(match[1], "functional");
    assert.equal(isLimiterProfileName(match[1]), true);
  });

  it("writes the six functional values in the workflow exactly as limiter-profile.ts holds them", () => {
    const pairs = [
      ...text.matchAll(/^ {10}((?:APPLICATION_)?API_RATE_LIMITING_[A-Z_]+): "([^"]*)"$/gm),
    ];
    const names = Object.keys(functional);
    for (const name of names) {
      const values = pairs.filter((p) => p[1] === name).map((p) => p[2]);
      // one entry on the up step and one on the verify step, both equal to the profile
      assert.deepEqual(values, [functional[name], functional[name]], `${name} in the workflow`);
    }
    assert.equal(pairs.length, names.length * 2);
  });

  it("keeps the three task markers in order, each followed by one blank line", () => {
    const markers = ["# >>> task4 jobs", "# >>> task5 jobs", "# >>> task6 jobs"];
    const positions = markers.map((marker) => lines.indexOf(marker));
    assert.ok(
      positions.every((p) => p >= 0),
      "every marker is present",
    );
    assert.deepEqual(
      [...positions].sort((a, b) => a - b),
      positions,
    );
    for (const position of positions) {
      assert.equal(lines[position + 1], "", `blank line after ${lines[position]}`);
    }
  });
});
