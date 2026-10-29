import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  discoverTwentyContainers,
  readContainerSample,
  readProcSample,
  type TwentyContainer,
} from "../../src/load/telemetry/docker-stats.ts";

/** A fake `docker` that knows only the containers in `running`: ps by name, then inspect for the id and the pid. */
function fakeDocker(running: string[]) {
  return async (cmd: string, args: string[]) => {
    assert.equal(cmd, "docker");
    if (args[0] === "ps") {
      const filter = (args[args.indexOf("--filter") + 1] ?? "").replace("name=", "");
      return running.filter((n) => n === filter).join("\n") + "\n";
    }
    const name = args[args.length - 1] ?? "";
    if (args[2] === "{{.Id}}") return `id-${name}\n`;
    if (args[2] === "{{.State.Pid}}") return "4242\n";
    throw new Error(`unexpected docker call: ${args.join(" ")}`);
  };
}

describe("twenty docker stats", () => {
  it("discovers only the Twenty roles that are running", async () => {
    const found = await discoverTwentyContainers(
      fakeDocker(["qa-harness-twenty-server-1", "qa-harness-twenty-db-1"]),
      "cgroup-v1",
    );
    assert.deepEqual(
      found.map((c) => [c.role, c.name, c.id, c.kind, c.pid]),
      [
        [
          "server",
          "qa-harness-twenty-server-1",
          "id-qa-harness-twenty-server-1",
          "cgroup-v1",
          4242,
        ],
        ["db", "qa-harness-twenty-db-1", "id-qa-harness-twenty-db-1", "cgroup-v1", 4242],
      ],
    );
  });

  it("reads no cgroup file when the kind is absent", () => {
    const c: TwentyContainer = {
      role: "server",
      name: "qa-harness-twenty-server-1",
      id: "abc",
      kind: "absent",
    };
    assert.equal(readContainerSample(c), undefined);
  });

  it("parses VmRSS and Threads from /proc and counts the fds", () => {
    const status = "Name:\tnode\nVmRSS:\t  846304 kB\nThreads:\t11\n";
    const sample = readProcSample(4242, {
      readFile: (p) => {
        assert.equal(p, "/proc/4242/status");
        return status;
      },
      readDir: (p) => {
        assert.equal(p, "/proc/4242/fd");
        return ["0", "1", "2"];
      },
    });
    assert.deepEqual(sample, { rssKb: 846304, threads: 11, fds: 3 });
  });

  it("returns undefined when /proc cannot be read", () => {
    const sample = readProcSample(4242, {
      readFile: () => {
        throw new Error("ENOENT");
      },
      readDir: () => [],
    });
    assert.equal(sample, undefined);
  });
});
