import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readGroupStats, resolveAppProcess } from "../../src/load/telemetry/proc-group.ts";

const files = (map: Record<string, string>) => (p: string) => {
  if (p in map) return map[p]!;
  throw new Error(`ENOENT ${p}`);
};

describe("telemetry proc group", () => {
  it("reads a JSON pid record", () => {
    const found = resolveAppProcess("documenso", {
      harnessDir: "h",
      readFile: files({ "h/documenso-web.pid": '{"pid":5894,"startMark":"104"}' }),
    });
    assert.deepEqual(found, [
      { recordPath: "h/documenso-web.pid", pgid: 5894, label: "documenso" },
    ]);
  });

  it("reads a bare integer record", () => {
    const found = resolveAppProcess("documenso", {
      harnessDir: "h",
      readFile: files({ "h/documenso-web.pid": "5894\n" }),
    });
    assert.equal(found?.[0]?.pgid, 5894);
  });

  it("a missing record gives undefined, so the source is absent", () => {
    assert.equal(
      resolveAppProcess("cal", { harnessDir: "h", resultsDir: "r", readFile: files({}) }),
      undefined,
    );
  });

  it("Cal prefers cal-web.pid over the bridge's cal.pgid", () => {
    const found = resolveAppProcess("cal", {
      harnessDir: "h",
      resultsDir: "r",
      readFile: files({ "h/cal-web.pid": '{"pid":111}', "r/cal.pgid": "222" }),
    });
    assert.equal(found?.[0]?.pgid, 111);
  });

  it("sums the ticks, RSS and fds of the processes in the group", () => {
    const stat = (pid: number, pgrp: number, ticks: number) =>
      `${pid} (n) S 1 ${pgrp} ${pgrp} 0 -1 0 0 0 0 0 ${ticks} 0 0 0`;
    const status = (kb: number) => `VmRSS:\t   ${kb} kB\n`;
    const map: Record<string, string> = {
      "/proc/10/stat": stat(10, 77, 5),
      "/proc/10/status": status(1024),
      "/proc/11/stat": stat(11, 77, 3),
      "/proc/11/status": status(2048),
      "/proc/12/stat": stat(12, 99, 100),
      "/proc/12/status": status(4096),
    };
    const io = { listPids: () => ["10", "11", "12"], readFile: files(map), listFds: () => 4 };
    assert.deepEqual(readGroupStats(77, io), { cpuTicks: 8, rssMb: 3, fds: 8, members: 2 });
  });

  it("an unreadable entry is skipped", () => {
    const io = { listPids: () => ["13"], readFile: files({}), listFds: () => 0 };
    assert.deepEqual(readGroupStats(77, io), { cpuTicks: 0, rssMb: 0, fds: 0, members: 0 });
  });

  it("a command name with spaces and parentheses is read correctly", () => {
    const map: Record<string, string> = {
      "/proc/14/stat": "14 (k6 (run) x) S 1 77 77 0 -1 0 0 0 0 0 9 1 0 0",
      "/proc/14/status": "VmRSS:\t   1024 kB\n",
    };
    const io = { listPids: () => ["14"], readFile: files(map), listFds: () => 2 };
    assert.deepEqual(readGroupStats(77, io), { cpuTicks: 10, rssMb: 1, fds: 2, members: 1 });
  });
});
