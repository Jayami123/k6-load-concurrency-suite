export type OversellMode = "qty1" | "mixed" | "sameCart" | "s0";

export function checkOversellInvariants(input: {
  mode: OversellMode;
  s: number;
  n: number;
  orderCount: number;
  orderQty: number;
  httpWinnerCount: number;
  uniqueOrderIds: number;
  reservationQty: number;
  stocked: number;
  reserved: number;
  available: number;
  statuses: Array<number | null>;
  loserTypes: string[];
  loserMessages: string[];
  loserQuantities: number[];
}): string[] {
  const violations: string[] = [];

  for (const status of input.statuses) {
    if (status === null || status >= 500) {
      violations.push(`PRODUCT BUG: HTTP ${status === null ? "error" : status}`);
    }
  }

  if (input.orderCount > input.s || input.reservationQty > input.s || input.orderQty > input.s) {
    violations.push("PRODUCT BUG: oversold");
  }

  if (input.available !== input.stocked - input.reserved) {
    violations.push("TEST BUG: available is not stocked - reserved");
  }

  if (input.stocked !== input.s) {
    violations.push(`TEST BUG: stocked_quantity ${input.stocked} !== S ${input.s}`);
  }

  if (input.reserved !== input.reservationQty) {
    violations.push(
      `PRODUCT BUG: inventory_level reserved ${input.reserved} !== reservation_item sum ${input.reservationQty}`,
    );
  }

  if (input.statuses.length !== input.n) {
    violations.push(`TEST BUG: ${input.statuses.length} responses recorded, expected N ${input.n}`);
  }

  const ok200 = input.statuses.filter((status) => status === 200).length;
  const refused400 = input.statuses.filter((status) => status === 400).length;

  if (input.httpWinnerCount !== ok200) {
    violations.push(
      `PRODUCT BUG: ${ok200} HTTP 200 but only ${input.httpWinnerCount} returned type=order`,
    );
  }

  if (input.mode !== "sameCart" && ok200 + refused400 !== input.statuses.length) {
    violations.push("PRODUCT BUG: completion status other than 200 or 400");
  }

  if (input.stocked - input.reserved < 0) {
    violations.push("PRODUCT BUG: available negative");
  }

  if (input.mode !== "sameCart" && input.httpWinnerCount !== input.uniqueOrderIds) {
    violations.push(
      `PRODUCT BUG: HTTP winners ${input.httpWinnerCount} shared order ids (unique ${input.uniqueOrderIds})`,
    );
  }

  if (input.uniqueOrderIds !== input.orderCount) {
    violations.push(
      `PRODUCT BUG: HTTP unique order ids ${input.uniqueOrderIds} != DB orders ${input.orderCount}`,
    );
  }

  if (input.mode === "qty1") {
    if (input.orderCount !== input.s) {
      violations.push(`PRODUCT BUG: orderCount ${input.orderCount} !== S ${input.s}`);
    }
    if (ok200 !== input.s || refused400 !== input.n - input.s) {
      violations.push(
        `PRODUCT BUG: statuses 200x${ok200} 400x${refused400}, expected 200x${input.s} 400x${input.n - input.s}`,
      );
    }
    if (input.reservationQty !== input.orderCount) {
      violations.push(
        `PRODUCT BUG: reservationQty ${input.reservationQty} !== orderCount ${input.orderCount}`,
      );
    }
    if (input.available !== 0) {
      violations.push(`PRODUCT BUG: available ${input.available} !== 0`);
    }
    for (let i = 0; i < input.loserTypes.length; i++) {
      const type = input.loserTypes[i];
      const message = input.loserMessages[i] ?? "";
      if (type !== "not_allowed" || !message.includes("Not enough stock available")) {
        violations.push(
          `PRODUCT BUG: qty1 loser type=${type ?? "missing"} message=${message.slice(0, 80)}`,
        );
      }
    }
  }

  if (input.mode === "mixed") {
    if (input.orderQty > input.s) {
      violations.push("PRODUCT BUG: oversold");
    }
    if (input.reservationQty !== input.orderQty) {
      violations.push(
        `PRODUCT BUG: reservationQty ${input.reservationQty} !== orderQty ${input.orderQty}`,
      );
    }
    const avail = input.stocked - input.reserved;
    if (input.available !== avail || avail < 0) {
      violations.push(`PRODUCT BUG: mixed available ${input.available} invalid`);
    }
    for (const qty of input.loserQuantities) {
      if (qty <= input.available) {
        violations.push(
          `PRODUCT BUG: refused cart qty ${qty} could still fit (available ${input.available})`,
        );
      }
    }
  }

  if (input.mode === "s0") {
    if (input.orderCount !== 0 || input.reservationQty !== 0 || input.reserved !== 0) {
      violations.push("PRODUCT BUG: s0 expected zero orders and reservations");
    }
    for (const status of input.statuses) {
      if (status !== 400) {
        violations.push(`PRODUCT BUG: s0 complete status ${status} expected 400`);
      }
    }
    for (const type of input.loserTypes) {
      if (type !== "invalid_data") {
        violations.push(`PRODUCT BUG: s0 loser type ${type} expected invalid_data`);
      }
    }
  }

  if (input.mode === "sameCart") {
    if (input.uniqueOrderIds !== 1 || input.orderCount !== 1 || input.reservationQty !== 1) {
      violations.push("PRODUCT BUG: sameCart expected one order and one reservation");
    }
    for (const status of input.statuses) {
      if (status !== 200) {
        violations.push(`PRODUCT BUG: sameCart status ${status} expected 200`);
      }
    }
  }

  return violations;
}

