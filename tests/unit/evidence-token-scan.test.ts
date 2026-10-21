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

// Fake values, built at run time so no token-shaped literal sits in this file.
const fakeBasic = `Basic ${Buffer.from(`user:${"x".repeat(8)}`).toString("base64")}`;

test("the exact JSON Authorization shape is a hit", () => {
  assert.deepEqual(findHits(JSON.stringify({ Authorization: fakeBasic })), [1]);
});

test("a JSON authorization key is a hit whatever its value", () => {
  assert.deepEqual(findHits(JSON.stringify({ authorization: "" })), [1]);
});

test("a JSON cookie key is a hit", () => {
  assert.deepEqual(findHits(JSON.stringify({ Cookie: `sid=${"x".repeat(8)}` })), [1]);
});

test("a JSON set-cookie key is a hit", () => {
  assert.deepEqual(findHits(JSON.stringify({ "set-cookie": `sid=${"x".repeat(8)}` })), [1]);
});

for (const key of ["password", "secret", "token", "api_key", "apiKey", "APIKEY"]) {
  test(`a JSON ${key} key with a value is a hit`, () => {
    assert.deepEqual(findHits(JSON.stringify({ [key]: "x".repeat(8) })), [1]);
  });
}

test("a JSON secret key with an empty value is not a hit", () => {
  assert.deepEqual(findHits(JSON.stringify({ token: "" })), []);
});

test("a JSON password value containing a single quote is a hit", () => {
  assert.deepEqual(findHits(JSON.stringify({ password: `pa'${"ssword"}` })), [1]);
});

test("an escaped double quote inside a JSON value is a hit", () => {
  assert.deepEqual(findHits(JSON.stringify({ token: `ab"${"x".repeat(8)}` })), [1]);
});

test("a single-quoted secret pair is a hit", () => {
  assert.deepEqual(findHits(`{'secret':'${"x".repeat(8)}'}`), [1]);
});

test("an empty JSON password value is not a hit, in either quote style", () => {
  assert.deepEqual(findHits(JSON.stringify({ password: "" })), []);
  assert.deepEqual(findHits("{'password':''}"), []);
});

test("ordinary JSON fields are not hits", () => {
  assert.deepEqual(findHits(JSON.stringify({ status: "ok", count: 3, name: "p6" })), []);
});
