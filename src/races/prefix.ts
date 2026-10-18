import { randomBytes } from "node:crypto";

const PREFIX_RE = /^p6-qa-\d{8}T\d{6}Z-[0-9a-f]{8}$/;

export function p6RunPrefix(now = new Date()): string {
  const iso = now.toISOString();
  const utc =
    iso.slice(0, 4) +
    iso.slice(5, 7) +
    iso.slice(8, 10) +
    "T" +
    iso.slice(11, 13) +
    iso.slice(14, 16) +
    iso.slice(17, 19) +
    "Z";
  const hex = randomBytes(4).toString("hex");
  return `p6-qa-${utc}-${hex}`;
}

export function isP6RunPrefix(value: string): boolean {
  return PREFIX_RE.test(value);
}