/** Refunds of one payment may not add up to more than was captured (money never over-returned). */
export function checkRefundCap(input: { capturedSum: number; refundedSum: number }): string[] {
  return input.refundedSum > input.capturedSum
    ? [`PRODUCT BUG: refunded ${input.refundedSum} of ${input.capturedSum} captured`]
    : [];
}

/** Captures of one authorised payment may not add up to more than was authorised. */
export function checkCaptureCap(input: {
  authorizedAmount: number;
  capturedSum: number;
}): string[] {
  return input.capturedSum > input.authorizedAmount
    ? [`PRODUCT BUG: captured ${input.capturedSum} of ${input.authorizedAmount} authorised`]
    : [];
}

/**
 * HTTP success count against the expected count. A difference is a SUSPECTED PRODUCT BUG (D40): the caller
 * records it and annotates the test, it does not fail the case. Returns null when the counts agree.
 */
export function checkSuccessCount(input: {
  successes: number;
  expected: number;
  label: string;
}): string | null {
  if (input.successes === input.expected) return null;
  return `SUSPECTED PRODUCT BUG: ${input.label}: ${input.successes} HTTP success(es), expected ${input.expected} (F-M1, D40)`;
}

/** Every loser must be a clean 4xx. A 5xx is a product fault under contention; a missing status is a test fault. */
export function checkLoserStatuses(statuses: Array<number | null>): string[] {
  const violations: string[] = [];
  for (const status of statuses) {
    if (status === null) {
      violations.push("TEST BUG: a racing money request threw before it got a status");
    } else if (status >= 500) {
      violations.push(`PRODUCT BUG: 5xx on a racing money request: ${status}`);
    } else if (status !== 200 && (status < 400 || status >= 500)) {
      violations.push(`PRODUCT BUG: unexpected status on a racing money request: ${status}`);
    }
  }
  return violations;
}

/** -005 / -012. The counter and the HTTP count are asserted (PRODUCT BUG); the order count is a suspected signal. */
export function checkPromoCap(input: {
  cap: number;
  counterUsed: number;
  ordersWithPromo: number;
  httpSuccesses: number;
  label: string;
}): string[] {
  const out: string[] = [];
  if (input.counterUsed > input.cap) {
    out.push(`PRODUCT BUG: ${input.label}: usage counter ${input.counterUsed} of cap ${input.cap}`);
  }
  if (input.httpSuccesses > input.cap) {
    out.push(
      `PRODUCT BUG: ${input.label}: ${input.httpSuccesses} checkouts returned 200, cap ${input.cap}`,
    );
  }
  if (input.ordersWithPromo > input.cap) {
    out.push(
      `SUSPECTED PRODUCT BUG: ${input.label}: ${input.ordersWithPromo} orders carry the promotion, cap ${input.cap} (F-M2)`,
    );
  }
  return out;
}

/** -005 / -012. Every live order of the attempt must be one a checkout returned with 200. */
export function checkGhostOrders(input: {
  liveOrderIds: readonly string[];
  httpOrderIds: readonly string[];
}): string[] {
  const returned = new Set(input.httpOrderIds);
  return input.liveOrderIds
    .filter((id) => !returned.has(id))
    .map((id) => `SUSPECTED PRODUCT BUG: order ${id} exists but no checkout returned it (F-M2)`);
}

