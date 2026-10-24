import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Mirrors scripts/harness.mjs: loads .env when present (values already in the environment win), defaults PRODUCTS_ROOT next to the repo,
 * and sets MEDUSA_SKIP_STOREFRONT=1. Called once by the CLI before any stage.
 */
export function loadRepoEnv(root = process.cwd(), env: NodeJS.ProcessEnv = process.env): void {
  const file = path.join(root, ".env");
  if (existsSync(file)) process.loadEnvFile(file);
  if (!env.PRODUCTS_ROOT) env.PRODUCTS_ROOT = path.resolve(root, "..", "products");
  if (!env.MEDUSA_SKIP_STOREFRONT) env.MEDUSA_SKIP_STOREFRONT = "1";
}
