import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { execSync } from "node:child_process";
import type { RaceHistogram, RaceProduct } from "./types.ts";

export function commitShaFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  const fromCi = env.GITHUB_SHA?.trim();
  if (fromCi) return fromCi;
  try {
    return execSync("git rev-parse HEAD", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "unknown";
  }
}

export function createHistogram(input: {
  caseId: string;
  title: string;
  product: RaceProduct;
  concurrency: number;
  trials: number;
}): RaceHistogram {
  return {
    caseId: input.caseId,
    title: input.title,
    product: input.product,
    commitSha: commitShaFromEnv(),
    startedAt: new Date().toISOString(),
    finishedAt: "",
    trialsRequested: input.trials,
    concurrency: input.concurrency,
    statusCounts: {},
    trials: [],
    attempts: [],
    oracle: {},
    dispatchSpreadMs: { min: 0, max: 0, mean: 0 },
    invalidDispatchSpreadMs: { min: 0, max: 0, mean: 0 },
    invalidTrials: 0,
    reruns: 0,
    spreadPolicy: {
      limitMs: 0,
      maxReruns: 0,
      maxInvalidSharePct: 0,
      minInvalidBudget: 0,
      invalidBudget: 0,
    },
    invariantViolations: [],
    verdict: "fail",
  };
}

export function histogramPath(caseId: string): string {
  return join("results", "races", `${caseId}.json`);
}

export async function writeHistogram(histogram: RaceHistogram): Promise<string> {
  if (!histogram.finishedAt) {
    histogram.finishedAt = new Date().toISOString();
  }
  const path = histogramPath(histogram.caseId);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(histogram, null, 2)}\n`, "utf8");
  return path;
}

export async function readHistogram(caseId: string): Promise<RaceHistogram> {
  const { readFile } = await import("node:fs/promises");
  const raw = await readFile(histogramPath(caseId), "utf8");
  return JSON.parse(raw) as RaceHistogram;
}

export function mergeStatusCounts(
  target: Record<string, number>,
  counts: Record<string, number>,
): void {
  for (const [key, value] of Object.entries(counts)) {
    target[key] = (target[key] ?? 0) + value;
  }
}

export function statusCountsFromRequests(statuses: Array<number | null>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const status of statuses) {
    const key = status === null ? "error" : String(status);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

export function aggregateDispatchSpread(spreads: number[]): {
  min: number;
  max: number;
  mean: number;
} {
  if (spreads.length === 0) {
    return { min: 0, max: 0, mean: 0 };
  }
  const min = Math.min(...spreads);
  const max = Math.max(...spreads);
  const mean = spreads.reduce((a, b) => a + b, 0) / spreads.length;
  return { min, max, mean };
}
