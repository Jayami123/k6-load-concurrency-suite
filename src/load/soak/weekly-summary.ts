// The weekly soak summary: schema v1, the week a run belongs to, and the rule that decides whether a soak run is a
// weekly point. Pure: no file, network or clock reads except where a `now` is passed in (scripts/soak/weekly-capture.ts
// does the I/O). The verdict rule and the week rule are the plan's D-T7-2, D-T7-3 and D-T7-5.
import { PRODUCT_BY_CASE } from "../../dashboard/soak/read-trends.ts";
import { postWarmup, soakSlope, type SoakPoint } from "./slope.ts";

export const SUMMARY_SCHEMA = 1 as const;
export const PRODUCTS = ["cal", "medusa", "documenso"] as const;
export type Product = (typeof PRODUCTS)[number];
/** The inverse of PRODUCT_BY_CASE: product to case id. Derived, never typed twice. */
export const CASE_BY_PRODUCT = Object.fromEntries(
  Object.entries(PRODUCT_BY_CASE).map(([caseId, product]) => [product, caseId]),
) as Record<Product, string>;
export const MAX_SUMMARY_BYTES = 64 * 1024;
export const WEEKLY_DURATION_SEC = 7200;
export const SOAK_WORKFLOW_ID = "397232763";
/** A week is due this many hours after its weekly slot (D-T7-14). */
export const WEEKLY_SETTLE_HOURS = 24;
const HOUR_MS = 3600e3;
const MIN_MS = 60e3;
const DAY_MS = 24 * HOUR_MS;
/** The weekly slot is Sunday 19:29 UTC (soak.yml, the second cron). A week runs from one slot to the next. */
const SLOT_HOUR = 19;
const SLOT_MINUTE = 29;
const VERDICTS = ["PASS", "FAIL (PRODUCT BUG)", "NO THRESHOLD YET"] as const;
/** The three fixed reasons a product can have no summary, plus the one for an unreadable artefact (D-T7-4). */
export const GAP_REASONS = [
  "not run: upstream job failed",
  "no artefact: job failed before upload",
  "artefact missing",
  "artefact unreadable",
] as const;
export type GapReason = (typeof GAP_REASONS)[number];

const FORBIDDEN_KEYS = new Set([
  "token",
  "secret",
  "password",
  "apikey",
  "api_key",
  "sessionid",
  "cookie",
  "authorization",
]);
const SHA = /^[0-9a-f]{40}$/;
const HARNESS = /^v\d+\.\d+\.\d+$/;
const K6 = /^\d+\.\d+\.\d+$/;
const ISO_WEEK = /^\d{4}-w\d{2}$/;
const RUN_URL = /^https:\/\/github\.com\/[^/]+\/[^/]+\/actions\/runs\/\d+$/;

/** The ISO week ("YYYY-wWW") of a UTC date: the week of its Thursday. */
function isoWeekOf(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayOfWeek = d.getUTCDay() || 7; // Monday 1 .. Sunday 7
  d.setUTCDate(d.getUTCDate() + 4 - dayOfWeek);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / DAY_MS + 1) / 7);
  return `${d.getUTCFullYear()}-w${String(week).padStart(2, "0")}`;
}

/**
 * The week of a weekly run: the ISO week of created_at minus 6 d 19 h 29 min (UTC), so a run created late in the
 * week still lands in its own week (D-T7-3). Throws on a bad date.
 */
export function weeklyIsoWeek(createdAtIso: string): { isoWeek: string; tag: string } {
  const created = Date.parse(createdAtIso);
  if (Number.isNaN(created)) throw new Error(`weekly: created_at is not a date: ${createdAtIso}`);
  const shifted = new Date(created - (6 * DAY_MS + 19 * HOUR_MS + 29 * MIN_MS));
  const isoWeek = isoWeekOf(shifted);
  return { isoWeek, tag: `p6-soak-${isoWeek}` };
}

/** The ISO week of the latest weekly slot whose time plus WEEKLY_SETTLE_HOURS is at or before now (D-T7-14). */
export function latestWeeklyWeek(now: Date): string {
  const today = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    SLOT_HOUR,
    SLOT_MINUTE,
  );
  let slot = today - now.getUTCDay() * DAY_MS; // the Sunday of this week, at the slot time
  while (slot + WEEKLY_SETTLE_HOURS * HOUR_MS > now.getTime()) slot -= 7 * DAY_MS;
  return weeklyIsoWeek(new Date(slot).toISOString()).isoWeek;
}

export interface WeeklyRunFacts {
  workflowId: string;
  headBranch: string;
  event: string;
  conclusion: string | null;
  createdAt: string;
  headSha: string;
  artefactNames: string[];
}

