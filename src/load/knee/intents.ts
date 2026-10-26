// Per-intent reconciliation (plan task 1 §6.8). Pure: the log text and the rows are passed in, nothing is read here.

export type IntentOutcome = "ok" | "fail";

export interface IntentLog {
  outcomes: Map<number, { outcome: IntentOutcome; net: boolean; ghost: boolean }>;
  duplicateLines: number[]; // an intent that has two lines: TEST BUG
  beyondStarted: number[]; // an intent >= started: TEST BUG
  /** Intents with a {"intent":n,"limited":true} line (a spike iteration that saw a 429; Task 6 §6.5). */
  limited?: Set<number>;
  limitedLines?: number; // every limited line, for the check against the k6 counter p6_iter_limited
}

/** The k6 console line: `time="…" level=info msg="{\"intent\":3,\"outcome\":\"ok\"}" source=console`. Every other line is ignored. */
const MSG = /msg="((?:[^"\\]|\\.)*)"/;

export function parseIntentLog(logText: string, started: number): IntentLog {
  const outcomes: IntentLog["outcomes"] = new Map();
  const duplicateLines: number[] = [];
  const beyondStarted: number[] = [];
  const limited = new Set<number>();
  let limitedLines = 0;
  for (const line of logText.split("\n")) {
    const match = MSG.exec(line);
    if (!match) continue;
    let obj: {
      intent?: unknown;
      outcome?: unknown;
      net?: unknown;
      ghost?: unknown;
      limited?: unknown;
    };
    try {
      obj = JSON.parse(match[1]!.replace(/\\"/g, '"').replace(/\\\\/g, "\\")) as typeof obj;
    } catch {
      continue;
    }
    if (obj.limited === true && Number.isInteger(obj.intent)) {
      limitedLines += 1;
      if ((obj.intent as number) < started) limited.add(obj.intent as number);
      continue;
    }
    if (!Number.isInteger(obj.intent) || (obj.outcome !== "ok" && obj.outcome !== "fail")) continue;
    const intent = obj.intent as number;
    if (intent >= started) {
      beyondStarted.push(intent);
      continue;
    }
    if (outcomes.has(intent)) {
      duplicateLines.push(intent);
      continue;
    }
    outcomes.set(intent, {
      outcome: obj.outcome,
      net: obj.net === true,
      ghost: obj.ghost === true,
    });
  }
  return { outcomes, duplicateLines, beyondStarted, limited, limitedLines };
}

/** Started set = 0..started-1. ok / fail (a plain fail) / indeterminate (no line, or a fail with net: true). */
export function classifyIntents(
  log: IntentLog,
  started: number,
): { ok: number[]; fail: number[]; indeterminate: number[]; noLine: number[] } {
  const out = {
    ok: [] as number[],
    fail: [] as number[],
    indeterminate: [] as number[],
    noLine: [] as number[],
  };
  for (let i = 0; i < started; i++) {
    const line = log.outcomes.get(i);
    if (!line) {
      out.noLine.push(i);
      out.indeterminate.push(i);
    } else if (line.outcome === "ok") {
      out.ok.push(i);
    } else if (line.net) {
      out.indeterminate.push(i);
    } else {
      out.fail.push(i);
    }
  }
  return out;
}

export interface IntentAudit {
  findings: Array<{ kind: "PRODUCT BUG" | "TEST BUG"; text: string; knownBugId?: string }>; // ids and counts only
  counts: {
    started: number;
    ok: number;
    fail: number;
    indeterminate: number;
    ghostRows: number;
    duplicateRows: number;
  };
}

/**
 * The five rules of plan §6.8. rowsByIntent: rows per intent; ghostRows: rows whose label maps to no started intent.
 * A `fail` intent with one row is counted under failWithRowKnownBugId only when its line carries ghost: true.
 */
export function auditByIntent(input: {
  started: number;
  log: IntentLog;
  rowsByIntent: Map<number, number>;
  ghostRows: number;
  interrupted: number;
  failWithRowKnownBugId?: string;
}): IntentAudit {
  const findings: IntentAudit["findings"] = [];
  const classes = classifyIntents(input.log, input.started);
  let ghostRows = input.ghostRows;
  let duplicateRows = 0;

  for (const [intent, rows] of input.rowsByIntent) {
    if (intent < 0 || intent >= input.started) ghostRows += rows;
  }
  if (ghostRows > 0) {
    findings.push({
      kind: "PRODUCT BUG",
      text: `${ghostRows} row(s) map to no started intent (ghost write)`,
    });
  }

  for (const [intent, rows] of input.rowsByIntent) {
    if (intent < 0 || intent >= input.started || rows <= 1) continue;
    duplicateRows += rows - 1;
    findings.push({
      kind: "PRODUCT BUG",
      text: `intent ${intent} has ${rows} rows (duplicate write)`,
    });
  }

  for (const i of classes.ok) {
    const rows = input.rowsByIntent.get(i) ?? 0;
    if (rows === 0)
      findings.push({ kind: "PRODUCT BUG", text: `intent ${i} was told ok but has no row` });
  }

  for (const i of classes.fail) {
    const rows = input.rowsByIntent.get(i) ?? 0;
    if (rows === 0) continue;
    if (rows > 1) continue; // reported as a duplicate above
    const line = input.log.outcomes.get(i);
    if (input.failWithRowKnownBugId && line?.ghost) {
      findings.push({
        kind: "PRODUCT BUG",
        text: `intent ${i} was told fail and has one row (ghost signature)`,
        knownBugId: input.failWithRowKnownBugId,
      });
    } else {
      findings.push({ kind: "PRODUCT BUG", text: `intent ${i} was told fail and has one row` });
    }
  }

  if (classes.noLine.length > input.interrupted) {
    findings.push({
      kind: "TEST BUG",
      text: `${classes.noLine.length} intent(s) with no outcome line, more than the ${input.interrupted} interrupted`,
    });
  }
  if (input.log.duplicateLines.length > 0) {
    findings.push({
      kind: "TEST BUG",
      text: `${input.log.duplicateLines.length} repeated outcome line(s)`,
    });
  }
  if (input.log.beyondStarted.length > 0) {
    findings.push({
      kind: "TEST BUG",
      text: `${input.log.beyondStarted.length} outcome line(s) at or above started`,
    });
  }

  return {
    findings,
    counts: {
      started: input.started,
      ok: classes.ok.length,
      fail: classes.fail.length,
      indeterminate: classes.indeterminate.length,
      ghostRows,
      duplicateRows,
    },
  };
}
