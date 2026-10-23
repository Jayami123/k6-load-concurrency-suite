export type PrivateLinkInput = { link: string; maxUsageCount: number };

/** Pure. Lower-case, URL-safe, unique per case and attempt. The link column is unique, so the id must not repeat. */
export function privateLinkId(casePrefixValue: string, trial: number): string {
  return `${casePrefixValue}-t${trial}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");
}

/** Pure. The batch body the tRPC client sends for `eventTypesHeavy/update` (step 0 route, section 3.2). */
export function multiplePrivateLinksBody(
  eventTypeId: number,
  links: PrivateLinkInput[],
): Record<string, { json: { id: number; multiplePrivateLinks: PrivateLinkInput[] } }> {
  return { "0": { json: { id: eventTypeId, multiplePrivateLinks: links } } };
}

/** Sets the event type's whole link list (replace semantics). Throws TEST BUG unless HTTP 200. */
export async function setPrivateLinks(
  baseUrl: string,
  cookie: string,
  eventTypeId: number,
  links: PrivateLinkInput[],
): Promise<void> {
  const res = await fetch(`${baseUrl}/api/trpc/eventTypesHeavy/update?batch=1`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(multiplePrivateLinksBody(eventTypeId, links)),
  });
  if (res.status !== 200)
    throw new Error(`TEST BUG: setting private links answered HTTP ${res.status}`);
}

/** Removes every link of the event type. */
export async function clearPrivateLinks(
  baseUrl: string,
  cookie: string,
  eventTypeId: number,
): Promise<void> {
  await setPrivateLinks(baseUrl, cookie, eventTypeId, []);
}
