// The known-fail marker of the cancel-race leak (plan Phase 4b task 10; owner decisions on P6-OBS-MED-002). Pure.
// One function judges every clause the leak touches: the cancel-race stage, the reconcile's reservation rows, and the cleanup's
// deletion of reservations. The assertions stay strict. The marker only names a clause as known while it reproduces alone:
// the clause's observed count must equal the known leak count and nothing else in the clause may fail; a leak of 0 under the
// marker fails loudly, so the marker cannot go stale.

export type ClauseVerdict =
  { status: "PASS" } | { status: "KNOWN"; text: string } | { status: "FAIL"; text: string };

export interface LeakClause {
  label: string; // the clause, for the text (for example "reconcile reservations")
  knownId?: string; // the observation id, when the case declares the leak known
  leak: number; // rows (or canceled orders) held by canceled orders: the known leak count
  observed: number; // what the clause found beyond its strict expectation (reconcile excess, deleted reservations, leaked orders)
  onlyLeak: boolean; // false when anything else in the clause fails (a live row, a failed delete, a mismatch of another kind)
}

export function judgeLeakClause({
  label,
  knownId,
  leak,
  observed,
  onlyLeak,
}: LeakClause): ClauseVerdict {
  if (knownId === undefined) {
    return observed === 0
      ? { status: "PASS" }
      : { status: "FAIL", text: `PRODUCT BUG: ${label}: ${observed} unexpected` };
  }
  if (leak === 0) {
    return {
      status: "FAIL",
      text: `known bug no longer reproduces: remove the known-fail marker (${knownId})`,
    };
  }
  if (onlyLeak && observed === leak) {
    return {
      status: "KNOWN",
      text: `KNOWN FAIL ${knownId} (${label}: ${observed} = leak ${leak})`,
    };
  }
  return {
    status: "FAIL",
    text: `PRODUCT BUG: ${label}: ${observed} observed, leak ${leak}${onlyLeak ? "" : ", and another part of the clause fails"}`,
  };
}
