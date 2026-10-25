/**
 * The gate of a case that declares known bugs (LoadCase.knownBugs). Pure: the case's retry judgement goes in as named checks.
 * A violation that matches a declared bug is KNOWN BUG and does not fail the run. The gate is strict in three ways: the declared
 * bug must be observed (a fixed product fails the run until the marker is removed), any other violation fails, and a missing
 * storm check or audit fails.
 */

export interface GateCheck {
  name: string;
  ok: boolean;
  kind?: "PRODUCT BUG" | "TEST BUG";
  detail: string;
}

export interface KnownBugGateInput {
  declared: string[];
  checks: GateCheck[];
  hasAudit: boolean;
}

export interface KnownBugGateResult {
  ok: boolean;
  kind?: "PRODUCT BUG" | "TEST BUG";
  reasons: string[];
  observed: Record<string, string[]>;
}

/** Which checks of the retry judgement each declared bug produces (P6-OBS-DOC-005: the duplicate seal, its audit row and its email). */
export const KNOWN_BUG_CHECKS: Record<string, string[]> = {
  "P6-OBS-DOC-005": ["one-seal-per-document", "one-completed-audit-row", "one-email-per-recipient"],
};

/** Checks every storm case must report; a missing one is a TEST BUG, never a pass. */
export const HARD_CHECKS = ["storm", "no-5xx", "document-completed", "recipients-signed"];

export function judgeKnownBugGate(i: KnownBugGateInput): KnownBugGateResult {
  const fail = (kind: "PRODUCT BUG" | "TEST BUG", reason: string): KnownBugGateResult => ({
    ok: false,
    kind,
    reasons: [reason],
    observed: {},
  });
  if (!i.hasAudit) return fail("TEST BUG", "audit.json is missing: the case's audit did not run");
  const byName = new Map(i.checks.map((c) => [c.name, c]));
  for (const name of HARD_CHECKS) {
    if (!byName.has(name))
      return fail("TEST BUG", `storm check "${name}" is missing from the audit`);
  }
  const storm = byName.get("storm");
  if (storm === undefined || !storm.ok) {
    return fail("TEST BUG", `no storm (${storm?.detail ?? "missing"})`);
  }
  for (const id of i.declared) {
    if (KNOWN_BUG_CHECKS[id] === undefined) return fail("TEST BUG", `unknown declared bug ${id}`);
  }

  const observed: Record<string, string[]> = {};
  const reasons: string[] = [];
  for (const c of i.checks) {
    if (c.ok) continue;
    const owner = i.declared.find((id) => KNOWN_BUG_CHECKS[id]?.includes(c.name));
    if (owner !== undefined) {
      (observed[owner] ??= []).push(c.name);
      continue;
    }
    reasons.push(`${c.kind ?? "TEST BUG"}: ${c.name}: ${c.detail}`);
  }
  const violations = reasons.length > 0;
  if (violations) {
    const kind = reasons.some((r) => r.startsWith("PRODUCT BUG")) ? "PRODUCT BUG" : "TEST BUG";
    return { ok: false, kind, reasons, observed };
  }
  for (const id of i.declared) {
    if (observed[id] === undefined) {
      return {
        ok: false,
        kind: "TEST BUG",
        reasons: [`known bug ${id} is not observed: fixed upstream? remove it from knownBugs`],
        observed,
      };
    }
  }
  const known = Object.entries(observed).map(
    ([id, names]) => `KNOWN BUG ${id} observed (${names.join(", ")})`,
  );
  return { ok: true, reasons: known, observed };
}
