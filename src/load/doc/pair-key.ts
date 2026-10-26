// The concurrent pair key of P6-DOC-LOAD-003 (plan Phase 4b task 9 §6.3). Pure.

/** The key of one concurrent pair: `${documentId}:${pairId}`. Two rows with the same key are one pair with a duplicate, never two pairs. */
export function pairKey(documentId: string, pairId: string): string {
  return `${documentId}:${pairId}`;
}

/**
 * Duplicates per pair key: for each key, the count of seal and audit rows beyond the first (0 for a pair with one row of each kind).
 * Rows are side effects of one document; a document with two seal jobs is counted once under P6-OBS-DOC-002 by its pair key.
 */
export function pairCounts(
  rows: Array<{ documentId: string; pairId: string; kind: "seal" | "audit" }>,
): Map<string, { seal: number; audit: number }> {
  const seen = new Map<string, { seal: number; audit: number }>();
  for (const r of rows) {
    const key = pairKey(r.documentId, r.pairId);
    const c = seen.get(key) ?? { seal: 0, audit: 0 };
    c[r.kind] += 1;
    seen.set(key, c);
  }
  const out = new Map<string, { seal: number; audit: number }>();
  for (const [key, c] of seen)
    out.set(key, { seal: Math.max(0, c.seal - 1), audit: Math.max(0, c.audit - 1) });
  return out;
}
