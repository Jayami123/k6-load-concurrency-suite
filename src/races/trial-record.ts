import { statusCountsFromRequests } from "./histogram.ts";
import type { RaceRequestResult, RaceTrialResult } from "./types.ts";

/**
 * Build the per-trial record from fireTogether output first, then run the
 * validator. A validation failure never discards the observed statuses: the
 * record is returned with ok:false, error and an invariantViolations entry.
 * Callers that need runTrials to see the failure should throw record.error.
 */
export function recordTrial(
  trial: number,
  fired: { requests: RaceRequestResult[]; dispatchSpreadMs: number },
  validate: (record: RaceTrialResult) => void,
): RaceTrialResult {
  const statuses = fired.requests.map((r) => r.status);
  const record: RaceTrialResult = {
    trial,
    ok: true,
    statuses,
    statusCounts: statusCountsFromRequests(statuses),
    dispatchSpreadMs: fired.dispatchSpreadMs,
    oracle: {},
    invariantViolations: [],
    requests: fired.requests,
  };
  try {
    validate(record);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    record.ok = false;
    record.error = message;
    record.invariantViolations.push(message);
  }
  return record;
}
