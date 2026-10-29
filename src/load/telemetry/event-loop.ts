// Event-loop delay rows that the preload writes (plan §5.6). Numbers only; the preload never writes text.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

export interface ElRow {
  t: number;
  p50: number;
  p99: number;
  max: number;
  pid: number;
  role: string;
}

export interface ElWindow {
  rows: ElRow[];
  present: boolean;
  /** Server pids with at least one row inside the window. Build, seed and exited processes are not counted. */
  pids: number;
  /** In-window server pids below the count rule (floor(durationSec) - 2 rows). Their rows are dropped, never zero-filled. */
  shortPids: number[];
  /** Numeric rows that break an invariant (a negative value, p99 < p50 or max < p99). */
  invalid: number;
  firstBad?: { file: string; line: number };
}

const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Reads every el-*.ndjson line, keeps role "server" rows inside [startMs, endMs] and applies the count rule to every
 *  server pid that has rows in the window. Missing directory: present false. Never throws on a bad line. */
export function readElWindow(
  dir: string,
  startMs: number,
  endMs: number,
  durationSec: number,
): ElWindow {
  if (!existsSync(dir)) return { rows: [], present: false, pids: 0, shortPids: [], invalid: 0 };
  const byPid = new Map<number, ElRow[]>();
  let invalid = 0;
  let firstBad: ElWindow["firstBad"];
  for (const file of readdirSync(dir)
    .filter((f) => /^el-.*\.ndjson$/.test(f))
    .sort()) {
    const lines = readFileSync(path.join(dir, file), "utf8").split("\n");
    lines.forEach((text, index) => {
      if (text.trim() === "") return;
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(text) as Record<string, unknown>;
      } catch {
        return;
      }
      const { t, p50, p99, max, pid, role } = parsed;
      if (!isNumber(t) || !isNumber(p50) || !isNumber(p99) || !isNumber(max) || !isNumber(pid))
        return;
      if (typeof role !== "string") return;
      if (role !== "server" || t < startMs || t > endMs) return;
      const row: ElRow = { t, p50, p99, max, pid, role };
      if (p50 < 0 || p99 < p50 || max < p99) {
        invalid += 1;
        firstBad ??= { file, line: index + 1 };
        return;
      }
      byPid.set(pid, [...(byPid.get(pid) ?? []), row]);
    });
  }
  const required = Math.floor(durationSec) - 2;
  const shortPids: number[] = [];
  const rows: ElRow[] = [];
  for (const [pid, pidRows] of byPid) {
    if (pidRows.length < required) {
      shortPids.push(pid);
      continue;
    }
    rows.push(...pidRows);
  }
  return {
    rows,
    present: true,
    pids: byPid.size,
    shortPids,
    invalid,
    ...(firstBad ? { firstBad } : {}),
  };
}

/** The chart series: per-second maximum of p99 across the in-window server pids (plan correction 4). */
export function perSecondMaxP99(rows: ElRow[]): Array<{ t: number; v: number }> {
  const bySecond = new Map<number, number>();
  for (const row of rows) {
    const second = Math.floor(row.t / 1000) * 1000;
    bySecond.set(second, Math.max(bySecond.get(second) ?? 0, row.p99));
  }
  return [...bySecond].sort((a, b) => a[0] - b[0]).map(([t, v]) => ({ t, v }));
}
