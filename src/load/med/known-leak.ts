// The known-fail marker of the cancel-race leak (plan Phase 4b task 10; owner decision, P6-OBS-MED-002). Pure.
// The assertion stays strict: a canceled order must hold 0 reservations. The marker only names the failure as known, and only
// while it reproduces alone: any other failing clause still fails the case, and a leak of 0 under the marker fails loudly, so the
// marker cannot go stale.

export type LeakVerdict =
  { status: "PASS" } | { status: "KNOWN"; text: string } | { status: "FAIL"; text: string };

export interface LeakInput {
  leaked: number; // canceled orders holding at least one live reservation
  otherFailing: boolean; // any other clause of the case fails
  knownId?: string; // the observation id of the marker, when the case declares the leak known
}

export function judgeLeak({ leaked, otherFailing, knownId }: LeakInput): LeakVerdict {
  if (knownId === undefined) {
    return leaked > 0
      ? { status: "FAIL", text: `PRODUCT BUG: ${leaked} canceled order(s) hold a reservation` }
      : { status: "PASS" };
  }
  if (leaked === 0) {
    return {
      status: "FAIL",
      text: `known bug no longer reproduces: remove the known-fail marker (${knownId})`,
    };
  }
  if (otherFailing) {
    return {
      status: "FAIL",
      text: `PRODUCT BUG: ${leaked} canceled order(s) hold a reservation, and another clause fails`,
    };
  }
  return {
    status: "KNOWN",
    text: `KNOWN FAIL ${knownId}: ${leaked} canceled order(s) hold a reservation`,
  };
}
