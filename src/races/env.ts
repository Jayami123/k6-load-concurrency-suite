function requiredEnv(env: NodeJS.ProcessEnv, name: string): string {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") {
    throw new Error(`TEST BUG: ${name} is unset or empty`);
  }
  return raw.trim();
}

/**
 * Whole decimal integer in [min, max]. Rejects "3.5", "1e3", "3abc", "-1", "+2", "0x2" and, when min is 1, "0".
 * Unset or blank gives the default.
 */
function intFromEnv(
  env: NodeJS.ProcessEnv,
  name: string,
  defaultValue: number,
  min: number,
  max = Number.MAX_SAFE_INTEGER,
): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") return defaultValue;
  const trimmed = raw.trim();
  const n = (min === 0 ? /^(0|[1-9]\d*)$/ : /^[1-9]\d*$/).test(trimmed)
    ? Number(trimmed)
    : Number.NaN;
  if (!Number.isSafeInteger(n) || n < min || n > max) {
    const range = max === Number.MAX_SAFE_INTEGER ? `>= ${min}` : `between ${min} and ${max}`;
    throw new Error(`TEST BUG: ${name} must be an integer ${range}, got ${raw}`);
  }
  return n;
}

function positiveIntFromEnv(env: NodeJS.ProcessEnv, name: string, defaultValue: number): number {
  return intFromEnv(env, name, defaultValue, 1);
}

export function raceTrialsFromEnv(env: NodeJS.ProcessEnv = process.env): number {
  return positiveIntFromEnv(env, "RACE_TRIALS", 5);
}

export function raceMaxSpreadMsFromEnv(env: NodeJS.ProcessEnv = process.env): number {
  return positiveIntFromEnv(env, "RACE_MAX_SPREAD_MS", 5);
}

/** Reruns allowed per trial index when the dispatch spread is above the limit. */
export function raceMaxSpreadRerunsFromEnv(env: NodeJS.ProcessEnv = process.env): number {
  return positiveIntFromEnv(env, "RACE_MAX_SPREAD_RERUNS", 3);
}

/** Share of invalid attempts a case may use, in whole percent of the trials asked for (0 to 100). */
export function raceMaxInvalidSharePctFromEnv(env: NodeJS.ProcessEnv = process.env): number {
  return intFromEnv(env, "RACE_MAX_INVALID_SHARE_PCT", 20, 0, 100);
}

/** Invalid attempts a case may always spend, whatever the share gives for a small trial count. */
export function raceMinInvalidBudgetFromEnv(env: NodeJS.ProcessEnv = process.env): number {
  return intFromEnv(env, "RACE_MIN_INVALID_BUDGET", 2, 0);
}

/** Untimed warm-up bursts fired before trial 1 and left out of every verdict and count. 0 disables. */
export function raceWarmupBurstsFromEnv(env: NodeJS.ProcessEnv = process.env): number {
  return intFromEnv(env, "RACE_WARMUP_BURSTS", 1, 0);
}

export function medusaBaseUrlFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.MEDUSA_BASE_URL?.trim();
  return (raw && raw.length > 0 ? raw : "http://127.0.0.1:9000").replace(/\/$/, "");
}

/** Second Medusa backend, or undefined when the harness runs only one. 127.0.0.1 only, http, a different port. */
export function medusaSecondBaseUrlFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const raw = env.MEDUSA_SECOND_BASE_URL?.trim();
  if (!raw) return undefined;
  const url = raw.replace(/\/$/, "");
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`TEST BUG: MEDUSA_SECOND_BASE_URL is not a URL: ${raw}`);
  }
  if (parsed.protocol !== "http:" || parsed.hostname !== "127.0.0.1") {
    throw new Error(`TEST BUG: MEDUSA_SECOND_BASE_URL must be http://127.0.0.1:<port>, got ${raw}`);
  }
  const primary = new URL(medusaBaseUrlFromEnv(env));
  if (parsed.origin === primary.origin) {
    throw new Error("TEST BUG: MEDUSA_SECOND_BASE_URL equals MEDUSA_BASE_URL");
  }
  return url;
}

export type MedusaLockMode = "memory" | "redis";

/** Same default and spelling as the harness (medusa-env.ts parseMedusaHarnessSwitches): unset or blank is "memory". */
export function medusaLockModeFromEnv(env: NodeJS.ProcessEnv = process.env): MedusaLockMode {
  const raw = env.MEDUSA_LOCK?.trim();
  if (!raw) return "memory";
  if (raw === "memory" || raw === "redis") return raw;
  throw new Error(`TEST BUG: MEDUSA_LOCK must be "memory" or "redis", got ${raw}`);
}

export function medusaAdminEmailFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  return requiredEnv(env, "MEDUSA_ADMIN_EMAIL");
}

export function medusaAdminPasswordFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  return requiredEnv(env, "MEDUSA_ADMIN_PASSWORD");
}

export function medusaDatabaseUrlFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  const p6 = env.P6_MEDUSA_DATABASE_URL?.trim();
  if (p6) return p6;
  const harness = env.MEDUSA_DB_URL?.trim();
  if (harness) return harness;
  return "postgres://medusa:medusa@127.0.0.1:5433/medusa";
}

export function calBaseUrlFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.CAL_BASE_URL?.trim();
  return (raw && raw.length > 0 ? raw : "http://127.0.0.1:3000").replace(/\/$/, "");
}

export function calDatabaseUrlFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  const p6 = env.P6_CAL_DATABASE_URL?.trim();
  if (p6) return p6;
  const harness = env.CAL_DB_URL?.trim();
  if (harness) return harness;
  return "postgresql://postgres@127.0.0.1:5450/calendso";
}
