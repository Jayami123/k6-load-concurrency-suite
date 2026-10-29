/** The two limiter profiles a Twenty load run can use (Twenty plan §2.6). */
export const LIMITER_PROFILE_NAMES = ["functional", "productionLike"] as const;
export type LimiterProfileName = (typeof LIMITER_PROFILE_NAMES)[number];

/**
 * The functional values (Twenty plan §6.3, Q5). The six exact names are the allowlist of the harness's H4
 * (node_modules/qa-portfolio-harness/src/adapters/twenty-rate-limits.ts). The limiter binds only API-key and application
 * spenders (P10), so these change results only for API-key cases.
 */
export const functional: Readonly<Record<string, string>> = Object.freeze({
  API_RATE_LIMITING_SHORT_TTL_IN_MS: "1000",
  API_RATE_LIMITING_SHORT_LIMIT: "100",
  API_RATE_LIMITING_LONG_TTL_IN_MS: "60000",
  API_RATE_LIMITING_LONG_LIMIT: "3600",
  APPLICATION_API_RATE_LIMITING_TTL_IN_MS: "60000",
  APPLICATION_API_RATE_LIMITING_LIMIT: "500",
});

/** The image defaults: nothing is set, so the containers keep the fork's own values. */
export const productionLike: Readonly<Record<string, string>> = Object.freeze({});

/** True when the value names a profile. The workflow passes the name as text, so the check runs before the lookup. */
export function isLimiterProfileName(value: string): value is LimiterProfileName {
  return (LIMITER_PROFILE_NAMES as readonly string[]).includes(value);
}

/** A copy of the chosen profile's environment. Any other name is a TEST BUG. */
export function limiterProfileEnv(name: LimiterProfileName): Record<string, string> {
  if (name === "functional") return { ...functional };
  if (name === "productionLike") return { ...productionLike };
  throw new Error(`TEST BUG: unknown limiter profile ${String(name)}`);
}
