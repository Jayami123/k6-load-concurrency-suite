import { completeBody, signFieldBody, signingTokenFromUrl } from "./payloads.ts";

export type HttpResult = { status: number; text: string; ms: number };

function parse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function timed(url: string, init: RequestInit): Promise<HttpResult> {
  const started = performance.now();
  const res = await fetch(url, init);
  const text = await res.text();
  return { status: res.status, text, ms: performance.now() - started };
}

/** Status-only failure. 5xx is a PRODUCT BUG, 429 is ENV (limiter not bypassed), other codes are TEST BUG. */
export function expectOk(label: string, res: HttpResult): void {
  if (res.status === 200) return;
  const kind = res.status >= 500 ? "PRODUCT BUG" : res.status === 429 ? "ENV" : "TEST BUG";
  throw new Error(`${kind}: ${label} HTTP ${res.status}`);
}

export async function v2Post(
  baseUrl: string,
  token: string,
  path: string,
  body: unknown,
): Promise<HttpResult> {
  return timed(`${baseUrl}/api/v2${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function createEnvelope(
  baseUrl: string,
  token: string,
  title: string,
  pdf: Uint8Array,
): Promise<string> {
  const form = new FormData();
  form.append("payload", JSON.stringify({ title, type: "DOCUMENT" }));
  form.append("files", new File([pdf], "example.pdf", { type: "application/pdf" }));
  const res = await timed(`${baseUrl}/api/v2/envelope/create`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: form,
  });
  expectOk("envelope/create", res);
  const id = (parse(res.text) as { id?: unknown } | null)?.id;
  if (typeof id !== "string") throw new Error("TEST BUG: envelope/create returned no id");
  return id;
}

/** Numeric recipient ids, in request order. */
export async function createRecipients(
  baseUrl: string,
  token: string,
  envelopeId: string,
  bodies: Array<Record<string, unknown>>,
): Promise<number[]> {
  const res = await v2Post(baseUrl, token, "/envelope/recipient/create-many", {
    envelopeId,
    data: bodies,
  });
  expectOk("recipient/create-many", res);
  const data = (parse(res.text) as { data?: Array<{ id?: unknown }> } | null)?.data ?? [];
  if (data.length !== bodies.length || data.some((r) => typeof r.id !== "number")) {
    throw new Error("TEST BUG: recipient/create-many returned an unexpected shape");
  }
  return data.map((r) => r.id as number);
}

export async function getEnvelope(
  baseUrl: string,
  token: string,
  envelopeId: string,
): Promise<{ itemId: string; secondaryId: string }> {
  const res = await timed(`${baseUrl}/api/v2/envelope/${envelopeId}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  expectOk("envelope GET", res);
  const json = parse(res.text) as {
    envelopeItems?: Array<{ id?: unknown }>;
    secondaryId?: unknown;
  } | null;
  const itemId = json?.envelopeItems?.[0]?.id;
  if (typeof itemId !== "string" || typeof json?.secondaryId !== "string") {
    throw new Error("TEST BUG: envelope GET has no item id or secondaryId");
  }
  return { itemId, secondaryId: json.secondaryId };
}

/** `Field.id` (used by signFieldWithToken) and the recipient each field belongs to. */
export async function createSignatureFields(
  baseUrl: string,
  token: string,
  envelopeId: string,
  bodies: Array<Record<string, unknown>>,
): Promise<Array<{ id: number; recipientId: number }>> {
  const res = await v2Post(baseUrl, token, "/envelope/field/create-many", {
    envelopeId,
    data: bodies,
  });
  expectOk("field/create-many", res);
  const data =
    (parse(res.text) as { data?: Array<{ id?: unknown; recipientId?: unknown }> } | null)?.data ??
    [];
  if (
    data.length !== bodies.length ||
    data.some((f) => typeof f.id !== "number" || typeof f.recipientId !== "number")
  ) {
    throw new Error("TEST BUG: field/create-many returned an unexpected shape");
  }
  return data as Array<{ id: number; recipientId: number }>;
}

/** Signing token per recipient id (from signingUrl). Keyed by id, never by position. */
export async function distribute(
  baseUrl: string,
  token: string,
  envelopeId: string,
): Promise<Map<number, string>> {
  const res = await v2Post(baseUrl, token, "/envelope/distribute", { envelopeId });
  expectOk("distribute", res);
  const recipients =
    (parse(res.text) as { recipients?: Array<{ id?: unknown; signingUrl?: unknown }> } | null)
      ?.recipients ?? [];
  const tokens = new Map<number, string>();
  for (const r of recipients) {
    if (typeof r.id !== "number" || typeof r.signingUrl !== "string") {
      throw new Error("TEST BUG: distribute returned an unexpected shape");
    }
    tokens.set(r.id, signingTokenFromUrl(r.signingUrl));
  }
  return tokens;
}

/** Returns the HTTP status. The caller decides; 200 is expected. */
export async function deleteEnvelope(
  baseUrl: string,
  token: string,
  envelopeId: string,
): Promise<number> {
  return (await v2Post(baseUrl, token, "/envelope/delete", { envelopeId })).status;
}

// Recipient-token calls: what the signing page sends. No cookie, no API token.

async function trpcMutation(baseUrl: string, proc: string, json: unknown): Promise<HttpResult> {
  return timed(`${baseUrl}/api/trpc/${proc}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ json }),
  });
}

export function signFieldWithToken(
  baseUrl: string,
  token: string,
  fieldId: number,
  value: string,
): Promise<HttpResult> {
  return trpcMutation(baseUrl, "field.signFieldWithToken", signFieldBody(token, fieldId, value));
}

export function completeWithToken(
  baseUrl: string,
  token: string,
  documentId: number,
): Promise<HttpResult> {
  return trpcMutation(
    baseUrl,
    "recipient.completeDocumentWithToken",
    completeBody(token, documentId),
  );
}
