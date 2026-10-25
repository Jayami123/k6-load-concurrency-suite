import type { IntentLog } from "../knee/intents.ts";

export type AuditProduct = "cal" | "medusa" | "documenso";

/** A knee run's intent counters (plan task 1 §6.8): with these the audits reconcile per intent, not by count. */
export interface IntentCounters {
  started: number;
  interrupted: number; // p6_step_started total - iterations: the upper bound of indeterminate intents
  log: IntentLog;
}

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

/** What a case's setup stage stores in ctx.config.audit. Plain data, no secrets. */
export type AuditStageConfig =
  | { product: "cal"; userId: number; eventTypeId: number; prefixLike: string; prefix?: string }
  | {
      product: "medusa";
      prefixLike: string;
      variantId: string;
      inventoryItemId: string;
      locationId: string;
      stock?: number;
    }
  | {
      product: "documenso";
      prefixLike: string;
      drainTimeoutMs?: number;
      sequentialCompletions: boolean;
      /** Known bugs the case declares (LoadCase.knownBugs): their duplicates are counted, not violations. */
      knownBugs?: string[];
    };
