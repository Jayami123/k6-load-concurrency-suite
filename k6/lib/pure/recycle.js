// Pure: the slot index of the recycle pool (plan Phase 4b task 7 §6.3). No k6 import.

/**
 * The slot of iteration i in a pool of `size` slots. A slot is reused after `size` other iterations. It is free again only if its
 * own iteration finished the cancel within `size / rate` seconds. Sizing rule: `size >= rate x worst-case iteration seconds`, and
 * every request has a per-request timeout below `size / rate` (Cal: P = 50 at 4 per second gives 12.5 s, against a 2 s worst case).
 * @param {number} iteration  the iteration index (exec.scenario.iterationInTest)
 * @param {number} size       the pool size P (>= 1)
 * @returns {number}          index into the pool, 0 <= i < size
 */
export function recycleSlotIndex(iteration, size) {
  if (!Number.isInteger(size) || size < 1)
    throw new Error("TEST BUG: recycle pool size must be an integer >= 1");
  return iteration % size;
}
