import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { perSecondMaxP99, readElWindow } from "../../src/load/telemetry/event-loop.ts";

const START = 1_000_000;

function dirWith(files: Record<string, string[]>): string {
  const dir = mkdtempSync(path.join(tmpdir(), "el-"));
  for (const [name, lines] of Object.entries(files)) {
    writeFileSync(path.join(dir, name), lines.map((l) => `${l}\n`).join(""));
  }
  return dir;
}

/** One ndjson line per second from `from` (seconds after START) for `count` seconds. */
function lines(pid: number, role: string, from: number, count: number, p99 = 3): string[] {
  return Array.from({ length: count }, (_, i) =>
    JSON.stringify({
      t: START + (from + i) * 1000,
      p50: 0.4,
      p99,
      max: p99 + 1,
      pid,
      role,
    }),
  );
}

describe("event-loop rows", () => {
  it("reads ndjson lines and keeps the run window", () => {
    const dir = dirWith({ "el-10.ndjson": lines(10, "server", 0, 32) });
    const win = readElWindow(dir, START, START + 31_000, 30);
    assert.equal(win.present, true);
    assert.equal(win.pids, 1);
    assert.equal(win.rows.length, 32);
    assert.deepEqual(perSecondMaxP99(win.rows)[0], { t: START, v: 3 });
  });

  it("returns present false for a missing directory", () => {
    const win = readElWindow(path.join(tmpdir(), "no-such-el-dir"), START, START + 1000, 1);
    assert.deepEqual(win, { rows: [], present: false, pids: 0, shortPids: [], invalid: 0 });
  });

  it("rejects a row whose max is below p99", () => {
    const bad = JSON.stringify({ t: START, p50: 0.4, p99: 5, max: 4, pid: 10, role: "server" });
    const dir = dirWith({ "el-10.ndjson": [...lines(10, "server", 0, 31), bad] });
    const win = readElWindow(dir, START, START + 31_000, 30);
    assert.equal(win.invalid, 1);
    assert.deepEqual(win.firstBad, { file: "el-10.ndjson", line: 32 });
    assert.equal(
      win.rows.some((r) => r.max < r.p99),
      false,
    );
  });

  it("ignores a non-numeric field", () => {
    const text = JSON.stringify({ t: START, p50: "0.4", p99: 3, max: 4, pid: 10, role: "server" });
    const dir = dirWith({ "el-10.ndjson": [text, ...lines(10, "server", 0, 31)] });
    const win = readElWindow(dir, START, START + 31_000, 30);
    assert.equal(win.invalid, 0);
    assert.equal(win.rows.length, 31);
  });

  it("keeps only the server role from a three-file fixture (wrapper, server, build)", () => {
    // Real harness shape: the npm wrapper and the real server both carry role "server" and cover the window;
    // a build pid carries role "server" but only before the window; a worker line is never kept.
    const dir = dirWith({
      "el-100.ndjson": lines(100, "server", 0, 31),
      "el-101.ndjson": lines(101, "server", 0, 31),
      "el-50.ndjson": lines(50, "server", -60, 30),
      "el-101-worker.ndjson": [],
      "el-102.ndjson": lines(102, "worker", 0, 31),
    });
    const win = readElWindow(dir, START, START + 31_000, 30);
    const kept = new Set(win.rows.map((r) => r.pid));
    assert.equal(kept.has(100), true, "wrapper pid kept");
    assert.equal(kept.has(101), true, "server pid kept");
    assert.equal(kept.has(50), false, "build pid not kept");
    assert.equal(win.shortPids.includes(50), false, "build pid not listed as short");
    assert.equal(kept.has(102), false, "worker line dropped");
    assert.equal(win.pids, 2);
  });

  it("applies the count rule per process and lists the short pids", () => {
    const dir = dirWith({
      "el-200.ndjson": lines(200, "server", 0, 31),
      "el-201.ndjson": lines(201, "server", 0, 5),
    });
    const win = readElWindow(dir, START, START + 31_000, 30);
    assert.deepEqual(win.shortPids, [201]);
    assert.equal(
      win.rows.some((r) => r.pid === 201),
      false,
    );
    assert.equal(win.rows.filter((r) => r.pid === 200).length, 31);
  });
});
