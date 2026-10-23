import { TWENTY_DEFAULT_ADMIN_EMAIL, TWENTY_DEV_SEED_PASSWORD } from "qa-portfolio-harness";

const strip = (u: string) => u.replace(/\/$/, "");
const val = (env: NodeJS.ProcessEnv, name: string) => env[name]?.trim() || undefined;

/** Harness address (harness docker/twenty.compose.yml maps the app to 3002). */
export function twentyBaseUrlFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  const url = strip(val(env, "TWENTY_BASE_URL") ?? "http://127.0.0.1:3002");
  const { protocol, hostname } = new URL(url);
  const loopback = hostname === "127.0.0.1" || hostname === "localhost" || hostname === "[::1]";
  // The login and the bearer token are sent to this URL, so cleartext is allowed only on loopback.
  if (protocol === "http:" && !loopback) {
    throw new Error(
      "ENV: TWENTY_BASE_URL must use https:// unless it is a loopback address (credentials are sent to it)",
    );
  }
  return url;
}

/** P6 override first, then the harness variable, then the harness default (published on 5434). Not a secret. */
export function twentyDatabaseUrlFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  return (
    val(env, "P6_TWENTY_DATABASE_URL") ??
    val(env, "TWENTY_DB_URL") ??
    "postgres://postgres:postgres@127.0.0.1:5434/default"
  );
}

/** Seed workspace subdomain (core.workspace.subdomain). */
export function twentySubdomainFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  return val(env, "P6_TWENTY_SUBDOMAIN") ?? "apple";
}

/** Seed workspace display name, as signIn lists it. */
export function twentyWorkspaceNameFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  return val(env, "P6_TWENTY_WORKSPACE_NAME") ?? "Apple";
}

/** TWENTY_EMAIL when set and not blank, else the harness export (owner decision O-T2). */
export function twentyEmailFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  return val(env, "TWENTY_EMAIL") ?? TWENTY_DEFAULT_ADMIN_EMAIL;
}

/** TWENTY_PASSWORD when set and not blank, else the harness export. Returned only, never logged. */
export function twentyPasswordFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  return val(env, "TWENTY_PASSWORD") ?? TWENTY_DEV_SEED_PASSWORD;
}
