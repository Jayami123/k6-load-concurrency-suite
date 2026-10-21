// Pure request bodies and parsers for the Documenso completion races (plan §8.1). No I/O.

export type RecipientBody = {
  email: string;
  name: string;
  role: "SIGNER";
  accessAuth: [];
  actionAuth: [];
};

/** One recipient mailbox per trial (plan D19). Lowercase, so Inbucket's mailbox name is stable. */
export function recipientEmail(casePfx: string, trial: number, index: number): string {
  return `${casePfx}-t${trial}-r${index}@example.com`;
}

export function recipientBodies(casePfx: string, trial: number, count: number): RecipientBody[] {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error("TEST BUG: recipientBodies count must be an integer >= 1");
  }
  return Array.from({ length: count }, (_, index) => ({
    email: recipientEmail(casePfx, trial, index),
    name: `P6 Signer ${index}`,
    role: "SIGNER" as const,
    accessAuth: [] as [],
    actionAuth: [] as [],
  }));
}

/** Document title. The case prefix comes first so the leak LIKE pattern matches it (plan §9). */
export function documentTitle(casePfx: string, trial: number, label: string): string {
  return `${casePfx} t${trial} ${label}`;
}

/**
 * One SIGNATURE field per recipient on page 1. Positions and sizes are percent (max 100, plan §2.3):
 * with positionY = 10 + 20 * index, at most five recipients fit.
 */
export function signatureFieldBodies(input: {
  envelopeItemId: string;
  recipientIds: number[];
}): Array<Record<string, unknown>> {
  if (input.recipientIds.length > 5) {
    throw new Error("TEST BUG: more than five recipients do not fit the field layout");
  }
  return input.recipientIds.map((recipientId, index) => ({
    recipientId,
    envelopeItemId: input.envelopeItemId,
    type: "SIGNATURE",
    page: 1,
    positionX: 10,
    positionY: 10 + index * 20,
    width: 20,
    height: 5,
  }));
}

/** Plain text for a SIGNATURE field (accepted with isBase64 false, plan §2.4). */
export function signValue(index: number): string {
  return `P6 Signer ${index}`;
}

export function signFieldBody(token: string, fieldId: number, value: string) {
  return { token, fieldId, value, isBase64: false };
}

export function completeBody(token: string, documentId: number) {
  return { token, documentId };
}

/** `document_1018` becomes 1018. Anything else is a TEST BUG: the completion route needs the legacy number. */
export function legacyDocumentId(secondaryId: string): number {
  const match = /^document_(\d+)$/.exec(secondaryId);
  if (!match)
    throw new Error(`TEST BUG: secondaryId is not document_<n>: ${secondaryId.slice(0, 40)}`);
  return Number(match[1]);
}

/** Last path segment of `…/sign/<token>`. The token is never logged. */
export function signingTokenFromUrl(signingUrl: string): string {
  const token = /\/sign\/([A-Za-z0-9_-]+)$/.exec(signingUrl)?.[1];
  if (!token) throw new Error("TEST BUG: distribute signingUrl has no /sign/<token>");
  return token;
}
