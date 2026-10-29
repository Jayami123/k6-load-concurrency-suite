// The weekly soak trend (plan section 6.7): release entries in, one series per product out. Pure: no file, clock or network
// reads. Every week is either a VALID point (with its soak verdict), or a gap with its reason. Nothing here is a PASS or a
// FAIL: the trend measures and the verdict is printed beside each point.
import {
  isoWeekOf,
  PRODUCTS,
  parseSummary,
  type Product,
  type WeeklySummary,
} from "../../load/soak/weekly-summary.ts";

export const REQUIRED_VALID_WEEKS = 3;
export const GAP_NO_RELEASE =
  "no weekly release (soak failed before upload, cancelled, or not captured)";
const TAG_PREFIX = "p6-soak-";
const SUMMARY_FILE = /^soak-summary-(.+)\.json$/;
const DAY_MS = 24 * 3600e3;
/** A Monday, 1969-12-29: the origin of the week index. */
const EPOCH_MONDAY_MS = Date.UTC(1969, 11, 29);

/** One release as the caller read it. files holds only the summary assets; text is null when the file could not be read. */
export interface ReleaseEntry {
  tag: string; // "p6-soak-2026-w44"
  draft: boolean; // a draft is never a completed week
  assets: string[]; // every asset name on the release
  sums: string[] | null; // the names listed in SHA256SUMS.txt; null when that file is absent
  files: Array<{ name: string; text: string | null }>;
}

export interface TrendGap {
  isoWeek: string;
  tag: string | null;
  product: Product;
  reason: string;
  runUrl: string | null;
}

export interface TrendPoint {
  tag: string;
  isoWeek: string;
  runUrl: string;
  verdict: string; // shown beside the point: a trend is never read as a pass
  productSha: string;
  harnessTag: string;
  k6Version: string;
  rssSlope: number;
  rssPlateau: number;
  fdsSlope: number;
  fdsPlateau: number;
  connSlope: number;
  connPlateau: number;
  probeP95: number | null;
  probeSlope: number | null;
  marker: string | null; // "product SHA changed; harness tag changed; k6 version changed" (D-T7-10)
}

export interface ProductTrend {
  product: Product;
  validCount: number;
  status: string; // "collecting (n/3 weeks)" or "trend"
  points: TrendPoint[]; // VALID only, sorted by isoWeek
  gaps: TrendGap[]; // every other week, with its reason
}

/** "collecting (n/3 weeks)" below REQUIRED_VALID_WEEKS VALID points, "trend" at or above it. */
export function statusFor(validCount: number): string {
  return validCount < REQUIRED_VALID_WEEKS
    ? `collecting (${validCount}/${REQUIRED_VALID_WEEKS} weeks)`
    : "trend";
}

/** The number of weeks from the origin Monday to the Monday of an ISO week, so the gap-fill steps one week at a time. */
export function isoWeekIndex(isoWeek: string): number {
  const m = /^(\d{4})-w(\d{2})$/.exec(isoWeek);
  if (!m) throw new Error(`not an ISO week: ${isoWeek}`);
  const year = Number(m[1]);
  const jan4 = Date.UTC(year, 0, 4);
  const jan4Dow = new Date(jan4).getUTCDay() || 7;
  const week1Monday = jan4 - (jan4Dow - 1) * DAY_MS;
  const monday = week1Monday + (Number(m[2]) - 1) * 7 * DAY_MS;
  return Math.round((monday - EPOCH_MONDAY_MS) / (7 * DAY_MS));
}

function weekOfIndex(index: number): string {
  return isoWeekOf(new Date(EPOCH_MONDAY_MS + index * 7 * DAY_MS));
}

/** One summary file read from a complete release: a parsed summary whose tag and product match its release and file. */
interface Parsed {
  product: Product;
  isoWeek: string;
  summary: WeeklySummary;
  tag: string;
}

function isoWeekOfTag(tag: string): string {
  return tag.slice(TAG_PREFIX.length);
}

function pointOf(summary: WeeklySummary, tag: string): TrendPoint {
  const s = summary.statistics;
  if (s === null) throw new Error("TEST BUG: a valid summary has no statistics");
  return {
    tag,
    isoWeek: summary.isoWeek,
    runUrl: summary.runUrl,
    verdict: summary.verdict ?? "",
    productSha: summary.productSha ?? "",
    harnessTag: summary.harnessTag ?? "",
    k6Version: summary.k6Version ?? "",
    rssSlope: s.rssMb.slopePerMin,
    rssPlateau: s.rssMb.plateauRatio,
    fdsSlope: s.fds.slopePerMin,
    fdsPlateau: s.fds.plateauRatio,
    connSlope: s.dbConnections.slopePerMin,
    connPlateau: s.dbConnections.plateauRatio,
    probeP95: summary.healthProbeMs?.p95 ?? null,
    probeSlope: summary.healthProbeMs?.slopePerMin ?? null,
    marker: null,
  };
}

/** The changes between two VALID points of one product, or null when nothing changed (D-T7-10). */
function markerFor(prev: WeeklySummary, next: WeeklySummary): string | null {
  const changes: string[] = [];
  if (prev.productSha !== next.productSha) changes.push("product SHA changed");
  if (prev.harnessTag !== next.harnessTag) changes.push("harness tag changed");
  if (prev.k6Version !== next.k6Version) changes.push("k6 version changed");
  return changes.length > 0 ? changes.join("; ") : null;
}

