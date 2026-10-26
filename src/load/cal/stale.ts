// The stale-read classifier of P6-CAL-LOAD-006 (plan Phase 4b task 8 §6.3). Pure: the polls and the contract come from the caller.

export interface StalePoll {
  tMs: number;
  offered: boolean | null; // null when the poll failed (a non-200 from getFreeSlots, or a transport error)
}

export type StaleContract = "never-offered-again" | "bounded-staleness";

export interface StaleVerdict {
  contract: StaleContract; // the contract that applied, recorded in the verdict (D15)
  staleCount: number; // polls after commit that still offered S
  pollsExpected: number; // 60 s / 2 s = 30 polls after commit
  pollsDone: number; // polls with a non-null result
  timeToDisappearMs: number | null; // null when S was never offered again after commit (the expected inactive result)
  observation: "sampled-2s"; // a 2 s poll is a sample: an offer that appears and disappears between polls is not seen (§6.3)
  verdict: "PASS (sampled, 2 s)" | "FAIL (PRODUCT BUG)" | "TEST BUG";
  reasons: string[];
}

/**
 * Fails closed. A failed poll (offered null) or a missing poll (fewer than pollsExpected after commit) is a TEST BUG, so incomplete
 * coverage can never pass. A second ACCEPTED on S is a FAIL under either contract. Under never-offered-again any offer after commit is
 * a FAIL; under bounded-staleness an offer is allowed up to ttlMs + marginMs after commit. The contract is passed in by the caller from
 * the cache probe (C8-1), never inferred.
 */
export function classifyStale(input: {
  contract: StaleContract;
  commitMs: number;
  polls: StalePoll[];
  pollsExpected: number;
  ttlMs: number;
  marginMs: number;
  secondAcceptedOnS: boolean;
}): StaleVerdict {
  const after = input.polls.filter((p) => p.tMs > input.commitMs).sort((a, b) => a.tMs - b.tMs);
  const pollsDone = after.filter((p) => p.offered !== null).length;
  const offeredAfter = after.filter((p) => p.offered === true);
  const allowedUntil = input.contract === "bounded-staleness" ? input.ttlMs + input.marginMs : 0;
  const stale = offeredAfter.filter((p) => p.tMs - input.commitMs > allowedUntil);
  const lastOffered = offeredAfter.length > 0 ? offeredAfter[offeredAfter.length - 1]!.tMs : null;
  const disappear =
    lastOffered === null
      ? undefined
      : after.find((p) => p.tMs > lastOffered && p.offered === false);
  const timeToDisappearMs = disappear === undefined ? null : disappear.tMs - input.commitMs;

  const result = (verdict: StaleVerdict["verdict"], reasons: string[]): StaleVerdict => ({
    contract: input.contract,
    staleCount: stale.length,
    pollsExpected: input.pollsExpected,
    pollsDone,
    timeToDisappearMs,
    observation: "sampled-2s",
    verdict,
    reasons,
  });

  if (input.secondAcceptedOnS)
    return result("FAIL (PRODUCT BUG)", ["a second ACCEPTED on the slot"]);
  const incomplete: string[] = [];
  if (after.length < input.pollsExpected)
    incomplete.push(`${after.length} polls after commit, expected ${input.pollsExpected}`);
  if (after.some((p) => p.offered === null)) incomplete.push("a poll failed");
  if (incomplete.length > 0) return result("TEST BUG", incomplete);
  if (stale.length > 0)
    return result("FAIL (PRODUCT BUG)", [
      `${stale.length} poll(s) after commit still offered the slot (${input.contract})`,
    ]);
  return result("PASS (sampled, 2 s)", [
    `no offer after commit in ${pollsDone} of ${input.pollsExpected} sampled polls`,
  ]);
}
