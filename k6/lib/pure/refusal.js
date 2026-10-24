// Pure classifier of one checkout reply (plan task 8 §6.2). No k6 import: the journey passes the reply's status, type and message.

/**
 * @param {number} status
 * @param {unknown} type the reply's `type` field, when the body is JSON
 * @param {unknown} message the reply's `message` field, when the body is JSON
 * @returns {"order" | "clean" | "ghost" | "other"}
 */
export function classifyRefusal(status, type, message) {
  if (status === 200 && type === "order") return "order";
  if (status === 400 && type === "not_allowed") {
    const m = String(message || "");
    if (/Updating Status from ".*" to ".*" is not allowed/.test(m)) return "ghost"; // F-M2 / F-M5 mechanism
    if (/Not enough stock|Insufficient inventory/i.test(m)) return "clean"; // loser at line item or at complete
  }
  return "other"; // anything else (including every 5xx)
}
