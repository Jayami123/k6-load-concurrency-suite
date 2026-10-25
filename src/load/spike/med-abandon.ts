// The Medusa abandoned-cart check (P6-MED-LOAD-010, Phase 4 Task 6 §6.4). Pure: the audit snapshot and the probe purchase come from the stage.

/** Every fourth iteration (n % 4 === 3) stops before "complete": the k6 journey (med-checkout.js, opts.abandon) uses the same rule. */
export function isAbandoned(iteration: number): boolean {
  return iteration % 4 === 3;
}

export interface AbandonInput {
  abandoned: number;
  orders: number;
  reservationRowsLive: number;
  reservedQuantity: number;
  stock: number;
  /** HTTP status of the probe purchase made after the spike through the store API, or undefined when it was not made. */
  probeStatus?: number;
}

export interface AbandonFinding {
  ok: boolean;
  findings: string[]; // each one is PRODUCT BUG (SUSPECTED) when present
}

/**
 * Reservations are made at completion only, and a cancelled order soft-deletes its reservation: so an abandoned cart holds none.
 * Live reservation rows and reserved quantity must equal the orders, available stock must not go negative, and a probe purchase
 * while stock is left must succeed.
 */
export function judgeAbandon(input: AbandonInput): AbandonFinding {
  const findings: string[] = [];
  if (input.reservationRowsLive !== input.orders)
    findings.push(
      `reservation rows ${input.reservationRowsLive} differ from orders ${input.orders} (a reservation for an abandoned cart?)`,
    );
  if (input.reservedQuantity !== input.orders)
    findings.push(
      `reserved quantity ${input.reservedQuantity} differs from orders ${input.orders}`,
    );
  const available = input.stock - input.orders;
  if (available < 0) findings.push(`available ${available} is negative`);
  if (input.probeStatus !== undefined && input.probeStatus !== 200 && available > 0)
    findings.push(
      `probe purchase answered ${input.probeStatus} with ${available} left: abandoned carts block stock`,
    );
  return { ok: findings.length === 0, findings };
}