function gap(
  isoWeek: string,
  tag: string | null,
  product: Product,
  reason: string,
  runUrl: string | null = null,
): TrendGap {
  return { isoWeek, tag, product, reason, runUrl };
}

/** Reads the summary files of one complete release. Each unreadable or mismatched file is a gap; the rest are parsed. */
function readRelease(
  entry: ReleaseEntry,
  isoWeek: string,
  gaps: TrendGap[],
  parsed: Parsed[],
): void {
  if (entry.draft || entry.sums === null || entry.sums.some((n) => !entry.assets.includes(n))) {
    for (const product of PRODUCTS)
      gaps.push(gap(isoWeek, entry.tag, product, "incomplete release"));
    return;
  }
  const seen = new Set<Product>();
  for (const file of entry.files) {
    const m = SUMMARY_FILE.exec(file.name);
    const product = m?.[1];
    if (!product || !(PRODUCTS as readonly string[]).includes(product)) continue;
    const p = product as Product;
    seen.add(p);
    if (file.text === null) {
      gaps.push(gap(isoWeek, entry.tag, p, "not readable"));
      continue;
    }
    let summary: WeeklySummary;
    try {
      summary = parseSummary(JSON.parse(file.text));
    } catch (error) {
      const reason = error instanceof SyntaxError ? "not valid JSON" : (error as Error).message;
      gaps.push(gap(isoWeek, entry.tag, p, reason));
      continue;
    }
    if (summary.tag !== entry.tag) {
      gaps.push(gap(isoWeek, entry.tag, p, "summary does not match its release tag"));
      continue;
    }
    if (summary.product !== p) {
      gaps.push(gap(isoWeek, entry.tag, p, "summary product does not match its file name"));
      continue;
    }
    if (!summary.valid) {
      gaps.push(gap(isoWeek, entry.tag, p, summary.invalidReason ?? "invalid", summary.runUrl));
      parsed.push({ product: p, isoWeek, summary, tag: entry.tag });
      continue;
    }
    parsed.push({ product: p, isoWeek, summary, tag: entry.tag });
  }
  for (const product of PRODUCTS) {
    if (!seen.has(product)) gaps.push(gap(isoWeek, entry.tag, product, "artefact missing"));
  }
}

/**
 * Builds the per-product trend. expectedThrough is the last week that must have a release (latestWeeklyWeek); null fills
 * nothing. The rules are the plan's 6.7 rules 1 to 9, in that order.
 */
export function buildWeeklyTrend(
  entries: ReleaseEntry[],
  expectedThrough: string | null,
): ProductTrend[] {
  const gaps: TrendGap[] = [];
  const parsed: Parsed[] = [];
  const weeks = new Set<string>();
  let first: string | null = null;
  for (const entry of entries) {
    if (!entry.tag.startsWith(TAG_PREFIX)) continue;
    const isoWeek = isoWeekOfTag(entry.tag);
    weeks.add(isoWeek);
    if (first === null || isoWeek < first) first = isoWeek;
    readRelease(entry, isoWeek, gaps, parsed);
  }

  // Rule 5: two or more summaries for one (product, week) are all gaps. The reader never picks one.
  const key = (p: Parsed) => `${p.product} ${p.isoWeek}`;
  const counts = new Map<string, number>();
  for (const p of parsed) counts.set(key(p), (counts.get(key(p)) ?? 0) + 1);
  const duplicate = new Set([...counts].filter(([, n]) => n > 1).map(([k]) => k));
  const kept: Parsed[] = [];
  for (const p of parsed) {
    if (duplicate.has(key(p)))
      gaps.push(gap(p.isoWeek, p.tag, p.product, "duplicate week", p.summary.runUrl));
    else kept.push(p);
  }

  // Rules 6 and 4: valid summaries are points; an invalid one was already made a gap above.
  const points = new Map<Product, TrendPoint[]>(PRODUCTS.map((p) => [p, []]));
  const byProduct = new Map<Product, Parsed[]>(PRODUCTS.map((p) => [p, []]));
  for (const p of kept) byProduct.get(p.product)?.push(p);
  for (const product of PRODUCTS) {
    const valid = (byProduct.get(product) ?? [])
      .filter((p) => p.summary.valid)
      .sort((a, b) => (a.isoWeek < b.isoWeek ? -1 : a.isoWeek > b.isoWeek ? 1 : 0));
    let prev: WeeklySummary | null = null;
    for (const p of valid) {
      const point = pointOf(p.summary, p.tag);
      point.marker = prev === null ? null : markerFor(prev, p.summary);
      points.get(product)?.push(point);
      prev = p.summary;
    }
  }

  // Rule 8: a week with no release is a gap for every product, from the first release up to expectedThrough.
  if (expectedThrough !== null && first !== null) {
    for (let i = isoWeekIndex(first); i <= isoWeekIndex(expectedThrough); i++) {
      const week = weekOfIndex(i);
      if (weeks.has(week)) continue;
      for (const product of PRODUCTS) gaps.push(gap(week, null, product, GAP_NO_RELEASE));
    }
  }

  return PRODUCTS.map((product) => {
    const own = points.get(product) ?? [];
    return {
      product,
      validCount: own.length,
      status: statusFor(own.length),
      points: own,
      gaps: gaps
        .filter((g) => g.product === product)
        .sort((a, b) =>
          a.isoWeek < b.isoWeek ? -1 : a.isoWeek > b.isoWeek ? 1 : a.reason < b.reason ? -1 : 1,
        ),
    };
  });
}
