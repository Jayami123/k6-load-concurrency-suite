import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const JOURNEYS = [
  "k6/journeys/cal-book.js",
  "k6/journeys/med-checkout.js",
  "k6/journeys/doc-sign.js",
];
const COMMIT = /(acceptedCounter|ordersCounter|completedCounter)\.add\(1\)|end\(ordersCounter\)/;
const HOOK = "opts.onCommit?.()";

describe("knee journey commit hooks", () => {
  it("every commit line is followed by the onCommit hook; no Phase 3 case passes it", () => {
    let commits = 0;
    for (const file of JOURNEYS) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (!COMMIT.test(line)) return;
        commits += 1;
        const next = lines.slice(i + 1, i + 3).join("\n");
        assert.ok(next.includes(HOOK), `${file}:${i + 1} adds to a commit counter without ${HOOK}`);
      });
    }
    assert.equal(commits, 6, "cal 2, medusa 3, documenso 1");

    for (const file of readdirSync("k6/cases")) {
      if (!file.endsWith(".js")) continue;
      assert.equal(
        readFileSync(path.join("k6/cases", file), "utf8").includes("onCommit"),
        false,
        file,
      );
    }
  });
});