export type WeeklyDecision =
  | { weekly: true; isoWeek: string; tag: string; products: Product[] }
  | { weekly: false; refuse: boolean; reason: string };

/**
 * Weekly point rules (D-T7-2), in order; the first unmet rule decides. In "trigger" mode an unmet rule is NOT RUN
 * (weekly false, refuse false). In "dispatch" (owner backfill) mode an unmet rule is a refusal (refuse true).
 */
export function weeklyDecision(run: WeeklyRunFacts, mode: "trigger" | "dispatch"): WeeklyDecision {
  const refuse = mode === "dispatch";
  const notWeekly = (reason: string): WeeklyDecision => ({ weekly: false, refuse, reason });
  if (run.workflowId !== SOAK_WORKFLOW_ID) return notWeekly("run is not from the soak workflow");
  if (run.headBranch !== "main") return notWeekly(`run is on ${run.headBranch}, not main`);
  if (run.event !== "schedule") return notWeekly(`run event is ${run.event}, not a scheduled run`);
  if (run.conclusion !== "success" && run.conclusion !== "failure")
    return notWeekly(`run conclusion is ${run.conclusion}`);
  const products = PRODUCTS.filter((p) => run.artefactNames.includes(`soak-${p}-120`));
  if (products.length === 0) return notWeekly("no 120-minute soak artefact (failed before upload)");
  if (Number.isNaN(Date.parse(run.createdAt))) return notWeekly("created_at is not a date");
  const { isoWeek, tag } = weeklyIsoWeek(run.createdAt);
  return { weekly: true, isoWeek, tag, products };
}

/** A verdict that counts as a point (D-T7-5). null is never valid. INVALID and TEST BUG are gaps. */
export function isValidVerdict(verdict: string | null): boolean {
  return verdict !== null && (VERDICTS as readonly string[]).includes(verdict);
}

export interface MetricSummary {
  slopePerMin: number;
  theilSenPerMin: number;
  plateauRatio: number;
}

export interface WeeklyStatistics {
  rssMb: MetricSummary;
  fds: MetricSummary;
  dbConnections: MetricSummary;
}

export interface WeeklySummary {
  schemaVersion: 1;
  product: Product;
  isoWeek: string;
  tag: string;
  caseId: string;
  runId: string | null;
  githubRunId: string;
  runUrl: string;
  soakHeadSha: string;
  event: string;
  createdAt: string;
  durationSec: number | null;
  warmupSec: number | null;
  productSha: string | null;
  harnessTag: string | null;
  k6Version: string | null;
  valid: boolean;
  invalidReason: string | null;
  verdict: string | null;
  reasons: string[];
  statistics: WeeklyStatistics | null;
  healthProbeMs: { p95: number; slopePerMin: number; samples: number } | null;
}

