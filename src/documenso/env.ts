const strip = (u: string) => u.replace(/\/$/, "");
const val = (env: NodeJS.ProcessEnv, name: string) => env[name]?.trim() || undefined;

export function documensoBaseUrlFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  return strip(val(env, "DOCUMENSO_BASE_URL") ?? "http://127.0.0.1:3001");
}

export function documensoDatabaseUrlFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  return (
    val(env, "P6_DOCUMENSO_DATABASE_URL") ??
    val(env, "DOCUMENSO_DB_URL") ??
    // Harness compose's local placeholder (docker/documenso.compose.yml). Not a secret.
    "postgres://documenso:password@127.0.0.1:5451/documenso"
  );
}

export function inbucketBaseUrlFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  return strip(val(env, "INBUCKET_BASE_URL") ?? "http://127.0.0.1:9003");
}

/** A hostname (not an IP, not localhost): Documenso's create-time check refuses those (plan §2.6). */
export function webhookHostFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  const host = (val(env, "P6_WEBHOOK_HOST") ?? "p6-webhook.test").toLowerCase();
  if (
    !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ||
    /^\d+(\.\d+){3}$/.test(host) ||
    host === "localhost"
  ) {
    throw new Error(
      `TEST BUG: P6_WEBHOOK_HOST must be a dotted hostname, not an IP or localhost (got ${host})`,
    );
  }
  return host;
}
