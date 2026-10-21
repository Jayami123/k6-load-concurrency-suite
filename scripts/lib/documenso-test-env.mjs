// Pure: the SSRF bypass host for a Documenso harness run (plan D2/D4). An explicit value wins;
// otherwise it is the P6 webhook host, so the allowlist matches the host the self-test resolves.
/**
 * @param {NodeJS.ProcessEnv} env
 * @returns {string}
 */
export function ssrfBypassHostsDefault(env) {
  const explicit = env.NEXT_PRIVATE_WEBHOOK_SSRF_BYPASS_HOSTS;
  if (explicit) return explicit;
  return env.P6_WEBHOOK_HOST?.trim().toLowerCase() || "p6-webhook.test";
}
