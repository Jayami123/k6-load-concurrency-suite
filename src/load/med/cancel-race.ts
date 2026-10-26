// The terminal transition under a cancel race (plan Phase 4b task 10 §6.4). Pure: the caller reads the order states after the drain.
// Known bugs are counted under their IDs and do not make the case FAIL by themselves; any other double terminal state is a FAIL.

export interface OrderTerminal {
  orderId: string;
  terminal: string[]; // the terminal transitions read from the order's history
  openFulfilment: boolean;
  sideEffects: { refunds: number; reservationsLive: number };
}

export interface CancelRaceVerdict {
  orders: number;
  singleTerminal: number;
  x04Double: number; // a double cancel with more than one refund: P6-MED-RACE-008 (known, PRODUCT BUG under test.fail())
  x05CancelFulfil: number; // a cancel that raced an open fulfilment: P6-MED-RACE-009
  f3Restore: number; // a canceled order whose reservation came back: F-M3
  verdict: "PASS" | "PASS (X04/X05 counted)" | "FAIL (PRODUCT BUG)" | "TEST BUG" | "INVALID";
  reasons: string[];
}

/**
 * Precedence, highest first: TEST BUG (no orders) > INVALID (invalidReasons) > FAIL (PRODUCT BUG: a double terminal state that is
 * not one of the counted known bugs) > PASS (X04/X05 counted) > PASS.
 */
export function terminalTransitionVerdict(
  orders: OrderTerminal[],
  invalidReasons: string[],
): CancelRaceVerdict {
  const counts = { x04Double: 0, x05CancelFulfil: 0, f3Restore: 0, singleTerminal: 0 };
  const unexplained: string[] = [];
  for (const o of orders) {
    const cancels = o.terminal.filter((t) => t === "CANCELED").length;
    const canceled = cancels > 0;
    // no terminal transition at all is a lost transition after the drain: never a pass
    if (o.terminal.length === 0) unexplained.push(o.orderId);
    if (o.terminal.length === 1) counts.singleTerminal++;
    if (o.terminal.length > 1) {
      // X04 is a double cancel: two cancel entries and more than one refund
      if (o.terminal.length === 2 && cancels === 2 && o.sideEffects.refunds > 1) counts.x04Double++;
      else if (
        o.openFulfilment &&
        o.terminal.length === 2 &&
        cancels === 1 &&
        o.terminal.includes("FULFILLED")
      )
        counts.x05CancelFulfil++;
      else unexplained.push(o.orderId);
    }
    if (canceled && o.sideEffects.reservationsLive > 0) counts.f3Restore++;
  }
  const base = { orders: orders.length, ...counts };
  if (orders.length === 0)
    return { ...base, verdict: "TEST BUG", reasons: ["TEST BUG: no orders read after the drain"] };
  if (invalidReasons.length > 0)
    return { ...base, verdict: "INVALID", reasons: [...invalidReasons] };
  if (unexplained.length > 0)
    return {
      ...base,
      verdict: "FAIL (PRODUCT BUG)",
      reasons: [`${unexplained.length} order(s) with a missing or unexplained terminal state`],
    };
  const known = counts.x04Double + counts.x05CancelFulfil;
  if (known > 0)
    return {
      ...base,
      verdict: "PASS (X04/X05 counted)",
      reasons: [`${counts.x04Double} X04 and ${counts.x05CancelFulfil} X05 counted`],
    };
  return {
    ...base,
    verdict: "PASS",
    reasons: [`${counts.singleTerminal} order(s) with one terminal transition`],
  };
}
