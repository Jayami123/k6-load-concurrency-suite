import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const read = (p: string) => readFileSync(p, "utf8");
const pkg = JSON.parse(read("package.json")) as { dependencies: Record<string, string> };
const lock = JSON.parse(read("package-lock.json")) as {
  packages: Record<string, { version?: string; resolved?: string }>;
};
const spec = pkg.dependencies["qa-portfolio-harness"] ?? "";
const tag = /^github:Jayami123\/qa-portfolio-harness#(v\d+\.\d+\.\d+)$/.exec(spec)?.[1];

describe("harness pin", () => {
  it("is a released tag, not a branch or a SHA", () => {
    assert.ok(tag, `package.json pin is not a vX.Y.Z tag: ${spec}`);
  });
  it("matches the version recorded in package-lock.json", () => {
    const entry = lock.packages["node_modules/qa-portfolio-harness"];
    assert.equal(
      entry?.version,
      tag?.slice(1),
      "lock version differs from the tag (did the harness bump its version?)",
    );
  });
  it("is the suffix of every build cache key in perf.yml", () => {
    const suffixes = [...read(".github/workflows/perf.yml").matchAll(/-h(\d+\.\d+\.\d+)\b/g)].map(
      (m) => m[1],
    );
    assert.ok(
      suffixes.length >= 9,
      `expected at least 9 cache-key suffixes, found ${suffixes.length}`,
    );
    assert.deepEqual([...new Set(suffixes)], [tag?.slice(1)]);
  });
  it("is the version README names in its first paragraph", () => {
    assert.match(read("README.md").split("\n\n")[1] ?? "", new RegExp(`\`${tag}\``));
  });
});
