import { execFile } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { type CgroupKind, readContainerStats } from "./cgroup-stats.ts";

/** The three Twenty containers the sampler reads (Twenty plan §6.4). */
export const TWENTY_CONTAINER_ROLES = ["server", "worker", "db"] as const;
export type TwentyContainerRole = (typeof TWENTY_CONTAINER_ROLES)[number];

export interface TwentyContainer {
  role: TwentyContainerRole;
  name: string; // qa-harness-twenty-<role>-1
  id: string; // the full container id (cgroup path segment)
  kind: CgroupKind; // the cgroup layout of the host (v1 or v2), from /sys/fs/cgroup
  pid?: number; // the container's init pid on the host, for /proc
}

/** One tick of one container. Every field is absent when its source could not be read. */
export interface TwentyContainerSample {
  role: TwentyContainerRole;
  cpuNs?: number;
  memBytes?: number;
  rssKb?: number;
  threads?: number;
  fds?: number;
}

const run = (cmd: string, args: string[]) =>
  new Promise<string>((resolve, reject) =>
    execFile(cmd, args, { encoding: "utf8", timeout: 10_000 }, (err, stdout) =>
      err ? reject(err) : resolve(stdout),
    ),
  );

/**
 * Finds each Twenty container once at start: docker ps by exact name, then its id and pid. A role that is not running is
 * left out (the sampler reports it), never a throw.
 */
export async function discoverTwentyContainers(
  exec: (cmd: string, args: string[]) => Promise<string> = run,
  kind: CgroupKind = "absent",
): Promise<TwentyContainer[]> {
  const found: TwentyContainer[] = [];
  for (const role of TWENTY_CONTAINER_ROLES) {
    const name = `qa-harness-twenty-${role}-1`;
    const names = (
      await exec("docker", ["ps", "--filter", `name=${name}`, "--format", "{{.Names}}"])
    )
      .split("\n")
      .map((line) => line.trim());
    if (!names.includes(name)) continue;
    const id = (await exec("docker", ["inspect", "-f", "{{.Id}}", name])).trim();
    if (!id) continue;
    const pid = Number((await exec("docker", ["inspect", "-f", "{{.State.Pid}}", name])).trim());
    found.push({ role, name, id, kind, pid: Number.isInteger(pid) && pid > 0 ? pid : undefined });
  }
  return found;
}

/** CPU and memory from the cgroup files for the container's kind. Undefined when the kind is absent or a file is unreadable. */
export function readContainerSample(
  c: TwentyContainer,
): { cpuNs: number; memBytes: number } | undefined {
  return readContainerStats(c.kind, c.id);
}

/**
 * RSS, threads and open file descriptors of one process from /proc (Twenty plan P23). Undefined when a file is unreadable.
 * The readers are injectable for tests.
 */
export function readProcSample(
  pid: number,
  deps: { readFile?: (p: string) => string; readDir?: (p: string) => string[] } = {},
): { rssKb: number; threads: number; fds: number } | undefined {
  const readFile = deps.readFile ?? ((p: string) => readFileSync(p, "utf8"));
  const readDir = deps.readDir ?? ((p: string) => readdirSync(p));
  try {
    const status = readFile(`/proc/${pid}/status`);
    const rssKb = Number(/^VmRSS:\s+(\d+)\s+kB/m.exec(status)?.[1]);
    const threads = Number(/^Threads:\s+(\d+)/m.exec(status)?.[1]);
    const fds = readDir(`/proc/${pid}/fd`).length;
    if (!Number.isFinite(rssKb) || !Number.isFinite(threads)) return undefined;
    return { rssKb, threads, fds };
  } catch {
    return undefined;
  }
}

/** One tick: the cgroup and /proc readings of each discovered container. Fields that cannot be read are left out. */
export function sampleTwentyContainers(containers: TwentyContainer[]): TwentyContainerSample[] {
  return containers.map((c) => {
    const cgroup = readContainerSample(c);
    const proc = c.pid === undefined ? undefined : readProcSample(c.pid);
    return { role: c.role, ...cgroup, ...proc };
  });
}
