// Documenso envelopes by intent (plan task 4 §6.4). The intent of an envelope is the number in its title. Pure.

export const SUFFIX = " journey";

/** "<prefix>-i<n> journey" → n (k6/journeys/doc-sign.js:37); undefined for another prefix, another suffix or a leaf that is not a whole number. */
export function docIntentOf(prefix: string, title: string): number | undefined {
  const head = `${prefix}-i`;
  if (!title.startsWith(head) || !title.endsWith(SUFFIX)) return undefined;
  const digits = title.slice(head.length, title.length - SUFFIX.length);
  return /^\d+$/.test(digits) ? Number(digits) : undefined;
}

/**
 * Envelopes per intent, split by completed and unfinished; an envelope of no intent is a ghost row. Each envelope counts once,
 * so two envelopes of one intent are two rows in `rowsByIntent`.
 */
export function docRowsByIntent(
  rows: Array<{ title: string; completed: boolean }>,
  prefix: string,
): {
  rowsByIntent: Map<number, number>;
  unfinishedByIntent: Map<number, number>;
  ghostRows: number;
} {
  const rowsByIntent = new Map<number, number>();
  const unfinishedByIntent = new Map<number, number>();
  let ghostRows = 0;
  for (const row of rows) {
    const intent = docIntentOf(prefix, row.title);
    if (intent === undefined) {
      ghostRows += 1;
      continue;
    }
    rowsByIntent.set(intent, (rowsByIntent.get(intent) ?? 0) + 1);
    if (!row.completed) unfinishedByIntent.set(intent, (unfinishedByIntent.get(intent) ?? 0) + 1);
  }
  return { rowsByIntent, unfinishedByIntent, ghostRows };
}
