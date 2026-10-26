// The two-instance conservation audit of P6-MED-LOAD-007 (plan Phase 4b task 10 §6.2). Pure: the caller reads the rows.
// Fail-closed: PASS only when every check holds, and a zero-request instance is a TEST BUG, never a pass.

export interface InstanceCount {
  instance: "primary" | "secondary";
  requests: number;
  orders: number;
}

export interface SplitVerdict {
  orders: number;
  stock: number;
  perInstance: InstanceCount[];
  verdict: "PASS" | "FAIL (PRODUCT BUG)" | "TEST BUG" | "INVALID";
  reasons: string[];
}

/**
 * Conservation across two instances that share one database and one lock. Precedence, one outcome per run, highest first:
 * TEST BUG (an instance served no request: the probe did not reach both backends) > INVALID (invalidReasons) > FAIL (PRODUCT BUG,
 * a product invariant broke: orders above stock, a duplicate order for one cart, reservations or payments that disagree, an
 * unexplained order (a ghost), or an L9 mismatch) > PASS.
 */
export function classifySplit(input: {
  orders: number;
  stock: number;
  perInstance: InstanceCount[];
  duplicateCartOrders: number;
  reservationsMatchOrders: boolean;
  onePaymentPerOrder: boolean;
  perIntentReconciled: boolean;
  ghostOrders: number;
  invalidReasons: string[];
}): SplitVerdict {
  const base = { orders: input.orders, stock: input.stock, perInstance: input.perInstance };
  // each required instance has exactly one row: a missing or duplicated row is the probe's fault, never a pass
  const malformed = (["primary", "secondary"] as const).filter(
    (name) => input.perInstance.filter((r) => r.instance === name).length !== 1,
  );
  if (malformed.length > 0)
    return {
      ...base,
      verdict: "TEST BUG",
      reasons: [`TEST BUG: instance row(s) missing or duplicated: ${malformed.join(", ")}`],
    };
  const idle = input.perInstance.filter((i) => i.requests === 0).map((i) => i.instance);
  if (idle.length > 0)
    return {
      ...base,
      verdict: "TEST BUG",
      reasons: [
        `TEST BUG: instance(s) with no requests: ${idle.join(", ")} (the second instance did not receive load)`,
      ],
    };
  if (input.invalidReasons.length > 0)
    return { ...base, verdict: "INVALID", reasons: [...input.invalidReasons] };

  const failures: string[] = [];
  if (input.orders > input.stock)
    failures.push(`${input.orders} orders above stock ${input.stock}`);
  if (input.duplicateCartOrders !== 0)
    failures.push(`${input.duplicateCartOrders} cart(s) with more than one order`);
  if (!input.reservationsMatchOrders) failures.push("reservations differ from live orders");
  if (!input.onePaymentPerOrder) failures.push("an order without exactly one payment");
  if (!input.perIntentReconciled) failures.push("L9: counts by intent differ from the rows");
  if (input.ghostOrders !== 0)
    failures.push(`${input.ghostOrders} ghost order(s) no intent explains (L10)`);
  if (failures.length > 0) return { ...base, verdict: "FAIL (PRODUCT BUG)", reasons: failures };
  return {
    ...base,
    verdict: "PASS",
    reasons: [`${input.orders} orders within stock ${input.stock}, both instances served requests`],
  };
}
