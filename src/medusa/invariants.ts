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
