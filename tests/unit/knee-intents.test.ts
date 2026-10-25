import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyIntents, parseIntentLog } from "../../src/load/knee/intents.ts";

const LINE = (json: string) =>
  `time="2026-10-25T10:00:00Z" level=info msg="${json.replace(/"/g, '\\"')}" source=console`;

describe("knee intents", () => {
  it("parseIntentLog reads k6 console lines with escaped quotes and ignores every other line", () => {
    const text = [
      'time="t" level=warning msg="something else"',
      LINE('{"intent":3,"outcome":"ok"}'),
      LINE('{"intent":4,"outcome":"fail","ghost":true}'),
      "garbage line with no message",
      LINE('{"intent":5,"outcome":"fail","net":true}'),
    ].join("\n");
    const log = parseIntentLog(text, 10);
    assert.deepEqual(
      [...log.outcomes.entries()].map(([i, v]) => [i, v.outcome, v.net, v.ghost]),
      [
        [3, "ok", false, false],
        [4, "fail", false, true],
        [5, "fail", true, false],
      ],
    );
    assert.deepEqual(log.duplicateLines, []);
    assert.deepEqual(log.beyondStarted, []);
  });

  it("a repeated intent line and a line at or above started are reported as TEST BUG findings", () => {
    const log = parseIntentLog(
      [
        LINE('{"intent":1,"outcome":"ok"}'),
        LINE('{"intent":1,"outcome":"ok"}'),
        LINE('{"intent":9,"outcome":"ok"}'),
      ].join("\n"),
      5,
    );
    assert.deepEqual(log.duplicateLines, [1]);
    assert.deepEqual(log.beyondStarted, [9]);
  });

  it("a fail with net: true is indeterminate; a plain fail is not", () => {
    const log = parseIntentLog(
      [
        LINE('{"intent":0,"outcome":"fail"}'),
        LINE('{"intent":1,"outcome":"fail","net":true}'),
        LINE('{"intent":2,"outcome":"ok"}'),
      ].join("\n"),
      4,
    );
    const c = classifyIntents(log, 4);
    assert.deepEqual(c.fail, [0]);
    assert.deepEqual(c.indeterminate, [1, 3]);
    assert.deepEqual(c.noLine, [3]);
    assert.deepEqual(c.ok, [2]);
  });
});
