// The database container's CPU and memory from its cgroup (plan task 5 §6.3). Reads files; never writes.
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import type { LoadProduct } from "../types.ts";

export type CgroupKind = "cgroup-v1" | "cgroup-v2" | "docker-stats" | "absent";

/** `stat -f -c %T /sys/fs/cgroup` prints cgroup2fs on the unified hierarchy; anything else is v1. */
export function detectCgroup(statfsType: string): "cgroup-v1" | "cgroup-v2" {
  return statfsType.trim() === "cgroup2fs" ? "cgroup-v2" : "cgroup-v1";
}

export function cgroupPaths(
  kind: "cgroup-v1" | "cgroup-v2",
  containerId: string,
): { cpu: string; mem: string; cpuFormat: "ns" | "usec-in-stat" } {
  if (kind === "cgroup-v1") {
    return {
      cpu: `/sys/fs/cgroup/cpu,cpuacct/docker/${containerId}/cpuacct.usage`,
      mem: `/sys/fs/cgroup/memory/docker/${containerId}/memory.usage_in_bytes`,
      cpuFormat: "ns",
    };
  }
  return {
    cpu: `/sys/fs/cgroup/system.slice/docker-${containerId}.scope/cpu.stat`,
    mem: `/sys/fs/cgroup/system.slice/docker-${containerId}.scope/memory.current`,
    cpuFormat: "usec-in-stat",
  };
}

/** v1 cpuacct.usage is nanoseconds; v2 cpu.stat has `usage_usec N`, converted to nanoseconds. */
export function parseContainerCpuNs(text: string, format: "ns" | "usec-in-stat"): number {
  if (format === "ns") return Number(text.trim());
  const line = text.split("\n").find((l) => l.startsWith("usage_usec "));
  return line ? Number(line.split(/\s+/)[1]) * 1000 : Number.NaN;
}

const run = (cmd: string, args: string[]): Promise<string> =>
  new Promise((resolve, reject) =>
    execFile(cmd, args, { encoding: "utf8", timeout: 10_000 }, (err, stdout) =>
      err ? reject(err) : resolve(stdout),
    ),
  );

/** Per-product database container name filters. Twenty's database is `qa-harness-twenty-db-1`, not `…-postgres` (Twenty plan P20). */
const DB_CONTAINER_FILTER: Partial<Record<LoadProduct, string>> = {
  twenty: "qa-harness-twenty-db-1",
};

/** The first file of the list that reads. Throws the last read error when none does. */
function readFirst(files: string[], readFile: (p: string) => string): string {
  let lastError: unknown = new Error("no candidate file");
  for (const file of files) {
    try {
      return readFile(file);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

/** The case database's container, found once at start: docker ps by name, then its full id. Undefined when none runs. */
export async function discoverContainer(
  product: LoadProduct,
  exec: (cmd: string, args: string[]) => Promise<string> = run,
): Promise<{ name: string; id: string } | undefined> {
  const names = (
    await exec("docker", [
      "ps",
      "--filter",
      `name=${DB_CONTAINER_FILTER[product] ?? `qa-harness-${product}-postgres`}`,
      "--format",
      "{{.Names}}",
    ])
  )
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const name = names[0];
  if (!name) return undefined;
  const id = (await exec("docker", ["inspect", "-f", "{{.Id}}", name])).trim();
  return id ? { name, id } : undefined;
}

/** Reads the container's CPU and memory. Undefined when the kind is absent, the fallback, or a file cannot be read. */
export function readContainerStats(
  kind: CgroupKind,
  id: string,
  readFile: (p: string) => string = (p) => readFileSync(p, "utf8"),
): { cpuNs: number; memBytes: number } | undefined {
  if (kind !== "cgroup-v1" && kind !== "cgroup-v2") return undefined;
  const paths = cgroupPaths(kind, id);
  // A v1 host mounts cpu and cpuacct together (`cpu,cpuacct`) or apart (`cpuacct`); the file is read from whichever exists.
  const cpuFiles =
    kind === "cgroup-v1"
      ? [paths.cpu, paths.cpu.replace("/cpu,cpuacct/", "/cpuacct/")]
      : [paths.cpu];
  try {
    const cpuNs = parseContainerCpuNs(readFirst(cpuFiles, readFile), paths.cpuFormat);
    const memBytes = Number(readFile(paths.mem).trim());
    if (!Number.isFinite(cpuNs) || !Number.isFinite(memBytes)) return undefined;
    return { cpuNs, memBytes };
  } catch {
    return undefined;
  }
}

/** `docker stats` is the slow fallback (about a second per call): the sampler marks it so the overhead is visible. */
export function isSlowFallback(kind: CgroupKind): boolean {
  return kind === "docker-stats";
}
