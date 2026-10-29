import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

const PRELOAD = path.resolve("src/load/telemetry/preload/el-delay.cjs");

/** A child Node process with the preload loaded, alive for `ms` (the preload timer is unref'd, so the child needs its own timer). */
function runChild(env: Record<string, string | undefined>, ms: number) {
  const clean = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined));
  return spawnSync(process.execPath, ["--require", PRELOAD, "-e", `setTimeout(() => {}, ${ms})`], {
    env: { ...process.env, ...clean },
    encoding: "utf8",
    timeout: 20_000,
  });
}

describe("event-loop delay preload", () => {
  it("writes numeric keys only", () => {
    const out = mkdtempSync(path.join(tmpdir(), "el-pre-"));
    const result = runChild({ HARNESS_EL_OUT: out, HARNESS_EL_ROLE: "server" }, 2_500);
    assert.equal(result.status, 0, result.stderr);
    const files = readdirSync(out).filter((f) => /^el-\d+\.ndjson$/.test(f));
    assert.equal(files.length, 1);
    const lines = readFileSync(path.join(out, files[0] ?? ""), "utf8")
      .trim()
      .split("\n");
    assert.ok(lines.length >= 1);
    for (const line of lines) {
      const row = JSON.parse(line) as Record<string, unknown>;
      assert.deepEqual(Object.keys(row).sort(), ["max", "p50", "p99", "pid", "role", "t"]);
      for (const key of ["t", "p50", "p99", "max", "pid"] as const) {
        assert.equal(typeof row[key], "number", key);
        assert.ok(Number.isFinite(row[key] as number), key);
      }
      assert.equal(row.role, "server");
    }
  });

  it("does nothing without HARNESS_EL_OUT", () => {
    const cwd = mkdtempSync(path.join(tmpdir(), "el-off-"));
    const result = spawnSync(
      process.execPath,
      ["--require", PRELOAD, "-e", "setTimeout(() => {}, 1500)"],
      { cwd, env: { ...process.env, HARNESS_EL_OUT: "" }, encoding: "utf8", timeout: 20_000 },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readdirSync(cwd).length, 0);
  });

  it("disables the timer after the first write error", () => {
    // The out directory does not exist, so the first append throws; the child must still exit cleanly.
    const missing = path.join(mkdtempSync(path.join(tmpdir(), "el-err-")), "absent");
    const result = runChild({ HARNESS_EL_OUT: missing }, 2_500);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(existsSync(missing), false);
  });
});
