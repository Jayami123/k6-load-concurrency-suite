// Pure slot helpers of the Cal knee (plan task 2 §6.2). No k6 import.
const DAY = 86400000;

/**
 * The target start of iteration n; undefined when the supply is exhausted (the journey then fails its getSchedule step, which the
 * knee stage reports as a TEST BUG: supply).
 * @param {string[]} starts ISO starts, ascending, unique
 * @param {number} n exec.scenario.iterationInTest
 * @returns {string | undefined}
 */
export function slotFor(starts, n) {
  return starts[n];
}

/**
 * The getSchedule window of one iteration: `days` days from 00:00 UTC of the target's day (constant cost per iteration).
 * @param {string} target
 * @param {number} days
 * @returns {{ startTime: string, endTime: string }}
 */
export function scheduleWindow(target, days) {
  const day = Math.floor(Date.parse(target) / DAY) * DAY;
  return {
    startTime: new Date(day).toISOString(),
    endTime: new Date(day + days * DAY).toISOString(),
  };
}
