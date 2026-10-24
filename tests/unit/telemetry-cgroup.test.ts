import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cgroupPaths,
  detectCgroup,
  discoverContainer,
  isSlowFallback,
  parseContainerCpuNs,
  readContainerStats,
} from "../../src/load/telemetry/cgroup-stats.ts";

describe("telemetry cgroup source", () => {
  it("detects v2 from cgroup2fs and v1 otherwise", () => {
    assert.equal(detectCgroup("cgroup2fs\n"), "cgroup-v2");
    assert.equal(detectCgroup("tmpfs"), "cgroup-v1");
  });

  it("gives the v1 and v2 paths for a container", () => {
    assert.equal(
      cgroupPaths("cgroup-v1", "abc").cpu,
      "/sys/fs/cgroup/cpu,cpuacct/docker/abc/cpuacct.usage",
    );
    assert.equal(cgroupPaths("cgroup-v1", "abc").cpuFormat, "ns");
    assert.equal(
      cgroupPaths("cgroup-v2", "abc").mem,
      "/sys/fs/cgroup/system.slice/docker-abc.scope/memory.current",
    );
    assert.equal(cgroupPaths("cgroup-v2", "abc").cpuFormat, "usec-in-stat");
  });

  it("parses v1 nanoseconds", () => {
    assert.equal(parseContainerCpuNs("31585917683\n", "ns"), 31585917683);
  });

  it("parses v2 usage_usec and converts it to nanoseconds", () => {
    const stat = "usage_usec 31585917\nuser_usec 20000000\nsystem_usec 11585917\n";
    assert.equal(parseContainerCpuNs(stat, "usec-in-stat"), 31585917000);
  });

  it("discovers the container from docker ps and docker inspect output", async () => {
    const calls: string[][] = [];
    const found = await discoverContainer("medusa", async (cmd, args) => {
      calls.push([cmd, ...args]);
      return args[0] === "ps" ? "qa-harness-medusa-postgres-1\n" : "sha256:deadbeef\n";
    });
    assert.deepEqual(found, { name: "qa-harness-medusa-postgres-1", id: "sha256:deadbeef" });
    assert.equal(calls[0]?.[3], "name=qa-harness-medusa-postgres");
  });

  it("unreadable cgroup files give undefined, not a throw", () => {
    const stats = readContainerStats("cgroup-v1", "abc", () => {
      throw new Error("ENOENT");
    });
    assert.equal(stats, undefined);
    const ok = readContainerStats("cgroup-v1", "abc", (p) =>
      p.endsWith("cpuacct.usage") ? "100\n" : "2048\n",
    );
    assert.deepEqual(ok, { cpuNs: 100, memBytes: 2048 });
  });

  it("the slow docker stats fallback is flagged", () => {
    assert.equal(isSlowFallback("docker-stats"), true);
    assert.equal(isSlowFallback("cgroup-v2"), false);
    assert.equal(readContainerStats("docker-stats", "abc"), undefined);
  });
});
