import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../../scripts/evidence-token-scan.mjs", import.meta.url));

describe("dashboard fixture token scan", () => {
  it("node scripts/evidence-token-scan.mjs tests/fixtures/dashboard exits 0", () => {
    mkdirSync("tests/fixtures/dashboard", { recursive: true });
    const result = spawnSync(process.execPath, [cli, "tests/fixtures/dashboard"], {
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /token scan: clean/);
  });

  it("node scripts/evidence-token-scan.mjs docs/findings.json exits 0", () => {
    const dir = mkdtempSync(join(tmpdir(), "findings-scan-"));
    copyFileSync("docs/findings.json", join(dir, "findings.json"));
    const result = spawnSync(process.execPath, [cli, dir], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /token scan: clean/);
  });
});