/** -008. One of two cancels takes effect, once. */
export function checkSingleCancel(input: {
  status: string;
  httpSuccesses: number;
  pendingChanges: number;
  creditLines: number;
}): string[] {
  const out: string[] = [];
  if (input.status !== "canceled") {
    out.push(
      `SUSPECTED PRODUCT BUG: order status ${input.status} after two cancels, expected canceled (X04)`,
    );
  }
  if (input.httpSuccesses !== 1) {
    out.push(
      `SUSPECTED PRODUCT BUG: ${input.httpSuccesses} cancels returned 200, expected 1 (X04)`,
    );
  }
  if (input.pendingChanges !== 0) {
    out.push(
      `SUSPECTED PRODUCT BUG: ${input.pendingChanges} pending order change(s) left after cancel (X04)`,
    );
  }
  if (input.creditLines !== 1) {
    out.push(
      `SUSPECTED PRODUCT BUG: ${input.creditLines} credit lines after cancel, expected 1 (X04)`,
    );
  }
  return out;
}

/** -009. Cancel and fulfil are exclusive: exactly one takes effect, and never "canceled with an open fulfillment". */
export function checkCancelFulfilExclusive(input: {
  status: string;
  openFulfillments: number;
  fulfilledQuantity: number;
  cancelStatus: number | null;
  fulfilStatus: number | null;
}): string[] {
  const out: string[] = [];
  if (input.status === "canceled" && input.openFulfillments > 0) {
    out.push(
      `SUSPECTED PRODUCT BUG: order canceled with ${input.openFulfillments} open fulfillment(s) (X05)`,
    );
  }
  const wins = [input.cancelStatus, input.fulfilStatus].filter((s) => s === 200).length;
  if (wins !== 1) {
    out.push(
      `SUSPECTED PRODUCT BUG: ${wins} of cancel ‖ fulfil returned 200, expected exactly 1 (X05)`,
    );
  }
  if (wins === 1 && input.fulfilStatus === 200 && input.fulfilledQuantity !== 1) {
    out.push(
      `SUSPECTED PRODUCT BUG: fulfil won but fulfilled_quantity is ${input.fulfilledQuantity} (X05)`,
    );
  }
  if (wins === 1 && input.cancelStatus === 200 && input.fulfilledQuantity !== 0) {
    out.push(
      `SUSPECTED PRODUCT BUG: cancel won but fulfilled_quantity is ${input.fulfilledQuantity} (X05)`,
    );
  }
  return out;
}

/** -008 / -009. Stock bookkeeping after the burst (F-M3). */
export function checkReservationDrift(input: {
  status: string;
  liveReservations: number;
  liveReservationQty: number;
  reservedQuantity: number;
}): string[] {
  const out: string[] = [];
  if (input.status === "canceled" && input.liveReservations > 0) {
    out.push(
      `SUSPECTED PRODUCT BUG: canceled order keeps ${input.liveReservations} live reservation(s) (F-M3)`,
    );
  }
  if (input.reservedQuantity !== input.liveReservationQty) {
    out.push(
      `SUSPECTED PRODUCT BUG: reserved_quantity ${input.reservedQuantity} but live reservations sum ${input.liveReservationQty} (F-M3)`,
    );
  }
  return out;
}

/**
 * Splits finding lines. `labelled` holds the signal tags the owner has labelled: a SUSPECTED line with a labelled tag
 * is promoted to "PRODUCT BUG" and asserted. Everything else keeps its label (plan §8.5, D54).
 */
export function classifyFindings(
  lines: readonly string[],
  labelled: readonly string[],
): { violations: string[]; suspected: string[] } {
  const violations: string[] = [];
  const suspected: string[] = [];
  for (const line of lines) {
    if (!line.startsWith("SUSPECTED PRODUCT BUG:")) {
      violations.push(line);
      continue;
    }
    const tag = /\(([A-Z0-9-]+)\)$/.exec(line)?.[1];
    if (tag && labelled.includes(tag)) {
      violations.push(line.replace("SUSPECTED PRODUCT BUG:", "PRODUCT BUG:"));
    } else {
      suspected.push(line);
    }
  }
  return { violations, suspected };
}
