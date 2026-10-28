import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

export interface AaArmPoint {
  githubRunId: string;
  runId: string;
  startedAt: string;
  utcDay: string;
  p95Ms: number;
  warmup: boolean;
}

export interface AaSeries {
  product: "cal" | "medusa";
  caseId: string;
  points: AaArmPoint[];
  spread: number;
  tolerance: number; // from k6/thresholds/tolerance.json, metric p95Ms
}

interface ToleranceP95 {
  spread: number;
  tolerance: number;
}

function walkFiles(root: string, visit: (file: string) => void): void {
  if (!existsSync(root)) return;
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    for (const name of readdirSync(dir)) {
      const p = path.join(dir, name);
      if (statSync(p).isDirectory()) stack.push(p);
      else visit(p);
    }
  }
}

function aaProductOf(file: string): "cal" | "medusa" | undefined {
  const parts = file.split(path.sep);
  if (parts.includes("aa-cal")) return "cal";
  if (parts.includes("aa-medusa")) return "medusa";
  return undefined;
}

function p95Of(summary: {
  metrics?: { http_req_duration?: Record<string, unknown> };
}): number | undefined {
  const v = summary.metrics?.http_req_duration?.["p(95)"];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function readToleranceP95(product: "cal" | "medusa"): ToleranceP95 {
  const file = path.join("k6", "thresholds", "tolerance.json");
  if (!existsSync(file)) throw new Error("TEST BUG: k6/thresholds/tolerance.json is missing");
  const parsed = JSON.parse(readFileSync(file, "utf8")) as {
    products?: Record<string, { p95Ms?: ToleranceP95 }>;
  };
  const row = parsed.products?.[product]?.p95Ms;
  if (!row || !Number.isFinite(row.spread) || !Number.isFinite(row.tolerance))
    throw new Error(`TEST BUG: k6/thresholds/tolerance.json has no p95Ms for ${product}`);
  return { spread: row.spread, tolerance: row.tolerance };
}

/**
 * Arms = folders with run-meta.json + k6-main-summary.json under aa-cal or aa-medusa.
 * Warm-up = earliest startedAt per githubRunId per product (write-tolerance.ts:77-93, gate.yml warm-up steps).
 * p95Ms = summary.metrics.http_req_duration["p(95)"].
 * Spread is not recomputed for the tile: the tile prints tolerance.json.
 */
export function readAaSeries(dir: string, githubRunId: string): AaSeries[] {
  const hasCal = existsSync(path.join(dir, "aa-cal"));
  const hasMedusa = existsSync(path.join(dir, "aa-medusa"));
  if (!hasCal && !hasMedusa) return [];

  const found: Array<{
    product: "cal" | "medusa";
    runId: string;
    caseId: string;
    startedAt: string;
    p95Ms: number;
  }> = [];
  walkFiles(dir, (file) => {
    if (path.basename(file) !== "run-meta.json") return;
    const product = aaProductOf(file);
    if (!product) return;
    const summaryPath = path.join(path.dirname(file), "k6-main-summary.json");
    if (!existsSync(summaryPath)) return;
    let meta: { startedAt?: unknown; runId?: unknown; caseId?: unknown };
    let summary: { metrics?: { http_req_duration?: Record<string, unknown> } };
    try {
      meta = JSON.parse(readFileSync(file, "utf8"));
      summary = JSON.parse(readFileSync(summaryPath, "utf8"));
    } catch {
      return;
    }
    if (typeof meta.startedAt !== "string" || meta.startedAt.length < 10) return;
    const p95Ms = p95Of(summary);
    if (p95Ms === undefined) return;
    found.push({
      product,
      runId: typeof meta.runId === "string" ? meta.runId : path.basename(path.dirname(file)),
      caseId: typeof meta.caseId === "string" ? meta.caseId : "",
      startedAt: meta.startedAt,
      p95Ms,
    });
  });

  const products: Array<"cal" | "medusa"> = ["cal", "medusa"];
  const out: AaSeries[] = [];
  for (const product of products) {
    const rows = found.filter((r) => r.product === product);
    if (rows.length === 0) continue;
    const earliestByRun = new Map<string, string>();
    for (const row of rows) {
      const prev = earliestByRun.get(githubRunId);
      if (prev === undefined || row.startedAt < prev) earliestByRun.set(githubRunId, row.startedAt);
    }
    const earliest = earliestByRun.get(githubRunId);
    const tol = readToleranceP95(product);
    const points: AaArmPoint[] = rows
      .map((row) => ({
        githubRunId,
        runId: row.runId,
        startedAt: row.startedAt,
        utcDay: row.startedAt.slice(0, 10),
        p95Ms: row.p95Ms,
        warmup: earliest !== undefined && row.startedAt === earliest,
      }))
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    out.push({
      product,
      caseId: rows[0]!.caseId,
      points,
      spread: tol.spread,
      tolerance: tol.tolerance,
    });
  }
  return out;
}
