import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Reads the seeded host password from the fork's seed text. The value is read at run time and never printed,
 * logged or written to a file (D-C6, owner O4). Throws TEST BUG when the user's line is missing.
 */
export function extractHostPassword(seedText: string, email = "pro@example.com"): string {
  const escaped = email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = seedText.match(
    new RegExp(`email: "${escaped}",[\\s\\S]{0,200}?password: "([^"]+)"`),
  );
  if (!match?.[1]) throw new Error(`TEST BUG: seed password for ${email} not found`);
  return match[1];
}

/**
 * Logs in through NextAuth credentials and returns a cookie header for later calls. Throws TEST BUG unless the
 * login answers 200 and sets a session cookie. Never logs the password.
 */
export async function loginAsHost(
  baseUrl: string,
  password: string,
  email = "pro@example.com",
): Promise<string> {
  const jar = new Map<string, string>();
  const keep = (res: Response) => {
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(";");
      const i = pair!.indexOf("=");
      jar.set(pair!.slice(0, i), pair!.slice(i + 1));
    }
  };
  const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");

  const csrfRes = await fetch(`${baseUrl}/api/auth/csrf`);
  keep(csrfRes);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };

  const loginRes = await fetch(`${baseUrl}/api/auth/callback/credentials`, {
    method: "POST",
    redirect: "manual",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookieHeader() },
    body: new URLSearchParams({ csrfToken, email, password, json: "true" }),
  });
  keep(loginRes);
  const hasSession = [...jar.keys()].some((k) => k.includes("session-token"));
  if (loginRes.status !== 200 || !hasSession) {
    throw new Error(
      `TEST BUG: host login answered HTTP ${loginRes.status} without a session cookie`,
    );
  }
  return cookieHeader();
}

/** The host password from the fork's seed file under PRODUCTS_ROOT (the root the harness uses). Never printed. */
export function hostPasswordFromProducts(env: NodeJS.ProcessEnv = process.env): string {
  const root = env.PRODUCTS_ROOT?.trim() || "../products";
  const seed = readFileSync(path.resolve(process.cwd(), root, "cal", "scripts", "seed.ts"), "utf8");
  return extractHostPassword(seed);
}
