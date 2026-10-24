import { parseLoadConfig } from "./pure/config.js";

/**
 * Reads P6_LOAD_CONFIG (a JSON file path, written by the runner or by hand for a standalone run). Must be called in the init context.
 * @param {string[]} [required]
 * @param {Record<string, string>} [envMap]
 * @returns {Record<string, any>}
 */
export function loadLoadConfig(required = [], envMap = {}) {
  const path = __ENV.P6_LOAD_CONFIG;
  return parseLoadConfig(path ? open(path) : "", __ENV, required, envMap);
}
