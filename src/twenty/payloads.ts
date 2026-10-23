import { randomBytes } from "node:crypto";

/** Company names carry the run prefix and a side, so the leak check can count them (D16). */
export function companyName(prefix: string, trial: number, side: string): string {
  return `${prefix}-${trial}-${side}`;
}

/** A throwaway member address under the seed workspace domain (probed in §3.6). The prefix comes first. */
export function throwawayAddress(prefix: string, trial: number): string {
  return `${prefix.toLowerCase()}-t${trial}-${randomBytes(3).toString("hex")}@apple.dev`;
}

/** A new password, generated in memory and never printed (D8). */
export function freshPassword(): string {
  return `P6-${randomBytes(9).toString("base64url")}-Pw1!`;
}
