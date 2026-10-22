// Race histograms are written by src/races/histogram.ts (writeHistogram). Only ids, counts and fixed phrases
// from this file reach the job summary: never bodySummary, request bodies or invariant message text.

export interface RaceSummaryRow {
  readonly caseId: string;
  readonly trials: string;
  readonly verdict: string;
  readonly keyCounts: string;
  readonly perTrialTime: string;
  readonly invalidReruns: string;
  readonly outcome: string;
}

type Json = Record<string, unknown>;
const NA = "n/a";

// Exact ids. Never match by prefix ("extra-same-attendee" starts with "extra-s").
const MEDUSA_OVERSELL_CASES = new Set([
  "P6-MED-RACE-001",
  "extra-mixed-qty",
  "extra-s0-n5",
  "extra-s1-n2",
  "extra-same-cart",
]);
const CAL_IDENTICAL_SLOT_CASES = new Set([
  "P6-CAL-RACE-001",
  "extra-loser-contract",
  "extra-same-attendee",
  "extra-time-spellings",
]);
const CAL_OVERLAP_CASES = new Set(["P6-CAL-RACE-003", "extra-overlap-sequential"]);
const DOC_SEAL_CASES = new Set([
  "P6-DOC-RACE-001",
  "P6-DOC-RACE-002",
  "extra-doc-sequential-control",
]);

function isJson(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

const sum = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0);

// Histograms written before rerun-on-spread have no `valid` field: every record is a valid trial.
const isValidTrial = (trial: unknown): boolean => !(isJson(trial) && trial.valid === false);

// One value per trial, or undefined if any trial lacks it (the row then shows n/a).
export function trialNumbers(trials: readonly unknown[], key: string): number[] | undefined {
  const out: number[] = [];
  for (const trial of trials) {
    const value =
      isJson(trial) && isJson(trial.oracle) ? finiteNumber(trial.oracle[key]) : undefined;
    if (value === undefined) return undefined;
    out.push(value);
  }
  return out;
}

// README definition: (finishedAt - startedAt) / trials, in seconds, to 2 decimals. Undefined means n/a.
export function perTrialTime(h: {
  startedAt?: unknown;
  finishedAt?: unknown;
  trials?: unknown;
}): string {
  if (typeof h.startedAt !== "string" || typeof h.finishedAt !== "string") return NA;
  const start = Date.parse(h.startedAt);
  const end = Date.parse(h.finishedAt);
  const trials = finiteNumber(h.trials);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return NA;
  if (trials === undefined || trials <= 0) return NA;
  return `${((end - start) / 1000 / trials).toFixed(2)} s`;
}

function acceptedPerTrial(accepted: readonly number[]): string {
  const lo = Math.min(...accepted);
  const hi = Math.max(...accepted);
  return lo === hi ? String(lo) : `${lo}-${hi}`;
}

interface ParsedRace {
  readonly caseId: string;
  readonly trialsRequested?: number;
  readonly verdict?: string;
  readonly startedAt?: unknown;
  readonly finishedAt?: unknown;
  // Every attempt. Histograms written before rerun-on-spread call this list perTrial.
  readonly attempts: readonly unknown[];
  readonly oracle: Json;
  readonly invalidTrials?: number;
  readonly reruns?: number;
  readonly invariantViolations?: readonly unknown[];
}

export function parseRaceFile(raw: unknown, file: string): ParsedRace {
  if (!isJson(raw)) throw new Error(`${file}: race histogram root must be an object`);
  if (typeof raw.caseId !== "string" || raw.caseId === "") {
    throw new Error(`${file}: caseId must be a non-empty string`);
  }
  if (raw.perTrial !== undefined && !Array.isArray(raw.perTrial)) {
    throw new Error(`${file}: perTrial must be an array when present`);
  }
  if (raw.attempts !== undefined && !Array.isArray(raw.attempts)) {
    throw new Error(`${file}: attempts must be an array when present`);
  }
  if (raw.oracle !== undefined && !isJson(raw.oracle)) {
    throw new Error(`${file}: oracle must be an object when present`);
  }
  return {
    caseId: raw.caseId,
    // Old histograms: `trials` is the number. New ones: `trialsRequested` is the number, `trials` is a list.
    trialsRequested: finiteNumber(raw.trialsRequested) ?? finiteNumber(raw.trials),
    verdict: typeof raw.verdict === "string" ? raw.verdict : undefined,
    startedAt: raw.startedAt,
    finishedAt: raw.finishedAt,
    attempts: Array.isArray(raw.attempts)
      ? raw.attempts
      : Array.isArray(raw.perTrial)
        ? raw.perTrial
        : [],
    oracle: isJson(raw.oracle) ? raw.oracle : {},
    invalidTrials: finiteNumber(raw.invalidTrials),
    reruns: finiteNumber(raw.reruns),
    invariantViolations: Array.isArray(raw.invariantViolations)
      ? raw.invariantViolations
      : undefined,
  };
}

