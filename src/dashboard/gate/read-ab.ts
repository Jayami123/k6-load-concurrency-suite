import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

export interface AbGate {
  product: string;
  caseId: string;
  githubRunId: string;
  source:
    "gate-verdict-cal.json" | "gate-verdict-medusa.json" | "unlabelled-arms" | "selftest.json";
  pendingReason?: string;
  a?: number[];
  b?: number[];
  ratios?: number[];
  verdict?: string;
  rule?: string;
  toleranceRel?: number;
  /** Unlabelled Medusa p95 values in startedAt order. Never paired with a/b letters. */
  p95?: number[];
}

const LABELLED_SOURCES: ReadonlySet<AbGate["source"]> = new Set([
  "gate-verdict-cal.json",
  "gate-verdict-medusa.json",
  "selftest.json",
]);

function runIdRank(id: string | undefined): bigint {
  return id && /^\d+$/.test(id) ? BigInt(id) : 0n;
}

/** Per product, the newest run with a labelled verdict wins; else the newest run. */
export function preferReleasedAb(rows: AbGate[]): AbGate[] {
  const byProduct = new Map<string, AbGate[]>();
  for (const row of rows) {
    const list = byProduct.get(row.product) ?? [];
    list.push(row);
    byProduct.set(row.product, list);
  }
  const out: AbGate[] = [];
  for (const group of byProduct.values()) {
    const labelled = group.filter((r) => LABELLED_SOURCES.has(r.source));
    const pool = labelled.length > 0 ? labelled : group;
    let winner = pool[0];
    for (const row of pool.slice(1)) {
      if (!winner || runIdRank(row.githubRunId) > runIdRank(winner.githubRunId)) winner = row;
    }
    if (winner) out.push(winner);
  }
  return out;
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

function findNamed(root: string, basename: string): string | undefined {
  let found: string | undefined;
  walkFiles(root, (file) => {
    if (path.basename(file) === basename && found === undefined) found = file;
  });
  return found;
}

function numbers(value: unknown): number[] | undefined {
  if (!Array.isArray(value) || value.some((v) => typeof v !== "number" || !Number.isFinite(v)))
    return undefined;
  return value as number[];
}

function p95Of(summary: {
  metrics?: { http_req_duration?: Record<string, unknown> };
}): number | undefined {
  const v = summary.metrics?.http_req_duration?.["p(95)"];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function fromVerdictFile(
  file: string,
  source: "gate-verdict-cal.json" | "gate-verdict-medusa.json",
  githubRunId: string,
): AbGate | undefined {
  let raw: {
    product?: unknown;
    caseId?: unknown;
    a?: unknown;
    b?: unknown;
    ratios?: unknown;
    verdict?: unknown;
    rule?: unknown;
    tolerance?: { tolerance?: unknown };
  };
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return undefined;
  }
  const toleranceRel =
    typeof raw.tolerance?.tolerance === "number" && Number.isFinite(raw.tolerance.tolerance)
      ? raw.tolerance.tolerance
      : undefined;
  return {
    product: String(raw.product ?? ""),
    caseId: String(raw.caseId ?? ""),
    githubRunId,
    source,
    a: numbers(raw.a),
    b: numbers(raw.b),
    ratios: numbers(raw.ratios),
    verdict: typeof raw.verdict === "string" ? raw.verdict : undefined,
    rule: typeof raw.rule === "string" ? raw.rule : undefined,
    toleranceRel,
  };
}

function unlabelledMedusa(dir: string, githubRunId: string): AbGate | undefined {
  const root = path.join(dir, "ab-medusa", "load-medusa", "P6-MED-LOAD-002");
  if (!existsSync(root) || !statSync(root).isDirectory()) return undefined;
  const points: Array<{ startedAt: string; p95Ms: number }> = [];
  for (const name of readdirSync(root)) {
    const runDir = path.join(root, name);
    if (!statSync(runDir).isDirectory()) continue;
    const metaPath = path.join(runDir, "run-meta.json");
    const summaryPath = path.join(runDir, "k6-main-summary.json");
    if (!existsSync(metaPath) || !existsSync(summaryPath)) continue;
    let meta: { startedAt?: unknown };
    let summary: { metrics?: { http_req_duration?: Record<string, unknown> } };
    try {
      meta = JSON.parse(readFileSync(metaPath, "utf8"));
      summary = JSON.parse(readFileSync(summaryPath, "utf8"));
    } catch {
      continue;
    }
    if (typeof meta.startedAt !== "string" || meta.startedAt.length < 10) continue;
    const p95Ms = p95Of(summary);
    if (p95Ms === undefined) continue;
    points.push({ startedAt: meta.startedAt, p95Ms });
  }
  if (points.length === 0) return undefined;
  points.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  return {
    product: "medusa",
    caseId: "P6-MED-LOAD-002",
    githubRunId,
    source: "unlabelled-arms",
    pendingReason: "verdict file not in release; arm labels not in the artefact path",
    p95: points.map((p) => p.p95Ms),
  };
}

function fromSelftest(file: string, githubRunId: string): AbGate | undefined {
  let raw: {
    p95?: { a?: unknown; slow?: unknown };
    slowed?: { verdict?: unknown; ratios?: unknown; rule?: unknown };
  };
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return undefined;
  }
  const slowed = raw.slowed;
  if (!slowed) return undefined;
  return {
    product: "selftest",
    caseId: "P6-X-LOAD-008",
    githubRunId,
    source: "selftest.json",
    a: numbers(raw.p95?.a),
    b: numbers(raw.p95?.slow),
    ratios: numbers(slowed.ratios),
    verdict: typeof slowed.verdict === "string" ? slowed.verdict : undefined,
    rule: typeof slowed.rule === "string" ? slowed.rule : undefined,
  };
}

export function readAbGate(dir: string, githubRunId: string): AbGate[] {
  const out: AbGate[] = [];
  const calFile = findNamed(dir, "gate-verdict-cal.json");
  if (calFile) {
    const cal = fromVerdictFile(calFile, "gate-verdict-cal.json", githubRunId);
    if (cal) out.push(cal);
  }
  const medFile = findNamed(dir, "gate-verdict-medusa.json");
  if (medFile) {
    const med = fromVerdictFile(medFile, "gate-verdict-medusa.json", githubRunId);
    if (med) out.push(med);
  } else {
    const unlabelled = unlabelledMedusa(dir, githubRunId);
    if (unlabelled) out.push(unlabelled);
  }
  const selfFile = findNamed(dir, "selftest.json");
  if (selfFile) {
    const selftest = fromSelftest(selfFile, githubRunId);
    if (selftest) out.push(selftest);
  }
  return out;
}
