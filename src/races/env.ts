function requiredEnv(env: NodeJS.ProcessEnv, name: string): string {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") {
    throw new Error(`TEST BUG: ${name} is unset or empty`);
  }
  return raw.trim();
}

function positiveIntFromEnv(env: NodeJS.ProcessEnv, name: string, defaultValue: number): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") return defaultValue;
  const trimmed = raw.trim();
  // Whole value must be a positive decimal integer: rejects "3.5", "1e3", "3abc", "0", "-1".
  const n = /^[1-9]\d*$/.test(trimmed) ? Number(trimmed) : Number.NaN;
  if (!Number.isSafeInteger(n)) {
    throw new Error(`TEST BUG: ${name} must be an integer >= 1, got ${raw}`);
  }
  return n;
}

export function raceTrialsFromEnv(env: NodeJS.ProcessEnv = process.env): number {
  return positiveIntFromEnv(env, "RACE_TRIALS", 5);
}

export function raceMaxSpreadMsFromEnv(env: NodeJS.ProcessEnv = process.env): number {
  return positiveIntFromEnv(env, "RACE_MAX_SPREAD_MS", 5);
}

export function medusaBaseUrlFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.MEDUSA_BASE_URL?.trim();
  return (raw && raw.length > 0 ? raw : "http://127.0.0.1:9000").replace(/\/$/, "");
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
