// Pure: the instance that serves iteration i of the two-instance case (plan Phase 4b task 10 §6.2). No k6 import.

/**
 * The instance of iteration i: primary for even i, secondary for odd i, so the two instances alternate and each serves half the stream.
 * @param {number} i the iteration index (>= 0)
 * @returns {"primary" | "secondary"}
 */
export function instanceFor(i) {
  if (!Number.isInteger(i) || i < 0)
    throw new Error("TEST BUG: iteration index must be an integer >= 0");
  return i % 2 === 0 ? "primary" : "secondary";
}
