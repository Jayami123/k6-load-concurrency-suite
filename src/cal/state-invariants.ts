/** Lines a case reports. `testGuards` fail the case; `suspected` lines are annotated and never change the verdict (D-C7). */
export type Findings = { testGuards: string[]; suspected: string[] };

/** Pure. A request that threw (no HTTP status) is a TEST BUG. A 5xx is a product line, added by the caller. */
export function checkStatusNotNull(statuses: Array<number | null>): string[] {
  const thrown = statuses.filter((s) => s === null).length;
  return thrown === 0 ? [] : [`TEST BUG: ${thrown} request(s) threw (no HTTP status)`];
}

/** Pure. F-C1: a cap-N link admits exactly N bookings and its counter ends at N. */
export function checkLinkCap(input: {
  cap: number;
  accepted: number;
  usageCount: number;
  statuses: Array<number | null>;
}): Findings {
  const suspected: string[] = [];
  if (input.accepted > input.cap) {
    suspected.push(
      `SUSPECTED PRODUCT BUG: link maxUsageCount ${input.cap}: ${input.accepted} bookings accepted through it (F-C1)`,
    );
  }
  if (input.usageCount > input.cap) {
    suspected.push(
      `SUSPECTED PRODUCT BUG: usageCount ${input.usageCount} above maxUsageCount ${input.cap} (F-C1)`,
    );
  }
  if (input.accepted >= input.cap && input.usageCount !== input.cap) {
    suspected.push(
      `SUSPECTED PRODUCT BUG: usageCount ${input.usageCount}, expected ${input.cap} (F-C1)`,
    );
  }
  return { testGuards: checkStatusNotNull(input.statuses), suspected };
}

/** Pure. F-C2: one terminal state, one side-effect set. */
export function checkConfirmCancel(input: {
  finalStatus: string;
  createdCount: number;
  cancelledCount: number;
}): Findings {
  const { finalStatus, createdCount, cancelledCount } = input;
  const terminal = finalStatus === "accepted" || finalStatus === "cancelled";
  const bothSets = createdCount > 0 && cancelledCount > 0;
  const matches =
    finalStatus === "accepted"
      ? createdCount === 1 && cancelledCount === 0
      : finalStatus === "cancelled"
        ? cancelledCount === 1 && createdCount === 0
        : false;
  const bad = !terminal || bothSets || !matches;
  return {
    testGuards: [],
    suspected: bad
      ? [
          `SUSPECTED PRODUCT BUG: confirm || cancel: final ${finalStatus}, BOOKING_CREATED ${createdCount}, BOOKING_CANCELLED ${cancelledCount} (F-C2)`,
        ]
      : [],
  };
}

/** Pure. F-C3: one ACCEPTED booking, one confirmation webhook. */
export function checkConfirmConfirm(input: {
  finalStatus: string;
  createdCount: number;
  statuses: Array<number | null>;
}): Findings {
  const bad = input.finalStatus !== "accepted" || input.createdCount !== 1;
  return {
    testGuards: checkStatusNotNull(input.statuses),
    suspected: bad
      ? [
          `SUSPECTED PRODUCT BUG: confirm || confirm: final ${input.finalStatus}, BOOKING_CREATED ${input.createdCount} (F-C3)`,
        ]
      : [],
  };
}

/** Pure. Every delivery must pass the signature check; a failure is a TEST BUG, not a product finding. */
export function checkSignedDeliveries(deliveries: Array<{ secretMatches: boolean }>): string[] {
  const bad = deliveries.filter((d) => !d.secretMatches).length;
  return bad === 0
    ? []
    : [`TEST BUG: ${bad} webhook delivery(ies) failed the x-cal-signature-256 check`];
}
