import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

export interface AbGate {
  product: string;
  caseId: string;
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
    source,
    a: numbers(raw.a),
    b: numbers(raw.b),
    ratios: numbers(raw.ratios),
    verdict: typeof raw.verdict === "string" ? raw.verdict : undefined,
    rule: typeof raw.rule === "string" ? raw.rule : undefined,
    toleranceRel,
  };
}

function unlabelledMedusa(dir: string): AbGate | undefined {
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
    source: "unlabelled-arms",
    pendingReason: "verdict file not in release; arm labels not in the artefact path",
    p95: points.map((p) => p.p95Ms),
  };
}

function fromSelftest(file: string): AbGate | undefined {
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
    source: "selftest.json",
    a: numbers(raw.p95?.a),
    b: numbers(raw.p95?.slow),
    ratios: numbers(slowed.ratios),
    verdict: typeof slowed.verdict === "string" ? slowed.verdict : undefined,
    rule: typeof slowed.rule === "string" ? slowed.rule : undefined,
  };
}

export function readAbGate(dir: string, _githubRunId: string): AbGate[] {
  const out: AbGate[] = [];
  const calFile = findNamed(dir, "gate-verdict-cal.json");
  if (calFile) {
    const cal = fromVerdictFile(calFile, "gate-verdict-cal.json");
    if (cal) out.push(cal);
  }
  const medFile = findNamed(dir, "gate-verdict-medusa.json");
  if (medFile) {
    const med = fromVerdictFile(medFile, "gate-verdict-medusa.json");
    if (med) out.push(med);
  } else {
    const unlabelled = unlabelledMedusa(dir);
    if (unlabelled) out.push(unlabelled);
  }
  const selfFile = findNamed(dir, "selftest.json");
  if (selfFile) {
    const selftest = fromSelftest(selfFile);
    if (selftest) out.push(selftest);
  }
  return out;
}