export interface SummaryIdentity {
  product: Product;
  githubRunId: string;
  runUrl: string;
  soakHeadSha: string;
  createdAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** The metric block of one statistic, or null when a number is missing or not finite. */
function metricOf(block: unknown): MetricSummary | null {
  if (!isRecord(block) || !isRecord(block.slope) || !isRecord(block.plateau)) return null;
  const { slopePerMin, theilSenPerMin } = block.slope;
  const plateauRatio = block.plateau.ratio;
  if (!finite(slopePerMin) || !finite(theilSenPerMin) || !finite(plateauRatio)) return null;
  return { slopePerMin, theilSenPerMin, plateauRatio };
}

/** The three statistics the view reads (RSS, fds, DB connections) from soak.json, or null when one is not finite. */
function statisticsOf(statistics: unknown): WeeklyStatistics | null {
  if (!isRecord(statistics)) return null;
  const rssMb = metricOf(statistics.rssMb);
  const fds = metricOf(statistics.fds);
  const dbConnections = metricOf(statistics.dbConnections);
  return rssMb && fds && dbConnections ? { rssMb, fds, dbConnections } : null;
}

/** Nearest-rank p95 of the health-probe latency after warm-up, with its slope; null when there are no samples. */
function healthProbeOf(telemetry: unknown, warmupSec: number): WeeklySummary["healthProbeMs"] {
  if (!isRecord(telemetry) || !finite(telemetry.startedAtMs) || !Array.isArray(telemetry.samples))
    return null;
  const points: SoakPoint[] = [];
  for (const s of telemetry.samples) {
    const probe = isRecord(s) && isRecord(s.probe) ? s.probe.ms : undefined;
    if (finite(probe) && finite(s.t)) points.push({ tMs: s.t, value: probe });
  }
  const after = postWarmup(points, telemetry.startedAtMs, warmupSec);
  const slope = soakSlope(points, telemetry.startedAtMs, warmupSec).slopePerMin;
  if (after.length === 0 || slope === null) return null;
  const sorted = after.map((p) => p.value).sort((a, b) => a - b);
  const rank = Math.ceil(0.95 * sorted.length);
  return { p95: sorted[rank - 1] ?? 0, slopePerMin: slope, samples: after.length };
}

function recordOf(value: unknown, name: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${name} is not an object`);
  return value;
}

/**
 * One product's summary from its soak.json, run-meta.json and telemetry (null when absent). A run that cannot be a
 * point gets valid false and the first reason that applies; the rules are checked in the order below.
 */
export function buildSummary(
  input: SummaryIdentity & { soakJson: unknown; runMeta: unknown; telemetry: unknown | null },
): WeeklySummary {
  const soak = recordOf(input.soakJson, "soak.json");
  const meta = recordOf(input.runMeta, "run-meta.json");
  const env = recordOf(meta.environment, "run-meta environment");
  const software = recordOf(meta.software, "run-meta software");
  const shas = recordOf(software.products, "run-meta software.products");
  const { isoWeek, tag } = weeklyIsoWeek(input.createdAt);
  const verdict = typeof soak.verdict === "string" ? soak.verdict : null;
  const reasons = Array.isArray(soak.reasons) ? soak.reasons.map(String) : [];
  const warmupSec =
    isRecord(soak.statistics) && finite(soak.statistics.warmupSec)
      ? soak.statistics.warmupSec
      : null;
  const statistics = statisticsOf(soak.statistics);
  const productSha =
    typeof shas[input.product] === "string" ? (shas[input.product] as string) : null;
  const harnessTag = typeof software.harness === "string" ? software.harness : "";
  const k6Version = typeof software.k6 === "string" ? software.k6 : "";

  let invalidReason: string | null = null;
  if (!isValidVerdict(verdict))
    invalidReason = reasons.length > 0 ? reasons.join("; ") : `verdict ${verdict ?? "missing"}`;
  else if (meta.durationSec !== WEEKLY_DURATION_SEC)
    invalidReason = `run duration is ${String(meta.durationSec)} s, not ${WEEKLY_DURATION_SEC} s`;
  else if (env.event !== "schedule")
    invalidReason = `run event is ${String(env.event)}, not schedule`;
  else if (productSha === null || !SHA.test(productSha)) invalidReason = "product SHA not recorded";
  else if (!HARNESS.test(harnessTag) || !K6.test(k6Version))
    invalidReason = "harness tag or k6 version not recorded";
  else if (statistics === null) invalidReason = "statistics incomplete";

  const valid = invalidReason === null;
  return {
    schemaVersion: SUMMARY_SCHEMA,
    product: input.product,
    isoWeek,
    tag,
    caseId: CASE_BY_PRODUCT[input.product],
    runId: typeof meta.runId === "string" ? meta.runId : null,
    githubRunId: input.githubRunId,
    runUrl: input.runUrl,
    soakHeadSha: input.soakHeadSha,
    event: String(env.event),
    createdAt: input.createdAt,
    durationSec: finite(meta.durationSec) ? meta.durationSec : null,
    warmupSec,
    productSha: valid ? productSha : null,
    harnessTag: valid ? harnessTag : null,
    k6Version: valid ? k6Version : null,
    valid,
    invalidReason,
    verdict,
    reasons,
    statistics: valid ? statistics : null,
    healthProbeMs: valid && warmupSec !== null ? healthProbeOf(input.telemetry, warmupSec) : null,
  };
}

/** The gap summary for a product with no artefact (D-T7-4). valid is false; the reason is one of GAP_REASONS. */
export function missingSummary(input: SummaryIdentity & { reason: GapReason }): WeeklySummary {
  const { isoWeek, tag } = weeklyIsoWeek(input.createdAt);
  return {
    schemaVersion: SUMMARY_SCHEMA,
    product: input.product,
    isoWeek,
    tag,
    caseId: CASE_BY_PRODUCT[input.product],
    runId: null,
    githubRunId: input.githubRunId,
    runUrl: input.runUrl,
    soakHeadSha: input.soakHeadSha,
    event: "schedule",
    createdAt: input.createdAt,
    durationSec: null,
    warmupSec: null,
    productSha: null,
    harnessTag: null,
    k6Version: null,
    valid: false,
    invalidReason: input.reason,
    verdict: null,
    reasons: [],
    statistics: null,
    healthProbeMs: null,
  };
}

function check(field: string, ok: boolean, why: string): void {
  if (!ok) throw new Error(`summary: ${field} ${why}`);
}

function checkMetric(name: string, value: unknown): void {
  check(name, isRecord(value), "is not an object");
  const m = value as Record<string, unknown>;
  check(`${name}.slopePerMin`, finite(m.slopePerMin), "is not a finite number");
  check(`${name}.theilSenPerMin`, finite(m.theilSenPerMin), "is not a finite number");
  check(`${name}.plateauRatio`, finite(m.plateauRatio), "is not a finite number");
}

/**
 * Validates a parsed JSON value against schema v1 (section 6.4 of the plan). Throws an Error whose message names the first
 * bad field. Any other schemaVersion is refused as unknown: never parsed loosely.
 */
export function parseSummary(value: unknown): WeeklySummary {
  if (!isRecord(value)) throw new Error("summary: not an object");
  if (value.schemaVersion !== SUMMARY_SCHEMA)
    throw new Error(`unknown schemaVersion ${JSON.stringify(value.schemaVersion)}`);
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) node.forEach(walk);
    else if (isRecord(node))
      for (const [key, child] of Object.entries(node)) {
        if (FORBIDDEN_KEYS.has(key.toLowerCase())) throw new Error(`summary: forbidden key ${key}`);
        walk(child);
      }
  };
  walk(value);
  const v = value;
  const product = v.product;
  check(
    "product",
    typeof product === "string" && (PRODUCTS as readonly string[]).includes(product),
    "is not a known product",
  );
  check("caseId", v.caseId === CASE_BY_PRODUCT[product as Product], "does not match the product");
  check("isoWeek", typeof v.isoWeek === "string" && ISO_WEEK.test(v.isoWeek), "is not an ISO week");
  check("tag", v.tag === `p6-soak-${String(v.isoWeek)}`, "does not equal p6-soak- plus isoWeek");
  if (typeof v.createdAt === "string" && !Number.isNaN(Date.parse(v.createdAt)))
    check(
      "isoWeek",
      weeklyIsoWeek(v.createdAt).isoWeek === v.isoWeek,
      "is not the week of createdAt",
    );
  check(
    "githubRunId",
    typeof v.githubRunId === "string" && /^\d+$/.test(v.githubRunId),
    "is not a run id",
  );
  check("runUrl", typeof v.runUrl === "string" && RUN_URL.test(v.runUrl), "is not a run URL");
  check(
    "soakHeadSha",
    typeof v.soakHeadSha === "string" && SHA.test(v.soakHeadSha),
    "is not a 40-character sha",
  );
  check(
    "createdAt",
    typeof v.createdAt === "string" &&
      v.createdAt.endsWith("Z") &&
      !Number.isNaN(Date.parse(v.createdAt)),
    "is not a UTC date",
  );
  check("valid", typeof v.valid === "boolean", "is not a boolean");
  if (v.valid) check("invalidReason", v.invalidReason === null, "must be null when valid");
  else
    check(
      "invalidReason",
      typeof v.invalidReason === "string" && v.invalidReason.length > 0,
      "must name the reason when not valid",
    );
  check("verdict", v.verdict === null || typeof v.verdict === "string", "is not a string or null");
  check(
    "reasons",
    Array.isArray(v.reasons) && v.reasons.every((r) => typeof r === "string"),
    "is not an array of strings",
  );
  if (v.valid) {
    check("verdict", isValidVerdict(v.verdict as string | null), "is not a valid verdict");
    check("event", v.event === "schedule", "is not schedule");
    check("durationSec", v.durationSec === WEEKLY_DURATION_SEC, "is not 7200");
    check(
      "productSha",
      typeof v.productSha === "string" && SHA.test(v.productSha),
      "is not a 40-character sha",
    );
    check(
      "harnessTag",
      typeof v.harnessTag === "string" && HARNESS.test(v.harnessTag),
      "is not a harness tag",
    );
    check(
      "k6Version",
      typeof v.k6Version === "string" && K6.test(v.k6Version),
      "is not a k6 version",
    );
    check("statistics", isRecord(v.statistics), "is missing");
  }
  if (v.statistics !== null) {
    const s = recordOf(v.statistics, "summary: statistics");
    checkMetric("rssMb", s.rssMb);
    checkMetric("fds", s.fds);
    checkMetric("dbConnections", s.dbConnections);
  }
  if (v.healthProbeMs !== null) {
    const h = recordOf(v.healthProbeMs, "summary: healthProbeMs");
    check("healthProbeMs.p95", finite(h.p95), "is not a finite number");
    check("healthProbeMs.slopePerMin", finite(h.slopePerMin), "is not a finite number");
    check(
      "healthProbeMs.samples",
      Number.isInteger(h.samples) && (h.samples as number) >= 0,
      "is not a count",
    );
  }
  return v as unknown as WeeklySummary;
}

/** Throws "summary over 65536 bytes" above MAX_SUMMARY_BYTES (EXTRA case X-4). */
export function assertSummarySize(bytes: number): void {
  if (bytes > MAX_SUMMARY_BYTES) throw new Error(`summary over ${MAX_SUMMARY_BYTES} bytes`);
}
