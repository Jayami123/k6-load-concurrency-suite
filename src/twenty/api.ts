export interface RestResult {
  status: number;
  json: unknown;
  text: string;
}

export interface GraphqlResult {
  status: number;
  json: { data?: unknown; errors?: Array<{ message: string }> } | null;
  text: string;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** REST call with the workspace token. Never throws on a status: the caller maps it (D10). */
export async function restCall(
  base: string,
  authorizationHeader: string,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
  fetchImpl: typeof fetch = fetch,
): Promise<RestResult> {
  const res = await fetchImpl(`${base}/rest${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: authorizationHeader },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, json: safeJson(text), text };
}

/** GraphQL call that does not throw on `errors`: the caller decides (a replay is an expected error). */
export async function graphqlCall(
  base: string,
  path: "/metadata" | "/graphql",
  query: string,
  variables: Record<string, unknown>,
  authorizationHeader?: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GraphqlResult> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authorizationHeader) headers.Authorization = authorizationHeader;
  const res = await fetchImpl(`${base}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables }),
  });
  const text = await res.text();
  return { status: res.status, json: safeJson(text) as GraphqlResult["json"], text };
}

export async function createCompany(
  base: string,
  auth: string,
  name: string,
): Promise<RestResult & { id: string | undefined }> {
  const r = await restCall(base, auth, "POST", "/companies", { name });
  const id = (r.json as { data?: { createCompany?: { id?: string } } } | null)?.data?.createCompany
    ?.id;
  return { ...r, id };
}

export const patchCompany = (
  base: string,
  auth: string,
  id: string,
  data: Record<string, unknown>,
) => restCall(base, auth, "PATCH", `/companies/${id}`, data);

export const destroyCompany = (base: string, auth: string, id: string) =>
  graphqlCall(
    base,
    "/graphql",
    "mutation D($id: UUID!) { destroyCompany(id: $id) { id } }",
    { id },
    auth,
  );

export const createTask = (base: string, auth: string, title: string) =>
  restCall(base, auth, "POST", "/tasks", { title });

export const patchTaskPosition = (base: string, auth: string, id: string, position: number) =>
  restCall(base, auth, "PATCH", `/tasks/${id}`, { position });

export const mergeCompanies = (base: string, auth: string, ids: string[]) =>
  graphqlCall(
    base,
    "/graphql",
    "mutation M($ids: [UUID!]!) { mergeCompanies(ids: $ids, conflictPriorityIndex: 0) { id } }",
    { ids },
    auth,
  );

export const sendInvitation = (base: string, auth: string, email: string) =>
  graphqlCall(
    base,
    "/metadata",
    "mutation I($emails: [String!]!) { sendInvitations(emails: $emails) { __typename } }",
    { emails: [email] },
    auth,
  );

export const signUpFromInvite = (
  base: string,
  email: string,
  password: string,
  invite: { workspaceInviteHash: string; personalToken: string },
) =>
  graphqlCall(
    base,
    "/metadata",
    "mutation S($email: String!, $password: String!, $h: String, $tok: String) { signUpInWorkspace(email: $email, password: $password, workspaceInviteHash: $h, workspacePersonalInviteToken: $tok) { __typename } }",
    { email, password, h: invite.workspaceInviteHash, tok: invite.personalToken },
  );

export const requestPasswordReset = (base: string, email: string, workspaceId: string) =>
  graphqlCall(
    base,
    "/metadata",
    "mutation R($email: String!, $wsid: UUID) { emailPasswordResetLink(email: $email, workspaceId: $wsid) { success } }",
    { email, wsid: workspaceId },
  );

export const redeemResetToken = (base: string, token: string, newPassword: string) =>
  graphqlCall(
    base,
    "/metadata",
    "mutation U($t: String!, $p: String!) { updatePasswordViaResetToken(passwordResetToken: $t, newPassword: $p) { success } }",
    { t: token, p: newPassword },
  );
