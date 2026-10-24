import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  countCompleteRequests,
  harnessLogDir,
  lastSpawnSection,
  lockProviderFromLog,
} from "../../src/medusa/harness-log.ts";

const SPAWN =
  "--- spawn 2026-10-24T00:02:45.051Z /usr/local/bin/node .../@medusajs/cli/cli.js start ---";
const REDIS_LINE = 'info:    Connection to Redis in "locking-redis" provider established';
const MEMORY_LINE = 'info:    Locking module: Using "in-memory" as default.';
const complete = (id: string) =>
  `{"level":"http","method":"POST","path":"/store/carts/cart_${id}/complete","status":200}`;

describe("harness log reader", () => {
  it("lastSpawnSection returns the text after the last marker", () => {
    const text = `${SPAWN}\nfirst run\n--- spawn 2026-10-24T01:00:00.000Z node start ---\nsecond run\n`;
    assert.equal(lastSpawnSection(text).trim(), "second run");
  });

  it("lockProviderFromLog reads redis from the real locking-redis line", () => {
    assert.equal(lockProviderFromLog(`${SPAWN}\n${REDIS_LINE}\n`), "redis");
  });

  it("lockProviderFromLog reads memory from the real in-memory line", () => {
    assert.equal(lockProviderFromLog(`${SPAWN}\n${MEMORY_LINE}\n`), "memory");
  });

  it("lockProviderFromLog ignores an earlier section (append-only log)", () => {
    const text = `${SPAWN}\n${REDIS_LINE}\n--- spawn 2026-10-24T01:00:00.000Z node start ---\n${MEMORY_LINE}\n`;
    assert.equal(lockProviderFromLog(text), "memory");
  });

  it("lockProviderFromLog returns unknown when neither line exists", () => {
    assert.equal(lockProviderFromLog(`${SPAWN}\ninfo: server ready\n`), "unknown");
  });

  it("countCompleteRequests counts only cart completions after the last marker", () => {
    const text = [
      SPAWN,
      complete("1"),
      complete("2"),
      "--- spawn 2026-10-24T01:00:00.000Z node start ---",
      complete("3"),
      '{"level":"http","method":"POST","path":"/store/carts","status":200}',
      complete("4"),
      complete("5"),
      "",
    ].join("\n");
    assert.equal(countCompleteRequests(text), 3);
  });

  it("harnessLogDir honours P6_MEDUSA_LOG_DIR", () => {
    assert.equal(
      harnessLogDir({ P6_MEDUSA_LOG_DIR: "/tmp/harness-logs" }, "/repo"),
      "/tmp/harness-logs",
    );
    assert.equal(harnessLogDir({}, "/repo"), "/repo/node_modules/qa-portfolio-harness/.harness");
  });
});
