import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { findHits, scanTree } from "../../scripts/evidence-token-scan.mjs";

const cli = fileURLToPath(new URL("../../scripts/evidence-token-scan.mjs", import.meta.url));

// Fake values, built at run time so no token-shaped literal sits in this file.
const fakeGithubToken = (prefix: string) => `${prefix}${"x".repeat(36)}`;

function makeDir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "evidence-scan-"));
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(join(dir, name, ".."), { recursive: true });
    writeFileSync(join(dir, name), text);
  }
  return dir;
}

test("clean text has no hits", () => {
  assert.deepEqual(findHits('{"ok":true}\n{"n":2}'), []);
});

test("reports the line number of each hit", () => {
  assert.deepEqual(findHits("ok\napi_TESTONLY1\nok"), [2]);
});

test("a short api_ word is not a hit", () => {
  assert.deepEqual(findHits("api_short"), []);
});

test("the original three patterns still hit", () => {
  assert.deepEqual(findHits('Bearer x\n{"sessionId":1}'), [1, 2]);
});

test("scanTree returns the file and the line of each hit", () => {
  const dir = makeDir({
    "run-1/clean.json": '{"ok":true}',
    "run-1/bad.log": "first\nsecond api_TESTONLY1",
  });
  assert.deepEqual(scanTree(dir), [{ file: join("run-1", "bad.log"), lines: [2] }]);
});

test("the CLI never prints the matched text", () => {
  const marker = "MARKER_SHOULD_NOT_APPEAR_12345";
  const dir = makeDir({ "a.log": `Bearer ${marker}` });
  const result = spawnSync(process.execPath, [cli, dir], { encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /TOKEN PATTERN: a\.log line 1/);
  assert.doesNotMatch(result.stderr, new RegExp(marker));
  assert.doesNotMatch(result.stdout, new RegExp(marker));
});

test("CLI exit code 0 for a clean tree", () => {
  const dir = makeDir({ "a.json": '{"ok":true}' });
  const result = spawnSync(process.execPath, [cli, dir], { encoding: "utf8" });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /token scan: clean/);
});

test("CLI exit code 2 for a usage error", () => {
  const result = spawnSync(process.execPath, [cli], { encoding: "utf8" });
  assert.equal(result.status, 2);
});

for (const prefix of ["ghp_", "gho_", "ghu_", "ghs_", "ghr_"]) {
  test(`GitHub token ${prefix} is a hit`, () => {
    assert.deepEqual(findHits(`token ${fakeGithubToken(prefix)}`), [1]);
  });
}

test("fine-grained GitHub PAT is a hit", () => {
  assert.deepEqual(findHits(`x github_pat_${"A".repeat(30)}`), [1]);
});

test("JWT-shaped string is a hit", () => {
  assert.deepEqual(findHits("eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2ln"), [1]);
});

test("Authorization header is a hit", () => {
  assert.deepEqual(findHits("authorization: something"), [1]);
});

test("password, secret and token key-value pairs are hits", () => {
  assert.deepEqual(findHits("password=hunter2"), [1]);
  assert.deepEqual(findHits("x\nsecret=abc"), [2]);
  assert.deepEqual(findHits("url?token=abc"), [1]);
});
