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
  dispatchSpreadMs: number;
  spreadLimit: number;
}): string[] {
  const violations: string[] = [];

  for (const status of input.statuses) {
    if (status === null || status >= 500) {
      violations.push(`PRODUCT BUG: HTTP ${status === null ? "error" : status}`);
    }
  }

  if (input.dispatchSpreadMs >= input.spreadLimit) {
    violations.push(`TEST BUG: dispatchSpreadMs ${input.dispatchSpreadMs} >= ${input.spreadLimit}`);
  }

  if (input.orderCount > input.s || input.reservationQty > input.s || input.orderQty > input.s) {
    violations.push("PRODUCT BUG: oversold");
  }

  if (input.available !== input.stocked - input.reserved) {
    violations.push("TEST BUG: available is not stocked - reserved");
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
