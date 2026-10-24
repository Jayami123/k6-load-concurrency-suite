// Pure part of the config reader. Input: the JSON text of P6_LOAD_CONFIG (or "") and the environment.
const NUMERIC_KEYS = new Set([
  "rate",
  "durationSec",
  "maxLatencyMs",
  "pre",
  "maxVUs",
  "port",
  "stock",
]);

/**
 * Config the runner wrote (k6-config.json) with environment values (via envMap) taking precedence. Throws on a missing required key or a non-numeric number.
 * envMap maps a config key to an environment name. An environment value, when set and non-empty, wins over the file value; it is parsed
 * to a number when the key is numeric, else kept as text.
 * @param {string} text
 * @param {Record<string, string | undefined>} env
 * @param {string[]} [required]
 * @param {Record<string, string>} [envMap]
 * @returns {Record<string, unknown>}
 */
export function parseLoadConfig(text, env, required = [], envMap = {}) {
  /** @type {Record<string, unknown>} */
  const cfg = text ? JSON.parse(text) : {};
  for (const [key, name] of Object.entries(envMap)) {
    const raw = env[name];
    if (raw === undefined || raw === "") continue;
    if (typeof cfg[key] === "number" || NUMERIC_KEYS.has(key)) {
      const n = Number(raw);
      if (!Number.isFinite(n)) throw new Error(`load config ${name} is not a number`);
      cfg[key] = n;
    } else cfg[key] = raw;
  }
  // Numeric keys from the file are validated and normalised too, whether or not an env value was set.
  for (const key of NUMERIC_KEYS) {
    if (cfg[key] === undefined) continue;
    const value = cfg[key];
    const n =
      typeof value === "number"
        ? value
        : typeof value === "string" && value.trim() !== ""
          ? Number(value)
          : Number.NaN;
    if (!Number.isFinite(n)) throw new Error(`load config ${key} is not a finite number`);
    cfg[key] = n;
  }
  for (const key of required)
    if (cfg[key] === undefined) throw new Error(`missing load config key ${key}`);
  return cfg;
}
