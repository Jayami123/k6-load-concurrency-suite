// The promo ledger under load (plan Phase 4b task 10 §6.3). Pure: the caller reads the snapshots. The gift-card clause is pending
// (M10-5): it is always reported PENDING, never PASS.

export interface LedgerInput {
  redemptions: number; // orders that carried the promotion
  promoLimit: number; // the promotion's usage limit from setup
  balances: number[]; // the money balances after the run
  debitsSum: number; // the sum of the debits from the orders
  balanceChange: number | null; // the change of the balance from the start to the end of the run (a debit lowers it, so it equals minus the debits); null when no source independent of the debits exists
}

export interface LedgerVerdict {
  clauses: Array<{
    name: "redemptions-le-budget" | "balances-ge-zero" | "debits-equal-change" | "gift-card";
    status: "PASS" | "FAIL (PRODUCT BUG)" | "PENDING";
    detail: string;
  }>;
  verdict: "PASS" | "FAIL (PRODUCT BUG)" | "TEST BUG" | "PASS (gift-card pending)";
}

/** The landed clauses are checked; the gift-card clause is PENDING (M10-5). A run with no balances is a TEST BUG, never a pass. */
export function promoLedgerVerdict(input: LedgerInput): LedgerVerdict {
  if (input.balances.length === 0 || !Number.isFinite(input.promoLimit))
    return {
      clauses: [],
      verdict: "TEST BUG",
    };
  const clauses: LedgerVerdict["clauses"] = [];
  const within = input.redemptions <= input.promoLimit;
  clauses.push({
    name: "redemptions-le-budget",
    status: within ? "PASS" : "FAIL (PRODUCT BUG)",
    detail: `${input.redemptions} redemptions against a limit of ${input.promoLimit}`,
  });
  const minBalance = Math.min(...input.balances);
  clauses.push({
    name: "balances-ge-zero",
    status: minBalance >= 0 ? "PASS" : "FAIL (PRODUCT BUG)",
    detail: `lowest balance ${minBalance}`,
  });
  if (input.balanceChange === null)
    // a balance change derived from the same debits would always agree with them, so the clause is not checked
    clauses.push({
      name: "debits-equal-change",
      status: "PENDING",
      detail: `debits ${input.debitsSum}, no independent balance change at the pinned ref`,
    });
  else {
    const reconciled = input.debitsSum === -input.balanceChange;
    clauses.push({
      name: "debits-equal-change",
      status: reconciled ? "PASS" : "FAIL (PRODUCT BUG)",
      detail: `debits ${input.debitsSum}, balance change ${input.balanceChange}`,
    });
  }
  clauses.push({
    name: "gift-card",
    status: "PENDING",
    detail: "gift-card clause pending (M10-5, Phase 2 line 101)",
  });
  const failed = clauses.some((c) => c.status === "FAIL (PRODUCT BUG)");
  return { clauses, verdict: failed ? "FAIL (PRODUCT BUG)" : "PASS (gift-card pending)" };
}
