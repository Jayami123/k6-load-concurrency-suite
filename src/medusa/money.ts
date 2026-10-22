// Whole-unit money. Amounts are integers in the Medusa order currency unit (plan §7.3).
export function parseWholeAmount(value: string | number, label: string): number {
  const text = String(value);
  if (!/^-?\d+$/.test(text)) {
    throw new Error(`TEST BUG: ${label} is not a whole amount: ${text}`);
  }
  const n = Number(text);
  if (!Number.isSafeInteger(n)) {
    throw new Error(`TEST BUG: ${label} is outside the safe integer range: ${text}`);
  }
  return n;
}
