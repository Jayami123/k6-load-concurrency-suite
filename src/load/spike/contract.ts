// The spike contract per product (Phase 4 Task 6 §6.3). Pure: the windows, the response counts and the dropped iterations come from the
// stage. A violated check is PRODUCT BUG (SUSPECTED), never a final label; dropped iterations or too few refusals are INVALID.
import { isStorm, recoverySeconds, referenceUpper, type Window } from "../recovery.ts";

export type SpikeProduct = "cal" | "medusa" | "documenso";

/** Counts of one run, from the k6 counters p6_resp_* (observeSpikeResponses) and the dropped iterations. */
export interface SpikeCounts {
  ok: number;
  refusedWithBody: number;
  refusedNoBody: number;
  limited: number; // 429, with or without a body
  limitedNoBody: number;
  serverError: number;
  transport: number;
  droppedIterations: number;
  /** 429 answers per route family, e.g. { "/api/trpc": 12 }. Only Documenso has them. */
  limitedByRoute?: Record<string, number>;
}

export interface SpikeInput {
  product: SpikeProduct;
  windows: Window[];
  preSpike: Window[];
  spikeEndMs: number;
  band?: { max: number };
  counts: SpikeCounts;
}

export type SpikeCheck = { name: string; ok: boolean; detail: string };

export interface SpikeResult {
  label: "characterisation" | "limiter contract";
  recoverySec?: number; // undefined: "not reached in the watch period" (with a reference) or no reference (see recoveryReason)
  recoveryReason?: "no_reference"; // no pre-spike window had a p95, so there is nothing to recover to
  checks: SpikeCheck[];
  verdict: "PASS" | "PRODUCT BUG (SUSPECTED)" | "INVALID";
  invalidReason?: "dropped_iterations" | "no_refusals" | "no_reference";
}

/** The Documenso limiter must answer at least this many 429s during the spike, else the spike did not exceed it. */
export const MIN_LIMITED = 10;

/** tRPC is the only route the limiter covers in the probe (v2 calls never exceed the limit in a minute). */
const COVERED_ROUTES = ["/api/trpc"];

export function evaluateSpike(input: SpikeInput): SpikeResult {
  const { product, windows, preSpike, spikeEndMs, band, counts } = input;
  const label = product === "documenso" ? "limiter contract" : "characterisation";
  const checks: SpikeCheck[] = [];

  const storms = windows.filter(isStorm);
  checks.push({
    name: "no 5xx storm",
    ok: storms.length === 0,
    detail: storms.length === 0 ? "no window" : `${storms.length} window(s) at ${storms[0]?.index}`,
  });

  const transportStorms = windows.filter(
    (w) =>
      w.status?.transport !== undefined &&
      w.status.transport >= 5 &&
      w.requests > 0 &&
      w.status.transport / w.requests > 0.01,
  );
  checks.push({
    name: "no transport-error storm",
    ok: transportStorms.length === 0,
    detail: transportStorms.length === 0 ? "no window" : `${transportStorms.length} window(s)`,
  });

  if (product === "documenso") {
    checks.push({
      name: "every 429 has a body",
      ok: counts.limitedNoBody === 0,
      detail: `${counts.limitedNoBody} 429 without a body`,
    });
    checks.push({
      name: "no refusal without a body",
      ok: counts.refusedNoBody === 0,
      detail: `${counts.refusedNoBody} refusal(s) without a body`,
    });
    const other = Object.entries(counts.limitedByRoute ?? {}).filter(
      ([route]) => !COVERED_ROUTES.some((c) => route.startsWith(c)),
    );
    checks.push({
      name: "429 only on covered routes",
      ok: other.length === 0,
      detail: other.length === 0 ? "tRPC only" : other.map(([r, n]) => `${r}: ${n}`).join(", "),
    });
  }

  let recoverySec: number | undefined;
  let recoveryReason: "no_reference" | undefined;
  try {
    const upper = referenceUpper(preSpike, band);
    recoverySec = recoverySeconds(windows, spikeEndMs, upper);
  } catch {
    recoveryReason = "no_reference";
  }

  const result: SpikeResult = {
    label,
    recoverySec,
    ...(recoveryReason ? { recoveryReason } : {}),
    checks,
    verdict: checks.every((c) => c.ok) ? "PASS" : "PRODUCT BUG (SUSPECTED)",
  };
  if (counts.droppedIterations > 0) {
    result.verdict = "INVALID";
    result.invalidReason = "dropped_iterations";
  } else if (product === "documenso" && counts.limited < MIN_LIMITED) {
    result.verdict = "INVALID";
    result.invalidReason = "no_refusals";
  } else if (recoveryReason === "no_reference") {
    // Recovery cannot be judged without a reference: the run never passes on it (owner decision, PR #84).
    result.verdict = "INVALID";
    result.invalidReason = "no_reference";
  }
  return result;
}
