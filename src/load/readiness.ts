import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";

const base = (value: string | undefined, fallback: string) =>
  (value?.trim() || fallback).replace(/\/$/, "");

/** Readiness URLs per product (D10): the health smokes are retired, these are checked before any load. */
export const READINESS = {
  medusa: (env: NodeJS.ProcessEnv) => [
    `${base(env.MEDUSA_BASE_URL, "http://127.0.0.1:9000")}/health`,
  ],
  cal: (env: NodeJS.ProcessEnv) => [`${base(env.CAL_BASE_URL, "http://127.0.0.1:3000")}/pro/30min`],
  documenso: (env: NodeJS.ProcessEnv) => [
    `${base(env.DOCUMENSO_BASE_URL, "http://127.0.0.1:3001")}/signin`,
    `${base(env.DOCUMENSO_BASE_URL, "http://127.0.0.1:3001")}/api/auth/csrf`,
  ],
  twenty: (env: NodeJS.ProcessEnv) => [
    `${base(env.TWENTY_BASE_URL, "http://127.0.0.1:3002")}/healthz`,
  ],
} as const;

/** HTTP 200 on every URL within timeoutMs. Returns the failing URLs with the status or the error name (never a body). */
export async function checkReadiness(
  urls: string[],
  opts: { fetchFn?: typeof fetch; timeoutMs?: number } = {},
): Promise<{ ok: boolean; failures: string[] }> {
  const fetchFn = opts.fetchFn ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 5000;
  const failures: string[] = [];
  for (const url of urls) {
    try {
      const res = await fetchFn(url, { signal: AbortSignal.timeout(timeoutMs) });
      await res.body?.cancel();
      if (res.status !== 200) failures.push(`${url} HTTP ${res.status}`);
    } catch (err) {
      failures.push(`${url} ${(err as Error).name}`);
    }
  }
  return { ok: failures.length === 0, failures };
}

/** Lines of invariantViolations in results/races/*.json that mention a leak. An empty or missing directory gives []. */
export function raceLeakFindings(racesDir: string): string[] {
  if (!existsSync(racesDir)) return [];
  const out: string[] = [];
  for (const file of readdirSync(racesDir).filter((f) => f.endsWith(".json"))) {
    const histogram = JSON.parse(readFileSync(path.join(racesDir, file), "utf8")) as {
      invariantViolations?: string[];
    };
    for (const line of histogram.invariantViolations ?? []) {
      if (/leak|live reservations remain/i.test(line)) out.push(`${file}: ${line}`);
    }
  }
  return out;
}
