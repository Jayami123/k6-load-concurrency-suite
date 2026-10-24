import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseProcStat } from "../proc-stats.ts";
import type { LoadProduct } from "../types.ts";

export interface AppProcess {
  recordPath: string;
  pgid: number;
  label: string;
}

export interface GroupStats {
  cpuTicks: number;
  rssMb: number;
  fds: number;
  members: number;
}

/** A pid record is JSON {"pid":N,...} (Task 1 harness records) or a bare integer (the P6 bridge's pgid files). */
function pidFromRecord(text: string): number | undefined {
  const trimmed = text.trim();
  const json = (() => {
    try {
      return JSON.parse(trimmed) as { pid?: unknown };
    } catch {
      return undefined;
    }
  })();
  const pid = json && typeof json === "object" ? Number(json.pid) : Number(trimmed);
  return Number.isSafeInteger(pid) && pid > 1 ? pid : undefined;
}

/**
 * The product's own process group(s), read from its record: medusa -> .harness/medusa-backend.pid (and -2 when present), documenso ->
 * .harness/documenso-web.pid, cal -> .harness/cal-web.pid, else results/harness/cal.pgid. Undefined when no record exists (source absent).
 */
export function resolveAppProcess(
  product: LoadProduct,
  opts: { harnessDir?: string; resultsDir?: string; readFile?: (p: string) => string } = {},
): AppProcess[] | undefined {
  const harness = opts.harnessDir ?? path.join("node_modules", "qa-portfolio-harness", ".harness");
  const results = opts.resultsDir ?? path.join("results", "harness");
  const readFile = opts.readFile ?? ((p: string) => readFileSync(p, "utf8"));
  const candidates: Array<{ file: string; label: string }> = (() => {
    switch (product) {
      case "medusa":
        return [
          { file: path.join(harness, "medusa-backend.pid"), label: "medusa" },
          { file: path.join(harness, "medusa-backend-2.pid"), label: "medusa-2" },
        ];
      case "documenso":
        return [{ file: path.join(harness, "documenso-web.pid"), label: "documenso" }];
      case "cal":
        return [
          { file: path.join(harness, "cal-web.pid"), label: "cal" },
          { file: path.join(results, "cal.pgid"), label: "cal" },
        ];
      default:
        return [];
    }
  })();
  const found: AppProcess[] = [];
  for (const c of candidates) {
    let text: string;
    try {
      text = readFile(c.file);
    } catch {
      continue;
    }
    const pgid = pidFromRecord(text);
    if (pgid !== undefined) found.push({ recordPath: c.file, pgid, label: c.label });
    if (product === "cal" && found.length > 0) break; // Cal: the first record that exists wins (cal-web.pid first)
  }
  return found.length > 0 ? found : undefined;
}

export interface GroupIo {
  listPids(): string[];
  readFile(p: string): string;
  listFds(pid: string): number;
}

/** Sums ticks, RSS (MB) and fds of every /proc/<pid> whose process group equals pgid. Unreadable entries are skipped. */
export function readGroupStats(pgid: number, io?: GroupIo): GroupStats {
  const procIo: GroupIo = io ?? {
    listPids: () => readdirSync("/proc").filter((d) => /^\d+$/.test(d)),
    readFile: (p) => readFileSync(p, "utf8"),
    listFds: (pid) => readdirSync(`/proc/${pid}/fd`).length,
  };
  const out: GroupStats = { cpuTicks: 0, rssMb: 0, fds: 0, members: 0 };
  for (const pid of procIo.listPids()) {
    try {
      const stat = parseProcStat(procIo.readFile(`/proc/${pid}/stat`));
      if (stat.pgrp !== pgid) continue;
      const status = procIo.readFile(`/proc/${pid}/status`);
      const rssKb = Number(/^VmRSS:\s+(\d+) kB/m.exec(status)?.[1] ?? 0);
      out.cpuTicks += stat.ticks;
      out.rssMb += rssKb / 1024;
      out.fds += procIo.listFds(pid);
      out.members += 1;
    } catch {
      // A process that exited, or one we cannot read, is skipped.
    }
  }
  return out;
}
