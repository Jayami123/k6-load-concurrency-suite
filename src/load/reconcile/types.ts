export type AuditProduct = "cal" | "medusa" | "documenso";

/** kind follows docs/agent-rules.md. knownBugId is set when the finding is an already-labelled bug; such findings go to knownBugs, not violations. */
export interface Finding {
  kind: "PRODUCT BUG" | "TEST BUG";
  text: string;
  knownBugId?: string;
}

/** One line of the audit table. detail holds counts and ids only (no URL, token, email, title). */
export interface AuditCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface AuditResult {
  schema: 1;
  product: AuditProduct;
  prefixLike: string;
  rowsSeen: number;
  drainMs?: number;
  checks: AuditCheck[];
  violations: Finding[];
  knownBugs: Record<string, number>;
  unexpected: string[];
  pending: string[];
  leak: string[];
}

/** Adds a finding to the result: known bugs are counted under their id, everything else is a violation. */
export function addFinding(result: AuditResult, finding: Finding, count = 1): void {
  if (finding.knownBugId) {
    result.knownBugs[finding.knownBugId] = (result.knownBugs[finding.knownBugId] ?? 0) + count;
  } else {
    result.violations.push(finding);
  }
}
