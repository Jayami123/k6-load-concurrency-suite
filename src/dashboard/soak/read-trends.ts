import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { parseSoakBounds, thresholdsFor } from "../../load/soak/bounds.ts";
import { downsampleTelemetry, type Bucket } from "./downsample.ts";

const SOAK_BOUNDS = path.join("k6", "thresholds", "soak-bounds.json");

export const PRODUCT_BY_CASE: Record<string, string> = {
  "P6-CAL-LOAD-008": "cal",
  "P6-MED-LOAD-005": "medusa",
  "P6-DOC-LOAD-006": "documenso",
};

export interface SoakTrend {
  githubRunId: string;
  caseId: string;
  runId: string;
  product: string;
  durationSec: number;
  verdict: string; // "NO THRESHOLD YET" until soak-bounds.json has the product
  rssTheilSenPerMin: number;
  plateauRatio: number;
  buckets: Bucket[];
}

function finite(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function walkSoakFiles(root: string): string[] {
  const out: string[] = [];
  const visit = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = path.join(dir, name);
      if (statSync(p).isDirectory()) visit(p);
      else if (name === "soak.json") out.push(p);
    }
  };
  if (existsSync(root)) visit(root);
  return out;
}

function productBound(product: string): boolean {
  if (!existsSync(SOAK_BOUNDS)) return false;
  const file = parseSoakBounds(JSON.parse(readFileSync(SOAK_BOUNDS, "utf8")));
  return thresholdsFor(file, product) !== null;
}

/** Finds soak.json next to telemetry-main.json. Verdict and slopes come from soak.json, never from the buckets. */
export function readSoakTrends(dir: string, githubRunId: string): SoakTrend[] {
  const rows: SoakTrend[] = [];
  for (const soakPath of walkSoakFiles(dir)) {
    const runDir = path.dirname(soakPath);
    const telemetryPath = path.join(runDir, "telemetry-main.json");
    const soak = JSON.parse(readFileSync(soakPath, "utf8")) as {
      verdict?: unknown;
      statistics?: {
        durationSec?: unknown;
        rssMb?: { slope?: { theilSenPerMin?: unknown }; plateau?: { ratio?: unknown } };
      };
    };
    const theilSen = soak.statistics?.rssMb?.slope?.theilSenPerMin;
    const plateau = soak.statistics?.rssMb?.plateau?.ratio;
    if (!finite(theilSen) || !finite(plateau)) continue;
    const caseId = path.basename(path.dirname(runDir));
    const runId = path.basename(runDir);
    const product = PRODUCT_BY_CASE[caseId] ?? "";
    let buckets: Bucket[] = [];
    if (existsSync(telemetryPath)) {
      const telemetry = JSON.parse(readFileSync(telemetryPath, "utf8")) as {
        intervalMs?: unknown;
        startedAtMs?: unknown;
        samples?: Array<{
          t: number;
          proc?: { rssMb?: number; fds?: number };
          db?: { total?: number };
        }>;
      };
      buckets = downsampleTelemetry(
        Array.isArray(telemetry.samples) ? telemetry.samples : [],
        Number(telemetry.startedAtMs),
        Number(telemetry.intervalMs),
      );
    }
    const verdict = productBound(product) ? String(soak.verdict ?? "") : "NO THRESHOLD YET";
    const durationSec = soak.statistics?.durationSec;
    rows.push({
      githubRunId,
      caseId,
      runId,
      product,
      durationSec: finite(durationSec) ? durationSec : 0,
      verdict,
      rssTheilSenPerMin: theilSen,
      plateauRatio: plateau,
      buckets,
    });
  }
  return rows.sort((a, b) => a.caseId.localeCompare(b.caseId) || a.runId.localeCompare(b.runId));
}
