// Pure run-prefix and data-naming helpers. The runner passes the run prefix in; the library never makes one.
export const RUN_PREFIX_RE = /^p6-qa-\d{8}T\d{6}Z-[0-9a-f]{8}$/; // same as src/races/prefix.ts

/**
 * @param {string} prefix
 * @returns {string}
 */
export function assertRunPrefix(prefix) {
  if (!RUN_PREFIX_RE.test(prefix)) throw new Error(`not a P6 run prefix: ${prefix}`);
  return prefix;
}

/**
 * Case-scoped, lower-case, [a-z0-9-] only (the leak-check LIKE literal rule of src/medusa/payloads.ts casePrefix).
 * @param {string} runPrefix
 * @param {string} caseId
 * @returns {string}
 */
export function caseDataPrefix(runPrefix, caseId) {
  const p = `${assertRunPrefix(runPrefix)}-${caseId}`.toLowerCase();
  if (!/^[a-z0-9-]+$/.test(p)) throw new Error(`case prefix "${p}" is not [a-z0-9-]`);
  return p;
}

/**
 * One id per iteration and VU-independent: the scenario's global iteration counter makes it unique across VUs.
 * @param {string} dataPrefix
 * @param {number} iterationInTest
 * @returns {string}
 */
export function iterationId(dataPrefix, iterationInTest) {
  return `${dataPrefix}-i${iterationInTest}`;
}

/**
 * @param {string} dataPrefix
 * @param {string} leaf
 * @param {string} [domain]
 * @returns {string}
 */
export function attendeeEmail(dataPrefix, leaf, domain = "example.com") {
  return `${dataPrefix}-${leaf}@${domain}`;
}
