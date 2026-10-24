import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { countFromChunk, createLogCounter, type LogIo } from "../../src/load/telemetry/log-grep.ts";

/** A file held in memory: the io reads the bytes appended to it. */
function memoryIo(initial: string): { io: LogIo; set(text: string): void } {
  let text = initial;
  return {
    io: {
      size: () => text.length,
      read: (_f, from, to) => text.slice(from, to),
    },
    set: (t) => {
      text = t;
    },
  };
}

describe("telemetry log source", () => {
  it("counts Medusa 5xx responses and the maximum duration", () => {
    const chunk =
      [
        '{"level":"http","status":200,"duration":146.4}',
        '{"level":"http","status":503,"duration":2050.1}',
        '{"level":"http","status":500,"duration":12}',
      ].join("\n") + "\n";
    const c = countFromChunk("medusa", chunk);
    assert.equal(c.http5xx, 2);
    assert.equal(c.maxServerMs, 2050.1);
  });

  it("the Cal noise classes are counted apart and never as errors", () => {
    const chunk =
      [
        "error: ECONNREFUSED 127.0.0.1:1025 while sending mail",
        "error: createMeeting failed for daily-video",
        "error: booking handler crashed",
      ].join("\n") + "\n";
    const c = countFromChunk("cal", chunk);
    assert.deepEqual(c.knownNoise, { smtp: 1, dailyVideo: 1 });
    assert.equal(c.errorLines, 1);
  });

  it("a Documenso job failure is counted", () => {
    const c = countFromChunk(
      "documenso",
      "[JOBS]: Job send.document.completed.emails failed\n[JOBS]: Triggering job x\n",
    );
    assert.equal(c.jobFailures, 1);
  });

  it("the offset starts at the current size, so earlier lines never count", () => {
    const { io, set } = memoryIo("error: old line\n");
    const counter = createLogCounter("f.log", "cal", io);
    set("error: old line\nerror: new line\n");
    assert.equal(counter.poll().errorLines, 1);
  });

  it("a shrunk file (rotation or truncation) restarts at offset 0", () => {
    const { io, set } = memoryIo("error: a\nerror: b\nerror: c\n");
    const counter = createLogCounter("f.log", "cal", io);
    set("error: fresh\n");
    assert.equal(counter.poll().errorLines, 1);
  });

  it("the result holds numbers only, even for a chunk that contains a token", () => {
    const chunk = "error: sign link /sign/tok_abcdefghijklmnop Bearer abcdefghijklmnopqrstuvwx\n";
    const c = countFromChunk("documenso", chunk);
    const text = JSON.stringify(c);
    assert.ok(!text.includes("tok_abcdefghijklmnop"));
    assert.ok(!text.includes("Bearer"));
    assert.equal(c.errorLines, 1);
  });

  it("a line split across two polls is counted once", () => {
    const { io, set } = memoryIo("");
    const counter = createLogCounter("f.log", "cal", io);
    set("error: half");
    assert.equal(counter.poll().errorLines, 0);
    set("error: half of a line\n");
    assert.equal(counter.poll().errorLines, 1);
    assert.equal(counter.poll().errorLines, 0);
  });
});