// Rates (accepted per trial, loser counts) use valid attempts only; bug counts use every attempt (D3, D4).
// The unit in the sentence is "trials" for a clean run and "attempts" when invalid bursts were fired.
function outcomeFor(caseId: string, h: ParsedRace): { keyCounts: string; outcome: string } {
  const valid = h.attempts.filter(isValidTrial);
  const total = h.trialsRequested ?? valid.length;
  const unit =
    h.attempts.length === valid.length ? `${total} trials` : `${h.attempts.length} attempts`;
  if (MEDUSA_OVERSELL_CASES.has(caseId)) {
    const accepted = trialNumbers(valid, "httpWinnerCount");
    const available = trialNumbers(h.attempts, "available");
    if (!accepted || !available) return { keyCounts: NA, outcome: NA };
    const oversold = available.filter((a) => a < 0).length;
    return {
      keyCounts: `accepted per trial ${acceptedPerTrial(accepted)}; oversold trials ${oversold}`,
      outcome:
        oversold > 0
          ? `Oversold in ${oversold} of ${unit} (not a tracked bug yet)`
          : `No oversell in ${unit}`,
    };
  }
  if (CAL_IDENTICAL_SLOT_CASES.has(caseId)) {
    const accepted = trialNumbers(h.attempts, "acceptedCount");
    const redacted = trialNumbers(valid, "loser_db-unique-redacted");
    const unexpected = trialNumbers(valid, "loser_unexpected");
    if (!accepted || !redacted || !unexpected) return { keyCounts: NA, outcome: NA };
    const doubleAccepted = accepted.filter((n) => n > 1).length;
    const losers400 = sum(redacted) + sum(unexpected);
    const first =
      doubleAccepted > 0
        ? `Double-accepted in ${doubleAccepted} of ${unit}`
        : `One ACCEPTED per slot in ${unit}`;
    const second =
      losers400 > 0
        ? `Reproduces P6-OBS-CAL-001: ${losers400} losers got 400 not 409`
        : "Did not reproduce P6-OBS-CAL-001: losers got 409";
    return {
      keyCounts: `double-accepted trials ${doubleAccepted}; non-409 losers ${losers400}`,
      outcome: `${first}; ${second}`,
    };
  }
  if (CAL_OVERLAP_CASES.has(caseId)) {
    const doubleBooked = finiteNumber(h.oracle.trialsDoubleBooked);
    const clean = finiteNumber(h.oracle.trialsClean);
    if (doubleBooked === undefined || clean === undefined) return { keyCounts: NA, outcome: NA };
    return {
      keyCounts: `double-booked trials ${doubleBooked}; clean ${clean}`,
      outcome:
        doubleBooked > 0
          ? `Reproduces P6-OBS-CAL-002: overlapping bookings both accepted in ${doubleBooked} of ${unit}`
          : `Did not reproduce: no overlapping pair accepted together in ${unit}`,
    };
  }
  if (DOC_SEAL_CASES.has(caseId)) {
    const doubleSealed = finiteNumber(h.oracle.trialsDoubleSeal);
    if (doubleSealed === undefined) return { keyCounts: NA, outcome: NA };
    const violations = h.invariantViolations?.length;
    return {
      keyCounts: `double-sealed trials ${doubleSealed}; invariant violations ${violations ?? NA}`,
      outcome:
        doubleSealed > 0
          ? `Reproduces P6-OBS-DOC-002: sealed twice in ${doubleSealed} of ${unit}`
          : `Did not reproduce: sealed once in ${unit}`,
    };
  }
  // Self-tests and unknown ids: verdict only.
  return {
    keyCounts: NA,
    outcome:
      h.verdict === "pass" ? "Passed" : h.verdict === "fail" ? "Failed: see the job log" : NA,
  };
}

export function raceSummaryRow(file: string, raw: unknown): RaceSummaryRow {
  const h = parseRaceFile(raw, file);
  const { keyCounts, outcome } = outcomeFor(h.caseId, h);
  return {
    caseId: h.caseId,
    trials: h.trialsRequested === undefined ? NA : String(h.trialsRequested),
    verdict: h.verdict ?? NA,
    keyCounts,
    perTrialTime: perTrialTime({ ...h, trials: h.trialsRequested }),
    invalidReruns:
      h.invalidTrials === undefined || h.reruns === undefined
        ? NA
        : `${h.invalidTrials} / ${h.reruns}`,
    outcome,
  };
}

function cell(value: string): string {
  return value.replaceAll("|", "\\|");
}

export function formatRaceTable(rows: readonly RaceSummaryRow[]): string {
  if (rows.length === 0) {
    return "## Race results\n\nNo race histograms were written by this job.\n";
  }
  const header = [
    "## Race results",
    "",
    "| Case | Trials | Verdict | Key counts | Per-trial time | Invalid / reruns | Outcome |",
    "| --- | ---: | --- | --- | ---: | ---: | --- |",
  ];
  const body = rows.map(
    (r) =>
      `| ${[r.caseId, r.trials, r.verdict, r.keyCounts, r.perTrialTime, r.invalidReruns, r.outcome].map(cell).join(" | ")} |`,
  );
  return [...header, ...body, ""].join("\n");
}
